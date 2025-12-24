const { ipcRenderer } = require('electron');

// ==================== DOM ELEMENTS ====================

// Views
const homeView = document.getElementById('home-view');
const settingsView = document.getElementById('settings-view');

// Home View Elements
const playButton = document.getElementById('play-button');
const buttonText = playButton.querySelector('.button-text');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const playerNameDisplay = document.getElementById('player-name');
const newsPanel = document.getElementById('news-panel');
const newsToggle = document.getElementById('news-toggle');
const closeNews = document.getElementById('close-news');

// Settings Navigation
const settingsBtn = document.getElementById('settings-btn');
const modsBtn = document.getElementById('mods-btn');
const backToHome = document.getElementById('back-to-home');
const settingsNavItems = document.querySelectorAll('.settings-nav-item');
const settingsSections = document.querySelectorAll('.settings-section');

// Settings Form Elements
const usernameInput = document.getElementById('username');
const ramSlider = document.getElementById('ram-slider');
const ramValue = document.getElementById('ram-value');
const resolutionSelect = document.getElementById('resolution');
const fullscreenCheckbox = document.getElementById('fullscreen');
const gameDirectoryInput = document.getElementById('game-directory');
const browseDirectoryBtn = document.getElementById('browse-directory');
const jvmArgsTextarea = document.getElementById('jvm-args');
const closeOnLaunchCheckbox = document.getElementById('close-on-launch');
const autoUpdateCheckbox = document.getElementById('auto-update');
const checkUpdatesBtn = document.getElementById('check-updates');

// Window Control Buttons
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');

// ==================== STATE ====================

let isDownloading = false;
let isLaunching = false;
let config = null;
let installationStatus = null;
let usernameNeedsConfiguration = false; // Track if username needs to be configured

// ==================== RANDOM NAME GENERATOR ====================

// Minecraft-style random name parts
const NAME_ADJECTIVES = [
    'Swift', 'Dark', 'Brave', 'Wild', 'Storm', 'Fire', 'Ice', 'Shadow', 'Iron',
    'Gold', 'Silver', 'Crystal', 'Thunder', 'Lucky', 'Mystic', 'Epic', 'Cosmic',
    'Blazing', 'Frozen', 'Silent', 'Mighty', 'Noble', 'Ancient', 'Crimson', 'Azure'
];

const NAME_NOUNS = [
    'Wolf', 'Dragon', 'Phoenix', 'Knight', 'Mage', 'Hunter', 'Warrior', 'Ninja',
    'Archer', 'Wizard', 'Titan', 'Hawk', 'Bear', 'Lion', 'Tiger', 'Raven',
    'Viper', 'Falcon', 'Panther', 'Shark', 'Eagle', 'Fox', 'Lynx', 'Cobra', 'Owl'
];

function generateRandomName() {
    const adjective = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
    const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
    const number = Math.floor(Math.random() * 1000);
    return `${adjective}${noun}${number}`;
}

// ==================== WINDOW CONTROLS ====================

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

// ==================== VIEW NAVIGATION ====================

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');
}

// Settings button - go to settings view
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        switchView('settings');
        switchSettingsSection('account');
    });
}

// Mods button - go to settings mods section
if (modsBtn) {
    modsBtn.addEventListener('click', () => {
        switchView('settings');
        switchSettingsSection('mods');
    });
}

// Back to home button
if (backToHome) {
    backToHome.addEventListener('click', () => {
        saveCurrentSettings();
        switchView('home');
    });
}

// ==================== SETTINGS NAVIGATION ====================

function switchSettingsSection(sectionName) {
    // Update nav items
    settingsNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Update content sections
    settingsSections.forEach(section => {
        const isActive = section.id === `section-${sectionName}`;
        section.classList.toggle('active', isActive);
    });
}

// Settings navigation clicks
settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
        switchSettingsSection(item.dataset.section);
    });
});

// ==================== NEWS PANEL ====================

// News URL - strict single source (no fallbacks)
const NEWS_URL = 'https://raw.githubusercontent.com/MeherBenSalem/NaizoLauncher/main/news.json';
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
let newsCache = null;
let newsCacheTimestamp = 0;

