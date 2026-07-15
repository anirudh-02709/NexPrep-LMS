const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { admin, hasFirebaseConfig } = require('../config/firebaseAdmin');

const createToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedPassword = typeof password === 'string' ? password : '';
    const trimmedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword : '';

    if (!trimmedName || !trimmedEmail || !trimmedPassword || !trimmedConfirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email, password, and confirm password.',
      });
    }

    if (trimmedPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const existingUser = await User.findOne({ email: trimmedEmail });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email.',
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(trimmedPassword, salt);

    const user = await User.create({
      name: trimmedName,
      email: trimmedEmail,
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
    console.error('[Auth] Registration failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

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
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    console.log('[Google Auth] Request received:', {
      hasIdToken: Boolean(idToken),
      idTokenLength: idToken ? idToken.length : 0,
      hasFirebaseConfig: Boolean(hasFirebaseConfig),
      firebaseAppsCount: admin.apps.length,
    });

    if (!idToken) {
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

    console.log('[Google Auth] Verifying Firebase ID token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[Google Auth] Firebase token verified:', {
      uid: decodedToken.uid,
      hasEmail: Boolean(decodedToken.email),
      provider: decodedToken.firebase ? decodedToken.firebase.sign_in_provider : undefined,
    });

    const email = decodedToken.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account email is required.',
      });
    }

    const name = decodedToken.name || email.split('@')[0];

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        firebaseUid: decodedToken.uid,
        authProvider: 'google',
      });
    } else if (!user.firebaseUid) {
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
    console.error('[Google Auth] Google login failed.');
    console.error(error);

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
  register,
  login,
  googleLogin,
  getMe,
};
