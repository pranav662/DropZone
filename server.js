require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const cors = require('cors');
const QRCode = require('qrcode');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8, // 100MB for signaling
    pingInterval: 10000,
    pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================================
// ROOM STATE — In-memory tracking of active P2P rooms
// ============================================================
const rooms = new Map(); // roomId -> { senderId, files: [{name, size, type}], createdAt }

// Get Network IP
function getNetworkIp() {
    const interfaces = os.networkInterfaces();
    let bestMatch = 'localhost';

    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('vmware') ||
            name.toLowerCase().includes('virtual') ||
            name.toLowerCase().includes('vbox') ||
            name.toLowerCase().includes('pseudo')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi') || name.toLowerCase().includes('wlan')) {
                    return iface.address;
                }
                bestMatch = iface.address;
            }
        }
    }
    return bestMatch;
}

function getHostUrl(req) {
    return process.env.HOST_URL || (req.get('host').includes('localhost')
        ? `${req.protocol}://${getNetworkIp()}:${PORT}`
        : `${req.protocol}://${req.get('host')}`);
}

// Generate unique room ID
function generateRoomId() {
    return crypto.randomBytes(6).toString('base64url');
}

// ============================================================
// ROUTES
// ============================================================

// Main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// P2P Receiver page
app.get('/p2p/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'p2p-receive.html'));
});

app.post('/api/create-room', (req, res) => {
    const { files, clientUrl } = req.body; // [{name, size, type}]

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files specified' });
    }

    const roomId = generateRoomId();
    const base = clientUrl || getHostUrl(req);
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const shareUrl = `${cleanBase}/p2p-receive.html?room=${roomId}`;

    // Room is created but sender socket hasn't joined yet (will join via Socket.IO)
    rooms.set(roomId, {
        senderId: null,
        files: files,
        createdAt: Date.now()
    });

    // Auto-expire room after 24 hours
    setTimeout(() => {
        rooms.delete(roomId);
    }, 24 * 60 * 60 * 1000);

    res.json({
        success: true,
        roomId,
        shareUrl,
        files
    });
});

// Check room status
app.get('/api/room/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
        return res.json({ active: false, senderOnline: false });
    }
    res.json({
        active: true,
        senderOnline: !!room.senderId,
        files: room.files
    });
});

// Generate QR Code for P2P link
app.get('/api/qr/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const clientUrl = req.query.clientUrl;
        const base = clientUrl || getHostUrl(req);
        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
        const shareUrl = `${cleanBase}/p2p-receive.html?room=${roomId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(shareUrl);

        res.json({ success: true, qrCode: qrCodeDataUrl });
    } catch (error) {
        console.error('QR Code error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// ============================================================
// EMAIL
// ============================================================

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
        console.log('Configured real SMTP transport');
    } else {
        transporter = {
            sendMail: async (mailOptions) => {
                console.log('==================================================');
                console.log('EMAIL MOCK — (No SMTP configured)');
                console.log('To:', mailOptions.to);
                console.log('Subject:', mailOptions.subject);
                console.log('==================================================');
                return { messageId: 'mock-' + Date.now() };
            }
        };
        console.log('Configured local mock transport (logs to console)');
    }
}

createTransporter();

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
                        ${senderEmail ? `${senderEmail} has` : 'Someone has'} shared a file with you via P2P.
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
                        ⚡ This is a P2P transfer — the sender must be online for the download to work.
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// ============================================================
// SOCKET.IO SIGNALING SERVER
// ============================================================

io.on('connection', (socket) => {
    console.log(`[Signal] Client connected: ${socket.id}`);

    // Sender creates/joins a room
    socket.on('create-room', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', { message: 'Room not found. Create via API first.' });
            return;
        }

        room.senderId = socket.id;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.role = 'sender';

        console.log(`[Signal] Sender ${socket.id} joined room ${roomId}`);
        socket.emit('room-joined', { roomId, role: 'sender' });
    });

    // Receiver joins a room
    socket.on('join-room', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('room-error', { message: 'Room not found or expired.' });
            return;
        }

        if (!room.senderId) {
            socket.emit('room-error', { message: 'Sender is not online. Please try again later.' });
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.role = 'receiver';

        console.log(`[Signal] Receiver ${socket.id} joined room ${roomId}`);

        // Notify sender that a receiver wants to connect
        io.to(room.senderId).emit('peer-joined', {
            peerId: socket.id,
            roomId
        });

        // Tell receiver they're connected to the room
        socket.emit('room-joined', {
            roomId,
            role: 'receiver',
            files: room.files
        });
    });

    // WebRTC signaling: forward offer
    socket.on('offer', ({ offer, targetId }) => {
        io.to(targetId).emit('offer', {
            offer,
            senderId: socket.id
        });
    });

    // WebRTC signaling: forward answer
    socket.on('answer', ({ answer, targetId }) => {
        io.to(targetId).emit('answer', {
            answer,
            senderId: socket.id
        });
    });

    // WebRTC signaling: forward ICE candidate
    socket.on('ice-candidate', ({ candidate, targetId }) => {
        io.to(targetId).emit('ice-candidate', {
            candidate,
            senderId: socket.id
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`[Signal] Client disconnected: ${socket.id}`);

        if (socket.role === 'sender' && socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room && room.senderId === socket.id) {
                room.senderId = null; // Mark sender as offline
                // Notify all receivers in the room
                socket.to(socket.roomId).emit('sender-disconnected');
                console.log(`[Signal] Sender went offline in room ${socket.roomId}`);
            }
        }

        if (socket.role === 'receiver' && socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room && room.senderId) {
                io.to(room.senderId).emit('peer-disconnected', {
                    peerId: socket.id
                });
            }
        }
    });
});

// ============================================================
// CLEANUP
// ============================================================

// Clean up stale rooms every hour
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

    for (const [roomId, room] of rooms) {
        if (now - room.createdAt > maxAge) {
            rooms.delete(roomId);
            console.log(`[Cleanup] Expired room: ${roomId}`);
        }
    }
}, 60 * 60 * 1000);

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Network: http://${getNetworkIp()}:${PORT}`);
    console.log('Mode: Pure WebRTC P2P (signaling only)');
});

module.exports = app;
