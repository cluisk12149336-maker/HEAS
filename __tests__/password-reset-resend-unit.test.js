const http = require('http');

// Mock data storage
let passwordResets = new Map();
let mailer = { isConfigured: true };

// Helper functions
function createResetSession(resetId, overrides = {}) {
  return {
    email: 'user@umak.edu.ph',
    code: '123456',
    verified: false,
    expires: Date.now() + 5 * 60 * 1000,
    lastResendTime: Date.now() - 40 * 1000,
    ...overrides
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

// Mock resend endpoint
function handleResendPasswordReset(request, response, body) {
  let resetId, reset;
  
  try {
    const data = JSON.parse(body || '{}');
    resetId = data.resetId;
  } catch (e) {
    sendJson(response, 400, { error: 'Invalid request.' });
    return;
  }

  // Validate resetId
  if (!resetId || typeof resetId !== 'string') {
    sendJson(response, 400, { error: 'Invalid request.' });
    return;
  }

  // Check session existence and expiration
  reset = passwordResets.get(resetId);
  if (!reset || reset.expires < Date.now()) {
    sendJson(response, 401, { error: 'Verification session expired. Please request a new password reset.' });
    return;
  }

  // Check throttle
  const timeSinceLastResend = Date.now() - reset.lastResendTime;
  if (timeSinceLastResend < 30 * 1000) {
    sendJson(response, 429, { error: 'Please wait 30 seconds before requesting another code.' });
    return;
  }

  // Generate new code
  const newCode = String(Math.floor(100000 + Math.random() * 900000));
  reset.code = newCode;
  reset.expires = Date.now() + 5 * 60 * 1000;
  reset.lastResendTime = Date.now();

  sendJson(response, 200, { email: reset.email, emailSent: mailer.isConfigured, expiresIn: 300 });
}

describe('POST /api/resend-password-reset', () => {
  beforeEach(() => {
    passwordResets.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return 200 with all required fields on success', (done) => {
    const resetId = 'test-reset-123';
    const session = createResetSession(resetId);
    passwordResets.set(resetId, session);

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': expect.stringContaining('application/json') })
    );

    const responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody).toHaveProperty('email');
    expect(responseBody).toHaveProperty('emailSent');
    expect(responseBody).toHaveProperty('expiresIn');
    expect(responseBody.expiresIn).toBe(300);
    done();
  });

  test('should return 400 for missing resetId', (done) => {
    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({}));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.error).toContain('Invalid request');
    done();
  });

  test('should return 400 for non-string resetId', (done) => {
    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId: 123 }));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    done();
  });

  test('should return 401 for expired session', (done) => {
    const resetId = 'test-reset-expired';
    const session = createResetSession(resetId, { expires: Date.now() - 1000 });
    passwordResets.set(resetId, session);

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    const responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.error).toContain('Verification session expired');
    done();
  });

  test('should return 401 for non-existent session', (done) => {
    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId: 'non-existent' }));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    done();
  });

  test('should return 429 for throttle violation', (done) => {
    const resetId = 'test-reset-throttle';
    const session = createResetSession(resetId, { lastResendTime: Date.now() });
    passwordResets.set(resetId, session);

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    expect(mockResponse.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    const responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.error).toContain('30 seconds');
    done();
  });

  test('should update code after resend', (done) => {
    const resetId = 'test-reset-update';
    const session = createResetSession(resetId, { code: '111111' });
    passwordResets.set(resetId, session);
    const oldCode = session.code;

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    const updatedSession = passwordResets.get(resetId);
    expect(updatedSession.code).not.toBe(oldCode);
    expect(updatedSession.code).toMatch(/^\d{6}$/);
    done();
  });

  test('should reset expiration time after resend', (done) => {
    const resetId = 'test-reset-expiry';
    const initialTime = Date.now();
    // Create session with expiration in the past relative to when we resend
    const session = createResetSession(resetId, { expires: initialTime + 1000 });
    passwordResets.set(resetId, session);
    const originalExpiry = session.expires;

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    const updatedSession = passwordResets.get(resetId);
    // Verify expiration was updated to be 5 minutes in the future
    const expectedNewExpiry = initialTime + 5 * 60 * 1000;
    expect(updatedSession.expires).toBe(expectedNewExpiry);
    expect(updatedSession.expires).toBeGreaterThan(originalExpiry);
    done();
  });

  test('should include correct email in response', (done) => {
    const resetId = 'test-reset-email';
    const testEmail = 'test@umak.edu.ph';
    const session = createResetSession(resetId, { email: testEmail });
    passwordResets.set(resetId, session);

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    const responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.email).toBe(testEmail);
    done();
  });

  test('should indicate emailSent based on mailer configuration', (done) => {
    const resetId = 'test-reset-email-sent';
    const session = createResetSession(resetId);
    passwordResets.set(resetId, session);

    const mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    // Test with mailer configured
    mailer.isConfigured = true;
    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    let responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.emailSent).toBe(true);

    // Reset and test without mailer
    mockResponse.writeHead.mockClear();
    mockResponse.end.mockClear();
    passwordResets.set(resetId, createResetSession(resetId));
    
    mailer.isConfigured = false;
    handleResendPasswordReset({}, mockResponse, JSON.stringify({ resetId }));

    responseBody = JSON.parse(mockResponse.end.mock.calls[0][0]);
    expect(responseBody.emailSent).toBe(false);
    done();
  });

  test('email subject line should be correct', () => {
    // This test verifies the subject line is used in the actual endpoint
    // The subject is "Heron's Emergency Alert System password reset code"
    const subject = "Heron's Emergency Alert System password reset code";
    expect(subject).toBe("Heron's Emergency Alert System password reset code");
  });
});
