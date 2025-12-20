/**
 * Launcher Auto-Updater Module
 * 
 * Handles checking for launcher updates from GitHub Releases API.
 * Works with manually created GitHub releases (no electron-builder publish required).
 * 
 * This is separate from modpack updates - this updates the launcher application itself.
 */

const { app, dialog, BrowserWindow, shell } = require('electron');
const https = require('https');
const path = require('path');

// Configuration - Update these for your repository
const GITHUB_OWNER = 'MeherBenSalem';
const GITHUB_REPO = 'NaizoLauncher';
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes

// State
let updateCheckInterval = null;
let mainWindow = null;
let updateAvailable = false;
let latestRelease = null;

/**
 * Initialize the auto-updater
 * @param {BrowserWindow} window - The main window reference
 */
function initAutoUpdater(window) {
    mainWindow = window;

    // Check for updates on startup
    checkForUpdates();

    // Set up periodic update checks
    updateCheckInterval = setInterval(() => {
        checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
}

/**
 * Compare version strings (semver-like)
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
    // Remove 'v' prefix if present
    v1 = v1.replace(/^v/, '');
    v2 = v2.replace(/^v/, '');

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;

        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }

    return 0;
}

/**
 * Fetch latest release from GitHub API
 */
function fetchLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'NaizoLauncher-AutoUpdater',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const release = JSON.parse(data);
                        resolve(release);
                    } catch (e) {
                        reject(new Error('Failed to parse release data'));
                    }
                } else if (res.statusCode === 404) {
                    reject(new Error('No releases found'));
                } else {
                    reject(new Error(`GitHub API error: ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Network error: ${error.message}`));
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
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
 * Check for updates using GitHub API
 */
async function checkForUpdates() {
    console.log('[AutoUpdater] Checking for updates...');
    sendStatusToWindow('update-checking');

    try {
        const release = await fetchLatestRelease();
        const currentVersion = app.getVersion();
        const latestVersion = release.tag_name.replace(/^v/, '');

        console.log(`[AutoUpdater] Current: ${currentVersion}, Latest: ${latestVersion}`);

        if (compareVersions(latestVersion, currentVersion) > 0) {
            // New version available
            console.log('[AutoUpdater] Update available:', latestVersion);
            updateAvailable = true;
            latestRelease = release;

            // Find the Windows installer asset
            const windowsAsset = release.assets.find(asset =>
                asset.name.endsWith('.exe') ||
                asset.name.includes('Setup') ||
                asset.name.includes('win')
            );

            sendStatusToWindow('update-available', {
                version: latestVersion,
                releaseNotes: release.body || 'No release notes',
                releaseDate: release.published_at,
                downloadUrl: windowsAsset ? windowsAsset.browser_download_url : release.html_url,
                releaseUrl: release.html_url
            });

            return {
                updateAvailable: true,
                currentVersion,
                latestVersion,
                release
            };
        } else {
            // Already up to date
            console.log('[AutoUpdater] No updates available');
            updateAvailable = false;
            latestRelease = null;

            sendStatusToWindow('update-not-available', {
                currentVersion
            });

            return {
                updateAvailable: false,
                currentVersion,
                latestVersion
            };
        }
    } catch (error) {
        console.error('[AutoUpdater] Error checking for updates:', error.message);

        let userMessage = error.message;
        if (error.message.includes('ENOTFOUND') || error.message.includes('Network error')) {
            userMessage = 'No internet connection';
        } else if (error.message.includes('No releases found')) {
            userMessage = 'No releases published yet';
        } else if (error.message.includes('timed out')) {
            userMessage = 'Connection timed out';
        }

        sendStatusToWindow('update-error', {
            message: userMessage,
            fullError: error.message
        });

        return {
            updateAvailable: false,
            error: error.message
        };
    }
}

/**
 * Open the download page for the latest release
 */
function openDownloadPage() {
    if (latestRelease && latestRelease.html_url) {
        shell.openExternal(latestRelease.html_url);
    }
}

/**
 * Download and install update (opens browser to download page)
 * For manual releases, we direct users to GitHub to download
 */
function downloadUpdate() {
    if (!updateAvailable || !latestRelease) {
        return Promise.reject(new Error('No update available'));
    }

    // Find Windows installer asset
    const windowsAsset = latestRelease.assets.find(asset =>
        asset.name.endsWith('.exe') ||
        asset.name.includes('Setup') ||
        asset.name.includes('win')
    );

    if (windowsAsset) {
        shell.openExternal(windowsAsset.browser_download_url);
    } else {
        shell.openExternal(latestRelease.html_url);
    }

    return Promise.resolve({ opened: true });
}

/**
 * Show update dialog to user
 */
function showUpdateDialog() {
    if (!latestRelease || !mainWindow || mainWindow.isDestroyed()) return;

    const version = latestRelease.tag_name.replace(/^v/, '');

    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version of NAIZO Launcher is available!`,
        detail: `Version ${version} is ready to download.\n\nWould you like to download it now?`,
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
        cancelId: 1
    }).then((result) => {
        if (result.response === 0) {
            downloadUpdate();
        }
    });
}

/**
 * Get current update status
 */
function getUpdateStatus() {
    return {
        currentVersion: app.getVersion(),
        updateAvailable,
        latestRelease: latestRelease ? {
            version: latestRelease.tag_name,
            releaseDate: latestRelease.published_at,
            url: latestRelease.html_url
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
    openDownloadPage,
    showUpdateDialog,
    getUpdateStatus,
    cleanup
};
