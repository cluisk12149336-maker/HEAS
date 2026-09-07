/**
 * Bug Condition Exploration Test
 * Account Creation Email Notification
 * 
 * **VALIDATES: Requirements 1.1, 1.2, 2.1, 2.2**
 * 
 * This test demonstrates the bug: When users submit valid account requests,
 * NO confirmation emails are sent. This is the core issue.
 * 
 * The test will FAIL on unfixed code - this is EXPECTED and CORRECT.
 * Failure proves the bug exists.
 */

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

describe('Account Creation Email Notification - Bug Condition', () => {
  jest.setTimeout(30000);

  /**
   * Test Scenario 1: Valid HEAD Role Request
   * 
   * Bug: Account created successfully (201) but NO email sent
   * Expected Fix: Email should be sent with employee ID, role, and pending status
   */
  test('DEMO 1: Valid HEAD role request creates account but sends NO email (BUG)', async () => {
    const email = `ahead-demo-${Date.now()}@umak.edu.ph`;
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║ SCENARIO 1: Valid HEAD Role Request                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`User submits: name=Alice Head, email=${email}, role=HEAD`);
    
    const response = await makeRequest('POST', '/api/request-account', {
      name: 'Alice Head',
      email: email,
      password: 'SecurePass123!@#ABC',
      role: 'HEAD'
    });

    console.log(`Response Status: ${response.statusCode}`);
    if (response.statusCode !== 201) {
      console.log(`Response Body:`, JSON.stringify(response.body, null, 2));
    }

    // Account should be successfully created
    expect(response.statusCode).toBe(201);
    expect(response.body.ok).toBe(true);
    
    console.log(`✗ EMAIL SENT: NO (THIS IS THE BUG)`);
    console.log(`  Expected: Confirmation email to ${email}`);
    console.log(`  Expected Email Content:`);
    console.log(`    - Employee ID (e.g., EMP-123456-ABCDEF)`);
    console.log(`    - Role: HEAD`);
    console.log(`    - Status: Pending (awaiting approval)`);
    console.log(`  Actual: User receives only HTTP 201 response, NO email`);
  });

  /**
   * Test Scenario 2: Valid Responder Request
   * 
   * Bug: Account created successfully (201) but NO email sent
   * Expected Fix: Email should be sent with employee ID, role, and pending status
   */
  test('DEMO 2: Valid Responder request creates account but sends NO email (BUG)', async () => {
    const email = `bresponder-demo-${Date.now()}@umak.edu.ph`;
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║ SCENARIO 2: Valid Responder Request                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`User submits: name=Bob Responder, email=${email}, role=Responder`);
    
    const response = await makeRequest('POST', '/api/request-account', {
      name: 'Bob Responder',
      email: email,
      password: 'SecurePass456!@#ABC',
      role: 'Responder'
    });

    console.log(`Response Status: ${response.statusCode}`);
    if (response.statusCode !== 201) {
      console.log(`Response Body:`, JSON.stringify(response.body, null, 2));
    }

    // Account should be successfully created
    expect(response.statusCode).toBe(201);
    expect(response.body.ok).toBe(true);
    
    console.log(`✗ EMAIL SENT: NO (THIS IS THE BUG)`);
    console.log(`  Expected: Confirmation email to ${email}`);
    console.log(`  Expected Email Content:`);
    console.log(`    - Employee ID (e.g., EMP-123456-ABCDEF)`);
    console.log(`    - Role: Responder`);
    console.log(`    - Status: Pending (awaiting approval)`);
    console.log(`  Actual: User receives only HTTP 201 response, NO email`);
  });

  /**
   * Test Scenario 3: Valid System Admin Request
   * 
   * Bug: Account created successfully (201) but NO email sent
   * Expected Fix: Email should be sent with employee ID, role, and pending status
   */
  test('DEMO 3: Valid System Admin request creates account but sends NO email (BUG)', async () => {
    const email = `cadmin-demo-${Date.now()}@umak.edu.ph`;
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║ SCENARIO 3: Valid System Admin Request                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`User submits: name=Charlie Admin, email=${email}, role=System Admin`);
    
    const response = await makeRequest('POST', '/api/request-account', {
      name: 'Charlie Admin',
      email: email,
      password: 'SecurePass789!@#ABC',
      role: 'System Admin'
    });

    console.log(`Response Status: ${response.statusCode}`);
    if (response.statusCode !== 201) {
      console.log(`Response Body:`, JSON.stringify(response.body, null, 2));
    }

    // Account should be successfully created
    expect(response.statusCode).toBe(201);
    expect(response.body.ok).toBe(true);
    
    console.log(`✗ EMAIL SENT: NO (THIS IS THE BUG)`);
    console.log(`  Expected: Confirmation email to ${email}`);
    console.log(`  Expected Email Content:`);
    console.log(`    - Employee ID (e.g., EMP-123456-ABCDEF)`);
    console.log(`    - Role: System Admin`);
    console.log(`    - Status: Pending (awaiting approval)`);
    console.log(`  Actual: User receives only HTTP 201 response, NO email`);
  });
});
