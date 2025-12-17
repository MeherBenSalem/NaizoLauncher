const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { createWriteStream, createReadStream } = require('fs');

/**
 * Download a file with progress tracking
 */
async function downloadFile(url, destPath, onProgress = null) {
    try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream'
        });

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        // Track progress
        if (onProgress) {
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                onProgress(downloadedSize, totalSize);
            });
        }

        const writer = createWriteStream(destPath);
        await pipeline(response.data, writer);

        return true;

    } catch (error) {
        console.error(`Error downloading ${url}:`, error.message);
        throw error;
    }
}

/**
 * Download and verify a file
 */
async function downloadAndVerify(url, destPath, expectedSha1, onProgress = null) {
    await downloadFile(url, destPath, onProgress);

    // Skip verification if no SHA1 provided (for Fabric libraries)
    if (!expectedSha1) {
        console.log(`Skipping SHA1 verification for ${destPath} (no checksum provided)`);
        return true;
    }

    // Verify SHA1
    const fileBuffer = await fs.readFile(destPath);
    const hash = crypto.createHash('sha1').update(fileBuffer).digest('hex');

    if (hash !== expectedSha1) {
        await fs.unlink(destPath); // Delete corrupted file
        throw new Error(`SHA1 verification failed for ${destPath}`);
    }

    return true;
}

/**
 * Download client JAR
 */
async function downloadClient(gameDir, version, clientInfo, onProgress = null) {
    const clientPath = path.join(gameDir, 'versions', version, `${version}.jar`);

    await downloadAndVerify(
        clientInfo.url,
        clientPath,
        clientInfo.sha1,
        onProgress
    );

    return clientPath;
}

/**
 * Download all libraries
 */
async function downloadLibraries(gameDir, libraries, onProgress = null) {
    const total = libraries.length;
    let completed = 0;

    for (const lib of libraries) {
        const libPath = path.join(gameDir, 'libraries', lib.path);

        try {
            await downloadAndVerify(
                lib.url,
                libPath,
                lib.sha1,
                (downloaded, total) => {
                    if (onProgress) {
                        onProgress({
                            type: 'library',
                            current: completed + 1,
                            total: total,
                            name: path.basename(lib.path),
                            downloaded: downloaded,
                            size: total
                        });
                    }
                }
            );

            completed++;

        } catch (error) {
            console.error(`Failed to download library ${lib.path}:`, error.message);
            throw error;
        }
    }

    return completed;
}

/**
 * Download asset index
 */
async function downloadAssetIndex(gameDir, assetIndexInfo, onProgress = null) {
    const indexPath = path.join(gameDir, 'assets', 'indexes', `${assetIndexInfo.indexId}.json`);

    const response = await axios.get(assetIndexInfo.url);
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(response.data, null, 2));

    return response.data;
}

/**
 * Download all assets
 */
async function downloadAssets(gameDir, assets, onProgress = null) {
    const total = assets.length;
    let completed = 0;

    // Download in batches to avoid overwhelming the server
    const BATCH_SIZE = 10;

    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (asset) => {
            const assetPath = path.join(gameDir, 'assets', 'objects', asset.path);

            try {
                await downloadAndVerify(
                    asset.url,
                    assetPath,
                    asset.hash,
                    null // Don't report individual asset progress
                );

                completed++;

                if (onProgress) {
                    onProgress({
                        type: 'asset',
                        current: completed,
                        total: total,
                        percentage: Math.floor((completed / total) * 100)
                    });
                }

            } catch (error) {
                console.error(`Failed to download asset ${asset.name}:`, error.message);
                throw error;
            }
        }));
    }

    return completed;
}

/**
 * Download all required files
 */
async function downloadAll(gameDir, requiredFiles, missingFiles, onProgress = null) {
    const tasks = [];

    // Download client if missing
    if (missingFiles.client) {
        tasks.push({
            name: 'Client',
            fn: () => downloadClient(gameDir, requiredFiles.version, requiredFiles.client, (downloaded, total) => {
                if (onProgress) {
                    onProgress({
                        stage: 'client',
                        downloaded: downloaded,
                        total: total,
                        percentage: Math.floor((downloaded / total) * 100)
                    });
                }
            })
        });
    }

    // Download libraries if missing
    if (missingFiles.libraries.length > 0) {
        tasks.push({
            name: 'Libraries',
            fn: () => downloadLibraries(gameDir, missingFiles.libraries, (progress) => {
                if (onProgress) {
                    onProgress({
                        stage: 'libraries',
                        ...progress
                    });
                }
            })
        });
    }

    // Download asset index if missing
    if (missingFiles.assetIndex) {
        // Get the asset index info from the version metadata
        const assetIndexInfo = await require('./version-manifest').getAssetIndex(requiredFiles.version);
        tasks.push({
            name: 'Asset Index',
            fn: () => downloadAssetIndex(gameDir, assetIndexInfo)
        });
    }

    // Download assets if missing
    if (missingFiles.assets.length > 0) {
        tasks.push({
            name: 'Assets',
            fn: () => downloadAssets(gameDir, missingFiles.assets, (progress) => {
                if (onProgress) {
                    onProgress({
                        stage: 'assets',
                        ...progress
                    });
                }
            })
        });
    }

    // Execute all download tasks sequentially
    for (const task of tasks) {
        console.log(`Downloading ${task.name}...`);
        await task.fn();
    }

    return true;
}

module.exports = {
    downloadFile,
    downloadAndVerify,
    downloadClient,
    downloadLibraries,
    downloadAssetIndex,
    downloadAssets,
    downloadAll
};
