const fs = require('fs');
const crypto = require('crypto');

class EldenRingSaveManager {
    constructor() {
        this.CHECKSUM_LENGTH = 16;
        this.HEADER_DATA_OFFSET = 26221838;
        this.HEADER_DATA_LENGTH = 588;
        this.SAVE_DATA_LENGTH = 2621440;
        this.SAVE_HEADERS_SECTION_OFFSET = 26215344;
        this.SAVE_HEADERS_SECTION_LENGTH = 393216;
        this.ACTIVE_SAVE_SLOT_OFFSET = 26221828;
        this.STEAM_ID_OFFSET = 26215348;
        this.SAVE_IDENTIFIER = "USER_DATA";

        this.zstd = null;
        this.zstdPromise = null;
    }

    async initZstd() {
        if (this.zstdPromise) {
            return this.zstdPromise;
        }

        this.zstdPromise = (async () => {
            try {
                const { ZstdCodec } = require('zstd-codec');
                this.zstd = await ZstdCodec.run(zstd => zstd);
                return this.zstd;
            } catch (error) {
                console.error('Failed to initialize Zstd:', error);
                throw error;
            }
        })();

        return this.zstdPromise;
    }

    /**
     * Load and parse an Elden Ring save file (.sl2)
     * @param {string} filePath - Path to the save file
     * @returns {Object} Parsed save file data
     */
    loadSaveFile(filePath) {
        try {
            const buffer = fs.readFileSync(filePath);
            return this.parseSaveFile(buffer, filePath);
        } catch (error) {
            throw new Error(`Failed to load save file: ${error.message}`);
        }
    }

    /**
     * Parse BND4 format save file
     * @param {Buffer} buffer - File buffer
     * @param {string} filePath - Original file path
     * @returns {Object} Parsed save data
     */
    parseSaveFile(buffer, filePath) {
        const reader = new BufferReader(buffer);

        // Check magic number
        const magic = reader.readString(4);
        if (magic !== 'BND4') {
            throw new Error('Invalid save file format. Expected BND4.');
        }

        reader.skip(5);

        // Read header info
        const bigEndian = reader.readBoolean();
        const bitBigEndian = !reader.readBoolean();
        reader.skip(1);
        const fileCount = reader.readInt32LE();
        const headerSize = reader.readBigInt64LE();
        const version = reader.readString(8);
        const fileHeaderSize = reader.readBigInt64LE();
        reader.skip(8);
        const unicode = reader.readBoolean();

        // Read format
        const rawFormat = reader.readUInt8();
        let format = rawFormat;
        const keepFormat = bitBigEndian || ((rawFormat & 0x1) !== 0 && (rawFormat & 0x80) === 0);
        if (!keepFormat) {
            format = this.reverseBytes(format);
        }
        const extended = reader.readUInt8();
        reader.skip(13);

        // Read game file headers
        const gameFileHeaders = this.readGameFileHeaders(reader, fileCount, format, unicode, bigEndian);

        // Read game files
        const gameFiles = this.readGameFiles(reader, gameFileHeaders, format);

        // Process saves
        const saves = this.processSaves(buffer, gameFiles);

        return {
            filePath,
            bigEndian,
            bitBigEndian,
            fileCount,
            headerSize,
            version,
            fileHeaderSize,
            unicode,
            rawFormat,
            format,
            extended,
            gameFileHeaders,
            gameFiles,
            saves,
            buffer
        };
    }

