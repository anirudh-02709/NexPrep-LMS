const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { admin, hasFirebaseConfig } = require('../config/firebaseAdmin');

/**
 * Normalizes email by trimming whitespace and converting to lowercase.
 * @param {any} email 
 * @returns {string}
 */
const normalizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
};

const createToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = normalizeEmail(email);
    const rawPassword = typeof password === 'string' ? password : '';
    const rawConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword : '';

    if (!trimmedName || !normalizedEmail || !rawPassword || !rawConfirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email, password, and confirm password.',
      });
    }

    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Full name cannot exceed 100 characters.',
      });
    }

    if (rawPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (rawPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot exceed 128 characters.',
      });
    }

    if (rawPassword !== rawConfirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email.',
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: 'local',
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('[Auth] Registration failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const rawPassword = typeof password === 'string' ? password : '';

    if (!normalizedEmail || !rawPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isPasswordMatch = await bcrypt.compare(rawPassword, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = createToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('[Auth] Login failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required.',
      });
    }

    if (!hasFirebaseConfig) {
      console.error('[Google Auth] Firebase Admin config missing or invalid.');
      return res.status(500).json({
        success: false,
        message: 'Firebase Admin is not configured on the server.',
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const normalizedEmail = normalizeEmail(decodedToken.email);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Google account email is required.',
      });
    }

    const name = decodedToken.name || normalizedEmail.split('@')[0];

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      user = await User.create({
        name,
        email: normalizedEmail,
        firebaseUid: decodedToken.uid,
        authProvider: 'google',
      });
    } else if (!user.firebaseUid) {
      // Merge with existing local account
      user.firebaseUid = decodedToken.uid;
      user.authProvider = user.authProvider || 'google';
      await user.save();
    }

    const token = createToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Google login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('[Google Auth] Google login failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Google authentication failed.',
    });
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      res.status(404);
      throw new Error('User not found.');
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  normalizeEmail,
  register,
  login,
  googleLogin,
  getMe,
};
