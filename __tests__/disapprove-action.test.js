const http = require('http');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Admin User Directory - Disapprove & Delete Actions', () => {
  const testEmpId = `TEST-DIS-${Date.now()}`;
  const testEmail = `temp-${Date.now()}@umak.edu.ph`;

  beforeAll(async () => {
    // Seed temporary pending user
    await supabase.from('employee_accounts').insert({
      employee_id: testEmpId,
      employee_email: testEmail,
      employee_name: 'Test Disapproval Candidate',
      employee_role: 'Responder',
      employee_pass: 'DummyPassword123!',
      employee_status: 'Pending'
    });
  });

  afterAll(async () => {
    // Cleanup if still present
    await supabase.from('employee_accounts').delete().eq('employee_id', testEmpId);
  });

  test('POST /api/admin/accounts/:id/disapprove updates status to Inactive', async () => {
    const res = await request('POST', `/api/admin/accounts/${testEmpId}/disapprove`, {
      reason: 'Failed background verification'
    });

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.status).toBe('Inactive');

    // Verify in database
    const { data } = await supabase
      .from('employee_accounts')
      .select('employee_status')
      .eq('employee_id', testEmpId)
      .single();

    expect(data.employee_status).toBe('Inactive');
  });

  test('DELETE /api/admin/accounts/:id removes account completely', async () => {
    const res = await request('DELETE', `/api/admin/accounts/${testEmpId}`);

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    // Verify deleted from database
    const { data } = await supabase
      .from('employee_accounts')
      .select('employee_id')
      .eq('employee_id', testEmpId)
      .maybeSingle();

    expect(data).toBeNull();
  });
});
