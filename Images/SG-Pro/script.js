// ============================================================================
// USER AUTHENTICATION & CONFIGURATION
// ============================================================================

const Admin_PASSWORD = "admin123"; // Change this to your desired password
let currentUser = null; // 'Admin' or 'user'

// ============================================================================
// RADIO STATION CONFIGURATION
// ============================================================================

const RADIO_STATIONS = [
    { name: "ECR", fullName: "East Coast Radio", url: "https://edge.iono.fm/xice/ecr_live_medium.aac" },
    { name: "LM Radio", fullName: "LM Radio", url: "https://ukwesta.streaming.broadcast.radio/lmradio" },
    { name: "ECR Gold", fullName: "East Coast Gold", url: "https://live.ecr.co.za/ecrgoldhigh.mp3" },
    { name: "Hindvani", fullName: "Hindvani", url: "https://edge.iono.fm/xice/129_medium.aac" }
];

// ============================================================================
// APPLICATION STATE
// ============================================================================

let currentStationIndex = 0;
let PLAYLIST = [];
let queue = [];
let currentSong = null;
let mode = "radio";
let modeTimeRemaining = 7200;
let timerSpeed = 1;
let playHistory = [];
let isSwitchingMode = false;
let isAnnouncementPlaying = false;
let pendingSongUrl = null;
let lastDedicationIndex = -1;
let lastPreviousClickTime = 0;
let recentlyPlayedSongs = [];
let createdObjectUrls = [];
let isMuted = false;
let lastVolume = 0.7;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const getEl = id => document.getElementById(id);

// Login elements
const loginScreen = getEl("loginScreen");
const mainApp = getEl("mainApp");
const AdminLoginBtn = getEl("AdminLoginBtn");
const userLoginBtn = getEl("userLoginBtn");
const passwordSection = getEl("passwordSection");
const AdminPassword = getEl("AdminPassword");
const submitPasswordBtn = getEl("submitPasswordBtn");
const errorMessage = getEl("errorMessage");

// Main app elements
const userBadge = getEl("userBadge");
const logoutBtn = getEl("logoutBtn");
const uploadSection = getEl("uploadSection");
const folderBtn = getEl("folderBtn");
const nowPlayingContainer = getEl("nowPlayingContainer");
const playlistListEl = getEl("playlist-list");
const manualSwitchBtn = getEl("manualSwitchBtn");
const shuffleBtn = getEl("shuffleBtn");
const timerDisplay = getEl("timerDisplay");
const modeProgressFill = getEl("modeProgressFill");
const modeIcon = getEl("modeIcon");
const modeTitle = getEl("modeTitle");
const modeSubtitle = getEl("modeSubtitle");
const modeDisplay = getEl("modeDisplay");
const songsLoaded = getEl("songsLoaded");
const playbackStatus = getEl("playbackStatus");
const queueLengthEl = getEl("queueLength");
const timerSpeedEl = getEl("timerSpeed");

// Theme toggle will be accessed after DOM is loaded
let themeToggle;

// Create hidden file input for folder selection
const folderInput = document.createElement("input");
folderInput.type = "file";
folderInput.setAttribute("webkitdirectory", "");
folderInput.setAttribute("directory", "");
folderInput.setAttribute("multiple", "");
folderInput.accept = "audio/*";
folderInput.style.display = "none";
document.body.appendChild(folderInput);

// ============================================================================
// AUDIO ELEMENTS
// ============================================================================

let audioElement = new Audio();
let radioAudioElement = new Audio();
let synthRef = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;

audioElement.volume = 0.7;
radioAudioElement.volume = 0.7;

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

function showAdminLogin() {
    passwordSection.classList.add('show');
    AdminPassword.focus();
}

function verifyAdminPassword() {
    const password = AdminPassword.value;
    if (password === Admin_PASSWORD) {
        currentUser = 'Admin';
        showMainApp();
    } else {
        errorMessage.classList.add('show');
        AdminPassword.value = '';
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 3000);
    }
}

function loginAsUser() {
    currentUser = 'user';
    showMainApp();
}

function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.classList.add('show');
    
    // Update user badge
    if (currentUser === 'Admin') {
        userBadge.textContent = '👑 Admin Access';
        userBadge.classList.add('Admin');
        uploadSection.style.display = 'block';
    } else {
        userBadge.textContent = '👤 Listener';
        userBadge.classList.remove('Admin');
        uploadSection.style.display = 'none';
    }
    
    // Initialize the app
    initializeApp();
}

