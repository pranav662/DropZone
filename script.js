// ============================================================
// DropZone Client — P2P File Sharing
// ============================================================

// DOM Elements
const uploadState = document.getElementById('uploadState');
const uploadingState = document.getElementById('uploadingState');
const sharingState = document.getElementById('sharingState');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileNameComplete = document.getElementById('fileNameComplete');
const fileSizeComplete = document.getElementById('fileSizeComplete');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const shareLink = document.getElementById('shareLink');
const copyBtn = document.getElementById('copyBtn');
const copyBtnText = document.getElementById('copyBtnText');
const emailForm = document.getElementById('emailForm');
const sendEmailBtn = document.getElementById('sendEmailBtn');
const resetBtn = document.getElementById('resetBtn');
const qrCode = document.getElementById('qrCode');
const downloadQrBtn = document.getElementById('downloadQrBtn');
const p2pStatusEl = document.getElementById('p2pStatus');
const p2pLabel = p2pStatusEl.querySelector('.p2p-label');
const p2pDot = p2pStatusEl.querySelector('.p2p-dot');
const peerCountEl = document.getElementById('peerCount');
const activeSessionsPanel = document.getElementById('activeSessionsPanel');
const sessionsList = document.getElementById('sessionsList');

// Global State
let currentShareUrl = null;
let currentRoomId = null;
let currentFileList = [];
let webrtc = null;

// ============================================================
// HELPERS
// ============================================================

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showState(state) {
    [uploadState, uploadingState, sharingState].forEach(s => {
        s.classList.remove('active');
    });

    if (state === 'upload') {
        uploadState.classList.add('active');
        resetBtn.classList.add('hidden');
    } else if (state === 'uploading') {
        uploadingState.classList.add('active');
        resetBtn.classList.remove('hidden');
    } else if (state === 'sharing') {
        sharingState.classList.add('active');
        resetBtn.classList.remove('hidden');
    }
}

// ============================================================
// DRAG & DROP + FILE INPUT
// ============================================================

dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-active'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
});

// ============================================================
// HANDLE FILES — Create P2P Room
// ============================================================

