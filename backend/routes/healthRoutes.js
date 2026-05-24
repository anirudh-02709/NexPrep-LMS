const express = require('express');
const { getHome, getHealth } = require('../controllers/healthController');

const router = express.Router();

router.get('/', getHome);
router.get('/api/health', getHealth);

module.exports = router;
