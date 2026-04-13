// ============================================================
// DropZone Client — P2P File Sharing
// ============================================================

// DOM Elements
const uploadState      = document.getElementById('uploadState');
const uploadingState   = document.getElementById('uploadingState');
const sharingState     = document.getElementById('sharingState');
const dropZone         = document.getElementById('dropZone');
const fileInput        = document.getElementById('fileInput');
const fileName         = document.getElementById('fileName');
const fileSize         = document.getElementById('fileSize');
const fileNameComplete = document.getElementById('fileNameComplete');
const fileSizeComplete = document.getElementById('fileSizeComplete');
const progressBar      = document.getElementById('progressBar');
const progressPercent  = document.getElementById('progressPercent');
const shareLink        = document.getElementById('shareLink');
const copyBtn          = document.getElementById('copyBtn');
const copyBtnText      = document.getElementById('copyBtnText');
const emailForm        = document.getElementById('emailForm');
const sendEmailBtn     = document.getElementById('sendEmailBtn');
const resetBtn         = document.getElementById('resetBtn');
const qrCode           = document.getElementById('qrCode');
const downloadQrBtn    = document.getElementById('downloadQrBtn');
const p2pStatusEl      = document.getElementById('p2pStatus');
const p2pLabel         = p2pStatusEl ? p2pStatusEl.querySelector('.p2p-label') : null;
const p2pDot           = p2pStatusEl ? p2pStatusEl.querySelector('.p2p-dot')  : null;
const peerCountEl      = document.getElementById('peerCount');
const activeSessionsPanel = document.getElementById('activeSessionsPanel');
const sessionsList     = document.getElementById('sessionsList');

// Global State
let currentShareUrl  = null;
let currentRoomId    = null;
let currentFileList  = [];
let webrtc           = null;

// Reconnection state
let _pendingReconnect = null; // { roomId, shareUrl, filesMeta[] }

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
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', ()  => { dropZone.classList.remove('drag-active'); });
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
// HANDLE FILES — Create P2P Room OR Reconnect
// ============================================================

