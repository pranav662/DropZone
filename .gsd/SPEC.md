# DropZone: Modern P2P File Sharing

## Vision

DropZone is a high-performance, browser-based file-sharing application that enables direct, secure transfers without server-side bottlenecks. Built on WebRTC and DTLS 1.3, it bypasses cloud storage entirely, ensuring maximum privacy and speed.

## Core Directives

1. **Security**: All transfers are secured via DTLS 1.3 end-to-end encryption. No files are ever stored on the server's disk; the server strictly facilitates signaling.
2. **Speed**: Direct P2P data channels enable near-zero overhead and bypass traditional upload limits.
3. **Simplicity**: No account requirement; the UI is frictionless and browser-native.

## Critical Requirements (Must-haves)

- [x] Supports single and multi-file drag-and-drop or file pane uploads (No hard size limit due to P2P).
- [x] Real-time transfer progression bars via RTCDataChannel buffering.
- [x] Generates dynamic "P2P Room Links" for direct receipt.
- [x] Dispatches HTML-styled professional email invitations with native `mailto:` fallback.
- [x] Presents QR Codes for mobile-to-desktop or desktop-to-mobile P2P receipt.
- [x] Uses ECDSA certificates for secure DTLS 1.3 handshakes.
- [x] In-memory signaling rooms that auto-expire after 24 hours.

## Technical Foundations

- **Engine:** WebRTC (RTCDataChannel), DTLS 1.3
- **Signaling:** Node.js, Socket.io
- **Frontend:** Vanilla JS, Glassmorphism CSS, Canvas API
- **Persistence:** Transient In-Memory Signaling (No database requirement for transfers).

## Boundaries and Constraints
- Native UI runs on Vanilla HTML/CSS/JS cleanly decoupled.
- Framework usage is disallowed unless explicitly mandated.
- Browser Support: Requires WebRTC-compliant browsers (Chromium, WebKit).

## Acceptance Criteria
- End-user can establish a P2P room, share a link/QR/Email, and transfer files directly browser-to-browser with verified encryption and progress.

---
**Status:** FINALIZED (P2P Migration Complete)

