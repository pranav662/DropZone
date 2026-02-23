const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dropzone', {
            autoIndex: true,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Do not exit process in dev, just log error so server can still start (maybe in offline mode)
        // but for now let's keep it simple
        console.log('Ensure MongoDB is running locally on port 27017');
    }
};

module.exports = connectDB;
