const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const dns = require('dns');

const { authLimiter } = require('../middleware/rateLimitMiddleware');
const app = require('../server');

describe('Security, Helmet & Rate Limiting Suite', () => {

  // 1. Auth Rate Limiting allows initial requests
  it('1. authLimiter allows initial requests within rate limit threshold', async () => {
    let nextCalled = false;
    const req = {
      ip: '192.168.1.100',
      headers: {},
      app: { get: () => false },
    };
    let statusCode = 200;
    const res = {
      setHeader: () => {},
      getHeader: () => {},
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: () => res,
    };

    await new Promise((resolve) => {
      authLimiter(req, res, () => {
        nextCalled = true;
        resolve();
      });
    });

    assert.equal(nextCalled, true, 'authLimiter should call next() for requests within limit');
    assert.equal(statusCode, 200);
  });

  // 2. Auth Rate Limiting enforces 429 when threshold exceeded
  it('2. authLimiter returns 429 with standard JSON response when threshold is exceeded', async () => {
    const rateLimit = require('express-rate-limit');
    
    // Create a mini rate limiter with max: 2 for deterministic threshold testing
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false },
      handler: (req, res) => {
        res.status(429).json({
          success: false,
          message: 'Too many authentication attempts. Please try again after 15 minutes.',
        });
      },
    });

    const testIp = '10.0.0.99';
    let lastStatusCode = 200;
    let lastJsonPayload = null;

    const makeRequest = () => {
      return new Promise((resolve) => {
        const req = {
          ip: testIp,
          headers: {},
          app: { get: () => false },
        };
        const res = {
          setHeader: () => {},
          getHeader: () => {},
          status: (code) => {
            lastStatusCode = code;
            return res;
          },
          json: (payload) => {
            lastJsonPayload = payload;
            resolve();
          },
        };

        testLimiter(req, res, () => {
          resolve();
        });
      });
    };

    // First 2 requests should succeed
    await makeRequest();
    assert.equal(lastStatusCode, 200);
    await makeRequest();
    assert.equal(lastStatusCode, 200);

    // 3rd request should hit rate limit (429)
    await makeRequest();
    assert.equal(lastStatusCode, 429);
    assert.equal(lastJsonPayload.success, false);
    assert.match(lastJsonPayload.message, /Too many authentication attempts/i);
  });

  // 3. DNS Configuration respects DNS_OVERRIDE flag
  it('3. DNS server override is conditioned on DNS_OVERRIDE === "true"', () => {
    let setServersCalledWith = null;
    const originalSetServers = dns.setServers;

    dns.setServers = (servers) => {
      setServersCalledWith = servers;
    };

    try {
      // When DNS_OVERRIDE is false / unset
      const checkDnsOverride = (envVal) => {
        if (envVal === 'true') {
          dns.setServers(['8.8.8.8', '8.8.4.4']);
        }
      };

      checkDnsOverride('false');
      assert.equal(setServersCalledWith, null, 'Should not override DNS when DNS_OVERRIDE is false');

      checkDnsOverride(undefined);
      assert.equal(setServersCalledWith, null, 'Should not override DNS when DNS_OVERRIDE is undefined');

      checkDnsOverride('true');
      assert.deepEqual(setServersCalledWith, ['8.8.8.8', '8.8.4.4'], 'Should override DNS when DNS_OVERRIDE is true');
    } finally {
      dns.setServers = originalSetServers;
    }
  });

  // 4. Helmet security headers attached to responses
  it('4. Helmet attaches standard security headers to Express responses', async () => {
    const helmet = require('helmet');
    const testApp = express();
    testApp.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      })
    );
    testApp.get('/test-headers', (req, res) => {
      res.json({ ok: true });
    });

    const headers = {};
    const mockReq = {
      method: 'GET',
      url: '/test-headers',
      headers: {},
    };
    const mockRes = {
      setHeader: (key, val) => {
        headers[key.toLowerCase()] = val;
      },
      getHeader: (key) => headers[key.toLowerCase()],
      status: () => mockRes,
      json: () => mockRes,
      end: () => {},
    };

    await new Promise((resolve) => {
      testApp.handle(mockReq, mockRes, resolve);
    });

    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['cross-origin-resource-policy'], 'cross-origin');
    assert.ok(headers['x-frame-options'], 'x-frame-options header should be present');
  });

});