    /**
     * Read game file headers from BND4 format
     */
    readGameFileHeaders(reader, fileCount, format, unicode, bigEndian) {
        const headers = [];

        for (let i = 0; i < fileCount; i++) {
            const fileFlags = reader.readUInt8();
            reader.skip(3);

            if (reader.readInt32LE() !== -1) {
                throw new Error('Unknown file table format');
            }

            const compressedSize = reader.readBigInt64LE();
            let uncompressedSize = -1n;
            if ((format & 0x20) !== 0) { // Compression
                uncompressedSize = reader.readBigInt64LE();
            }

            let dataOffset;
            if ((format & 0x10) !== 0) { // Long offsets
                dataOffset = reader.readBigInt64LE();
            } else {
                dataOffset = BigInt(reader.readInt32LE());
            }

            let id = -1;
            if ((format & 0x2) !== 0) {
                id = reader.readInt32LE();
            }

            let name = null;
            if ((format & (0x4 | 0x8)) !== 0) {
                const nameOffset = reader.readInt32LE();
                if (unicode) {
                    const currentOffset = reader.offset;
                    reader.seek(nameOffset);
                    name = this.readUnicodeString(reader, bigEndian);
                    reader.seek(currentOffset);
                } else {
                    name = "JIS"; // Japanese encoding, not implemented
                }
            }

            if (format === 0x4) {
                id = reader.readInt32LE();
                reader.readInt32LE();
            }

            headers.push({
                fileFlags,
                compressedSize,
                uncompressedSize,
                dataOffset,
                id,
                name
            });
        }

        return headers;
    }

    /**
     * Read unicode string from buffer
     */
    readUnicodeString(reader, bigEndian) {
        const bytes = [];
        let charBytes = reader.readBytes(2);

        while (charBytes[0] !== 0 || charBytes[1] !== 0) {
            bytes.push(...charBytes);
            charBytes = reader.readBytes(2);
        }

        if (bytes.length === 0) return '';

        const encoding = bigEndian ? 'utf16be' : 'utf16le';
        return Buffer.from(bytes).toString(encoding);
    }

    /**
     * Read game files data
     */
    readGameFiles(reader, gameFileHeaders, format) {
        const gameFiles = [];

        for (const header of gameFileHeaders) {
            reader.seek(Number(header.dataOffset));
            let fileBytes = reader.readBytes(Number(header.compressedSize));

            if ((format & 0x20) !== 0) { // Compression
                // Handle decompression if needed
                // For now, assume files are not compressed in save files
            }

            gameFiles.push({
                header,
                data: fileBytes
            });
        }

        return gameFiles;
    }

    /**
     * Process saves from game files
     */
    processSaves(buffer, gameFiles) {
        const saves = [];
        const reader = new BufferReader(buffer);

        for (const gameFile of gameFiles) {
            const name = gameFile.header.name;
            if (!name || !name.startsWith(this.SAVE_IDENTIFIER)) continue;

            const index = parseInt(name.substring(this.SAVE_IDENTIFIER.length));
            if (index > 9) continue;

            // Read header data
            reader.seek(this.HEADER_DATA_OFFSET + (index * this.HEADER_DATA_LENGTH));
            const active = buffer[this.ACTIVE_SAVE_SLOT_OFFSET + index] === 1;
            const headerData = reader.readBytes(this.HEADER_DATA_LENGTH);

            // Extract save header info
            const saveHeaderInfo = this.extractSaveHeaderInfo(headerData);

            // Extract save data and checksum
            const saveDataChecksum = gameFile.data.slice(0, this.CHECKSUM_LENGTH);
            const saveData = gameFile.data.slice(this.CHECKSUM_LENGTH);

            saves.push({
                index,
                active,
                gameFile,
                saveHeaderInfo,
                headerData,
                saveDataChecksum,
                saveData
            });
        }

        return saves.sort((a, b) => a.index - b.index);
    }

    /**
     * Extract save header information (character name, level, play time)
     */
    extractSaveHeaderInfo(headerData) {
        const reader = new BufferReader(Buffer.from(headerData));

        // Character name (34 bytes, UTF-16LE)
        const nameBytes = reader.readBytes(34);
        const characterName = nameBytes.toString('utf16le').replace(/\0/g, '').trim();

        // Character level (4 bytes, little endian)
        const characterLevel = reader.readInt32LE();

        // Seconds played (4 bytes, little endian)
        const secondsPlayed = reader.readInt32LE();

        return {
            characterName: characterName || 'Empty Slot',
            characterLevel,
            secondsPlayed
        };
    }

