const mongoose = require('mongoose');
const { ALL_SUBJECTS, ALL_CHAPTERS } = require('../data/taxonomy');

const testResultSchema = new mongoose.Schema({
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
  score: {
    type: Number,
    required: true,
    min: [0, 'Score cannot be negative.'],
    validate: [
      {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer score.',
      },
      {
        validator: function (val) {
          if (typeof this.totalQuestions === 'number') {
            return val <= this.totalQuestions;
          }
          return true;
        },
        message: 'Score ({VALUE}) cannot exceed total questions.',
      },
    ],
  },
  totalQuestions: {
    type: Number,
    required: true,
    min: [1, 'Total questions must be at least 1.'],
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer question count.',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

testResultSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('TestResult', testResultSchema);
