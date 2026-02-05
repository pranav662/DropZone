# DROPZONE - Modern File Sharing Application

A beautiful, modern file-sharing web application built with HTML, CSS, JavaScript, and Node.js. Features a distinctive brutalist-inspired design with smooth animations and a seamless user experience.

![DROPZONE](https://via.placeholder.com/800x400/0f172a/fbbf24?text=DROPZONE+-+File+Sharing+Made+Easy)

## ✨ Features

### Frontend
- **Modern UI/UX**: Distinctive brutalist-inspired design with high contrast and smooth animations
- **Drag & Drop**: Intuitive drag-and-drop interface for file uploads
- **Three Sharing Methods**:
  - 📎 **Link Sharing**: Copy shareable link to clipboard
  - 📧 **Email Sharing**: Send file link via email
  - 📱 **QR Code**: Generate QR code for mobile sharing
- **Progress Tracking**: Real-time upload progress with animated progress bar
- **Responsive Design**: Works beautifully on desktop, tablet, and mobile devices
- **No Authentication**: Fully functional for guest users

### Backend
- **File Upload**: Secure file upload with 100MB limit
- **Auto-Expiration**: Files automatically delete after 24 hours
- **Email Integration**: Send share links via email using Nodemailer
- **RESTful API**: Clean API endpoints for all operations
- **File Metadata**: Track downloads and file information

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- SMTP credentials (for email functionality)

### Installation

1. **Clone or download the files**

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your SMTP settings:
```env
PORT=3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

> **Gmail Users**: You need to use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

4. **Create the public folder structure**
```bash
mkdir -p public
mv index.html public/
mv styles.css public/
mv script.js public/
```

5. **Start the server**
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

6. **Open your browser**
```
http://localhost:3000
```

## 📁 Project Structure

```
dropzone-file-sharing/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # CSS styles
│   └── script.js       # Client-side JavaScript
├── uploads/            # Uploaded files (auto-created)
├── server.js           # Node.js Express server
├── package.json        # Dependencies
├── .env.example        # Environment variables template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## 🎨 Design Philosophy

The application features a **refined brutalist aesthetic** with:
- Bold typography (Space Mono + DM Sans)
- High contrast dark-to-light gradient background
- Sharp borders and dramatic shadows
- Amber accent colors
- Smooth state transitions
- Mobile-first responsive design

## 🔧 API Endpoints

### Upload File
```http
POST /api/upload
Content-Type: multipart/form-data

Response:
{
  "success": true,
  "shareId": "Xa9kP2mQ",
  "shareUrl": "http://localhost:3000/download/Xa9kP2mQ",
  "expiresAt": "2024-01-02T12:00:00.000Z"
}
```

### Download File
```http
GET /download/:shareId
```

### Send Email
```http
POST /api/send-email
Content-Type: application/json

{
  "shareUrl": "http://localhost:3000/download/Xa9kP2mQ",
  "recipientEmail": "friend@example.com",
  "senderEmail": "you@example.com",
  "fileName": "document.pdf"
}
```

### Get File Info
```http
GET /api/file/:shareId

Response:
{
  "originalName": "document.pdf",
  "size": 1048576,
  "uploadedAt": "2024-01-01T12:00:00.000Z",
  "expiresAt": "2024-01-02T12:00:00.000Z",
  "downloadCount": 5
}
```

## 🔒 Security Features

- File size limit (100MB)
- Auto-deletion after 24 hours
- Unique share IDs using crypto
- CORS protection
- Input validation
- Secure file storage

## 🎯 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## 📝 To-Do / Future Enhancements

- [ ] Real QR code generation (using qrcode.js)
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] File encryption
- [ ] Password-protected links
- [ ] Bulk file uploads
- [ ] Upload progress for actual files
- [ ] User accounts (optional)
- [ ] File preview
- [ ] Custom expiration times
- [ ] Analytics dashboard

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 💡 Tips

### For Gmail Users
1. Enable 2-Step Verification in your Google Account
2. Generate an App Password: [Google Account Security](https://myaccount.google.com/security)
3. Use the generated 16-character password in your `.env` file

### For Production Deployment
- Use environment variables for sensitive data
- Set up a proper database (MongoDB, PostgreSQL)
- Configure a reverse proxy (nginx)
- Use HTTPS
- Set up proper logging
- Implement rate limiting
- Add file validation
- Consider using cloud storage (AWS S3, Azure Blob)

## 🙏 Acknowledgments

- Design inspired by brutalist and Swiss design principles
- Icons via inline SVG
- Fonts: Space Mono & DM Sans from Google Fonts

---

**Built with ❤️ using vanilla HTML, CSS, JavaScript, and Node.js**
