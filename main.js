const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const EldenRingSaveManager = require('./save-manager');

// Keep a global reference of the window object
let mainWindow;
let saveManager;

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icon.png'), // Optional: add an icon
        show: false // Don't show until ready-to-show
    });

    // Load the index.html file
    mainWindow.loadFile('index.html');

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        // Dereference the window object
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    // Initialize save manager
    saveManager = new EldenRingSaveManager();

    createWindow();

    // Create application menu
    createMenu();

    // Setup IPC handlers
    setupIpcHandlers();

    app.on('activate', () => {
        // On macOS, re-create a window when the dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // On macOS, keep the app running even when all windows are closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        // Add new file functionality here
                        console.log('New file clicked');
                    }
                },
                {
                    label: 'Open',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        // Add open file functionality here
                        console.log('Open file clicked');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        // Show about dialog
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About',
                            message: 'Electron Hello World',
                            detail: 'A simple cross-platform desktop application built with Electron.'
                        });
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });

        // Window menu
        template[4].submenu = [
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Setup IPC handlers for communication with renderer process
function setupIpcHandlers() {
    // Handle file selection for source save file
    ipcMain.handle('select-source-file', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Source Save File',
            filters: [
                { name: 'Elden Ring Save Files', extensions: ['sl2'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            try {
                const saveFile = saveManager.loadSaveFile(result.filePaths[0]);
                return { success: true, saveFile };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: 'No file selected' };
    });

    // Handle file selection for target save file
    ipcMain.handle('select-target-file', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Target Save File',
            filters: [
                { name: 'Elden Ring Save Files', extensions: ['sl2'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            try {
                const saveFile = saveManager.loadSaveFile(result.filePaths[0]);
                return { success: true, saveFile };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: 'No file selected' };
    });

    // Handle save copying
    ipcMain.handle('copy-save', async (event, { sourceSave, targetSaveFile, targetSlotIndex }) => {
        try {
            const updatedBuffer = saveManager.copySave(sourceSave, targetSaveFile, targetSlotIndex);

            // Directly overwrite the target file
            require('fs').writeFileSync(targetSaveFile.filePath, updatedBuffer);

            // Reload the target file to get updated data
            const reloadedTargetFile = saveManager.loadSaveFile(targetSaveFile.filePath);

            return {
                success: true,
                filePath: targetSaveFile.filePath,
                updatedTargetFile: reloadedTargetFile
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Handle save extraction
    ipcMain.handle('extract-save', async (event, { save, suggestedName }) => {
        try {
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Extract Save File',
                defaultPath: `${suggestedName}.er`,
                filters: [
                    { name: 'Extracted Save Files', extensions: ['er'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!result.canceled) {
                const extractResult = await saveManager.extractSave(save, result.filePath);
                return { success: true, ...extractResult, filePath: result.filePath };
            }
            return { success: false, error: 'Extract canceled' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Handle loading extracted save files
    ipcMain.handle('load-extracted-save', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Load Extracted Save File',
            filters: [
                { name: 'Extracted Save Files', extensions: ['er'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            try {
                const extractedSave = await saveManager.loadExtractedSave(result.filePaths[0]);
                return { success: true, extractedSave };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: 'No file selected' };
    });

    // Format play time helper
    ipcMain.handle('format-play-time', (event, seconds) => {
        return saveManager.formatPlayTime(seconds);
    });

    // Get character stats
    ipcMain.handle('get-character-stats', async (event, { saveFile, slotIndex }) => {
        try {
            const buffer = require('fs').readFileSync(saveFile.filePath);
            const stats = saveManager.getCharacterStats(buffer, slotIndex);
            return { success: true, stats };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Set character stats
    ipcMain.handle('set-character-stats', async (event, { saveFile, slotIndex, newStats, options }) => {
        try {
            const buffer = require('fs').readFileSync(saveFile.filePath);
            const modifiedBuffer = saveManager.setCharacterStats(buffer, slotIndex, newStats, options);

            // Write back to file
            require('fs').writeFileSync(saveFile.filePath, modifiedBuffer);

            // Reload the save file to get updated data
            const reloadedSaveFile = saveManager.loadSaveFile(saveFile.filePath);

            return { success: true, updatedSaveFile: reloadedSaveFile };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}
