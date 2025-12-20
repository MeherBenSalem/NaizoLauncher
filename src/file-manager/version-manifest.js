const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { installFabric, MINECRAFT_VERSION } = require('./fabric-installer');

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const TARGET_VERSION = `fabric-loader-${MINECRAFT_VERSION}`; // fabric-loader-1.20.1
const VANILLA_VERSION = '1.20.1';

/**
 * Fetch the version manifest from Mojang
 */
async function fetchVersionManifest() {
    try {
        const response = await axios.get(MANIFEST_URL);
        return response.data;
    } catch (error) {
        console.error('Error fetching version manifest:', error);
        throw new Error('Failed to fetch Minecraft version manifest');
    }
}

/**
 * Get version metadata from local file (for Fabric) 
 */
async function getLocalVersionMetadata(version, gameDir = './minecraft') {
    try {
        const versionPath = path.join(gameDir, 'versions', version, `${version}.json`);
        const data = await fs.readFile(versionPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading local version file:', error);
        throw error;
    }
}

/**
 * Get version metadata for specific Minecraft version
 */
async function getVersionMetadata(version = TARGET_VERSION, gameDir = './minecraft') {
    // If Fabric version, read from local file
    if (version.startsWith('fabric-loader')) {
        return await getLocalVersionMetadata(version, gameDir);
    }

    // Vanilla version - fetch from Mojang
    try {
        const manifest = await fetchVersionManifest();

        // Find the target version
        const versionEntry = manifest.versions.find(v => v.id === version);

        if (!versionEntry) {
            throw new Error(`Minecraft version ${version} not found`);
        }

        // Fetch the version-specific JSON
        const versionResponse = await axios.get(versionEntry.url);
        return versionResponse.data;

    } catch (error) {
        console.error('Error getting version metadata:', error);
        throw error;
    }
}

/**
 * Get client download information
 */
async function getClientInfo(version = TARGET_VERSION, gameDir = './minecraft') {
    const metadata = await getVersionMetadata(version, gameDir);

    return {
        url: metadata.downloads.client.url,
        sha1: metadata.downloads.client.sha1,
        size: metadata.downloads.client.size
    };
}

/**
 * Get libraries list
 */
async function getLibraries(version = TARGET_VERSION, gameDir = './minecraft') {
    const metadata = await getVersionMetadata(version, gameDir);

    const libraries = [];

    for (const lib of metadata.libraries) {
        // Check if library should be included for current OS
        if (lib.rules) {
            let include = false;

            for (const rule of lib.rules) {
                if (rule.action === 'allow') {
                    if (!rule.os || isOSMatch(rule.os)) {
                        include = true;
                    }
                } else if (rule.action === 'disallow') {
                    if (!rule.os || isOSMatch(rule.os)) {
                        include = false;
                    }
                }
            }

            if (!include) continue;
        }

        // Handle both vanilla-style (downloads.artifact) and Fabric-style (direct properties) libraries
        if (lib.downloads && lib.downloads.artifact) {
            // Vanilla library format
            libraries.push({
                path: lib.downloads.artifact.path,
                url: lib.downloads.artifact.url,
                sha1: lib.downloads.artifact.sha1,
                size: lib.downloads.artifact.size,
                isNative: false
            });
        } else if (lib.name) {
            // Fabric library format - construct path from name
            const parts = lib.name.split(':');
            if (parts.length >= 3) {
                const [groupId, artifactId, version] = parts;
                const groupPath = groupId.replace(/\./g, '/');
                const fileName = `${artifactId}-${version}.jar`;
                const libPath = `${groupPath}/${artifactId}/${version}/${fileName}`;

                // Build full download URL
                const baseUrl = lib.url || 'https://maven.fabricmc.net/';
                const fullUrl = baseUrl + libPath;

                libraries.push({
                    name: lib.name,
                    path: libPath,
                    url: fullUrl,
                    sha1: lib.sha1 || null,
                    size: lib.size || 0,
                    isNative: false
                });
            }
        }

        // Add natives if present (vanilla only)
        if (lib.downloads && lib.downloads.classifiers && lib.natives) {
            const nativeKey = lib.natives[getOSName()];
            if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                const native = lib.downloads.classifiers[nativeKey];
                libraries.push({
                    path: native.path,
                    url: native.url,
                    sha1: native.sha1,
                    size: native.size,
                    isNative: true,
                    extract: lib.extract
                });
            }
        }
    }

    return libraries;
}

