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
        const errorLower = error.message.toLowerCase();

        if (errorLower.includes('net::err_internet_disconnected') ||
            errorLower.includes('net::err_network_changed') ||
            errorLower.includes('net::err_name_not_resolved')) {
            userMessage = 'No internet connection';
        } else if (errorLower.includes('timeout') || errorLower.includes('etimedout')) {
            userMessage = 'Connection timed out';
        } else if (errorLower.includes('latest.yml') && errorLower.includes('404')) {
            // Only show "no releases" if the latest.yml file itself is missing
            userMessage = 'No releases found on GitHub';
        } else if (errorLower.includes('404')) {
            // 404 during download means the specific file wasn't found (asset naming mismatch)
            userMessage = 'Update download failed - file not found';
            console.error('[AutoUpdater] 404 error - this usually means the release asset name does not match expected pattern');
        } else if (errorLower.includes('sha512 checksum mismatch')) {
            userMessage = 'Update verification failed';
        } else if (errorLower.includes('cannot find latest.yml')) {
            userMessage = 'No releases found on GitHub';
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
        // Set autoUpdater to not run the installer immediately
        // This allows the app to properly quit first
        setImmediate(() => {
            // Use isSilent=true so the NSIS installer waits for the app to close
            // rather than trying to forcefully terminate it
            // forceRunAfter=true ensures the app restarts after update
            autoUpdater.quitAndInstall(true, true);
        });
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
