// ============================================================================
// STRICT MODE & IMMEDIATE INITIALIZATION
// ============================================================================

'use strict';

// ============================================================================
// USER AUTHENTICATION & CONFIGURATION
// ============================================================================

const CEO_PASSWORD = "admin123";
let currentUser = null;

// ============================================================================
// RADIO STATION CONFIGURATION
// ============================================================================

const RADIO_STATIONS = [
    { name: "ECR", fullName: "East Coast Radio", url: "https://edge.iono.fm/xice/ecr_live_medium.aac" },
    { name: "LM Radio", fullName: "LM Radio", url: "https://ukwesta.streaming.broadcast.radio/lmradio" },
    { name: "ECR Gold", fullName: "East Coast Gold", url: "https://live.ecr.co.za/ecrgoldhigh.mp3" }
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
let forwardHistory = [];
let isSwitchingMode = false;
let isAnnouncementPlaying = false;
let pendingSongUrl = null;
let lastDedicationIndex = -1;
let lastPreviousClickTime = 0;
let recentlyPlayedSongs = [];
let createdObjectUrls = [];
let isMuted = false;
let lastVolume = 0.7;
let voiceAnnouncementsEnabled = true;
let timerInterval;
let folderInput;
let audioElement;
let radioAudioElement;
let synthRef = null;

// ============================================================================
// DOM ELEMENTS CACHE
// ============================================================================

const DOM = {};

// ============================================================================
// OPTIMIZED UTILITY FUNCTIONS
// ============================================================================

const formatTime = (seconds) => {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const stopAll = () => {
    try {
        audioElement.pause();
        radioAudioElement.pause();
        audioElement.currentTime = 0;
        radioAudioElement.currentTime = 0;
    } catch (e) {
        console.warn("stopAll failed", e);
    }
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const revokeAllObjectUrls = () => {
    createdObjectUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) {}
    });
    createdObjectUrls = [];
};

// ============================================================================
// INITIALIZATION - OPTIMIZED FOR FAST LOADING
// ============================================================================

function cacheDOM() {
    const ids = [
        'loginScreen', 'mainApp', 'ceoLoginBtn', 'userLoginBtn', 
        'passwordSection', 'ceoPassword', 'submitPasswordBtn', 'errorMessage',
        'userBadge', 'logoutBtn', 'uploadSection', 'folderBtn',
        'nowPlayingContainer', 'playlist-list', 'manualSwitchBtn', 
        'shuffleBtn', 'timerDisplay', 'modeProgressFill', 'modeIcon',
        'modeTitle', 'modeDisplay', 'songsLoaded', 'playbackStatus',
        'queueLength', 'timerSpeed', 'themeToggle'
    ];
    
    ids.forEach(id => {
        const key = id.replace(/-/g, '');
        DOM[key] = document.getElementById(id);
    });
}

function createFolderInput() {
    folderInput = document.createElement("input");
    folderInput.type = "file";
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
    folderInput.setAttribute("multiple", "");
    folderInput.accept = "audio/*";
    folderInput.style.display = "none";
    document.body.appendChild(folderInput);
}

