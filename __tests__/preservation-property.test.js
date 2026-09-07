/**
 * Preservation Property Tests
 * Account Creation Email Notification
 * 
 * **VALIDATES: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * These tests establish the baseline behavior that MUST NOT CHANGE when fixing the bug.
 * They test error scenarios and edge cases to ensure no regressions occur.
 * 
 * Property 2: Preservation - Unchanged Request Validation and Error Handling
 * 
 * For any account creation request where the input is invalid or duplicate,
 * the fixed endpoint SHALL produce the same validation errors, database constraints,
 * and HTTP responses as the original code.
 * 
 * Tests should PASS on unfixed code (establishing baseline).
 */

const fc = require('fast-check');
const http = require('http');

/**
 * Helper: Make HTTP request
 */
function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: data ? JSON.parse(data) : {}
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: { error: data }
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Generate a valid password for testing
 * Must have: >=16 chars, uppercase, lowercase, number, special char
 */
function generateValidPassword() {
  return 'SecurePass123!@#';
}

/**
 * Generate a valid UMAK email
 */
function generateValidEmail() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `test-${timestamp}-${random}@umak.edu.ph`;
}

describe('Account Creation Preservation Tests - Property-Based', () => {
  jest.setTimeout(30000);

  /**
   * PRESERVATION TEST 1: Invalid Email Format
   * 
   * Requirement 3.1: Invalid emails should return 400 and NOT create account
   * 
   * Generate non-umak.edu.ph emails, verify 400 response is returned unchanged.
   */
  test('PROPERTY 1: Invalid Email Preservation - non-umak.edu.ph emails return 400', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 1: Invalid Email Preservation (3.1)               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Generate invalid emails (NOT @umak.edu.ph)
    const invalidEmails = [
      'user@gmail.com',
      'test@yahoo.com',
      'invalid@outlook.com',
      'someone@test.com',
      'wrong@umak.com',
      'notright@umak.org',
      'noemail@.invalid',
      'missing@domain',
      'wrong.format@domain',
      'admin@localhost'
    ];

    let passCount = 0;

    for (const invalidEmail of invalidEmails) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: 'Test User',
        email: invalidEmail,
        password: generateValidPassword(),
        role: 'HEAD'
      });

      expect(response.statusCode).toBe(400);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} invalid email variations - all returned 400`);
  });

  /**
   * PRESERVATION TEST 2: Weak Password
   * 
   * Requirement 3.1: Weak passwords should return 400 and NOT create account
   * 
   * Generate passwords missing required character types, verify 400 response unchanged.
   * Must have: >=16 chars, uppercase, lowercase, number, special char
   */
  test('PROPERTY 2: Weak Password Preservation - invalid passwords return 400', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 2: Weak Password Preservation (3.1)               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const weakPasswords = [
      'short123!A', // Too short
      'nouppercase123!@#', // No uppercase
      'NOLOWERCASE123!@#', // No lowercase
      'NoNumbersHere!@#abcde', // No number
      'NoSpecialChar123ABC', // No special character
      '123456789abcdef', // All lowercase + numbers
      'ABCDEFGHIJKLMNOP', // All uppercase
      'aaaaaaaaaaaaaaaa', // Same char repeated
      '!@#$%^&*()', // Only special chars
      'Pass123' // Too short with valid types
    ];

    let passCount = 0;

    for (const weakPassword of weakPasswords) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: 'Test User',
        email: generateValidEmail(),
        password: weakPassword,
        role: 'HEAD'
      });

      expect(response.statusCode).toBe(400);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} weak password variations - all returned 400`);
  });

  /**
   * PRESERVATION TEST 3: Invalid Role
   * 
   * Requirement 3.1: Invalid roles should return 400 and NOT create account
   * 
   * Generate invalid role values (not HEAD, System Admin, Responder), verify 400 response unchanged.
   */
  test('PROPERTY 3: Invalid Role Preservation - invalid roles return 400', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 3: Invalid Role Preservation (3.1)                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const invalidRoles = [
      'InvalidRole',
      'Admin',
      'User',
      'Employee',
      'Manager',
      'Head', // Wrong case
      'system admin', // Wrong case
      'responder', // Wrong case
      'SuperAdmin',
      'Trainer',
      '', // Empty
      'HEAD, System Admin', // Multiple roles
      'HEAD\\nSystem Admin' // Injection attempt
    ];

    let passCount = 0;

    for (const invalidRole of invalidRoles) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: 'Test User',
        email: generateValidEmail(),
        password: generateValidPassword(),
        role: invalidRole
      });

      expect(response.statusCode).toBe(400);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} invalid role variations - all returned 400`);
  });

  /**
   * PRESERVATION TEST 4: Duplicate Email
   * 
   * Requirement 3.2: Duplicate emails should return 409 conflict
   * 
   * Submit two requests with the same email, verify second returns 409 response unchanged.
   */
  test('PROPERTY 4: Duplicate Email Preservation - duplicate emails return 409', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 4: Duplicate Email Preservation (3.2)             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    let passCount = 0;

    for (let i = 0; i < 5; i++) {
      const sharedEmail = generateValidEmail();
      
      // First request should succeed (201)
      const response1 = await makeRequest('POST', '/api/request-account', {
        name: 'First User',
        email: sharedEmail,
        password: generateValidPassword(),
        role: 'HEAD'
      });

      expect(response1.statusCode).toBe(201);

      // Second request with same email should return 409 (Conflict)
      const response2 = await makeRequest('POST', '/api/request-account', {
        name: 'Second User',
        email: sharedEmail,
        password: generateValidPassword(),
        role: 'Responder'
      });

      expect(response2.statusCode).toBe(409);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} duplicate email pairs - all returned 409 on duplicate`);
  });

  /**
   * PRESERVATION TEST 5: Invalid Name
   * 
   * Requirement 3.1: Invalid names should return 400 and NOT create account
   */
  test('PROPERTY 5: Invalid Name Preservation - missing/empty names return 400', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 5: Invalid Name Preservation (3.1)                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const invalidNames = [
      '', // Empty string
      '   ', // Only whitespace
      '\t\n', // Whitespace variations
      'a'.repeat(151) // Too long (>150 chars)
    ];

    let passCount = 0;

    for (const invalidName of invalidNames) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: invalidName,
        email: generateValidEmail(),
        password: generateValidPassword(),
        role: 'HEAD'
      });

      expect(response.statusCode).toBe(400);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} invalid name variations - all returned 400`);
  });

  /**
   * PRESERVATION TEST 6: Valid Requests Should Still Succeed
   * 
   * Requirement 3.1-3.4 (Preservation): When inputs ARE valid, account creation should CONTINUE to work.
   * This ensures the fix doesn't break the baseline happy path for non-email-sending parts.
   */
  test('PROPERTY 6: Valid Requests Still Succeed - 201 response for valid inputs', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 6: Valid Request Preservation (3.1-3.4)           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const validRequests = [
      { name: 'Alice Head', role: 'HEAD' },
      { name: 'Bob Responder', role: 'Responder' },
      { name: 'Charlie Admin', role: 'System Admin' },
      { name: 'Diana Smith', role: 'HEAD' },
      { name: 'Eve Johnson', role: 'Responder' },
      { name: 'Frank Brown', role: 'System Admin' },
      { name: 'Grace Lee', role: 'HEAD' },
      { name: 'Henry Davis', role: 'Responder' }
    ];

    let passCount = 0;
    let createdCount = 0;

    for (const request of validRequests) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: request.name,
        email: generateValidEmail(),
        password: generateValidPassword(),
        role: request.role
      });

      expect(response.statusCode).toBe(201);
      expect(response.body.ok).toBe(true);
      createdCount++;
      passCount++;
    }

    console.log(`✓ Tested ${passCount} valid requests - all returned 201`);
    console.log(`✓ ${createdCount} accounts successfully created`);
  });

  /**
   * PRESERVATION TEST 7: Multiple Invalid Field Combinations
   * 
   * Requirement 3.1: Any combination of invalid fields should return 400
   * Tests that validation catches multiple issues
   */
  test('PROPERTY 7: Invalid Field Combinations - multiple errors still return 400', async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║ PROPERTY 7: Invalid Field Combinations (3.1)               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const invalidCombinations = [
      { name: '', email: 'bad@gmail.com', password: 'weak', role: 'BadRole' },
      { name: '   ', email: 'bad@yahoo.com', password: 'short', role: 'Manager' },
      { name: 'Valid', email: 'noemail', password: 'NoNumbersHere!@#ab', role: 'BadRole' },
      { name: 'a'.repeat(151), email: 'user@umak.edu.ph', password: 'SecurePass123!@#', role: 'InvalidRole' }
    ];

    let passCount = 0;

    for (const combo of invalidCombinations) {
      const response = await makeRequest('POST', '/api/request-account', {
        name: combo.name,
        email: combo.email,
        password: combo.password,
        role: combo.role
      });

      expect(response.statusCode).toBe(400);
      passCount++;
    }

    console.log(`✓ Tested ${passCount} invalid field combinations - all returned 400`);
  });
});
