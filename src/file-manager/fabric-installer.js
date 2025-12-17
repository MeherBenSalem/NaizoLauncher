const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions';
const MINECRAFT_VERSION = '1.21.1';

/**
 * Get latest stable Fabric loader version for Minecraft 1.21.1
 */
async function getLatestFabricLoader() {
    try {
        const response = await axios.get(`${FABRIC_META_URL}/loader/${MINECRAFT_VERSION}`);
        const loaders = response.data;

        // Find latest stable loader
        const stableLoader = loaders.find(loader => loader.loader.stable === true);

        if (!stableLoader) {
            throw new Error('No stable Fabric loader found for Minecraft 1.21.1');
        }

        return {
            version: stableLoader.loader.version,
            maven: stableLoader.loader.maven,
            intermediary: stableLoader.intermediary,
            launcherMeta: stableLoader.launcherMeta
        };
    } catch (error) {
        console.error('Error fetching Fabric loader:', error.message);
        throw error;
    }
}

/**
 * Download Fabric version profile JSON
 */
async function downloadFabricProfile(gameDir, loaderVersion) {
    try {
        const profileUrl = `${FABRIC_META_URL}/loader/${MINECRAFT_VERSION}/${loaderVersion}/profile/json`;
        const response = await axios.get(profileUrl);

        // Save Fabric profile
        const profilePath = path.join(gameDir, 'versions', `fabric-loader-${MINECRAFT_VERSION}`, 'fabric-loader.json');
        await fs.mkdir(path.dirname(profilePath), { recursive: true });
        await fs.writeFile(profilePath, JSON.stringify(response.data, null, 2));

        return response.data;
    } catch (error) {
        console.error('Error downloading Fabric profile:', error.message);
        throw error;
    }
}

/**
 * Merge Fabric profile with vanilla Minecraft profile
 */
function mergeFabricProfile(vanillaProfile, fabricProfile) {
    const merged = {
        ...fabricProfile,
        id: `fabric-loader-${MINECRAFT_VERSION}`,
        inheritsFrom: MINECRAFT_VERSION,
        mainClass: fabricProfile.mainClass,

        // Merge arguments
        arguments: {
            game: [
                ...(fabricProfile.arguments?.game || []),
                ...(vanillaProfile.arguments?.game || [])
            ],
            jvm: [
                ...(fabricProfile.arguments?.jvm || []),
                ...(vanillaProfile.arguments?.jvm || [])
            ]
        },

        // Combine libraries (Fabric + Vanilla)
        libraries: [
            ...(fabricProfile.libraries || []),
            ...(vanillaProfile.libraries || [])
        ],

        // Keep vanilla asset index and downloads
        assetIndex: vanillaProfile.assetIndex,
        downloads: vanillaProfile.downloads,
        assets: vanillaProfile.assets || vanillaProfile.assetIndex?.id,
        type: 'release',
        releaseTime: vanillaProfile.releaseTime,
        time: vanillaProfile.time,
        minecraftArguments: vanillaProfile.minecraftArguments,
        minimumLauncherVersion: vanillaProfile.minimumLauncherVersion
    };

    return merged;
}

/**
 * Get Fabric libraries in standard format
 */
function processFabricLibraries(fabricProfile) {
    const libraries = [];

    for (const lib of fabricProfile.libraries) {
        const parts = lib.name.split(':');
        const [groupId, artifactId, version] = parts;
        const groupPath = groupId.replace(/\./g, '/');
        const fileName = `${artifactId}-${version}.jar`;
        const libPath = `${groupPath}/${artifactId}/${version}/${fileName}`;

        libraries.push({
            name: lib.name,
            path: libPath,
            url: lib.url || 'https://maven.fabricmc.net/',
            sha1: lib.sha1 || null,
            size: lib.size || 0,
            isNative: false
        });
    }

    return libraries;
}

/**
 * Install Fabric for Minecraft 1.21.1
 */
async function installFabric(gameDir, vanillaMetadata) {
    try {
        console.log('Fetching Fabric loader...');
        const fabricLoader = await getLatestFabricLoader();

        console.log(`Installing Fabric ${fabricLoader.version} for Minecraft ${MINECRAFT_VERSION}`);

        // Download Fabric profile
        const fabricProfile = await downloadFabricProfile(gameDir, fabricLoader.version);

        // Merge profiles
        const mergedProfile = mergeFabricProfile(vanillaMetadata, fabricProfile);

        // Save merged profile
        const mergedPath = path.join(gameDir, 'versions', `fabric-loader-${MINECRAFT_VERSION}`, `fabric-loader-${MINECRAFT_VERSION}.json`);
        await fs.mkdir(path.dirname(mergedPath), { recursive: true });
        await fs.writeFile(mergedPath, JSON.stringify(mergedProfile, null, 2));

        console.log('Fabric installation complete!');

        return {
            version: `fabric-loader-${MINECRAFT_VERSION}`,
            profile: mergedProfile,
            fabricLoader: fabricLoader
        };
    } catch (error) {
        console.error('Error installing Fabric:', error);
        throw error;
    }
}

module.exports = {
    getLatestFabricLoader,
    downloadFabricProfile,
    mergeFabricProfile,
    processFabricLibraries,
    installFabric,
    MINECRAFT_VERSION
};
