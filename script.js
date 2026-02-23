// DOM Elements
const uploadState = document.getElementById('uploadState');
const uploadingState = document.getElementById('uploadingState');
const sharingState = document.getElementById('sharingState');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const resetBtn = document.getElementById('resetBtn');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const copyBtn = document.getElementById('copyBtn');
const emailForm = document.getElementById('emailForm');
const sendEmailBtn = document.getElementById('sendEmailBtn');

// Global State
let currentShareUrl = null;
let currentShareId = null; // For single files, or batch ID context
let currentFileList = [];
let isBatch = false;

// Helper to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// State Management
function showState(state) {
    uploadState.classList.remove('active');
    uploadingState.classList.remove('active');
    sharingState.classList.remove('active');

    if (state === 'upload') {
        uploadState.classList.add('active');
        resetBtn.classList.add('hidden');
    } else if (state === 'uploading') {
        uploadingState.classList.add('active');
        resetBtn.classList.add('hidden');
    } else if (state === 'sharing') {
        sharingState.classList.add('active');
        resetBtn.classList.remove('hidden');
    }
}

// Drag and Drop Handlers
dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); if (e.target === dropZone) dropZone.classList.remove('drag-active'); });

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFiles(files);
});

// File Input Handler
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
});

// Handle Multiple Files
function handleFiles(files) {
    const totalSize = Array.from(files).reduce((acc, file) => acc + file.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
        alert('Total file size too large. Max size is 100MB.');
        return;
    }

    document.getElementById('fileName').textContent = `${files.length} file(s)`;
    document.getElementById('fileSize').textContent = formatFileSize(totalSize);
    showState('uploading');

    uploadFiles(files);
}

// Upload Files
function uploadFiles(files) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    const password = document.getElementById('filePassword').value;
    if (password) {
        formData.append('password', password);
    }

    const backendUrl = window.BACKEND_URL || '';
    xhr.open('POST', backendUrl + '/api/upload', true);

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressPercent.textContent = percentComplete + '%';
        }
    });

    xhr.onload = function () {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.files && response.files.length > 0) {
                renderResults(response, files); // Pass full response and original files
                showState('sharing');
            } else {
                alert('Upload failed: ' + (response.error || 'Unknown error'));
                showState('upload');
            }
        } else {
            alert('Upload failed. Server responded with status: ' + xhr.status);
            showState('upload');
        }
    };

    xhr.onerror = function () {
        alert('Upload failed due to network error.');
        showState('upload');
    };

    xhr.send(formData);
}

// Render Results
function renderResults(data, originalFiles) {
    console.log('Rendering Results:', data);
    try {
        currentFileList = data.files;
        isBatch = !!data.batchUrl;
        console.log('Batch URL:', data.batchUrl, 'isBatch:', isBatch);

        // Unified Header Logic
        let headerTitle, headerSubtitle;

        if (isBatch) {
            currentShareUrl = data.batchUrl;
            currentShareId = null;
            headerTitle = `Files Uploaded!`;
            headerSubtitle = `${data.files.length} files in batch`;
        } else {
            const file = data.files[0];
            currentShareUrl = file.shareUrl;
            currentShareId = file.shareId;
            headerTitle = `File Uploaded!`;
            headerSubtitle = `Ready to share`;
        }

        // Update Header UI
        document.getElementById('fileNameComplete').textContent = headerTitle;
        document.getElementById('fileSizeComplete').textContent = headerSubtitle;
        document.getElementById('shareLink').value = currentShareUrl;

        // Reset any previous "Card" injections to ensure clean slate
        const sharingState = document.getElementById('sharingState');
        const existingCard = sharingState.querySelector('.card');

        if (existingCard) {
            const defaultHeaderHtml = `
                <div class="file-info success">
                    <div class="file-icon success">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <div class="file-details">
                        <h3 id="fileNameComplete">${headerTitle}</h3>
                        <p id="fileSizeComplete">${headerSubtitle}</p>
                    </div>
                </div>`;
            existingCard.outerHTML = defaultHeaderHtml;
        }

        // Generate QR for Share URL (Batch or Single)
        if (isBatch) {
            fetchBatchQrCode(data.batchId);
        } else {
            fetchQrCode(currentShareId);
        }

        // Generate File List for BOTH Batch and Single
        createFileListUI(data.files, originalFiles);

    } catch (error) {
        console.error('Error in renderResults:', error);
        alert('UI Rendering Error: ' + error.message);
    }
}

