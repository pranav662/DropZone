const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function debugUpload() {
    try {
        const filePath = path.join(__dirname, 'test_debug.pdf');
        fs.writeFileSync(filePath, '%PDF-1.4\nDebug PDF', 'utf8');

        const form = new FormData();
        form.append('files', fs.createReadStream(filePath), { contentType: 'application/pdf', filename: 'test_debug.pdf' });

        console.log('Uploading PDF...');
        const res = await axios.post('http://localhost:3000/api/upload', form, {
            headers: form.getHeaders()
        });

        console.log('Upload Response Keys per file:', Object.keys(res.data.files[0]));
        console.log('File 0 Data:', res.data.files[0]);

        if (res.data.files[0].mimetype) {
            console.log('PASS: mimetype is present.');
        } else {
            console.error('FAIL: mimetype is MISSING from response.');
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', e.response.data);
        }
    }
}

debugUpload();
