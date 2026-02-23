
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function testConfig() {
    console.log('--- Config Test ---\n');

    // 1. Check Env Vars
    console.log('1. Checking Environment Variables...');
    if (!process.env.MONGO_URI) {
        console.error('FAIL: MONGO_URI is missing from .env');
    } else {
        console.log('PASS: MONGO_URI is present.');
    }

    if (!process.env.ENCRYPTION_KEY) {
        console.error('FAIL: ENCRYPTION_KEY is missing from .env');
    } else {
        console.log('PASS: ENCRYPTION_KEY is present.');
        try {
            const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
            if (key.length === 32) {
                console.log('PASS: ENCRYPTION_KEY is valid 32 bytes.');
                // Test Crypto
                try {
                    const iv = crypto.randomBytes(16);
                    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
                    console.log('PASS: Crypto cipher creation successful.');
                } catch (e) {
                    console.error('FAIL: Crypto cipher creation failed:', e.message);
                }
            } else {
                console.error(`FAIL: ENCRYPTION_KEY length is ${key.length} bytes (expected 32).`);
            }
        } catch (e) {
            console.error('FAIL: ENCRYPTION_KEY is not valid hex:', e.message);
        }
    }

    // 2. Check File Permissions
    console.log('\n2. Checking File Permissions...');
    const uploadsDir = path.join(__dirname, 'uploads');
    try {
        if (!fs.existsSync(uploadsDir)) {
            console.log('Creating uploads dir...');
            fs.mkdirSync(uploadsDir);
        }
        const testFile = path.join(uploadsDir, 'test_write.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('PASS: Can write to uploads directory.');
    } catch (e) {
        console.error('FAIL: Cannot write to uploads directory:', e.message);
    }

    // 3. Check DB Connection
    console.log('\n3. Checking MongoDB Connection...');
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/dropzone'; // Fallback
    try {
        console.log(`Connecting to: ${uri.split('@')[1] || uri}...`); // Log masked URI
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('PASS: MongoDB connected successfully.');
        await mongoose.disconnect();
    } catch (e) {
        console.error('FAIL: MongoDB connection failed:', e.message);
    }
}

testConfig();