    /**
     * Copy a save from source to target at specified slot
     */
    copySave(sourceSave, targetSaveFile, targetSlotIndex) {
        try {
            const updatedBuffer = Buffer.from(targetSaveFile.buffer);

            // Find target save slot
            const targetSave = targetSaveFile.saves.find(save => save.index === targetSlotIndex);
            if (!targetSave) {
                throw new Error(`Target save slot ${targetSlotIndex} not found`);
            }

            const targetHeader = targetSave.gameFile.header;

            // Ensure all data is in Buffer format
            const sourceDataChecksum = Buffer.from(sourceSave.saveDataChecksum);
            const sourceSaveData = Buffer.from(sourceSave.saveData);
            const sourceHeaderData = Buffer.from(sourceSave.headerData);

            // Copy save data checksum
            sourceDataChecksum.copy(updatedBuffer, Number(targetHeader.dataOffset));

            // Copy save data
            sourceSaveData.copy(updatedBuffer, Number(targetHeader.dataOffset) + this.CHECKSUM_LENGTH);

            // Copy header data
            sourceHeaderData.copy(updatedBuffer, this.HEADER_DATA_OFFSET + (targetSlotIndex * this.HEADER_DATA_LENGTH));

            // Set as active
            updatedBuffer[this.ACTIVE_SAVE_SLOT_OFFSET + targetSlotIndex] = 1;

            // Update MD5 checksum for save data
            const md5Hash = crypto.createHash('md5').update(sourceSaveData).digest();
            md5Hash.copy(updatedBuffer, Number(targetHeader.dataOffset));

            // Update save headers section checksum
            const saveHeaderSectionData = updatedBuffer.slice(
                this.SAVE_HEADERS_SECTION_OFFSET,
                this.SAVE_HEADERS_SECTION_OFFSET + this.SAVE_HEADERS_SECTION_LENGTH
            );
            const headersMd5 = crypto.createHash('md5').update(saveHeaderSectionData).digest();
            headersMd5.copy(updatedBuffer, this.SAVE_HEADERS_SECTION_OFFSET - this.CHECKSUM_LENGTH);

            return updatedBuffer;
        } catch (error) {
            throw new Error(`Failed to copy save: ${error.message}`);
        }
    }

    /**
     * Extract a save to a compressed .er file
     */
    async extractSave(save, outputPath) {
        try {
            await this.initZstd();

            // Ensure all data is in Buffer format and combine
            const headerData = Buffer.from(save.headerData);
            const saveDataChecksum = Buffer.from(save.saveDataChecksum);
            const saveData = Buffer.from(save.saveData);

            const combinedData = Buffer.concat([
                headerData,
                saveDataChecksum,
                saveData
            ]);

            // Compress with Zstd level 8
            const compressedData = this.zstd.compress(combinedData, 8);

            // Write to file
            fs.writeFileSync(outputPath, compressedData);

            return {
                originalSize: combinedData.length,
                compressedSize: compressedData.length,
                compressionRatio: (combinedData.length / compressedData.length).toFixed(2)
            };
        } catch (error) {
            throw new Error(`Failed to extract save: ${error.message}`);
        }
    }

    /**
     * Load an extracted save file (.er)
     */
    async loadExtractedSave(filePath) {
        try {
            await this.initZstd();

            const compressedData = fs.readFileSync(filePath);
            const decompressedData = this.zstd.decompress(compressedData);

            const headerData = decompressedData.slice(0, this.HEADER_DATA_LENGTH);
            const saveDataChecksum = decompressedData.slice(this.HEADER_DATA_LENGTH, this.HEADER_DATA_LENGTH + this.CHECKSUM_LENGTH);
            const saveData = decompressedData.slice(this.HEADER_DATA_LENGTH + this.CHECKSUM_LENGTH);

            const saveHeaderInfo = this.extractSaveHeaderInfo(headerData);

            return {
                filePath,
                saveHeaderInfo,
                headerData,
                saveDataChecksum,
                saveData,
                compressedSize: compressedData.length,
                decompressedSize: decompressedData.length
            };
        } catch (error) {
            throw new Error(`Failed to load extracted save: ${error.message}`);
        }
    }

