// Elden Ring Save Manager - Renderer Process
// This script handles the UI interactions and communicates with the main process

class EldenRingSaveManagerUI {
    constructor() {
        this.sourceSaveFile = null;
        this.targetSaveFile = null;
        this.selectedSourceSave = null;
        this.selectedTargetSlot = null;
        this.currentCharacterStats = null;
        this.originalStats = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File loading buttons
        document.getElementById('load-source-btn').addEventListener('click', () => this.loadSourceFile());
        document.getElementById('load-target-btn').addEventListener('click', () => this.loadTargetFile());

        // Action buttons
        document.getElementById('copy-save-btn').addEventListener('click', () => this.showCopyDialog());
        document.getElementById('extract-save-btn').addEventListener('click', () => this.showExtractDialog());
        document.getElementById('advanced-stats-btn').addEventListener('click', () => this.showStatsDialog());
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshUI());

        // Dialog buttons
        document.getElementById('confirm-copy-btn').addEventListener('click', () => this.confirmCopy());
        document.getElementById('cancel-copy-btn').addEventListener('click', () => this.hideCopyDialog());
        document.getElementById('confirm-extract-btn').addEventListener('click', () => this.confirmExtract());
        document.getElementById('cancel-extract-btn').addEventListener('click', () => this.hideExtractDialog());

        // Stats dialog buttons
        document.getElementById('save-stats-btn').addEventListener('click', () => this.saveStats());
        document.getElementById('reset-stats-btn').addEventListener('click', () => this.resetStats());
        document.getElementById('cancel-stats-btn').addEventListener('click', () => this.hideStatsDialog());

        // Close dialogs when clicking outside
        document.getElementById('copy-dialog').addEventListener('click', (e) => {
            if (e.target.id === 'copy-dialog') this.hideCopyDialog();
        });
        document.getElementById('extract-dialog').addEventListener('click', (e) => {
            if (e.target.id === 'extract-dialog') this.hideExtractDialog();
        });
        document.getElementById('stats-dialog').addEventListener('click', (e) => {
            if (e.target.id === 'stats-dialog') this.hideStatsDialog();
        });

        // Add event listeners for stat inputs
        const statInputs = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
        statInputs.forEach(stat => {
            document.getElementById(`${stat}-input`).addEventListener('input', () => this.updateLevel());
        });

