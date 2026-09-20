const mongoose = require('mongoose');

const mockTestSectionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    totalQuestions: {
      type: Number,
      required: true,
      min: [1, 'Section total questions must be at least 1.'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer.',
      },
    },
    instructions: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const mockTestQuestionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    chapter: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    q: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      required: true,
      validate: [
        (opts) => Array.isArray(opts) && opts.length >= 2,
        'Question must have at least 2 options.',
      ],
    },
    answer: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer answer index.',
      },
    },
  },
  { _id: false }
);

const mockTestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      required: true,
      default: 'jee_mock',
      enum: ['jee_mock', 'chapter_mock', 'custom_mock'],
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      required: true,
      min: [1, 'Duration must be at least 1 minute.'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer duration.',
      },
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
    totalMarks: {
      type: Number,
      required: true,
      min: [1, 'Total marks must be at least 1.'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer mark count.',
      },
    },
    markingScheme: {
      correct: {
        type: Number,
        default: 4,
      },
      incorrect: {
        type: Number,
        default: -1,
      },
      unattempted: {
        type: Number,
        default: 0,
      },
    },
    sections: {
      type: [mockTestSectionSchema],
      default: [],
    },
    questions: {
      type: [mockTestQuestionSchema],
      required: true,
      validate: [
        (arr) => Array.isArray(arr) && arr.length > 0,
        'Mock test must contain at least one question.',
      ],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

mockTestSchema.index({ slug: 1 });
mockTestSchema.index({ active: 1, createdAt: -1 });

module.exports = mongoose.model('MockTest', mockTestSchema);
