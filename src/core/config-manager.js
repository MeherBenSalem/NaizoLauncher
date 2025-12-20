const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// Get the config path - use userData for packaged app, or project root for development
function getConfigPath() {
    try {
        // In packaged app, use userData directory (writable)
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, 'config.json');
    } catch (error) {
        // Fallback to project root (for development or if app not ready)
        return path.join(__dirname, '..', '..', 'config.json');
    }
}

// Default config path for development
const DEV_CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

/**
 * Load configuration from config.json
 * First tries userData config, then falls back to dev config, then defaults
 */
async function loadConfig() {
    const configPath = getConfigPath();

    try {
        // Try to load from the primary config path (userData)
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If userData config doesn't exist, try to load from dev config
        try {
            const devData = await fs.readFile(DEV_CONFIG_PATH, 'utf8');
            const config = JSON.parse(devData);

            // Migrate dev config to userData location
            try {
                await saveConfig(config);
                console.log('Migrated config from dev to userData');
            } catch (saveError) {
                console.warn('Could not migrate config:', saveError);
            }

            return config;
        } catch (devError) {
            console.error('Error loading config:', error);
            // Return default config if neither file exists
            return getDefaultConfig();
        }
    }
}

/**
 * Save configuration to config.json in userData directory
 */
async function saveConfig(config) {
    const configPath = getConfigPath();

    try {
        // Ensure the directory exists
        const configDir = path.dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });

        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        throw error;
    }
}

/**
 * Get default configuration
 */
function getDefaultConfig() {
    return {
        minecraft_version: "fabric-loader-1.20.1",
        game_directory: "./minecraft",
        java_path: "java",
        jvm_args: {
            min_ram: "512M",
            max_ram: "2G",
            custom_args: [
                "-XX:+UnlockExperimentalVMOptions",
                "-XX:+UseG1GC",
                "-XX:G1NewSizePercent=20",
                "-XX:G1ReservePercent=20",
                "-XX:MaxGCPauseMillis=50",
                "-XX:G1HeapRegionSize=32M"
            ]
        },
        window: {
            width: 854,
            height: 480,
            fullscreen: false
        },
        server_ip: null,
        close_launcher_on_game_start: false,
        last_username: ""
    };
}

module.exports = {
    loadConfig,
    saveConfig,
    getDefaultConfig
};