if (newsToggle) {
    newsToggle.addEventListener('click', () => {
        newsPanel.classList.toggle('open');
        newsToggle.classList.toggle('active');

        // Load news when panel opens
        if (newsPanel.classList.contains('open')) {
            loadNews();
        }
    });
}

if (closeNews) {
    closeNews.addEventListener('click', () => {
        newsPanel.classList.remove('open');
        newsToggle.classList.remove('active');
    });
}

// Fetch and display news (single source, with caching)
async function loadNews() {
    const newsContent = document.getElementById('news-content');
    if (!newsContent) return;

    // Check cache first
    const now = Date.now();
    if (newsCache && (now - newsCacheTimestamp) < NEWS_CACHE_TTL) {
        renderNews(newsCache);
        return;
    }

    // Show loading state
    newsContent.innerHTML = '<div class="news-loading">Loading news...</div>';

    try {
        const response = await fetch(NEWS_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch news');
        }

        const newsData = await response.json();

        if (newsData && newsData.news && newsData.news.length > 0) {
            // Cache the news
            newsCache = newsData.news;
            newsCacheTimestamp = now;
            renderNews(newsData.news);
        } else {
            newsContent.innerHTML = '<div class="news-empty">News unavailable</div>';
        }
    } catch (error) {
        console.error('Error loading news:', error);
        newsContent.innerHTML = '<div class="news-error">News unavailable</div>';
    }
}

// Render news items
function renderNews(newsItems) {
    const newsContent = document.getElementById('news-content');
    if (!newsContent) return;

    newsContent.innerHTML = newsItems.map(item => {
        const formattedDate = formatNewsDate(item.date);
        const clickable = item.url ? `onclick="openNewsLink('${item.url}')"` : '';
        const cursorStyle = item.url ? 'style="cursor: pointer;"' : '';

        return `
            <div class="news-card" ${cursorStyle} ${clickable}>
                <div class="news-meta">
                    <span class="news-date">${formattedDate}</span>
                    <span class="news-tag">${item.tag || 'News'}</span>
                </div>
                <h4 class="news-title">${item.title}</h4>
                <p class="news-description">${item.description}</p>
            </div>
        `;
    }).join('');
}

// Format news date
function formatNewsDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// Open news link in external browser
function openNewsLink(url) {
    if (url) {
        require('electron').shell.openExternal(url);
    }
}

// Make openNewsLink available globally for onclick handlers
window.openNewsLink = openNewsLink;

// ==================== UTILITIES ====================

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '';
    return formatBytes(bytesPerSecond) + '/s';
}

function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
}

function formatRam(mb) {
    if (mb >= 1024) {
        return (mb / 1024).toFixed(1) + 'G';
    }
    return mb + 'M';
}

// ==================== STATUS & PROGRESS ====================

function setStatus(text) {
    statusText.textContent = text;
}

function showProgress(show) {
    progressContainer.style.display = show ? 'block' : 'none';
}

function updateProgress(percentage, text = '') {
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = text || `${percentage}%`;
}

// ==================== INITIALIZATION ====================