/**
 * Get asset index information
 */
async function getAssetIndex(version = TARGET_VERSION, gameDir = './minecraft') {
    const metadata = await getVersionMetadata(version, gameDir);

    return {
        indexId: metadata.assetIndex.id,
        url: metadata.assetIndex.url,
        sha1: metadata.assetIndex.sha1,
        size: metadata.assetIndex.size,
        totalSize: metadata.assetIndex.totalSize
    };
}

/**
 * Fetch asset index and return list of assets
 */
async function getAssets(version = TARGET_VERSION, gameDir = './minecraft') {
    const assetIndexInfo = await getAssetIndex(version, gameDir);

    const response = await axios.get(assetIndexInfo.url);
    const assetIndex = response.data;

    const assets = [];

    for (const [name, asset] of Object.entries(assetIndex.objects)) {
        const hash = asset.hash;
        const hashPrefix = hash.substring(0, 2);

        assets.push({
            name: name,
            hash: hash,
            size: asset.size,
            url: `https://resources.download.minecraft.net/${hashPrefix}/${hash}`,
            path: `${hashPrefix}/${hash}`
        });
    }

    return {
        indexId: assetIndexInfo.indexId,
        assets: assets
    };
}

/**
 * Get all required files for the version
 */
async function getAllRequiredFiles(version = TARGET_VERSION, gameDir = './minecraft') {
    // If Fabric version, install Fabric first
    if (version.startsWith('fabric-loader')) {
        console.log('Getting Fabric version files...');
        const vanillaMetadata = await getVersionMetadata(VANILLA_VERSION);
        const fabricInstall = await installFabric(gameDir, vanillaMetadata);

        // Use Fabric profile for getting required files
        const fabricVersion = fabricInstall.version;
        const [clientInfo, libraries, assetInfo] = await Promise.all([
            getClientInfo(VANILLA_VERSION), // Client JAR is still vanilla
            getLibraries(fabricVersion), // Use Fabric profile for libraries
            getAssets(VANILLA_VERSION) // Assets are vanilla
        ]);

        return {
            client: clientInfo,
            libraries: libraries,
            assets: assetInfo,
            version: fabricVersion
        };
    }

    // Vanilla version
    const [clientInfo, libraries, assetInfo] = await Promise.all([
        getClientInfo(version),
        getLibraries(version),
        getAssets(version)
    ]);

    return {
        client: clientInfo,
        libraries: libraries,
        assets: assetInfo,
        version: version
    };
}

/**
 * Check if OS matches rule
 */
function isOSMatch(osRule) {
    const platform = process.platform;
    const osName = getOSName();

    if (osRule.name) {
        return osRule.name === osName;
    }

    return true;
}

/**
 * Get OS name in Minecraft format
 */
function getOSName() {
    const platform = process.platform;

    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'osx';
    if (platform === 'linux') return 'linux';

    return 'unknown';
}

/**
 * Get full version metadata (for launch arguments)
 */
async function getFullVersionMetadata(version = TARGET_VERSION, gameDir = './minecraft') {
    return await getVersionMetadata(version, gameDir);
}

module.exports = {
    fetchVersionManifest,
    getVersionMetadata,
    getClientInfo,
    getLibraries,
    getAssetIndex,
    getAssets,
    getAllRequiredFiles,
    getFullVersionMetadata,
    TARGET_VERSION
};