function logout() {
    currentUser = null;
    mainApp.classList.remove('show');
    loginScreen.style.display = 'flex';
    passwordSection.classList.remove('show');
    AdminPassword.value = '';
    
    // Stop all playback
    stopAll();
    
    // Reset to radio mode
    mode = 'radio';
    modeTimeRemaining = 7200;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return String(hours).padStart(2, '0') + ':' +
           String(minutes).padStart(2, '0') + ':' +
           String(secs).padStart(2, '0');
}

function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function stopAll() {
    try {
        audioElement.pause();
        radioAudioElement.pause();
        audioElement.currentTime = 0;
        radioAudioElement.currentTime = 0;
    } catch (e) {
        console.warn("stopAll: audio control failed", e);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function revokeAllObjectUrls() {
    for (const url of createdObjectUrls) {
        try { URL.revokeObjectURL(url); } catch (e) { }
    }
    createdObjectUrls = [];
}

// ============================================================================
// VOLUME & MUTE FUNCTIONS
// ============================================================================

function toggleMute() {
    isMuted = !isMuted;
    
    if (isMuted) {
        lastVolume = (mode === "radio") ? radioAudioElement.volume : audioElement.volume;
        audioElement.volume = 0;
        radioAudioElement.volume = 0;
    } else {
        audioElement.volume = lastVolume;
        radioAudioElement.volume = lastVolume;
    }
    
    renderNowPlaying();
}

function setVolume(value) {
    let vol = (typeof value === 'string') ? parseFloat(value) : Number(value);
    if (!isFinite(vol)) vol = 70;
    vol = Math.max(0, Math.min(100, vol)) / 100;
    
    // If user moves slider, unmute automatically
    if (vol > 0 && isMuted) {
        isMuted = false;
    }
    
    lastVolume = vol;
    audioElement.volume = vol;
    radioAudioElement.volume = vol;
    renderNowPlaying();
}

// ============================================================================
// REQUESTER NAME MODAL
// ============================================================================

function showRequesterModal(songIndex, callback) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        animation: fadeIn 0.3s;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: ${document.body.classList.contains('light') ? '#fff' : '#2a2a2a'};
        padding: 30px;
        border-radius: 20px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        max-width: 400px;
        width: 90%;
        text-align: center;
        animation: fadeInUp 0.5s;
    `;

    const song = PLAYLIST[songIndex];
    
    modalContent.innerHTML = `
        <h2 style="color: #008996; margin-bottom: 15px; font-size: 1.5rem;">🎵 Who Requested This Song?</h2>
        <p style="color: ${document.body.classList.contains('light') ? '#666' : '#aaa'}; margin-bottom: 10px; font-size: 0.9rem;">
            <strong>${escapeHtml(song.title)}</strong> by ${escapeHtml(song.artist)}
        </p>
        <input type="text" id="requesterInput" placeholder="Enter requester's name" style="
            width: 100%;
            padding: 12px 15px;
            border-radius: 10px;
            border: 2px solid #008996;
            outline: none;
            background: ${document.body.classList.contains('light') ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.1)'};
            color: ${document.body.classList.contains('light') ? '#222' : '#f5f5f5'};
            margin: 15px 0;
            font-size: 1rem;
        ">
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
            <button id="modalSubmit" style="
                padding: 10px 25px;
                background: linear-gradient(135deg, #008996, #00aeef);
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-size: 0.95rem;
                font-weight: 700;
                transition: all 0.3s;
            ">✓ Confirm</button>
            <button id="modalCancel" style="
                padding: 10px 25px;
                background: #6b7280;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-size: 0.95rem;
                font-weight: 700;
                transition: all 0.3s;
            ">✕ Cancel</button>
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    const input = document.getElementById('requesterInput');
    const submitBtn = document.getElementById('modalSubmit');
    const cancelBtn = document.getElementById('modalCancel');

    input.focus();

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.3s';
        setTimeout(() => {
            document.body.removeChild(modal);
        }, 300);
    };

    submitBtn.onclick = () => {
        const name = input.value.trim();
        if (name) {
            PLAYLIST[songIndex].requester = name;
            callback(true);
            closeModal();
        } else {
            input.style.borderColor = '#dc3545';
            input.placeholder = 'Please enter a name!';
            setTimeout(() => {
                input.style.borderColor = '#008996';
            }, 2000);
        }
    };

    cancelBtn.onclick = () => {
        callback(false);
        closeModal();
    };

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

function updateTimerDisplay() {
    timerDisplay.textContent = formatTime(modeTimeRemaining);

    const maxTime = 7200;
    let progressPercent = ((maxTime - modeTimeRemaining) / Math.max(1, maxTime)) * 100;
    progressPercent = Math.min(100, Math.max(0, progressPercent));
    modeProgressFill.style.width = progressPercent + '%';

    modeIcon.textContent = (mode === "radio") ? '📻' : '🎵';
    modeTitle.textContent = (mode === "radio") ? 'LIVE RADIO' : 'PLAYLIST MODE';
    modeSubtitle.textContent = '2 Hour Block';
    manualSwitchBtn.textContent = (mode === "radio") ? '▶▶ Switch to Playlist' : '▶▶ Switch to Radio';
}

function renderNowPlaying() {
    let html = "";
    const currentVolume = (mode === "radio") ? radioAudioElement.volume : audioElement.volume;
    const muteIcon = isMuted ? '🔇' : '🔊';
    const muteClass = isMuted ? 'muted' : '';

    if (mode === "radio") {
        const currentStation = RADIO_STATIONS[currentStationIndex] || { fullName: 'Unknown' };
        const canGoBack = playHistory.length > 0 && playHistory[playHistory.length - 1].type === 'radio';

        html = `
            <div style="padding: 25px;">
                <div style="font-size: 3rem; margin-bottom: 15px;">📻</div>
                <p style="font-size: 1.3rem; font-weight: 900; color: #008996; margin-bottom: 4px;">
                    ${escapeHtml(currentStation.fullName)}
                </p>
                <p style="color: #9ca3af; margin-bottom: 15px; font-size: 0.75rem;">
                    Live Radio Stream • 2-hour broadcast
                </p>
                <div style="display: flex; justify-content: center; gap: 10px; align-items: center; margin-top: 15px; flex-wrap: wrap;">
                    <button onclick="previousRadioStation()" style="padding: 10px 25px; font-size: 0.9rem; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s; ${!canGoBack ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${!canGoBack ? 'disabled' : ''}>◀◀ Previous</button>
                    <button onclick="togglePlayPause()" style="padding: 10px 25px; font-size: 0.9rem; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s;">${radioAudioElement.paused ? '▶ Play Radio' : '▌▌ Pause Radio'}</button>
                    <button onclick="nextRadioStation()" style="padding: 10px 25px; font-size: 0.9rem; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s;">▶▶ Next Station</button>
                </div>
                <div class="volume-control" style="margin-top: 20px;">
                    <button onclick="toggleMute()" class="mute-btn ${muteClass}">${muteIcon}</button>
                    <input type="range" class="volume-slider" min="0" max="100" value="${Math.round((isMuted ? lastVolume : currentVolume)*100)}" oninput="setVolume(this.value)">
                    <span class="volume-value">${Math.round((isMuted ? lastVolume : currentVolume)*100)}%</span>
                </div>
                <div style="margin-top: 18px; padding: 12px; background: rgba(0, 174, 239, 0.1); border-radius: 8px; border: 1px solid rgba(0, 174, 239, 0.3);">
                    <p style="color: #9ca3af; font-size: 0.7rem; margin: 0;">Available Stations:</p>
                    <p style="color: #008996; font-weight: 700; margin: 4px 0 0 0; font-size: 0.8rem;">
                        ${RADIO_STATIONS.map(s => escapeHtml(s.name)).join(' • ')}
                    </p>
                </div>
            </div>`;
    } else if (currentSong) {
        const canGoBack = playHistory.length > 0 && playHistory[playHistory.length - 1].type === 'song';

        html = `
            <div class="song-display">
                <div class="now-playing-badge">🔥 NOW PLAYING</div>
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🎵</div>
                <h4 style="font-size: 1.2rem; margin: 8px 0; font-weight: 900;">
                    ${escapeHtml(currentSong.title)}
                </h4>
                <p style="font-size: 0.9rem; color: #666; margin: 4px 0;">
                    by ${escapeHtml(currentSong.artist)}
                </p>
                <p style="margin-top: 10px; color: #008996; font-size: 0.8rem;">
                    👤 Requested by: <strong>${escapeHtml(currentSong.requester)}</strong>
                </p>
            </div>
            <div class="controls">
                <button onclick="previousSong()" class="btn-circle" style="width: 55px; height: 55px; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 6px; font-size: 1.3rem; background: ${canGoBack ? '#008996' : 'linear-gradient(135deg, #6b7280, #4b5563)'}; border: none; color: white; cursor: pointer; transition: all 0.2s; ${!canGoBack ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${!canGoBack ? 'disabled' : ''}>◀◀</button>
                <button onclick="togglePlayPause()" class="btn-circle" style="width: 55px; height: 55px; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 6px; font-size: 1.3rem; background: #008996; border: none; color: white; cursor: pointer; transition: all 0.2s;">${audioElement.paused ? '▶' : '▌▌'}</button>
                <button onclick="playNextSong()" class="btn-circle" style="width: 55px; height: 55px; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 6px; font-size: 1.3rem; background: #008996; border: none; color: white; cursor: pointer; transition: all 0.2s;">▶▶</button>
                <div class="volume-control">
                    <button onclick="toggleMute()" class="mute-btn ${muteClass}">${muteIcon}</button>
                    <input type="range" class="volume-slider" min="0" max="100" value="${Math.round((isMuted ? lastVolume : currentVolume)*100)}" oninput="setVolume(this.value)">
                    <span class="volume-value">${Math.round((isMuted ? lastVolume : currentVolume)*100)}%</span>
                </div>
            </div>
            <div style="text-align: center; margin-top: 10px; color: #9ca3af; font-size: 0.75rem;">
                📁 ${escapeHtml(currentSong.file)}
            </div>`;
    } else {
        html = `
            <div style="text-align: center; padding: 40px 15px; color: #9ca3af;">
                <div style="font-size: 2.5rem;">🎵</div>
                <p style="font-size: 0.85rem;">
                    ${PLAYLIST.length === 0 ? 'No playlist loaded' : 'Loading song...'}
                </p>
            </div>`;
    }

    nowPlayingContainer.innerHTML = html;
}

function renderPlaylist() {
    playlistListEl.innerHTML = "";

    if (PLAYLIST.length === 0) {
        playlistListEl.innerHTML = '<li style="text-align: center; color: #9ca3af; padding: 15px; font-size: 0.8rem;">No songs loaded yet</li>';
    } else {
        PLAYLIST.forEach((song) => {
            const li = document.createElement("li");
            li.textContent = `${song.artist} - ${song.title} (${song.requester})`;
            playlistListEl.appendChild(li);
        });
    }

    songsLoaded.textContent = `${PLAYLIST.length} track${PLAYLIST.length !== 1 ? 's' : ''}`;
    queueLengthEl.textContent = `${queue.length} track${queue.length !== 1 ? 's' : ''}`;
}

function updateSystemInfo() {
    modeDisplay.textContent = (mode === "radio")
        ? `Live Radio - ${RADIO_STATIONS[currentStationIndex]?.name || 'Unknown'}`
        : "Playlist Mode";

    const isPlaying = (mode === "radio") ? !radioAudioElement.paused : !audioElement.paused;
    playbackStatus.textContent = isPlaying ? "Playing" : "Paused";

    queueLengthEl.textContent = `${queue.length} track${queue.length !== 1 ? 's' : ''}`;
    timerSpeedEl.textContent = timerSpeed + 'x';
}

// ============================================================================
// PLAYBACK CONTROL FUNCTIONS
// ============================================================================

function togglePlayPause() {
    if (mode === "radio") {
        if (radioAudioElement.paused) {
            audioElement.pause();
            audioElement.currentTime = 0;
            
            // FIXED: Force reload to get live stream by adding timestamp
            const currentStation = RADIO_STATIONS[currentStationIndex];
            radioAudioElement.src = currentStation.url + '?t=' + Date.now();
            radioAudioElement.load();
            radioAudioElement.play().catch(err => console.error("Radio play error:", err));
        } else {
            radioAudioElement.pause();
        }
    } else {
        if (isAnnouncementPlaying && audioElement.paused) {
            try { synthRef && synthRef.cancel(); } catch (e) { }
            isAnnouncementPlaying = false;
            pendingSongUrl = null;
            radioAudioElement.pause();
            radioAudioElement.currentTime = 0;
            audioElement.play().catch(err => console.error("Audio play error:", err));
        } else if (audioElement.paused) {
            radioAudioElement.pause();
            radioAudioElement.currentTime = 0;
            audioElement.play().catch(err => console.error("Audio play error:", err));
        } else {
            audioElement.pause();
        }
    }
    updateSystemInfo();
    renderNowPlaying();
}

// ============================================================================
// RADIO FUNCTIONS
// ============================================================================

function playRadio() {
    try { synthRef && synthRef.cancel(); } catch (e) { }
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();
    audioElement.src = '';

    mode = "radio";
    currentSong = null;
    modeTimeRemaining = 7200;

    const currentStation = RADIO_STATIONS[currentStationIndex];
    // FIXED: Add timestamp to force fresh stream
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.load();
    radioAudioElement.play().catch(err => console.error("Radio autoplay blocked:", err));

    updateSystemInfo();
    updateTimerDisplay();
    renderNowPlaying();
    renderPlaylist();
}

function nextRadioStation() {
    playHistory.push({ type: 'radio', stationIndex: currentStationIndex });
    currentStationIndex = (currentStationIndex + 1) % RADIO_STATIONS.length;

    const wasPlaying = !radioAudioElement.paused;
    const currentStation = RADIO_STATIONS[currentStationIndex];

    radioAudioElement.pause();
    // FIXED: Add timestamp for fresh stream
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.load();

    if (wasPlaying) {
        radioAudioElement.play().catch(err => console.error("Radio play error:", err));
    }

    renderNowPlaying();
    updateSystemInfo();
}

function previousRadioStation() {
    if (playHistory.length === 0 || playHistory[playHistory.length - 1].type !== 'radio') {
        return;
    }

    const lastEntry = playHistory.pop();
    currentStationIndex = lastEntry.stationIndex;

    const wasPlaying = !radioAudioElement.paused;
    const currentStation = RADIO_STATIONS[currentStationIndex];

    radioAudioElement.pause();
    // FIXED: Add timestamp for fresh stream
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.load();

    if (wasPlaying) {
        radioAudioElement.play().catch(err => console.error("Radio play error:", err));
    }

    renderNowPlaying();
    updateSystemInfo();
}

// ============================================================================
// PLAYLIST FUNCTIONS
// ============================================================================

function playSong(idx, autoPlay = true) {
    if (idx < 0 || idx >= PLAYLIST.length) {
        console.error("Invalid song index:", idx);
        return;
    }

    const song = PLAYLIST[idx];

    // Check if requester name is missing or "Anonymous"
    if (!song.requester || song.requester === 'Anonymous' || song.requester.trim() === '') {
        showRequesterModal(idx, (confirmed) => {
            if (confirmed) {
                playSongWithAnnouncement(idx, autoPlay);
            }
        });
        return;
    }

    playSongWithAnnouncement(idx, autoPlay);
}

function playSongWithAnnouncement(idx, autoPlay = true) {
    try { synthRef && synthRef.cancel(); } catch (e) { }
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();

    if (currentSong) {
        playHistory.push({ type: 'song', songIndex: PLAYLIST.findIndex(s => s.id === currentSong.id) });
    }

    currentSong = PLAYLIST[idx];
    recentlyPlayedSongs.push({ id: currentSong.id, timestamp: Date.now() });

    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.timestamp > tenMinutesAgo);

    queue = PLAYLIST.filter(song => {
        return song.id !== currentSong.id &&
               !recentlyPlayedSongs.some(recent => recent.id === song.id);
    });

    renderNowPlaying();
    updateSystemInfo();

    pendingSongUrl = currentSong.url;
    isAnnouncementPlaying = true;

    audioElement.src = currentSong.url;
    try { audioElement.load(); } catch (e) { }

    speakAnnouncement(currentSong).then(() => {
        isAnnouncementPlaying = false;
        pendingSongUrl = null;

        if (autoPlay && audioElement.paused) {
            audioElement.play().catch(err => console.error("Audio play error:", err));
            renderNowPlaying();
        }
    });
}

function previousSong() {
    if (playHistory.length === 0 || playHistory[playHistory.length - 1].type !== 'song') {
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastPreviousClickTime;

    if (timeSinceLastClick < 500 || audioElement.currentTime < 3) {
        lastPreviousClickTime = 0;

        const lastEntry = playHistory.pop();
        const previousSongIndex = lastEntry.songIndex;

        if (previousSongIndex < 0 || previousSongIndex >= PLAYLIST.length) {
            return;
        }

        const tempHistory = playHistory.slice();
        stopAll();

        try { synthRef && synthRef.cancel(); } catch (e) { }
        isAnnouncementPlaying = false;
        pendingSongUrl = null;

        currentSong = PLAYLIST[previousSongIndex];
        recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.id !== currentSong.id);

        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.timestamp > tenMinutesAgo);

        queue = PLAYLIST.filter(song => {
            return song.id !== currentSong.id &&
                   !recentlyPlayedSongs.some(recent => recent.id === song.id);
        });

        playHistory = tempHistory;

        renderNowPlaying();
        updateSystemInfo();

        pendingSongUrl = null;
        isAnnouncementPlaying = true;
        audioElement.src = currentSong.url;
        try { audioElement.load(); } catch (e) { }

        speakAnnouncement(currentSong).then(() => {
            isAnnouncementPlaying = false;

            if (audioElement.paused) {
                audioElement.play().catch(err => console.error("Audio play error:", err));
                renderNowPlaying();
            }
        });
    } else {
        lastPreviousClickTime = currentTime;
        audioElement.currentTime = 0;
        if (audioElement.paused) {
            audioElement.play().catch(err => console.error("Audio play error:", err));
        }
    }
}

