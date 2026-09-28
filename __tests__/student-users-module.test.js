const fs = require('fs');
const path = require('path');
const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
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
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Users Module - Student Directory with Actions and Status Connection', () => {
  const htmlPath = path.join(__dirname, '../public/dashboard.html');
  const jsPath = path.join(__dirname, '../public/dashboard.js');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  test('dashboard shows active student accounts and links to the Active student filter', () => {
    expect(html).toContain('<small>ACTIVE STUDENT ACCOUNTS</small>');
    expect(html).toContain('id="metricActiveStudentAccounts"');
    expect(html).toContain("navigateToStudentAccounts('Active')");
    expect(html).toContain('<small>ADMIN ACCOUNTS</small>');
    expect(html).not.toContain('id="metricPendingApprovals"');
    expect(js).toContain("evaluateStudentStatus(student) === 'Active'");
    expect(js).toContain('function navigateToStudentAccounts(filter)');
    expect(js).toContain('button.dataset.studentFilter === filter');
  });

  test('dashboard.html users module contains student records with Actions header and Disapproved + Inactive filters', () => {
    const usersViewStart = html.indexOf('id="view-users"');
    expect(usersViewStart).toBeGreaterThan(-1);
    const usersViewEnd = html.indexOf('</section>', usersViewStart);
    const usersViewSnippet = html.slice(usersViewStart, usersViewEnd);

    // Admin container removed from users view
    expect(usersViewSnippet).not.toContain('id="adminUsersPanel"');
    expect(usersViewSnippet).not.toContain('id="fullUsersTable"');

    // Student container and table exist
    expect(usersViewSnippet).toContain('id="studentUsersPanel"');
    expect(usersViewSnippet).toContain('id="studentUsersTable"');
    expect(usersViewSnippet).toContain('id="studentUsersTableBody"');

    // ACTIONS header exists in student table
    expect(usersViewSnippet).toContain('<th>ACTIONS</th>');

    // Filters for Active, Pending, Disapproved, and Inactive exist
    expect(usersViewSnippet).toContain('id="studentFilterTags"');
    expect(usersViewSnippet).toContain('data-student-filter="all"');
    expect(usersViewSnippet).toContain('data-student-filter="Active"');
    expect(usersViewSnippet).toContain('data-student-filter="Pending"');
    expect(usersViewSnippet).toContain('data-student-filter="Disapproved"');
    expect(usersViewSnippet).toContain('data-student-filter="Inactive"');
    expect(usersViewSnippet).toContain('data-student-filter="Suspended"');
  });

  test('dashboard.js defines student actions for Approve, Disapprove connected to updateStudentStatus and removes Inactive action button', () => {
    expect(js).toContain('updateStudentStatus');
    expect(js).toContain('window.updateStudentStatus = updateStudentStatus');
    expect(js).toContain('renderStudentUsersTable');
    expect(js).toContain('updateStudentFilterCounts');

    // Checks action buttons rendered (Approve and Disapprove only, Inactive removed)
    expect(js).toContain("updateStudentStatus('${safeStudentId}', 'Active')");
    expect(js).toContain("updateStudentStatus('${safeStudentId}', 'Disapproved')");
    expect(js).toContain("normStatus === 'suspended'");
    expect(js).toContain('>Reactivate</button>');
    expect(js).not.toContain("updateStudentStatus('${safeStudentId}', 'Inactive')");

    // Checks status badges for Disapproved and Inactive
    expect(js).toContain("normStatus === 'disapproved'");
    expect(js).toContain("normStatus === 'inactive'");
    expect(js).toContain('countDisapprovedStudents');
    expect(js).toContain('countInactiveStudents');

    // Checks 1-year inactivity rule evaluator
    expect(js).toContain('evaluateStudentStatus');
  });

  test('GET /api/students returns student records with status', async () => {
    const res = await request('GET', '/api/students');
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.students)).toBe(true);
    expect(res.data.students.length).toBeGreaterThan(0);

    const first = res.data.students[0];
    expect(first.student_id).toBeDefined();
    expect(first.student_name).toBeDefined();
    expect(first.student_status).toBeDefined();
  });

  test('PUT /api/students/:id/status updates student status to Disapproved, Inactive, and Active', async () => {
    const listRes = await request('GET', '/api/students');
    expect(listRes.status).toBe(200);
    const testStudent = listRes.data.students[0];
    const originalStatus = testStudent.student_status;

    // 1. Update to Disapproved
    const disRes = await request('PUT', `/api/students/${testStudent.student_id}/status`, {
      status: 'Disapproved'
    });
    expect(disRes.status).toBe(200);
    expect(disRes.data.ok).toBe(true);
    expect(disRes.data.student_status).toBe('Disapproved');

    // Verify in GET
    const verifyDis = await request('GET', '/api/students');
    const studentAfterDis = verifyDis.data.students.find((s) => s.student_id === testStudent.student_id);
    expect(studentAfterDis.student_status).toBe('Disapproved');

    // 2. Update to Inactive
    const inactRes = await request('PUT', `/api/students/${testStudent.student_id}/status`, {
      status: 'Inactive'
    });
    expect(inactRes.status).toBe(200);
    expect(inactRes.data.ok).toBe(true);
    expect(inactRes.data.student_status).toBe('Inactive');

    // Verify in GET
    const verifyInact = await request('GET', '/api/students');
    const studentAfterInact = verifyInact.data.students.find((s) => s.student_id === testStudent.student_id);
    expect(studentAfterInact.student_status).toBe('Inactive');

    // 3. Revert to original / Active
    const revRes = await request('PUT', `/api/students/${testStudent.student_id}/status`, {
      status: originalStatus || 'Active'
    });
    expect(revRes.status).toBe(200);
    expect(revRes.data.ok).toBe(true);
  });
});
