// ============================================================
// DropZone WebRTC P2P File Transfer Engine
// Uses RTCDataChannel with DTLS 1.3 encryption
// ============================================================

const CHUNK_SIZE = 16 * 1024; // 16KB chunks for data channel

class DropZoneWebRTC {
    constructor() {
        this.socket = null;
        this.peerConnections = new Map(); // peerId -> RTCPeerConnection
        this.dataChannels = new Map();    // peerId -> RTCDataChannel
        this.roomId = null;
        this.role = null; // 'sender' or 'receiver'
        this.files = [];  // Files to send (File objects)
        this.filesMeta = []; // File metadata [{name, size, type}]
        this.onStatusChange = null;
        this.onProgress = null;
        this.onFileReceived = null;
        this.onError = null;
        this.onPeerCount = null;
        this.onSecurityStats = null;
        this.onSignalingStatus = null;

        // Receiver state
        this._receiveBuffers = new Map(); // peerId -> { chunks, metadata, received }

        // ICE candidate buffering for signaling race conditions
        this.earlyCandidates = new Map(); // peerId -> Array of candidate
        this.securityIntervals = new Map(); // peerId -> intervalId
    }

    // ============================================================
    // ICE / DTLS Configuration
    // ============================================================
    _getRTCConfig() {
        return {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            // Request ECDSA certificates for DTLS 1.3 support
            certificates: undefined // Will be set after generating ECDSA cert
        };
    }

    async _generateCertificate() {
        try {
            const cert = await RTCPeerConnection.generateCertificate({
                name: 'ECDSA',
                namedCurve: 'P-256'
            });
            return cert;
        } catch (e) {
            console.warn('[WebRTC] ECDSA certificate generation failed, using default:', e);
            return null;
        }
    }

