const http = require('http');
const fs = require('fs');
const path = require('path');

function request(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path: reqPath,
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
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('System Admin Incident Actions', () => {
  let sampleIncidentId = null;

  beforeAll(async () => {
    try {
      const res = await request('GET', '/api/incidents');
      if (res.data && Array.isArray(res.data.incidents) && res.data.incidents.length > 0) {
        sampleIncidentId = res.data.incidents[0].id;
      }
    } catch (_) {}
  });

  test('dashboard.html labels System Admin access without claiming view-only mode', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="incidentsRoleBadge"');
    expect(html).toContain('System Admin Access');
    expect(html).toContain('id="alertDetailsViewOnlyNotice"');
    expect(html).toContain('System Admin access');
  });

  test('dashboard.js defines isSystemAdminRole helper correctly', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('function isSystemAdminRole(');
    expect(js).toContain("cleanRole === 'system administrator' || cleanRole === 'system admin' || cleanRole === 'admin'");
    expect(js).toContain('window.isSystemAdminRole = isSystemAdminRole;');
    expect(js).toContain('return isHeadRole(role) || isSystemAdminRole(role);');
    expect(js).toContain('window.canResolveOrCancelIncidents = canResolveOrCancelIncidents;');
  });

  test('dashboard.js leaves Resolve and Cancel available for System Admin when incident state allows', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).not.toContain('View-only access: System Admin accounts cannot resolve incidents.');
    expect(js).not.toContain('View-only access: System Admin accounts cannot cancel incidents.');
    expect(js).toContain("resolveBtn.disabled = false;");
    expect(js).toContain("cancelBtn.disabled = false;");
  });

  test('dashboard.js no longer blocks System Admin actions in client-side handlers', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).not.toContain('System Admin accounts have view-only access and cannot cancel incidents.');
    expect(js).not.toContain('System Admin accounts have view-only access and cannot resolve incidents.');
  });

  test('dashboard.js renders a clickable Resolve action in the incidents table', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('class="filter-btn incident-row-resolve-btn" data-incident-id=');
    expect(js).not.toContain('title="View only: System Admin accounts cannot resolve incidents."');
  });

  test('PUT /api/reports/incidents/:id/status does not reject System Admin by role alone', async () => {
    const probeIncidentId = '00000000-0000-4000-8000-000000000000';
    const res = await request('PUT', `/api/reports/incidents/${probeIncidentId}/status`, {
      status: 'Resolved',
      resolution_summary: 'System Admin action permission probe.'
    }, {
      'x-employee-role': 'System Admin',
      'x-employee-name': 'Sys Admin'
    });

    expect(res.status).not.toBe(403);
  });
});
