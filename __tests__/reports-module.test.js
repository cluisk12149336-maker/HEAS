const http = require('http');

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

describe('Incident Reports & Analytics Module', () => {
  let sampleIncidentId = null;

  test('dashboard Active Alerts View All opens the incidents directory with Active & On Going selected', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
    const dashboard = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    expect(html).toContain("navigateToIncidentsView('active_ongoing')");
    expect(dashboard).toContain('function navigateToIncidentsView(');
    expect(dashboard).toContain("targetFilter");
  });

  test('GET /api/reports/incidents returns metrics, analytics, and incidents list', async () => {
    const res = await request('GET', '/api/reports/incidents');
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    // Verify summary metric cards
    expect(res.data.metrics).toBeDefined();
    expect(typeof res.data.metrics.total).toBe('number');
    expect(res.data.metrics.total).toBeGreaterThanOrEqual(1);
    expect(res.data.metrics.active).toBeGreaterThanOrEqual(0);
    expect(res.data.metrics.pending).toBeGreaterThanOrEqual(0);
    expect(res.data.metrics.resolved).toBeGreaterThanOrEqual(0);
    expect(res.data.metrics.cancelled).toBeGreaterThanOrEqual(0);

    // Verify bottom historical performance analytics
    expect(res.data.analytics).toBeDefined();
    expect(res.data.analytics.avgResponseTime).toBeDefined();
    expect(res.data.analytics.monthlyTotal).toBeDefined();
    expect(res.data.analytics.resolutionRate).toBeDefined();
    expect(typeof res.data.analytics.medicalPct).toBe('number');
    expect(typeof res.data.analytics.securityPct).toBe('number');
    expect(typeof res.data.analytics.urgentPct).toBe('number');

    // Verify incidents structure
    expect(Array.isArray(res.data.incidents)).toBe(true);
    expect(res.data.incidents.length).toBeGreaterThan(0);

    const first = res.data.incidents[0];
    sampleIncidentId = first.id;
    expect(first.incident_code).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.status).toBeDefined();
    expect(first.student_name).toBeDefined();
    expect(first.location_address).toBeDefined();
  });

  test('GET /api/reports/incidents filters by status', async () => {
    const res = await request('GET', '/api/reports/incidents?status=Cancelled');
    expect(res.status).toBe(200);
    expect(res.data.incidents.every((i) => i.status.toLowerCase() === 'cancelled')).toBe(true);
  });

  test('GET /api/reports/incidents?status=Resolved shows resolved emergency incidents', async () => {
    const res = await request('GET', '/api/reports/incidents?status=Resolved');
    expect(res.status).toBe(200);
    expect(res.data.incidents.length).toBeGreaterThanOrEqual(1);
    expect(res.data.incidents.every((i) => i.status.toLowerCase() === 'resolved')).toBe(true);
    expect(res.data.metrics.resolved).toBeGreaterThanOrEqual(res.data.incidents.length);
    const resolvedIncident = res.data.incidents[0];
    expect(resolvedIncident.incident_code).toBeDefined();
    expect(resolvedIncident.student_name).toBeDefined();
    expect(resolvedIncident.resolved_at).toBeTruthy();
  });

  test('GET /api/reports/incidents filters by category', async () => {
    const res = await request('GET', '/api/reports/incidents?category=Medical');
    expect(res.status).toBe(200);
    expect(res.data.incidents.every((i) => i.category.toLowerCase() === 'medical')).toBe(true);
  });

  test('GET /api/reports/incidents searches by incident ID, student name, and incident type', async () => {
    // 1. Search by student name
    const resName = await request('GET', '/api/reports/incidents?search=Julie');
    expect(resName.status).toBe(200);
    expect(resName.data.incidents.length).toBeGreaterThan(0);
    expect(resName.data.incidents.every((i) => i.student_name.toLowerCase().includes('julie'))).toBe(true);

    // 2. Search by incident ID / code
    const targetCode = resName.data.incidents[0].incident_code;
    const resCode = await request('GET', `/api/reports/incidents?search=${targetCode}`);
    expect(resCode.status).toBe(200);
    expect(resCode.data.incidents.length).toBeGreaterThan(0);
    expect(resCode.data.incidents.some((i) => i.incident_code === targetCode)).toBe(true);

    // 3. Search by incident type
    const resType = await request('GET', '/api/reports/incidents?search=Medical');
    expect(resType.status).toBe(200);
    expect(resType.data.incidents.length).toBeGreaterThan(0);
    expect(resType.data.incidents.every((i) =>
      (i.category && i.category.toLowerCase().includes('medical')) ||
      (i.incident_detail && i.incident_detail.toLowerCase().includes('medical'))
    )).toBe(true);
  });

  test('PUT /api/reports/incidents/:id/status updates status in database', async () => {
    const listRes = await request('GET', '/api/reports/incidents?status=Resolved');
    expect(listRes.data.incidents.length).toBeGreaterThan(0);
    const targetItem = listRes.data.incidents[0];

    const res = await request('PUT', `/api/reports/incidents/${targetItem.id}/status`, {
      status: 'Resolved',
      resolution_summary: 'Responder coordinated support and confirmed the incident was safely resolved.'
    });

    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.incident.status).toBe('Resolved');
    expect(res.data.incident.resolution_summary).toBe('Responder coordinated support and confirmed the incident was safely resolved.');
  });

  test('POST /api/reports/incidents/:id/archive toggles archive state', async () => {
    expect(sampleIncidentId).toBeTruthy();

    // Archive
    const res1 = await request('POST', `/api/reports/incidents/${sampleIncidentId}/archive`);
    expect(res1.status).toBe(200);
    expect(res1.data.ok).toBe(true);
    expect(res1.data.is_archived).toBe(true);

    // Unarchive
    const res2 = await request('POST', `/api/reports/incidents/${sampleIncidentId}/archive`);
    expect(res2.status).toBe(200);
    expect(res2.data.ok).toBe(true);
    expect(res2.data.is_archived).toBe(false);
  });

  test('GET /api/reports/export returns CSV file attachment', async () => {
    const res = await request('GET', '/api/reports/export?format=excel');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('Incident ID');
    expect(res.data).toContain('Category');
    expect(res.data).toContain('Reporter Name');
  });

  test('GET /api/reports/export?format=excel&reportType=resolved returns resolved CSV with resolution summary and duration', async () => {
    const res = await request('GET', '/api/reports/export?format=excel&reportType=resolved');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('heas-resolved-incidents-report.csv');
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('Incident ID');
    expect(res.data).toContain('Resolution Summary');
    expect(res.data).toContain('Duration');
    expect(res.data).toContain('Assigned Unit');
    expect(res.data).toContain('Resolved At');
  });

  test('GET /api/reports/export?format=excel filters exported incidents by search query', async () => {
    // Search by student name
    const resName = await request('GET', '/api/reports/export?format=excel&search=Julie');
    expect(resName.status).toBe(200);
    expect(resName.data).toContain('Julie May Billones');
    expect(resName.data).not.toContain('Patricia Lim');

    // Search by category / incident type
    const resCat = await request('GET', '/api/reports/export?format=excel&search=Medical');
    expect(resCat.status).toBe(200);
    expect(resCat.data).toContain('Medical');

    // Search by incident code
    const resCode = await request('GET', '/api/reports/export?format=excel&search=ICDFD0CC');
    expect(resCode.status).toBe(200);
    expect(resCode.data).toContain('ICDFD0CC');
  });

  test('GET /api/reports/export?format=pdf returns a downloadable PDF', async () => {
    const res = await request('GET', '/api/reports/export?format=pdf');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.data).toMatch(/^%PDF-/);
  });

  test('All cancelled incidents automatically go to archived in reports module', async () => {
    // 1. In archived view, all cancelled incidents are present and have is_archived: true
    const resArchived = await request('GET', '/api/reports/incidents?archived=true');
    expect(resArchived.status).toBe(200);
    expect(resArchived.data.metrics.cancelled).toBeGreaterThan(0);
    expect(resArchived.data.metrics.archived).toBeGreaterThanOrEqual(resArchived.data.metrics.cancelled);
    const cancelledIncidents = resArchived.data.incidents.filter(i => (i.status || '').toLowerCase() === 'cancelled');
    expect(cancelledIncidents.length).toBeGreaterThan(0);
    expect(cancelledIncidents.every(i => i.is_archived === true)).toBe(true);

    // 2. In default active/non-archived view, cancelled incidents do not appear in the active table
    const resDefault = await request('GET', '/api/reports/incidents');
    expect(resDefault.status).toBe(200);
    expect(resDefault.data.incidents.every(i => (i.status || '').toLowerCase() !== 'cancelled')).toBe(true);
  });

  test('UI has Download Incident Report button and does not contain Download Incident Dossier', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    expect(dashboardJs).toContain('title="Download Incident Report"');
    expect(dashboardJs).toContain('Official Incident Report:');
    expect(dashboardJs).not.toContain('title="Download Incident Dossier"');
  });

  test('Audit modal renders Student Information, Dispatcher Assigned with finish time, and Outcome Verified without database audit logged', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    // 1. Student Information
    expect(dashboardJs).toContain('1. Student Information');
    expect(dashboardJs).not.toContain('1. Triggered &amp; Received by System');
    expect(dashboardJs).toContain('Request Date &amp; Time:');
    expect(dashboardJs).toContain('Student Name:');
    expect(dashboardJs).toContain('Address in UMak:');

    // 2. Dispatcher Assigned
    expect(dashboardJs).toContain('2. Dispatcher Assigned');
    expect(dashboardJs).toContain('Assigned Responder:');
    expect(dashboardJs).toContain('Date &amp; Time Resolved:');

    // 3. Resolution / Current Status
    expect(dashboardJs).toContain('3. Resolution / Current Status');
    expect(dashboardJs).toContain('Current Status Date &amp; Time:');
    expect(dashboardJs).toContain('showOutcomeVerified');
    expect(dashboardJs).not.toContain('Database audit logged');
    expect(dashboardJs).not.toContain('database audit logged');
  });
});
