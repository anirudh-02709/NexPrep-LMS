const mongoose = require('mongoose');
const { ALL_SUBJECTS, ALL_CHAPTERS } = require('../data/taxonomy');

const progressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    enum: ALL_SUBJECTS,
  },
  chapter: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    enum: ALL_CHAPTERS,
  },
  lastOpenedAt: {
    type: Date,
    default: Date.now,
  },
  completed: {
    type: Boolean,
    default: false,
  },
});

progressSchema.index({ user: 1, subject: 1, chapter: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