async function handleFiles(files) {
    currentFileList = Array.from(files);

    const totalSize = currentFileList.reduce((sum, f) => sum + f.size, 0);
    const displayName = currentFileList.length === 1
        ? currentFileList[0].name
        : `${currentFileList.length} files`;

    // Show connecting state
    fileName.textContent = displayName;
    fileSize.textContent = formatFileSize(totalSize);
    showState('uploading');

    try {
        const backendUrl = window.BACKEND_URL || 'https://dropzone-66yr.onrender.com';

        // 1. Create room on server
        const filesMeta = currentFileList.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
        }));

        const clientUrl = window.location.origin + window.location.pathname.replace('index.html', '');
        const response = await fetch(`${backendUrl}/api/create-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: filesMeta,
                clientUrl: clientUrl
            })
        });

        const data = await response.json();
        if (!data.success) throw new Error('Failed to create room');

        currentRoomId = data.roomId;
        currentShareUrl = data.shareUrl;

        // 2. Connect WebRTC and join room as sender
        webrtc = new DropZoneWebRTC();

        webrtc.onStatusChange = (status) => {
            updateP2PStatus(status);
        };

        webrtc.onSecurityStats = (stats) => {
            const dtlsVersionEl = document.getElementById('p2pDtlsVersion');
            const dtlsTextEl = document.getElementById('p2pDtlsText');
            if (dtlsVersionEl && dtlsTextEl) {
                dtlsTextEl.textContent = stats.version;
                dtlsVersionEl.classList.add('active');
            }
        };

        webrtc.onProgress = (info) => {
            // Update progress in sharing state if needed
            const pct = Math.round(info.progress);
            p2pLabel.textContent = `Sending ${info.fileName}... ${pct}%`;
        };

        webrtc.onPeerCount = (count) => {
            if (count > 0) {
                peerCountEl.textContent = `${count} peer${count > 1 ? 's' : ''} connected`;
                peerCountEl.style.display = 'inline';
            } else {
                peerCountEl.textContent = '';
                peerCountEl.style.display = 'none';
            }
        };

        await webrtc.connect(backendUrl || undefined);
        await webrtc.createRoom(currentRoomId, currentFileList);

        // 3. Save session to localStorage for reconnection
        saveSession(currentRoomId, filesMeta);

        // 4. Show sharing state
        fileNameComplete.textContent = displayName;
        fileSizeComplete.textContent = `${formatFileSize(totalSize)} • P2P Ready`;
        shareLink.value = currentShareUrl;
        showState('sharing');

        // 5. Fetch QR code
        fetchQrCode(currentRoomId);

    } catch (error) {
        console.error('Share error:', error);
        alert('Failed to set up P2P sharing: ' + error.message);
        showState('upload');
    }
}

// ============================================================
// P2P STATUS
// ============================================================

function updateP2PStatus(status) {
    p2pDot.className = 'p2p-dot';

    switch (status) {
        case 'waiting':
            p2pDot.classList.add('live');
            p2pLabel.textContent = 'P2P Active — Waiting for receivers';
            break;
        case 'connecting':
            p2pDot.classList.add('connecting');
            p2pLabel.textContent = 'Connecting to peer...';
            break;
        case 'connected':
            p2pDot.classList.add('live');
            p2pLabel.textContent = 'Peer connected — Ready to transfer';
            break;
        case 'transferring':
            p2pDot.classList.add('transferring');
            p2pLabel.textContent = 'Transferring file...';
            break;
        case 'complete':
            p2pDot.classList.add('live');
            p2pLabel.textContent = 'Transfer complete ✓';
            setTimeout(() => {
                p2pLabel.textContent = 'P2P Active — Waiting for receivers';
            }, 5000);
            break;
        case 'error':
            p2pDot.classList.add('offline');
            p2pLabel.textContent = 'Connection error';
            break;
    }
}

// ============================================================
// QR CODE
// ============================================================

async function fetchQrCode(roomId) {
    try {
        const backendUrl = window.BACKEND_URL || '';
        const clientUrl = window.location.origin + window.location.pathname.replace('index.html', '');
        const response = await fetch(`${backendUrl}/api/qr/${roomId}?clientUrl=${encodeURIComponent(clientUrl)}`);
        const data = await response.json();

        if (data.success) {
            renderQr(data.qrCode, `dropzone-qr-${roomId}.png`);
        }
    } catch (error) {
        console.error('QR Code error:', error);
    }
}

function renderQr(dataUrl, downloadName) {
    qrCode.innerHTML = `<img src="${dataUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;">`;

    if (downloadQrBtn) {
        downloadQrBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }
}

// ============================================================
// SESSION MANAGEMENT (Reconnection)
// ============================================================

function saveSession(roomId, filesMeta) {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');

    // Remove any existing session with same roomId
    const filtered = sessions.filter(s => s.roomId !== roomId);
    filtered.push({
        roomId,
        files: filesMeta,
        createdAt: Date.now()
    });

    // Keep only last 5 sessions
    const trimmed = filtered.slice(-5);
    localStorage.setItem('dropzone_sessions', JSON.stringify(trimmed));
}

function removeSession(roomId) {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    const filtered = sessions.filter(s => s.roomId !== roomId);
    localStorage.setItem('dropzone_sessions', JSON.stringify(filtered));
}

function loadActiveSessions() {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

    // Filter out expired
    const active = sessions.filter(s => now - s.createdAt < maxAge);
    localStorage.setItem('dropzone_sessions', JSON.stringify(active));

    if (active.length === 0) {
        activeSessionsPanel.classList.add('hidden');
        return;
    }

    activeSessionsPanel.classList.remove('hidden');
    sessionsList.innerHTML = active.map(session => {
        const fileNames = session.files.map(f => f.name).join(', ');
        const totalSize = session.files.reduce((sum, f) => sum + f.size, 0);
        const age = Math.round((now - session.createdAt) / (60 * 1000));
        const ageText = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

        return `
            <div class="session-item" data-room-id="${session.roomId}">
                <div class="session-info">
                    <span class="session-name">${fileNames}</span>
                    <span class="session-meta">${formatFileSize(totalSize)} • ${ageText}</span>
                </div>
                <button class="session-reconnect-btn" onclick="reconnectSession('${session.roomId}')">
                    Reconnect
                </button>
                <button class="session-remove-btn" onclick="removeSessionUI('${session.roomId}')">✕</button>
            </div>
        `;
    }).join('');
}

window.reconnectSession = async function (roomId) {
    // Check if room is still active on server
    try {
        const backendUrl = window.BACKEND_URL || '';
        const res = await fetch(`${backendUrl}/api/room/${roomId}`);
        const data = await res.json();

        if (!data.active) {
            alert('This share has expired. Please create a new share.');
            removeSession(roomId);
            loadActiveSessions();
            return;
        }

        // Prompt user to re-select the file
        alert('Please re-select the same file(s) to reconnect. The P2P room will be restored.');

        // Store the roomId to reconnect after file selection
        window._reconnectRoomId = roomId;
        fileInput.click();
    } catch (e) {
        alert('Failed to check room status.');
    }
};

window.removeSessionUI = function (roomId) {
    removeSession(roomId);
    loadActiveSessions();
};

// Load sessions on page load
loadActiveSessions();

// ============================================================
// COPY BUTTON
// ============================================================

copyBtn.addEventListener('click', () => {
    shareLink.select();
    navigator.clipboard.writeText(shareLink.value);
    copyBtnText.textContent = 'Copied!';
    setTimeout(() => { copyBtnText.textContent = 'Copy'; }, 2000);
});

// ============================================================
// EMAIL
// ============================================================

emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentShareUrl) return;

    const emailFileName = currentFileList.length > 1
        ? `${currentFileList.length} Files Bundle`
        : currentFileList[0].name;

    sendEmailBtn.innerHTML = 'Sending...';
    sendEmailBtn.disabled = true;

    try {
        const backendUrl = window.BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shareUrl: currentShareUrl,
                recipientEmail: document.getElementById('recipientEmail').value,
                senderEmail: document.getElementById('senderEmail').value,
                fileName: emailFileName
            })
        });

        const data = await response.json();

        if (data.success) {
            sendEmailBtn.innerHTML = '✓ Sent!';
        } else {
            throw new Error(data.error);
        }

        setTimeout(() => {
            sendEmailBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>Send Email</span>
            `;
            sendEmailBtn.disabled = false;
        }, 2000);

    } catch (error) {
        sendEmailBtn.innerHTML = 'Error';
        sendEmailBtn.disabled = false;
        alert('Failed to send email.');
    }
});

// ============================================================
// RESET
// ============================================================

resetBtn.addEventListener('click', () => {
    fileInput.value = '';
    progressBar.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '';
    currentShareUrl = null;
    currentRoomId = null;
    currentFileList = [];
    peerCountEl.textContent = '';
    peerCountEl.style.display = 'none';
    
    const dtlsVersionEl = document.getElementById('p2pDtlsVersion');
    if (dtlsVersionEl) dtlsVersionEl.classList.remove('active');

    if (webrtc) {
        webrtc.disconnect();
        webrtc = null;
    }

    showState('upload');
    loadActiveSessions();
});

// ============================================================
// DRAG PREVENTION
// ============================================================

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
});

// ============================================================
// LIGHTBOX
// ============================================================

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightbox = document.getElementById('closeLightbox');

function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
}

if (closeLightbox) {
    closeLightbox.addEventListener('click', () => {
        lightbox.classList.add('hidden');
    });
}

if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.classList.add('hidden');
        }
    });
}
