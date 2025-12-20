const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import launcher core modules
const { checkInstallation, downloadMinecraft, getInstallationStatus } = require('./src/core/launcher-core');
const { launchMinecraft } = require('./src/launch/game-launcher');
const { loadConfig, saveConfig } = require('./src/core/config-manager');
const { initAutoUpdater, checkForUpdates, quitAndInstall, getUpdateStatus, cleanup } = require('./src/core/auto-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 640,
    minWidth: 900,
    minHeight: 550,
    resizable: true,
    frame: false,
    transparent: false,
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

  // Initialize auto-updater after window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    initAutoUpdater(mainWindow);
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

// Cleanup on app quit
app.on('before-quit', () => {
  cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window Control IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
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

// Get detailed installation status for dynamic UI
ipcMain.handle('get-installation-status', async () => {
  try {
    const result = await getInstallationStatus();
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

    const result = await launchMinecraft(username, settings, (modpackProgress) => {
      // Send modpack progress updates to renderer
      mainWindow.webContents.send('download-progress', modpackProgress);
    });

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

// Get system information (RAM, etc.)
ipcMain.handle('get-system-info', async () => {
  return {
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    platform: os.platform(),
    arch: os.arch()
  };
});

// ==================== AUTO-UPDATER IPC HANDLERS ====================

// Get current launcher update status
ipcMain.handle('get-launcher-update-status', async () => {
  return getUpdateStatus();
});

// Check for launcher updates
ipcMain.handle('check-for-launcher-updates', async () => {
  try {
    const result = await checkForUpdates();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Install launcher update (quit and install)
ipcMain.handle('install-launcher-update', async () => {
  try {
    quitAndInstall();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get launcher version
ipcMain.handle('get-launcher-version', async () => {
  return {
    version: app.getVersion(),
    name: app.getName()
  };
});
