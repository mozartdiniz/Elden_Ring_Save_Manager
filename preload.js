const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // System info
    getVersion: () => process.versions.electron,
    getPlatform: () => process.platform,

    // Save file operations
    selectSourceFile: () => ipcRenderer.invoke('select-source-file'),
    selectTargetFile: () => ipcRenderer.invoke('select-target-file'),
    loadExtractedSave: () => ipcRenderer.invoke('load-extracted-save'),

    // Save management operations
    copySave: (data) => ipcRenderer.invoke('copy-save', data),
    extractSave: (data) => ipcRenderer.invoke('extract-save', data),

    // Utility functions
    formatPlayTime: (seconds) => ipcRenderer.invoke('format-play-time', seconds)
});

// Log that preload script has loaded
console.log('Preload script loaded successfully');