function initAudio() {
    audioElement = new Audio();
    radioAudioElement = new Audio();
    audioElement.volume = lastVolume;
    radioAudioElement.volume = lastVolume;
    audioElement.preload = 'metadata';
    radioAudioElement.preload = 'metadata';
    
    if (window.speechSynthesis) {
        synthRef = window.speechSynthesis;
    }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

function showCEOLogin() {
    DOM.passwordSection.classList.add('show');
    DOM.ceoPassword.focus();
}

function verifyCEOPassword() {
    const password = DOM.ceoPassword.value;
    if (password === CEO_PASSWORD) {
        currentUser = 'ceo';
        showMainApp();
    } else {
        DOM.errorMessage.classList.add('show');
        DOM.ceoPassword.value = '';
        setTimeout(() => DOM.errorMessage.classList.remove('show'), 3000);
    }
}

function loginAsUser() {
    currentUser = 'user';
    showMainApp();
}

function showMainApp() {
    DOM.loginScreen.style.display = 'none';
    DOM.mainApp.classList.add('show');
    
    if (currentUser === 'ceo') {
        DOM.userBadge.textContent = '👑 ADMIN';
        DOM.userBadge.classList.add('ceo');
        DOM.uploadSection.style.display = 'block';
    } else {
        DOM.userBadge.textContent = '👤 Listener';
        DOM.userBadge.classList.remove('ceo');
        DOM.uploadSection.style.display = 'none';
    }
    
    requestAnimationFrame(() => initializeApp());
}

function logout() {
    currentUser = null;
    DOM.mainApp.classList.remove('show');
    DOM.loginScreen.style.display = 'flex';
    DOM.passwordSection.classList.remove('show');
    DOM.ceoPassword.value = '';
    stopAll();
    mode = 'radio';
    modeTimeRemaining = 7200;
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

function toggleVoiceAnnouncements() {
    voiceAnnouncementsEnabled = !voiceAnnouncementsEnabled;
    
    if (!voiceAnnouncementsEnabled) {
        try { 
            if (synthRef) synthRef.cancel(); 
        } catch (e) {}
        isAnnouncementPlaying = false;
        
        if (pendingSongUrl && audioElement.src === pendingSongUrl) {
            audioElement.play().catch(err => console.error("Audio play error:", err));
        }
    }
    
    renderNowPlaying();
}

window.toggleVoiceAnnouncements = toggleVoiceAnnouncements;

function setVolume(value) {
    let vol = Math.max(0, Math.min(100, parseFloat(value) || 70)) / 100;
    
    if (vol > 0 && isMuted) {
        isMuted = false;
    }
    
    lastVolume = vol;
    audioElement.volume = vol;
    radioAudioElement.volume = vol;
    renderNowPlaying();
}

window.toggleMute = toggleMute;
window.setVolume = setVolume;

// ============================================================================
// OPTIMIZED UI UPDATE FUNCTIONS - USE RAF FOR SMOOTH UPDATES
// ============================================================================

let updateScheduled = false;

function scheduleUpdate(fn) {
    if (!updateScheduled) {
        updateScheduled = true;
        requestAnimationFrame(() => {
            fn();
            updateScheduled = false;
        });
    }
}

function updateTimerDisplay() {
    DOM.timerDisplay.textContent = formatTime(modeTimeRemaining);

    const progressPercent = Math.min(100, Math.max(0, ((7200 - modeTimeRemaining) / 7200) * 100));
    DOM.modeProgressFill.style.width = progressPercent + '%';
    
    const progressBar = DOM.modeProgressFill.parentElement;
    if (progressBar) {
        progressBar.setAttribute('aria-valuenow', Math.round(progressPercent));
    }

    if (mode === "radio") {
        DOM.modeIcon.textContent = '📻';
        DOM.modeTitle.textContent = 'LIVE RADIO';
        DOM.modeTitle.style.color = '#FF0000';
        DOM.modeIcon.style.color = '#FF0000';
        DOM.modeProgressFill.style.background = '#FF0000';
        DOM.modeTitle.className = 'live-radio-animation';
        DOM.modeIcon.className = 'live-radio-animation';
        DOM.manualSwitchBtn.textContent = '▶▶ Switch to Playlist';
    } else {
        DOM.modeIcon.textContent = '🎵';
        DOM.modeTitle.textContent = 'PLAYLIST MODE';
        DOM.modeTitle.style.color = '#0cf1fb';
        DOM.modeIcon.style.color = '#0cf1fb';
        DOM.modeProgressFill.style.background = '#0cf1fb';
        DOM.modeTitle.className = 'playlist-animation';
        DOM.modeIcon.className = 'playlist-animation';
        DOM.manualSwitchBtn.textContent = '▶▶ Switch to Radio';
    }
}

function updateThemeColors() {
    const root = document.documentElement;
    if (mode === 'radio') {
        root.style.setProperty('--accent-color', '#FF0000');
        root.style.setProperty('--accent-hover', '#ff4d4d');
        root.style.setProperty('--accent-rgb', '255, 0, 0');
    } else {
        root.style.setProperty('--accent-color', '#0cf1fb');
        root.style.setProperty('--accent-hover', '#4dfaff');
        root.style.setProperty('--accent-rgb', '12, 241, 251');
    }
}

function renderNowPlaying() {
    scheduleUpdate(() => {
        const currentVolume = (mode === "radio") ? radioAudioElement.volume : audioElement.volume;
        const muteIcon = isMuted ? '🔇' : '🔊';
        const muteClass = isMuted ? 'muted' : '';
        let html = "";

        if (mode === "radio") {
            const currentStation = RADIO_STATIONS[currentStationIndex] || { fullName: 'Unknown' };
            const canGoBack = playHistory.length > 0 && playHistory[playHistory.length - 1].type === 'radio';

            html = `
                <div style="padding: clamp(15px, 4vw, 25px);">
                    <div style="font-size: clamp(2rem, 6vw, 3rem); margin-bottom: 15px;" role="img" aria-label="Radio">📻</div>
                    <p style="font-size: clamp(1.1rem, 3vw, 1.3rem); font-weight: 900; color: #0cf1fb; text-shadow: -3px 2px 3px #000; margin-bottom: 4px;">
                        ${escapeHtml(currentStation.fullName)}
                    </p>
                    <p style="color: #ffff; text-shadow: 0 0 4px rgba(0, 0, 0, 0.4); margin-bottom: 15px; font-size: clamp(0.7rem, 2vw, 0.75rem);">
                        Live Radio Stream • 2-hour broadcast
                    </p>
                    <div style="display: flex; justify-content: center; gap: 10px; align-items: center; margin-top: 15px; flex-wrap: wrap;">
                        <button onclick="previousRadioStation()" aria-label="Previous Radio Station" style="padding: clamp(8px, 2vw, 10px) clamp(20px, 4vw, 25px); font-size: clamp(0.75rem, 2vw, 0.8rem); font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s; ${!canGoBack ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${!canGoBack ? 'disabled' : ''}>◀◀</button>
                        <button onclick="togglePlayPause()" aria-label="${radioAudioElement.paused ? 'Play' : 'Pause'}" style="padding: clamp(8px, 2vw, 10px) clamp(20px, 4vw, 25px); font-size: clamp(0.75rem, 2vw, 0.8rem); font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s;">${radioAudioElement.paused ? '▶' : '▌▌'}</button>
                        <button onclick="nextRadioStation()" aria-label="Next Radio Station" style="padding: clamp(8px, 2vw, 10px) clamp(20px, 4vw, 25px); font-size: clamp(0.75rem, 2vw, 0.8rem); font-weight: 700; border: none; border-radius: 12px; cursor: pointer; background: #008996; color: white; transition: all 0.2s;">▶▶</button>
                    </div>
                    <div class="volume-control" style="margin-top: 20px;">
                        <button onclick="toggleMute()" class="mute-btn ${muteClass}" aria-label="${isMuted ? 'Unmute' : 'Mute'}">${muteIcon}</button>
                        <input type="range" class="volume-slider" min="0" max="100" value="${Math.round((isMuted ? lastVolume : currentVolume)*100)}" oninput="setVolume(this.value)" aria-label="Volume control">
                        <span class="volume-value" aria-live="polite">${Math.round((isMuted ? lastVolume : currentVolume)*100)}%</span>
                    </div>
                    <div style="margin-top: 18px; padding: 12px; background: rgba(0, 174, 239, 0.1); border-radius: 8px; border: 1px solid rgba(0, 174, 239, 0.3);">
                        <p style="color: #fff; text-shadow: 0 0 4px rgba(0, 0, 0, 0.4); font-size: clamp(0.65rem, 1.8vw, 0.7rem); margin: 0;">Available Stations:</p>
                        <p style="color: #0cf1fb; text-shadow: -3px 2px 3px #000000; font-weight: 700; margin: 4px 0 0 0; font-size: clamp(0.75rem, 2vw, 0.8rem);">
                            ${RADIO_STATIONS.map(s => escapeHtml(s.name)).join(' • ')}
                        </p>
                    </div>
                </div>`;
        } else if (currentSong) {
            const canGoBack = playHistory.length > 0 && playHistory[playHistory.length - 1].type === 'song';

            html = `
                <div class="song-display">
                    <div class="now-playing-badge">🔥 NOW PLAYING</div>
                    <div style="font-size: clamp(2rem, 5vw, 2.5rem); margin-bottom: 10px;" role="img" aria-label="Music">🎵</div>
                    <h4 style="font-size: clamp(1rem, 3vw, 1.2rem); margin: 8px 0; font-weight: 900;">
                        ${escapeHtml(currentSong.title)}
                    </h4>
                    <p style="font-size: clamp(0.85rem, 2.5vw, 0.9rem); color: #ffffff; text-shadow: 0 0 4px rgba(0, 0, 0, 0.4); margin: 4px 0;">
                        by ${escapeHtml(currentSong.artist)}
                    </p>
                    <p style="margin-top: 10px; color: #10dee9ff; font-size: clamp(0.75rem, 2vw, 0.8rem);">
                        👤 Requested by: <strong>${escapeHtml(currentSong.requester)}</strong>
                    </p>
                </div>
                <div class="controls" style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:15px;">
                    <button onclick="previousSong()" class="btn-circle" aria-label="Previous Song" style="
                        background:${canGoBack ? '#008996' : 'linear-gradient(135deg,#6b7280,#4b5563)'};
                        cursor:${canGoBack ? 'pointer' : 'not-allowed'};
                        ${!canGoBack ? 'opacity:0.6;' : ''}
                    " ${!canGoBack ? 'disabled' : ''}>◀◀</button>
                    <button onclick="togglePlayPause()" class="btn-circle" aria-label="${audioElement.paused ? 'Play' : 'Pause'}">${audioElement.paused ? '▶' : '<span style="display:inline-block;position:relative;width:14px;height:18px;"><span style="position:absolute;top:0;left:0;width:5px;height:100%;background:white;border-radius:1px;"></span><span style="position:absolute;top:0;right:0;width:5px;height:100%;background:white;border-radius:1px;"></span></span>'}</button>
                    <button onclick="playNextSong()" class="btn-circle" aria-label="Next Song">▶▶</button>
                </div>
                <div class="volume-control" style="margin-top: 20px;">
                    <button onclick="toggleMute()" class="mute-btn ${muteClass}" aria-label="${isMuted ? 'Unmute' : 'Mute'}">${muteIcon}</button>
                    <input type="range" class="volume-slider" min="0" max="100" value="${Math.round((isMuted ? lastVolume : currentVolume)*100)}" oninput="setVolume(this.value)" aria-label="Volume control">
                    <span class="volume-value" aria-live="polite">${Math.round((isMuted ? lastVolume : currentVolume)*100)}%</span>
                </div>
                <div class="voice-toggle-container">
                    <span class="voice-toggle-label">🎙️ Voice Announcements:</span>
                    <button onclick="toggleVoiceAnnouncements()" class="voice-toggle-btn ${voiceAnnouncementsEnabled ? 'on' : 'off'}" aria-label="Toggle voice announcements">
                        ${voiceAnnouncementsEnabled ? '🔊 ON' : '🔇 OFF'}
                    </button>
                </div>
                <div style="text-align: center; margin-top: 10px; color: #fff; text-shadow: 0 0 4px rgba(0, 0, 0, 0.4); font-size: clamp(0.7rem, 2vw, 0.75rem);">
                    📁 ${escapeHtml(currentSong.file)}
                </div>`;
        } else {
            html = `
                <div style="text-align: center; padding: clamp(30px, 7vw, 40px) 15px; color: #fff; text-shadow: 0 0 4px rgba(0, 0, 0, 0.4);">
                    <div style="font-size: clamp(2rem, 5vw, 2.5rem);" role="img" aria-label="Music">🎵</div>
                    <p style="font-size: clamp(0.8rem, 2.5vw, 0.85rem);">
                        ${PLAYLIST.length === 0 ? 'No playlist loaded' : 'Loading song...'}
                    </p>
                </div>`;
        }

        DOM.nowPlayingContainer.innerHTML = html;
    });
}

function renderPlaylist() {
    scheduleUpdate(() => {
        DOM.playlistlist.innerHTML = "";

        if (PLAYLIST.length === 0) {
            DOM.playlistlist.innerHTML = '<li style="text-align: center; color: #ffffff; text-shadow: 0px -1px 9px #000000; padding: 15px; font-size: clamp(0.75rem, 2vw, 0.8rem);">No songs loaded yet</li>';
        } else {
            const fragment = document.createDocumentFragment();
            PLAYLIST.forEach((song) => {
                const li = document.createElement("li");
                li.textContent = `${song.artist} - ${song.title} (${song.requester})`;
                li.setAttribute('role', 'listitem');
                fragment.appendChild(li);
            });
            DOM.playlistlist.appendChild(fragment);
        }

        DOM.songsLoaded.textContent = `${PLAYLIST.length} track${PLAYLIST.length !== 1 ? 's' : ''}`;
        DOM.queueLength.textContent = `${queue.length} track${queue.length !== 1 ? 's' : ''}`;
    });
}

function updateSystemInfo() {
    DOM.modeDisplay.textContent = (mode === "radio")
        ? `Live Radio - ${RADIO_STATIONS[currentStationIndex]?.name || 'Unknown'}`
        : "Playlist Mode";

    const isPlaying = (mode === "radio") ? !radioAudioElement.paused : !audioElement.paused;
    DOM.playbackStatus.textContent = isPlaying ? "Playing" : "Paused";

    DOM.queueLength.textContent = `${queue.length} track${queue.length !== 1 ? 's' : ''}`;
    DOM.timerSpeed.textContent = timerSpeed + 'x';
}

// ============================================================================
// PLAYBACK CONTROL FUNCTIONS
// ============================================================================

function togglePlayPause() {
    if (mode === "radio") {
        if (radioAudioElement.paused) {
            audioElement.pause();
            audioElement.currentTime = 0;
            
            const currentStation = RADIO_STATIONS[currentStationIndex];
            radioAudioElement.src = currentStation.url + '?t=' + Date.now();
            radioAudioElement.load();
            radioAudioElement.play().catch(err => console.error("Radio play error:", err));
        } else {
            radioAudioElement.pause();
        }
    } else {
        if (isAnnouncementPlaying && audioElement.paused) {
            try { 
                if (synthRef) synthRef.cancel(); 
            } catch (e) {}
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

window.togglePlayPause = togglePlayPause;

// ============================================================================
// RADIO FUNCTIONS
// ============================================================================

function playRadio() {
    try { 
        if (synthRef) synthRef.cancel(); 
    } catch (e) {}
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();
    audioElement.src = '';

    mode = "radio";
    currentSong = null;
    modeTimeRemaining = 7200;

    const currentStation = RADIO_STATIONS[currentStationIndex];
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.load();
    radioAudioElement.play().catch(err => console.error("Radio autoplay blocked:", err));

    updateSystemInfo();
    updateTimerDisplay();
    updateThemeColors();
    renderNowPlaying();
    renderPlaylist();
}

function nextRadioStation() {
    playHistory.push({ type: 'radio', stationIndex: currentStationIndex });
    currentStationIndex = (currentStationIndex + 1) % RADIO_STATIONS.length;

    const wasPlaying = !radioAudioElement.paused;
    const currentStation = RADIO_STATIONS[currentStationIndex];

    radioAudioElement.pause();
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
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.load();

    if (wasPlaying) {
        radioAudioElement.play().catch(err => console.error("Radio play error:", err));
    }

    renderNowPlaying();
    updateSystemInfo();
}

window.nextRadioStation = nextRadioStation;
window.previousRadioStation = previousRadioStation;

// ============================================================================
// PLAYLIST FUNCTIONS
// ============================================================================

function showRequesterModal(songIndex, callback) {
    const modal = document.createElement('div');
    modal.className = 'requester-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:10000;animation:fadeIn 0.3s;padding:20px;`;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `background:${document.body.classList.contains('dark') ? '#2a2a2a' : '#fff'};padding:clamp(20px,5vw,30px);border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,0.5);max-width:400px;width:100%;text-align:center;animation:fadeInUp 0.5s;`;

    const song = PLAYLIST[songIndex];
    
    modalContent.innerHTML = `
        <h2 style="color:#008996;margin-bottom:15px;font-size:clamp(1.2rem,4vw,1.5rem);">🎵 Who Requested This Song?</h2>
        <p style="color:${document.body.classList.contains('dark') ? '#ffffff' : '#333'};margin-bottom:10px;font-size:clamp(0.8rem,2.5vw,0.9rem);">
            <strong>${escapeHtml(song.title)}</strong> by ${escapeHtml(song.artist)}
        </p>
        <input type="text" id="requesterInput" placeholder="Enter requester's name" aria-label="Requester name" style="width:100%;padding:12px 15px;border-radius:10px;border:2px solid #008996;outline:none;background:${document.body.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.9)'};color:${document.body.classList.contains('dark') ? '#f5f5f5' : '#222'};margin:15px 0;font-size:clamp(0.9rem,2.5vw,1rem);">
        <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
            <button id="modalSubmit" aria-label="Confirm requester name" style="padding:10px 25px;background:linear-gradient(135deg,#008996,#00aeef);color:white;border:none;border-radius:10px;cursor:pointer;font-size:clamp(0.85rem,2.5vw,0.95rem);font-weight:700;transition:all 0.3s;">✓ Confirm</button>
            <button id="modalCancel" aria-label="Cancel" style="padding:10px 25px;background:#6b7280;color:white;border:none;border-radius:10px;cursor:pointer;font-size:clamp(0.85rem,2.5vw,0.95rem);font-weight:700;transition:all 0.3s;">✕ Cancel</button>
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    const input = document.getElementById('requesterInput');
    const submitBtn = document.getElementById('modalSubmit');
    const cancelBtn = document.getElementById('modalCancel');

    setTimeout(() => input.focus(), 100);

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.3s';
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
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
        if (e.key === 'Enter') submitBtn.click();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            callback(false);
            closeModal();
        }
    });
}

function playSong(idx, autoPlay = true) {
    if (idx < 0 || idx >= PLAYLIST.length) return;

    const song = PLAYLIST[idx];

    if (!song.requester || song.requester === 'Anonymous' || song.requester.trim() === '') {
        showRequesterModal(idx, (confirmed) => {
            if (confirmed) playSongWithAnnouncement(idx, autoPlay);
        });
        return;
    }

    playSongWithAnnouncement(idx, autoPlay);
}

function playSongWithAnnouncement(idx, autoPlay = true) {
    try { 
        if (synthRef) synthRef.cancel(); 
    } catch (e) {}
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();

    if (currentSong) {
        playHistory.push({ type: 'song', songIndex: PLAYLIST.findIndex(s => s.id === currentSong.id) });
        forwardHistory = [];
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
    try { audioElement.load(); } catch (e) {}

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
    if (playHistory.length === 0 || playHistory[playHistory.length - 1].type !== 'song') return;

    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastPreviousClickTime;

    if (timeSinceLastClick < 500 || audioElement.currentTime < 3) {
        lastPreviousClickTime = 0;
        
        const currentSongIndex = PLAYLIST.findIndex(s => s.id === currentSong.id);
        if (currentSongIndex >= 0) {
            forwardHistory.push({ type: 'song', songIndex: currentSongIndex });
        }
        
        const lastEntry = playHistory.pop();
        const previousSongIndex = lastEntry.songIndex;

        if (previousSongIndex < 0 || previousSongIndex >= PLAYLIST.length) return;

        try { 
            if (synthRef) synthRef.cancel(); 
        } catch (e) {}
        stopAll();
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

        renderNowPlaying();
        updateSystemInfo();

        audioElement.src = currentSong.url;
        try { audioElement.load(); } catch (e) {}
        audioElement.play().then(() => {
            renderNowPlaying();
            updateSystemInfo();
        }).catch(err => {
            console.error("Audio play error:", err);
            renderNowPlaying();
        });
    } else {
        lastPreviousClickTime = currentTime;
        audioElement.currentTime = 0;
        if (audioElement.paused) {
            audioElement.play().catch(err => console.error("Play on rewind failed", err));
        }
    }
}

function playNextSong() {
    try { 
        if (synthRef) synthRef.cancel(); 
    } catch (e) {}
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();

    setTimeout(() => {
        if (forwardHistory.length > 0) {
            const forwardEntry = forwardHistory.pop();
            const forwardSongIndex = forwardEntry.songIndex;
            
            if (forwardSongIndex >= 0 && forwardSongIndex < PLAYLIST.length) {
                const currentSongIndex = PLAYLIST.findIndex(s => s.id === currentSong.id);
                if (currentSongIndex >= 0) {
                    playHistory.push({ type: 'song', songIndex: currentSongIndex });
                }
                
                currentSong = PLAYLIST[forwardSongIndex];
                
                renderNowPlaying();
                updateSystemInfo();
                
                audioElement.src = currentSong.url;
                try { audioElement.load(); } catch (e) {}
                audioElement.play().then(() => {
                    renderNowPlaying();
                    updateSystemInfo();
                }).catch(err => {
                    console.error("Audio play error:", err);
                    renderNowPlaying();
                });
                
                return;
            }
        }
        
        forwardHistory = [];
        
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        recentlyPlayedSongs = recentlyPlayedSongs.filter(song => song.timestamp > tenMinutesAgo);

        const currentSongIndex = currentSong ? PLAYLIST.findIndex(s => s.id === currentSong.id) : -1;
        
        let nextSongIndex = -1;
        for (let i = currentSongIndex + 1; i < PLAYLIST.length; i++) {
            const song = PLAYLIST[i];
            if (!recentlyPlayedSongs.some(recent => recent.id === song.id)) {
                nextSongIndex = i;
                break;
            }
        }
        
        if (nextSongIndex === -1) {
            for (let i = 0; i < PLAYLIST.length; i++) {
                const song = PLAYLIST[i];
                if (!recentlyPlayedSongs.some(recent => recent.id === song.id)) {
                    nextSongIndex = i;
                    break;
                }
            }
        }
        
        if (nextSongIndex === -1 && PLAYLIST.length > 0) {
            recentlyPlayedSongs = [];
            nextSongIndex = (currentSongIndex + 1) % PLAYLIST.length;
        }
        
        if (nextSongIndex !== -1) playSong(nextSongIndex);
    }, 100);
}

window.previousSong = previousSong;
window.playNextSong = playNextSong;

function speakAnnouncement(song) {
    return new Promise((resolve) => {
        if (!voiceAnnouncementsEnabled || !synthRef) {
            resolve();
            return;
        }

        try { synthRef.cancel(); } catch (e) {}

        const dedicationMessages = [
            (song, person) => `This next song is dedicated to ${person}. Enjoy ${song.title} by ${song.artist}.`,
            (song, person) => `Here comes a track just for ${person}. ${song.title} by ${song.artist}.`,
            (song, person) => `Turn it up! ${person}, this one's for you. ${song.title} by ${song.artist}.`,
            (song, person) => `A special shout-out to ${person}. Let's play ${song.title} by ${song.artist}.`,
            (song, person) => `${person}, you're going to love this. ${song.title} by ${song.artist}.`
        ];

        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * dedicationMessages.length);
        } while (randomIndex === lastDedicationIndex && dedicationMessages.length > 1);
        lastDedicationIndex = randomIndex;

        const text = dedicationMessages[randomIndex](song, song.requester);

        try {
            const utterance = new SpeechSynthesisUtterance(text);
            let voices = window.speechSynthesis.getVoices();
            
            const voiceBank = {
                chrome: { female: ["Google UK English Female", "Samantha"], male: ["Google UK English Male", "Microsoft David Desktop"] },
                edge: { female: ["Microsoft Zira Desktop", "Microsoft Aria Online"], male: ["Microsoft Guy Online", "Microsoft David Desktop"] },
                safari: { female: ["Samantha", "Victoria"], male: ["Alex", "Fred"] },
                firefox: { female: ["Samantha", "Google UK English Female"], male: ["Google UK English Male", "Microsoft David Desktop"] },
                default: { female: ["Samantha", "Google UK English Female"], male: ["Google UK English Male", "Microsoft David Desktop"] }
            };

            const ua = navigator.userAgent.toLowerCase();
            let browser = "default";
            if (ua.includes("chrome") && !ua.includes("edg")) browser = "chrome";
            else if (ua.includes("edg")) browser = "edge";
            else if (ua.includes("safari") && !ua.includes("chrome")) browser = "safari";
            else if (ua.includes("firefox")) browser = "firefox";

            const gender = Math.random() < 0.5 ? "female" : "male";
            const preferredList = voiceBank[browser][gender];
            let chosenVoice = null;
            
            for (const name of preferredList) {
                chosenVoice = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
                if (chosenVoice) break;
            }

            if (!chosenVoice && voices.length > 0) {
                chosenVoice = voices[0];
            }

            utterance.voice = chosenVoice;
            utterance.rate = 0.9;
            utterance.pitch = 0.95;
            utterance.volume = 1;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();

            setTimeout(() => {
                try {
                    synthRef.speak(utterance);
                } catch (e) {
                    resolve();
                }
            }, 150);
        } catch (e) {
            resolve();
        }
    });
}

