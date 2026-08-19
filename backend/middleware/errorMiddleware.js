const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

const errorHandler = (err, req, res, next) => {
  // Handle CORS rejection
  if (err && err.message === 'Not allowed by CORS policy') {
    return res.status(403).json({
      success: false,
      message: 'Not allowed by CORS policy',
    });
  }

  // Handle malformed JSON body errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload in request body.',
    });
  }

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
};

module.exports = {
  notFound,
  errorHandler,
};