function playNextSong() {
    try { synthRef && synthRef.cancel(); } catch (e) { }
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();

    setTimeout(() => {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.timestamp > tenMinutesAgo);

        const availableSongs = PLAYLIST.filter(song => {
            return !recentlyPlayedSongs.some(recent => recent.id === song.id);
        });

        if (availableSongs.length > 0) {
            const nextSong = availableSongs[0];
            const nextSongIndex = PLAYLIST.indexOf(nextSong);
            if (nextSongIndex !== -1) {
                playSong(nextSongIndex);
            }
        } else if (PLAYLIST.length > 0) {
            recentlyPlayedSongs = [];
            playSong(0);
        }
    }, 100);
}

function speakAnnouncement(song) {
    return new Promise((resolve) => {
        if (!synthRef) { resolve(); return; }

        try { synthRef.cancel(); } catch (e) {}

        const dedicationMessages = [
            (song, person) => `This next song is dedicated to ${person}. Enjoy ${song.title} by ${song.artist}.`,
            (song, person) => `Here comes a track just for ${person}. ${song.title} by ${song.artist}.`,
            (song, person) => `Turn it up! ${person}, this one's for you. ${song.title} by ${song.artist}.`,
            (song, person) => `A special shoutout to ${person}. Let's play ${song.title} by ${song.artist}.`,
            (song, person) => `${person}, you're going to love this. ${song.title} by ${song.artist}.`
        ];

        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * dedicationMessages.length);
        } while (randomIndex === lastDedicationIndex && dedicationMessages.length > 1);

        lastDedicationIndex = randomIndex;
        const randomMessage = dedicationMessages[randomIndex];
        const text = randomMessage(song, song.requester);

        let utterance;
        try {
            utterance = new SpeechSynthesisUtterance(text);

            // Load voices (reload if not ready yet)
            let voices = window.speechSynthesis.getVoices();
            if (!voices.length) {
                window.speechSynthesis.onvoiceschanged = () => {
                    voices = window.speechSynthesis.getVoices();
                };
            }

            // 🎙️ Filter for adult, natural English voices — no kids, robots, or funny accents
            const preferredVoices = voices.filter(v =>
                v.lang.toLowerCase().startsWith("en") && // English voices only
                !/child|google_translate|f0|m0|f1|m1|f2|m2|demo|test/i.test(v.name) && // no child/test voices
                !/comic|robot|helium|chipmunk|silly|funny/i.test(v.name) && // no joke voices
                !/amit|bachchan/i.test(v.name) && // exclude any Amitabh Bachchan voices
                !/india|africa|ireland|scotland|wales|australia|nz/i.test(v.name) // avoid strong regional accents
            );

            // Fallback: use general English voices if filtered list is empty
            const fallbackVoices = voices.filter(v => v.lang.toLowerCase().startsWith("en"));

            const voiceList = preferredVoices.length ? preferredVoices : fallbackVoices;
            const chosenVoice = voiceList[Math.floor(Math.random() * voiceList.length)];

            // 🎚️ Adjust tone for smooth, adult sound
            utterance.voice = chosenVoice || voices[0];
            utterance.rate = 0.9;   // slightly slower = smoother
            utterance.pitch = 0.95; // a bit lower = mature tone
            utterance.volume = 1;

            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
        } catch (e) {
            console.warn("SpeechSynthesisUtterance creation failed:", e);
            resolve();
            return;
        }

        // Small delay to ensure Chrome doesn’t skip speech
        setTimeout(() => {
            try {
                synthRef.speak(utterance);
            } catch (e) {
                console.warn("speak failed", e);
                resolve();
            }
        }, 150);
    });
}


