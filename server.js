import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import Feedback from './models/Feedback.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/portfolio';

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

app.post('/api/contact', upload.single('avatar'), async (req, res) => {
  const { rating, userName, reviewText } = req.body;

  // Comprehensive Validation
  if (!rating || !userName || !reviewText) {
    return res.status(400).json({ error: 'Rating, Your Name, and Feedback are all required to submit.' });
  }

  try {
    // Avatar Logic: Handle Upload vs Random Fallback
    let avatarPath = '';
    if (req.file) {
      // Use the uploaded file path (served via /uploads)
      avatarPath = `/uploads/${req.file.filename}`;
    } else {
      // Pick random from public/Avtar (frontend resolves this)
      const avatrs = ['avtar1.png', 'avtar2.png', 'avtar3.png', 'avtar4.png'];
      const random = avatrs[Math.floor(Math.random() * avatrs.length)];
      avatarPath = `/Avtar/${random}`;
    }

    // 1. Save to MongoDB
    const newFeedback = new Feedback({
      rating: parseInt(rating),
      userName,
      reviewText,
      avatar: avatarPath
    });
    await newFeedback.save();

    // 2. Send Email Notification 
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: 'videovision0202@gmail.com',
      subject: `New Client Feedback: ${userName} (${rating} Stars)`,
      text: `You have received new feedback on your portfolio:
      
Rating: ${rating} / 5 Stars
User Name: ${userName}
Avatar: ${avatarPath}
Feedback: ${reviewText || 'No detailed feedback provided.'}
Timestamp: ${new Date().toLocaleString()}`,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Email notification failed to send, but feedback was saved to DB:', emailError.message);
    }
    
    res.status(200).json({ 
      success: 'Feedback submitted successfully!',
      avatar: avatarPath 
    });
  } catch (error) {
    console.error('Error handling feedback:', error);
    res.status(500).json({ error: 'Failed to process feedback. Please try again later.' });
  }
});

// Retrieve All Feedback for Testimonials
app.get('/api/contact', async (req, res) => {
  try {
    const feedbackList = await Feedback.find().sort({ timestamp: -1 });
    res.status(200).json(feedbackList);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to retrieve testimonials.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
