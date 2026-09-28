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

describe('Assign Responder to Rescue Incident Feature', () => {
  let sampleIncidentId = null;

  beforeAll(async () => {
    const res = await request('GET', '/api/incidents');
    if (res.data && Array.isArray(res.data.incidents) && res.data.incidents.length > 0) {
      sampleIncidentId = res.data.incidents[0].id;
    }
  });

  test('dashboard.html contains Assign Responder button in alert details footer', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="openAssignResponderBtn"');
    expect(html).toContain('Assign Responder');
    expect(html).toContain('window.openAssignResponderModal(this.dataset.incidentId || undefined)');
  });

  test('dashboard.html contains assign responder modal with incident banner and rescue selectors', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(html).toContain('id="assignResponderModal"');
    expect(html).toContain('id="assignIncidentTypeBadge"');
    expect(html).toContain('id="assignRescueUnitSelect"');
    expect(html).toContain('id="assignResponderAccountSelect"');
    expect(html).not.toMatch(/<select id="assignResponderAccountSelect"[^>]*required/);
    expect(html).toContain('Assigned Registered Responder:');
    expect(html).not.toContain('Assign Registered Personnel (Optional)');
    expect(html).toContain('-- Select registered responder personnel --');
    expect(html).not.toContain('-- Select registered responder personnel from database --');
    expect(html).toContain('id="assignResponderNameInput"');
    expect(html).toContain('id="assignResponderPhoneInput"');
    expect(html).toContain('id="assignEtaSelect"');
    expect(html).toContain('id="assignStatusTransition"');
    expect(html).toContain('id="assignDispatchNotes"');
    expect(html).toContain('id="btnAssignResponderSubmit"');
    expect(html).toContain('id="assignSuccessModal"');
    expect(html).toContain('A responder has been successfully assigned to this incident.');
    expect(js).toContain('closeAssignResponderModal();\n\n    openAssignSuccessModal({');
    expect(js).not.toContain("if (typeof window.closeAlertDetails === 'function') window.closeAlertDetails();\n\n    openAssignSuccessModal({");
    expect(js).toContain('openAssignSuccessModal({');
    expect(js).toContain("details.isReassignment ? 'Responder Reassigned' : 'Responder Assigned'");
    expect(js).toContain('A new responder has been assigned to this emergency incident.');
    expect(js).toContain('if (!responderName) {');
  });

  test('dashboard.html contains alert-detail-assignee banner container', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="alertDetailAssignee"');
  });

  test('dashboard.js defines specialized rescue units for each incident type', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('RESCUE_UNITS_BY_INCIDENT_TYPE');
    expect(js).toContain('Medical:');
    expect(js).toContain('UMak Campus Clinic Emergency Unit');
    expect(js).toContain('Security:');
    expect(js).toContain('Campus Security Force Patrol Unit');
    expect(js).toContain("'Campus Vicinity':");
    expect(js).toContain('Campus Disaster Risk Reduction & Management');
    expect(js).toContain('Urgent:');
    expect(js).toContain('Emergency Quick Response Team');
  });

  test('dashboard.js exports assignment modal functions to window', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('window.openAssignResponderModal = openAssignResponderModal;');
    expect(js).toContain('window.closeAssignResponderModal = closeAssignResponderModal;');
    expect(js).toContain('window.openAssignSuccessModal = openAssignSuccessModal;');
    expect(js).toContain('window.closeAssignSuccessModal = closeAssignSuccessModal;');
    expect(js).toContain('window.handleRescueUnitSelectionChange = handleRescueUnitSelectionChange;');
    expect(js).toContain('window.handleResponderAccountChange = handleResponderAccountChange;');
    expect(js).toContain('window.handleAssignResponderSubmit = handleAssignResponderSubmit;');
    expect(js).toContain('window.updateAlertDetailAssigneeBanner = updateAlertDetailAssigneeBanner;');

    const openModalStart = js.indexOf('async function openAssignResponderModal(');
    const modalShown = js.indexOf('modal.hidden = false;', openModalStart);
    const respondersFetch = js.indexOf('await fetchResponderAccounts(true)', openModalStart);
    expect(modalShown).toBeGreaterThan(openModalStart);
    expect(modalShown).toBeLessThan(respondersFetch);
  });

  test('dashboard.css defines styles for assign button, dialog, banner, and assignee cards', () => {
    const cssPath = path.join(__dirname, '..', 'public', 'dashboard.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.alert-details-footer .assign-action');
    expect(css).toContain('.assign-responder-overlay');
    expect(css).toContain('.assign-responder-dialog');
    expect(css).toContain('.assign-incident-banner');
    expect(css).toContain('.assign-success-overlay');
    expect(css).toContain('.assign-success-dialog');
    expect(css).toContain('.alert-detail-assignee .assignee-card');
    expect(css).toContain('.alert-detail-assignee .assignee-card.assigned');
    expect(css).toContain('.alert-detail-assignee .assignee-card.unassigned');
  });

  test('PUT /api/incidents/:id/assign validates required responder name', async () => {
    const res = await request('PUT', '/api/incidents/MED_0001/assign', {
      responder_name: '   '
    }, { 'x-employee-role': 'HEAD' });

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/required/i);
  });

  test('HEAD role variants pass assignment authorization', async () => {
    const res = await request('PUT', '/api/incidents/MED_0001/assign', {
      responder_name: '   '
    }, { 'x-employee-role': 'Head of Emergency Operations' });

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/required/i);
  });

  test('Responder role variants pass assignment authorization', async () => {
    const res = await request('PUT', '/api/incidents/MED_0001/assign', {
      responder_name: '   '
    }, { 'x-employee-role': 'Campus Emergency Responder' });

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/required/i);
  });

  test('assignment request sends the active session and account role', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain("const sessionId = typeof getSessionId === 'function' ? getSessionId() : '';\n        if (sessionId) headers['x-session-id'] = sessionId;");
    expect(js).toContain("const role = getCurrentUserRole();\n        if (role) headers['x-employee-role'] = role;");
  });

  test('PUT /api/incidents/:id/assign successfully assigns a rescue responder', async () => {
    if (!sampleIncidentId) {
      console.warn('Skipping live assignment test: no sample incident ID found.');
      return;
    }

    const payload = {
      responder_name: 'UMak Campus Clinic Emergency Unit (EMT / Nurse)',
      responder_phone: '0917-888-MED1',
      estimated_arrival_minutes: 3,
      status: 'On Going',
      dispatch_notes: 'EMT Nurse deployed with emergency triage kit.'
    };

    const res = await request('PUT', `/api/incidents/${sampleIncidentId}/assign`, payload, { 'x-employee-role': 'HEAD' });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.incident).toBeDefined();
    expect(res.data.incident.responder_name).toBe('UMak Campus Clinic Emergency Unit (EMT / Nurse)');
    expect(res.data.incident.responder_phone).toBe('0917-888-MED1');
    expect(res.data.incident.estimated_arrival_minutes).toBe(3);
    expect(['Pending', 'On Going']).toContain(res.data.incident.status);
  });

  test('update incident status option has (Recommended) removed and contact placeholder shows phone format', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).not.toContain('On Going / En Route (Recommended)');
    expect(html).toContain('On Going / En Route');
    expect(html).not.toContain('(Recommended)');
    expect(html).toContain('placeholder="e.g. 0917-888-5053"');
  });

  test('GET /api/responders returns registered responders with database contact numbers', async () => {
    const res = await request('GET', '/api/responders');
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.responders)).toBe(true);
    expect(res.data.responders.length).toBeGreaterThan(0);

    const responder = res.data.responders[0];
    expect(responder.employee_role.toLowerCase()).toContain('responder');
    expect(responder.employee_phone || responder.phone).toMatch(/^09\d{2}[-\d]+$/);
  });

  test('GET /api/incidents returns Active for unassigned incidents and On Going for assigned incidents', async () => {
    const res = await request('GET', '/api/incidents');
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.incidents)).toBe(true);

    const unassignedNonClosed = res.data.incidents.filter(
      i => (!i.responder_name || !i.responder_name.trim()) &&
           i.status.toLowerCase() !== 'resolved' &&
           i.status.toLowerCase() !== 'cancelled' &&
           i.status.toLowerCase() !== 'canceled'
    );
    unassignedNonClosed.forEach(inc => {
      expect(inc.status).toBe('Active');
    });

    const assignedNonClosed = res.data.incidents.filter(
      i => (i.responder_name && i.responder_name.trim()) &&
           i.status.toLowerCase() !== 'resolved' &&
           i.status.toLowerCase() !== 'cancelled' &&
           i.status.toLowerCase() !== 'canceled'
    );
    assignedNonClosed.forEach(inc => {
      expect(inc.status).toBe('On Going');
    });
  });

  test('opening Assign uses the selected incident without rerendering the incident table', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const openStart = js.indexOf('async function openAssignResponderModal(');
    const openEnd = js.indexOf('\nfunction closeAssignResponderModal()', openStart);
    const openFunction = js.slice(openStart, openEnd);

    expect(openFunction).not.toContain("record.status = 'On Going'");
    expect(openFunction).not.toContain('renderFullIncidentsTable');
    expect(html).toContain('window.openAssignResponderModal(this.dataset.incidentId || undefined)');
    expect(js).toContain("const status = statusSelect ? statusSelect.value : 'On Going';");
  });

  test('HEAD role variants and System Admin can reassign an incident that already has a responder', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    expect(js).toContain('const canReassign = isHeadRole() || isSystemAdminRole()');
    expect(js).toContain('if (hasResponder && !isHeadRole() && !isSystemAdminRole())');
    expect(server).toContain("const isHeadAssignmentRole = assignmentRole === 'head' || assignmentRole.includes('head')");
    expect(server).toContain('String(existingIncident.responder_name || \'\').trim() && !isHeadAssignmentRole && !isSystemAdminAssignmentRole');
    expect(server).toContain('Only HEAD or System Admin accounts can reassign an incident that already has a responder.');
  });

  test('Done Rescue replaces alert chat with report submission and reason-required cancellation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const doneButtonIndex = html.indexOf('id="responderFinishTaskBtn"');

    expect(html).toContain('Done Rescue');
    expect(doneButtonIndex).toBeGreaterThan(-1);
    expect(html).not.toContain('id="openAlertChat"');
    expect(html).toContain('id="finishStudentName"');
    expect(html).not.toContain('Quick Action Summary (Click to apply)');
    expect(html).toContain('What is the reason for cancelling this rescue?');
    expect(html).toContain('openResponderCancelReasonModal()');
    expect(html).toContain('id="responderCancelReasonInput"');
    expect(html).toContain('id="responderReportSuccessModal"');
    expect(html).toContain('Incident rescued successfully');
    expect(html).toContain('has been removed from your active rescue assignments.');
    expect(html).toContain('the incident remains On Going until then.');
    expect(js).toContain('finishTaskBtn.hidden = !(isResponder && isOpenIncident && hasAssignedResponder && !hasCompletionReport)');
    expect(js).toContain("submitResponderFinishStatus('Cancelled', reason)");
    expect(js).toContain('/rescue-report');
    expect(js).toContain('!isHeadRole(currentRole)');
    expect(js).toContain('hasAssignedResponder && !isHeadRole(role)');
    expect(js).toContain('REPORT READY · REVIEW &amp; RESOLVE');
    expect(js).toContain('if (successIncidentId) successIncidentId.textContent = record.displayId || record.id || \'Incident\';');
    expect(js).toContain('closeAlertDetails();');
    expect(js).toContain('responderReportSuccessModal.hidden = false;');
    expect(js).toContain('window.closeResponderReportSuccessModal = closeResponderReportSuccessModal;');
    expect(server).toContain("normalizeEmployeeRole(session.employee_role) !== 'responder'");
    expect(server).toContain("userRole !== 'head' && !userRole.includes('head')");
    const submitStart = js.indexOf('const submitResponderFinishTask = async () => {');
    const submitEnd = js.indexOf('const submitResponderCancellation = () => {', submitStart);
    const submitHandler = js.slice(submitStart, submitEnd);
    expect(submitHandler.indexOf('responderReportSuccessModal.hidden = false')).toBeLessThan(
      submitHandler.indexOf('renderFullIncidentsTable(currentEmergencyIncidents)')
    );
    expect(submitHandler).toContain("responderReportSuccessModal.style.display = 'grid'");
    expect(server).toContain('The assigned responder must submit a completion report before this incident can be resolved.');
    expect(server).toContain('A reason is required to cancel the ongoing response.');
    expect(js).toContain('const payload = { status, responder_finish: true, cancellation_reason: details };');
    expect(server).toContain('updatePayload.cancellation_reason = cancellationReason');
    const migration = fs.readFileSync(path.join(__dirname, '..', 'database', '013_add_responder_completion_report.sql'), 'utf8');
    expect(migration).toContain('responder_completion_report');
    expect(server).toContain('responder_completion_report: report');
    expect(server).toContain(".select('id, responder_name, status, responder_completion_report')");
    expect(server).not.toContain('responder_completion_reported_at');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';");
  });

  test('responder finish API requires an active Responder session and a cancellation reason', async () => {
    const responderRes = await request('PUT', '/api/reports/incidents/MED_0001/status', {
      status: 'Cancelled',
      responder_finish: true
    }, { 'x-employee-role': 'Responder' });
    expect(responderRes.status).toBe(400);
    expect(responderRes.data.error).toMatch(/reason is required/i);

    const headRes = await request('PUT', '/api/reports/incidents/MED_0001/status', {
      status: 'Cancelled',
      responder_finish: true,
      cancellation_reason: 'Test reason'
    }, { 'x-employee-role': 'HEAD' });
    expect(headRes.status).toBe(403);
  });

  test('rescue report API rejects HEAD accounts and empty responder reports', async () => {
    const headRes = await request('POST', '/api/incidents/00000000-0000-0000-0000-000000000000/rescue-report', {
      report: 'Completed assistance.'
    }, { 'x-employee-role': 'HEAD' });
    expect(headRes.status).toBe(403);

    const emptyReportRes = await request('POST', '/api/incidents/00000000-0000-0000-0000-000000000000/rescue-report', {
      report: '   '
    }, { 'x-employee-role': 'Responder' });
    expect(emptyReportRes.status).toBe(400);
    expect(emptyReportRes.data.error).toMatch(/completion report/i);
  });
});

