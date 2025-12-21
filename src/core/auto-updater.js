/**
 * Launcher Auto-Updater Module
 * 
 * Handles automatic launcher updates using electron-updater.
 * Downloads and installs updates silently in the background.
 * 
 * This is separate from modpack updates - this updates the launcher application itself.
 */

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Configuration
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes

// State
let updateCheckInterval = null;
let mainWindow = null;
let updateDownloaded = false;
let downloadProgress = 0;

/**
 * Initialize the auto-updater
 * @param {BrowserWindow} window - The main window reference
 */
function initAutoUpdater(window) {
    mainWindow = window;

    // Configure auto-updater for silent operation
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    // Disable update dialogs from electron-updater
    autoUpdater.disableWebInstaller = true;

    // Setup event listeners
    setupAutoUpdaterEvents();

    // Check for updates on startup (with small delay to let app initialize)
    setTimeout(() => {
        checkForUpdates();
    }, 3000);

    // Set up periodic update checks
    updateCheckInterval = setInterval(() => {
        checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
}

/**
 * Setup all auto-updater event listeners
 */
function setupAutoUpdaterEvents() {
    // Checking for updates
    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
        sendStatusToWindow('update-checking');
    });

    // Update available - will auto-download
    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
        sendStatusToWindow('update-available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
        console.log('[AutoUpdater] Already up to date:', info.version);
        sendStatusToWindow('update-not-available', {
            currentVersion: app.getVersion()
        });
    });

    // Download progress
    autoUpdater.on('download-progress', (progress) => {
        downloadProgress = progress.percent;
        console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
        sendStatusToWindow('update-download-progress', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    // Update downloaded - ready to install
    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        updateDownloaded = true;
        sendStatusToWindow('update-downloaded', {
            version: info.version,
            releaseNotes: info.releaseNotes
        });
    });

    // Error handling
    autoUpdater.on('error', (error) => {
        console.error('[AutoUpdater] Error:', error.message);

        let userMessage = 'Update check failed';
        if (error.message.includes('net::')) {
            userMessage = 'No internet connection';
        } else if (error.message.includes('404')) {
            userMessage = 'No releases available';
        } else if (error.message.includes('timeout')) {
            userMessage = 'Connection timed out';
        }

        sendStatusToWindow('update-error', {
            message: userMessage,
            fullError: error.message
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
 * Check for updates
 */
async function checkForUpdates() {
    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('[AutoUpdater] Check failed:', error.message);
    }
}

/**
 * Quit and install the downloaded update
 * Called when user clicks restart button or app is closing
 */
function quitAndInstall() {
    if (updateDownloaded) {
        console.log('[AutoUpdater] Installing update and restarting...');
        autoUpdater.quitAndInstall(false, true);
    }
}

/**
 * Check if an update has been downloaded
 */
function isUpdateDownloaded() {
    return updateDownloaded;
}

/**
 * Get current download progress
 */
function getDownloadProgress() {
    return downloadProgress;
}

/**
 * Get current update status
 */
function getUpdateStatus() {
    return {
        currentVersion: app.getVersion(),
        updateDownloaded,
        downloadProgress
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
    quitAndInstall,
    isUpdateDownloaded,
    getDownloadProgress,
    getUpdateStatus,
    cleanup
};
