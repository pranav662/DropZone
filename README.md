# 🌌 DROPZONE

### **Peer-to-Peer File Sharing | Reinvented for the Modern Web**

[![WebRTC](https://img.shields.io/badge/Engine-WebRTC-blue?style=for-the-badge&logo=webrtc)](https://webrtc.org/)
[![Security](https://img.shields.io/badge/Security-DTLS%201.3-green?style=for-the-badge&logo=lock)](https://en.wikipedia.org/wiki/Datagram_Transport_Layer_Security)
[![Tech](https://img.shields.io/badge/Stack-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Design](https://img.shields.io/badge/Aesthetic-Glassmorphism-purple?style=for-the-badge&logo=css3)](https://glassmorphism.com/)

**DropZone** is a high-performance, browser-based file-sharing application that bypasses traditional server-side bottlenecks. Built on the cutting edge of **WebRTC** and **DTLS 1.3**, it enables direct, encrypted, peer-to-peer (P2P) transfers without ever storing your sensitive data in the cloud.

---

## ✨ Features

### 🚀 **Next-Gen P2P Engine**
- **Direct Transfers**: Send files directly between browsers. No server upload limits, no storage delays.
- **Multi-File Support**: Transfer entire sets of files in a single session with real-time individual and total progress tracking.
- **Smart Backpressure**: Optimized chunking (16KB) with intelligent buffer management to prevent browser memory overflow during large transfers.

### 🔒 **Security First**
- **DTLS 1.3 Encryption**: Every byte is encrypted using the latest Datagram Transport Layer Security (DTLS 1.3) protocol.
- **ECDSA Certificates**: Handshake secured with P-256 elliptic curve signatures for maximum cryptographic strength.
- **Signaling Only**: The server only facilitates the initial "handshake" (signaling) and never sees your file content.

### 🎨 **Premium Aesthetic & UX**
- **Glassmorphism UI**: A stunning, semi-transparent interface with deep blurs and sharp accents.
- **Dynamic Animations**: Premium icon animations, staggered logo entrances, morphing background orbs, and physics-based interactions.
- **Quick Pick Modal System**: A sophisticated modal interface for seamless email contact management and intelligent recipient selection.
- **Responsive Mastery**: Designed for high-end desktop monitors and mobile devices alike.
- **Unified Sharing**: Instantly bridge the gap with dynamic QR code generation and integrated email sharing.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vanilla JavaScript (ES6+), Modern CSS (Gradients, Blur, Transitions) |
| **P2P Engine** | WebRTC (RTCDataChannel), ECDSA Certificates, STUN/TURN (Global Relay) |
| **Real-time** | Socket.io (Signaling & Presence) |
| **Backend** | Node.js, Express, Nodemailer |
| **Database** | MongoDB (Mongoose) for session state and history |
| **Security** | DTLS 1.3 (Negotiated via browser engine) |

---

## 🚦 Quick Start

### 1. Prerequisites
- **Node.js** (v16.x or higher)
- **MongoDB** (Local or Atlas)
- **SMTP credentials** (for Email Sharing)

### 2. Installation
```bash
git clone https://github.com/pranav662/DropZone.git
cd DropZone
npm install
```

### 3. Configuration
Rename `.env.example` to `.env` and configure your keys:
```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 4. Run
```bash
# Production mode
npm start

# Development with hot-reload
npm run dev
```

---

## 📖 How It Works

1. **Create a Room**: Drag and drop your files into the glassmorphic drop zone.
2. **Share the Link**: Copy the unique room URL or generate a QR code.
3. **P2P Connection**: When the recipient opens the link, a direct WebRTC data channel is established.
4. **Encrypted Transfer**: Files are chunked and streamed directly to the recipient over a secure DTLS 1.3 tunnel.
5. **Auto-Clean**: The signaling session expires automatically after the transfer is complete.

---

## 🛡️ Security Stats Monitoring
DropZone includes a real-time security monitor that reports the negotiated TLS version and cipher suite for every P2P session, giving users peace of mind that their transfer is meeting modern security standards.

---

## 🤝 Contributing
We welcome contributions! Please feel free to open issues or submit pull requests.

## 📄 License
Released under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for a faster, more secure web.
</p>
 Mono & DM Sans from Google Fonts

---

**Built with ❤️ using vanilla HTML, CSS, JavaScript, and Node.js**