// ============================================================================
// SWITCH MODE FUNCTION
// ============================================================================

function switchMode() {
    if (mode === "radio") {
        switchToPlaylist(true);
    } else {
        playRadio();
    }
}

window.switchMode = switchMode;

function switchToPlaylist(triggeredByUser = false) {
    if (isSwitchingMode) return;

    if (PLAYLIST.length === 0) {
        if (currentUser === 'ceo' && triggeredByUser) {
            folderInput.click();
        } else if (triggeredByUser) {
            alert('No playlist available. Only the admin can upload songs.');
        }
        return;
    }

    isSwitchingMode = true;

    try { 
        if (synthRef) synthRef.cancel(); 
    } catch (e) {}
    isAnnouncementPlaying = false;
    pendingSongUrl = null;
    stopAll();
    radioAudioElement.src = '';

    mode = "playlist";
    modeTimeRemaining = 7200;

    const shuffled = fairShufflePlaylistWithCooldown(PLAYLIST, recentlyPlayedSongs, 10 * 60 * 1000);
    PLAYLIST = shuffled;
    queue = shuffled.slice(1);

    updateSystemInfo();
    updateTimerDisplay();
    updateThemeColors();
    renderPlaylist();

    setTimeout(() => {
        playSong(PLAYLIST.indexOf(shuffled[0]));
        isSwitchingMode = false;
    }, 300);
}

