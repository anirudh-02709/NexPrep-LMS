const TestResult = require('../models/TestResult');

const saveTestResult = async (req, res, next) => {
  try {
    const { subject, chapter, score, totalQuestions } = req.body;

    if (!subject || !chapter || score === undefined || totalQuestions === undefined) {
      res.status(400);
      throw new Error('Please provide subject, chapter, score, and totalQuestions.');
    }

    const result = await TestResult.create({
      user: req.user.id,
      subject,
      chapter,
      score,
      totalQuestions,
    });

    return res.status(201).json({
      success: true,
      message: 'Test result saved successfully.',
      result,
    });
  } catch (error) {
    return next(error);
  }
};

const getTestHistory = async (req, res, next) => {
  try {
    const results = await TestResult.find({ user: req.user.id })
      .select('subject chapter score totalQuestions createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    return next(error);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const results = await TestResult.find({ user: req.user.id })
      .select('subject chapter score totalQuestions createdAt')
      .sort({ createdAt: -1 });

    const totalTests = results.length;
    let totalPercentage = 0;
    const subjectWiseTestCounts = {};

    results.forEach((result) => {
      const percentage = (result.score / result.totalQuestions) * 100;
      totalPercentage += percentage;

      subjectWiseTestCounts[result.subject] = (subjectWiseTestCounts[result.subject] || 0) + 1;
    });

    const averageScorePercentage = totalTests
      ? Math.round(totalPercentage / totalTests)
      : 0;

    return res.status(200).json({
      success: true,
      dashboard: {
        totalTests,
        averageScorePercentage,
        latestTest: results[0] || null,
        subjectWiseTestCounts,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  saveTestResult,
  getTestHistory,
  getDashboard,
};
