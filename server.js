require('dotenv').config();
// Server updated to use remote MongoDB
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const nodemailer = require('nodemailer');
const cors = require('cors');
const QRCode = require('qrcode');
const os = require('os');
const connectDB = require('./config/db');
const File = require('./models/File');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(6).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, uniqueId + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept all file types
        cb(null, true);
    }
});

// Connect to Database
connectDB();

// Get Network IP
function getNetworkIp() {
    const interfaces = os.networkInterfaces();
    let bestMatch = 'localhost';

    for (const name of Object.keys(interfaces)) {
        // Skip common virtual/VPN adapters
        if (name.toLowerCase().includes('vmware') ||
            name.toLowerCase().includes('virtual') ||
            name.toLowerCase().includes('vbox') ||
            name.toLowerCase().includes('pseudo')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            // Skip internal and non-ipv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                // Prioritize Wi-Fi or Ethernet
                if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi') || name.toLowerCase().includes('wlan')) {
                    return iface.address; // Return immediately if Wi-Fi found
                }
                // Fallback to Ethernet/Other real adapter
                bestMatch = iface.address;
            }
        }
    }
    return bestMatch;
}

// Generate unique share ID
function generateShareId() {
    return crypto.randomBytes(4).toString('base64url');
}

// Configure email transporter
let transporter;

async function createTransporter() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        console.log('configured real SMTP transport');
    } else {
        // Mock Transport for Localhost (No Internet/SMTP required)
        transporter = {
            sendMail: async (mailOptions) => {
                console.log('==================================================');
                console.log('EMAIL MOCK - (No SMTP configured)');
                console.log('To:', mailOptions.to);
                console.log('Subject:', mailOptions.subject);
                console.log('Content (HTML):');
                console.log(mailOptions.html);
                console.log('==================================================');
                return { messageId: 'mock-' + Date.now() };
            }
        };
        console.log('Configured Local Mock transport (Logs to console)');
    }
}

createTransporter();

// Routes

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Encryption Config
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

if (ENCRYPTION_KEY.length !== 32) {
    console.warn('WARNING: ENCRYPTION_KEY is not set or invalid (must be 32 bytes hex). using fallback (NOT SECURE)');
}

