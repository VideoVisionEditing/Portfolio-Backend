import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
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

    // 2. Generate Secure Tokens & Update Email Template
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;

    const approveToken = jwt.sign({ id: newFeedback._id, action: 'approve' }, JWT_SECRET, { expiresIn: '7d' });
    const rejectToken = jwt.sign({ id: newFeedback._id, action: 'reject' }, JWT_SECRET, { expiresIn: '7d' });

    const approveUrl = `${backendUrl}/api/feedback/approve/${approveToken}`;
    const rejectUrl = `${backendUrl}/api/feedback/reject/${rejectToken}`;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: 'videovision0202@gmail.com',
      subject: `[Pending Approval] New Client Feedback: ${userName} (${rating} Stars)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">New Feedback Requires Approval</h2>
          <p><strong>Rating:</strong> ${rating} / 5 Stars</p>
          <p><strong>User Name:</strong> ${userName}</p>
          <p><strong>Avatar:</strong> ${avatarPath}</p>
          <p><strong>Feedback:</strong></p>
          <blockquote style="background: #f9f9f9; border-left: 5px solid #ccc; padding: 10px; margin: 10px 0;">
            ${reviewText || 'No detailed feedback provided.'}
          </blockquote>
          <p style="color: #666; font-size: 12px;">Submitted at: ${new Date().toLocaleString()}</p>
          
          <div style="margin-top: 30px; display: flex; gap: 15px;">
            <a href="${approveUrl}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-right: 15px;">✅ Approve</a>
            <a href="${rejectUrl}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">❌ Reject</a>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #999;">These verification links safely expire in 7 days.</p>
        </div>
      `,
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

// Handle Feedback Approval (via email link)
app.get('/api/feedback/approve/:token', async (req, res) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    
    if (decoded.action !== 'approve') {
      return res.status(400).send('<h1>Invalid Token Action</h1>');
    }

    const feedback = await Feedback.findById(decoded.id);
    
    if (!feedback) {
      return res.status(404).send('<div style="font-family: sans-serif; text-align: center; margin-top: 40px;"><h1 style="color: #ef4444;">❌ Feedback not found</h1></div>');
    }

    if (feedback.status === 'approved') {
      return res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; background-color: #f0fdf4;">
          <h1 style="color: #16a34a; margin-bottom: 20px;">ℹ️ Already Approved</h1>
          <p style="font-size: 18px;">The feedback from <strong>${feedback.userName}</strong> was already approved previously.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">You may safely close this tab.</p>
        </div>
      `);
    } else if (feedback.status === 'rejected') {
      return res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; background-color: #fef2f2;">
          <h1 style="color: #ef4444; margin-bottom: 20px;">⚠️ Status Conflict</h1>
          <p style="font-size: 18px;">You cannot approve this feedback because it was already <strong>rejected</strong>.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">You may safely close this tab.</p>
        </div>
      `);
    }

    feedback.status = 'approved';
    await feedback.save();

    res.send(`
      <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <h1 style="color: #22c55e; margin-bottom: 20px;">✅ Status: Approved!</h1>
        <p style="font-size: 18px;">The feedback from <strong>${feedback.userName}</strong> is now visible on your portfolio.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">You may now safely close this tab.</p>
      </div>
    `);
  } catch (error) {
    console.error('Approval Error:', error.message);
    res.status(400).send('<div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;"><h1 style="color: #ef4444;">❌ Invalid or Expired Token</h1><p>This verification link is no longer valid.</p></div>');
  }
});

// Handle Feedback Rejection (via email link)
app.get('/api/feedback/reject/:token', async (req, res) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    
    if (decoded.action !== 'reject') {
      return res.status(400).send('<h1>Invalid Token Action</h1>');
    }

    const feedback = await Feedback.findById(decoded.id);
    
    if (!feedback) {
      return res.status(404).send('<div style="font-family: sans-serif; text-align: center; margin-top: 40px;"><h1 style="color: #ef4444;">❌ Feedback not found</h1></div>');
    }

    if (feedback.status === 'rejected') {
      return res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; background-color: #fef2f2;">
          <h1 style="color: #ef4444; margin-bottom: 20px;">ℹ️ Already Rejected</h1>
          <p style="font-size: 18px;">The feedback from <strong>${feedback.userName}</strong> was already rejected previously.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">You may safely close this tab.</p>
        </div>
      `);
    } else if (feedback.status === 'approved') {
      return res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; background-color: #f0fdf4;">
          <h1 style="color: #16a34a; margin-bottom: 20px;">⚠️ Status Conflict</h1>
          <p style="font-size: 18px;">You cannot reject this feedback because it was already <strong>approved</strong>.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">You may safely close this tab.</p>
        </div>
      `);
    }

    feedback.status = 'rejected';
    await feedback.save();

    res.send(`
      <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <h1 style="color: #ef4444; margin-bottom: 20px;">❌ Status: Rejected</h1>
        <p style="font-size: 18px;">The feedback from <strong>${feedback.userName}</strong> has been rejected and will not be displayed.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">You may now safely close this tab.</p>
      </div>
    `);
  } catch (error) {
    console.error('Rejection Error:', error.message);
    res.status(400).send('<div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; text-align: center; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;"><h1 style="color: #ef4444;">❌ Invalid or Expired Token</h1><p>This verification link is no longer valid.</p></div>');
  }
});

// Retrieve All Feedback for Testimonials
app.get('/api/contact', async (req, res) => {
  try {
    const feedbackList = await Feedback.find({ status: 'approved' }).sort({ timestamp: -1 });
    res.status(200).json(feedbackList);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to retrieve testimonials.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
