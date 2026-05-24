const getHome = (req, res) => {
  res.json({
    message: 'NexPrep API Running',
  });
};

const getHealth = (req, res) => {
  res.json({
    success: true,
  });
};

module.exports = {
  getHome,
  getHealth,
};