async function init() {
    // Load configuration
    const result = await ipcRenderer.invoke('load-config');
    if (result.success) {
        config = result.config;

        // Check if username needs configuration
        // A username is "configured" if it exists, is not empty, and is_username_configured flag is true
        if (!config.last_username || config.last_username.trim() === '' || config.is_username_configured !== true) {
            // Generate a random name if no username is set
            if (!config.last_username || config.last_username.trim() === '') {
                config.last_username = generateRandomName();
                await ipcRenderer.invoke('save-config', config);
            }
            usernameNeedsConfiguration = true;
            playerNameDisplay.textContent = config.last_username;
            playerNameDisplay.classList.add('needs-config');
            playerNameDisplay.title = 'Click to configure your username';
        } else {
            usernameNeedsConfiguration = false;
            playerNameDisplay.textContent = config.last_username;
            playerNameDisplay.classList.remove('needs-config');
            playerNameDisplay.title = '';
        }

        loadSettingsToUI();
    }

    // Get system info for RAM display
    try {
        const systemInfo = await ipcRenderer.invoke('get-system-info');
        if (systemInfo) {
            const totalRamEl = document.getElementById('total-ram');
            const availableRamEl = document.getElementById('available-ram');
            if (totalRamEl && systemInfo.totalMemory) {
                totalRamEl.textContent = formatRam(Math.round(systemInfo.totalMemory / (1024 * 1024)));
            }
            if (availableRamEl && systemInfo.freeMemory) {
                availableRamEl.textContent = formatRam(Math.round(systemInfo.freeMemory / (1024 * 1024)));
            }
        }
    } catch (e) {
        console.log('Could not get system info:', e);
    }

    // Check installation status and update button
    await checkAndUpdateStatus();

    // Start server status monitoring
    checkServerStatus();
    setInterval(checkServerStatus, 60000); // Check every 60 seconds
}

// Player name click handler - navigate to settings if username needs configuration
if (playerNameDisplay) {
    playerNameDisplay.addEventListener('click', () => {
        if (usernameNeedsConfiguration) {
            switchView('settings');
            switchSettingsSection('account');
            usernameInput?.focus();
        }
    });
}

// ==================== SERVER STATUS MONITORING ====================

const SERVER_IP = '51.83.4.21';
const SERVER_PORT = '25567';

async function checkServerStatus() {
    const playerCountEl = document.getElementById('player-count');
    const serverStatusEl = document.getElementById('server-status');
    const serverIndicatorEl = document.getElementById('server-indicator');

    try {
        // Use mcsrvstat.us API to get server status
        const response = await fetch(`https://api.mcsrvstat.us/2/${SERVER_IP}:${SERVER_PORT}`);
        const data = await response.json();

        if (data.online) {
            // Server is online
            const online = data.players?.online || 0;
            const max = data.players?.max || 100;

            if (playerCountEl) {
                playerCountEl.textContent = `${online}/${max}`;
            }

            if (serverStatusEl) {
                serverStatusEl.classList.add('online');
                serverStatusEl.classList.remove('offline');
            }

            if (serverIndicatorEl) {
                serverIndicatorEl.classList.add('online');
                serverIndicatorEl.classList.remove('offline');
            }
        } else {
            // Server is offline
            if (playerCountEl) {
                playerCountEl.textContent = '0/0';
            }

            if (serverStatusEl) {
                serverStatusEl.classList.remove('online');
                serverStatusEl.classList.add('offline');
            }

            if (serverIndicatorEl) {
                serverIndicatorEl.classList.remove('online');
                serverIndicatorEl.classList.add('offline');
            }
        }
    } catch (error) {
        console.log('Could not fetch server status:', error);

        // Show as unknown/offline on error
        if (playerCountEl) {
            playerCountEl.textContent = '--/--';
        }

        if (serverStatusEl) {
            serverStatusEl.classList.remove('online');
        }

        if (serverIndicatorEl) {
            serverIndicatorEl.classList.remove('online');
        }
    }
}

// ==================== INSTALLATION STATUS ====================

async function checkAndUpdateStatus() {
    setStatus('Checking installation...');

    try {
        const status = await ipcRenderer.invoke('get-installation-status');

        if (status.success) {
            installationStatus = status;
            updateButtonState(status);

            if (status.state === 'ready') {
                setStatus('Ready to Launch');
            } else if (status.state === 'needs_install') {
                setStatus('Installation required');
            } else if (status.state === 'needs_update') {
                const missing = status.totalMissing;
                setStatus(`Update available (${missing} file${missing > 1 ? 's' : ''})`);
            }
        } else {
            setStatus('Error checking installation');
            console.error(status.error);
        }
    } catch (error) {
        setStatus('Error checking installation');
        console.error('Installation check error:', error);
    }
}

