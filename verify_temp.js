const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function testPdfPreview() {
    try {
        // Create a dummy PDF file (just text content but mimetype application/pdf for testing)
        const filePath = path.join(__dirname, 'test.pdf');
        fs.writeFileSync(filePath, '%PDF-1.4\n%...Mock PDF Content...');

        // Upload
        const form = new FormData();
        form.append('files', fs.createReadStream(filePath), { contentType: 'application/pdf', filename: 'test.pdf' });

        console.log('Uploading PDF file...');
        const res = await axios.post(`${BASE_URL}/api/upload`, form, {
            headers: { ...form.getHeaders() }
        });

        if (res.data.success) {
            const file = res.data.files[0];
            console.log('Upload success! ShareID:', file.shareId);

            // 1. Try GET Landing Page (Should contain <embed ... type="application/pdf">)
            console.log('Fetching Landing Page...');
            const getRes = await axios.get(file.shareUrl, { responseType: 'text' });

            if (getRes.data.includes('type="application/pdf"') && getRes.data.includes('<embed')) {
                console.log('PASS: Landing Page contains PDF Embed tag');
            } else {
                console.error('FAIL: PDF Embed tag missing');
                // console.log(getRes.data);
            }

        } else {
            console.error('Upload failed');
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) console.error('Response data:', error.response.data);
    }
}

testPdfPreview();