async function handleFiles(files) {
    currentFileList = Array.from(files);

    const totalSize = currentFileList.reduce((sum, f) => sum + f.size, 0);
    const displayName = currentFileList.length === 1
        ? currentFileList[0].name
        : `${currentFileList.length} files`;

    fileName.textContent = displayName;
    fileSize.textContent = formatFileSize(totalSize);
    showState('uploading');

    // If we have a pending reconnect, try to reuse that room
    if (_pendingReconnect) {
        const reconnect = _pendingReconnect;
        _pendingReconnect = null;
        await _reconnectToRoom(reconnect, currentFileList, displayName, totalSize);
        return;
    }

    try {
        const backendUrl = window.BACKEND_URL || window.location.origin;

        const filesMeta = currentFileList.map(f => ({ name: f.name, size: f.size, type: f.type }));
        const clientUrl = window.location.origin + window.location.pathname.replace('index.html', '');

        const response = await fetch(`${backendUrl}/api/create-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesMeta, clientUrl })
        });

        const data = await response.json();
        if (!data.success) throw new Error('Failed to create room');

        currentRoomId   = data.roomId;
        currentShareUrl = data.shareUrl;

        await _startWebRTC(backendUrl, currentRoomId, currentFileList);

        saveSession(currentRoomId, filesMeta, currentShareUrl);

        fileNameComplete.textContent = displayName;
        fileSizeComplete.textContent = `${formatFileSize(totalSize)} • P2P Ready`;
        shareLink.value = currentShareUrl;
        showState('sharing');
        fetchQrCode(currentRoomId);

        if (window.showToast) showToast('P2P room ready — share your link!', 'success');

    } catch (error) {
        console.error('Share error:', error);
        if (window.showToast) showToast('Failed to set up P2P sharing: ' + error.message, 'error');
        else alert('Failed to set up P2P sharing: ' + error.message);
        showState('upload');
    }
}

// Reconnect to an existing room without creating a new one
async function _reconnectToRoom(reconnect, files, displayName, totalSize) {
    try {
        const backendUrl = window.BACKEND_URL || 'https://dropzone-66yr.onrender.com';

        // Check room still alive on server
        const res = await fetch(`${backendUrl}/api/room/${reconnect.roomId}`);
        const roomData = await res.json();

        if (!roomData.active) {
            if (window.showToast) showToast('Session expired — creating a new share.', 'default');
            else alert('Session expired. Creating a new share.');
            removeSession(reconnect.roomId);
            loadActiveSessions();
            _pendingReconnect = null;
            await handleFilesNewRoom(files, displayName, totalSize);
            return;
        }

        currentRoomId   = reconnect.roomId;
        currentShareUrl = reconnect.shareUrl;

        await _startWebRTC(backendUrl, currentRoomId, files);

        // Update session timestamp
        const filesMeta = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
        saveSession(currentRoomId, filesMeta, currentShareUrl);

        fileNameComplete.textContent = displayName;
        fileSizeComplete.textContent = `${formatFileSize(totalSize)} • P2P Reconnected`;
        shareLink.value = currentShareUrl;
        showState('sharing');
        fetchQrCode(currentRoomId);

        if (window.showToast) showToast('Room restored — your link is still active!', 'success');

    } catch (err) {
        console.error('Reconnect error:', err);
        if (window.showToast) showToast('Reconnect failed. Creating new share...', 'error');
        _pendingReconnect = null;
        await handleFilesNewRoom(files, displayName, totalSize);
    }
}

// Create new room when reconnect falls back
async function handleFilesNewRoom(files, displayName, totalSize) {
    try {
        const backendUrl = window.BACKEND_URL || 'https://dropzone-66yr.onrender.com';
        const filesMeta = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
        const clientUrl = window.location.origin + window.location.pathname.replace('index.html', '');

        const response = await fetch(`${backendUrl}/api/create-room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesMeta, clientUrl })
        });
        const data = await response.json();
        if (!data.success) throw new Error('Failed to create room');

        currentRoomId   = data.roomId;
        currentShareUrl = data.shareUrl;

        await _startWebRTC(backendUrl, currentRoomId, files);
        saveSession(currentRoomId, filesMeta, currentShareUrl);

        fileNameComplete.textContent = displayName;
        fileSizeComplete.textContent = `${formatFileSize(totalSize)} • P2P Ready`;
        shareLink.value = currentShareUrl;
        showState('sharing');
        fetchQrCode(currentRoomId);
    } catch (err) {
        console.error('handleFilesNewRoom error:', err);
        showState('upload');
    }
}

// ============================================================
// SHARED WebRTC SETUP
// ============================================================

async function _startWebRTC(backendUrl, roomId, files) {
    if (webrtc) {
        webrtc.disconnect();
        webrtc = null;
    }

    webrtc = new DropZoneWebRTC();

    webrtc.onStatusChange = (status) => { updateP2PStatus(status); };

    webrtc.onSecurityStats = (stats) => {
        const dtlsVersionEl = document.getElementById('p2pDtlsVersion');
        const dtlsTextEl    = document.getElementById('p2pDtlsText');
        if (dtlsVersionEl && dtlsTextEl) {
            dtlsTextEl.textContent = stats.version;
            dtlsVersionEl.classList.add('active');
        }
    };

    webrtc.onProgress = (info) => {
        const pct = Math.round(info.progress);
        if (p2pLabel) p2pLabel.textContent = `Sending ${info.fileName}… ${pct}%`;
        if (progressBar) progressBar.style.width = Math.min(pct, 100) + '%';
        if (progressPercent) progressPercent.textContent = pct + '%';
    };

    webrtc.onPeerCount = (count) => {
        if (peerCountEl) {
            if (count > 0) {
                peerCountEl.textContent = `${count} peer${count > 1 ? 's' : ''} connected`;
                peerCountEl.style.display = 'inline';
            } else {
                peerCountEl.textContent = '';
                peerCountEl.style.display = 'none';
            }
        }
    };

    webrtc.onError = (msg) => {
        if (window.showToast) showToast(msg, 'error', 5000);
    };

    await webrtc.connect(backendUrl || undefined);
    await webrtc.createRoom(roomId, files);
}