function updateButtonState(status) {
    buttonText.textContent = status.actionLabel || 'PLAY';

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

// ==================== SETTINGS MANAGEMENT ====================

function loadSettingsToUI() {
    if (!config) return;

    // Username
    if (usernameInput && config.last_username) {
        usernameInput.value = config.last_username;
    }

    // RAM
    if (ramSlider && config.jvm_args && config.jvm_args.max_ram) {
        const ramMB = parseInt(config.jvm_args.max_ram);
        ramSlider.value = ramMB;
        updateRamDisplay(ramMB);
    }

    // Resolution
    if (resolutionSelect && config.window) {
        resolutionSelect.value = `${config.window.width}x${config.window.height}`;
    }

    // Fullscreen
    if (fullscreenCheckbox && config.window) {
        fullscreenCheckbox.checked = config.window.fullscreen;
    }

    // Game Directory
    if (gameDirectoryInput && config.game_directory) {
        gameDirectoryInput.value = config.game_directory;
    }

    // JVM Args
    if (jvmArgsTextarea && config.jvm_args && config.jvm_args.custom_args) {
        jvmArgsTextarea.value = config.jvm_args.custom_args.join('\n');
    }

    // Close on launch
    if (closeOnLaunchCheckbox) {
        closeOnLaunchCheckbox.checked = config.close_launcher_on_game_start || false;
    }

    // Auto update
    if (autoUpdateCheckbox) {
        autoUpdateCheckbox.checked = config.auto_update !== false;
    }
}

function updateRamDisplay(mb) {
    if (ramValue) {
        ramValue.textContent = formatRam(mb);
    }
}

async function saveCurrentSettings() {
    if (!config) return;

    try {
        // Username
        if (usernameInput) {
            const username = usernameInput.value.trim();
            if (username && username.length >= 3 && username.length <= 16) {
                config.last_username = username;
                config.is_username_configured = true; // Mark as configured
                usernameNeedsConfiguration = false;
                playerNameDisplay.textContent = username;
                playerNameDisplay.classList.remove('needs-config');
                playerNameDisplay.title = '';
            }
        }

        // RAM
        if (ramSlider) {
            const ramMB = parseInt(ramSlider.value);
            config.jvm_args.max_ram = `${ramMB}M`;
        }

        // Resolution
        if (resolutionSelect) {
            const [width, height] = resolutionSelect.value.split('x').map(Number);
            config.window.width = width;
            config.window.height = height;
        }

        // Fullscreen
        if (fullscreenCheckbox) {
            config.window.fullscreen = fullscreenCheckbox.checked;
        }

        // Game directory
        if (gameDirectoryInput && gameDirectoryInput.value.trim()) {
            config.game_directory = gameDirectoryInput.value.trim();
        }

        // JVM args
        if (jvmArgsTextarea) {
            const jvmArgsText = jvmArgsTextarea.value.trim();
            if (jvmArgsText) {
                config.jvm_args.custom_args = jvmArgsText.split('\n').filter(line => line.trim());
            } else {
                config.jvm_args.custom_args = [];
            }
        }

        // Close on launch
        if (closeOnLaunchCheckbox) {
            config.close_launcher_on_game_start = closeOnLaunchCheckbox.checked;
        }

        // Auto update
        if (autoUpdateCheckbox) {
            config.auto_update = autoUpdateCheckbox.checked;
        }

        // Save to file
        await ipcRenderer.invoke('save-config', config);

    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// ==================== EVENT LISTENERS ====================

// RAM slider
if (ramSlider) {
    ramSlider.addEventListener('input', (e) => {
        updateRamDisplay(parseInt(e.target.value));
    });
}

// Browse directory button
if (browseDirectoryBtn) {
    browseDirectoryBtn.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('select-directory');

        if (result.success && !result.canceled) {
            if (gameDirectoryInput) {
                gameDirectoryInput.value = result.path;
            }
        }
    });
}

// Check updates button
if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', async () => {
        checkUpdatesBtn.textContent = 'Checking...';
        checkUpdatesBtn.disabled = true;

        try {
            await checkAndUpdateStatus();
            checkUpdatesBtn.textContent = 'Check for Updates';
        } catch (error) {
            console.error('Error checking updates:', error);
            checkUpdatesBtn.textContent = 'Check for Updates';
        }

        checkUpdatesBtn.disabled = false;
    });
}

