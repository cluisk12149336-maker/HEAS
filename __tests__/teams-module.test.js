const navigation = require('../public/navigation');

describe('Teams module access', () => {
  test('places Audit Logs above Reports in the dashboard navigation', () => {
    const auditIndex = navigation.items.findIndex((item) => item.id === 'audit');
    const reportsIndex = navigation.items.findIndex((item) => item.id === 'reports');

    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(reportsIndex).toBeGreaterThanOrEqual(0);
    expect(auditIndex).toBeLessThan(reportsIndex);
  });

  test('allows HEAD and System Admin accounts only', () => {
    const teamsItem = navigation.items.find((item) => item.id === 'teams');

    expect(teamsItem.roles).toEqual(['System Admin', 'HEAD']);
    teamsItem.roles.forEach((role) => {
      expect(navigation._isRoleAllowed(teamsItem.roles, role)).toBe(true);
    });
    expect(navigation._isRoleAllowed(teamsItem.roles, 'Head of Emergency Operations')).toBe(true);
    expect(navigation._isRoleAllowed(teamsItem.roles, 'System Administrator')).toBe(true);
  });

  test('does not allow Responder or roles outside HEAD / System Admin', () => {
    const teamsItem = navigation.items.find((item) => item.id === 'teams');

    expect(navigation._isRoleAllowed(teamsItem.roles, 'Responder')).toBe(false);
    expect(navigation._isRoleAllowed(teamsItem.roles, 'Student')).toBe(false);
  });

  test('dashboard and server recognize title variants for responder controls', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboard = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    expect(dashboard).toContain('if (!isResponderRole())');
    expect(dashboard).toContain('const isResponder = isResponderRole();');
    expect(server).toContain('function normalizeEmployeeRole(role)');
    expect(server).toContain("normalizeEmployeeRole(userRole) !== 'responder'");
  });

  test('dashboard.html contains the administrator account table and role/status filters', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');

    expect(html).toContain('id="teamsAdminUsersTableBody"');
    expect(html).toContain('id="disapproveConfirmModal"');
    expect(html).toContain('Yes, disapprove it');
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('<th>ADMIN USER</th>');
    expect(html).toContain('<th>EMAIL ADDRESS</th>');
    expect(html).toContain('<th>ASSIGNED ROLE</th>');
    expect(html).toContain('<th>STATUS</th>');
    expect(html).not.toContain('<th>SUSPENSION</th>');
    expect(html).toContain('<th>JOINED</th>');
    expect(html).toContain('<th>ACTIONS</th>');

    expect(html).toContain('data-team-filter="HEAD"');
    expect(html).toContain('id="teamCountHead"');
    expect(html).toContain('data-team-filter="System Admin"');
    expect(html).toContain('id="teamCountAdmin"');
    expect(html).toContain('data-team-filter="Responder"');
    expect(html).toContain('id="teamCountResponder"');
    expect(html).not.toContain('data-team-filter="Pending"');
    expect(html).not.toContain('id="teamCountPending"');
    expect(html).toContain('data-team-filter="Disapproved"');
    expect(html).toContain('id="teamCountDisapproved"');
    expect(html).toContain('data-team-filter="Suspended"');
    expect(html).toContain('id="teamCountSuspended"');
    expect(html).not.toContain('id="teamEditorForm"');
  });

  test('dashboard.js filters Teams to administrator roles and reuses account rows', () => {
    const fs = require('fs');
    const path = require('path');
    const js = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    expect(js).toContain("const adminRoles = new Set(['HEAD', 'System Admin', 'Responder'])");
    expect(js).toContain('teamCountHead');
    expect(js).toContain('teamCountAdmin');
    expect(js).toContain('teamCountResponder');
    expect(js).not.toContain('teamCountPending');
    expect(js).toContain('teamCountDisapproved');
    expect(js).toContain('teamCountSuspended');
    expect(js).toContain("&& (user.employee_status || '').toLowerCase() !== 'pending'");
    expect(js).toContain("tableBodyId === 'teamsAdminUsersTableBody'");
    expect(js).toContain('canReactivateAccounts');
    expect(js).toContain('>Reactivate</button>');
    expect(js).not.toContain('suspensionCell');
    expect(js).toContain("disapproveAccount('${escapeHtml(u.employee_id)}'");
    expect(js).toContain('function confirmDisapproveAccount()');
    expect(js).toContain("renderFullUsersTable(filteredUsers, 'teamsAdminUsersTableBody', 'all')");
    expect(js).not.toContain('currentResponseTeams');
  });

  test('server suspends after three failed logins and restricts reactivation', () => {
    const fs = require('fs');
    const path = require('path');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    expect(server).toContain('const maxLoginAttempts = 3');
    expect(server).toContain(".update({ employee_status: 'Suspended' })");
    expect(server).toContain("['suspended', 'inactive', 'disapproved'].includes((account.employee_status || '').toLowerCase())");
    expect(server).toContain("!['HEAD', 'System Admin'].includes(session.employee_role)");
  });

  test('Teams alert chat shares emergency messages with authenticated alert owners', () => {
    const fs = require('fs');
    const path = require('path');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const chatMigration = fs.readFileSync(path.join(__dirname, '../database/012_create_emergency_alert_messages.sql'), 'utf8');
    const dashboard = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    expect(server).toContain(".from('emergency_alert_messages')");
    expect(server).toContain("new Set(['HEAD', 'Responder'])");
    expect(server).toContain('supabase.auth.getUser(bearerToken)');
    expect(server).toContain(".eq('student_auth_id', studentUser.id)");
    expect(server).toContain("sender_type: senderType");
    expect(server).not.toContain(".from('alert_chat_messages')");
    expect(chatMigration).toContain('CREATE TABLE IF NOT EXISTS public.emergency_alert_messages');
    expect(chatMigration).toContain("CHECK (sender_type IN ('student', 'responder', 'system'))");
    expect(dashboard).toContain("['head', 'responder'].includes(getCurrentUserRole().toLowerCase())");
    expect(dashboard).toContain('chatOpenButton.hidden = !canUseAlertChat()');
    expect(dashboard).toContain('message.content ||');
    expect(dashboard).toContain('setInterval(loadAlertChatMessages, 2000)');
  });

  test('dashboard.html has removed the 2 Teams export buttons from the view', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');

    expect(html).not.toContain('id="teamExportBtn"');
    expect(html).not.toContain('id="teamToolbarExportBtn"');
  });

  test('dashboard.js defines Teams export logic for both PDF and Excel formats', () => {
    const fs = require('fs');
    const path = require('path');
    const js = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');

    expect(js).toContain('openTeamsExportDrawer');
    expect(js).toContain('closeTeamsExportDrawer');
    expect(js).toContain('selectTeamsExportFormat');
    expect(js).toContain('handleTeamsDrawerExport');
    expect(js).toContain('currentTeamsExportFormat');
    expect(js).toContain('heas-teams-report.pdf');
    expect(js).toContain('heas-teams-report.csv');
    expect(js).toContain('/api/teams/export');
    expect(js).toContain('window.openTeamsExportDrawer = openTeamsExportDrawer');
    expect(js).toContain('window.selectTeamsExportFormat = selectTeamsExportFormat');
    expect(js).toContain('window.handleTeamsDrawerExport = handleTeamsDrawerExport');
  });

  test('GET /api/teams/export?format=excel returns Excel-compatible CSV file attachment', async () => {
    const http = require('http');
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/teams/export?format=excel', (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, data }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('heas-teams-report.csv');
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('Admin User');
    expect(res.data).toContain('Employee ID');
    expect(res.data).toContain('Email Address');
    expect(res.data).toContain('Assigned Role');
  });

  test('GET /api/teams/export?format=pdf returns downloadable PDF document', async () => {
    const http = require('http');
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/teams/export?format=pdf', (r) => {
        let chunks = [];
        r.on('data', chunk => chunks.push(chunk));
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, data: Buffer.concat(chunks) }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('heas-teams-report.pdf');
    expect(res.data.slice(0, 5).toString('utf8')).toBe('%PDF-');
  });

  test('GET /api/teams/export filters by role and status', async () => {
    const http = require('http');
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/teams/export?format=excel&role=HEAD', (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, data }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.data).toContain('HEAD');
    expect(res.data).not.toContain('"Responder"');
  });
});