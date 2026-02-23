const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    shareId: {
        type: String,
        required: true,
        unique: true
    },
    batchId: {
        type: String,
        default: null
    },
    originalName: {
        type: String,
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    mimetype: {
        type: String,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    // Future proofing fields
    password: {
        type: String, // Hashed password
        default: null
    },
    iv: {
        type: String, // Encryption IV
        default: null
    }
});

module.exports = mongoose.model('File', FileSchema);