// Username input - update display on change
if (usernameInput) {
    usernameInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value) {
            playerNameDisplay.textContent = value;
        }
    });
}

// ==================== PLAY BUTTON ====================

playButton.addEventListener('click', async () => {
    // Get username from settings
    const username = usernameInput ? usernameInput.value.trim() : config?.last_username;

    // Check if username needs configuration
    if (!username || usernameNeedsConfiguration) {
        alert('Please configure your username before launching the game!');
        switchView('settings');
        switchSettingsSection('account');
        usernameInput?.focus();
        return;
    }

    if (username.length < 3 || username.length > 16) {
        alert('Username must be between 3 and 16 characters');
        switchView('settings');
        switchSettingsSection('account');
        usernameInput?.focus();
        return;
    }

    // Disable button
    playButton.disabled = true;

    try {
        // Save username to config
        config.last_username = username;
        playerNameDisplay.textContent = username;
        await ipcRenderer.invoke('save-config', config);

        // Check if we need to download
        const installCheck = await ipcRenderer.invoke('get-installation-status');

        if (installCheck.state !== 'ready') {
            // Download required files
            isDownloading = true;
            buttonText.textContent = 'DOWNLOADING...';
            setStatus('Starting download...');
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
        setStatus('Launching Minecraft...');
        buttonText.textContent = 'LAUNCHING...';

        const launchResult = await ipcRenderer.invoke('launch-game', username, {});

        if (launchResult.success) {
            setStatus('Minecraft is running');
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
        setStatus('Error: ' + error.message);
        alert('Failed to launch Minecraft: ' + error.message);

        // Refresh status after error
        await checkAndUpdateStatus();
    } finally {
        playButton.disabled = false;
        isLaunching = false;
        isDownloading = false;
    }
});

// ==================== IPC LISTENERS ====================

// Download progress listener
ipcRenderer.on('download-progress', (event, progress) => {
    console.log('Download progress:', progress);

    if (progress.stage === 'complete') {
        setStatus('Download Complete!');
        updateProgress(100, 'Complete');
        return;
    }

    const speed = formatSpeed(progress.speed);
    const eta = formatETA(progress.eta);

    if (progress.stage === 'client') {
        const downloaded = formatBytes(progress.downloaded);
        const total = formatBytes(progress.totalSize);
        setStatus(`Downloading Client ${speed ? `• ${speed}` : ''}`);
        updateProgress(progress.overallProgress || progress.percentage, `${downloaded} / ${total}`);

    } else if (progress.stage === 'libraries') {
        const current = progress.completed || 0;
        const total = progress.total || 0;
        const fileName = progress.currentFile || 'Library';
        setStatus(`${fileName} ${speed ? `• ${speed}` : ''}`);
        updateProgress(progress.overallProgress || 0, `${current}/${total} Libraries`);

    } else if (progress.stage === 'asset-index') {
        setStatus('Downloading Asset Index...');
        updateProgress(progress.overallProgress || 50, 'Asset Index');

    } else if (progress.stage === 'assets') {
        const current = progress.completed || 0;
        const total = progress.total || 0;
        const etaText = eta ? ` • ~${eta} remaining` : '';
        setStatus(`Downloading Assets ${speed ? `• ${speed}` : ''}${etaText}`);
        updateProgress(progress.overallProgress || 0, `${current}/${total} Assets`);

    } else if (progress.stage === 'modpack') {
        const current = progress.current || 0;
        const total = progress.total || 0;

        if (progress.status === 'checking') {
            setStatus('Checking for mod updates...');
            showProgress(true);
            updateProgress(0, 'Checking mods...');
        } else if (progress.status === 'downloading') {
            const currentFile = progress.file || 'Mod';
            setStatus(`Downloading: ${currentFile}`);
            updateProgress(progress.percentage || 0, `${current}/${total} Mods`);
        } else if (progress.status === 'complete') {
            setStatus('Mods synced successfully');
            updateProgress(100, 'Mods ready');
        } else if (progress.status === 'error') {
            setStatus(`Mod sync failed: ${progress.message || 'Unknown error'}`);
        } else {
            const currentFile = progress.file || 'Syncing';
            setStatus(`${currentFile}`);
            updateProgress(Math.floor((current / total) * 100), `${current}/${total} Mods`);
        }
    }
});

// Game state listener
ipcRenderer.on('game-state', (event, state) => {
    if (state.running) {
        playButton.disabled = true;
        buttonText.textContent = 'PLAYING';
        setStatus('Minecraft is running...');
    } else {
        playButton.disabled = false;
        // Refresh status when game closes
        checkAndUpdateStatus();
    }
});

// ==================== LAUNCHER AUTO-UPDATE ====================

// Launcher update elements
const launcherUpdateIndicator = document.getElementById('launcher-update-indicator');
const updateIndicatorText = document.querySelector('.update-indicator-text');
const updateReadyBanner = document.getElementById('update-ready-banner');
const restartForUpdateBtn = document.getElementById('restart-for-update');
const closeUpdateBannerBtn = document.getElementById('close-update-banner');

// Show/hide update indicator
function showUpdateIndicator(show, text = 'Updating...') {
    if (launcherUpdateIndicator) {
        launcherUpdateIndicator.style.display = show ? 'flex' : 'none';
        if (updateIndicatorText) updateIndicatorText.textContent = text;
    }
}

// Show/hide update ready banner
function showUpdateReadyBanner(show) {
    if (updateReadyBanner) {
        updateReadyBanner.style.display = show ? 'flex' : 'none';
    }
    // Hide indicator when showing banner
    if (show) showUpdateIndicator(false);
}

// Restart button handler
if (restartForUpdateBtn) {
    restartForUpdateBtn.addEventListener('click', async () => {
        try {
            await ipcRenderer.invoke('install-launcher-update');
        } catch (error) {
            console.error('Failed to restart for update:', error);
        }
    });
}

// Close banner button handler
if (closeUpdateBannerBtn) {
    closeUpdateBannerBtn.addEventListener('click', () => {
        showUpdateReadyBanner(false);
    });
}

// Launcher update status listener
ipcRenderer.on('launcher-update-status', (event, data) => {
    console.log('Launcher update status:', data);

    const updateInfoEl = document.querySelector('.update-info h4');
    const updateVersionEl = document.getElementById('modpack-version');

    switch (data.status) {
        case 'update-checking':
            if (updateInfoEl) updateInfoEl.textContent = 'Checking for updates...';
            break;

        case 'update-available':
            if (updateInfoEl) updateInfoEl.textContent = `Update Available: v${data.version}`;
            showUpdateIndicator(true, 'Downloading update...');
            break;

        case 'update-not-available':
            if (updateInfoEl) updateInfoEl.textContent = "You're up to date!";
            showUpdateIndicator(false);
            break;

        case 'update-download-progress':
            const percent = Math.round(data.percent);
            if (updateInfoEl) updateInfoEl.textContent = `Downloading update... ${percent}%`;
            showUpdateIndicator(true, `Downloading... ${percent}%`);
            break;

        case 'update-downloaded':
            if (updateInfoEl) updateInfoEl.textContent = `Update v${data.version} ready to install`;
            showUpdateIndicator(false);
            showUpdateReadyBanner(true);
            break;

        case 'update-error':
            if (updateInfoEl) updateInfoEl.textContent = data.message || 'Update check failed';
            showUpdateIndicator(false);
            console.error('Launcher update error:', data.fullError || data.message);
            break;
    }
});

// Get launcher version on init
async function updateLauncherVersionDisplay() {
    try {
        const versionInfo = await ipcRenderer.invoke('get-launcher-version');
        const versionEl = document.querySelector('.about-card .version');
        if (versionEl) {
            versionEl.textContent = `Version ${versionInfo.version}`;
        }
    } catch (e) {
        console.log('Could not get launcher version:', e);
    }
}

// ==================== INITIALIZE ====================

init();
updateLauncherVersionDisplay();
