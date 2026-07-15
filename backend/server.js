const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('[Server startup] FIREBASE_PROJECT_ID exists:', Boolean(process.env.FIREBASE_PROJECT_ID));
console.log('[Server startup] FIREBASE_CLIENT_EMAIL exists:', Boolean(process.env.FIREBASE_CLIENT_EMAIL));
console.log('[Server startup] FIREBASE_PRIVATE_KEY exists:', Boolean(process.env.FIREBASE_PRIVATE_KEY));

const { admin } = require('./config/firebaseAdmin');
console.log('[Server startup] Firebase Admin apps after initialize:', admin.apps.length);

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const healthRoutes = require('./routes/healthRoutes');
const progressRoutes = require('./routes/progressRoutes');
const testRoutes = require('./routes/testRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/progress', progressRoutes);

app.use(notFound);
app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`NexPrep backend server running on port ${PORT}`);
  });
});
