const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { normalizeEmail, register, login } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');

describe('Authentication & JWT Protection Suite', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  // 1. Email normalization utility
  it('1. normalizeEmail trims whitespace and lowercases email', () => {
    assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com');
    assert.equal(normalizeEmail('STUDENT@NEXPREP.EDU'), 'student@nexprep.edu');
    assert.equal(normalizeEmail('  test.user+1@domain.co.in '), 'test.user+1@domain.co.in');
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(normalizeEmail(123), '');
  });

  // 2. Mixed-case registration and login lookup
  it('2. mixed-case and whitespace registration allows login with any case/whitespace variant', async () => {
    const mockUsers = new Map();

    const originalFindOne = User.findOne;
    const originalCreate = User.create;

    User.findOne = async (filter) => {
      if (filter.email) {
        return mockUsers.get(filter.email) || null;
      }
      return null;
    };

    User.create = async (doc) => {
      const user = {
        _id: 'user_mock_id_1',
        ...doc,
      };
      mockUsers.set(doc.email, user);
      return user;
    };

    try {
      // Register with mixed case and leading/trailing whitespace
      const regReq = {
        body: {
          name: 'Jane Doe',
          email: '  Jane.Doe@EXAMPLE.Com  ',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
      };

      let regStatus = null;
      let regBody = null;
      const regRes = {
        status: (code) => {
          regStatus = code;
          return regRes;
        },
        json: (payload) => {
          regBody = payload;
          return regRes;
        },
      };

      await register(regReq, regRes);
      assert.equal(regStatus, 201);
      assert.equal(regBody.success, true);
      assert.equal(regBody.user.email, 'jane.doe@example.com');

      // Login with different case and whitespace
      const loginReq = {
        body: {
          email: 'JANE.DOE@example.COM   ',
          password: 'Password123!',
        },
      };

      let loginStatus = null;
      let loginBody = null;
      const loginRes = {
        status: (code) => {
          loginStatus = code;
          return loginRes;
        },
        json: (payload) => {
          loginBody = payload;
          return loginRes;
        },
      };

      await login(loginReq, loginRes);
      assert.equal(loginStatus, 200);
      assert.equal(loginBody.success, true);
      assert.ok(loginBody.token);
      assert.equal(loginBody.user.email, 'jane.doe@example.com');
    } finally {
      User.findOne = originalFindOne;
      User.create = originalCreate;
    }
  });

  // 3. Login rejects invalid password
  it('3. login rejects invalid password with 401 Unauthorized', async () => {
    const originalFindOne = User.findOne;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('CorrectPassword123!', salt);

    User.findOne = async () => ({
      _id: 'user_123',
      name: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
    });

    try {
      const loginReq = {
        body: {
          email: 'test@example.com',
          password: 'WrongPassword!',
        },
      };

      let loginStatus = null;
      let loginBody = null;
      const loginRes = {
        status: (code) => {
          loginStatus = code;
          return loginRes;
        },
        json: (payload) => {
          loginBody = payload;
          return loginRes;
        },
      };

      await login(loginReq, loginRes);
      assert.equal(loginStatus, 401);
      assert.equal(loginBody.success, false);
      assert.match(loginBody.message, /invalid email or password/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  // 4. Protected endpoint without token
  it('4. protect middleware rejects request without token with 401', async () => {
    const req = {
      headers: {},
    };

    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
    };
    const next = (err) => {
      nextError = err;
    };

    await protect(req, res, next);
    assert.equal(statusCalled, 401);
    assert.ok(nextError);
    assert.match(nextError.message, /token missing/i);
  });

  // 5. Protected endpoint with malformed JWT
  it('5. protect middleware rejects malformed JWT with 401', async () => {
    const req = {
      headers: {
        authorization: 'Bearer this_is_not_a_valid_jwt_token',
      },
    };

    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
    };
    const next = (err) => {
      nextError = err;
    };

    await protect(req, res, next);
    assert.equal(statusCalled, 401);
    assert.ok(nextError);
    assert.match(nextError.message, /token invalid/i);
  });

  // 6. Protected endpoint with expired JWT
  it('6. protect middleware rejects expired JWT with 401', async () => {
    // Generate token that expired 1 hour ago
    const expiredToken = jwt.sign(
      { id: 'user_123', iat: Math.floor(Date.now() / 1000) - 7200 },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    };

    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
    };
    const next = (err) => {
      nextError = err;
    };

    await protect(req, res, next);
    assert.equal(statusCalled, 401);
    assert.ok(nextError);
    assert.match(nextError.message, /token expired/i);
  });

  // 7. Protected endpoint with valid JWT for active user
  it('7. protect middleware accepts valid JWT and attaches user document to req.user', async () => {
    const validToken = jwt.sign({ id: 'user_active_123' }, JWT_SECRET, { expiresIn: '7d' });

    const originalFindById = User.findById;
    User.findById = (id) => ({
      select: (fields) => {
        assert.equal(id, 'user_active_123');
        assert.equal(fields, '-password');
        return Promise.resolve({
          _id: 'user_active_123',
          id: 'user_active_123',
          name: 'Active User',
          email: 'active@example.com',
        });
      },
    });

    try {
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };

      let nextCalled = false;
      let nextError = null;
      const res = {
        status: () => res,
      };
      const next = (err) => {
        nextCalled = true;
        nextError = err;
      };

      await protect(req, res, next);
      assert.equal(nextCalled, true);
      assert.equal(nextError, undefined);
      assert.ok(req.user);
      assert.equal(req.user.id, 'user_active_123');
      assert.equal(req.user.email, 'active@example.com');
    } finally {
      User.findById = originalFindById;
    }
  });

  // 8. Protected endpoint with valid JWT for deleted / nonexistent user
  it('8. protect middleware rejects valid JWT if database user no longer exists with 401', async () => {
    const validToken = jwt.sign({ id: 'user_deleted_999' }, JWT_SECRET, { expiresIn: '7d' });

    const originalFindById = User.findById;
    User.findById = () => ({
      select: () => Promise.resolve(null), // User not found in DB
    });

    try {
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };

      let statusCalled = null;
      let nextError = null;
      const res = {
        status: (code) => {
          statusCalled = code;
          return res;
        },
      };
      const next = (err) => {
        nextError = err;
      };

      await protect(req, res, next);
      assert.equal(statusCalled, 401);
      assert.ok(nextError);
      assert.match(nextError.message, /user not found/i);
    } finally {
      User.findById = originalFindById;
    }
  });

});
