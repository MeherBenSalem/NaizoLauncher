const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { downloadFile } = require('../file-manager/downloader');

/**
 * Modpack Manager
 * Handles synchronization of mods and config files with a remote manifest.
 */
class ModpackManager {
    constructor(gameDir, manifestUrl) {
        this.gameDir = gameDir;
        this.manifestUrl = manifestUrl;
    }

    /**
     * Fetch the remote modpack manifest
     */
    async fetchRemoteManifest() {
        try {
            console.log(`Fetching modpack manifest from ${this.manifestUrl}...`);
            const response = await axios.get(this.manifestUrl);
            return response.data;
        } catch (error) {
            console.error('Error fetching modpack manifest:', error.message);
            throw new Error('Failed to fetch modpack manifest');
        }
    }

    /**
     * Calculate SHA1 hash of a local file
     */
    async getFileSha1(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            return crypto.createHash('sha1').update(buffer).digest('hex');
        } catch (error) {
            if (error.code === 'ENOENT') return null; // File doesn't exist
            throw error;
        }
    }

    /**
     * Validate local files against the manifest
     * Returns a list of files that need to be downloaded or updated
     */
    async validateLocalFiles(manifest) {
        const filesToDownload = [];
        const filesToCheck = manifest.files || [];

        console.log(`Validating ${filesToCheck.length} modpack files...`);

        for (const file of filesToCheck) {
            const destPath = path.join(this.gameDir, file.path);
            const localSha1 = await this.getFileSha1(destPath);

            if (localSha1 !== file.sha1) {
                console.log(`Update required for: ${file.path}`);
                filesToDownload.push({
                    url: file.url,
                    path: destPath,
                    sha1: file.sha1,
                    size: file.size
                });
            }
        }

        return filesToDownload;
    }

    /**
     * Download required updates
     */
    async downloadUpdates(filesToDownload, onProgress) {
        if (filesToDownload.length === 0) {
            console.log('Modpack is up to date.');
            return;
        }

        console.log(`Downloading ${filesToDownload.length} files...`);
        let completed = 0;

        for (const file of filesToDownload) {
            await fs.mkdir(path.dirname(file.path), { recursive: true });

            // Re-use existing downloadFile function logic logic if possible or simple direct download
            // Since downloadFile in downloader.js might be coupled, we'll use a direct approach or import if suitable.
            // For now, using the imported downloadFile.

            await downloadFile(file.url, file.path, (progress) => {
                // Determine file progress (optional granular)
            });

            // Verify download
            const localSha1 = await this.getFileSha1(file.path);
            if (localSha1 !== file.sha1) {
                console.error(`Verification failed for ${file.path}`);
                // Simple retry logic or error? For now, throw.
                throw new Error(`Verification failed for ${file.path}`);
            }

            completed++;
            if (onProgress) {
                onProgress({
                    current: completed,
                    total: filesToDownload.length,
                    file: path.basename(file.path)
                });
            }
        }
    }

    /**
     * Main sync function
     */
    async sync(onProgress) {
        if (!this.manifestUrl) {
            console.log('No modpack manifest URL configured. Skipping sync.');
            return;
        }

        try {
            const manifest = await this.fetchRemoteManifest();
            const updates = await this.validateLocalFiles(manifest);
            await this.downloadUpdates(updates, onProgress);
            console.log('Modpack sync completed successfully.');
            return manifest;
        } catch (error) {
            console.error('Modpack sync failed:', error);
            throw error;
        }
    }
}

module.exports = ModpackManager;
