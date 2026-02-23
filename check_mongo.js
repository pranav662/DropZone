const mongoose = require('mongoose');

async function check() {
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/dropzone', { serverSelectionTimeoutMS: 2000 });
        console.log('MongoDB is reachable!');
        await mongoose.disconnect();
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
    }
}

check();
