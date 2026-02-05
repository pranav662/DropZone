require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

// Store file metadata in memory (in production, use a database)
const fileMetadata = new Map();

// Generate unique share ID
function generateShareId() {
    return crypto.randomBytes(4).toString('base64url');
}

// Configure email transporter (update with your SMTP settings)
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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload file endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const shareId = generateShareId();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        const metadata = {
            shareId,
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date(),
            expiresAt,
            downloadCount: 0
        };

        fileMetadata.set(shareId, metadata);

        // Schedule file deletion after 24 hours
        setTimeout(() => {
            deleteFile(shareId);
        }, 24 * 60 * 60 * 1000);

        const shareUrl = `${req.protocol}://${req.get('host')}/download/${shareId}`;

        res.json({
            success: true,
            shareId,
            shareUrl,
            expiresAt
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Download file endpoint
app.get('/download/:shareId', (req, res) => {
    const { shareId } = req.params;
    const metadata = fileMetadata.get(shareId);

    if (!metadata) {
        return res.status(404).send('File not found or expired');
    }

    // Check if file has expired
    if (new Date() > metadata.expiresAt) {
        deleteFile(shareId);
        return res.status(410).send('File has expired');
    }

    const filePath = path.join(uploadsDir, metadata.filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        fileMetadata.delete(shareId);
        return res.status(404).send('File not found');
    }

    // Increment download count
    metadata.downloadCount++;

    // Send file
    res.download(filePath, metadata.originalName, (err) => {
        if (err) {
            console.error('Download error:', err);
        }
    });
});

// Generate QR Code endpoint
app.get('/api/qr/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;
        const metadata = fileMetadata.get(shareId);

        if (!metadata) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        const shareUrl = `${req.protocol}://${req.get('host')}/download/${shareId}`;
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
app.get('/api/file/:shareId', (req, res) => {
    const { shareId } = req.params;
    const metadata = fileMetadata.get(shareId);

    if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Check if expired
    if (new Date() > metadata.expiresAt) {
        deleteFile(shareId);
        return res.status(410).json({ error: 'File has expired' });
    }

    res.json({
        originalName: metadata.originalName,
        size: metadata.size,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount
    });
});

// Helper function to delete file
function deleteFile(shareId) {
    const metadata = fileMetadata.get(shareId);
    if (metadata) {
        const filePath = path.join(uploadsDir, metadata.filename);

        // Delete physical file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${metadata.filename}`);
        }

        // Remove from metadata
        fileMetadata.delete(shareId);
    }
}

// Clean up expired files on server start
function cleanupExpiredFiles() {
    for (const [shareId, metadata] of fileMetadata.entries()) {
        if (new Date() > metadata.expiresAt) {
            deleteFile(shareId);
        }
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
