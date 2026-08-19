const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const healthRoutes = require('./routes/healthRoutes');
const progressRoutes = require('./routes/progressRoutes');
const testRoutes = require('./routes/testRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration supporting environment-configured origins and local dev defaults
const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : (process.env.CLIENT_URL ? [process.env.CLIENT_URL.trim()] : []);

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'null', // For local file:// browser access
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser or same-origin requests without Origin header
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = configuredOrigins.includes(origin);
    const isDevAllowed = process.env.NODE_ENV !== 'production' && (defaultDevOrigins.includes(origin) || configuredOrigins.length === 0);

    if (isExplicitlyAllowed || isDevAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/progress', progressRoutes);

app.use(notFound);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`NexPrep backend server running on port ${PORT}`);
    });
  });
}

module.exports = app;
