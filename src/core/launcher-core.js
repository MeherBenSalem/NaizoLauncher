const path = require('path');
const { loadConfig } = require('./config-manager');
const { getAllRequiredFiles } = require('../file-manager/version-manifest');
const { getMissingFiles } = require('../file-manager/file-validator');
const { downloadAll } = require('../file-manager/downloader');

/**
 * Check if Minecraft is installed and ready to launch
 */
async function checkInstallation() {
    try {
        const config = await loadConfig();
        const gameDir = path.resolve(config.game_directory);
        const version = config.minecraft_version;

        // Get required files
        const requiredFiles = await getAllRequiredFiles(version);

        // Check what's missing
        const missingFiles = await getMissingFiles(gameDir, requiredFiles);

        const hasMissing =
            missingFiles.client !== null ||
            missingFiles.libraries.length > 0 ||
            missingFiles.assets.length > 0 ||
            missingFiles.assetIndex !== null;

        return {
            success: true,
            installed: !hasMissing,
            missingFiles: missingFiles,
            requiredFiles: requiredFiles
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
 * Download Minecraft files
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
    downloadMinecraft
};
