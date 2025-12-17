const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Import launcher core modules
const { checkInstallation, downloadMinecraft } = require('./src/core/launcher-core');
const { launchMinecraft } = require('./src/launch/game-launcher');
const { loadConfig, saveConfig } = require('./src/core/config-manager');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 550,
    resizable: false,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('src/ui/index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let gameRunning = false;

app.whenReady().then(() => {
  // Remove menu bar for premium look
  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Check if Minecraft is installed
ipcMain.handle('check-installation', async () => {
  try {
    const result = await checkInstallation();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Download Minecraft files
ipcMain.handle('download-minecraft', async (event) => {
  try {
    await downloadMinecraft((progress) => {
      // Send progress updates to renderer
      mainWindow.webContents.send('download-progress', progress);
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Launch Minecraft
ipcMain.handle('launch-game', async (event, username, settings) => {
  if (gameRunning) {
    return { success: false, error: 'Game is already running' };
  }

  try {
    gameRunning = true;
    mainWindow.webContents.send('game-state', { running: true });

    const result = await launchMinecraft(username, settings);

    // Watch for game exit
    if (result.process) {
      result.process.on('exit', () => {
        gameRunning = false;
        mainWindow.webContents.send('game-state', { running: false });
      });
    }

    return { success: true };
  } catch (error) {
    gameRunning = false;
    mainWindow.webContents.send('game-state', { running: false });
    return { success: false, error: error.message };
  }
});

// Check if game is running
ipcMain.handle('is-game-running', () => {
  return { running: gameRunning };
});

// Load configuration
ipcMain.handle('load-config', async () => {
  try {
    const config = await loadConfig();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save configuration
ipcMain.handle('save-config', async (event, config) => {
  try {
    await saveConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Select directory for game installation
ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Minecraft Installation Directory'
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

