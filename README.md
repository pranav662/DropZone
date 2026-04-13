# 🌌 DROPZONE

### **Direct Peer-to-Peer File Sharing | Reinvented for the Modern Web**

[![WebRTC](https://img.shields.io/badge/Engine-WebRTC-blue?style=for-the-badge&logo=webrtc)](https://webrtc.org/)
[![Security](https://img.shields.io/badge/Security-DTLS%201.3-green?style=for-the-badge&logo=lock)](https://en.wikipedia.org/wiki/Datagram_Transport_Layer_Security)
[![Tech](https://img.shields.io/badge/Stack-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](https://opensource.org/licenses/MIT)

**DropZone** is a high-performance, browser-based file-sharing application that bypasses traditional server-side bottlenecks. Built on the cutting edge of **WebRTC** and **DTLS 1.3**, it enables direct, encrypted transfers without ever storing your data in the cloud.

---

## 📺 Website Preview

````carousel
![Hero Mockup](./assets/hero.png)
<!-- slide -->
![Main Interface](./assets/main.png)
<!-- slide -->
![Email Sharing](./assets/email.png)
<!-- slide -->
![Quick Pick Modal](./assets/quickpick.png)
<!-- slide -->
![QR Generation](./assets/qr.png)
````

> [!TIP]
> **View the Interactive Recording**: [Click here to view the full UI walkthrough](./assets/preview.webp)

---

## ✨ Features

### 🚀 **Next-Gen P2P Engine**
- **Direct Transfers**: Send files directly between browsers. No server upload limits, no storage delays.
- **Smart Backpressure**: 16KB chunking and intelligent buffer management to prevent memory overflow.
- **Multi-File Support**: Transfer batches of files with real-time progress for each.

### 🔒 **Security First**
- **DTLS 1.3 Encryption**: Negotiated via browser for maximum security.
- **Zero-Storage**: Files never touch the server disk; the server only facilitates signaling.
- **ECDSA Handshake**: Secure identity verification for every P2P session.

### 🎨 **Premium Aesthetic & UX**
- **Glassmorphism UI**: Stunning semi-transparent interface with deep blurs and sharp accents.
- **Dynamic Animations**: Canvas particles, 3D card tilt, and physics-based icon interactions.
- **Quick Pick Modal**: Sophisticated contact management for rapid recipient selection.
- **Unified Sharing**: Instant QR codes and professional HTML email invitations.

---

## 🏗️ Architecture

```mermaid
sequenceDiagram
    participant S as Sender
    participant Sig as Signaling Server
    participant R as Receiver
    
    Note over S,R: 1. Setup Phase
    S->>Sig: Create Room (Metadata)
    Sig-->>S: shareURL established
    
    Note over S,R: 2. Discovery Phase
    R->>Sig: Join Room (roomId)
    Sig->>S: peer-joined notification
    
    Note over S,R: 3. WebRTC Negotiation
    S->>Sig: Send Offer (SDP)
    Sig->>R: Forward Offer
    R->>Sig: Send Answer (SDP)
    Sig->>S: Forward Answer
    S->>Sig: ICE Candidates
    Sig->>R: Relay ICE Candidates
    
    Note over S,R: 4. Secure Data Transfer
    S<->>R: DTLS 1.3 Secure P2P Channel
    S-->>R: Encrypted File Chunks (16KB)
    Note right of R: Reassembled in Memory
```

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vanilla JS (ES6+), Modern CSS (Glassmorphism), Canvas API |
| **P2P Engine** | WebRTC (DataChannel), DTLS 1.3, ECDSA |
| **Signaling** | Socket.io (Node.js/Express) |
| **Utilities** | QRCode.js, Nodemailer (Email Invitations) |
| **Infrastructure** | Node.js, Express |

---

## 🚦 Installation & Setup

1. **Clone & Install**
   ```bash
   git clone https://github.com/pranav662/DropZone.git
   cd DropZone
   npm install
   ```

2. **Configure Environment**
   Rename `.env.example` to `.env`:
   ```env
   PORT=3000
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```

3. **Launch**
   ```bash
   npm start
   ```

---

## 🤝 Contributing
We welcome contributions! Please feel free to open issues or submit pull requests to help make DropZone better.

## 📄 License
Released under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for a faster, more secure web.
</p>
