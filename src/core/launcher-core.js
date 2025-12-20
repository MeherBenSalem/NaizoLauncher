const path = require('path');
const { loadConfig } = require('./config-manager');
const { getAllRequiredFiles } = require('../file-manager/version-manifest');
const { getMissingFiles } = require('../file-manager/file-validator');
const { downloadAll } = require('../file-manager/downloader');

/**
 * Installation status states
 */
const InstallationState = {
    READY: 'ready',
    NEEDS_INSTALL: 'needs_install',
    NEEDS_UPDATE: 'needs_update',
    CHECKING: 'checking',
    ERROR: 'error'
};

/**
 * Get detailed installation status for UI
 */
async function getInstallationStatus() {
    try {
        const config = await loadConfig();
        const gameDir = path.resolve(config.game_directory);
        const version = config.minecraft_version;

        // Get required files
        const requiredFiles = await getAllRequiredFiles(version);

        // Check what's missing
        const missingFiles = await getMissingFiles(gameDir, requiredFiles);

        const missingClient = missingFiles.client !== null;
        const missingLibraries = missingFiles.libraries.length;
        const missingAssets = missingFiles.assets.length;
        const missingAssetIndex = missingFiles.assetIndex !== null;

        const totalMissing = (missingClient ? 1 : 0) + missingLibraries + missingAssets + (missingAssetIndex ? 1 : 0);

        // Determine state and action label
        let state;
        let actionLabel;

        if (totalMissing === 0) {
            state = InstallationState.READY;
            actionLabel = 'PLAY';
        } else if (missingClient) {
            // If client is missing, it's a fresh install
            state = InstallationState.NEEDS_INSTALL;
            actionLabel = 'INSTALL';
        } else {
            // Client exists but other files missing = update
            state = InstallationState.NEEDS_UPDATE;
            actionLabel = 'UPDATE';
        }

        return {
            success: true,
            state: state,
            actionLabel: actionLabel,
            missingClient: missingClient,
            missingLibraries: missingLibraries,
            missingAssets: missingAssets,
            missingAssetIndex: missingAssetIndex,
            totalMissing: totalMissing,
            missingFiles: missingFiles,
            requiredFiles: requiredFiles,
            version: version
        };

    } catch (error) {
        console.error('Error getting installation status:', error);
        return {
            success: false,
            state: InstallationState.ERROR,
            actionLabel: 'INSTALL',
            error: error.message
        };
    }
}

/**
 * Check if Minecraft is installed and ready to launch
 * @deprecated Use getInstallationStatus() for more detailed info
 */
async function checkInstallation() {
    try {
        const status = await getInstallationStatus();

        return {
            success: status.success,
            installed: status.state === InstallationState.READY,
            missingFiles: status.missingFiles,
            requiredFiles: status.requiredFiles
        };

    } catch (error) {
        console.error('Error checking installation:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Download Minecraft files with progress tracking
 */
async function downloadMinecraft(onProgress = null) {
    try {
        const config = await loadConfig();
        const gameDir = path.resolve(config.game_directory);
        const version = config.minecraft_version;

        // Get required files
        const requiredFiles = await getAllRequiredFiles(version);

        // Check what's missing
        const missingFiles = await getMissingFiles(gameDir, requiredFiles);

        // Download missing files
        await downloadAll(gameDir, requiredFiles, missingFiles, onProgress);

        return {
            success: true
        };

    } catch (error) {
        console.error('Error downloading Minecraft:', error);
        throw error;
    }
}

module.exports = {
    checkInstallation,
    downloadMinecraft,
    getInstallationStatus,
    InstallationState
};