// Upload file endpoint (Supports multiple files)
app.post('/api/upload', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = [];
        // Generate a Batch ID if multiple files
        const batchId = req.files.length > 1 ? generateShareId() : null;

        let batchUrl = null;
        if (batchId) {
            const hostUrl = process.env.HOST_URL || (req.get('host').includes('localhost') ? `${req.protocol}://${getNetworkIp()}:${PORT}` : `${req.protocol}://${req.get('host')}`);
            batchUrl = `${hostUrl}/download/batch/${batchId}`;
        }

        // Handle Password (hash it once if same for all, or per file logic)
        // Since UI has one password input, we apply it to all files in this batch.
        let passwordHash = null;
        if (req.body.password) {
            passwordHash = crypto.createHash('sha256').update(req.body.password).digest('hex');
        }

        for (const file of req.files) {
            const shareId = generateShareId();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

            // Generate IV for this file
            const iv = crypto.randomBytes(16);

            // Paths
            const tempPath = file.path;
            const encryptedFilename = `${file.filename}.enc`;
            const encryptedPath = path.join(uploadsDir, encryptedFilename);

            // Encrypt File
            const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
            const input = fs.createReadStream(tempPath);
            const output = fs.createWriteStream(encryptedPath);

            await pipelineAsync(input, cipher, output);

            // Delete original temp file
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            const fileData = {
                shareId,
                originalName: file.originalname,
                filename: encryptedFilename, // Store encrypted filename
                size: file.size,
                mimetype: file.mimetype,
                uploadedAt: new Date(),
                expiresAt,
                downloadCount: 0,
                iv: iv.toString('hex'), // Store IV
                password: passwordHash, // Store Password Hash (if any)
                batchId: batchId // Store Batch ID
            };

            await File.create(fileData);

            // Schedule file deletion
            setTimeout(() => {
                deleteFile(shareId);
            }, 24 * 60 * 60 * 1000);

            // Use HOST_URL environment variable if provided
            const hostUrl = process.env.HOST_URL || (req.get('host').includes('localhost') ? `${req.protocol}://${getNetworkIp()}:${PORT}` : `${req.protocol}://${req.get('host')}`);
            const shareUrl = `${hostUrl}/download/${shareId}`;

            uploadedFiles.push({
                shareId,
                shareUrl,
                originalName: file.originalname,
                size: file.size,
                mimetype: file.mimetype,
                expiresAt
            });
        }

        res.json({
            success: true,
            files: uploadedFiles, // Return array of results
            batchId: batchId,
            batchUrl: batchUrl
        });

    } catch (error) {
        console.error('Upload error:', error);
        // Clean up any temp files if exists
        if (req.files) {
            req.files.forEach(f => {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
        }
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Serve Raw Content (For Previews)
app.get('/content/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;
        const file = await File.findOne({ shareId });

        if (!file || (file.expiresAt && new Date() > file.expiresAt)) return res.status(404).send('Not Found');

        // Check Password / Token
        if (file.password) {
            const token = req.query.token;
            if (!token) return res.status(403).send('Protected Content');

            // Verify Token
            const expectedToken = crypto.createHmac('sha256', ENCRYPTION_KEY)
                .update(shareId + file.password)
                .digest('hex');

            if (token !== expectedToken) return res.status(403).send('Invalid Token');
        }

        const filePath = path.join(uploadsDir, file.filename);
        if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

        res.setHeader('Content-Type', file.mimetype);
        // Inline disposition for rendering
        res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);

        if (file.iv) {
            const iv = Buffer.from(file.iv, 'hex');
            const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
            const input = fs.createReadStream(filePath);
            input.pipe(decipher).pipe(res);
        } else {
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) { res.status(500).end(); }
});

// Download / Landing Page Endpoint
app.all('/download/:shareId', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { shareId } = req.params;
    const isDownloadRequest = req.body.action === 'download';

    try {
        const file = await File.findOne({ shareId });

        if (!file) return res.status(404).send('File not found or expired');
        if (new Date() > file.expiresAt) {
            await deleteFile(shareId);
            return res.status(410).send('File has expired');
        }

        let isPasswordVerified = false;
        let viewToken = null;

        // --- PASSWORD CHECK ---
        if (file.password) {
            const providedPassword = req.body.password;

            if (!providedPassword) {
                // Render Password Form
                return res.send(renderPasswordPage(file.originalName, `/download/${shareId}`));
            }

            const hash = crypto.createHash('sha256').update(providedPassword).digest('hex');
            if (hash !== file.password) {
                return res.status(403).send(renderPasswordPage(file.originalName, `/download/${shareId}`, 'Incorrect Password'));
            }

            isPasswordVerified = true;
            // Generate View Token
            viewToken = crypto.createHmac('sha256', ENCRYPTION_KEY)
                .update(shareId + file.password)
                .digest('hex');
        }

        // --- ACTION: DOWNLOAD STRING ---
        if (isDownloadRequest) {
            // Serve File Stream (Attachment)
            const filePath = path.join(uploadsDir, file.filename);
            if (!fs.existsSync(filePath)) return res.status(404).send('File content missing');

            file.downloadCount++;
            await file.save();

            res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
            res.setHeader('Content-Type', file.mimetype);

            if (file.iv) {
                const iv = Buffer.from(file.iv, 'hex');
                const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
                const input = fs.createReadStream(filePath);
                input.pipe(decipher).pipe(res);
            } else {
                res.download(filePath, file.originalName);
            }
            return;
        }

        // --- DEFAULT: RENDER LANDING PAGE (PREVIEW) ---

        const isImage = file.mimetype.startsWith('image/');
        const isVideo = file.mimetype.startsWith('video/');
        const isAudio = file.mimetype.startsWith('audio/');
        const isPdf = file.mimetype === 'application/pdf';

        // Allow preview if not password protected OR if password verified
        const canPreview = (!file.password || isPasswordVerified) && (isImage || isVideo || isAudio || isPdf);

        // Append token if exists
        const previewUrl = viewToken ? `/content/${shareId}?token=${viewToken}` : `/content/${shareId}`;

        let icon = `<span style="font-size:24px; margin-right:10px;">📄</span>`;
        if (canPreview && isImage) icon = `<img src="${previewUrl}" style="height:40px; width:40px; object-fit:cover; border-radius:4px; margin-right:10px;">`;
        else if (isPdf) icon = `<span style="font-size:24px; margin-right:10px;">🔴</span>`;
        else if (isVideo) icon = `<span style="font-size:24px; margin-right:10px;">🎬</span>`;
        else if (isAudio) icon = `<span style="font-size:24px; margin-right:10px;">🎵</span>`;

        const passwordField = file.password ? `<input type="hidden" name="password" value="${req.body.password}">` : '';

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${file.originalName} - DropZone</title>
                <style>
                    body { background: #0f172a; color: white; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; padding: 20px; box-sizing: border-box; margin: 0; min-height: 100vh; }
                    .container { max-width: 600px; width: 100%; margin-top: 40px; }
                    .header-icon { font-size: 48px; text-align: center; display: block; margin-bottom: 10px; }
                    h1 { text-align: center; color: #f8fafc; margin-bottom: 30px; font-size: 24px; word-wrap: break-word; }
                    
                    .file-list { background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
                    .file-item { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 20px; gap: 15px; }
                    
                    .file-info-group { display: flex; align-items: center; flex: 1; min-width: 0; }
                    .file-details { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                    .file-name { font-weight: 600; color: #f1f5f9; font-size: 16px; margin-bottom: 4px; word-break: break-all; }
                    .file-meta { font-size: 13px; color: #94a3b8; }
                    
                    .actions { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }
                    
                    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 14px; text-decoration: none; border: none; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
                    .btn-primary { background: #3b82f6; color: white; }
                    .btn-primary:hover { background: #2563eb; }
                    .btn-secondary { background: #334155; color: white; }
                    .btn-secondary:hover { background: #475569; }
                    
                    @media (max-width: 480px) {
                        .file-item { flex-direction: column; align-items: flex-start; }
                        .actions { width: 100%; justify-content: stretch; }
                        .btn { flex: 1; justify-content: center; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <span class="header-icon">📦</span>
                    <h1>File Shared With You</h1>
                    
                    <div class="file-list">
                        <div class="file-item">
                            <div class="file-info-group">
                                ${icon}
                                <div class="file-details">
                                    <span class="file-name">${file.originalName}</span>
                                    <span class="file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB • Expires in 24h</span>
                                </div>
                            </div>
                            
                            <div class="actions">
                                ${canPreview ? `
                                <a href="${previewUrl}" target="_blank" class="btn btn-secondary">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    View
                                </a>` : ''}
                                
                                <form method="POST" action="/download/${shareId}" style="margin:0;">
                                    ${passwordField}
                                    <input type="hidden" name="action" value="download">
                                    <button type="submit" class="btn btn-primary">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                        Download
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error('Download handler error:', err);
        if (!res.headersSent) res.status(500).send('Server Error');
    }
});

function renderPasswordPage(filename, submitUrl, error = null) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Protected File</title>
            <style>
                body { background: #0f172a; color: white; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); width: 100%; max-width: 400px; }
                h2 { margin-top: 0; color: #f8fafc; }
                input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid ${error ? '#ef4444' : '#475569'}; background: #334155; color: white; margin-bottom: 1.5rem; box-sizing: border-box; font-size: 16px; outline: none; }
                input:focus { border-color: #3b82f6; }
                button { width: 100%; background: #3b82f6; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; }
                button:hover { background: #2563eb; }
                .error { color: #ef4444; margin-bottom: 15px; display: block; }
            </style>
        </head>
        <body>
            <div class="card">
                <div style="font-size: 48px; margin-bottom: 1rem;">🔒</div>
                <h2>Password Protected</h2>
                <p style="color: #94a3b8; margin-bottom: 2rem;">Enter password to view <strong>${filename}</strong></p>
                ${error ? `<span class="error">${error}</span>` : ''}
                <form method="POST" action="${submitUrl}">
                    <input type="password" name="password" placeholder="Enter Password" required autofocus>
                    <button type="submit">Unlock</button>
                </form>
            </div>
        </body>
        </html>
    `;
}

// Batch Download Page
app.all('/download/batch/:batchId', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { batchId } = req.params;
        const files = await File.find({ batchId });

        if (!files || files.length === 0) {
            return res.status(404).send('Batch not found or expired');
        }

        // --- BATCH PASSWORD CHECK ---
        // Assume if one file has password, all do (since they were uploaded together)
        const sampleFile = files[0];
        let isPasswordVerified = false;
        let batchPasswordHash = null;

        if (sampleFile.password) {
            const providedPassword = req.body.password;

            if (!providedPassword) {
                return res.send(renderPasswordPage(`${files.length} Files`, `/download/batch/${batchId}`));
            }

            const hash = crypto.createHash('sha256').update(providedPassword).digest('hex');
            if (hash !== sampleFile.password) {
                return res.status(403).send(renderPasswordPage(`${files.length} Files`, `/download/batch/${batchId}`, 'Incorrect Password'));
            }

            isPasswordVerified = true;
            batchPasswordHash = sampleFile.password;
        }

        // Generate HTML list
        const fileListHtml = files.map(f => {
            const isImage = f.mimetype.startsWith('image/');
            const isVideo = f.mimetype.startsWith('video/');
            const isAudio = f.mimetype.startsWith('audio/');
            const isPdf = f.mimetype === 'application/pdf';

            // Allow preview check
            const canPreview = (!f.password || isPasswordVerified) && (isImage || isVideo || isAudio || isPdf);

            let viewToken = null;
            if (isPasswordVerified && batchPasswordHash) {
                viewToken = crypto.createHmac('sha256', ENCRYPTION_KEY)
                    .update(f.shareId + batchPasswordHash)
                    .digest('hex');
            }

            const previewUrl = viewToken ? `/content/${f.shareId}?token=${viewToken}` : `/content/${f.shareId}`;
            const passwordField = isPasswordVerified ? `<input type="hidden" name="password" value="${req.body.password}">` : '';

            let icon = `<span style="font-size:24px; margin-right:10px;">📄</span>`;
            if (canPreview && isImage) icon = `<img src="${previewUrl}" style="height:40px; width:40px; object-fit:cover; border-radius:4px; margin-right:10px;">`;
            else if (isPdf) icon = `<span style="font-size:24px; margin-right:10px;">🔴</span>`;
            else if (isVideo) icon = `<span style="font-size:24px; margin-right:10px;">🎬</span>`;
            else if (isAudio) icon = `<span style="font-size:24px; margin-right:10px;">🎵</span>`;

            return `
                <div class="file-item">
                    <div class="file-info-group">
                        ${icon}
                        <div class="file-details">
                            <span class="file-name">${f.originalName}</span>
                            <span class="file-size">(${(f.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                    </div>
                    
                    <div class="actions">
                        ${canPreview ? `
                        <a href="${previewUrl}" target="_blank" class="btn btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            View
                        </a>` : ''}
                        
                        <form method="POST" action="/download/${f.shareId}" style="margin:0;">
                            ${passwordField}
                            <input type="hidden" name="action" value="download">
                            <button type="submit" class="btn btn-primary">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Download
                            </button>
                        </form>
                    </div>
                </div>
            `;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Download Batch - DropZone</title>
                <style>
                    body { background: #0f172a; color: white; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; padding: 20px; box-sizing: border-box; margin: 0; min-height: 100vh; }
                    .container { max-width: 600px; width: 100%; margin-top: 40px; }
                    .header-icon { font-size: 48px; text-align: center; display: block; margin-bottom: 10px; }
                    h1 { text-align: center; color: #f8fafc; margin-bottom: 30px; font-size: 24px; word-wrap: break-word; }
                    
                    .file-list { background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
                    .file-item { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 20px; gap: 15px; border-bottom: 1px solid #334155; }
                    .file-item:last-child { border-bottom: none; }
                    
                    .file-info-group { display: flex; align-items: center; flex: 1; min-width: 0; }
                    .file-details { display: flex; flex-direction: column; min-width: 0; flex: 1; }
                    .file-name { font-weight: 600; color: #f1f5f9; font-size: 16px; margin-bottom: 4px; word-break: break-all; }
                    .file-size { font-size: 13px; color: #94a3b8; }
                    
                    .actions { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }
                    
                    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 14px; text-decoration: none; border: none; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
                    .btn-primary { background: #3b82f6; color: white; }
                    .btn-primary:hover { background: #2563eb; }
                    .btn-secondary { background: #334155; color: white; }
                    .btn-secondary:hover { background: #475569; }
                    
                    @media (max-width: 480px) {
                        .file-item { flex-direction: column; align-items: flex-start; }
                        .actions { width: 100%; justify-content: stretch; }
                        .btn { flex: 1; justify-content: center; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <span class="header-icon">📦</span>
                    <h1>${files.length} Files Shared</h1>
                    
                    <div class="file-list">
                        ${fileListHtml}
                    </div>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Batch Error:', error);
        res.status(500).send('Server Error');
    }
});

// Generate QR Code endpoint
app.get('/api/qr/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;
        const file = await File.findOne({ shareId });

        if (!file) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        const hostUrl = process.env.HOST_URL || (req.get('host').includes('localhost') ? `${req.protocol}://${getNetworkIp()}:${PORT}` : `${req.protocol}://${req.get('host')}`);
        const shareUrl = `${hostUrl}/download/${shareId}`;
        const start = Date.now();
        const qrCodeDataUrl = await QRCode.toDataURL(shareUrl);

        res.json({
            success: true,
            qrCode: qrCodeDataUrl
        });
    } catch (error) {
        console.error('QR Code error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Generate Batch QR Code endpoint
app.get('/api/qr-batch/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        // Verify batch exists
        const count = await File.countDocuments({ batchId });

        if (count === 0) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        const hostUrl = process.env.HOST_URL || (req.get('host').includes('localhost') ? `${req.protocol}://${getNetworkIp()}:${PORT}` : `${req.protocol}://${req.get('host')}`);
        const shareUrl = `${hostUrl}/download/batch/${batchId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(shareUrl);

        res.json({
            success: true,
            qrCode: qrCodeDataUrl
        });

    } catch (error) {
        console.error('Batch QR Code error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Send email with share link
app.post('/api/send-email', async (req, res) => {
    try {
        const { shareUrl, recipientEmail, senderEmail, fileName } = req.body;

        if (!shareUrl || !recipientEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const mailOptions = {
            from: senderEmail || process.env.SMTP_USER,
            to: recipientEmail,
            subject: `File shared with you: ${fileName || 'Download'}`,
            html: `
                                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                            <h2 style="color: #0f172a;">You've received a file!</h2>
                                            <p style="color: #475569; font-size: 16px;">
                                                ${senderEmail ? `${senderEmail} has` : 'Someone has'} shared a file with you.
                                            </p>
                                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                                <p style="margin: 0; color: #64748b; font-size: 14px;">FILE NAME</p>
                                                <p style="margin: 10px 0 0 0; color: #0f172a; font-size: 18px; font-weight: bold;">
                                                    ${fileName || 'Shared File'}
                                                </p>
                                            </div>
                                            <a href="${shareUrl}" style="display: inline-block; padding: 14px 28px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0;">
                                                Download File
                                            </a>
                                            <p style="color: #94a3b8; font-size: 14px; margin-top: 30px;">
                                                This link will expire in 24 hours.
                                            </p>
                                        </div>
                                        `
        };

        const info = await transporter.sendMail(mailOptions);

        console.log('Mock Email sent successfully. ID:', info.messageId);

        res.json({ success: true, message: 'Email sent successfully' });

    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Get file info endpoint
app.get('/api/file/:shareId', async (req, res) => {
    const { shareId } = req.params;

    try {
        const file = await File.findOne({ shareId });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if expired
        if (new Date() > file.expiresAt) {
            await deleteFile(shareId);
            return res.status(410).json({ error: 'File has expired' });
        }

        res.json({
            originalName: file.originalName,
            size: file.size,
            uploadedAt: file.uploadedAt,
            expiresAt: file.expiresAt,
            downloadCount: file.downloadCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// Helper function to delete file
async function deleteFile(shareId) {
    try {
        const file = await File.findOne({ shareId });
        if (file) {
            const filePath = path.join(uploadsDir, file.filename);

            // Delete physical file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted file: ${file.filename}`);
            } else {
                console.log(`File not found on disk, removing from DB: ${file.filename}`);
            }

            // Remove from metadata
            await File.deleteOne({ shareId });
        }
    } catch (error) {
        console.error('Error deleting file:', error);
    }
}

// Clean up expired files on server start
async function cleanupExpiredFiles() {
    try {
        const expiredFiles = await File.find({ expiresAt: { $lt: new Date() } });

        for (const file of expiredFiles) {
            await deleteFile(file.shareId);
        }

        if (expiredFiles.length > 0) {
            console.log(`Cleaned up ${expiredFiles.length} expired files`);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredFiles, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Upload directory: ${uploadsDir}`);
    cleanupExpiredFiles();
});

module.exports = app;