function fairShufflePlaylistWithCooldown(playlist, recentlyPlayed, cooldownMs = 10 * 60 * 1000) {
    if (!playlist || !playlist.length) return [];

    const now = Date.now();
    const requesterMap = {};

    playlist.forEach(song => {
        if (!requesterMap[song.requester]) requesterMap[song.requester] = [];
        requesterMap[song.requester].push(song);
    });

    const shuffledPlaylist = [];
    let added;

    do {
        added = false;
        for (const requester in requesterMap) {
            if (!requesterMap[requester].length) continue;

            const lastPlayed = recentlyPlayed
                .filter(s => s.requester === requester)
                .map(s => s.timestamp)
                .sort((a, b) => b - a)[0];

            if (lastPlayed && now - lastPlayed < cooldownMs) continue;

            const index = Math.floor(Math.random() * requesterMap[requester].length);
            const song = requesterMap[requester].splice(index, 1)[0];
            shuffledPlaylist.push(song);
            added = true;
        }
    } while (added);

    for (const requester in requesterMap) {
        shuffledPlaylist.push(...requesterMap[requester]);
    }

    return shuffledPlaylist;
}

function shufflePlaylist() {
    if (!PLAYLIST || PLAYLIST.length === 0) {
        alert("No songs to shuffle!");
        return;
    }

    const currentSrc = audioElement?.src || "";
    const currentIndex = PLAYLIST.findIndex(song => song.url === currentSrc);
    const currentSongTemp = currentIndex >= 0 ? PLAYLIST[currentIndex] : null;

    let songsToShuffle = PLAYLIST.slice();
    if (currentSongTemp) {
        songsToShuffle.splice(currentIndex, 1);
    }

    const shuffled = fairShufflePlaylistWithCooldown(
        songsToShuffle,
        recentlyPlayedSongs || [],
        10 * 60 * 1000
    );

    PLAYLIST = currentSongTemp ? [currentSongTemp, ...shuffled] : shuffled;
    queue = PLAYLIST.slice(1);

    renderPlaylist();
    updateSystemInfo();

    const shuffleBtnEl = DOM.shuffleBtn;
    if (shuffleBtnEl) {
        shuffleBtnEl.textContent = "✓ Shuffled!";
        shuffleBtnEl.style.background = "#10b981";
        shuffleBtnEl.disabled = true;
        setTimeout(() => {
            shuffleBtnEl.textContent = "⇄ Shuffle";
            shuffleBtnEl.style.background = "";
            shuffleBtnEl.disabled = false;
        }, 1500);
    }
}

