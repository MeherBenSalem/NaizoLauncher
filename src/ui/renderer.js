const { ipcRenderer } = require('electron');

// DOM Elements
const usernameInput = document.getElementById('username');
const playButton = document.getElementById('play-button');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const closeSettings = document.getElementById('close-settings');
const ramSlider = document.getElementById('ram-slider');
const ramValue = document.getElementById('ram-value');
const resolutionSelect = document.getElementById('resolution');
const fullscreenCheckbox = document.getElementById('fullscreen');
const jvmArgsTextarea = document.getElementById('jvm-args');
const saveSettingsButton = document.getElementById('save-settings');

// State
let isDownloading = false;
let isLaunching = false;
let config = null;

// Initialize
async function init() {
    // Load configuration
    const result = await ipcRenderer.invoke('load-config');
    if (result.success) {
        config = result.config;
        loadSettingsToUI();

        // Load last username
        if (config.last_username) {
            usernameInput.value = config.last_username;
        }
    }

    // Check installation status
    await checkInstallation();
}

// Load settings into UI
function loadSettingsToUI() {
    if (!config) return;

    // RAM
    const ramMB = parseInt(config.jvm_args.max_ram);
    ramSlider.value = ramMB;
    updateRamValue(ramMB);

    // Resolution
    resolutionSelect.value = `${config.window.width}x${config.window.height}`;

    // Fullscreen
    fullscreenCheckbox.checked = config.window.fullscreen;

    // Game Directory
    const gameDirInput = document.getElementById('game-directory');
    if (gameDirInput) {
        gameDirInput.value = config.game_directory;
    }

    // JVM Args
    if (config.jvm_args.custom_args) {
        jvmArgsTextarea.value = config.jvm_args.custom_args.join('\n');
    }
}

// Update RAM value display
function updateRamValue(mb) {
    const gb = (mb / 1024).toFixed(1);
    ramValue.textContent = `${gb} GB`;
}

// Check installation
async function checkInstallation() {
    setStatus('Checking installation...');

    const result = await ipcRenderer.invoke('check-installation');

    if (result.success) {
        if (result.installed) {
            setStatus('Ready to Play');
        } else {
            setStatus('Minecraft files missing - will download on launch');
        }
    } else {
        setStatus('Error checking installation');
        console.error(result.error);
    }
}

// Set status text
function setStatus(text) {
    statusText.textContent = text;
}

// Show progress
function showProgress(show) {
    progressContainer.style.display = show ? 'block' : 'none';
}

// Update progress
function updateProgress(percentage, text = '') {
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = text || `${percentage}%`;
}

// Play button click
playButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Please enter a username');
        usernameInput.focus();
        return;
    }

    if (username.length < 3 || username.length > 16) {
        alert('Username must be between 3 and 16 characters');
        usernameInput.focus();
        return;
    }

    // Disable button
    playButton.disabled = true;

    try {
        // Save username to config
        config.last_username = username;
        await ipcRenderer.invoke('save-config', config);

        // Check if we need to download
        const installCheck = await ipcRenderer.invoke('check-installation');

        if (!installCheck.installed) {
            // Download required files
            isDownloading = true;
            setStatus('Downloading Minecraft...');
            showProgress(true);

            const downloadResult = await ipcRenderer.invoke('download-minecraft');

            if (!downloadResult.success) {
                throw new Error(downloadResult.error);
            }

            isDownloading = false;
            showProgress(false);
        }

        // Launch game
        isLaunching = true;
        setStatus('Launching Minecraft...');

        const launchResult = await ipcRenderer.invoke('launch-game', username, {});

        if (launchResult.success) {
            setStatus('Minecraft is running');

            // Optional: Close launcher after game starts
            if (config.close_launcher_on_game_start) {
                setTimeout(() => {
                    window.close();
                }, 2000);
            }
        } else {
            throw new Error(launchResult.error);
        }

    } catch (error) {
        console.error('Launch error:', error);
        setStatus('Error: ' + error.message);
        alert('Failed to launch Minecraft: ' + error.message);
    } finally {
        playButton.disabled = false;
        isLaunching = false;
        isDownloading = false;
    }
});

// Download progress listener
ipcRenderer.on('download-progress', (event, progress) => {
    console.log('Download progress:', progress);

    if (progress.stage === 'client') {
        setStatus(`Downloading client... ${progress.percentage}%`);
        updateProgress(progress.percentage);
    } else if (progress.stage === 'libraries') {
        setStatus(`Downloading libraries... ${progress.current}/${progress.total}`);
        const percentage = Math.floor((progress.current / progress.total) * 100);
        updateProgress(percentage);
    } else if (progress.stage === 'assets') {
        setStatus(`Downloading assets... ${progress.percentage}%`);
        updateProgress(progress.percentage);
    }
});

// Settings toggle
settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.add('open');
});

closeSettings.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
});

// RAM slider
ramSlider.addEventListener('input', (e) => {
    updateRamValue(parseInt(e.target.value));
});

// Browse directory button
const browseDirButton = document.getElementById('browse-directory');
if (browseDirButton) {
    browseDirButton.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('select-directory');

        if (result.success && !result.canceled) {
            const gameDirInput = document.getElementById('game-directory');
            if (gameDirInput) {
                gameDirInput.value = result.path;
            }
        }
    });
}

// Save settings
saveSettingsButton.addEventListener('click', async () => {
    try {
        // Update config
        const ramMB = parseInt(ramSlider.value);
        config.jvm_args.max_ram = `${ramMB}M`;

        const [width, height] = resolutionSelect.value.split('x').map(Number);
        config.window.width = width;
        config.window.height = height;

        config.window.fullscreen = fullscreenCheckbox.checked;

        // Game directory
        const gameDirInput = document.getElementById('game-directory');
        if (gameDirInput && gameDirInput.value.trim()) {
            config.game_directory = gameDirInput.value.trim();
        }

        // Parse JVM args
        const jvmArgsText = jvmArgsTextarea.value.trim();
        if (jvmArgsText) {
            config.jvm_args.custom_args = jvmArgsText.split('\n').filter(line => line.trim());
        } else {
            config.jvm_args.custom_args = [];
        }

        // Save to file
        const result = await ipcRenderer.invoke('save-config', config);

        if (result.success) {
            alert('Settings saved successfully!');
            settingsPanel.classList.remove('open');
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings: ' + error.message);
    }
});

// Initialize on load
init();
