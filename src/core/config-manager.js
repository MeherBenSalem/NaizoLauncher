const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

/**
 * Load configuration from config.json
 */
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading config:', error);
        // Return default config if file doesn't exist
        return getDefaultConfig();
    }
}

/**
 * Save configuration to config.json
 */
async function saveConfig(config) {
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
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
        minecraft_version: "1.21.1",
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
