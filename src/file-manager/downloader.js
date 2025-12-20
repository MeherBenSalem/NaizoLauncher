const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { createWriteStream, createReadStream } = require('fs');

// Configuration
const DOWNLOAD_CONFIG = {
    CONCURRENT_DOWNLOADS: 5,
    MAX_RETRIES: 3,
    TIMEOUT_MS: 60000,
    RETRY_BASE_DELAY_MS: 1000
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Download a file with progress tracking and timeout
 */
async function downloadFile(url, destPath, onProgress = null) {
    try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream',
            timeout: DOWNLOAD_CONFIG.TIMEOUT_MS
        });

        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedSize = 0;
        let lastProgressTime = Date.now();
        let lastDownloadedSize = 0;

        // Track progress with speed calculation
        if (onProgress) {
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const now = Date.now();
                const timeDiff = (now - lastProgressTime) / 1000;

                let speed = 0;
                if (timeDiff >= 0.5) {
                    speed = (downloadedSize - lastDownloadedSize) / timeDiff;
                    lastProgressTime = now;
                    lastDownloadedSize = downloadedSize;
                }

                onProgress({
                    downloaded: downloadedSize,
                    total: totalSize,
                    percentage: totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0,
                    speed: speed
                });
            });
        }

        const writer = createWriteStream(destPath);
        await pipeline(response.data, writer);

        return true;

    } catch (error) {
        // Clean up partial file on error
        try {
            await fs.unlink(destPath);
        } catch (unlinkError) {
            // Ignore if file doesn't exist
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            throw new Error(`Download timed out: ${path.basename(destPath)}`);
        }
        throw error;
    }
}

/**
 * Download and verify a file with SHA1 hash
 */
async function downloadAndVerify(url, destPath, expectedSha1, onProgress = null) {
    await downloadFile(url, destPath, onProgress);

    // Skip verification if no SHA1 provided (for Fabric libraries)
    if (!expectedSha1) {
        return true;
    }

    // Verify SHA1
    const fileBuffer = await fs.readFile(destPath);
    const hash = crypto.createHash('sha1').update(fileBuffer).digest('hex');

    if (hash !== expectedSha1) {
        await fs.unlink(destPath); // Delete corrupted file
        throw new Error(`SHA1 verification failed for ${path.basename(destPath)}`);
    }

    return true;
}

/**
 * Download with retry mechanism using exponential backoff
 */