    /**
     * Save updated save file to disk
     */
    saveSaveFile(saveFileData, outputPath) {
        try {
            fs.writeFileSync(outputPath, saveFileData.buffer);
        } catch (error) {
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }

    /**
     * Utility function to reverse bytes
     */
    reverseBytes(byte) {
        let result = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 1) | (byte & 1);
            byte >>= 1;
        }
        return result;
    }

    /**
     * Format play time from seconds to human readable format
     */
    formatPlayTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Get character stats from a save slot
     * @param {Buffer} buffer - Save file buffer
     * @param {number} slotIndex - Character slot index (0-9)
     * @returns {Object|null} Character stats or null if not found
     */
    getCharacterStats(buffer, slotIndex) {
        try {
            // Get character level using Python's method
            const baseLevelOffset = 26221872; // 0x1901D0E + 34 in decimal
            const levelOffset = baseLevelOffset + (slotIndex * 588);

            // Verify offset is within buffer bounds
            if (levelOffset + 2 > buffer.length) {
                console.log(`Level offset ${levelOffset} is out of buffer bounds (${buffer.length})`);
                return null;
            }

            const level = buffer.readUInt16LE(levelOffset);

            // Get slot data using Python's slot boundaries
            const slotOffsets = [
                0x00000310, 0x00280320, 0x00500330, 0x00780340, 0x00A00350,
                0x00C80360, 0x00F00370, 0x01180380, 0x01400390, 0x016803A0
            ];
            const slotLengths = [
                0x0028030F - 0x00000310 + 1, 0x0050031F - 0x00280320 + 1, 0x0078032F - 0x00500330 + 1,
                0x00A0033F - 0x00780340 + 1, 0x00C8034F - 0x00A00350 + 1, 0x00F0035F - 0x00C80360 + 1,
                0x0118036F - 0x00F00370 + 1, 0x0140037F - 0x01180380 + 1, 0x0168038F - 0x01400390 + 1,
                0x0190039F - 0x016803A0 + 1
            ];

            const slotOffset = slotOffsets[slotIndex];
            const slotLength = slotLengths[slotIndex];
            const slotData = buffer.slice(slotOffset, slotOffset + slotLength);

            // Find stats location by searching for pattern (matching Python algorithm)
            let statsFound = false;
            let statsOffset = 0;
            let stats = [];

            for (let i = 0; i < Math.min(120000, slotData.length - 50); i++) {
                try {
                    // Extract potential stats (each stat is 1 byte with 3 padding bytes)
                    const potentialStats = [
                        slotData.readUInt8(i),      // Vigor
                        slotData.readUInt8(i + 4),  // Mind
                        slotData.readUInt8(i + 8),  // Endurance
                        slotData.readUInt8(i + 12), // Strength
                        slotData.readUInt8(i + 16), // Dexterity
                        slotData.readUInt8(i + 20), // Intelligence
                        slotData.readUInt8(i + 24), // Faith
                        slotData.readUInt8(i + 28)  // Arcane
                    ];

                    // Check if sum matches level + 79 and level at offset matches
                    const statsSum = potentialStats.reduce((sum, stat) => sum + stat, 0);
                    const levelAtOffset = slotData.readUInt16LE(i + 44);

                    if (statsSum === level + 79 && levelAtOffset === level) {
                        stats = potentialStats;
                        statsOffset = i;
                        statsFound = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!statsFound) {
                return null;
            }

            // Get HP/FP/Stamina values
            const hpValues = [
                slotData.readUInt16LE(statsOffset - 44),
                slotData.readUInt16LE(statsOffset - 40),
                slotData.readUInt16LE(statsOffset - 36)
            ];

            const staminaValues = [
                slotData.readUInt16LE(statsOffset - 16),
                slotData.readUInt16LE(statsOffset - 12),
                slotData.readUInt16LE(statsOffset - 8)
            ];

            const fpValues = [
                slotData.readUInt16LE(statsOffset - 32),
                slotData.readUInt16LE(statsOffset - 28),
                slotData.readUInt16LE(statsOffset - 24)
            ];

            return {
                slotIndex,
                level,
                statsOffset: slotOffset + statsOffset,
                stats: {
                    vigor: stats[0],
                    mind: stats[1],
                    endurance: stats[2],
                    strength: stats[3],
                    dexterity: stats[4],
                    intelligence: stats[5],
                    faith: stats[6],
                    arcane: stats[7]
                },
                hp: hpValues,
                stamina: staminaValues,
                fp: fpValues,
                hpOffsets: [
                    slotOffset + statsOffset - 44,
                    slotOffset + statsOffset - 40,
                    slotOffset + statsOffset - 36
                ],
                staminaOffsets: [
                    slotOffset + statsOffset - 16,
                    slotOffset + statsOffset - 12,
                    slotOffset + statsOffset - 8
                ],
                fpOffsets: [
                    slotOffset + statsOffset - 32,
                    slotOffset + statsOffset - 28,
                    slotOffset + statsOffset - 24
                ]
            };
        } catch (error) {
            console.error('Error getting character stats:', error);
            return null;
        }
    }

    /**
     * Set character stats in a save file
     * @param {Buffer} buffer - Save file buffer
     * @param {number} slotIndex - Character slot index (0-9)
     * @param {Object} newStats - New stat values
     * @param {Object} options - Additional options (godMode, etc.)
     * @returns {Buffer} Modified buffer
     */
    setCharacterStats(buffer, slotIndex, newStats, options = {}) {
        try {
            const currentStats = this.getCharacterStats(buffer, slotIndex);
            if (!currentStats) {
                throw new Error('Could not find character stats');
            }

            // Calculate new level
            const statSum = Object.values(newStats).reduce((sum, stat) => sum + stat, 0);
            const newLevel = statSum - 79;

            // Create a copy of the buffer to modify
            const modifiedBuffer = Buffer.from(buffer);

            // Update individual stats (each stat is 1 byte with 3 padding bytes)
            const statNames = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
            const slotOffset = 0x310 + (slotIndex * 2621456);

            statNames.forEach((statName, index) => {
                const statOffset = currentStats.statsOffset - slotOffset + (index * 4);
                modifiedBuffer.writeUInt8(newStats[statName], slotOffset + statOffset);
            });

            // Update level at stats location
            modifiedBuffer.writeUInt16LE(newLevel, currentStats.statsOffset + 44);

            // Update level in header using Python's method
            const baseLevelOffset = 26221872; // 0x1901D0E + 34 in decimal
            const levelOffset = baseLevelOffset + (slotIndex * 588);
            modifiedBuffer.writeUInt16LE(newLevel, levelOffset);

            // Handle god mode or custom HP/FP/Stamina values
            if (options.godMode) {
                // Set HP, FP, Stamina to 60000
                currentStats.hpOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(60000, offset);
                });
                currentStats.fpOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(60000, offset);
                });
                currentStats.staminaOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(60000, offset);
                });
            } else if (options.customAttributes) {
                // Set custom HP/FP/Stamina values based on stats
                const hpValue = this.calculateHP(newStats.vigor);
                const fpValue = this.calculateFP(newStats.mind);
                const staminaValue = this.calculateStamina(newStats.endurance);

                currentStats.hpOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(hpValue, offset);
                });
                currentStats.fpOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(fpValue, offset);
                });
                currentStats.staminaOffsets.forEach(offset => {
                    modifiedBuffer.writeUInt16LE(staminaValue, offset);
                });
            }

            // Recalculate checksums
            this.recalculateChecksums(modifiedBuffer);

            return modifiedBuffer;
        } catch (error) {
            throw new Error(`Failed to set character stats: ${error.message}`);
        }
    }

    /**
     * Calculate HP based on Vigor stat
     */
    calculateHP(vigor) {
        const hpTable = {
            1: 300, 2: 304, 3: 312, 4: 322, 5: 334, 6: 347, 7: 362, 8: 378, 9: 396, 10: 414,
            11: 434, 12: 455, 13: 476, 14: 499, 15: 522, 16: 547, 17: 572, 18: 598, 19: 624, 20: 652,
            21: 680, 22: 709, 23: 738, 24: 769, 25: 800, 26: 833, 27: 870, 28: 910, 29: 951, 30: 994,
            31: 1037, 32: 1081, 33: 1125, 34: 1170, 35: 1216, 36: 1262, 37: 1308, 38: 1355, 39: 1402, 40: 1450,
            41: 1476, 42: 1503, 43: 1529, 44: 1555, 45: 1581, 46: 1606, 47: 1631, 48: 1656, 49: 1680, 50: 1704,
            51: 1727, 52: 1750, 53: 1772, 54: 1793, 55: 1814, 56: 1834, 57: 1853, 58: 1871, 59: 1887, 60: 1900,
            61: 1906, 62: 1912, 63: 1918, 64: 1924, 65: 1930, 66: 1936, 67: 1942, 68: 1948, 69: 1954, 70: 1959,
            71: 1965, 72: 1971, 73: 1977, 74: 1982, 75: 1988, 76: 1993, 77: 1999, 78: 2004, 79: 2010, 80: 2015,
            81: 2020, 82: 2026, 83: 2031, 84: 2036, 85: 2041, 86: 2046, 87: 2051, 88: 2056, 89: 2060, 90: 2065,
            91: 2070, 92: 2074, 93: 2078, 94: 2082, 95: 2086, 96: 2090, 97: 2094, 98: 2097, 99: 2100
        };
        return hpTable[Math.min(vigor, 99)] || hpTable[99];
    }

    /**
     * Calculate FP based on Mind stat
     */
    calculateFP(mind) {
        const fpTable = {
            1: 40, 2: 43, 3: 46, 4: 49, 5: 52, 6: 55, 7: 58, 8: 62, 9: 65, 10: 68,
            11: 71, 12: 74, 13: 77, 14: 81, 15: 84, 16: 87, 17: 90, 18: 93, 19: 96, 20: 100,
            21: 106, 22: 112, 23: 118, 24: 124, 25: 130, 26: 136, 27: 142, 28: 148, 29: 154, 30: 160,
            31: 166, 32: 172, 33: 178, 34: 184, 35: 190, 36: 196, 37: 202, 38: 208, 39: 214, 40: 220,
            41: 226, 42: 232, 43: 238, 44: 244, 45: 250, 46: 256, 47: 262, 48: 268, 49: 274, 50: 280,
            51: 288, 52: 297, 53: 305, 54: 313, 55: 321, 56: 328, 57: 335, 58: 341, 59: 346, 60: 350,
            61: 352, 62: 355, 63: 357, 64: 360, 65: 362, 66: 365, 67: 367, 68: 370, 69: 373, 70: 375,
            71: 378, 72: 380, 73: 383, 74: 385, 75: 388, 76: 391, 77: 393, 78: 396, 79: 398, 80: 401,
            81: 403, 82: 406, 83: 408, 84: 411, 85: 414, 86: 416, 87: 419, 88: 421, 89: 424, 90: 426,
            91: 429, 92: 432, 93: 434, 94: 437, 95: 439, 96: 442, 97: 444, 98: 447, 99: 450
        };
        return fpTable[Math.min(mind, 99)] || fpTable[99];
    }

    /**
     * Calculate Stamina based on Endurance stat
     */
    calculateStamina(endurance) {
        const staminaTable = {
            1: 80, 2: 81, 3: 82, 4: 84, 5: 85, 6: 87, 7: 88, 8: 90, 9: 91, 10: 92,
            11: 94, 12: 95, 13: 97, 14: 98, 15: 100, 16: 101, 17: 103, 18: 105, 19: 106, 20: 108,
            21: 110, 22: 111, 23: 113, 24: 115, 25: 116, 26: 118, 27: 120, 28: 121, 29: 123, 30: 125,
            31: 126, 32: 128, 33: 129, 34: 131, 35: 132, 36: 134, 37: 135, 38: 137, 39: 138, 40: 140,
            41: 141, 42: 143, 43: 144, 44: 146, 45: 147, 46: 149, 47: 150, 48: 152, 49: 153, 50: 155,
            51: 155, 52: 155, 53: 155, 54: 156, 55: 156, 56: 156, 57: 157, 58: 157, 59: 157, 60: 158,
            61: 158, 62: 158, 63: 158, 64: 159, 65: 159, 66: 159, 67: 160, 68: 160, 69: 160, 70: 161,
            71: 161, 72: 161, 73: 162, 74: 162, 75: 162, 76: 162, 77: 163, 78: 163, 79: 163, 80: 164,
            81: 164, 82: 164, 83: 165, 84: 165, 85: 165, 86: 166, 87: 166, 88: 166, 89: 166, 90: 167,
            91: 167, 92: 167, 93: 168, 94: 168, 95: 168, 96: 169, 97: 169, 98: 169, 99: 170
        };
        return staminaTable[Math.min(endurance, 99)] || staminaTable[99];
    }

    /**
     * Recalculate checksums for a save file buffer
     * @param {Buffer} buffer - Save file buffer to update checksums for
     */
    recalculateChecksums(buffer) {
        const crypto = require('crypto');

        // Slot configuration
        const slotLength = 2621439;
        const checksumLength = 15;
        let slotDataIndex = 0x00000310;
        let checksumIndex = 0x00000300;

        // Process each of the 10 character slots
        for (let i = 0; i < 10; i++) {
            // Extract slot data
            const slotData = buffer.slice(slotDataIndex, slotDataIndex + slotLength + 1);

            // Calculate new MD5 checksum for the slot data
            const newChecksum = crypto.createHash('md5').update(slotData).digest();

            // Extract current checksum
            const currentChecksum = buffer.slice(checksumIndex, checksumIndex + checksumLength + 1);

            // Compare and update if different
            if (!newChecksum.equals(currentChecksum.slice(0, newChecksum.length))) {
                // Update the checksum in the buffer
                newChecksum.copy(buffer, checksumIndex);
            }

            // Move to next slot
            slotDataIndex += 2621456;
            checksumIndex += 2621456;
        }

        // Calculate general checksum
        const generalDataStart = 0x019003B0;
        const generalDataEnd = 0x019603AF;
        const generalChecksumStart = 0x019003A0;

        const generalData = buffer.slice(generalDataStart, generalDataEnd + 1);
        const newGeneralChecksum = crypto.createHash('md5').update(generalData).digest();

        // Update general checksum
        newGeneralChecksum.copy(buffer, generalChecksumStart);
    }
}

/**
 * Helper class for reading binary data
 */
class BufferReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    readUInt8() {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readInt32LE() {
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    readBigInt64LE() {
        const value = this.buffer.readBigInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    readBoolean() {
        return this.readUInt8() !== 0;
    }

    readString(length) {
        const value = this.buffer.toString('ascii', this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    readBytes(length) {
        const value = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    skip(bytes) {
        this.offset += bytes;
    }

    seek(position) {
        this.offset = position;
    }
}

module.exports = EldenRingSaveManager;
module.exports.BufferReader = BufferReader;