function switchToPlaylist() {
    if (isSwitchingMode) return;

    if (PLAYLIST.length === 0) {
        if (currentUser === 'Admin') {
            folderInput.click();
        } else {
            alert('No playlist available. Only the Admin can upload songs.');
        }
        return;
    }

    isSwitchingMode = true;

    try { synthRef && synthRef.cancel(); } catch (e) { }
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();
    radioAudioElement.src = '';

    mode = "playlist";
    modeTimeRemaining = 7200;

    const shuffled = shuffle(PLAYLIST);
    queue = shuffled.slice(1);

    updateSystemInfo();
    updateTimerDisplay();
    renderPlaylist();

    setTimeout(() => {
        playSong(PLAYLIST.indexOf(shuffled[0]));
        isSwitchingMode = false;
    }, 300);
}

function shufflePlaylist() {
    if (PLAYLIST.length === 0) {
        return;
    }

    PLAYLIST = shuffle(PLAYLIST);

    if (mode === "playlist") {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.timestamp > tenMinutesAgo);

        if (currentSong) {
            queue = PLAYLIST.filter(song => {
                return song.id !== currentSong.id &&
                    !recentlyPlayedSongs.some(recent => recent.id === song.id);
            });
        } else {
            queue = PLAYLIST.filter(song =>
                !recentlyPlayedSongs.some(recent => recent.id === song.id)
            );
        }
    }

    renderPlaylist();
    updateSystemInfo();

    shuffleBtn.textContent = "✓ Shuffled!";
    shuffleBtn.style.background = "#10b981";
    setTimeout(() => {
        shuffleBtn.textContent = "⇄ Shuffle";
        shuffleBtn.style.background = "";
    }, 1500);
}