async function downloadWithRetry(url, destPath, expectedSha1, onProgress = null) {
    let lastError;

    for (let attempt = 1; attempt <= DOWNLOAD_CONFIG.MAX_RETRIES; attempt++) {
        try {
            return await downloadAndVerify(url, destPath, expectedSha1, onProgress);
        } catch (error) {
            lastError = error;
            console.warn(`Download attempt ${attempt}/${DOWNLOAD_CONFIG.MAX_RETRIES} failed for ${path.basename(destPath)}: ${error.message}`);

            if (attempt < DOWNLOAD_CONFIG.MAX_RETRIES) {
                const delay = DOWNLOAD_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(`Failed to download ${path.basename(destPath)} after ${DOWNLOAD_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Download client JAR
 */
async function downloadClient(gameDir, version, clientInfo, onProgress = null) {
    const clientPath = path.join(gameDir, 'versions', version, `${version}.jar`);

    await downloadWithRetry(
        clientInfo.url,
        clientPath,
        clientInfo.sha1,
        onProgress
    );

    return clientPath;
}

/**
 * Download all libraries concurrently with batching
 */
async function downloadLibraries(gameDir, libraries, onProgress = null) {
    const total = libraries.length;
    let completed = 0;
    let totalBytesDownloaded = 0;
    const startTime = Date.now();

    // Process in batches for concurrent downloads
    const BATCH_SIZE = DOWNLOAD_CONFIG.CONCURRENT_DOWNLOADS;

    for (let i = 0; i < libraries.length; i += BATCH_SIZE) {
        const batch = libraries.slice(i, i + BATCH_SIZE);

        const downloadPromises = batch.map(async (lib) => {
            const libPath = path.join(gameDir, 'libraries', lib.path);
            const libName = path.basename(lib.path);

            try {
                await downloadWithRetry(
                    lib.url,
                    libPath,
                    lib.sha1,
                    (progress) => {
                        // Update individual file progress
                        if (onProgress) {
                            const elapsed = (Date.now() - startTime) / 1000;
                            const overallProgress = Math.floor(((completed + (progress.percentage / 100)) / total) * 100);

                            onProgress({
                                stage: 'libraries',
                                type: 'library',
                                currentFile: libName,
                                currentFileProgress: progress.percentage,
                                overallProgress: overallProgress,
                                downloaded: progress.downloaded,
                                totalSize: progress.total,
                                speed: progress.speed,
                                completed: completed,
                                total: total
                            });
                        }
                    }
                );

                completed++;
                totalBytesDownloaded += lib.size || 0;

                if (onProgress) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const avgSpeed = totalBytesDownloaded / elapsed;

                    onProgress({
                        stage: 'libraries',
                        type: 'library-complete',
                        currentFile: libName,
                        currentFileProgress: 100,
                        overallProgress: Math.floor((completed / total) * 100),
                        completed: completed,
                        total: total,
                        speed: avgSpeed
                    });
                }

                return { success: true, lib: libName };

            } catch (error) {
                console.error(`Failed to download library ${lib.path}:`, error.message);
                return { success: false, lib: libName, error: error.message };
            }
        });

        const results = await Promise.all(downloadPromises);

        // Check for failures
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            throw new Error(`Failed to download libraries: ${failures.map(f => f.lib).join(', ')}`);
        }
    }

    return completed;
}

/**
 * Download asset index
 */
async function downloadAssetIndex(gameDir, assetIndexInfo, onProgress = null) {
    const indexPath = path.join(gameDir, 'assets', 'indexes', `${assetIndexInfo.indexId}.json`);

    if (onProgress) {
        onProgress({
            stage: 'asset-index',
            currentFile: `${assetIndexInfo.indexId}.json`,
            overallProgress: 0
        });
    }

    const response = await axios.get(assetIndexInfo.url, {
        timeout: DOWNLOAD_CONFIG.TIMEOUT_MS
    });

    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(response.data, null, 2));

    if (onProgress) {
        onProgress({
            stage: 'asset-index',
            currentFile: `${assetIndexInfo.indexId}.json`,
            overallProgress: 100
        });
    }

    return response.data;
}

/**
 * Download all assets concurrently
 */
async function downloadAssets(gameDir, assets, onProgress = null) {
    const total = assets.length;
    let completed = 0;
    const startTime = Date.now();
    let totalBytesDownloaded = 0;

    // Download in batches to avoid overwhelming the server
    const BATCH_SIZE = DOWNLOAD_CONFIG.CONCURRENT_DOWNLOADS * 2; // Assets are smaller, so larger batches

    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (asset) => {
            const assetPath = path.join(gameDir, 'assets', 'objects', asset.path);

            try {
                await downloadWithRetry(
                    asset.url,
                    assetPath,
                    asset.hash,
                    null // Don't report individual asset progress (too granular)
                );

                completed++;
                totalBytesDownloaded += asset.size || 0;

                if (onProgress) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const avgSpeed = elapsed > 0 ? totalBytesDownloaded / elapsed : 0;
                    const remaining = total - completed;
                    const eta = avgSpeed > 0 ? (remaining * (totalBytesDownloaded / completed)) / avgSpeed : 0;

                    onProgress({
                        stage: 'assets',
                        type: 'asset',
                        currentFile: asset.name,
                        overallProgress: Math.floor((completed / total) * 100),
                        completed: completed,
                        total: total,
                        speed: avgSpeed,
                        eta: Math.round(eta)
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
 * Download all required files with comprehensive progress tracking
 */
async function downloadAll(gameDir, requiredFiles, missingFiles, onProgress = null) {
    const stages = [];
    let currentStageIndex = 0;

    // Build stages based on what's missing
    if (missingFiles.client) {
        stages.push({ name: 'client', label: 'Client', weight: 20 });
    }
    if (missingFiles.libraries.length > 0) {
        stages.push({ name: 'libraries', label: 'Libraries', weight: 30, count: missingFiles.libraries.length });
    }
    if (missingFiles.assetIndex) {
        stages.push({ name: 'asset-index', label: 'Asset Index', weight: 5 });
    }
    if (missingFiles.assets.length > 0) {
        stages.push({ name: 'assets', label: 'Assets', weight: 45, count: missingFiles.assets.length });
    }

    const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);

    // Helper to calculate overall progress across all stages
    const calculateOverallProgress = (stageProgress) => {
        let progressBeforeCurrentStage = 0;
        for (let i = 0; i < currentStageIndex; i++) {
            progressBeforeCurrentStage += (stages[i].weight / totalWeight) * 100;
        }
        const currentStageContribution = (stages[currentStageIndex].weight / totalWeight) * stageProgress;
        return Math.floor(progressBeforeCurrentStage + currentStageContribution);
    };

    // Download client if missing
    if (missingFiles.client) {
        console.log('Downloading Client...');
        await downloadClient(gameDir, requiredFiles.version, requiredFiles.client, (progress) => {
            if (onProgress) {
                onProgress({
                    stage: 'client',
                    stageLabel: 'Downloading Client',
                    currentFile: `${requiredFiles.version}.jar`,
                    currentFileProgress: progress.percentage,
                    overallProgress: calculateOverallProgress(progress.percentage),
                    downloaded: progress.downloaded,
                    totalSize: progress.total,
                    speed: progress.speed,
                    totalStages: stages.length,
                    currentStage: currentStageIndex + 1
                });
            }
        });
        currentStageIndex++;
    }

    // Download libraries if missing
    if (missingFiles.libraries.length > 0) {
        console.log(`Downloading ${missingFiles.libraries.length} Libraries...`);
        await downloadLibraries(gameDir, missingFiles.libraries, (progress) => {
            if (onProgress) {
                onProgress({
                    stage: 'libraries',
                    stageLabel: 'Downloading Libraries',
                    currentFile: progress.currentFile,
                    currentFileProgress: progress.currentFileProgress,
                    overallProgress: calculateOverallProgress(progress.overallProgress),
                    completed: progress.completed,
                    total: progress.total,
                    speed: progress.speed,
                    totalStages: stages.length,
                    currentStage: currentStageIndex + 1
                });
            }
        });
        currentStageIndex++;
    }

    // Download asset index if missing
    if (missingFiles.assetIndex) {
        console.log('Downloading Asset Index...');
        const assetIndexInfo = await require('./version-manifest').getAssetIndex(requiredFiles.version);
        await downloadAssetIndex(gameDir, assetIndexInfo, (progress) => {
            if (onProgress) {
                onProgress({
                    stage: 'asset-index',
                    stageLabel: 'Downloading Asset Index',
                    currentFile: progress.currentFile,
                    overallProgress: calculateOverallProgress(progress.overallProgress),
                    totalStages: stages.length,
                    currentStage: currentStageIndex + 1
                });
            }
        });
        currentStageIndex++;
    }

    // Download assets if missing
    if (missingFiles.assets.length > 0) {
        console.log(`Downloading ${missingFiles.assets.length} Assets...`);
        await downloadAssets(gameDir, missingFiles.assets, (progress) => {
            if (onProgress) {
                onProgress({
                    stage: 'assets',
                    stageLabel: 'Downloading Assets',
                    currentFile: progress.currentFile,
                    currentFileProgress: 100,
                    overallProgress: calculateOverallProgress(progress.overallProgress),
                    completed: progress.completed,
                    total: progress.total,
                    speed: progress.speed,
                    eta: progress.eta,
                    totalStages: stages.length,
                    currentStage: currentStageIndex + 1
                });
            }
        });
        currentStageIndex++;
    }

    // Send completion event
    if (onProgress) {
        onProgress({
            stage: 'complete',
            stageLabel: 'Download Complete',
            overallProgress: 100
        });
    }

    return true;
}

module.exports = {
    downloadFile,
    downloadAndVerify,
    downloadWithRetry,
    downloadClient,
    downloadLibraries,
    downloadAssetIndex,
    downloadAssets,
    downloadAll,
    formatBytes,
    DOWNLOAD_CONFIG
};
