# DropZone: Modern File Sharing

## Vision

DropZone is an intuitive, secure file-sharing platform designed for seamless single and batch uploads. Users drop their files onto the web application, optionally secure them with a password, and distribute them anywhere via dynamically generated shareable URLs, QR codes, or platform-dispatched emails.

## Core Directives

1. **Security**: All files are forcibly encrypted on disk using AES-256-CBC, and automatically pruned after a 24-hour retention window.
2. **Speed**: Upload processing and download streaming should add near-zero overhead.
3. **Simplicity**: No required user accounts or complex onboarding to dispatch files; UI is singular and frictionless.

## Critical Requirements (Must-haves)

- [x] Supports single and multi-file drag-and-drop or file pane uploads (max 100MB limit per request).
- [x] Real-time file upload progression bars via XMLHttpRequests.
- [x] Generates universal "Batch Links" and "Single Links".
- [x] Dispatches HTML-styled template emails via mock/local network SMTP nodes.
- [x] Presents QR Codes directly on the UI for downloading dynamically.
- [x] Protects specific files or explicit file batches behind SHA-256 derived password schemas.
- [x] Features internal cron or timed polling functions that physically and logically destruct expired files after 24 hours.

## Technical Foundations

- Stack: Node.js, Express, MongoDB
- Target Platforms: Standard Chromium / WebKit clients (Desktop, Mobile Web).
- Data Persistence: Mongoose (Cloud/Atlas Mongo) mapping file metadata, `uploads/` folder housing `.enc` cryptograms.

## Boundaries and Constraints
- Native UI runs on Vanilla HTML/CSS/JS cleanly decoupled into root (`index.html`, `script.js`).
- Framework usage (React, etc.) is disallowed unless explicitly requested or mandated for specific feature migrations.
- File previews are constrained to familiar browser codecs (`image/*`, `application/pdf`, `video/*`, `audio/*`).

## Acceptance Criteria
- End-user can establish a file drop, enforce password, download QR, and view encrypted file through provided URL seamlessly across sessions. Files appropriately expire within 24h.

---
**Status:** FINALIZED