// ============================================================================
// MODE SWITCHING
// ============================================================================

function switchMode() {
    if (isSwitchingMode) return;

    try { synthRef && synthRef.cancel(); } catch (e) { }
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();
    audioElement.src = '';
    radioAudioElement.src = '';

    playHistory = [];

    if (mode === "radio") {
        switchToPlaylist();
    } else {
        isSwitchingMode = true;
        playRadio();
        setTimeout(() => {
            isSwitchingMode = false;
        }, 300);
    }
}

function setTimerSpeed(speed) {
    speed = Math.max(1, Math.floor(Number(speed) || 1));
    timerSpeed = speed;
    updateSystemInfo();

    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.speed, 10) === speed) {
            btn.classList.add('active');
        }
    });
}

// ============================================================================
// FILE UPLOAD HANDLING (Admin ONLY)
// ============================================================================

function handleFolderSelection(event) {
    if (currentUser !== 'Admin') {
        alert('Only the Admin can upload songs.');
        return;
    }

    const files = Array.from(event.target.files || []).filter(f =>
        (f.type && f.type.startsWith("audio/")) ||
        /\.mp3$/i.test(f.name) ||
        /\.wav$/i.test(f.name) ||
        /\.ogg$/i.test(f.name) ||
        /\.m4a$/i.test(f.name) ||
        /\.flac$/i.test(f.name)
    );

    if (files.length === 0) {
        alert("No audio files found in the selected folder.");
        return;
    }

    // Revoke existing object URLs
    revokeAllObjectUrls();

    PLAYLIST = files.map((f, i) => {
        const name = f.name.replace(/\.[^/.]+$/, '');
        const parts = name.split(' - ');
        const url = URL.createObjectURL(f);
        createdObjectUrls.push(url);
        return {
            id: Date.now() + i,
            title: parts[0] || name,
            artist: parts[1] || 'Unknown Artist',
            requester: parts[2] || '',
            url,
            file: f.name
        };
    });

    renderPlaylist();
    updateSystemInfo();

    // Auto-switch to playlist mode
    if (PLAYLIST.length > 0 && mode === "radio") {
        stopAll();
        mode = "playlist";
        modeTimeRemaining = 7200;

        const shuffled = shuffle(PLAYLIST);
        queue = shuffled.slice(1);

        updateSystemInfo();
        updateTimerDisplay();
        renderPlaylist();

        setTimeout(() => {
            playSong(PLAYLIST.indexOf(shuffled[0]));
        }, 300);
    }

    // Reset file input
    event.target.value = '';
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Get themeToggle element
    themeToggle = getEl("themeToggle");
    
    // Login events
    AdminLoginBtn.addEventListener('click', showAdminLogin);
    userLoginBtn.addEventListener('click', loginAsUser);
    submitPasswordBtn.addEventListener('click', verifyAdminPassword);
    AdminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAdminPassword();
    });
    
    // Logout event
    logoutBtn.addEventListener('click', logout);
    
    // Upload event (Admin only)
    folderBtn.addEventListener('click', () => {
        if (currentUser === 'Admin') {
            folderInput.click();
        } else {
            alert('Only the Admin can upload songs.');
        }
    });
    
    folderInput.addEventListener('change', handleFolderSelection);
    
    // ============================================================================
    // THEME TOGGLE - DARK/LIGHT MODE WITH LOGO SWITCH
    // ============================================================================
    const body = document.body;
    const logoElement = document.querySelector('.logo');
    
    themeToggle.addEventListener('click', () => {
        body.classList.toggle("light");
        
        // Change icon and logo depending on mode
        if (body.classList.contains("light")) {
            // Light Mode
            themeToggle.textContent = "🌙";
            if (logoElement) logoElement.src = 'sng.png'; // white logo for light mode
        } else {
            // Dark Mode
            themeToggle.textContent = "☀️";
            if (logoElement) logoElement.src = 'sngw.png'; // normal logo for dark mode
        }
        
        // Add smooth transition effect
        body.style.transition = "background-color 0.7s ease, color 0.7s ease";
    });
    
    // Mode switch
    manualSwitchBtn.addEventListener('click', switchMode);
    
    // Shuffle
    shuffleBtn.addEventListener('click', shufflePlaylist);
    
    // Speed control
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => setTimerSpeed(parseInt(btn.dataset.speed, 10)));
    });
    
    // Audio events
    audioElement.addEventListener('ended', playNextSong);
    
    audioElement.addEventListener('error', (e) => {
        console.error("Audio playback error:", e);
        if (mode === "playlist") {
            playNextSong();
        }
    });
    
    radioAudioElement.addEventListener('error', (e) => {
        console.error("Radio stream error:", e);
    });
}

