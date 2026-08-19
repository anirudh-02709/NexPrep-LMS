const Progress = require('../models/Progress');
const { TAXONOMY, validateSubjectAndChapter } = require('../data/taxonomy');

const getSubjectTotalChapters = (subject) => (TAXONOMY[subject] || []).length;

const buildProgressPayload = (progress) => ({
  subject: progress.subject,
  chapter: progress.chapter,
  lastOpenedAt: progress.lastOpenedAt,
  completed: progress.completed,
});

const updateProgressRecord = async (req, res, next, completed) => {
  try {
    const { subject, chapter } = req.body;

    const validated = validateSubjectAndChapter(subject, chapter);

    const updateData = {
      lastOpenedAt: new Date(),
    };

    if (completed !== undefined) {
      updateData.completed = Boolean(completed);
    }

    const progress = await Progress.findOneAndUpdate(
      {
        user: req.user.id,
        subject: validated.subject,
        chapter: validated.chapter,
      },
      {
        $set: updateData,
        $setOnInsert: {
          user: req.user.id,
          subject: validated.subject,
          chapter: validated.chapter,
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
      progress: buildProgressPayload(progress),
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    return next(error);
  }
};

const updateProgress = async (req, res, next) => {
  return updateProgressRecord(req, res, next);
};

const markChapterCompleted = async (req, res, next) => {
  return updateProgressRecord(req, res, next, true);
};

const markChapterIncomplete = async (req, res, next) => {
  return updateProgressRecord(req, res, next, false);
};

const getChapterStatus = async (req, res, next) => {
  try {
    const { subject, chapter } = req.query;

    const validated = validateSubjectAndChapter(subject, chapter);

    const progress = await Progress.findOne({
      user: req.user.id,
      subject: validated.subject,
      chapter: validated.chapter,
    }).select('subject chapter completed lastOpenedAt');

    return res.status(200).json({
      success: true,
      progress: progress ? buildProgressPayload(progress) : null,
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    return next(error);
  }
};

const getSubjectProgressStats = async (req, res, next) => {
  try {
    const progressRecords = await Progress.find({
      user: req.user.id,
    }).select('subject chapter completed');

    const stats = {};
    let totalCompleted = 0;
    let totalChapters = 0;

    Object.keys(TAXONOMY).forEach((subject) => {
      const totalSubjectChapters = getSubjectTotalChapters(subject);
      const completedSubjectChapters = progressRecords.filter(
        (record) => record.subject === subject && record.completed
      ).length;
      const completionPercentage = totalSubjectChapters
        ? Math.round((completedSubjectChapters / totalSubjectChapters) * 100)
        : 0;

      stats[subject] = {
        subject,
        completedChapters: completedSubjectChapters,
        totalChapters: totalSubjectChapters,
        completionPercentage,
      };

      totalCompleted += completedSubjectChapters;
      totalChapters += totalSubjectChapters;
    });

    return res.status(200).json({
      success: true,
      stats,
      overall: {
        completedChapters: totalCompleted,
        totalChapters,
        completionPercentage: totalChapters ? Math.round((totalCompleted / totalChapters) * 100) : 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getContinueLearning = async (req, res, next) => {
  try {
    const progress = await Progress.findOne({ user: req.user.id })
      .sort({ lastOpenedAt: -1 });

    if (!progress) {
      return res.status(200).json({
        success: true,
        progress: null,
      });
    }

    return res.status(200).json({
      success: true,
      progress: {
        subject: progress.subject,
        chapter: progress.chapter,
        lastOpenedAt: progress.lastOpenedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  updateProgress,
  markChapterCompleted,
  markChapterIncomplete,
  getChapterStatus,
  getSubjectProgressStats,
  getContinueLearning,
};
