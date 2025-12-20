const { ipcRenderer } = require('electron');

// DOM Elements
const usernameInput = document.getElementById('username');
const playButton = document.getElementById('play-button');
const buttonText = playButton.querySelector('.button-text');
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

// Window Control Buttons
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');

// Window Control Events
if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('window-minimize');
    });
}

if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
        ipcRenderer.send('window-maximize');
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('window-close');
    });
}

// State
let isDownloading = false;
let isLaunching = false;
let config = null;
let installationStatus = null;

// Format bytes to human readable
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format speed
function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '';
    return formatBytes(bytesPerSecond) + '/s';
}

// Format ETA
function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
}

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

    // Check installation status and update button
    await checkAndUpdateStatus();
}

// Check installation status and update UI
async function checkAndUpdateStatus() {
    setStatus('🔍 Checking installation...');

    try {
        const status = await ipcRenderer.invoke('get-installation-status');

        if (status.success) {
            installationStatus = status;
            updateButtonState(status);

            if (status.state === 'ready') {
                setStatus('✨ Ready to Launch');
            } else if (status.state === 'needs_install') {
                setStatus('📦 Installation required');
            } else if (status.state === 'needs_update') {
                const missing = status.totalMissing;
                setStatus(`🔄 Update available (${missing} file${missing > 1 ? 's' : ''} missing)`);
            }
        } else {
            setStatus('⚠️ Error checking installation');
            console.error(status.error);
        }
    } catch (error) {
        setStatus('⚠️ Error checking installation');
        console.error('Installation check error:', error);
    }
}

// Update button state based on installation status
function updateButtonState(status) {
    buttonText.textContent = status.actionLabel || 'LAUNCH';

    // Remove existing state classes
    playButton.classList.remove('install-state', 'update-state', 'ready-state');

    // Add appropriate class
    if (status.state === 'needs_install') {
        playButton.classList.add('install-state');
    } else if (status.state === 'needs_update') {
        playButton.classList.add('update-state');
    } else {
        playButton.classList.add('ready-state');
    }
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
        const installCheck = await ipcRenderer.invoke('get-installation-status');

        if (installCheck.state !== 'ready') {
            // Download required files
            isDownloading = true;
            buttonText.textContent = 'DOWNLOADING...';
            setStatus('📥 Starting download...');
            showProgress(true);

            const downloadResult = await ipcRenderer.invoke('download-minecraft');

            if (!downloadResult.success) {
                throw new Error(downloadResult.error);
            }

            isDownloading = false;
            showProgress(false);

            // Update button to PLAY after successful download
            buttonText.textContent = 'PLAY';
            playButton.classList.remove('install-state', 'update-state');
            playButton.classList.add('ready-state');
        }

        // Launch game
        isLaunching = true;
        setStatus('🚀 Launching Minecraft...');
        buttonText.textContent = 'LAUNCHING...';

        const launchResult = await ipcRenderer.invoke('launch-game', username, {});

        if (launchResult.success) {
            setStatus('🎮 Minecraft is running');
            buttonText.textContent = 'PLAYING';

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
        setStatus('❌ Error: ' + error.message);
        alert('Failed to launch Minecraft: ' + error.message);

        // Refresh status after error
        await checkAndUpdateStatus();
    } finally {
        playButton.disabled = false;
        isLaunching = false;
        isDownloading = false;
    }
});

// Download progress listener with enhanced feedback
ipcRenderer.on('download-progress', (event, progress) => {
    console.log('Download progress:', progress);

    if (progress.stage === 'complete') {
        setStatus('✅ Download Complete!');
        updateProgress(100, 'Complete');
        return;
    }

    const speed = formatSpeed(progress.speed);
    const eta = formatETA(progress.eta);

    if (progress.stage === 'client') {
        const downloaded = formatBytes(progress.downloaded);
        const total = formatBytes(progress.totalSize);
        setStatus(`⬇️ Downloading Client ${speed ? `• ${speed}` : ''}`);
        updateProgress(progress.overallProgress || progress.percentage, `${downloaded} / ${total}`);

    } else if (progress.stage === 'libraries') {
        const current = progress.completed || 0;
        const total = progress.total || 0;
        const fileName = progress.currentFile || 'Library';
        setStatus(`📦 ${fileName} ${speed ? `• ${speed}` : ''}`);
        updateProgress(progress.overallProgress || 0, `${current}/${total} Libraries`);

    } else if (progress.stage === 'asset-index') {
        setStatus('📋 Downloading Asset Index...');
        updateProgress(progress.overallProgress || 50, 'Asset Index');

    } else if (progress.stage === 'assets') {
        const current = progress.completed || 0;
        const total = progress.total || 0;
        const etaText = eta ? ` • ~${eta} remaining` : '';
        setStatus(`🎨 Downloading Assets ${speed ? `• ${speed}` : ''}${etaText}`);
        updateProgress(progress.overallProgress || 0, `${current}/${total} Assets`);

    } else if (progress.stage === 'modpack') {
        const current = progress.current || 0;
        const total = progress.total || 0;

        if (progress.status === 'checking') {
            setStatus('🔍 Checking for mod updates...');
            showProgress(true);
            updateProgress(0, 'Checking mods...');
        } else if (progress.status === 'downloading') {
            const currentFile = progress.file || 'Mod';
            setStatus(`🔧 Downloading: ${currentFile}`);
            updateProgress(progress.percentage || 0, `${current}/${total} Mods`);
        } else if (progress.status === 'complete') {
            setStatus('✅ Mods synced successfully');
            updateProgress(100, 'Mods ready');
        } else if (progress.status === 'error') {
            setStatus(`⚠️ Mod sync failed: ${progress.message || 'Unknown error'}`);
        } else {
            // Fallback for legacy format
            const currentFile = progress.file || 'Syncing';
            setStatus(`🔧 ${currentFile}`);
            updateProgress(Math.floor((current / total) * 100), `${current}/${total} Mods`);
        }
    }
});

// Game state listener
ipcRenderer.on('game-state', (event, state) => {
    if (state.running) {
        playButton.disabled = true;
        buttonText.textContent = 'PLAYING';
        setStatus('🎮 Minecraft is running...');
    } else {
        playButton.disabled = false;
        // Refresh status when game closes
        checkAndUpdateStatus();
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

            // Refresh installation status in case game directory changed
            await checkAndUpdateStatus();
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
