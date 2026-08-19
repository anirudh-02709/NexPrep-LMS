const TestResult = require('../models/TestResult');
const { getSanitizedQuestions, validateAndScoreSubmission } = require('../services/testScoring');

const getTestQuestions = async (req, res, next) => {
  try {
    const { subject, chapter } = req.query;
    const questions = getSanitizedQuestions(subject, chapter);

    return res.status(200).json({
      success: true,
      subject,
      chapter,
      totalQuestions: questions.length,
      questions,
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    return next(error);
  }
};

const saveTestResult = async (req, res, next) => {
  try {
    const { subject, chapter, answers } = req.body;

    if (!subject || !chapter || !answers) {
      res.status(400);
      throw new Error('Please provide subject, chapter, and answers.');
    }

    // Calculate score and totalQuestions server-side strictly from answers
    const { score, totalQuestions } = validateAndScoreSubmission(subject, chapter, answers);

    const result = await TestResult.create({
      user: req.user.id,
      subject,
      chapter,
      score,
      totalQuestions,
    });

    return res.status(201).json({
      success: true,
      message: 'Test evaluated and saved successfully.',
      result,
      score,
      totalQuestions,
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
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
    const subjectScores = {};

    results.forEach((result) => {
      const percentage = (result.score / result.totalQuestions) * 100;
      totalPercentage += percentage;

      subjectWiseTestCounts[result.subject] = (subjectWiseTestCounts[result.subject] || 0) + 1;
      
      if (!subjectScores[result.subject]) {
        subjectScores[result.subject] = { total: 0, count: 0 };
      }
      subjectScores[result.subject].total += percentage;
      subjectScores[result.subject].count += 1;
    });

    const averageScorePercentage = totalTests
      ? Math.round(totalPercentage / totalTests)
      : 0;

    // --- AI-Style Insights Engine ---
    let weakestSubject = null;
    let strongestSubject = null;
    let minAvg = Infinity;
    let maxAvg = -Infinity;

    for (const subject in subjectScores) {
      const avg = subjectScores[subject].total / subjectScores[subject].count;
      if (avg < minAvg) {
        minAvg = avg;
        weakestSubject = subject;
      }
      if (avg > maxAvg) {
        maxAvg = avg;
        strongestSubject = subject;
      }
    }

    let consistencyInsight = "Take some tests to start building a streak!";
    if (totalTests > 0) {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recentTests = results.filter(r => new Date(r.createdAt) >= oneWeekAgo);
      
      if (recentTests.length >= 2) {
        consistencyInsight = "You are practicing consistently.";
      } else if (recentTests.length === 1) {
        consistencyInsight = "You've practiced recently, keep it up!";
      } else {
        consistencyInsight = "Your activity has decreased recently.";
      }
    }

    let performanceTrend = "Stable";
    if (totalTests >= 4) {
      const recent = results.slice(0, 2);
      const older = results.slice(2, 4);
      const recentAvg = recent.reduce((sum, r) => sum + (r.score / r.totalQuestions), 0) / 2;
      const olderAvg = older.reduce((sum, r) => sum + (r.score / r.totalQuestions), 0) / 2;
      
      if (recentAvg > olderAvg + 0.05) {
        performanceTrend = "Improving";
      } else if (recentAvg < olderAvg - 0.05) {
        performanceTrend = "Needs Attention";
      }
    } else if (totalTests > 0 && totalTests < 4) {
      performanceTrend = "Need more tests to determine trend.";
    } else {
      performanceTrend = "No data yet.";
    }

    let recommendation = "Complete more tests to get personalized recommendations.";
    if (totalTests > 0) {
      if (weakestSubject && minAvg < 60) {
        // If they are struggling in a subject
        const formattedSubject = weakestSubject.charAt(0).toUpperCase() + weakestSubject.slice(1);
        recommendation = `Focus more on ${formattedSubject} practice to improve your scores.`;
      } else if (strongestSubject) {
        const formattedSubject = strongestSubject.charAt(0).toUpperCase() + strongestSubject.slice(1);
        recommendation = `Great job! Continue your ${formattedSubject} momentum and maintain consistency.`;
      }
    }

    const insights = {
      weakestSubject: weakestSubject ? weakestSubject.charAt(0).toUpperCase() + weakestSubject.slice(1) : "N/A",
      strongestSubject: strongestSubject ? strongestSubject.charAt(0).toUpperCase() + strongestSubject.slice(1) : "N/A",
      consistencyInsight,
      performanceTrend,
      recommendation
    };

    return res.status(200).json({
      success: true,
      dashboard: {
        totalTests,
        averageScorePercentage,
        latestTest: results[0] || null,
        subjectWiseTestCounts,
        insights
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getTestQuestions,
  saveTestResult,
  getTestHistory,
  getDashboard,
};
