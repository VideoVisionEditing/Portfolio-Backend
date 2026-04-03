import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema({
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  userName: {
    type: String,
    required: true,
    trim: true
  },
  avatar: {
    type: String,
    default: ""
  },
  reviewText: {
    type: String,
    trim: true,
    required: true,
    maxlength: 200
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  }
});

const Feedback = mongoose.model('Feedback', FeedbackSchema);

export default Feedback;
