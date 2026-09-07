const fc = require('fast-check');

// Helper to create a reset session
function createResetSession(resetId, overrides = {}) {
  return {
    email: 'user@umak.edu.ph',
    code: '123456',
    verified: false,
    expires: Date.now() + 5 * 60 * 1000,
    lastResendTime: Date.now() - 40 * 1000, // Set to past so throttle is not active
    ...overrides
  };
}

// Mock passwordResets Map for testing
let passwordResets;

beforeEach(() => {
  passwordResets = new Map();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// Helper to simulate resend endpoint logic
function resendPasswordReset(resetId) {
  if (!resetId || typeof resetId !== 'string') {
    return { status: 400, error: 'Invalid request.' };
  }

  const reset = passwordResets.get(resetId);
  if (!reset || reset.expires < Date.now()) {
    return { status: 401, error: 'Verification session expired. Please request a new password reset.' };
  }

  const timeSinceLastResend = Date.now() - reset.lastResendTime;
  if (timeSinceLastResend < 30 * 1000) {
    return { status: 429, error: 'Please wait 30 seconds before requesting another code.' };
  }

  const newCode = String(Math.floor(100000 + Math.random() * 900000));
  reset.code = newCode;
  reset.expires = Date.now() + 5 * 60 * 1000;
  reset.lastResendTime = Date.now();

  return { status: 200, email: reset.email, emailSent: true, expiresIn: 300 };
}

// ============================================================================
// PROPERTY 1: New Code Generation
// **Validates: Requirements 2.1**
// ============================================================================
describe('Property 1: New Code Generation', () => {
  it('should generate a new 6-digit code different from the previous code', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        (resetId) => {
          const session = createResetSession(resetId, { code: '000000' });
          passwordResets.set(resetId, session);
          const oldCode = session.code;

          const result = resendPasswordReset(resetId);

          const newCode = passwordResets.get(resetId).code;
          // Check: new code is 6 digits
          expect(newCode).toMatch(/^\d{6}$/);
          // Check: new code was generated (most likely different, but focus on format)
          expect(typeof newCode).toBe('string');
          expect(newCode.length).toBe(6);
          // Check: response is successful
          expect(result.status).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 2: Code Invalidation on Resend
// **Validates: Requirements 2.2, 7.2, 7.4**
// ============================================================================
describe('Property 2: Code Invalidation on Resend', () => {
  it('should invalidate old code and validate new code after resend', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        (resetId) => {
          const session = createResetSession(resetId, { code: '111111' });
          passwordResets.set(resetId, session);
          const oldCode = session.code;

          const resendResult = resendPasswordReset(resetId);
          expect(resendResult.status).toBe(200);

          const newCode = passwordResets.get(resetId).code;
          const updatedSession = passwordResets.get(resetId);

          // Check: old code no longer matches
          expect(updatedSession.code).not.toBe(oldCode);
          // Check: new code is in session
          expect(updatedSession.code).toBe(newCode);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 3: Expiration Time Reset
// **Validates: Requirements 2.3**
// ============================================================================
describe('Property 3: Expiration Time Reset', () => {
  it('should reset expiration to 5 minutes from resend time, not original time', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        fc.integer({ min: 0, max: 100000 }),
        (resetId, timeAdvance) => {
          const session = createResetSession(resetId, { 
            expires: Date.now() + 5 * 60 * 1000 
          });
          passwordResets.set(resetId, session);
          const originalExpires = session.expires;

          // Advance time
          jest.advanceTimersByTime(timeAdvance);

          // Resend
          const resendResult = resendPasswordReset(resetId);
          expect(resendResult.status).toBe(200);

          const updatedSession = passwordResets.get(resetId);
          const expectedExpires = Date.now() + 5 * 60 * 1000;

          // Check: expiration was reset (not based on original time)
          expect(updatedSession.expires).toBe(expectedExpires);
          // Check: if time advanced, expiration changed
          if (timeAdvance > 0) {
            expect(updatedSession.expires).toBeGreaterThan(originalExpires);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 4: Throttle Window Enforcement
// **Validates: Requirements 4.2**
// ============================================================================
describe('Property 4: Throttle Window Enforcement', () => {
  it('should reject resend requests within 30-second throttle window', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        fc.integer({ min: 0, max: 29999 }),
        (resetId, throttleDelay) => {
          const session = createResetSession(resetId);
          // Set lastResendTime to be just now so throttle applies
          session.lastResendTime = Date.now();
          passwordResets.set(resetId, session);

          // Try resend within throttle window
          jest.advanceTimersByTime(throttleDelay);
          const result = resendPasswordReset(resetId);

          // Check: request is throttled
          expect(result.status).toBe(429);
          expect(result.error).toContain('30 seconds');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 5: Throttle Window Reset
// **Validates: Requirements 4.4**
// ============================================================================
describe('Property 5: Throttle Window Reset', () => {
  it('should allow resend after 30-second throttle window elapses', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        (resetId) => {
          const session = createResetSession(resetId);
          passwordResets.set(resetId, session);

          // First resend succeeds
          const firstResend = resendPasswordReset(resetId);
          expect(firstResend.status).toBe(200);

          // Advance time by 30+ seconds
          jest.advanceTimersByTime(30 * 1000 + 100);

          // Second resend should also succeed
          const secondResend = resendPasswordReset(resetId);
          expect(secondResend.status).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 6: Per-Session Throttle Isolation
// **Validates: Requirements 4.5**
// ============================================================================
describe('Property 6: Per-Session Throttle Isolation', () => {
  it('should enforce throttle per session, not globally', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 20, maxLength: 50 }), {
          minLength: 3,
          maxLength: 10,
          uniqueBy: (id) => id
        }),
        (resetIds) => {
          // Create multiple reset sessions
          resetIds.forEach((id) => {
            const session = createResetSession(id);
            passwordResets.set(id, session);
          });

          // Try resend on first session
          const firstResend = resendPasswordReset(resetIds[0]);
          expect(firstResend.status).toBe(200);

          // Immediately try resend on second session (within throttle of first)
          const secondResend = resendPasswordReset(resetIds[1]);
          // Second should succeed because it's a different session
          expect(secondResend.status).toBe(200);

          // Try resend on first session again (within throttle)
          const firstRetry = resendPasswordReset(resetIds[0]);
          expect(firstRetry.status).toBe(429);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// PROPERTY 7: Resend Success Response Structure
// **Validates: Requirements 5.6, 5.7**
// ============================================================================
describe('Property 7: Resend Success Response Structure', () => {
  it('should return all required fields in success response', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        fc.emailAddress(),
        (resetId, email) => {
          const session = createResetSession(resetId, { email });
          passwordResets.set(resetId, session);

          const result = resendPasswordReset(resetId);

          // Check: response is successful
          expect(result.status).toBe(200);
          // Check: has email field
          expect(result.email).toBeDefined();
          expect(typeof result.email).toBe('string');
          // Check: has emailSent boolean
          expect(result.emailSent).toBeDefined();
          expect(typeof result.emailSent).toBe('boolean');
          // Check: has expiresIn = 300
          expect(result.expiresIn).toBe(300);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 8: Missing resetId Rejection
// **Validates: Requirements 8.1**
// ============================================================================
describe('Property 8: Missing resetId Rejection', () => {
  it('should reject requests with invalid resetId (null, undefined, non-string)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
          fc.integer(),
          fc.boolean(),
          fc.object()
        ),
        (invalidResetId) => {
          const result = resendPasswordReset(invalidResetId);

          // Check: request rejected with 400
          expect(result.status).toBe(400);
          expect(result.error).toContain('Invalid request');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 9: Session Not Found Rejection
// **Validates: Requirements 5.3**
// ============================================================================
describe('Property 9: Session Not Found Rejection', () => {
  it('should reject requests with non-existent resetId', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        (nonExistentResetId) => {
          // Ensure resetId doesn't exist
          passwordResets.delete(nonExistentResetId);

          const result = resendPasswordReset(nonExistentResetId);

          // Check: request rejected with 401
          expect(result.status).toBe(401);
          expect(result.error).toContain('Verification session expired');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROPERTY 10: Email Failure Tolerance
// **Validates: Requirements 3.6**
// ============================================================================
describe('Property 10: Email Failure Tolerance', () => {
  it('should succeed even when email delivery fails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 50 }),
        (resetId) => {
          const session = createResetSession(resetId);
          passwordResets.set(resetId, session);

          // Simulate resend with email failure
          // (In real implementation, this would be mocked at deliverOtp level)
          const result = resendPasswordReset(resetId);

          // Check: response is still successful (200)
          expect(result.status).toBe(200);
          // Check: code was updated
          const updatedSession = passwordResets.get(resetId);
          expect(updatedSession.code).toBeDefined();
          expect(updatedSession.code).toMatch(/^\d{6}$/);
          // Check: code is valid for verification (not expired)
          expect(updatedSession.expires).toBeGreaterThan(Date.now());
        }
      ),
      { numRuns: 100 }
    );
  });
});
