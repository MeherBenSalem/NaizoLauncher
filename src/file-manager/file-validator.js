const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { loadConfig } = require('../core/config-manager');

/**
 * Check if Minecraft installation exists and is valid
 */
async function validateInstallation(gameDir, version) {
    try {
        const results = {
            hasClient: false,
            hasLibraries: false,
            hasAssets: false,
            missingFiles: []
        };

        // Check client JAR
        const clientPath = path.join(gameDir, 'versions', version, `${version}.jar`);
        results.hasClient = await fileExists(clientPath);

        if (!results.hasClient) {
            results.missingFiles.push('client.jar');
        }

        return results;

    } catch (error) {
        console.error('Error validating installation:', error);
        return {
            hasClient: false,
            hasLibraries: false,
            hasAssets: false,
            missingFiles: [],
            error: error.message
        };
    }
}

/**
 * Validate specific file with SHA1 hash
 * If expectedSha1 is null/undefined, just check if file exists (for Fabric libraries)
 */
async function validateFile(filePath, expectedSha1) {
    try {
        if (!await fileExists(filePath)) {
            return false;
        }

        // If no hash provided, just verify file exists (Fabric libraries don't have hashes)
        if (!expectedSha1) {
            return true;
        }

        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('sha1').update(fileBuffer).digest('hex');

        return hash === expectedSha1;

    } catch (error) {
        console.error(`Error validating file ${filePath}:`, error);
        return false;
    }
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate all libraries
 */
async function validateLibraries(gameDir, libraries) {
    const missing = [];

    for (const lib of libraries) {
        const libPath = path.join(gameDir, 'libraries', lib.path);
        const isValid = await validateFile(libPath, lib.sha1);

        if (!isValid) {
            missing.push(lib);
        }
    }

    return missing;
}

/**
 * Validate all assets
 */
async function validateAssets(gameDir, assets) {
    const missing = [];

    for (const asset of assets) {
        const assetPath = path.join(gameDir, 'assets', 'objects', asset.path);
        const isValid = await validateFile(assetPath, asset.hash);

        if (!isValid) {
            missing.push(asset);
        }
    }

    return missing;
}

/**
 * Get missing files by comparing expected vs actual
 */
async function getMissingFiles(gameDir, requiredFiles) {
    const missing = {
        client: null,
        libraries: [],
        assets: [],
        assetIndex: null
    };

    // Check client
    const clientPath = path.join(gameDir, 'versions', requiredFiles.version, `${requiredFiles.version}.jar`);
    const clientValid = await validateFile(clientPath, requiredFiles.client.sha1);
    if (!clientValid) {
        missing.client = requiredFiles.client;
    }

    // Check libraries
    missing.libraries = await validateLibraries(gameDir, requiredFiles.libraries);

    // Check asset index
    const assetIndexPath = path.join(gameDir, 'assets', 'indexes', `${requiredFiles.assets.indexId}.json`);
    const assetIndexExists = await fileExists(assetIndexPath);
    if (!assetIndexExists) {
        missing.assetIndex = requiredFiles.assets.indexId;
        // If asset index is missing, all assets are missing
        missing.assets = requiredFiles.assets.assets;
    }
    // If asset index exists, assume assets are valid (speeds up validation significantly)
    // Assets will be validated/downloaded individually if the game fails to launch

    return missing;
}

module.exports = {
    validateInstallation,
    validateFile,
    validateLibraries,
    validateAssets,
    getMissingFiles,
    fileExists
};
