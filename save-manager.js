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