// ============================================================
// P2P STATUS
// ============================================================

function updateP2PStatus(status) {
    if (!p2pDot || !p2pLabel) return;

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
            if (window.showToast) showToast('Peer connected!', 'success');
            break;
        case 'transferring':
            p2pDot.classList.add('transferring');
            p2pLabel.textContent = 'Transferring file...';
            break;
        case 'complete':
            p2pDot.classList.add('live');
            p2pLabel.textContent = 'Transfer complete ✓';
            if (window.showToast) showToast('Transfer complete!', 'success');
            setTimeout(() => {
                if (p2pLabel) p2pLabel.textContent = 'P2P Active — Waiting for receivers';
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
        const backendUrl = window.BACKEND_URL || window.location.origin;
        const clientUrl  = window.location.origin + window.location.pathname.replace('index.html', '');
        const response   = await fetch(`${backendUrl}/api/qr/${roomId}?clientUrl=${encodeURIComponent(clientUrl)}`);
        const data       = await response.json();
        if (data.success) renderQr(data.qrCode, `dropzone-qr-${roomId}.png`);
    } catch (error) {
        console.error('QR Code error:', error);
    }
}

function renderQr(dataUrl, downloadName) {
    qrCode.innerHTML = `<img src="${dataUrl}" alt="QR Code" style="width:200px;height:200px;border-radius:8px;display:block;">`;

    if (downloadQrBtn) {
        downloadQrBtn.onclick = () => {
            const a = document.createElement('a');
            a.href     = dataUrl;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }
}

// ============================================================
// SESSION MANAGEMENT — Improved Reconnection
// ============================================================

function saveSession(roomId, filesMeta, shareUrl) {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    const filtered  = sessions.filter(s => s.roomId !== roomId);
    filtered.push({ roomId, files: filesMeta, shareUrl, createdAt: Date.now() });
    const trimmed = filtered.slice(-5);
    localStorage.setItem('dropzone_sessions', JSON.stringify(trimmed));
}

function removeSession(roomId) {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    localStorage.setItem('dropzone_sessions', JSON.stringify(sessions.filter(s => s.roomId !== roomId)));
}

function loadActiveSessions() {
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    const now      = Date.now();
    const maxAge   = 24 * 60 * 60 * 1000;
    const active   = sessions.filter(s => now - s.createdAt < maxAge);
    localStorage.setItem('dropzone_sessions', JSON.stringify(active));

    if (active.length === 0) {
        activeSessionsPanel.classList.add('hidden');
        return;
    }

    activeSessionsPanel.classList.remove('hidden');
    sessionsList.innerHTML = active.map(session => {
        const fileNames = session.files.map(f => f.name).join(', ');
        const totalSize = session.files.reduce((sum, f) => sum + f.size, 0);
        const age       = Math.round((now - session.createdAt) / (60 * 1000));
        const ageText   = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

        return `
            <div class="session-item" data-room-id="${session.roomId}">
                <div class="session-info">
                    <span class="session-name">${fileNames}</span>
                    <span class="session-meta">${formatFileSize(totalSize)} • ${ageText}</span>
                </div>
                <div class="session-actions">
                    <button class="reconnect-btn" onclick="reconnectSession('${session.roomId}')" title="Restore P2P Room">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 4v6h-6"></path>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                        Restore
                    </button>
                    <button class="remove-btn" onclick="removeSessionUI('${session.roomId}')" title="Remove Share">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 6L6 18"></path>
                            <path d="M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ─── RECONNECTION — Modal-driven flow ──────────────────────

window.reconnectSession = async function (roomId) {
    // Retrieve stored session
    const sessions = JSON.parse(localStorage.getItem('dropzone_sessions') || '[]');
    const session  = sessions.find(s => s.roomId === roomId);
    if (!session) { loadActiveSessions(); return; }

    try {
        const backendUrl = window.BACKEND_URL || window.location.origin;
        const res  = await fetch(`${backendUrl}/api/room/${roomId}`);
        const data = await res.json();

        if (!data.active) {
            if (window.showToast) showToast('Session expired. It cannot be restored.', 'error');
            removeSession(roomId);
            loadActiveSessions();
            return;
        }
    } catch (e) {
        if (window.showToast) showToast('Could not check session status. Proceeding...', 'default');
    }

    // Determine the share URL — use stored one or rebuild
    const shareUrl = session.shareUrl || `${window.location.origin}/p2p-receive.html?room=${roomId}`;

    // Show modal asking user to re-select files
    _showReconnectModal(session, shareUrl);
};

function _showReconnectModal(session, shareUrl) {
    // Remove any existing modal
    const existingModal = document.getElementById('reconnectModal');
    if (existingModal) existingModal.remove();

    const fileNames = session.files.map(f => f.name).join('\n');
    const totalSize = session.files.reduce((sum, f) => sum + f.size, 0);

    const overlay = document.createElement('div');
    overlay.id = 'reconnectModal';
    overlay.className = 'reconnect-modal-overlay';
    overlay.innerHTML = `
        <div class="reconnect-modal">
            <div class="reconnect-icon-box">
                <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g class="logo-arrows-spin">
                        <path d="M 40 14 A 18 18 0 0 1 42 30" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" fill="none"/>
                        <path d="M 16 42 A 18 18 0 0 1 14 26" stroke="#f97316" stroke-width="3" stroke-linecap="round" fill="none"/>
                    </g>
                    <rect x="20" y="17" width="16" height="22" rx="2.5" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="1.5"/>
                    <path d="M30 17 L30 23 L36 23" fill="rgba(59,130,246,0.2)" stroke="#3b82f6" stroke-width="1.2" stroke-linejoin="round"/>
                </svg>
            </div>
            <h3>Restore Session</h3>
            <p>Re-select the same file(s) to reconnect to your existing P2P room. Your share link will remain active.</p>

            <div class="session-file-list">
                ${session.files.map(f => `
                    <div class="session-file-row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-opacity="0.6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                        <span class="file-name">${f.name}</span>
                        <span class="file-size">${formatFileSize(f.size)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="reconnect-modal-actions">
                <button id="reconnectPickBtn" class="browse-btn" style="flex:1; justify-content:center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Select Files
                </button>
                <button id="reconnectCancelBtn" class="cancel-modal-btn">
                    Cancel
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Store the reconnect intent
    _pendingReconnect = {
        roomId:   session.roomId,
        shareUrl: shareUrl,
        filesMeta: session.files
    };

    document.getElementById('reconnectPickBtn').addEventListener('click', () => {
        overlay.remove();
        fileInput.value = '';
        fileInput.click();
    });

    document.getElementById('reconnectCancelBtn').addEventListener('click', () => {
        overlay.remove();
        _pendingReconnect = null;
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            _pendingReconnect = null;
        }
    });
}

window.removeSessionUI = function (roomId) {
    removeSession(roomId);
    loadActiveSessions();
};

// Load sessions on page load
loadActiveSessions();

// ============================================================
// RECIPIENT TAG MANAGEMENT
// ============================================================

const recipientChevronBtn  = document.getElementById('recipientChevron');
const extraRecipientsArea  = document.getElementById('extraRecipientsArea');
const recipientsTags       = document.getElementById('recipientsTags');
const addRecipientInput    = document.getElementById('addRecipientInput');
const addContactBtn        = document.getElementById('addContactBtn');
const addListBtn           = document.getElementById('addListBtn');

if (recipientChevronBtn) {
    recipientChevronBtn.addEventListener('click', () => {
        const isOpen = recipientChevronBtn.classList.toggle('open');
        extraRecipientsArea.classList.toggle('hidden', !isOpen);
        if (isOpen && addRecipientInput) addRecipientInput.focus();
    });
}

function addRecipientTag(email) {
    if (!email || !recipientsTags) return;
    // Deduplicate
    const existing = Array.from(document.querySelectorAll('.recipient-tag')).map(t => t.dataset.email);
    if (existing.includes(email)) return;

    const tag = document.createElement('span');
    tag.className    = 'recipient-tag';
    tag.dataset.email = email;
    tag.innerHTML    = `${email}<button type="button" title="Remove" onclick="this.parentElement.remove()">×</button>`;
    recipientsTags.appendChild(tag);
    if (addRecipientInput) addRecipientInput.value = '';
}

if (addRecipientInput) {
    addRecipientInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const v = addRecipientInput.value.trim().replace(/,$/, '');
            if (v.includes('@')) addRecipientTag(v);
        }
    });

    addRecipientInput.addEventListener('blur', () => {
        const v = addRecipientInput.value.trim();
        if (v.includes('@')) addRecipientTag(v);
    });
}

// ============================================================
// QUICK PICK (Contacts / Lists) Logic
// ============================================================

const quickPickOverlay = document.getElementById('quickPickOverlay');
const quickPickList    = document.getElementById('quickPickList');
const quickPickTitle   = document.getElementById('quickPickTitle');
const closeQuickPick   = document.getElementById('closeQuickPick');
const addNewContactBtn = document.getElementById('addNewContactBtn');
const newContactForm   = document.getElementById('newContactForm');
const saveNewContactBtn = document.getElementById('saveNewContactBtn');

// Mock data + Persistence
const MOCK_CONTACTS = [
    { name: 'Sarah Chen', email: 'sarah.c@example.com' },
    { name: 'Alex Rivera', email: 'alex.riv@example.com' },
    { name: 'Tech Team', email: 'dev-team@company.org' }
];

function getStoredContacts() {
    const stored = localStorage.getItem('dropzone_contacts');
    const merged = stored ? JSON.parse(stored) : MOCK_CONTACTS;
    // Filter out deleted mock contacts if any (stored in a separate delete list)
    const deleted = JSON.parse(localStorage.getItem('dropzone_deleted_mock') || '[]');
    return merged.filter(c => !deleted.includes(c.email));
}

function getRecentLists() {
    const stored = localStorage.getItem('dropzone_recent_lists');
    return stored ? JSON.parse(stored) : [];
}

function saveContact(email, name = '') {
    if (!email.includes('@')) return;
    const contacts = getStoredContacts();
    if (!contacts.find(c => c.email === email)) {
        contacts.unshift({ name: name || email.split('@')[0], email });
        localStorage.setItem('dropzone_contacts', JSON.stringify(contacts.slice(0, 20)));
    }
}

function deleteContact(email) {
    const contacts = JSON.parse(localStorage.getItem('dropzone_contacts') || '[]');
    const isMock = MOCK_CONTACTS.find(c => c.email === email);

    if (isMock) {
        const deleted = JSON.parse(localStorage.getItem('dropzone_deleted_mock') || '[]');
        deleted.push(email);
        localStorage.setItem('dropzone_deleted_mock', JSON.stringify(deleted));
    }

    const filtered = contacts.filter(c => c.email !== email);
    localStorage.setItem('dropzone_contacts', JSON.stringify(filtered));
    openQuickPick('contacts'); // Re-render
}

function deleteRecentList(index) {
    const lists = getRecentLists();
    lists.splice(index, 1);
    localStorage.setItem('dropzone_recent_lists', JSON.stringify(lists));
    openQuickPick('lists'); // Re-render
}

function saveRecentList(emails) {
    if (!emails || emails.length < 2) return;
    const lists = getRecentLists();
    const listStr = emails.sort().join(',');
    if (!lists.find(l => l.emails.sort().join(',') === listStr)) {
        lists.unshift({ name: `Group (${emails.length})`, emails });
        localStorage.setItem('dropzone_recent_lists', JSON.stringify(lists.slice(0, 10)));
    }
}

function openQuickPick(type) {
    if (!quickPickOverlay || !quickPickList) return;

    quickPickTitle.textContent = type === 'contacts' ? 'Select Contact' : 'Recent Lists';
    quickPickList.innerHTML = '';

    // Hide add button for lists, show for contacts
    if (addNewContactBtn) addNewContactBtn.style.display = type === 'contacts' ? 'flex' : 'none';
    if (newContactForm) newContactForm.classList.add('hidden');
    if (addNewContactBtn) addNewContactBtn.classList.remove('active');

    const items = type === 'contacts' ? getStoredContacts() : getRecentLists();

    if (items.length === 0) {
        quickPickList.innerHTML = `<div class="quick-pick-empty"><p>No ${type} found yet.</p></div>`;
    } else {
        items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'quick-pick-item';
            el.style.animationDelay = `${index * 40}ms`;

            const icon = type === 'contacts'
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

            el.innerHTML = `
                <div class="item-avatar">${icon}</div>
                <div class="item-content">
                    <span class="item-name">${item.name}</span>
                    <span class="item-email">${type === 'contacts' ? item.email : item.emails.join(', ')}</span>
                </div>
                <button class="remove-item-btn" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            `;

            // Click to select
            el.onclick = (e) => {
                if (e.target.closest('.remove-item-btn')) return;
                if (type === 'contacts') {
                    addRecipientTag(item.email);
                } else {
                    item.emails.forEach(email => addRecipientTag(email));
                }
                closeQuickPickModal();
            };

            // Click to remove
            const removeBtn = el.querySelector('.remove-item-btn');
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                if (type === 'contacts') {
                    deleteContact(item.email);
                } else {
                    deleteRecentList(index);
                }
            };

            quickPickList.appendChild(el);
        });
    }

    quickPickOverlay.classList.add('active');
}

function closeQuickPickModal() {
    quickPickOverlay.classList.remove('active');
}

// Manual Add Logic
if (addNewContactBtn) {
    addNewContactBtn.onclick = () => {
        const isHidden = newContactForm.classList.toggle('hidden');
        addNewContactBtn.classList.toggle('active', !isHidden);
        if (!isHidden) document.getElementById('newContactName').focus();
    };
}

if (saveNewContactBtn) {
    saveNewContactBtn.onclick = () => {
        const nameInput = document.getElementById('newContactName');
        const emailInput = document.getElementById('newContactEmail');
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!email.includes('@')) {
            if (window.showToast) showToast('Please enter a valid email', 'error');
            return;
        }

        saveContact(email, name);
        nameInput.value = '';
        emailInput.value = '';
        newContactForm.classList.add('hidden');
        addNewContactBtn.classList.remove('active');
        openQuickPick('contacts'); // Refresh list
        if (window.showToast) showToast('Contact saved!', 'success');
    };
}

if (closeQuickPick) closeQuickPick.onclick = closeQuickPickModal;
if (quickPickOverlay) {
    quickPickOverlay.onclick = (e) => {
        if (e.target === quickPickOverlay) closeQuickPickModal();
    };
}

// Update existing button listeners
if (addContactBtn) {
    addContactBtn.onclick = (e) => {
        e.preventDefault();
        openQuickPick('contacts');
    };
}

if (addListBtn) {
    addListBtn.onclick = (e) => {
        e.preventDefault();
        openQuickPick('lists');
    };
}

// Hook into email send to save history
emailForm.addEventListener('submit', () => {
    const primary = document.getElementById('recipientEmail').value.trim();
    const tags = Array.from(document.querySelectorAll('.recipient-tag')).map(t => t.dataset.email);
    const all = [primary, ...tags].filter(Boolean);

    if (all.length > 0) {
        all.forEach(email => saveContact(email));
        if (all.length > 1) saveRecentList(all);
    }
});



// ============================================================
// TAB NAVIGATION
// ============================================================

document.addEventListener('click', e => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
        const tab = tabBtn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        const activePane = document.querySelector(`.tab-pane[data-pane="${tab}"]`);
        if (activePane) activePane.classList.add('active');
    }
});

// ============================================================
// COPY BUTTON
// ============================================================

copyBtn.addEventListener('click', () => {
    if (!shareLink.value) return;
    shareLink.select();
    navigator.clipboard.writeText(shareLink.value).catch(() => {
        document.execCommand('copy');
    });
    copyBtnText.textContent = 'Copied!';
    if (window.showToast) showToast('Link copied to clipboard!', 'success');
    setTimeout(() => { copyBtnText.textContent = 'Copy'; }, 2000);
});

// ============================================================
// SOCIAL QUICK SHARE
// ============================================================

const btnWhatsappShare = document.getElementById('btnWhatsappShare');
const btnNearbyShare = document.getElementById('btnNearbyShare');

if (btnWhatsappShare) {
    btnWhatsappShare.addEventListener('click', () => {
        if (!currentShareUrl) return;
        const text = `I've shared a file with you via DropZone P2P. Download here: ${currentShareUrl}`;
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    });
}

if (btnNearbyShare) {
    btnNearbyShare.addEventListener('click', async () => {
        if (!currentShareUrl) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'DropZone P2P Share',
                    text: 'I\'ve shared a file with you via DropZone P2P.',
                    url: currentShareUrl
                });
                if (window.showToast) showToast('Shared successfully!', 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    if (window.showToast) showToast('Sharing failed', 'error');
                }
            }
        } else {
            if (window.showToast) showToast('Web Share not supported on this browser', 'default');
        }
    });
}