window.shufflePlaylist = shufflePlaylist;

// ============================================================================
// FILE UPLOAD HANDLING
// ============================================================================

function handleFolderSelection(event) {
    if (currentUser !== 'ceo') {
        alert('Only the Admin can upload songs.');
        return;
    }

    const files = Array.from(event.target.files || []).filter(f =>
        (f.type && f.type.startsWith("audio/")) ||
        /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)
    );

    if (files.length === 0) {
        alert("No audio files found in the selected folder.");
        return;
    }

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

    const shuffled = fairShufflePlaylistWithCooldown(PLAYLIST, recentlyPlayedSongs, 10 * 60 * 1000);
    PLAYLIST = shuffled;
    queue = shuffled.slice(1);

    renderPlaylist();
    updateSystemInfo();

    if (PLAYLIST.length > 0 && mode === "radio") {
        stopAll();
        mode = "playlist";
        modeTimeRemaining = 7200;

        updateSystemInfo();
        updateTimerDisplay();
        updateThemeColors();

        setTimeout(() => playSong(PLAYLIST.indexOf(shuffled[0])), 300);
    }

    event.target.value = '';
}

function setTimerSpeed(speed) {
    timerSpeed = speed;
    updateSystemInfo();
    
    document.querySelectorAll('.speed-btn').forEach(btn => {
        if (parseInt(btn.dataset.speed, 10) === speed) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

window.setTimerSpeed = setTimerSpeed;

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    DOM.ceoLoginBtn.addEventListener('click', showCEOLogin);
    DOM.userLoginBtn.addEventListener('click', loginAsUser);
    DOM.submitPasswordBtn.addEventListener('click', verifyCEOPassword);
    DOM.ceoPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyCEOPassword();
    });
    
    DOM.logoutBtn.addEventListener('click', logout);
    
    DOM.folderBtn.addEventListener('click', () => {
        if (currentUser === 'ceo') {
            folderInput.click();
        } else {
            alert('Only the Admin can upload songs.');
        }
    });
    
    folderInput.addEventListener('change', handleFolderSelection);
    
    const body = document.body;
    const logoElement = document.querySelector('.logo');
    
    DOM.themeToggle.addEventListener("click", () => {
        body.classList.toggle("dark");
        
        if (body.classList.contains("dark")) {
            DOM.themeToggle.textContent = "☀️";
            DOM.themeToggle.setAttribute('aria-label', 'Switch to light mode');
            if (logoElement) logoElement.src = 'Images/sngW.png';
        } else {
            DOM.themeToggle.textContent = "🌙";
            DOM.themeToggle.setAttribute('aria-label', 'Switch to dark mode');
            if (logoElement) logoElement.src = 'Images/sngW.png';
        }
    });
    
    DOM.manualSwitchBtn.addEventListener('click', switchMode);
    
    if (DOM.shuffleBtn) {
        DOM.shuffleBtn.addEventListener("click", shufflePlaylist);
    }
    
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => setTimerSpeed(parseInt(btn.dataset.speed, 10)));
    });
    
    audioElement.addEventListener('ended', playNextSong);
    audioElement.addEventListener('error', (e) => {
        console.error("Audio error:", e);
        if (mode === "playlist") playNextSong();
    });
    
    radioAudioElement.addEventListener('error', (e) => {
        console.error("Radio error:", e);
    });
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && mode === 'radio' && radioAudioElement.paused) {
            radioAudioElement.play().catch(err => console.log('Could not auto-resume:', err));
        }
    });
}