    async _createPeerConnection(peerId) {
        const config = this._getRTCConfig();

        // Generate ECDSA cert for DTLS 1.3
        const cert = await this._generateCertificate();
        if (cert) {
            config.certificates = [cert];
        }

        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const type = event.candidate.type || 'unknown';
                console.log(`[WebRTC] ICE candidate found: ${type} for ${peerId}`);
                this.socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    targetId: peerId
                });
            }
        };

        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
            if (pc.connectionState !== 'connected') {
                console.warn(`[WebRTC] Connection timeout for ${peerId}`);
                if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
                    this._emitStatus('error');
                    if (this.onError) this.onError('Connection timed out. This often happens on hotspots with AP Isolation. Try turning off your laptop firewall or using a different Wi-Fi.');
                }
            }
        }, 15000); // 15s timeout

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state (${peerId}): ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                clearTimeout(connectionTimeout);
                this._emitStatus('connected');
            } else if (pc.connectionState === 'failed') {
                clearTimeout(connectionTimeout);
                console.error(`[WebRTC] P2P Connection failed for ${peerId} (NAT/Firewall issue)`);
                this._emitStatus('error');
                if (this.onError) this.onError('P2P Connection failed. A strict firewall or network NAT (like AP Isolation) is blocking the direct connection.');
                this._cleanupPeer(peerId);
            } else if (pc.connectionState === 'disconnected') {
                clearTimeout(connectionTimeout);
                this._cleanupPeer(peerId);
            }
        };

        // Log DTLS state
        pc.ondtlsstatechange = () => {
            console.log(`[WebRTC] DTLS state: ${pc.sctp?.transport?.state || 'unknown'}`);
            if (pc.sctp?.transport?.state === 'connected') {
                this._startSecurityMonitoring(peerId, pc);
            }
        };

        this.peerConnections.set(peerId, pc);
        return pc;
    }

    // ============================================================
    // SECURITY MONITORING
    // ============================================================
    _startSecurityMonitoring(peerId, pc) {
        if (this.securityIntervals.has(peerId)) return;
        
        let attempts = 0;
        const intervalId = setInterval(async () => {
            attempts++;
            if (pc.connectionState !== 'connected' && attempts > 1) {
                // If disconnected after initial connection, clear
                clearInterval(intervalId);
                this.securityIntervals.delete(peerId);
                return;
            }

            if (attempts > 30) { // Stop after 45s
                clearInterval(intervalId);
                this.securityIntervals.delete(peerId);
                return;
            }

            try {
                const stats = await pc.getStats();
                stats.forEach(report => {
                    if (report.type === 'transport') {
                        if (report.tlsVersion) {
                            const version = report.tlsVersion === '0304' ? 'DTLS 1.3' : 
                                          report.tlsVersion === '0303' ? 'DTLS 1.2' : report.tlsVersion;
                            
                            console.log(`[Security] Negotiated: ${version}, Cipher: ${report.dtlsCipher}`);
                            if (this.onSecurityStats) {
                                this.onSecurityStats({
                                    peerId,
                                    version,
                                    cipher: report.dtlsCipher
                                });
                            }
                            
                            clearInterval(intervalId);
                            this.securityIntervals.delete(peerId);
                        }
                    }
                });
            } catch (e) {
                console.warn('[WebRTC] Security stats check failed:', e);
            }
        }, 1500);
        
        this.securityIntervals.set(peerId, intervalId);
    }

    // ============================================================
    // SOCKET.IO CONNECTION
    // ============================================================
    connect(serverUrl) {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.connected) {
                if (this.role === 'sender' && this.roomId) {
                    this.socket.emit('create-room', { roomId: this.roomId });
                } else if (this.role === 'receiver' && this.roomId) {
                    this.socket.emit('join-room', { roomId: this.roomId });
                }
                return resolve();
            }

            if (this.socket) {
                this.socket.disconnect();
            }

            this.socket = io(serverUrl || window.location.origin);

            this.socket.on('connect', () => {
                console.log('[Signal] Connected to signaling server');
                if (this.onSignalingStatus) this.onSignalingStatus('online');
                
                // If this is a reconnection, re-associate the new socket ID with the room
                if (this.role === 'sender' && this.roomId) {
                    this.socket.emit('create-room', { roomId: this.roomId });
                } else if (this.role === 'receiver' && this.roomId) {
                    this.socket.emit('join-room', { roomId: this.roomId });
                }
                
                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('[Signal] Disconnected from signaling server');
                if (this.onSignalingStatus) this.onSignalingStatus('offline');
            });

            this.socket.on('connect_error', (err) => {
                console.error('[Signal] Connection error:', err);
                if (this.onSignalingStatus) this.onSignalingStatus('offline');
                reject(err);
            });

            // Signaling events
            this.socket.on('room-joined', (data) => this._onRoomJoined(data));
            this.socket.on('room-error', (data) => this._onRoomError(data));
            this.socket.on('peer-joined', (data) => this._onPeerJoined(data));
            this.socket.on('offer', (data) => this._onOffer(data));
            this.socket.on('answer', (data) => this._onAnswer(data));
            this.socket.on('ice-candidate', (data) => this._onIceCandidate(data));
            this.socket.on('sender-disconnected', () => this._onSenderDisconnected());
            this.socket.on('peer-disconnected', (data) => this._onPeerDisconnected(data));
        });
    }

    // ============================================================
    // SENDER FLOW
    // ============================================================
    async createRoom(roomId, files) {
        this.role = 'sender';
        this.roomId = roomId;
        this.files = Array.from(files);
        this.filesMeta = this.files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
        }));

        this.socket.emit('create-room', { roomId });
        this._emitStatus('waiting');
    }

    async _onPeerJoined({ peerId, roomId }) {
        console.log(`[Signal] Peer joined: ${peerId}`);

        try {
            const pc = await this._createPeerConnection(peerId);

            // Create data channel for file transfer
            const dc = pc.createDataChannel('fileTransfer', {
                ordered: true
            });

            dc.binaryType = 'arraybuffer';
            this.dataChannels.set(peerId, dc);

            dc.onopen = () => {
                console.log(`[DataChannel] Open with ${peerId}`);
                this._sendFiles(peerId);
            };

            dc.onclose = () => {
                console.log(`[DataChannel] Closed with ${peerId}`);
            };

            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.emit('offer', {
                offer: pc.localDescription,
                targetId: peerId
            });

            this._updatePeerCount();
        } catch (error) {
            console.error('[WebRTC] _onPeerJoined error:', error);
            this._emitStatus('error');
            if (this.onError) {
                this.onError(`Failed to create P2P connection: ${error.message || 'Unsupported WebRTC feature or browser security restriction.'}`);
            }
        }
    }

    async _sendFiles(peerId) {
        const dc = this.dataChannels.get(peerId);
        if (!dc || dc.readyState !== 'open') return;

        this._emitStatus('transferring');

        for (let fileIndex = 0; fileIndex < this.files.length; fileIndex++) {
            const file = this.files[fileIndex];

            // Send file metadata first
            dc.send(JSON.stringify({
                type: 'file-meta',
                name: file.name,
                size: file.size,
                mimeType: file.type,
                fileIndex,
                totalFiles: this.files.length
            }));

            // Read and send chunks
            const arrayBuffer = await file.arrayBuffer();
            const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
            let offset = 0;
            let chunkIndex = 0;

            const sendNextChunk = () => {
                while (offset < arrayBuffer.byteLength) {
                    // Backpressure: wait if buffer is getting full
                    if (dc.bufferedAmount > CHUNK_SIZE * 64) {
                        setTimeout(sendNextChunk, 50);
                        return;
                    }

                    const end = Math.min(offset + CHUNK_SIZE, arrayBuffer.byteLength);
                    const chunk = arrayBuffer.slice(offset, end);
                    dc.send(chunk);
                    offset = end;
                    chunkIndex++;

                    // Progress
                    const totalProgress = ((fileIndex + (chunkIndex / totalChunks)) / this.files.length) * 100;
                    if (this.onProgress) {
                        this.onProgress({
                            peerId,
                            fileIndex,
                            fileName: file.name,
                            chunkIndex,
                            totalChunks,
                            progress: totalProgress
                        });
                    }
                }

                // File complete signal
                dc.send(JSON.stringify({
                    type: 'file-complete',
                    fileIndex
                }));

                // All files done
                if (fileIndex === this.files.length - 1) {
                    dc.send(JSON.stringify({ type: 'all-complete' }));
                    this._emitStatus('complete');
                }
            };

            sendNextChunk();

            // Wait for this file to finish before starting next
            await new Promise(resolve => {
                const check = () => {
                    if (offset >= arrayBuffer.byteLength) {
                        resolve();
                    } else {
                        setTimeout(check, 100);
                    }
                };
                check();
            });
        }
    }

    // ============================================================
    // RECEIVER FLOW
    // ============================================================
    async joinRoom(roomId) {
        this.role = 'receiver';
        this.roomId = roomId;
        this.socket.emit('join-room', { roomId });
        this._emitStatus('connecting');
    }

    async _onOffer({ offer, senderId }) {
        if (this.role !== 'receiver') return;

        try {
            const pc = await this._createPeerConnection(senderId);

            pc.ondatachannel = (event) => {
                const dc = event.channel;
                dc.binaryType = 'arraybuffer';
                this.dataChannels.set(senderId, dc);

                this._receiveBuffers.set(senderId, {
                    chunks: [],
                    metadata: null,
                    received: 0,
                    files: []
                });

                dc.onmessage = (e) => this._onDataMessage(senderId, e);

                dc.onopen = () => {
                    console.log(`[DataChannel] Open with sender ${senderId}`);
                    this._emitStatus('connected');
                };
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Drain candidates queued while waiting for remote description
            await this._drainEarlyCandidates(senderId, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('answer', {
                answer: pc.localDescription,
                targetId: senderId
            });
        } catch (error) {
            console.error('[WebRTC] _onOffer error:', error);
            this._emitStatus('error');
            if (this.onError) {
                this.onError(`Browser blocked P2P connection: ${error.message || 'WebRTC requires a secure HTTPS connection on mobile devices.'}`);
            }
        }
    }

    _onDataMessage(senderId, event) {
        const state = this._receiveBuffers.get(senderId);
        if (!state) return;

        if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);

            if (msg.type === 'file-meta') {
                state.metadata = msg;
                state.chunks = [];
                state.received = 0;
                this._emitStatus('transferring');
                if (this.onProgress) {
                    this.onProgress({
                        fileName: msg.name,
                        fileIndex: msg.fileIndex,
                        totalFiles: msg.totalFiles,
                        progress: 0
                    });
                }
            } else if (msg.type === 'file-complete') {
                // Assemble file
                const blob = new Blob(state.chunks, {
                    type: state.metadata.mimeType || 'application/octet-stream'
                });
                state.files.push({
                    name: state.metadata.name,
                    blob: blob,
                    size: state.metadata.size
                });

                if (this.onFileReceived) {
                    this.onFileReceived({
                        name: state.metadata.name,
                        blob: blob,
                        size: state.metadata.size,
                        fileIndex: msg.fileIndex
                    });
                }

                state.chunks = [];
                state.metadata = null;
                state.received = 0;
            } else if (msg.type === 'all-complete') {
                this._emitStatus('complete');

                // Auto-download disabled in favor of manual UI buttons
                // for (const file of state.files) {
                //     this._downloadBlob(file.blob, file.name);
                // }
            }
        } else {
            // Binary chunk
            state.chunks.push(event.data);
            state.received += event.data.byteLength;

            if (state.metadata && this.onProgress) {
                const fileProgress = (state.received / state.metadata.size) * 100;
                const totalProgress = ((state.metadata.fileIndex + (fileProgress / 100)) / state.metadata.totalFiles) * 100;
                this.onProgress({
                    fileName: state.metadata.name,
                    fileIndex: state.metadata.fileIndex,
                    totalFiles: state.metadata.totalFiles,
                    progress: totalProgress,
                    fileProgress: Math.min(fileProgress, 100)
                });
            }
        }
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ============================================================
    // SIGNALING HANDLERS
    // ============================================================
    _onRoomJoined(data) {
        console.log(`[Signal] Room joined as ${data.role}:`, data.roomId);
        if (data.role === 'receiver' && data.files) {
            this.filesMeta = data.files;
        }
    }

    _onRoomError(data) {
        console.error('[Signal] Room error:', data.message);
        this._emitStatus('error');
        if (this.onError) this.onError(data.message);
    }

    async _onAnswer({ answer, senderId }) {
        const pc = this.peerConnections.get(senderId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Drain candidates queued while waiting for remote description
            await this._drainEarlyCandidates(senderId, pc);
        }
    }

    async _onIceCandidate({ candidate, senderId }) {
        const pc = this.peerConnections.get(senderId);

        // Only process if pc exists AND remote description is set
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            if (candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('[WebRTC] ICE candidate error:', e);
                }
            }
        } else {
            // Buffer candidate if pc isn't ready or remote desc isn't set yet
            if (candidate) {
                if (!this.earlyCandidates.has(senderId)) {
                    this.earlyCandidates.set(senderId, []);
                }
                this.earlyCandidates.get(senderId).push(candidate);
                console.log(`[WebRTC] Buffered early ICE candidate for ${senderId}`);
            }
        }
    }

    async _drainEarlyCandidates(peerId, pc) {
        if (this.earlyCandidates.has(peerId)) {
            const candidates = this.earlyCandidates.get(peerId);
            this.earlyCandidates.delete(peerId);
            console.log(`[WebRTC] Draining ${candidates.length} early ICE candidates for ${peerId}`);

            for (const candidate of candidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('[WebRTC] Early ICE candidate error:', e);
                }
            }
        }
    }

    _onSenderDisconnected() {
        this._emitStatus('sender-offline');
        if (this.onError) {
            this.onError('Sender went offline. They can reconnect to resume sharing.');
        }
    }

    _onPeerDisconnected({ peerId }) {
        this._cleanupPeer(peerId);
        this._updatePeerCount();
    }

    // ============================================================
    // HELPERS
    // ============================================================
    _emitStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    }

    _updatePeerCount() {
        const count = this.peerConnections.size;
        if (this.onPeerCount) this.onPeerCount(count);
    }

    _cleanupPeer(peerId) {
        if (this.securityIntervals.has(peerId)) {
            clearInterval(this.securityIntervals.get(peerId));
            this.securityIntervals.delete(peerId);
        }

        const dc = this.dataChannels.get(peerId);
        if (dc) {
            dc.close();
            this.dataChannels.delete(peerId);
        }

        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }

        this._receiveBuffers.delete(peerId);
        this._updatePeerCount();
    }

    disconnect() {
        for (const [peerId] of this.peerConnections) {
            this._cleanupPeer(peerId);
        }

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.roomId = null;
        this.role = null;
    }

    // ============================================================
    // EXTERNAL API FOR UI
    // ============================================================
    getReceivedFiles(senderId) {
        const state = this._receiveBuffers.get(senderId);
        return state ? state.files : [];
    }

    downloadFile(senderId, fileIndex) {
        const state = this._receiveBuffers.get(senderId);
        if (state && state.files[fileIndex]) {
            const file = state.files[fileIndex];
            this._downloadBlob(file.blob, file.name);
        }
    }

    downloadAll(senderId) {
        const state = this._receiveBuffers.get(senderId);
        if (state) {
            state.files.forEach(file => {
                this._downloadBlob(file.blob, file.name);
            });
        }
    }
}

// Export for use
window.DropZoneWebRTC = DropZoneWebRTC;
