// Elden Ring Save Manager - Renderer Process
// This script handles the UI interactions and communicates with the main process

class EldenRingSaveManagerUI {
    constructor() {
        this.sourceSaveFile = null;
        this.targetSaveFile = null;
        this.selectedSourceSave = null;
        this.selectedTargetSlot = null;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File loading buttons
        document.getElementById('load-source-btn').addEventListener('click', () => this.loadSourceFile());
        document.getElementById('load-target-btn').addEventListener('click', () => this.loadTargetFile());

        // Action buttons
        document.getElementById('copy-save-btn').addEventListener('click', () => this.showCopyDialog());
        document.getElementById('extract-save-btn').addEventListener('click', () => this.showExtractDialog());
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshUI());

        // Dialog buttons
        document.getElementById('confirm-copy-btn').addEventListener('click', () => this.confirmCopy());
        document.getElementById('cancel-copy-btn').addEventListener('click', () => this.hideCopyDialog());
        document.getElementById('confirm-extract-btn').addEventListener('click', () => this.confirmExtract());
        document.getElementById('cancel-extract-btn').addEventListener('click', () => this.hideExtractDialog());

        // Close dialogs when clicking outside
        document.getElementById('copy-dialog').addEventListener('click', (e) => {
            if (e.target.id === 'copy-dialog') this.hideCopyDialog();
        });
        document.getElementById('extract-dialog').addEventListener('click', (e) => {
            if (e.target.id === 'extract-dialog') this.hideExtractDialog();
        });
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

        // Enable copy button if both source and target files are loaded AND both saves are selected
        copyBtn.disabled = !(this.sourceSaveFile && this.targetSaveFile && this.selectedSourceSave && this.selectedTargetSlot !== null);

        // Enable extract button if source file is loaded AND a source save is selected
        extractBtn.disabled = !(this.sourceSaveFile && this.selectedSourceSave);
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
});

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

        if (!copyDialog.classList.contains('hidden')) {
            window.saveManagerUI.hideCopyDialog();
        }
        if (!extractDialog.classList.contains('hidden')) {
            window.saveManagerUI.hideExtractDialog();
        }
    }
});

// Export for potential debugging
window.EldenRingSaveManagerUI = EldenRingSaveManagerUI;
