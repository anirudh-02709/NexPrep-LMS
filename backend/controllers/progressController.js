const Progress = require('../models/Progress');

const updateProgress = async (req, res, next) => {
  try {
    const { subject, chapter, completed } = req.body;

    if (!subject || !chapter) {
      res.status(400);
      throw new Error('Please provide subject and chapter.');
    }

    const updateData = {
      lastOpenedAt: new Date(),
    };

    if (completed !== undefined) {
      updateData.completed = completed;
    }

    const progress = await Progress.findOneAndUpdate(
      {
        user: req.user.id,
        subject,
        chapter,
      },
      {
        $set: updateData,
        $setOnInsert: {
          user: req.user.id,
          subject,
          chapter,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Progress updated successfully.',
      progress,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  updateProgress,
};