// ============================================================
// EMAIL
// ============================================================

emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentShareUrl) return;

    const emailFileName = currentFileList.length > 1
        ? `${currentFileList.length} Files Bundle`
        : currentFileList[0].name;

    const sendBtn  = document.getElementById('sendEmailBtn');
    const sendText = document.getElementById('sendEmailBtnText');

    // Gather all recipients
    const primaryRecipient = document.getElementById('recipientEmail').value.trim();
    const tagRecipients    = Array.from(document.querySelectorAll('.recipient-tag'))
        .map(t => t.dataset.email)
        .filter(Boolean);
    const allRecipients    = [primaryRecipient, ...tagRecipients].filter(Boolean);

    if (allRecipients.length === 0) { if (window.showToast) showToast('Please enter at least one recipient.', 'error'); return; }

    // Optional fields
    const senderEmail = (document.getElementById('senderEmail')?.value  || '').trim();
    const senderName  = (document.getElementById('senderName')?.value   || '').trim();
    const subject     = (document.getElementById('emailSubject')?.value || '').trim();
    const message     = (document.getElementById('emailMessage')?.value || '').trim();

    sendBtn.disabled = true;
    if (sendText) sendText.textContent = 'Preparing native mail...';

    try {
        const toList = allRecipients.join(',');
        const emailSubject = subject || `I've shared a file with you: ${emailFileName}`;
        let emailBody = `Download Link: ${currentShareUrl}\n\n`;
        
        if (message) {
            emailBody += `${message}\n\n`;
        }
        
        emailBody += `Note: This is a direct P2P transfer via DropZone. Please make sure to download within 24 hours while my browser tab is open.`;

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toList)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        
        // Open Gmail compose in a new tab
        window.open(gmailUrl, '_blank');

        if (sendText) sendText.textContent = '✓ Opened Gmail!';
        if (window.showToast) showToast('Gmail compose window opened.', 'success');

        setTimeout(() => {
            if (sendText) sendText.textContent = 'Send Invitation';
            sendBtn.disabled = false;
        }, 2500);

    } catch (error) {
        if (sendText) sendText.textContent = 'Error';
        sendBtn.disabled = false;
        if (window.showToast) showToast('Failed to open mail app.', 'error');
    }
});

// ============================================================
// RESET
// ============================================================

resetBtn.addEventListener('click', () => {
    fileInput.value = '';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '';
    currentShareUrl = null;
    currentRoomId   = null;
    currentFileList = [];
    _pendingReconnect = null;

    if (peerCountEl) { peerCountEl.textContent = ''; peerCountEl.style.display = 'none'; }

    const dtlsVersionEl = document.getElementById('p2pDtlsVersion');
    if (dtlsVersionEl) dtlsVersionEl.classList.remove('active');

    if (webrtc) { webrtc.disconnect(); webrtc = null; }

    showState('upload');
    loadActiveSessions();
});

// ============================================================
// DRAG PREVENTION (full-page)
// ============================================================

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
});

// ============================================================
// LIGHTBOX
// ============================================================

const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightboxImg');
const closeLightbox = document.getElementById('closeLightbox');

function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
}

if (closeLightbox) {
    closeLightbox.addEventListener('click', () => { lightbox.classList.add('hidden'); });
}
if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) lightbox.classList.add('hidden');
    });
}
