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
const copyBtnText = document.getElementById('copyBtnText');
const emailForm = document.getElementById('emailForm');
const sendEmailBtn = document.getElementById('sendEmailBtn');
const sendBtnText = document.getElementById('sendBtnText');

let currentFile = null;
let currentShareId = null;
let currentShareUrl = null;

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
dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.target === dropZone) {
        dropZone.classList.remove('drag-active');
    }
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// File Input Handler
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Handle File Upload
function handleFile(file) {
    if (file.size > 100 * 1024 * 1024) {
        alert('File is too large. Max size is 100MB.');
        return;
    }

    currentFile = file;

    // Update file info in uploading state
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);

    // Show uploading state
    showState('uploading');

    // Start actual upload
    uploadFile(file);
}

// Upload File
function uploadFile(file) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', '/api/upload', true);

    // Update progress
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
            if (response.success) {
                currentShareId = response.shareId;
                currentShareUrl = response.shareUrl;

                // Update share UI
                document.getElementById('fileNameComplete').textContent = currentFile.name;
                document.getElementById('fileSizeComplete').textContent = formatFileSize(currentFile.size) + ' • Upload complete';
                document.getElementById('shareLink').value = currentShareUrl;

                // Generate QR Code immediately
                fetchQrCode(currentShareId);

                // Show sharing state
                setTimeout(() => {
                    showState('sharing');
                }, 500);
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

// Fetch QR Code
async function fetchQrCode(shareId) {
    try {
        const response = await fetch(`/api/qr/${shareId}`);
        const data = await response.json();

        if (data.success && data.qrCode) {
            const qrCodeContainer = document.getElementById('qrCode');
            qrCodeContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code" style="width:100%; height:100%;">`;

            // Setup QR Download
            const downloadBtn = document.getElementById('downloadQrBtn');
            // Remove old listeners to avoid duplicates if reset
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

            newBtn.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = `share-${shareId}.png`;
                link.href = data.qrCode;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    } catch (error) {
        console.error('Error fetching QR code:', error);
    }
}

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');

        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active tab pane
        tabPanes.forEach(pane => {
            if (pane.getAttribute('data-pane') === tabName) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    });
});

// Copy to Clipboard
copyBtn.addEventListener('click', async () => {
    const shareLink = document.getElementById('shareLink').value;

    try {
        await navigator.clipboard.writeText(shareLink);

        // Show success state
        copyBtn.classList.add('copied');

        // Update button icon to checkmark
        copyBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
        `;

        // Reset after 2 seconds
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
            `;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Email Form Submission
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const recipientEmail = document.getElementById('recipientEmail').value;
    const senderEmail = document.getElementById('senderEmail').value;

    if (!currentShareUrl) return;

    // Change button state
    const originalBtnText = sendEmailBtn.innerHTML;
    sendEmailBtn.innerHTML = 'Sending...';
    sendEmailBtn.disabled = true;

    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shareUrl: currentShareUrl,
                recipientEmail,
                senderEmail,
                fileName: currentFile ? currentFile.name : 'Shared File'
            }),
        });

        if (response.ok) {
            // Show success state
            sendEmailBtn.classList.add('success');
            sendEmailBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Email Sent!</span>
            `;
            alert('Email sent! (Check the Server Terminal for the email content)');
        } else {
            const data = await response.json();
            sendEmailBtn.innerHTML = 'Failed';
            alert('Failed to send email: ' + (data.error || 'Unknown error'));
        }

    } catch (error) {
        console.error('Error sending email:', error);
        sendEmailBtn.innerHTML = 'Error';
        alert('Network error while sending email.');
    }

    // Reset form and button after 2 seconds
    setTimeout(() => {
        emailForm.reset();
        sendEmailBtn.classList.remove('success');
        sendEmailBtn.disabled = false;
        sendEmailBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            <span>Send Email</span>
        `;
    }, 2000);
});

// Reset to Upload State
resetBtn.addEventListener('click', () => {
    currentFile = null;
    currentShareId = null;
    currentShareUrl = null;
    fileInput.value = '';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    emailForm.reset();

    // Reset to first tab
    tabBtns.forEach((btn, index) => {
        if (index === 0) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    tabPanes.forEach((pane, index) => {
        if (index === 0) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    document.getElementById('qrCode').innerHTML = ''; // Clear QR code

    showState('upload');
});

// Prevent default drag behavior on the whole page
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});