// ============================================================================
// TIMER COUNTDOWN - OPTIMIZED
// ============================================================================

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
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
    try { 
        if (synthRef) synthRef.cancel(); 
    } catch (e) {}
    
    if (timerInterval) clearInterval(timerInterval);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeApp() {
    renderNowPlaying();
    renderPlaylist();
    updateSystemInfo();
    updateTimerDisplay();
    updateThemeColors();

    mode = "radio";
    const currentStation = RADIO_STATIONS[currentStationIndex];
    radioAudioElement.src = currentStation.url + '?t=' + Date.now();
    radioAudioElement.volume = lastVolume;
    radioAudioElement.load();

    const playPromise = radioAudioElement.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            renderNowPlaying();
            updateSystemInfo();
        }).catch(err => {
            console.warn("Autoplay blocked:", err);
            renderNowPlaying();
        });
    }
}

// ============================================================================
// START APPLICATION - OPTIMIZED WITH RAF
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
        cacheDOM();
        createFolderInput();
        initAudio();
        
        const body = document.body;
        body.classList.add('light');
        DOM.themeToggle.textContent = "🌙";
        
        const logoElement = document.querySelector('.logo');
        if (logoElement) {
            logoElement.src = 'Images/sngW.png';
            logoElement.onerror = () => logoElement.style.display = 'none';
        }
        
        setupEventListeners();
        startTimer();
    });
});

window.addEventListener("load", () => {
    document.body.style.transition = "";
});