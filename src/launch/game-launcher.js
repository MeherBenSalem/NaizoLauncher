const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { loadConfig } = require('../core/config-manager');
const { createOfflineProfile } = require('./offline-auth');
const { buildJVMArguments, buildGameArguments } = require('./jvm-builder');
const { getAllRequiredFiles } = require('../file-manager/version-manifest');

/**
 * Check if Java is available and accessible
 */
async function checkJavaAvailable(javaPath) {
    return new Promise((resolve) => {
        const command = javaPath === 'java' ? 'java -version' : `"${javaPath}" -version`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('[DEBUG] Java detection failed:', error.message);
                console.error('[DEBUG] Java path used:', javaPath);
                resolve({ available: false, error: error.message });
            } else {
                // Java outputs version info to stderr
                const versionInfo = stderr || stdout;
                console.log('[DEBUG] Java detected:', versionInfo.split('\n')[0]);
                resolve({ available: true, version: versionInfo.split('\n')[0] });
            }
        });
    });
}

/**
 * Extract natives for the current platform
 */
async function extractNatives(gameDir, version, libraries) {
    const nativesDir = path.join(gameDir, 'natives', version);

    // Create natives directory
    await fs.mkdir(nativesDir, { recursive: true });

    // Extract native libraries
    for (const lib of libraries) {
        if (lib.isNative && lib.extract) {
            const libPath = path.join(gameDir, 'libraries', lib.path);

            try {
                // Use a library like adm-zip or extract-zip to extract natives
                // For now, we'll assume natives are in the correct location
                console.log(`Native library: ${lib.path}`);
            } catch (error) {
                console.error(`Error extracting native ${lib.path}:`, error);
            }
        }
    }

    return nativesDir;
}

/**
 * Launch Minecraft
 */
async function launchMinecraft(username, customSettings = {}, onModpackProgress = null) {
    try {
        if (!username || username.trim() === '') {
            throw new Error('Username is required');
        }

        // Load configuration
        const config = await loadConfig();
        const gameDir = path.resolve(config.game_directory);
        const version = config.minecraft_version;

        // Merge custom settings
        const settings = { ...config, ...customSettings };

        // Get Java path from settings
        const javaPath = settings.java_path || 'java';

        // Check if Java is available
        console.log('[DEBUG] Checking Java availability...');
        const javaCheck = await checkJavaAvailable(javaPath);
        if (!javaCheck.available) {
            console.error('[DEBUG] Java is not available!');
            console.error('[DEBUG] Please download Java from: https://adoptium.net/ or https://www.java.com/');
            throw new Error(
                'Java is not installed or not found!\n\n' +
                'Please download and install Java to play Minecraft.\n\n' +
                'Recommended: Download Java 17 or 21 from:\n' +
                '• https://adoptium.net/\n' +
                '• https://www.oracle.com/java/technologies/downloads/\n\n' +
                'After installing, restart the launcher.'
            );
        }

        // Create player profile
        const playerProfile = createOfflineProfile(username);
        console.log(`Launching Minecraft for ${playerProfile.username} (${playerProfile.uuid})`);

        // Sync Modpack if enabled
        if (config.modpack && config.modpack.enabled && config.modpack.manifest_url) {
            try {
                console.log('Initializing Modpack Manager...');
                const ModpackManager = require('../modpack/modpack-manager');
                const modpackManager = new ModpackManager(gameDir, config.modpack.manifest_url);

                // Notify UI that modpack sync is starting
                if (onModpackProgress) {
                    onModpackProgress({
                        stage: 'modpack',
                        status: 'checking',
                        message: 'Checking for mod updates...'
                    });
                }

                await modpackManager.sync((progress) => {
                    console.log(`[Modpack] Downloading ${progress.file} (${progress.current}/${progress.total})`);
                    if (onModpackProgress) {
                        onModpackProgress({
                            stage: 'modpack',
                            status: 'downloading',
                            file: progress.file,
                            current: progress.current,
                            total: progress.total,
                            percentage: Math.floor((progress.current / progress.total) * 100)
                        });
                    }
                });

                // Notify completion
                if (onModpackProgress) {
                    onModpackProgress({
                        stage: 'modpack',
                        status: 'complete',
                        message: 'Mods synced successfully'
                    });
                }
            } catch (err) {
                console.error('Modpack sync failed:', err);
                if (onModpackProgress) {
                    onModpackProgress({
                        stage: 'modpack',
                        status: 'error',
                        message: err.message
                    });
                }
                console.warn('Continuing launch despite modpack sync failure...');
            }
        }

        // Get required files (for libraries list)
        const requiredFiles = await getAllRequiredFiles(version);

        // Extract natives
        await extractNatives(gameDir, version, requiredFiles.libraries);

        // Build JVM arguments
        const jvmArgs = await buildJVMArguments(settings, gameDir, version, requiredFiles.libraries);

        // Build game arguments
        const gameArgs = await buildGameArguments(settings, gameDir, version, playerProfile);

        // Get main class
        const metadata = await require('../file-manager/version-manifest').getFullVersionMetadata(version);
        const mainClass = metadata.mainClass;

        // Construct full command (javaPath already defined earlier in this function)
        const fullArgs = [
            ...jvmArgs,
            mainClass,
            ...gameArgs
        ];

        console.log('Launching Minecraft with command:');
        console.log(`${javaPath} ${fullArgs.join(' ')}`);

        // Spawn Minecraft process
        const minecraftProcess = spawn(javaPath, fullArgs, {
            cwd: gameDir,
            stdio: 'pipe', // Pipe output (use 'ignore' to completely suppress)
            detached: false,
            windowsHide: true // Hide command prompt on Windows
        });

        // Optional: Log game output
        if (minecraftProcess.stdout) {
            minecraftProcess.stdout.on('data', (data) => {
                console.log(`[Minecraft] ${data}`);
            });
        }
        if (minecraftProcess.stderr) {
            minecraftProcess.stderr.on('data', (data) => {
                console.error(`[Minecraft] ${data}`);
            });
        }

        minecraftProcess.on('error', (error) => {
            console.error('Failed to start Minecraft:', error);
            throw error;
        });

        minecraftProcess.on('exit', (code, signal) => {
            console.log(`Minecraft exited with code ${code} and signal ${signal}`);
        });

        return {
            success: true,
            process: minecraftProcess
        };

    } catch (error) {
        console.error('Error launching Minecraft:', error);
        throw error;
    }
}

module.exports = {
    launchMinecraft,
    extractNatives
};