function createFileListUI(files, originalFiles) {
    const linkContainer = document.querySelector('.link-container');

    let listHtml = `<div style="max-height: 200px; overflow-y: auto; background: #f1f5f9; padding: 10px; border-radius: 6px; margin-top: 15px;">`;

    files.forEach((f, index) => {
        const originalFile = originalFiles ? originalFiles[index] : null;
        const iconData = getIconForFile(f);
        let thumbnail;
        let viewUrl = f.shareUrl; // Default to share URL
        let targetAttr = 'target="_blank"';

        // Check if we can create a local preview
        if (originalFile) {
            const type = originalFile.type;
            if (type.startsWith('image/') || type === 'application/pdf' || type.startsWith('video/') || type.startsWith('audio/')) {
                viewUrl = URL.createObjectURL(originalFile);
            }
        }

        if (originalFile && originalFile.type.startsWith('image/')) {
            thumbnail = `<img src="${URL.createObjectURL(originalFile)}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; margin-right:12px; cursor: pointer;" title="Preview">`;
        } else {
            thumbnail = `<div style="width:40px; height:40px; background:${iconData.bg}; border-radius:4px; display:flex; align-items:center; justify-content:center; margin-right:12px; font-size:${iconData.label ? '12px' : '20px'}; font-weight:bold; color:${iconData.color};">
                ${iconData.label || iconData.icon}
            </div>`;
        }

        listHtml += `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; flex:1; min-width:0;">
                    ${thumbnail}
                    <div style="display:flex; flex-direction:column; min-width:0;">
                        <span style="font-weight:600; font-size:13px; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.originalName}">${f.originalName}</span>
                        <span style="font-size:11px; color:#94a3b8;">${formatFileSize(f.size)}</span>
                    </div>
                </div>
                <div style="display:flex; gap: 10px; margin-left:10px;">
                    <a href="${viewUrl}" ${targetAttr} style="color:#3b82f6; text-decoration:none; font-weight:600; font-size:12px;">View</a>
                    <a href="${f.shareUrl}" target="_blank" style="color:#64748b; text-decoration:none; font-weight:600; font-size:12px;">Link</a>
                </div>
            </div>
        `;
    });
    listHtml += `</div>`;

    const existingList = document.getElementById('fileListResults');
    if (existingList) existingList.remove();

    const div = document.createElement('div');
    div.id = 'fileListResults';
    div.innerHTML = listHtml;
    linkContainer.after(div);
}

// Fetch QR Code (Single)
async function fetchQrCode(shareId) {
    try {
        const backendUrl = window.BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/qr/${shareId}`);
        const data = await response.json();
        if (data.success && data.qrCode) renderQr(data.qrCode, `qr-${shareId}.png`);
    } catch (e) { console.error('QR Error', e); }
}

// Fetch QR Code (Batch)
async function fetchBatchQrCode(batchId) {
    try {
        const backendUrl = window.BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/qr-batch/${batchId}`);
        const data = await response.json();
        if (data.success && data.qrCode) renderQr(data.qrCode, `qr-batch-${batchId}.png`);
    } catch (e) { console.error('Batch QR Error', e); }
}