// ============================================================================
// TIMER COUNTDOWN
// ============================================================================

function startTimer() {
    setInterval(() => {
        if (isSwitchingMode) return;

        modeTimeRemaining -= timerSpeed;
        if (modeTimeRemaining <= 0) {
            modeTimeRemaining = 0;
            switchMode();
        }

        updateTimerDisplay();
    }, 1000);
}

// ============================================================================
// CLEANUP
// ============================================================================

window.addEventListener('beforeunload', () => {
    revokeAllObjectUrls();
    try { synthRef && synthRef.cancel(); } catch (e) { }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeApp() {
    renderNowPlaying();
    renderPlaylist();
    updateSystemInfo();
    updateTimerDisplay();
    playRadio();

    console.log("🎵 Shave & Gibson Radio initialized successfully!");
    console.log("👤 Logged in as:", currentUser === 'Admin' ? 'Admin' : 'Listener');
}

// ============================================================================
// START APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get themeToggle element and set dark mode as default
    themeToggle = getEl("themeToggle");
    const body = document.body;
    
    // Set dark mode as default (remove 'light' class)
    body.classList.remove('light');
    themeToggle.textContent = "☀️";
    
    // Set correct logo for dark mode (sng.png is the original logo for dark backgrounds)
    const logoElement = document.querySelector('.logo');
    if (logoElement) {
        logoElement.src = 'sngw.png';
    }
    
    setupEventListeners();
    startTimer();
    console.log("🎧 Shave & Gibson Radio loaded!");
});
