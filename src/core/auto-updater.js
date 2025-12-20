/**
 * Launcher Auto-Updater Module
 * 
 * Handles checking for launcher updates from GitHub Releases
 * and applying updates automatically or with user confirmation.
 * 
 * This is separate from modpack updates - this updates the launcher application itself.
 */

const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Configuration
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes

// State
let updateCheckInterval = null;
let mainWindow = null;
let updateAvailable = false;
let updateDownloaded = false;
let updateInfo = null;

/**
 * Initialize the auto-updater
 * @param {BrowserWindow} window - The main window reference
 */
function initAutoUpdater(window) {
    mainWindow = window;

    // Configure auto-updater
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // In development, don't check for updates
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Running in development mode - skipping update check');
        return;
    }

    // Set up event handlers
    setupEventHandlers();

    // Check for updates on startup
    checkForUpdates();

    // Set up periodic update checks
    updateCheckInterval = setInterval(() => {
        checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
}

/**
 * Set up auto-updater event handlers
 */
function setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
        sendStatusToWindow('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
        updateAvailable = true;
        updateInfo = info;
        sendStatusToWindow('update-available', {
            version: info.version,
            releaseNotes: info.releaseNotes,
            releaseDate: info.releaseDate
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[AutoUpdater] No updates available. Current version:', app.getVersion());
        updateAvailable = false;
        sendStatusToWindow('update-not-available', {
            currentVersion: app.getVersion()
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
        sendStatusToWindow('update-download-progress', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        updateDownloaded = true;
        updateInfo = info;
        sendStatusToWindow('update-downloaded', {
            version: info.version
        });

        // Notify user that update is ready
        notifyUpdateReady(info);
    });

    autoUpdater.on('error', (error) => {
        console.error('[AutoUpdater] Error:', error.message);
        sendStatusToWindow('update-error', {
            message: error.message
        });
    });
}

/**
 * Send update status to renderer
 */
function sendStatusToWindow(status, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('launcher-update-status', {
            status,
            ...data
        });
    }
}

/**
 * Notify user that update is ready to install
 */
function notifyUpdateReady(info) {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Launcher Update Available',
        message: `A new version of NAIZO Launcher is ready to install.`,
        detail: `Version ${info.version} has been downloaded and will be installed when you quit the application.\n\nWould you like to restart now to apply the update?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
    }).then((result) => {
        if (result.response === 0) {
            quitAndInstall();
        }
    });
}

/**
 * Check for updates
 */
function checkForUpdates() {
    if (!app.isPackaged) {
        console.log('[AutoUpdater] Skipping update check in development mode');
        return Promise.resolve({ updateAvailable: false });
    }

    return autoUpdater.checkForUpdates()
        .then((result) => {
            return {
                updateAvailable: result?.updateInfo?.version !== app.getVersion(),
                currentVersion: app.getVersion(),
                latestVersion: result?.updateInfo?.version
            };
        })
        .catch((error) => {
            console.error('[AutoUpdater] Check failed:', error.message);
            return {
                updateAvailable: false,
                error: error.message
            };
        });
}

/**
 * Download update manually (if autoDownload is false)
 */
function downloadUpdate() {
    if (!updateAvailable) {
        return Promise.reject(new Error('No update available'));
    }
    return autoUpdater.downloadUpdate();
}

/**
 * Quit application and install update
 */
function quitAndInstall() {
    if (!updateDownloaded) {
        console.log('[AutoUpdater] No update downloaded yet');
        return;
    }

    // Clear the update check interval
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
    }

    // Install update and restart
    autoUpdater.quitAndInstall(false, true);
}

/**
 * Get current update status
 */
function getUpdateStatus() {
    return {
        currentVersion: app.getVersion(),
        updateAvailable,
        updateDownloaded,
        updateInfo: updateInfo ? {
            version: updateInfo.version,
            releaseDate: updateInfo.releaseDate
        } : null
    };
}

/**
 * Cleanup on app quit
 */
function cleanup() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
    }
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    getUpdateStatus,
    cleanup
};