function renderQr(dataUrl, downloadName) {
    document.getElementById('qrCode').innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%;">`;

    const downloadQrBtn = document.getElementById('downloadQrBtn');
    if (downloadQrBtn) {
        const newBtn = downloadQrBtn.cloneNode(true);
        downloadQrBtn.parentNode.replaceChild(newBtn, downloadQrBtn);
        newBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = downloadName;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
}

// Email Form Submission
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentShareUrl) return;

    let emailFileName = isBatch ? `${currentFileList.length} Files Bundle` : currentFileList[0].originalName;

    sendEmailBtn.innerHTML = 'Sending...';
    sendEmailBtn.disabled = true;

    try {
        const backendUrl = window.BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shareUrl: currentShareUrl, // Sends the single Batch URL now!
                recipientEmail: document.getElementById('recipientEmail').value,
                senderEmail: document.getElementById('senderEmail').value,
                fileName: emailFileName
            }),
        });

        sendEmailBtn.disabled = false;
        if (response.ok) {
            sendEmailBtn.innerHTML = 'Sent!';
            alert('Email sent! (Check Server Terminal)');
        } else {
            sendEmailBtn.innerHTML = 'Failed';
            alert('Failed to send email.');
        }

        setTimeout(() => {
            sendEmailBtn.innerHTML = `
            < svg width = "20" height = "20" viewBox = "0 0 24 24" fill = "none" stroke = "currentColor" stroke - width="2" >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg >
            <span>Send Email</span>
        `;
        }, 2000);

    } catch (error) {
        sendEmailBtn.innerHTML = 'Error';
        sendEmailBtn.disabled = false;
        alert('Network error.');
    }
});

// Reset Handler
resetBtn.addEventListener('click', () => {
    fileInput.value = '';
    document.getElementById('filePassword').value = '';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    document.getElementById('qrCode').innerHTML = '';
    const list = document.getElementById('fileListResults');
    if (list) list.remove();

    currentShareUrl = null;
    currentShareId = null;
    currentFileList = [];
    isBatch = false;

    showState('upload');
});

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanes.forEach(pane => {
            if (pane.getAttribute('data-pane') === tabName) pane.classList.add('active');
            else pane.classList.remove('active');
        });
    });
});

// Copy Button
copyBtn.addEventListener('click', () => {
    const val = document.getElementById('shareLink').value;
    navigator.clipboard.writeText(val);
    alert('Copied!');
});

// Prevent default drag behavior
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
});

// --- HELPER: Get Icon for File Type ---
function getIconForFile(file) {
    const name = file.originalName.toLowerCase();
    const type = file.mimetype;

    if (type.startsWith('image/')) return { type: 'image', icon: '🖼️', color: '#3b82f6', bg: '#dbeafe' };
    if (type.includes('pdf') || name.endsWith('.pdf')) return { type: 'pdf', icon: '🔴', color: '#ef4444', bg: '#fee2e2', label: 'PDF' };
    if (type.includes('audio') || name.endsWith('.mp3') || name.endsWith('.wav')) return { type: 'audio', icon: '🎵', color: '#8b5cf6', bg: '#f3e8ff' };
    if (type.includes('video') || name.endsWith('.mp4') || name.endsWith('.mov')) return { type: 'video', icon: '🎬', color: '#f59e0b', bg: '#fef3c7' };
    if (type.includes('zip') || type.includes('compressed') || name.endsWith('.zip') || name.endsWith('.rar')) return { type: 'zip', icon: '📦', color: '#d97706', bg: '#ffedd5' };
    if (type.includes('text') || name.endsWith('.txt') || name.endsWith('.md')) return { type: 'text', icon: '📝', color: '#64748b', bg: '#f1f5f9' };
    if (name.endsWith('.js') || name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.json')) return { type: 'code', icon: '💻', color: '#0f172a', bg: '#e2e8f0' };

    return { type: 'file', icon: '📄', color: '#94a3b8', bg: '#f8fafc' };
}

// --- LIGHTBOX LOGIC ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const closeLightbox = document.getElementById('closeLightbox');

function openLightbox(src) {
    if (lightbox && lightboxImg) {
        lightbox.classList.remove('hidden');
        lightboxImg.src = src;
    }
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
