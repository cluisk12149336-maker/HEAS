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

jest.setTimeout(15000);

describe('Chat Students Feature - Role Restrictions and Real-Time Messaging', () => {
  let sampleIncidentId = null;
  let sampleDisplayId = null;

  beforeAll(async () => {
    const res = await request('GET', '/api/incidents');
    if (res.data && Array.isArray(res.data.incidents) && res.data.incidents.length > 0) {
      sampleIncidentId = res.data.incidents[0].id;
      sampleDisplayId = res.data.incidents[0].display_id;
    }
  });

  test('dashboard.html replaces the alert-details Chat Students action with Done Rescue', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="responderFinishTaskBtn"');
    expect(html).toContain('Done Rescue');
    expect(html).not.toContain('id="openAlertChat"');
    expect(html).toContain('id="alertChatOverlay"');
  });

  test('dashboard.html contains alert-chat dialog with message log and text composer', () => {
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="alertChatOverlay"');
    expect(html).toContain('class="alert-chat-dialog"');
    expect(html).toContain('id="alertChatTitle"');
    expect(html).toContain('id="alertChatReference"');
    expect(html).toContain('id="alertChatMessages"');
    expect(html).toContain('id="alertChatForm"');
    expect(html).toContain('id="alertChatInput"');
    expect(html).toContain('id="alertChatSend"');
    expect(html).toContain('id="alertChatDeliveryNotice"');
  });

  test('dashboard.js shows a centered prompt when an emergency chat has no messages', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain("showChatState('Send a message to student to interact');");
  });

  test('dashboard.css defines styles for chat dialog, entries, bubbles, and button[hidden] rule', () => {
    const cssPath = path.join(__dirname, '..', 'public', 'dashboard.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.alert-chat-overlay');
    expect(css).toContain('.alert-chat-dialog');
    expect(css).toContain('.alert-chat-header');
    expect(css).toContain('.alert-chat-messages');
    expect(css).toContain('.alert-chat-bubble');
    expect(css).toContain('.alert-chat-composer');
    expect(css).toContain('.alert-details-footer button[hidden]');
    expect(css).toContain('display: none !important');
  });

  test('dashboard.js defines canUseAlertChat restricting access to HEAD and Responder roles', () => {
    const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('canUseAlertChat');
    expect(js).toContain("role === 'head' || role.includes('head') || role === 'responder' || role.includes('responder')");
    expect(js).toContain('window.updateAlertChatAccess = updateAlertChatAccess;');
    expect(js).toContain('window.canUseAlertChat = canUseAlertChat;');
  });

  test('GET /api/incidents/:id/messages rejects unauthenticated requests with 401', async () => {
    if (!sampleIncidentId) return;

    const res = await request('GET', `/api/incidents/${sampleIncidentId}/messages`);
    expect(res.status).toBe(401);
    expect(res.data.error).toMatch(/sign in/i);
  });

  test('GET /api/incidents/:id/messages rejects System Admin role with 403', async () => {
    if (!sampleIncidentId) return;

    const res = await request('GET', `/api/incidents/${sampleIncidentId}/messages`, null, {
      'x-employee-role': 'System Admin',
      'x-employee-name': 'Sys Admin User'
    });
    expect(res.status).toBe(403);
    expect(res.data.error).toBe('Only HEAD and Responder accounts can use incident chat.');
  });

  test('GET /api/incidents/:id/messages allows HEAD account with 200', async () => {
    if (!sampleIncidentId) return;

    const res = await request('GET', `/api/incidents/${sampleIncidentId}/messages`, null, {
      'x-employee-role': 'HEAD',
      'x-employee-name': 'Campus Safety Head'
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.messages)).toBe(true);
    expect(res.data.current_sender_name).toContain('HEAD');
  });

  test('POST /api/incidents/:id/messages accepts HEAD role variants before validating message content', async () => {
    if (!sampleIncidentId) return;

    const res = await request('POST', `/api/incidents/${sampleIncidentId}/messages`, {
      message: '   '
    }, {
      'x-employee-role': 'Head of Emergency Operations',
      'x-employee-name': 'Campus Safety Head'
    });

    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/enter a message/i);
  });

  test('GET /api/incidents/:id/messages allows Responder account with 200', async () => {
    if (!sampleIncidentId) return;

    const res = await request('GET', `/api/incidents/${sampleIncidentId}/messages`, null, {
      'x-employee-role': 'Responder',
      'x-employee-name': 'Patrol EMT'
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.messages)).toBe(true);
    expect(res.data.current_sender_name).toContain('Responder');
  });

  test('POST /api/incidents/:id/messages allows HEAD to send real-time text chat and delivers to incident', async () => {
    if (!sampleIncidentId) return;

    const uniqueText = `HEAD unit message at ${Date.now()}`;
    const res = await request('POST', `/api/incidents/${sampleIncidentId}/messages`, {
      message: uniqueText
    }, {
      'x-employee-role': 'HEAD',
      'x-employee-name': 'Chief Coordinator'
    });

    expect(res.status).toBe(201);
    expect(res.data.ok).toBe(true);
    expect(res.data.message).toBeDefined();
    expect(res.data.message.content).toBe(uniqueText);
    expect(res.data.message.sender_name).toContain('HEAD');

    // Retrieve via Responder account to verify real-time delivery to other users in incident
    const retrieveRes = await request('GET', `/api/incidents/${sampleIncidentId}/messages`, null, {
      'x-employee-role': 'Responder',
      'x-employee-name': 'Patrol Unit'
    });
    expect(retrieveRes.status).toBe(200);
    const delivered = retrieveRes.data.messages.find(m => m.content === uniqueText);
    expect(delivered).toBeDefined();
    expect(delivered.sender_name).toContain('HEAD');
  });

  test('POST /api/incidents/:id/messages allows Responder to send real-time text chat and delivers to incident', async () => {
    if (!sampleIncidentId) return;

    const uniqueText = `Responder patrol reply at ${Date.now()}`;
    const res = await request('POST', `/api/incidents/${sampleIncidentId}/messages`, {
      message: uniqueText
    }, {
      'x-employee-role': 'Responder',
      'x-employee-name': 'Rescue Team Delta'
    });

    expect(res.status).toBe(201);
    expect(res.data.ok).toBe(true);
    expect(res.data.message).toBeDefined();
    expect(res.data.message.content).toBe(uniqueText);
    expect(res.data.message.sender_name).toContain('Responder');

    // Retrieve via HEAD account to verify real-time delivery
    const retrieveRes = await request('GET', `/api/incidents/${sampleIncidentId}/messages`, null, {
      'x-employee-role': 'HEAD',
      'x-employee-name': 'Chief Coordinator'
    });
    expect(retrieveRes.status).toBe(200);
    const delivered = retrieveRes.data.messages.find(m => m.content === uniqueText);
    expect(delivered).toBeDefined();
    expect(delivered.sender_name).toContain('Responder');
  });

  test('GET /api/incidents/:displayId/messages resolves display ID (e.g. MED_0011) to incident messages', async () => {
    if (!sampleDisplayId) return;

    const res = await request('GET', `/api/incidents/${sampleDisplayId}/messages`, null, {
      'x-employee-role': 'HEAD'
    });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(Array.isArray(res.data.messages)).toBe(true);
  });
});