        // God mode and auto-calc checkboxes
        document.getElementById('god-mode-check').addEventListener('change', () => this.updateDisplayValues());
        document.getElementById('auto-calc-check').addEventListener('change', () => this.updateDisplayValues());
    }

    // Loading state management for buttons
    setButtonLoading(buttonId, isLoading, loadingText = 'Loading...') {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
            button.disabled = true;
            button.classList.add('loading');
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
            button.classList.remove('loading');
            // Re-evaluate button state based on current conditions
            this.updateActionButtons();
        }
    }

    async loadSourceFile() {
        try {
            this.showStatus('Loading source file...', 'info');
            const result = await window.electronAPI.selectSourceFile();

            if (result.success) {
                this.sourceSaveFile = result.saveFile;
                this.updateSourceFileDisplay();
                this.updateActionButtons();
                this.showStatus('Source file loaded successfully!', 'success');
            } else {
                this.showStatus(`Failed to load source file: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error loading source file: ${error.message}`, 'error');
        }
    }

    async loadTargetFile() {
        try {
            this.showStatus('Loading target file...', 'info');
            const result = await window.electronAPI.selectTargetFile();

            if (result.success) {
                this.targetSaveFile = result.saveFile;
                this.updateTargetFileDisplay();
                this.updateActionButtons();
                this.showStatus('Target file loaded successfully!', 'success');
            } else {
                this.showStatus(`Failed to load target file: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error loading target file: ${error.message}`, 'error');
        }
    }

    updateSourceFileDisplay() {
        const fileNameElement = document.getElementById('source-file-name');
        const savesListElement = document.getElementById('source-saves-list');

        if (this.sourceSaveFile) {
            const fileName = this.sourceSaveFile.filePath.split('/').pop();
            fileNameElement.textContent = fileName;

            this.renderSavesList(savesListElement, this.sourceSaveFile.saves, 'source');
        } else {
            fileNameElement.textContent = 'No file selected';
            savesListElement.innerHTML = '<p class="no-saves">Load a source file to view saves</p>';
        }
    }

    updateTargetFileDisplay() {
        const fileNameElement = document.getElementById('target-file-name');
        const savesListElement = document.getElementById('target-saves-list');

        if (this.targetSaveFile) {
            const fileName = this.targetSaveFile.filePath.split('/').pop();
            fileNameElement.textContent = fileName;

            this.renderSavesList(savesListElement, this.targetSaveFile.saves, 'target');
        } else {
            fileNameElement.textContent = 'No file selected';
            savesListElement.innerHTML = '<p class="no-saves">Load a target file to view saves</p>';
        }
    }

    async renderSavesList(container, saves, type) {
        container.innerHTML = '';

        if (!saves || saves.length === 0) {
            container.innerHTML = '<p class="no-saves">No saves found</p>';
            return;
        }

        for (const save of saves) {
            const saveElement = document.createElement('div');
            saveElement.className = `save-item ${save.active ? 'active' : ''}`;
            saveElement.dataset.index = save.index;
            saveElement.dataset.type = type;

            const playTimeFormatted = await window.electronAPI.formatPlayTime(save.saveHeaderInfo.secondsPlayed);

            saveElement.innerHTML = `
                <div class="save-header">
                    <span class="save-slot">Slot ${save.index}</span>
                    ${save.active ? '<span class="save-active">ACTIVE</span>' : ''}
                </div>
                <div class="save-info">
                    <strong>${save.saveHeaderInfo.characterName}</strong><br>
                    Level ${save.saveHeaderInfo.characterLevel} • ${playTimeFormatted}
                </div>
            `;

            saveElement.addEventListener('click', () => this.selectSave(saveElement, save, type));
            container.appendChild(saveElement);
        }
    }

    selectSave(element, save, type) {
        // Remove previous selection
        const container = element.parentElement;
        container.querySelectorAll('.save-item').forEach(item => item.classList.remove('selected'));

        // Select current save
        element.classList.add('selected');

        if (type === 'source') {
            this.selectedSourceSave = save;
        } else if (type === 'target') {
            this.selectedTargetSlot = save.index;
        }

        this.updateActionButtons();
    }

    updateActionButtons() {
        const copyBtn = document.getElementById('copy-save-btn');
        const extractBtn = document.getElementById('extract-save-btn');
        const statsBtn = document.getElementById('advanced-stats-btn');

        const hasSourceSave = this.selectedSourceSave !== null;
        const hasTargetFile = this.targetSaveFile !== null;

        // Enable copy button if both source and target files are loaded AND both saves are selected
        copyBtn.disabled = !(this.sourceSaveFile && hasTargetFile && hasSourceSave && this.selectedTargetSlot !== null);

        // Enable extract and stats buttons if source file is loaded AND a source save is selected
        extractBtn.disabled = !(this.sourceSaveFile && hasSourceSave);
        statsBtn.disabled = !(this.sourceSaveFile && hasSourceSave);
    }

    async showCopyDialog() {
        // Check if all required data is available
        if (!this.sourceSaveFile || !this.targetSaveFile) {
            this.showStatus('Please load both source and target files first', 'error');
            return;
        }

        if (!this.selectedSourceSave || this.selectedTargetSlot === null) {
            this.showStatus('Please select a source save and a target save slot first', 'error');
            return;
        }

        // Directly perform the copy operation using main UI selections
        await this.performCopy();
    }

    async performCopy() {
        try {
            this.setButtonLoading('copy-save-btn', true, 'Copying...');
            this.showStatus('Copying save...', 'info');

            const result = await window.electronAPI.copySave({
                sourceSave: this.selectedSourceSave,
                targetSaveFile: this.targetSaveFile,
                targetSlotIndex: this.selectedTargetSlot
            });

            if (result.success) {
                this.showStatus(`Save copied successfully!`, 'success');

                // Update target file with the reloaded data
                if (result.updatedTargetFile) {
                    this.targetSaveFile = result.updatedTargetFile;
                    this.updateTargetFileDisplay();
                }
            } else {
                this.showStatus(`Failed to copy save: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error copying save: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading('copy-save-btn', false);
        }
    }

    hideCopyDialog() {
        document.getElementById('copy-dialog').classList.add('hidden');
        this.selectedSourceSave = null;
        this.selectedTargetSlot = null;
    }

    async showExtractDialog() {
        if (!this.sourceSaveFile) {
            this.showStatus('Please load a source file first', 'error');
            return;
        }

        if (!this.selectedSourceSave) {
            this.showStatus('Please select a source save to extract first', 'error');
            return;
        }

        // Directly perform the extract operation using main UI selection
        await this.performExtract();
    }

    async performExtract() {
        try {
            this.setButtonLoading('extract-save-btn', true, 'Extracting...');
            this.showStatus('Extracting save...', 'info');

            const suggestedName = `${this.selectedSourceSave.saveHeaderInfo.characterName}_Lv${this.selectedSourceSave.saveHeaderInfo.characterLevel}_Slot${this.selectedSourceSave.index}`;

            const result = await window.electronAPI.extractSave({
                save: this.selectedSourceSave,
                suggestedName: suggestedName
            });

            if (result.success) {
                const compressionInfo = `Compressed from ${(result.originalSize / 1024 / 1024).toFixed(2)}MB to ${(result.compressedSize / 1024 / 1024).toFixed(2)}MB (${result.compressionRatio}x compression)`;
                this.showStatus(`Save extracted successfully! ${compressionInfo}`, 'success');
            } else {
                this.showStatus(`Failed to extract save: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error extracting save: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading('extract-save-btn', false);
        }
    }

    hideExtractDialog() {
        document.getElementById('extract-dialog').classList.add('hidden');
        this.selectedSourceSave = null;
    }

    async populateSlotSelection(containerId, saves, type) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        for (const save of saves) {
            const slotElement = document.createElement('div');
            slotElement.className = 'slot-option';
            slotElement.dataset.index = save.index;

            const playTimeFormatted = await window.electronAPI.formatPlayTime(save.saveHeaderInfo.secondsPlayed);

            slotElement.innerHTML = `
                <div class="save-header">
                    <span class="save-slot">Slot ${save.index}</span>
                    ${save.active ? '<span class="save-active">ACTIVE</span>' : ''}
                </div>
                <div class="save-info">
                    <strong>${save.saveHeaderInfo.characterName}</strong><br>
                    Level ${save.saveHeaderInfo.characterLevel} • ${playTimeFormatted}
                </div>
            `;

            slotElement.addEventListener('click', () => this.selectSlotOption(slotElement, save, type));
            container.appendChild(slotElement);
        }
    }

    selectSlotOption(element, save, type) {
        // Remove previous selection in this container
        const container = element.parentElement;
        container.querySelectorAll('.slot-option').forEach(option => option.classList.remove('selected'));

        // Select current option
        element.classList.add('selected');

        if (type === 'source-copy' || type === 'extract') {
            this.selectedSourceSave = save;
        } else if (type === 'target-copy') {
            this.selectedTargetSlot = save.index;
        }
    }

    async confirmCopy() {
        if (!this.selectedSourceSave || this.selectedTargetSlot === null) {
            this.showStatus('Please select both source and target save slots', 'error');
            return;
        }

        try {
            this.showStatus('Copying save...', 'info');

            const result = await window.electronAPI.copySave({
                sourceSave: this.selectedSourceSave,
                targetSaveFile: this.targetSaveFile,
                targetSlotIndex: this.selectedTargetSlot
            });

            if (result.success) {
                this.showStatus(`Save copied successfully!`, 'success');
                this.hideCopyDialog();

                // Update target file with the reloaded data
                if (result.updatedTargetFile) {
                    this.targetSaveFile = result.updatedTargetFile;
                    this.updateTargetFileDisplay();
                }
            } else {
                this.showStatus(`Failed to copy save: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error copying save: ${error.message}`, 'error');
        }
    }

    async confirmExtract() {
        if (!this.selectedSourceSave) {
            this.showStatus('Please select a save slot to extract', 'error');
            return;
        }

        try {
            this.showStatus('Extracting save...', 'info');

            const suggestedName = `${this.selectedSourceSave.saveHeaderInfo.characterName}_Lv${this.selectedSourceSave.saveHeaderInfo.characterLevel}_Slot${this.selectedSourceSave.index}`;

            const result = await window.electronAPI.extractSave({
                save: this.selectedSourceSave,
                suggestedName: suggestedName
            });

            if (result.success) {
                const compressionInfo = `Compressed from ${(result.originalSize / 1024 / 1024).toFixed(2)}MB to ${(result.compressedSize / 1024 / 1024).toFixed(2)}MB (${result.compressionRatio}x compression)`;
                this.showStatus(`Save extracted successfully! ${compressionInfo}`, 'success');
                this.hideExtractDialog();
            } else {
                this.showStatus(`Failed to extract save: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showStatus(`Error extracting save: ${error.message}`, 'error');
        }
    }

    async refreshTargetFile() {
        if (this.targetSaveFile) {
            try {
                // Note: This would need to be implemented to reload the same file
                // For now, just refresh the display
                this.updateTargetFileDisplay();
            } catch (error) {
                console.error('Error refreshing target file:', error);
            }
        }
    }

    async refreshUI() {
        try {
            this.setButtonLoading('refresh-btn', true, 'Refreshing...');
            this.showStatus('Refreshing UI...', 'info');

            // Add a small delay to show the loading state
            await new Promise(resolve => setTimeout(resolve, 300));

            this.updateSourceFileDisplay();
            this.updateTargetFileDisplay();
            this.updateActionButtons();
            this.showStatus('UI refreshed', 'success');
        } catch (error) {
            this.showStatus(`Error refreshing UI: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading('refresh-btn', false);
        }
    }

    showStatus(message, type = 'info') {
        const statusArea = document.getElementById('status-area');
        statusArea.textContent = message;
        statusArea.className = `status-area ${type}`;

        // Clear status after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                statusArea.textContent = '';
                statusArea.className = 'status-area';
            }, 5000);
        }
    }

    // Advanced Character Stats Dialog
    async showStatsDialog() {
        if (!this.selectedSourceSave) {
            this.showStatus('Please select a character save first.', 'error');
            return;
        }

        // Show dialog with loading state
        const dialog = document.getElementById('stats-dialog');
        dialog.classList.remove('hidden');

        try {
            // Get character stats
            const result = await window.electronAPI.getCharacterStats({
                saveFile: this.sourceSaveFile,
                slotIndex: this.selectedSourceSave.index
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            if (!result.stats) {
                throw new Error('Could not find character stats for this save slot');
            }

            this.currentCharacterStats = result.stats;
            this.originalStats = { ...result.stats.stats };

            // Get character name
            const nameResult = await window.electronAPI.getCharacterName({
                saveFile: this.sourceSaveFile,
                slotIndex: this.selectedSourceSave.index
            });

            const characterName = nameResult.success ? nameResult.name : `Character ${this.selectedSourceSave.index + 1}`;
            this.originalCharacterName = characterName;

            // Update dialog with character info
            document.getElementById('character-name-input').value = characterName;
            document.getElementById('character-level').textContent = `Level: ${result.stats.level}`;

            // Populate stat inputs
            const statInputs = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
            statInputs.forEach(stat => {
                document.getElementById(`${stat}-input`).value = result.stats.stats[stat];
            });

            // Reset checkboxes
            document.getElementById('god-mode-check').checked = false;
            document.getElementById('auto-calc-check').checked = true;

            // Update display values
            this.updateLevel();
            this.updateDisplayValues();

        } catch (error) {
            this.showStatus(`Error loading character stats: ${error.message}`, 'error');
            this.hideStatsDialog();
        }
    }

    hideStatsDialog() {
        document.getElementById('stats-dialog').classList.add('hidden');
        this.currentCharacterStats = null;
        this.originalStats = null;
    }

    updateLevel() {
        const statInputs = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
        const currentStats = {};
        let total = 0;

        statInputs.forEach(stat => {
            const value = parseInt(document.getElementById(`${stat}-input`).value) || 1;
            currentStats[stat] = value;
            total += value;
        });

        const newLevel = total - 79;
        document.getElementById('total-level').textContent = newLevel;

        // Show level change
        const originalLevel = this.currentCharacterStats ? this.currentCharacterStats.level : 0;
        const levelChange = newLevel - originalLevel;
        const levelChangeElement = document.getElementById('level-change');

        if (levelChange > 0) {
            levelChangeElement.textContent = `+${levelChange}`;
            levelChangeElement.className = 'level-change positive';
        } else if (levelChange < 0) {
            levelChangeElement.textContent = `${levelChange}`;
            levelChangeElement.className = 'level-change negative';
        } else {
            levelChangeElement.textContent = 'No change';
            levelChangeElement.className = 'level-change neutral';
        }

        this.updateDisplayValues();
    }

    updateDisplayValues() {
        const godMode = document.getElementById('god-mode-check').checked;
        const autoCalc = document.getElementById('auto-calc-check').checked;
        const statsContainer = document.querySelector('.stats-container');

        if (godMode) {
            statsContainer.classList.add('god-mode-active');
            document.getElementById('vigor-hp').textContent = 'HP: 60,000';
            document.getElementById('mind-fp').textContent = 'FP: 60,000';
            document.getElementById('endurance-stamina').textContent = 'Stamina: 60,000';
        } else if (autoCalc) {
            statsContainer.classList.remove('god-mode-active');
            const vigor = parseInt(document.getElementById('vigor-input').value) || 1;
            const mind = parseInt(document.getElementById('mind-input').value) || 1;
            const endurance = parseInt(document.getElementById('endurance-input').value) || 1;

            const hp = this.calculateHP(vigor);
            const fp = this.calculateFP(mind);
            const stamina = this.calculateStamina(endurance);

            document.getElementById('vigor-hp').textContent = `HP: ${hp.toLocaleString()}`;
            document.getElementById('mind-fp').textContent = `FP: ${fp.toLocaleString()}`;
            document.getElementById('endurance-stamina').textContent = `Stamina: ${stamina.toLocaleString()}`;
        } else {
            statsContainer.classList.remove('god-mode-active');
            document.getElementById('vigor-hp').textContent = 'HP: Current';
            document.getElementById('mind-fp').textContent = 'FP: Current';
            document.getElementById('endurance-stamina').textContent = 'Stamina: Current';
        }
    }

    async saveStats() {
        if (!this.currentCharacterStats) {
            this.showStatus('No character stats loaded.', 'error');
            return;
        }

        try {
            this.setButtonLoading('save-stats-btn', true, 'Saving...');

            // Get current stat values
            const statInputs = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
            const newStats = {};
            statInputs.forEach(stat => {
                newStats[stat] = parseInt(document.getElementById(`${stat}-input`).value) || 1;
            });

            // Get options
            const options = {
                godMode: document.getElementById('god-mode-check').checked,
                customAttributes: document.getElementById('auto-calc-check').checked
            };

            // Save stats
            const result = await window.electronAPI.setCharacterStats({
                saveFile: this.sourceSaveFile,
                slotIndex: this.currentCharacterStats.slotIndex,
                newStats,
                options
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            // Update the source save file data
            this.sourceSaveFile = result.updatedSaveFile;

            // Check if character name has changed and save it
            const newCharacterName = document.getElementById('character-name-input').value.trim();
            if (newCharacterName !== this.originalCharacterName && newCharacterName.length > 0) {
                const nameResult = await window.electronAPI.setCharacterName({
                    saveFile: this.sourceSaveFile,
                    slotIndex: this.currentCharacterStats.slotIndex,
                    newName: newCharacterName
                });

                if (!nameResult.success) {
                    throw new Error(`Failed to update character name: ${nameResult.error}`);
                }

                // Update the source save file data again
                this.sourceSaveFile = nameResult.updatedSaveFile;
            }

            // Refresh the source saves list to show updated data
            const sourceSavesListElement = document.getElementById('source-saves-list');
            this.renderSavesList(sourceSavesListElement, this.sourceSaveFile.saves, 'source');

            this.showStatus('Character stats saved successfully!', 'success');
            this.hideStatsDialog();

        } catch (error) {
            this.showStatus(`Error saving stats: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading('save-stats-btn', false);
        }
    }

    resetStats() {
        if (!this.originalStats) {
            return;
        }

        // Reset all stat inputs to original values
        const statInputs = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
        statInputs.forEach(stat => {
            document.getElementById(`${stat}-input`).value = this.originalStats[stat];
        });

        // Reset character name
        document.getElementById('character-name-input').value = this.originalCharacterName || '';

        // Reset checkboxes
        document.getElementById('god-mode-check').checked = false;
        document.getElementById('auto-calc-check').checked = true;

        // Update display
        this.updateLevel();
        this.updateDisplayValues();
    }

    // Helper functions for HP/FP/Stamina calculations
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Elden Ring Save Manager UI loaded');

    // Check if electronAPI is available
    if (!window.electronAPI) {
        console.error('electronAPI not available. Make sure preload script is loaded.');
        return;
    }

    // Initialize the save manager UI
    window.saveManagerUI = new EldenRingSaveManagerUI();

    // Set initial theme based on system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('manual-theme')) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });

    // Restore manual theme preference
    const savedTheme = localStorage.getItem('manual-theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + O for loading source file
        if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
            event.preventDefault();
            if (window.saveManagerUI) {
                window.saveManagerUI.loadSourceFile();
            }
        }

        // Ctrl/Cmd + Shift + O for loading target file
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'O') {
            event.preventDefault();
            if (window.saveManagerUI) {
                window.saveManagerUI.loadTargetFile();
            }
        }

        // Ctrl/Cmd + C for copy save
        if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
            event.preventDefault();
            if (window.saveManagerUI) {
                window.saveManagerUI.showCopyDialog();
            }
        }

        // Ctrl/Cmd + E for extract save
        if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
            event.preventDefault();
            if (window.saveManagerUI) {
                window.saveManagerUI.showExtractDialog();
            }
        }

        // Escape to close dialogs
        if (event.key === 'Escape') {
            const copyDialog = document.getElementById('copy-dialog');
            const extractDialog = document.getElementById('extract-dialog');
            const statsDialog = document.getElementById('stats-dialog');

            if (!copyDialog.classList.contains('hidden')) {
                window.saveManagerUI.hideCopyDialog();
            }
            if (!extractDialog.classList.contains('hidden')) {
                window.saveManagerUI.hideExtractDialog();
            }
            if (!statsDialog.classList.contains('hidden')) {
                window.saveManagerUI.hideStatsDialog();
            }
        }
    });
});

// Export for potential debugging
window.EldenRingSaveManagerUI = EldenRingSaveManagerUI;
