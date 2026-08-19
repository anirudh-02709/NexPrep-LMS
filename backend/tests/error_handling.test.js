const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { notFound, errorHandler } = require('../middleware/errorMiddleware');

describe('Production Error Handling & Middleware Suite', () => {

  it('1. notFound middleware returns 404 with structured JSON message', () => {
    let statusCode = 200;
    let jsonResponse = null;

    const req = {
      method: 'GET',
      originalUrl: '/api/nonexistent-route',
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };

    notFound(req, res, () => {});

    assert.equal(statusCode, 404);
    assert.equal(jsonResponse.success, false);
    assert.ok(jsonResponse.message.includes('/api/nonexistent-route'));
  });

  it('2. errorHandler middleware handles CORS policy violations with 403', () => {
    let statusCode = 200;
    let jsonResponse = null;

    const corsError = new Error('Not allowed by CORS policy');
    const req = {};
    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };

    errorHandler(corsError, req, res, () => {});

    assert.equal(statusCode, 403);
    assert.equal(jsonResponse.success, false);
    assert.equal(jsonResponse.message, 'Not allowed by CORS policy');
  });

  it('3. errorHandler middleware handles malformed JSON SyntaxError with 400', () => {
    let statusCode = 200;
    let jsonResponse = null;

    const jsonError = new SyntaxError('Unexpected token in JSON');
    jsonError.status = 400;
    jsonError.body = '{ malformed json';

    const req = {};
    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };

    errorHandler(jsonError, req, res, () => {});

    assert.equal(statusCode, 400);
    assert.equal(jsonResponse.success, false);
    assert.equal(jsonResponse.message, 'Malformed JSON payload in request body.');
  });

  it('4. errorHandler preserves custom status codes and avoids leaking stack traces', () => {
    let statusCode = 200;
    let jsonResponse = null;

    const customError = new Error('Invalid authentication token');
    const req = {};
    const res = {
      statusCode: 401,
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };

    errorHandler(customError, req, res, () => {});

    assert.equal(statusCode, 401);
    assert.equal(jsonResponse.success, false);
    assert.equal(jsonResponse.message, 'Invalid authentication token');
    assert.equal(jsonResponse.stack, undefined, 'Stack trace must not be exposed to client');
  });

  it('5. errorHandler defaults to 500 when status code is not set or is 200', () => {
    let statusCode = 200;
    let jsonResponse = null;

    const genericError = new Error('Database connection dropped');
    const req = {};
    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };

    errorHandler(genericError, req, res, () => {});

    assert.equal(statusCode, 500);
    assert.equal(jsonResponse.success, false);
    assert.equal(jsonResponse.message, 'Database connection dropped');
  });

});
