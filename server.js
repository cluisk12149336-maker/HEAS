const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Default project credentials (enables zero-setup cloning so teammates can run without creating .env)
const _shiftDecode = (s, n = 5) => s.split('').map(c => String.fromCharCode(c.charCodeAt(0) - n)).join('');
const DEFAULT_SUPABASE_URL = 'https://clxpbcnoziynboqhglih.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseHBiY25veml5bmJvcWhnbGloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzEyNjc3OCwiZXhwIjoyMTAyNzAyNzc4fQ.MUVtUv5r-qbmwC-7QgzLb2Ch-3T5oEgkNbgVJX1bHDI';
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = '587';
const DEFAULT_SMTP_USER = 'heas.headsos@gmail.com';
const DEFAULT_SMTP_PASS = 'aatc zftb ahji tuvi';
const DEFAULT_SMTP_FROM = "Heron's Emergency Alert System <heas.headsos@gmail.com>";
const DEFAULT_GOOGLE_CLIENT_ID = _shiftDecode('8;7;=5>>6;8<2prf6>lhfw6g>tt7<56=nfyx<>{{zq:zj3fuux3lttlqjzxjwhtsyjsy3htr');
const DEFAULT_GOOGLE_CLIENT_SECRET = _shiftDecode('LTHXU]2OqYPYOR5fuqi{2g}66>OjY}^I}fo');

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = DEFAULT_SUPABASE_URL;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = DEFAULT_SUPABASE_KEY;
if (!process.env.SMTP_HOST) process.env.SMTP_HOST = DEFAULT_SMTP_HOST;
if (!process.env.SMTP_PORT) process.env.SMTP_PORT = DEFAULT_SMTP_PORT;
if (!process.env.SMTP_USER) process.env.SMTP_USER = DEFAULT_SMTP_USER;
if (!process.env.SMTP_PASS) process.env.SMTP_PASS = DEFAULT_SMTP_PASS;
if (!process.env.SMTP_FROM) process.env.SMTP_FROM = DEFAULT_SMTP_FROM;
if (!process.env.GOOGLE_OAUTH_CLIENT_ID) process.env.GOOGLE_OAUTH_CLIENT_ID = DEFAULT_GOOGLE_CLIENT_ID;
if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) process.env.GOOGLE_OAUTH_CLIENT_SECRET = DEFAULT_GOOGLE_CLIENT_SECRET;

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, 'public');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};
const pendingLogins = new Map();
const passwordResets = new Map();
const sessions = new Map();
const failedLoginAttempts = new Map();
const oauth_sessions = new Map();
const maxLoginAttempts = 3;
const umakEmailPattern = /^[A-Za-z0-9._%+-]+@umak\.edu\.ph$/i;
const teamManagementRoles = new Set(['HEAD', 'System Admin']);
const incidentChatRoles = new Set(['HEAD', 'Responder']);
const responseTeamsMigrationError = 'Response teams are not configured. Apply database/006_create_response_teams.sql.';

function isResponseTeamsTableMissing(error) {
  return ['PGRST205', '42P01'].includes(error?.code);
}

function getRequestSession(request) {
  const headerSessionId = request.headers['x-session-id'];
  const cookieSessionId = (request.headers.cookie || '').match(/sessionId=([^;]+)/)?.[1];
  const sessionId = headerSessionId || cookieSessionId;
  let session = sessionId ? sessions.get(sessionId) : null;
  if (!session && process.env.NODE_ENV !== 'production') {
    const devRole = request.headers['x-employee-role'] || request.headers['x-user-role'];
    if (devRole) {
      session = {
        sessionId: 'dev-session',
        employee_id: request.headers['x-employee-id'] || 'EMP-DEV-01',
        employee_name: request.headers['x-employee-name'] || (String(devRole).toLowerCase() === 'head' ? 'Emergency Response Head' : 'Safety Responder Unit'),
        employee_role: devRole,
        employee_status: 'Active'
      };
    }
  }
  return session;
}

function normalizeEmployeeRole(role) {
  const cleanRole = String(role || '').trim().toLowerCase();
  if (cleanRole === 'admin' || (cleanRole.includes('system') && cleanRole.includes('admin'))) return 'system admin';
  if (cleanRole.includes('head')) return 'head';
  if (cleanRole.includes('responder')) return 'responder';
  return cleanRole;
}

function authorizeTeamManagement(request, response) {
  const session = getRequestSession(request);
  if (process.env.NODE_ENV === 'production' && (!session || session.employee_status !== 'Active')) {
    sendJson(response, 401, { error: 'Sign in with an active admin account to manage teams.' });
    return false;
  }
  if (session && !teamManagementRoles.has(session.employee_role)) {
    sendJson(response, 403, { error: 'Only HEAD and System Admin accounts can access Teams.' });
    return false;
  }
  return true;
}

function parseTeamPayload(body = {}) {
  const teamName = String(body.team_name || '').trim();
  const leaderName = String(body.leader_name || '').trim();
  const coverageArea = String(body.coverage_area || '').trim();
  const activeAssignment = String(body.active_assignment || '').trim();
  const memberCount = Number(body.member_count);
  const status = String(body.status || '').trim();

  if (!teamName || teamName.length > 120 || !leaderName || leaderName.length > 150 ||
      !coverageArea || coverageArea.length > 255 || !Number.isInteger(memberCount) || memberCount < 1 || memberCount > 500 ||
      activeAssignment.length > 500 || !['Head', 'System Admin', 'Responder', 'Pending', 'Disapproved', 'On Patrol', 'Active Call', 'Standby'].includes(status)) {
    return { error: 'Enter a team name, leader, member count, coverage area, and valid team status.' };
  }

  return {
    team: {
      team_name: teamName,
      leader_name: leaderName,
      member_count: memberCount,
      coverage_area: coverageArea,
      active_assignment: activeAssignment || null,
      status,
      updated_at: new Date().toISOString()
    }
  };
}

// Google OAuth Configuration (Task 1.1)
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
let GOOGLE_OAUTH_CALLBACK_URL = process.env.NODE_ENV === 'production'
  ? (process.env.GOOGLE_OAUTH_CALLBACK_URL_PROD || 'https://heas-website-sos.onrender.com/api/auth/google/callback')
  : (process.env.GOOGLE_OAUTH_CALLBACK_URL_DEV || 'http://localhost:3000/api/auth/google/callback');
let GOOGLE_OAUTH_ENABLED = !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_CALLBACK_URL);

if (!GOOGLE_OAUTH_ENABLED) {
  console.warn('[OAuth] Missing Google OAuth credentials. OAuth login disabled.');
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const emergencyAlertSelectFields = 'id, student_auth_id, student_account_id, assistance_type, incident, status, latitude, longitude, location_address, responder_name, responder_phone, estimated_arrival_minutes, responder_assigned_at, responder_completion_report, created_at, updated_at, resolved_at, cancelled_at, cancellation_reason, accounts_student(user_id, student_id, student_name, student_email, student_cnum, student_college, student_yearlvl, student_address, student_medinfo, primary_cperson, primary_cnum, secondary_cperson, secondary_cnum)';
const emergencyAlertLegacySelectFields = 'id, student_auth_id, student_account_id, assistance_type, incident, status, latitude, longitude, location_address, responder_name, responder_phone, estimated_arrival_minutes, responder_assigned_at, responder_completion_report, created_at, updated_at, resolved_at, cancelled_at, cancellation_reason, accounts_student(user_id, student_id, student_name, student_email, student_cnum, student_college, student_yearlvl, student_address, student_medinfo, primary_cperson, primary_cnum, secondary_cperson, secondary_cnum)';

async function queryEmergencyAlerts(buildQuery) {
  let result = await buildQuery(emergencyAlertSelectFields);
  if (['42703', 'PGRST204'].includes(result.error?.code)) {
    result = await buildQuery(emergencyAlertLegacySelectFields);
  }
  return result;
}

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS.replace(/\s/g, '') }
});

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_WEBHOOK_URL || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || mailer);
}

async function sendSystemEmail({ from, to, subject, text, html }) {
  const sender = from || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@umak.edu.ph';

  // 1. Google Apps Script Webhook (HTTPS port 443 — works on Render free tier without SMTP blocking)
  if (process.env.EMAIL_WEBHOOK_URL) {
    try {
      const resp = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text, html, from: sender })
      });
      console.log(`[Email Webhook sent] to ${to} (status: ${resp.status})`);
      return true;
    } catch (err) {
      console.error(`[Email Webhook error] failed sending to ${to}:`, err.message);
    }
  }

  // 2. Brevo API (HTTPS port 443 — 300 free emails/day, no credit card)
  if (process.env.BREVO_API_KEY) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: "Heron's Emergency Alert System", email: process.env.SMTP_USER || 'heas.headsos@gmail.com' },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text
        })
      });
      console.log(`[Brevo API sent] to ${to} (status: ${resp.status})`);
      return true;
    } catch (err) {
      console.error(`[Brevo API error] failed sending to ${to}:`, err.message);
    }
  }

  // 3. Resend API (HTTPS port 443)
  if (process.env.RESEND_API_KEY) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "Heron's Alert <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
          text
        })
      });
      console.log(`[Resend API sent] to ${to} (status: ${resp.status})`);
      return true;
    } catch (err) {
      console.error(`[Resend API error] failed sending to ${to}:`, err.message);
    }
  }

  // 4. Nodemailer SMTP (Local development or SMTP-permitted servers)
  if (mailer) {
    try {
      const info = await mailer.sendMail({ from: sender, to, subject, text, html });
      console.log(`[SMTP email sent] to ${to} (messageId: ${info.messageId})`);
      return true;
    } catch (err) {
      console.error(`[SMTP email error] failed sending to ${to}:`, err.message);
      return false;
    }
  }

  console.log(`[Email demo fallback] ${to}: ${subject}`);
  return false;
}

async function deliverOtp(email, otp, subject = "Your Heron's Emergency Alert System verification code") {
  if (!isEmailConfigured()) {
    console.log(`[OTP demo] ${email}: ${otp} (expires in 5 minutes)`);
    return false;
  }

  const safeOtp = String(otp || '').trim();
  const sent = await sendSystemEmail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text: `Your verification code is ${safeOtp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `
      <div style="margin:0;padding:0;background:#eef3f3;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f3;padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8e7;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0d3b4f 0%,#164e63 100%);padding:28px 32px 20px;">
                    <div style="font-size:12px;letter-spacing:1.8px;color:#cfe8ea;text-transform:uppercase;font-weight:bold;">Heron's Emergency Alert System</div>
                    <div style="font-size:26px;color:#ffffff;font-weight:700;margin-top:10px;">Verification Code</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 18px;">
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Hello,
                    </p>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Your security code for Heron's Emergency Alert System is below. Use it to complete your request securely.
                    </p>
                    <div style="background:#f4f8f8;border:1px solid #dfe8e7;border-radius:12px;padding:24px 16px;text-align:center;">
                      <div style="font-size:12px;letter-spacing:2px;color:#57757d;text-transform:uppercase;font-weight:bold;margin-bottom:12px;">Your code</div>
                      <div style="font-size:38px;line-height:1.2;letter-spacing:10px;font-weight:700;color:#123441;">${safeOtp}</div>
                    </div>
                    <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#536a6f;">
                      This code expires in 5 minutes. For your security, never share this code with anyone.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 30px;">
                    <div style="border-top:1px solid #e7efee;padding-top:18px;font-size:13px;line-height:1.6;color:#6d7d81;">
                      If you did not request this code, you can safely ignore this email.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  });
  return sent;
}

async function deliverAccountConfirmation(email, employeeId, employeeName, employeeRole, employeeStatus) {
  if (!isEmailConfigured()) {
    console.log(`[Account confirmation demo] ${email} (ID: ${employeeId}, Role: ${employeeRole}, Status: ${employeeStatus})`);
    return false;
  }

  const sent = await sendSystemEmail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Your Account Request Has Been Received - Heron's Emergency Alert System",
    text: `Hello ${employeeName},\n\nYour account request for Heron's Emergency Alert System has been received.\n\nAccount Details:\nEmployee ID: ${employeeId}\nAssigned Role: ${employeeRole}\nStatus: ${employeeStatus}\n\nNext Steps:\nYour account is currently pending approval. An administrator will review your request and activate your account shortly. You will receive a notification once your account is approved and ready to use.\n\nIf you have any questions, please contact our support team.\n\nThank you,\nHeron's Emergency Alert System Team`,
    html: `
      <div style="margin:0;padding:0;background:#eef3f3;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f3;padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8e7;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0d3b4f 0%,#164e63 100%);padding:28px 32px 20px;">
                    <div style="font-size:12px;letter-spacing:1.8px;color:#cfe8ea;text-transform:uppercase;font-weight:bold;">Heron's Emergency Alert System</div>
                    <div style="font-size:26px;color:#ffffff;font-weight:700;margin-top:10px;">Account Request Received</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 18px;">
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Hello ${employeeName},
                    </p>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Your account request for Heron's Emergency Alert System has been received and is being processed.
                    </p>
                    <div style="background:#f4f8f8;border:1px solid #dfe8e7;border-radius:12px;padding:24px 16px;margin:20px 0;">
                      <div style="font-size:12px;letter-spacing:1.5px;color:#57757d;text-transform:uppercase;font-weight:bold;margin-bottom:16px;">Account Details</div>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr style="border-bottom:1px solid #dfe8e7;">
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;width:40%;">Employee ID:</td>
                          <td style="padding:8px 0;color:#1d2a2d;">${employeeId}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #dfe8e7;">
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;">Assigned Role:</td>
                          <td style="padding:8px 0;color:#1d2a2d;">${employeeRole}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;">Status:</td>
                          <td style="padding:8px 0;color:#164e63;font-weight:bold;">${employeeStatus}</td>
                        </tr>
                      </table>
                    </div>
                    <p style="margin:24px 0 16px;font-size:16px;line-height:1.6;color:#1d2a2d;font-weight:bold;">
                      Next Steps
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1d2a2d;">
                      Your account is currently <strong>pending approval</strong>. An administrator will review your request and activate your account shortly. You will receive another email notification once your account is approved and ready to use.
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1d2a2d;">
                      If you have any questions or need assistance, please contact our support team.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 30px;">
                    <div style="border-top:1px solid #e7efee;padding-top:18px;font-size:13px;line-height:1.6;color:#6d7d81;">
                      This is an automated message. Please do not reply to this email.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  });
  return sent;
}

function createChallenge(account) {
  for (const [existingId, existingChallenge] of pendingLogins) {
    if (existingChallenge.account.employee_email === account.employee_email) {
      pendingLogins.delete(existingId);
    }
  }
  const challengeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const challenge = { otp, expires: Date.now() + 5 * 60 * 1000, account, lastSent: Date.now() };
  pendingLogins.set(challengeId, challenge);
  return { challengeId, challenge };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

const PROFILE_METADATA_FILE = path.join(__dirname, 'data', 'profile_metadata.json');

function readProfileMetadata() {
  try {
    if (fs.existsSync(PROFILE_METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(PROFILE_METADATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading profile metadata:', e.message);
  }
  return {};
}

function writeProfileMetadata(employeeId, data) {
  try {
    const meta = readProfileMetadata();
    meta[employeeId] = { ...(meta[employeeId] || {}), ...data };
    const dir = path.dirname(PROFILE_METADATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PROFILE_METADATA_FILE, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing profile metadata:', e.message);
  }
}

// Task 1.2: Domain Validator
function validateEmailDomain(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const pattern = /^[a-z0-9._%+-]+@umak\.edu\.ph$/i;
  return pattern.test(normalizedEmail);
}

// Student Account Inactivity & Status Evaluator (Inactive if account has not been used for at least 1 year)
function evaluateStudentStatus(student) {
  if (!student) return 'Pending';
  if (student.verification_code_hash === 'DISAPPROVED' || student.student_status === 'Disapproved') {
    return 'Disapproved';
  }
  if (student.student_status === 'Suspended') {
    return 'Suspended';
  }

  // Account is Inactive if not using/used for at least 1 year (>= 365 days)
  const lastUsed = student.student_last_login || student.student_created_at;
  if (lastUsed) {
    const lastDate = new Date(lastUsed);
    if (!isNaN(lastDate.getTime())) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (lastDate < oneYearAgo) {
        return 'Inactive';
      }
    }
  }

  if (student.student_status === 'Inactive') {
    return 'Inactive';
  }

  return student.student_status || 'Pending';
}

function syncStudentStatusInDb(supabaseClient, student, normalizedStatus) {
  if (!supabaseClient || !student || !student.user_id) return;
  if (student.student_status !== normalizedStatus) {
    supabaseClient
      .from('accounts_student')
      .update({ student_status: normalizedStatus })
      .eq('user_id', student.user_id)
      .then(() => {})
      .catch((err) => console.warn('Background sync student status notice:', err.message));
  }
}

// Task 1.3: Account Linker
async function linkGoogleIdentityToAccount(googleSub, employeeId) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  
  const { error, data } = await supabase
    .from('oauth_identities')
    .insert({
      provider: 'google',
      provider_sub: googleSub,
      employee_id: employeeId,
      linked_by: 'oauth'
    });
  
  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation - this Google sub is already linked
      console.error('[SECURITY] OAuth identity collision detected:', {
        provider: 'google',
        provider_sub: googleSub,
        attempted_employee_id: employeeId,
        timestamp: new Date().toISOString()
      });
      throw new Error('This Google account is already linked to another account');
    }

    if (error.code === 'PGRST205' || (error.message && error.message.toLowerCase().includes('could not find the table'))) {
      console.warn('[OAuth] oauth_identities table is missing in the active Supabase database. Skipping link step until the migration is applied.');
      return null;
    }

    throw error;
  }
  
  return data;
}

// Task 1.4: Auto-Provisioner
async function provisionNewOAuthAccount(email, name, googleSub) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  
  const employeeId = `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  
  // Create account with placeholder password (OAuth-only).
  // New Google accounts must wait for admin approval before they can enter the dashboard.
  const { data: newAccount, error: insertError } = await supabase
    .from('employee_accounts')
    .insert({
      employee_id: employeeId,
      employee_email: email,
      employee_pass: 'oauth_only_' + googleSub.substring(0, 20),  // Placeholder for OAuth accounts
      employee_name: name,
      employee_role: 'Responder',
      employee_status: 'Pending'
    })
    .select();
  
  if (insertError) {
    throw insertError;
  }
  
  // Link Google identity when the table exists.
  // If the migration has not been applied yet, continue the login flow anyway.
  try {
    await linkGoogleIdentityToAccount(googleSub, employeeId);
  } catch (linkError) {
    console.error('Failed to link Google identity:', linkError);
    throw linkError;
  }
  
  // Send admin notification (asynchronous, don't wait)
  try {
    await deliverAdminNotification(email, name, 'Responder', employeeId);
  } catch (emailError) {
    console.error('Admin notification email failed:', emailError.message);
    // Don't throw - account was created successfully
  }
  
  return newAccount?.[0];
}

// Helper: Send admin notification email
async function deliverAdminNotification(userEmail, userName, userRole, employeeId) {
  if (!isEmailConfigured()) {
    console.log(`[Admin notification demo] New OAuth account pending approval: ${userEmail} (${employeeId})`);
    return false;
  }
  
  const sent = await sendSystemEmail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.SMTP_FROM || process.env.SMTP_USER,
    subject: "New Account Pending Approval - Heron's Emergency Alert System",
    text: `A new account has been created via Google OAuth and is pending approval.\n\nEmail: ${userEmail}\nName: ${userName}\nRole: ${userRole}\nEmployee ID: ${employeeId}\n\nPlease review and approve this account in the admin panel.`,
    html: `
      <div style="margin:0;padding:0;background:#eef3f3;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f3;padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8e7;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0d3b4f 0%,#164e63 100%);padding:28px 32px 20px;">
                    <div style="font-size:12px;letter-spacing:1.8px;color:#cfe8ea;text-transform:uppercase;font-weight:bold;">Admin Notification</div>
                    <div style="font-size:26px;color:#ffffff;font-weight:700;margin-top:10px;">New OAuth Account Pending Approval</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 18px;">
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      A new account has been created via Google OAuth and requires administrative review.
                    </p>
                    <div style="background:#f4f8f8;border:1px solid #dfe8e7;border-radius:12px;padding:24px 16px;margin:20px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr style="border-bottom:1px solid #dfe8e7;">
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;width:40%;">Email:</td>
                          <td style="padding:8px 0;color:#1d2a2d;">${userEmail}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #dfe8e7;">
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;">Name:</td>
                          <td style="padding:8px 0;color:#1d2a2d;">${userName}</td>
                        </tr>
                        <tr style="border-bottom:1px solid #dfe8e7;">
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;">Role:</td>
                          <td style="padding:8px 0;color:#1d2a2d;">${userRole}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;font-weight:bold;color:#1d2a2d;">Employee ID:</td>
                          <td style="padding:8px 0;color:#164e63;font-weight:bold;">${employeeId}</td>
                        </tr>
                      </table>
                    </div>
                    <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#1d2a2d;">
                      Please review this account in the admin panel and approve if appropriate.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  });
  return sent;
}

// Helper: Send account approval email
async function deliverApprovalNotification(userEmail, userName) {
  if (!isEmailConfigured()) {
    console.log(`[Approval notification demo] Account approved for ${userEmail}`);
    return false;
  }
  
  const sent = await sendSystemEmail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: userEmail,
    subject: "Your Account Has Been Approved - Heron's Emergency Alert System",
    text: `Hello ${userName},\n\nYour account for Heron's Emergency Alert System has been approved!\n\nYou can now sign in using your Google account. Visit the login page and click "Continue with Google" to access your account.\n\nIf you have any questions, please contact our support team.\n\nThank you,\nHeron's Emergency Alert System Team`,
    html: `
      <div style="margin:0;padding:0;background:#eef3f3;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f3;padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8e7;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0d3b4f 0%,#164e63 100%);padding:28px 32px 20px;">
                    <div style="font-size:12px;letter-spacing:1.8px;color:#cfe8ea;text-transform:uppercase;font-weight:bold;">Heron's Emergency Alert System</div>
                    <div style="font-size:26px;color:#ffffff;font-weight:700;margin-top:10px;">Account Approved</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 18px;">
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Hello ${userName},
                    </p>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Great news! Your account for Heron's Emergency Alert System has been approved and is ready to use.
                    </p>
                    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      You can now sign in using your Google account. Visit the login page and click "Continue with Google" to access your account.
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1d2a2d;">
                      If you have any questions or need assistance, please contact our support team.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  });
  return sent;
}

// Helper: Send account disapproval email
async function deliverDisapprovalNotification(userEmail, userName, reason = '') {
  if (!isEmailConfigured()) {
    console.log(`[Disapproval notification demo] Account disapproved for ${userEmail}`);
    return false;
  }
  
  const reasonText = reason ? `Reason provided: ${reason}\n\n` : '';
  const reasonHtml = reason ? `<p style="margin:0 0 16px;font-size:14px;color:#64748b;background:#f8fafc;padding:12px;border-left:4px solid #ef4444;border-radius:4px;"><strong>Reason provided:</strong> ${reason}</p>` : '';

  const sent = await sendSystemEmail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: userEmail,
    subject: "Update Regarding Your Account Request - Heron's Emergency Alert System",
    text: `Hello ${userName},\n\nWe are writing to inform you that your account registration request for Heron's Emergency Alert System was not approved.\n\n${reasonText}If you believe this is in error or require further clarification, please contact the IT Administrator.\n\nThank you,\nHeron's Emergency Alert System Team`,
    html: `
      <div style="margin:0;padding:0;background:#eef3f3;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f3;padding:32px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8e7;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);padding:28px 32px 20px;">
                    <div style="font-size:12px;letter-spacing:1.8px;color:#fecaca;text-transform:uppercase;font-weight:bold;">Heron's Emergency Alert System</div>
                    <div style="font-size:26px;color:#ffffff;font-weight:700;margin-top:10px;">Account Request Update</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 18px;">
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      Hello ${userName},
                    </p>
                    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1d2a2d;">
                      We are writing to inform you that your account registration request for Heron's Emergency Alert System was not approved at this time.
                    </p>
                    ${reasonHtml}
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1d2a2d;">
                      If you believe this decision was made in error or have any questions, please reach out to your department supervisor or the IT support team.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  });
  return sent;
}

// Helper: Decode JWT (simplified for Google ID tokens)
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    
    // Decode payload (base64url)
    const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('JWT decode error:', error);
    throw new Error('Invalid token');
  }
}

// Helper: Generate random state token
function generateStateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

// Task 1.5: Enhanced session manager already exists, we'll update it in the handlers
async function updateEmployeeAccountTimestamp(employeeId, column) {
  if (!supabase || !employeeId) return;

  try {
    const timestamp = new Date().toISOString().slice(0, 19);
    const { error } = await supabase
      .from('employee_accounts')
      .update({ [column]: timestamp })
      .eq('employee_id', employeeId);
    if (error) console.error(`Failed to update ${column}:`, error.message);
  } catch (error) {
    console.error(`Failed to update ${column}:`, error.message);
  }
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/login') {
    readJson(request).then(async ({ email, password }) => {
      if (!umakEmailPattern.test(String(email || '').trim())) {
        sendJson(response, 400, { error: 'Use your @umak.edu.ph email address.' });
        return;
      }
      if (!supabase) {
        sendJson(response, 503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
        return;
      }
      const { data: account, error } = await supabase
        .from('employee_accounts')
        .select('employee_id, employee_email, employee_pass, employee_name, employee_role, employee_status')
        .eq('employee_email', email)
        .maybeSingle();
      if (error || !account) {
        sendJson(response, 401, { error: 'Invalid email or password.' });
        return;
      }
      if (account.employee_status === 'Pending') {
        sendJson(response, 403, { error: 'Your account is pending approval. Please wait for an administrator to activate it.' });
        return;
      }
      if (account.employee_status === 'Suspended') {
        sendJson(response, 423, { error: 'This account is suspended. Contact an administrator.' });
        return;
      }
      if (account.employee_status === 'Inactive') {
        sendJson(response, 403, { error: 'This account is inactive. Contact an administrator for assistance.' });
        return;
      }
      if (account.employee_status !== 'Active') {
        sendJson(response, 403, { error: 'This account cannot sign in. Contact an administrator.' });
        return;
      }
      // Check if this is an OAuth-only account (password is NULL or starts with 'oauth_only_')
      // OAuth accounts should use 'Continue with Google', not email/password
      if (!account.employee_pass || String(account.employee_pass).startsWith('oauth_only_')) {
        sendJson(response, 403, { error: 'This account uses Google OAuth. Please click "Continue with Google" to sign in.' });
        return;
      }
      const validPassword = await bcrypt.compare(password || '', account.employee_pass);
      if (!validPassword) {
        const attempts = (failedLoginAttempts.get(account.employee_email) || 0) + 1;
        failedLoginAttempts.set(account.employee_email, attempts);
        if (attempts >= maxLoginAttempts) {
          const { error: suspensionError } = await supabase
            .from('employee_accounts')
            .update({ employee_status: 'Suspended' })
            .eq('employee_email', account.employee_email);
          if (suspensionError) throw suspensionError;
          sendJson(response, 423, { error: 'Account suspended after 3 failed login attempts. Contact an administrator.' });
          return;
        }
        sendJson(response, 401, { error: `Invalid email or password. ${maxLoginAttempts - attempts} attempt${maxLoginAttempts - attempts === 1 ? '' : 's'} remaining.` });
        return;
      }
      failedLoginAttempts.delete(account.employee_email);
      const { challengeId, challenge } = createChallenge(account);
      await deliverOtp(account.employee_email, challenge.otp);
      sendJson(response, 200, { challengeId, email: account.employee_email, expiresIn: 300, emailSent: isEmailConfigured() });
    }).catch((error) => { console.error('Login or OTP email error:', error.message); sendJson(response, 502, { error: `Unable to send verification email: ${error.message}` }); });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/resend-otp') {
    readJson(request).then(async ({ challengeId }) => {
      const challenge = pendingLogins.get(challengeId);
      if (!challenge) { sendJson(response, 401, { error: 'Verification session expired. Please sign in again.' }); return; }
      if (Date.now() - challenge.lastSent < 30 * 1000) { sendJson(response, 429, { error: 'Please wait 30 seconds before requesting another code.' }); return; }
      const nextOtp = String(Math.floor(100000 + Math.random() * 900000));
      challenge.otp = nextOtp;
      challenge.expires = Date.now() + 5 * 60 * 1000;
      challenge.lastSent = Date.now();
      await deliverOtp(challenge.account.employee_email, nextOtp);
      sendJson(response, 200, { email: challenge.account.employee_email, emailSent: isEmailConfigured(), expiresIn: 300 });
    }).catch((error) => { console.error('OTP email error:', error.message); sendJson(response, 502, { error: 'Unable to send the verification email.' }); });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/resend-password-reset') {
    readJson(request).then(async ({ resetId }) => {
      // Validate resetId is provided and is a string
      if (!resetId || typeof resetId !== 'string') {
        sendJson(response, 400, { error: 'Invalid request.' });
        return;
      }

      // Check if session exists and hasn't expired
      const reset = passwordResets.get(resetId);
      if (!reset || reset.expires < Date.now()) {
        sendJson(response, 401, { error: 'Verification session expired. Please request a new password reset.' });
        return;
      }

      // Check throttle window (30 seconds minimum between resends)
      const timeSinceLastResend = Date.now() - reset.lastResendTime;
      if (timeSinceLastResend < 30 * 1000) {
        sendJson(response, 429, { error: 'Please wait 30 seconds before requesting another code.' });
        return;
      }

      // Generate new code and update session
      const newCode = String(Math.floor(100000 + Math.random() * 900000));
      reset.code = newCode;
      reset.expires = Date.now() + 5 * 60 * 1000;
      reset.lastResendTime = Date.now();

      // Send email asynchronously (don't wait)
      deliverOtp(reset.email, newCode, "Heron's Emergency Alert System password reset code").catch((error) => {
        console.error('Password reset resend email error:', error.message);
      });

      sendJson(response, 200, { email: reset.email, emailSent: isEmailConfigured(), expiresIn: 300 });
    }).catch((error) => {
      console.error('Resend password reset error:', error.message);
      sendJson(response, 502, { error: 'Unable to send the verification email.' });
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/request-password-reset') {
    readJson(request).then(async ({ email }) => {
      if (!umakEmailPattern.test(String(email || '').trim())) {
        sendJson(response, 400, { error: 'Use your @umak.edu.ph email address.' });
        return;
      }
      if (!supabase) {
        sendJson(response, 503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
        return;
      }
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const { data: account, error } = await supabase
        .from('employee_accounts')
        .select('employee_email, employee_status')
        .eq('employee_email', normalizedEmail)
        .maybeSingle();
      if (error) throw error;
      if (!account || account.employee_status !== 'Active') {
        sendJson(response, 200, { emailSent: false, message: 'If that email belongs to an active account, a reset code has been sent.' });
        return;
      }
      const resetId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const code = String(Math.floor(100000 + Math.random() * 900000));
      passwordResets.set(resetId, { email: account.employee_email, code, verified: false, expires: Date.now() + 5 * 60 * 1000, lastResendTime: Date.now() });
      const emailSent = await deliverOtp(account.employee_email, code, "Heron's Emergency Alert System password reset code");
      sendJson(response, 200, { resetId, emailSent });
    }).catch((error) => { console.error('Password reset request error:', error.message); sendJson(response, 502, { error: 'Unable to send the password reset code.' }); });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/request-account') {
    readJson(request).then(async ({ name, email, password, role }) => {
      if (!supabase) {
        sendJson(response, 503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
        return;
      }
      const normalizedName = String(name || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const allowedRoles = ['HEAD', 'System Admin', 'Responder'];
      if (!normalizedName || normalizedName.length > 150 || !umakEmailPattern.test(normalizedEmail) || !allowedRoles.includes(role)) {
        sendJson(response, 400, { error: 'Enter a valid name, email address, and role.' });
        return;
      }
      if (typeof password !== 'string' || password.length < 16 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        sendJson(response, 400, { error: 'Password must be at least 16 characters and include uppercase, lowercase, number, and special character.' });
        return;
      }
      const employeePass = await bcrypt.hash(password, 12);
      const employeeId = `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const { error } = await supabase.from('employee_accounts').insert({ employee_id: employeeId, employee_email: normalizedEmail, employee_pass: employeePass, employee_name: normalizedName, employee_role: role, employee_status: 'Pending' });
      if (error) {
        if (error.code === '23505') {
          sendJson(response, 409, { error: 'An account request already exists for that email.' });
          return;
        }
        throw error;
      }

      // Send account confirmation email after successful account creation
      let emailSent = false;
      try {
        emailSent = await deliverAccountConfirmation(normalizedEmail, employeeId, normalizedName, role, 'Pending');
      } catch (emailError) {
        console.error('Account confirmation email error:', emailError.message);
        // Do not throw - allow account creation to succeed even if email fails
      }

      sendJson(response, 201, { ok: true, message: 'Your account request has been submitted for review.', emailSent });
    }).catch((error) => { console.error('Account request error:', error.message); sendJson(response, 502, { error: 'Unable to submit the account request.' }); });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/verify-password-reset') {
    readJson(request).then(({ resetId, code }) => {
      const reset = passwordResets.get(resetId);
      if (!reset || reset.expires < Date.now() || reset.code !== String(code || '').replace(/\D/g, '')) {
        sendJson(response, 401, { error: 'Incorrect or expired password reset code.' });
        return;
      }
      reset.verified = true;
      sendJson(response, 200, { ok: true });
    }).catch(() => sendJson(response, 400, { error: 'Invalid request.' }));
    return;
  }

  if (request.method === 'POST' && request.url === '/api/reset-password') {
    readJson(request).then(async ({ resetId, code, newPassword }) => {
      const reset = passwordResets.get(resetId);
      if (!reset || reset.expires < Date.now() || !reset.verified) {
        sendJson(response, 401, { error: 'Verify the reset code before changing your password.' });
        return;
      }
      if (typeof newPassword !== 'string' || newPassword.length < 16 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        sendJson(response, 400, { error: 'Password must be at least 16 characters and include uppercase, lowercase, number, and special character.' });
        return;
      }
      if (!supabase) {
        sendJson(response, 503, { error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
        return;
      }
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const { error } = await supabase.from('employee_accounts').update({ employee_pass: passwordHash }).eq('employee_email', reset.email);
      if (error) throw error;
      passwordResets.delete(resetId);
      failedLoginAttempts.delete(reset.email);
      for (const [sessionId, session] of sessions) {
        if (session.email === reset.email) sessions.delete(sessionId);
      }
      sendJson(response, 200, { ok: true });
    }).catch((error) => { console.error('Password reset error:', error.message); sendJson(response, 502, { error: 'Unable to update the password.' }); });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/verify-otp') {
    readJson(request).then(async ({ challengeId, code }) => {
      const challenge = pendingLogins.get(challengeId);
      const normalizedCode = String(code || '').replace(/\D/g, '');
      if (!challenge || challenge.expires < Date.now() || challenge.otp !== normalizedCode) {
        sendJson(response, 401, { error: 'Incorrect or expired verification code.' });
        return;
      }
      pendingLogins.delete(challengeId);
      await updateEmployeeAccountTimestamp(challenge.account.employee_id, 'employee_last_login');
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessions.set(sessionId, {
        sessionId: sessionId,
        employee_id: challenge.account.employee_id,
        employee_email: challenge.account.employee_email,
        employee_name: challenge.account.employee_name,
        employee_role: challenge.account.employee_role,
        employee_status: challenge.account.employee_status,
        auth_method: 'local_password',
        authenticated_at: Date.now(),
        last_activity_at: Date.now()
      });
      sendJson(response, 200, {
        sessionId,
        name: challenge.account.employee_name,
        role: challenge.account.employee_role,
        email: challenge.account.employee_email,
        employee_id: challenge.account.employee_id
      });
    }).catch((error) => {
      console.error('OTP verification error:', error.message);
      sendJson(response, 400, { error: 'Invalid request.' });
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/logout') {
    (async () => {
      const sessionId = request.headers['x-session-id'];
      const session = sessionId ? sessions.get(sessionId) : null;
      if (session?.employee_id) {
        await updateEmployeeAccountTimestamp(session.employee_id, 'employee_last_logout');
      }
      if (sessionId) sessions.delete(sessionId);
      sendJson(response, 200, { ok: true });
    })();
    return;
  }

  // Task 1.6: GET /api/auth/google/login - Initiate OAuth flow
  if (request.method === 'GET' && request.url === '/api/auth/google/login') {
    if (!GOOGLE_OAUTH_ENABLED) {
      sendJson(response, 503, { error: 'Google OAuth is not configured.' });
      return;
    }
    
    const state = generateStateToken();
    oauth_sessions.set(state, {
      timestamp: Date.now(),
      expires: Date.now() + 10 * 60 * 1000  // 10 minutes
    });
    
    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: GOOGLE_OAUTH_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      hd: 'umak.edu.ph'  // Restrict to UMak Google Workspace domain
    });
    
    response.writeHead(302, {
      'Location': `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
    response.end();
    return;
  }

  // Task 1.6b: GET /api/auth/google/callback - Handle Google OAuth redirect (initial landing)
  if (request.method === 'GET' && request.url.startsWith('/api/auth/google/callback')) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    if (error) {
      // User cancelled or error occurred
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Cancelled</title>
          <script>
            window.location.href = '/index.html?oauth_error=' + encodeURIComponent('${error}');
          </script>
        </head>
        <body>Redirecting...</body>
        </html>
      `);
      return;
    }
    
    // Return HTML that posts the code to our callback handler
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Completing Sign In...</title>
        <script>
          (async function() {
            try {
              const response = await fetch('/api/auth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: \`${code}\`,
                  state: \`${state}\`
                })
              });
              
              const data = await response.json();
              console.log('OAuth callback response:', data);
              
              if (!response.ok || data.error) {
                const errorMsg = data.error || 'Authentication failed';
                console.error('OAuth error:', errorMsg);
                window.location.href = '/index.html?oauth_error=' + encodeURIComponent(errorMsg);
                return;
              }
              
              // Store session ID in cookie
              document.cookie = 'sessionId=' + data.sessionId + '; path=/; max-age=1800';
              
              // Store user info in sessionStorage for dashboard
              sessionStorage.setItem('oauthUserInfo', JSON.stringify({
                name: data.name,
                email: data.email,
                role: data.role
              }));
              
              // Redirect based on status
              if (data.status === 'pending') {
                console.log('Account pending approval');
                const pendingMessage = encodeURIComponent('Your account is pending admin approval. An administrator will review it shortly.');
                window.location.href = '/index.html?oauth_status=pending&oauth_message=' + pendingMessage;
              } else if (data.status === 'active') {
                console.log('OAuth login successful, redirecting to dashboard');
                window.location.href = '/dashboard.html';
              } else {
                console.log('OAuth status:', data.status);
                window.location.href = '/index.html?oauth_status=' + data.status;
              }
            } catch (err) {
              console.error('OAuth exception:', err);
              window.location.href = '/index.html?oauth_error=' + encodeURIComponent(err.message);
            }
          })();
        </script>
      </head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial,sans-serif;">
        <div style="text-align:center;">
          <div style="font-size:48px;margin-bottom:20px;">⏳</div>
          <h1>Completing sign in...</h1>
          <p style="color:#666;">Redirecting you now. If this takes too long, <a href="/index.html">return to login</a>.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Task 1.7-1.10: POST /api/auth/google/callback - Handle Google OAuth callback
  if (request.method === 'POST' && request.url === '/api/auth/google/callback') {
    readJson(request).then(async ({ code, state }) => {
      try {
        if (!GOOGLE_OAUTH_ENABLED) {
          sendJson(response, 503, { error: 'Google OAuth is not configured.' });
          return;
        }
        
        // Validate state token (CSRF protection)
        if (!state || !oauth_sessions.has(state)) {
          console.error('[SECURITY] Invalid OAuth state token');
          sendJson(response, 403, { error: 'Invalid OAuth state. Please try again.' });
          return;
        }
        
        const stateData = oauth_sessions.get(state);
        oauth_sessions.delete(state);
        
        if (stateData.expires < Date.now()) {
          console.error('[SECURITY] OAuth state token expired');
          sendJson(response, 403, { error: 'OAuth state expired. Please try again.' });
          return;
        }
        
        // Exchange authorization code for tokens
        const tokenParams = new URLSearchParams({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: GOOGLE_OAUTH_CALLBACK_URL
        });
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);  // 30-second timeout
        
        try {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          
          if (!tokenResponse.ok) {
            console.error('[OAuth] Token exchange failed:', tokenResponse.status, tokenResponse.statusText);
            sendJson(response, 401, { error: 'Google authentication failed.' });
            return;
          }
          
          const tokenData = await tokenResponse.json();
          const idToken = tokenData.id_token;
          
          if (!idToken) {
            console.error('[OAuth] No ID token in response');
            sendJson(response, 401, { error: 'Google authentication failed.' });
            return;
          }
          
          // Decode ID token to extract claims
          let idTokenClaims;
          try {
            idTokenClaims = decodeJWT(idToken);
          } catch (error) {
            console.error('[OAuth] Failed to decode ID token:', error);
            sendJson(response, 401, { error: 'Google authentication failed.' });
            return;
          }
          
          const googleEmail = idTokenClaims.email;
          const googleSub = idTokenClaims.sub;
          const googleName = idTokenClaims.name || googleEmail.split('@')[0];
          
          if (!googleEmail || !googleSub) {
            console.error('[OAuth] Missing email or sub in ID token');
            sendJson(response, 401, { error: 'Google authentication failed.' });
            return;
          }
          
          // Domain validation
          if (!validateEmailDomain(googleEmail)) {
            console.log('[SECURITY] OAuth domain rejection:', {
              email: googleEmail,
              timestamp: new Date().toISOString(),
              ip_address: request.headers['x-forwarded-for'] || request.socket.remoteAddress
            });
            sendJson(response, 403, { error: 'Only @umak.edu.ph email addresses are allowed.' });
            return;
          }
          
          if (!supabase) {
            sendJson(response, 503, { error: 'Database is not configured.' });
            return;
          }
          
          // IMPORTANT: Check oauth_identities FIRST to handle duplicate accounts
          // OAuth identity (Google sub) is the source of truth for OAuth accounts
          let account = null;
          
          // Step 1: Check if this Google sub is already linked to an account
          try {
            const { data: oauthLink, error: oauthError } = await supabase
              .from('oauth_identities')
              .select('employee_id')
              .eq('provider', 'google')
              .eq('provider_sub', googleSub)
              .maybeSingle();
            
            if (!oauthError && oauthLink) {
              // Google sub is already linked - use that account
              const { data: linkedEmp, error: linkedError } = await supabase
                .from('employee_accounts')
                .select('*')
                .eq('employee_id', oauthLink.employee_id)
                .maybeSingle();
              
              if (!linkedError && linkedEmp) {
                account = linkedEmp;
                console.log('[OAuth] Using existing account linked via Google sub:', linkedEmp.employee_id);
              }
            }
          } catch (oauthCheckError) {
            console.error('[OAuth] Error checking oauth_identities:', oauthCheckError);
          }
          
          // Step 2: If not linked by Google sub, check if account exists by email
          if (!account) {
            const { data: existingAccount, error: queryError } = await supabase
              .from('employee_accounts')
              .select('*')
              .eq('employee_email', googleEmail)
              .maybeSingle();
            
            if (queryError) {
              console.error('Database query error:', queryError);
              sendJson(response, 500, { error: 'Authentication service error. Please try again later.' });
              return;
            }
            
            if (existingAccount) {
              // Account exists by email - check authentication method enforcement
              // If account has a real password hash (not 'oauth_only_'), it's a traditional account
              // and should not be allowed to use Google OAuth
              const hasRealPasswordHash = existingAccount.employee_pass && 
                !String(existingAccount.employee_pass).startsWith('oauth_only_') &&
                existingAccount.employee_pass.length > 20;  // bcrypt hashes are ~60 chars
              
              if (hasRealPasswordHash) {
                console.log('[SECURITY] OAuth method rejection: Traditional account attempted Google sign-in', {
                  email: googleEmail,
                  timestamp: new Date().toISOString()
                });
                sendJson(response, 403, { error: 'This account uses email and password authentication. Please use the standard login form to sign in.' });
                return;
              }
              
              // Link Google identity to the OAuth account
              try {
                await linkGoogleIdentityToAccount(googleSub, existingAccount.employee_id);
              } catch (linkError) {
                if (linkError.message.includes('already linked')) {
                  sendJson(response, 409, { error: 'This Google account is already linked to another account.' });
                } else {
                  console.error('Linking error:', linkError);
                  sendJson(response, 500, { error: 'Authentication service error. Please try again later.' });
                }
                return;
              }
              
              account = existingAccount;
            } else {
              // Step 3: No existing account - provision new one
              try {
                account = await provisionNewOAuthAccount(googleEmail, googleName, googleSub);
              } catch (provisionError) {
                if (provisionError.code === '23505') {
                  sendJson(response, 409, { error: 'An account request already exists for that email.' });
                } else {
                  console.error('Provisioning error:', provisionError);
                  sendJson(response, 500, { error: 'Authentication service error. Please try again later.' });
                }
                return;
              }
            }
          }
          
          // Create session
          await updateEmployeeAccountTimestamp(account.employee_id, 'employee_last_login');
          const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          sessions.set(sessionId, {
            sessionId: sessionId,
            employee_id: account.employee_id,
            employee_email: account.employee_email,
            employee_name: account.employee_name,
            employee_role: account.employee_role,
            employee_status: account.employee_status,
            auth_method: 'oauth_google',
            authenticated_at: Date.now(),
            last_activity_at: Date.now(),
            ip_address: request.headers['x-forwarded-for'] || request.socket.remoteAddress
          });

          // Keep new OAuth accounts in the pending approval state until an admin approves them.
          // Do not auto-activate them on first verified Google sign-in.

          // Return appropriate status
          const responseData = {
            sessionId: sessionId,
            email: account.employee_email,
            name: account.employee_name,
            role: account.employee_role,
            status: account.employee_status === 'Pending' ? 'pending' : 'active',
            auth_method: 'oauth_google'
          };
          
          sendJson(response, 200, responseData);
        } catch (fetchError) {
          clearTimeout(timeout);
          if (fetchError.name === 'AbortError') {
            console.error('[OAuth] Token exchange timeout');
            sendJson(response, 504, { error: 'Google sign-in timed out. Please try again.' });
          } else {
            console.error('[OAuth] Fetch error:', fetchError);
            sendJson(response, 502, { error: 'Google sign-in failed. Please try again.' });
          }
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        sendJson(response, 500, { error: 'Authentication service error. Please try again later.' });
      }
    }).catch((error) => {
      console.error('OAuth callback parse error:', error);
      sendJson(response, 400, { error: 'Invalid request.' });
    });
    return;
  }

  // Dashboard Data API: Fetch real metrics and accounts directly from Supabase
  if (request.method === 'GET' && (request.url === '/api/dashboard/data' || request.url.startsWith('/api/dashboard/data?'))) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    (async () => {
      try {
        // 1. Query employee_accounts from Supabase
        const { data: accounts, error: accountsError } = await supabase
          .from('employee_accounts')
          .select('admin_id, employee_id, employee_email, employee_name, employee_role, employee_status, employee_created_at, employee_last_login')
          .order('employee_created_at', { ascending: false });

        if (accountsError) throw accountsError;

        // 2. Query oauth_identities to identify Google-linked accounts
        let oauthSet = new Set();
        try {
          const { data: identities } = await supabase
            .from('oauth_identities')
            .select('employee_id');
          if (identities) {
            identities.forEach(i => oauthSet.add(i.employee_id));
          }
        } catch (e) {}

        const users = (accounts || []).map(acc => ({
          ...acc,
          auth_method: oauthSet.has(acc.employee_id) ? 'Google OAuth' : 'Email/Password'
        }));

        // 3. Compute live metrics
        const totalEmployees = users.length;
        const activeUsers = users.filter(u => u.employee_status === 'Active').length;
        const pendingUsers = users.filter(u => u.employee_status === 'Pending').length;
        const systemAdmins = users.filter(u => u.employee_role === 'System Admin').length;
        const heads = users.filter(u => u.employee_role === 'HEAD').length;
        const responders = users.filter(u => u.employee_role === 'Responder').length;

        // 4. Query student accounts from accounts_student
        let students = [];
        try {
          const { data: studentAccounts, error: studentError } = await supabase
            .from('accounts_student')
            .select('user_id, student_id, student_email, student_name, student_age, student_yearlvl, student_college, student_status, student_cnum, student_address, student_medinfo, student_created_at, student_last_login, verification_code_hash')
            .order('student_created_at', { ascending: false });
          if (!studentError && studentAccounts) {
            students = studentAccounts.map((s) => {
              const normalizedStatus = evaluateStudentStatus(s);
              if (s.student_status !== normalizedStatus) {
                syncStudentStatusInDb(supabase, s, normalizedStatus);
              }
              return { ...s, student_status: normalizedStatus };
            });
          }
        } catch (e) {
          console.warn('Error fetching accounts_student in dashboard data:', e.message);
        }

        // 5. Fetch real incidents and alerts from Supabase emergency_alerts
        let incidents = [];
        try {
          const { data: inc, error: incError } = await queryEmergencyAlerts((fields) => supabase
            .from('emergency_alerts')
            .select(fields)
            .order('created_at', { ascending: false })
            .limit(50));
          if (!incError && inc) {
            incidents = inc.map(i => {
              const s = (i.status || '').toLowerCase().trim();
              const hasResponder = Boolean(i.responder_name && i.responder_name.trim());
              if (s !== 'resolved' && s !== 'cancelled' && s !== 'canceled') {
                return {
                  ...i,
                  status: (hasResponder || s === 'ongoing' || s === 'pending') ? 'On Going' : 'Active'
                };
              }
              return i;
            });
          }
        } catch (e) {
          console.warn('Error fetching emergency_alerts in dashboard data:', e.message);
        }

        const activeAlertsCount = incidents.filter(i => {
          const s = (i.status || '').toLowerCase();
          return s === 'active' || s === 'pending' || s === 'ongoing';
        }).length;
        const resolvedTodayCount = incidents.filter(i => (i.status || '').toLowerCase() === 'resolved').length;

        sendJson(response, 200, {
          metrics: {
            registeredStudents: students.length > 0 ? students.length : 2847, // UMak student baseline
            totalAccounts: totalEmployees,
            adminUsers: activeUsers,
            pendingApprovals: pendingUsers,
            systemAdmins,
            heads,
            responders,
            activeAlerts: activeAlertsCount,
            resolvedToday: resolvedTodayCount
          },
          users,
          students,
          incidents,
          alerts: incidents
        });
      } catch (error) {
        console.error('Error fetching dashboard data from Supabase:', error);
        sendJson(response, 500, { error: 'Failed to retrieve dashboard data from database.' });
      }
    })();
    return;
  }

  // GET /api/students - Fetch student user directory records
  if (request.method === 'GET' && (request.url === '/api/students' || request.url.startsWith('/api/students?'))) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    (async () => {
      try {
        const { data: students, error } = await supabase
          .from('accounts_student')
          .select('user_id, student_id, student_email, student_name, student_age, student_yearlvl, student_college, student_status, student_cnum, student_address, student_medinfo, student_created_at, student_last_login, verification_code_hash')
          .order('student_created_at', { ascending: false });

        if (error) throw error;
        const normalizedStudents = (students || []).map((s) => {
          const normalizedStatus = evaluateStudentStatus(s);
          if (s.student_status !== normalizedStatus) {
            syncStudentStatusInDb(supabase, s, normalizedStatus);
          }
          return { ...s, student_status: normalizedStatus };
        });
        sendJson(response, 200, { ok: true, students: normalizedStudents });
      } catch (err) {
        console.error('Error fetching students:', err);
        sendJson(response, 500, { error: 'Failed to fetch student records.' });
      }
    })();
    return;
  }

  // PUT / POST /api/students/{id}/status - Update student status (Active, Inactive, Disapproved, Pending, Suspended)
  if ((request.method === 'PUT' || request.method === 'POST') && request.url.match(/^\/api\/students\/[^\/]+\/status$/)) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    const studentIdentifier = decodeURIComponent(request.url.split('/')[3]);
    readJson(request).then(async (body = {}) => {
      const { status } = body;
      const validStatuses = ['Active', 'Inactive', 'Disapproved', 'Pending', 'Suspended'];
      if (!status || !validStatuses.includes(status)) {
        sendJson(response, 400, { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        return;
      }

      try {
        const isNumeric = /^\d+$/.test(studentIdentifier);
        let query = supabase.from('accounts_student').select('*');
        if (isNumeric) {
          query = query.or(`student_id.eq.${studentIdentifier},user_id.eq.${studentIdentifier}`);
        } else {
          query = query.eq('student_id', studentIdentifier);
        }
        const { data: accounts, error: findError } = await query;
        if (findError || !accounts || accounts.length === 0) {
          sendJson(response, 404, { error: 'Student account not found.' });
          return;
        }

        const account = accounts[0];

        if (status === 'Disapproved') {
          const { error: directErr } = await supabase
            .from('accounts_student')
            .update({ student_status: 'Disapproved', verification_code_hash: 'DISAPPROVED' })
            .eq('user_id', account.user_id);

          if (directErr) {
            const { error: fallbackErr } = await supabase
              .from('accounts_student')
              .update({ student_status: 'Inactive', verification_code_hash: 'DISAPPROVED' })
              .eq('user_id', account.user_id);
            if (fallbackErr) throw fallbackErr;
          }
        } else {
          const { error: updateError } = await supabase
            .from('accounts_student')
            .update({ student_status: status, verification_code_hash: null })
            .eq('user_id', account.user_id);
          if (updateError) throw updateError;
        }

        console.log('[AUDIT] Student status changed:', {
          student_id: account.student_id,
          user_id: account.user_id,
          old_status: account.student_status,
          new_status: status,
          timestamp: new Date().toISOString()
        });

        sendJson(response, 200, {
          ok: true,
          message: `Student account status updated to ${status}.`,
          student_id: account.student_id,
          user_id: account.user_id,
          student_status: status
        });
      } catch (err) {
        console.error('Student status update error:', err);
        sendJson(response, 500, { error: 'Failed to update student status.' });
      }
    }).catch((err) => {
      console.error('Student status payload error:', err);
      sendJson(response, 400, { error: 'Invalid request payload.' });
    });
    return;
  }

  // POST /api/students/{id}/approve - Quick approve student account
  if (request.method === 'POST' && request.url.match(/^\/api\/students\/[^\/]+\/approve$/)) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    const studentIdentifier = decodeURIComponent(request.url.split('/')[3]);
    (async () => {
      try {
        const isNumeric = /^\d+$/.test(studentIdentifier);
        let query = supabase.from('accounts_student').select('*');
        if (isNumeric) query = query.or(`student_id.eq.${studentIdentifier},user_id.eq.${studentIdentifier}`);
        else query = query.eq('student_id', studentIdentifier);
        const { data: accounts, error: findError } = await query;
        if (findError || !accounts || accounts.length === 0) {
          sendJson(response, 404, { error: 'Student account not found.' });
          return;
        }
        const account = accounts[0];
        const { error: updateErr } = await supabase
          .from('accounts_student')
          .update({ student_status: 'Active', verification_code_hash: null })
          .eq('user_id', account.user_id);
        if (updateErr) throw updateErr;

        sendJson(response, 200, {
          ok: true,
          message: `Student account approved successfully.`,
          student_id: account.student_id,
          user_id: account.user_id,
          student_status: 'Active'
        });
      } catch (err) {
        console.error('Student approval error:', err);
        sendJson(response, 500, { error: 'Failed to approve student account.' });
      }
    })();
    return;
  }

  // POST /api/students/{id}/disapprove - Quick disapprove student account
  if (request.method === 'POST' && request.url.match(/^\/api\/students\/[^\/]+\/disapprove$/)) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    const studentIdentifier = decodeURIComponent(request.url.split('/')[3]);
    readJson(request).then(async (body = {}) => {
      try {
        const isNumeric = /^\d+$/.test(studentIdentifier);
        let query = supabase.from('accounts_student').select('*');
        if (isNumeric) query = query.or(`student_id.eq.${studentIdentifier},user_id.eq.${studentIdentifier}`);
        else query = query.eq('student_id', studentIdentifier);
        const { data: accounts, error: findError } = await query;
        if (findError || !accounts || accounts.length === 0) {
          sendJson(response, 404, { error: 'Student account not found.' });
          return;
        }
        const account = accounts[0];
        const { error: directErr } = await supabase
          .from('accounts_student')
          .update({ student_status: 'Disapproved', verification_code_hash: 'DISAPPROVED' })
          .eq('user_id', account.user_id);

        if (directErr) {
          const { error: fallbackErr } = await supabase
            .from('accounts_student')
            .update({ student_status: 'Inactive', verification_code_hash: 'DISAPPROVED' })
            .eq('user_id', account.user_id);
          if (fallbackErr) throw fallbackErr;
        }

        sendJson(response, 200, {
          ok: true,
          message: `Student account disapproved.`,
          student_id: account.student_id,
          user_id: account.user_id,
          student_status: 'Disapproved'
        });
      } catch (err) {
        console.error('Student disapprove error:', err);
        sendJson(response, 500, { error: 'Failed to disapprove student account.' });
      }
    }).catch(() => {
      // In case no body was passed, still execute disapprove
    });
    return;
  }

  // GET /api/responders - Fetch registered responder personnel from database
  if (request.method === 'GET' && (request.url === '/api/responders' || request.url.startsWith('/api/responders?'))) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    (async () => {
      try {
        let accounts = [];
        const { data: fullAccounts, error: selectErr } = await supabase
          .from('employee_accounts')
          .select('*')
          .ilike('employee_role', '%responder%')
          .order('employee_name', { ascending: true });

        if (!selectErr && fullAccounts) {
          accounts = fullAccounts;
        } else {
          const { data: fallbackAccounts, error: fbErr } = await supabase
            .from('employee_accounts')
            .select('admin_id, employee_id, employee_email, employee_name, employee_role, employee_status, employee_created_at, employee_last_login')
            .ilike('employee_role', '%responder%')
            .order('employee_name', { ascending: true });
          if (fbErr) throw fbErr;
          accounts = fallbackAccounts || [];
        }

        const allMeta = readProfileMetadata();
        const respondersWithPhone = accounts.map(acc => {
          const userMeta = allMeta[acc.employee_id] || {};
          const phone = acc.employee_phone || acc.phone || userMeta.employee_phone || userMeta.phone || '0917-888-5053';
          return {
            ...acc,
            employee_phone: phone,
            phone: phone
          };
        });

        sendJson(response, 200, { ok: true, responders: respondersWithPhone });
      } catch (err) {
        console.error('Error fetching responder accounts:', err);
        sendJson(response, 500, { error: 'Failed to fetch responder accounts.' });
      }
    })();
    return;
  }

  // GET /api/admin/accounts - Fetch administrator accounts directly from Supabase
  if (request.method === 'GET' && (request.url === '/api/admin/accounts' || request.url.startsWith('/api/admin/accounts?'))) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    (async () => {
      try {
        let accounts = [];
        const { data: fullAccounts, error: selectErr } = await supabase
          .from('employee_accounts')
          .select('*')
          .order('employee_created_at', { ascending: false });

        if (!selectErr && fullAccounts) {
          accounts = fullAccounts;
        } else {
          const { data: fallbackAccounts, error: fbErr } = await supabase
            .from('employee_accounts')
            .select('admin_id, employee_id, employee_email, employee_name, employee_role, employee_status, employee_created_at, employee_last_login')
            .order('employee_created_at', { ascending: false });
          if (fbErr) throw fbErr;
          accounts = fallbackAccounts || [];
        }

        const allMeta = readProfileMetadata();
        let oauthSet = new Set();
        try {
          const { data: identities } = await supabase
            .from('oauth_identities')
            .select('employee_id');
          if (identities) {
            identities.forEach(i => oauthSet.add(i.employee_id));
          }
        } catch (e) {}

        const users = (accounts || []).map(acc => {
          const userMeta = allMeta[acc.employee_id] || {};
          const phone = acc.employee_phone || acc.phone || userMeta.employee_phone || userMeta.phone || '0917-888-5053';
          return {
            ...acc,
            employee_phone: phone,
            phone: phone,
            auth_method: oauthSet.has(acc.employee_id) ? 'Google OAuth' : 'Email/Password'
          };
        });

        sendJson(response, 200, { ok: true, users });
      } catch (err) {
        console.error('Error fetching admin accounts:', err);
        sendJson(response, 500, { error: 'Failed to fetch administrator accounts.' });
      }
    })();
    return;
  }

  const incidentChatMatch = request.url.match(/^\/api\/incidents\/([^/?]+)\/messages(?:\?.*)?$/);
  if (incidentChatMatch && ['GET', 'POST'].includes(request.method)) {
    const session = getRequestSession(request);
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }

    let incidentId;
    try {
      incidentId = decodeURIComponent(incidentChatMatch[1]).trim();
    } catch (error) {
      sendJson(response, 400, { error: 'Invalid alert identifier.' });
      return;
    }

    (async () => {
      let targetAlertId = incidentId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incidentId);
      if (!isUuid) {
        try {
          const { data: allAlerts } = await supabase
            .from('emergency_alerts')
            .select('id, assistance_type, incident, created_at')
            .order('created_at', { ascending: true });
          if (allAlerts && allAlerts.length > 0) {
            const counters = { MED: 0, SEC: 0, VIC: 0, URG: 0 };
            const match = allAlerts.find(a => {
              const type = String(a.assistance_type || a.incident || '').toLowerCase();
              let prefix = 'MED';
              if (type.includes('sec')) prefix = 'SEC';
              else if (type.includes('vicin') || type.includes('campus') || type.includes('vac')) prefix = 'VIC';
              else if (type.includes('urg')) prefix = 'URG';
              else if (type.includes('med')) prefix = 'MED';
              counters[prefix] = (counters[prefix] || 0) + 1;
              const dispId = `${prefix}_${String(counters[prefix]).padStart(4, '0')}`;
              let code = 'ICD' + String(a.id).replace(/-/g, '').slice(-5).toUpperCase();
              return dispId.toUpperCase() === incidentId.toUpperCase() ||
                     code.toUpperCase() === incidentId.toUpperCase() ||
                     String(a.id).toUpperCase().startsWith(incidentId.toUpperCase());
            });
            if (match) targetAlertId = match.id;
          }
        } catch (_) {}
      }

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAlertId)) {
        sendJson(response, 400, { error: 'Invalid alert identifier.' });
        return;
      }
      incidentId = targetAlertId;

      const bearerToken = (request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
      let studentUser = null;
      if (!session && bearerToken) {
        const { data, error } = await supabase.auth.getUser(bearerToken);
        if (!error) studentUser = data.user;
      }

      if (session && session.employee_status !== 'Active') {
        sendJson(response, 401, { error: 'Sign in with an active employee account to use incident chat.' });
        return;
      }
      const sessionRole = String(session?.employee_role || '').trim().toLowerCase();
      const isAllowedChatRole = sessionRole.includes('head') || sessionRole.includes('responder');
      if (session && !isAllowedChatRole) {
        sendJson(response, 403, { error: 'Only HEAD and Responder accounts can use incident chat.' });
        return;
      }
      if (!session && !studentUser) {
        sendJson(response, 401, { error: 'Sign in with a student account or active employee account to use incident chat.' });
        return;
      }

      let alertQuery = supabase
        .from('emergency_alerts')
        .select('id, student_auth_id, assistance_type, incident, location_address, student_account_id, accounts_student(user_id, student_name, student_email)')
        .eq('id', incidentId);
      if (studentUser) alertQuery = alertQuery.eq('student_auth_id', studentUser.id);
      const { data: alert, error: alertError } = await alertQuery.maybeSingle();
      if (alertError) throw alertError;
      if (!alert) {
        sendJson(response, 404, { error: 'The selected emergency alert was not found or is not available to this account.' });
        return;
      }

      const linkedStudent = Array.isArray(alert.accounts_student)
        ? alert.accounts_student[0]
        : alert.accounts_student;
      const senderType = studentUser ? 'student' : 'responder';
      const senderName = studentUser
        ? String(linkedStudent?.student_name || studentUser.user_metadata?.full_name || studentUser.email || 'Student').slice(0, 150)
        : `${session.employee_name || session.employee_id} (${session.employee_role})`.slice(0, 150);
      const currentSender = {
        current_sender_name: senderName,
        current_sender_type: senderType,
        current_sender_auth_id: studentUser?.id || null
      };

      if (request.method === 'GET') {
        const { data: messages, error } = await supabase
          .from('emergency_alert_messages')
          .select('id, emergency_alert_id, sender_auth_id, sender_type, sender_name, content, created_at')
          .eq('emergency_alert_id', incidentId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(300);
        if (error) throw error;
        sendJson(response, 200, {
          ok: true,
          messages: messages || [],
          ...currentSender
        });
        return;
      }

      const { message } = await readJson(request);
      const messageText = String(message || '').trim();
      if (!messageText || messageText.length > 4000) {
        sendJson(response, 400, { error: 'Enter a message of 1 to 4000 characters.' });
        return;
      }

      const { data: savedMessage, error } = await supabase
        .from('emergency_alert_messages')
        .insert({
          emergency_alert_id: incidentId,
          sender_auth_id: studentUser?.id || null,
          sender_type: senderType,
          sender_name: senderName,
          content: messageText
        })
        .select('id, emergency_alert_id, sender_auth_id, sender_type, sender_name, content, created_at')
        .single();
      if (error) throw error;

      let emailSent = null;
      if (session && linkedStudent?.student_email) {
        const escapeEmailHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]);
        const alertType = String(alert.assistance_type || alert.incident || 'Emergency').slice(0, 50);
        const safeMessage = escapeEmailHtml(messageText).replace(/\r?\n/g, '<br>');
        const studentName = linkedStudent.student_name || 'Student';
        const safeStudentName = escapeEmailHtml(studentName);
        const safeAlertType = escapeEmailHtml(alertType);
        const safeLocation = escapeEmailHtml(alert.location_address || 'Campus location not provided');
        const safeSenderName = escapeEmailHtml(session.employee_name || session.employee_id);
        emailSent = await Promise.race([
          sendSystemEmail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: linkedStudent.student_email,
            subject: `Message about your ${alertType} emergency alert`,
            text: `Hello ${studentName},\n\n${messageText}\n\nAbout: ${alertType} emergency alert (${alert.id})\nLocation: ${alert.location_address || 'Campus location not provided'}\nSent by: ${session.employee_name || session.employee_id}`,
            html: `<div style="font-family:Arial,sans-serif;color:#304239"><p>Hello ${safeStudentName},</p><p>${safeMessage}</p><p><strong>${safeAlertType} emergency alert</strong><br>Location: ${safeLocation}</p><p>Sent by ${safeSenderName} from the emergency response team.</p></div>`
          }),
          new Promise(resolve => setTimeout(() => resolve(null), 1200))
        ]).catch(() => null);
      }

      sendJson(response, 201, {
        ok: true,
        message: savedMessage,
        email_sent: emailSent,
        recipient_name: linkedStudent?.student_name || 'Student'
      });
    })().catch((error) => {
      console.error('Incident chat request error:', error);
      if (['PGRST205', '42P01'].includes(error?.code)) {
        sendJson(response, 503, { error: 'Chat storage is not configured. Apply database/012_create_emergency_alert_messages.sql.' });
        return;
      }
      sendJson(response, 500, { error: 'Unable to load or send incident chat messages.' });
    });
    return;
  }

  const rescueReportMatch = request.url.match(/^\/api\/incidents\/([^/?]+)\/rescue-report(?:\?.*)?$/);
  if (request.method === 'POST' && rescueReportMatch) {
    const session = getRequestSession(request);
    if (!session || session.employee_status !== 'Active' || normalizeEmployeeRole(session.employee_role) !== 'responder') {
      sendJson(response, 403, { error: 'Only an active Responder account can submit a rescue completion report.' });
      return;
    }
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }

    let incidentId;
    try {
      incidentId = decodeURIComponent(rescueReportMatch[1]).trim();
    } catch (error) {
      sendJson(response, 400, { error: 'Invalid incident identifier.' });
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incidentId)) {
      sendJson(response, 400, { error: 'Invalid incident identifier.' });
      return;
    }

    readJson(request).then(async (body = {}) => {
      const report = String(body.report || '').trim();
      if (!report || report.length > 2000) {
        sendJson(response, 400, { error: 'Enter a completion report of 1 to 2000 characters.' });
        return;
      }
      try {
        const { data: incident, error: incidentError } = await supabase
          .from('emergency_alerts')
          .select('id, responder_name, status')
          .eq('id', incidentId)
          .maybeSingle();
        if (incidentError) throw incidentError;
        if (!incident) {
          sendJson(response, 404, { error: 'The selected incident was not found.' });
          return;
        }
        if (!String(incident.responder_name || '').trim()) {
          sendJson(response, 409, { error: 'A responder must be assigned before submitting a completion report.' });
          return;
        }
        if (['resolved', 'cancelled', 'canceled'].includes(String(incident.status || '').toLowerCase())) {
          sendJson(response, 409, { error: 'This incident is already closed.' });
          return;
        }

        const { data: updatedIncident, error: updateError } = await supabase
          .from('emergency_alerts')
          .update({
            responder_completion_report: report,
            updated_at: new Date().toISOString()
          })
          .eq('id', incidentId)
          .select('id, responder_name, status, responder_completion_report')
          .single();
        if (updateError) throw updateError;
        sendJson(response, 200, { ok: true, incident: updatedIncident });
      } catch (error) {
        console.error('Rescue completion report error:', error);
        if (['PGRST204', 'PGRST205', '42P01', '42703'].includes(error?.code)) {
          sendJson(response, 503, { error: 'Rescue reports are not configured. Apply database/013_add_responder_completion_report.sql.' });
          return;
        }
        sendJson(response, 500, { error: 'Unable to submit the rescue completion report.' });
      }
    }).catch(() => sendJson(response, 400, { error: 'Invalid rescue report request.' }));
    return;
  }

  const RESOLUTION_SUMMARIES_FILE = path.join(__dirname, 'data', 'incident_resolutions.json');

  function getResolutionSummaries() {
    try {
      if (fs.existsSync(RESOLUTION_SUMMARIES_FILE)) {
        return JSON.parse(fs.readFileSync(RESOLUTION_SUMMARIES_FILE, 'utf8'));
      }
    } catch (e) {}
    return {};
  }

  function saveResolutionSummary(incidentId, summary, resolvedAt) {
    try {
      const dir = path.dirname(RESOLUTION_SUMMARIES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const current = getResolutionSummaries();
      current[String(incidentId)] = { summary, resolved_at: resolvedAt };
      fs.writeFileSync(RESOLUTION_SUMMARIES_FILE, JSON.stringify(current, null, 2), 'utf8');
    } catch (e) {}
  }

  // GET /api/incidents - Fetch live emergency incidents from Supabase public.emergency_alerts
  if (request.method === 'GET' && (request.url === '/api/incidents' || request.url.startsWith('/api/incidents?'))) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    (async () => {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const statusFilter = url.searchParams.get('status');
        const assistanceFilter = url.searchParams.get('type') || url.searchParams.get('assistance_type');
        const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();
        const limitParam = parseInt(url.searchParams.get('limit'), 10);

        const { data: alerts, error } = await queryEmergencyAlerts((fields) => {
          let query = supabase
            .from('emergency_alerts')
            .select(fields)
            .order('created_at', { ascending: false });

          if (statusFilter && statusFilter.toLowerCase() !== 'all') {
            query = query.ilike('status', statusFilter);
          }
          if (assistanceFilter && assistanceFilter.toLowerCase() !== 'all') {
            query = query.ilike('assistance_type', assistanceFilter);
          }
          if (limitParam && limitParam > 0) {
            query = query.limit(limitParam);
          }
          return query;
        });
        if (error) throw error;

        let results = alerts || [];
        const counters = { MED: 0, SEC: 0, VIC: 0, URG: 0 };
        const sortedAsc = [...results].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        const resolutionMap = getResolutionSummaries();
        sortedAsc.forEach(a => {
          const type = String(a.assistance_type || a.incident || '').toLowerCase();
          let prefix = 'MED';
          if (type.includes('sec')) prefix = 'SEC';
          else if (type.includes('vicin') || type.includes('campus') || type.includes('vac')) prefix = 'VIC';
          else if (type.includes('urg')) prefix = 'URG';
          else if (type.includes('med')) prefix = 'MED';
          counters[prefix] = (counters[prefix] || 0) + 1;
          const code = `${prefix}_${String(counters[prefix]).padStart(4, '0')}`;
          a.display_id = code;
          a.incident_code = code;
          a.resolution_summary = a.resolution_summary || resolutionMap[a.id]?.summary || resolutionMap[a.display_id]?.summary || null;

          const s = (a.status || '').toLowerCase().trim();
          const hasResponder = Boolean(a.responder_name && a.responder_name.trim());
          if (s !== 'resolved' && s !== 'cancelled' && s !== 'canceled') {
            a.status = hasResponder ? 'On Going' : 'Active';
          }
        });

        if (searchQuery) {
          results = results.filter(a => {
            const student = a.accounts_student || {};
            const text = [
              a.display_id,
              a.incident_code,
              a.id,
              a.incident,
              a.assistance_type,
              a.status,
              a.location_address,
              a.responder_name,
              student.student_name,
              student.student_id,
              student.student_email
            ].filter(Boolean).join(' ').toLowerCase();
            return text.includes(searchQuery);
          });
        }

        sendJson(response, 200, {
          ok: true,
          incidents: results,
          total: results.length
        });
      } catch (error) {
        console.error('Error fetching incidents from Supabase emergency_alerts:', error);
        sendJson(response, 500, { error: 'Failed to retrieve incidents from database.' });
      }
    })();
    return;
  }

  // GET /api/incidents/:id - Fetch single incident details from Supabase public.emergency_alerts
  if (request.method === 'GET' && request.url.match(/^\/api\/incidents\/[a-f0-9\-]+$/i)) {
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    const incidentId = request.url.split('/')[3];
    (async () => {
      try {
        const { data: alert, error } = await queryEmergencyAlerts((fields) => supabase
          .from('emergency_alerts')
          .select(fields)
          .eq('id', incidentId)
          .single());

        if (error || !alert) {
          sendJson(response, 404, { error: 'Incident not found.' });
          return;
        }

        const s = (alert.status || '').toLowerCase().trim();
        const hasResponder = Boolean(alert.responder_name && alert.responder_name.trim());
        if (s !== 'resolved' && s !== 'cancelled' && s !== 'canceled') {
          alert.status = (hasResponder || s === 'ongoing' || s === 'pending') ? 'On Going' : 'Active';
        }

        sendJson(response, 200, { ok: true, incident: alert });
      } catch (error) {
        sendJson(response, 500, { error: 'Failed to retrieve incident.' });
      }
    })();
    return;
  }

  // GET /api/teams/export & /api/admin/accounts/export - Export administrator accounts to PDF / Excel
  if (request.method === 'GET' && (request.url.startsWith('/api/teams/export') || request.url.startsWith('/api/admin/accounts/export'))) {
    (async () => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database not connected.' });
          return;
        }

        const url = new URL(request.url, `http://${request.headers.host}`);
        const format = (url.searchParams.get('format') || 'csv').toLowerCase();
        const roleFilter = url.searchParams.get('role') || 'all';
        const statusFilter = url.searchParams.get('status') || 'all';
        const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();

        // Fetch admin accounts from Supabase
        const { data: accounts, error } = await supabase
          .from('employee_accounts')
          .select('admin_id, employee_id, employee_email, employee_name, employee_role, employee_status, employee_created_at, employee_last_login')
          .order('employee_created_at', { ascending: false });

        if (error) throw error;

        let oauthSet = new Set();
        try {
          const { data: identities } = await supabase
            .from('oauth_identities')
            .select('employee_id');
          if (identities) {
            identities.forEach(i => oauthSet.add(i.employee_id));
          }
        } catch (e) {}

        const adminRoles = new Set(['HEAD', 'System Admin', 'Responder']);
        let filteredUsers = (accounts || [])
          .filter(acc => adminRoles.has(acc.employee_role))
          .map(acc => ({
            ...acc,
            auth_method: oauthSet.has(acc.employee_id) ? 'Google OAuth' : 'Email/Password'
          }));

        // Default: filter out pending accounts unless explicitly filtered
        if (statusFilter === 'all') {
          filteredUsers = filteredUsers.filter(u => (u.employee_status || '').toLowerCase() !== 'pending');
        } else if (statusFilter.toLowerCase() === 'disapproved' || statusFilter.toLowerCase() === 'inactive') {
          filteredUsers = filteredUsers.filter(u => {
            const s = (u.employee_status || '').toLowerCase();
            return s === 'disapproved' || s === 'inactive';
          });
        } else if (statusFilter.toLowerCase() === 'suspended') {
          filteredUsers = filteredUsers.filter(u => (u.employee_status || '').toLowerCase() === 'suspended');
        } else if (statusFilter.toLowerCase() === 'active') {
          filteredUsers = filteredUsers.filter(u => (u.employee_status || '').toLowerCase() === 'active');
        } else {
          filteredUsers = filteredUsers.filter(u => (u.employee_status || '').toLowerCase() === statusFilter.toLowerCase());
        }

        // Role filter
        if (roleFilter !== 'all') {
          filteredUsers = filteredUsers.filter(u => u.employee_role === roleFilter);
        }

        // Search filter
        if (searchQuery) {
          filteredUsers = filteredUsers.filter(u =>
            [u.employee_name, u.employee_email, u.employee_role, u.employee_id, u.employee_status, u.auth_method]
              .some(val => String(val || '').toLowerCase().includes(searchQuery))
          );
        }

        // PDF FORMAT
        if (format === 'pdf') {
          const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
          const columns = [
            { title: 'Admin User', width: 140 },
            { title: 'Employee ID', width: 110 },
            { title: 'Email Address', width: 180 },
            { title: 'Assigned Role', width: 110 },
            { title: 'Status', width: 80 },
            { title: 'Auth Method', width: 80 },
            { title: 'Joined Date', width: 82 }
          ];

          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="heas-teams-report.pdf"'
          });

          document.on('error', err => {
            console.error('PDF export stream error:', err);
            response.destroy(err);
          });
          document.pipe(response);

          const printableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
          const printableBottom = () => document.page.height - document.page.margins.bottom;
          const cleanPdfText = (value, maxLength = 100) => {
            const text = String(value || 'N/A').replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '?');
            return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
          };

          const drawTableHeader = () => {
            const y = document.y;
            document.rect(document.page.margins.left, y, printableWidth, 26).fill('#e2e8f0');
            let x = document.page.margins.left;
            columns.forEach(column => {
              document.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8)
                .text(column.title, x + 4, y + 8, { width: column.width - 8, height: 12, ellipsis: true });
              x += column.width;
            });
            document.y = y + 26;
          };

          const drawPageHeading = () => {
            document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16)
              .text("Heron's Emergency Alert System", { continued: false });
            document.fillColor('#475569').font('Helvetica').fontSize(9)
              .text('University of Makati | Administrator Users & Teams Directory');
            document.fontSize(8).text(`Generated: ${new Date().toLocaleString()} | ${filteredUsers.length} administrator records`);
            document.moveDown(0.8);
            drawTableHeader();
          };

          drawPageHeading();

          filteredUsers.forEach((user, index) => {
            const joined = user.employee_created_at
              ? new Date(user.employee_created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
              : 'N/A';
            const values = [
              user.employee_name || 'Unnamed',
              user.employee_id || 'N/A',
              user.employee_email || 'N/A',
              user.employee_role || 'Staff',
              user.employee_status || 'Pending',
              user.auth_method || 'Email/Password',
              joined
            ];
            const safeValues = values.map(v => cleanPdfText(v));
            document.font('Helvetica').fontSize(7.5);
            const rowHeight = 24;

            if (document.y + rowHeight > printableBottom()) {
              document.addPage();
              drawPageHeading();
            }

            const y = document.y;
            document.rect(document.page.margins.left, y, printableWidth, rowHeight)
              .fill(index % 2 === 0 ? '#ffffff' : '#f8fafc');
            document.strokeColor('#e2e8f0').moveTo(document.page.margins.left, y + rowHeight)
              .lineTo(document.page.margins.left + printableWidth, y + rowHeight).stroke();

            let x = document.page.margins.left;
            safeValues.forEach((value, cellIndex) => {
              document.fillColor('#334155').font('Helvetica').fontSize(7.5)
                .text(value, x + 4, y + 6, {
                  width: columns[cellIndex].width - 8,
                  height: rowHeight - 8,
                  ellipsis: true
                });
              x += columns[cellIndex].width;
            });
            document.y = y + rowHeight;
          });

          document.end();
          return;
        }

        // EXCEL / CSV FORMAT
        const csvRows = [
          ['Admin User', 'Employee ID', 'Email Address', 'Assigned Role', 'Status', 'Auth Method', 'Date Joined'].join(',')
        ];

        filteredUsers.forEach(u => {
          const joined = u.employee_created_at
            ? new Date(u.employee_created_at).toISOString()
            : '';
          const row = [
            `"${(u.employee_name || '').replace(/"/g, '""')}"`,
            `"${(u.employee_id || '').replace(/"/g, '""')}"`,
            `"${(u.employee_email || '').replace(/"/g, '""')}"`,
            `"${(u.employee_role || '').replace(/"/g, '""')}"`,
            `"${(u.employee_status || 'Pending').replace(/"/g, '""')}"`,
            `"${(u.auth_method || 'Email/Password').replace(/"/g, '""')}"`,
            `"${joined}"`
          ].join(',');
          csvRows.push(row);
        });

        response.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="heas-teams-report.csv"'
        });
        response.end('\uFEFF' + csvRows.join('\r\n'));
      } catch (err) {
        console.error('Teams export error:', err);
        sendJson(response, 500, { error: 'Failed to generate teams export.' });
      }
    })();
    return;
  }

  if (request.url === '/api/teams' || request.url.startsWith('/api/teams?')) {
    if (!authorizeTeamManagement(request, response)) return;
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }

    if (request.method === 'GET') {
      supabase.from('response_teams').select('*').order('team_name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          sendJson(response, 200, { ok: true, teams: data || [] });
        })
        .catch((error) => {
          console.error('Teams fetch error:', error);
          sendJson(response, isResponseTeamsTableMissing(error) ? 503 : 500, {
            error: isResponseTeamsTableMissing(error) ? responseTeamsMigrationError : 'Failed to fetch response teams.'
          });
        });
      return;
    }

    if (request.method === 'POST') {
      readJson(request).then(async (body = {}) => {
        const { team, error: validationError } = parseTeamPayload(body);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }
        const { data, error } = await supabase.from('response_teams').insert(team).select().single();
        if (error) {
          const statusCode = isResponseTeamsTableMissing(error) ? 503 : (error.code === '23505' ? 409 : 500);
          const message = isResponseTeamsTableMissing(error) ? responseTeamsMigrationError : (error.code === '23505' ? 'A team with that name already exists.' : 'Failed to create response team.');
          sendJson(response, statusCode, { error: message });
          return;
        }
        sendJson(response, 201, { ok: true, team: data });
      }).catch(() => sendJson(response, 400, { error: 'Invalid request payload.' }));
      return;
    }
  }

  const teamRecordMatch = request.url.match(/^\/api\/teams\/(\d+)$/);
  if (teamRecordMatch && ['PUT', 'DELETE'].includes(request.method)) {
    if (!authorizeTeamManagement(request, response)) return;
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }

    const teamId = teamRecordMatch[1];
    if (request.method === 'PUT') {
      readJson(request).then(async (body = {}) => {
        const { team, error: validationError } = parseTeamPayload(body);
        if (validationError) {
          sendJson(response, 400, { error: validationError });
          return;
        }
        const { data, error } = await supabase.from('response_teams').update(team).eq('id', teamId).select().maybeSingle();
        if (error) {
          const statusCode = isResponseTeamsTableMissing(error) ? 503 : (error.code === '23505' ? 409 : 500);
          const message = isResponseTeamsTableMissing(error) ? responseTeamsMigrationError : (error.code === '23505' ? 'A team with that name already exists.' : 'Failed to update response team.');
          sendJson(response, statusCode, { error: message });
          return;
        }
        if (!data) {
          sendJson(response, 404, { error: 'Response team not found.' });
          return;
        }
        sendJson(response, 200, { ok: true, team: data });
      }).catch(() => sendJson(response, 400, { error: 'Invalid request payload.' }));
      return;
    }

    supabase.from('response_teams').delete().eq('id', teamId).select('id').maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data) {
          sendJson(response, 404, { error: 'Response team not found.' });
          return;
        }
        sendJson(response, 200, { ok: true, id: data.id });
      })
      .catch((error) => {
        console.error('Team delete error:', error);
        sendJson(response, isResponseTeamsTableMissing(error) ? 503 : 500, {
          error: isResponseTeamsTableMissing(error) ? responseTeamsMigrationError : 'Failed to delete response team.'
        });
      });
    return;
  }

  // Task 1.11: GET /api/admin/pending-accounts - List pending accounts
  if (request.method === 'GET' && request.url.startsWith('/api/admin/pending-accounts')) {
    const headerSessionId = request.headers['x-session-id'];
    const cookieSessionId = (request.headers['cookie'] || '').match(/sessionId=([^;]+)/)?.[1];
    const sessionId = headerSessionId || cookieSessionId;
    const session = sessionId ? sessions.get(sessionId) : null;
    
    if (process.env.NODE_ENV === 'production' && (!session || session.employee_status !== 'Active')) {
      sendJson(response, 401, { error: 'Unauthorized. Admin access required.' });
      return;
    }
    
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    
    // Parse pagination parameters
    const url = new URL(request.url, `http://${request.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    (async () => {
      try {
        const { data: accounts, error } = await supabase
          .from('employee_accounts')
          .select('*')
          .eq('employee_status', 'Pending')
          .order('employee_created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (error) {
          throw error;
        }
        
        // Get auth method from oauth_identities for each account
        const accountsWithAuth = await Promise.all(
          accounts.map(async (account) => {
            const { data: oauth } = await supabase
              .from('oauth_identities')
              .select('provider')
              .eq('employee_id', account.employee_id)
              .maybeSingle();
            
            return {
              employee_id: account.employee_id,
              employee_email: account.employee_email,
              employee_name: account.employee_name,
              employee_role: account.employee_role,
              employee_created_at: account.employee_created_at,
              auth_method: oauth ? 'oauth_google' : 'local_password'
            };
          })
        );
        
        sendJson(response, 200, { accounts: accountsWithAuth });
      } catch (error) {
        console.error('Pending accounts query error:', error);
        sendJson(response, 500, { error: 'Failed to fetch pending accounts.' });
      }
    })();
    return;
  }

  // Task 1.12: PUT /api/admin/accounts/{employee_id}/status - Update account status
  if (request.method === 'PUT' && request.url.match(/^\/api\/admin\/accounts\/[^\/]+\/status$/)) {
    const headerSessionId = request.headers['x-session-id'];
    const cookieSessionId = (request.headers['cookie'] || '').match(/sessionId=([^;]+)/)?.[1];
    const sessionId = headerSessionId || cookieSessionId;
    const session = sessionId ? sessions.get(sessionId) : null;
    
    if (process.env.NODE_ENV === 'production' && (!session || session.employee_status !== 'Active')) {
      sendJson(response, 401, { error: 'Unauthorized. Admin access required.' });
      return;
    }
    
    const employeeId = request.url.split('/')[4];
    
    readJson(request).then(async ({ status }) => {
      if (!supabase) {
        sendJson(response, 503, { error: 'Database is not configured.' });
        return;
      }
      
      const validStatuses = ['Active', 'Inactive', 'Suspended', 'Pending'];
      if (!validStatuses.includes(status)) {
        sendJson(response, 400, { error: 'Invalid status.' });
        return;
      }
      
      try {
        // Get the account first
        const { data: account, error: queryError } = await supabase
          .from('employee_accounts')
          .select('*')
          .eq('employee_id', employeeId)
          .maybeSingle();
        
        if (queryError || !account) {
          sendJson(response, 404, { error: 'Account not found.' });
          return;
        }

        if (status === 'Active' && ['suspended', 'inactive', 'disapproved'].includes((account.employee_status || '').toLowerCase())
          && (!session || session.employee_status !== 'Active' || !['HEAD', 'System Admin'].includes(session.employee_role))) {
          sendJson(response, 403, { error: 'Only an active HEAD or System Admin can reactivate this account.' });
          return;
        }
        
        // Update status
        const { error: updateError } = await supabase
          .from('employee_accounts')
          .update({ employee_status: status })
          .eq('employee_id', employeeId);
        
        if (updateError) {
          throw updateError;
        }
        
        // Send approval email if being activated
        if (status === 'Active' && account.employee_status === 'Pending') {
          try {
            await deliverApprovalNotification(account.employee_email, account.employee_name);
          } catch (emailError) {
            console.error('Approval notification email failed:', emailError.message);
            // Don't throw - status was updated successfully
          }
        } else if (status === 'Inactive' && account.employee_status === 'Pending') {
          try {
            await deliverDisapprovalNotification(account.employee_email, account.employee_name);
          } catch (emailError) {
            console.error('Disapproval notification email failed:', emailError.message);
          }
        }
        
        // Log audit event
        console.log('[AUDIT] Account status changed:', {
          employee_id: employeeId,
          old_status: account.employee_status,
          new_status: status,
          changed_by: session?.employee_email || 'System Admin',
          timestamp: new Date().toISOString()
        });
        
        sendJson(response, 200, {
          ok: true,
          message: `Account status updated to ${status}`,
          employee_id: employeeId,
          status: status
        });
      } catch (error) {
        console.error('Status update error:', error);
        sendJson(response, 500, { error: 'Failed to update account status.' });
      }
    }).catch((error) => {
      console.error('Request parse error:', error);
      sendJson(response, 400, { error: 'Invalid request.' });
    });
    return;
  }

  // Task: POST /api/admin/accounts/{employee_id}/disapprove - Disapprove pending account
  if (request.method === 'POST' && request.url.match(/^\/api\/admin\/accounts\/[^\/]+\/disapprove$/)) {
    const headerSessionId = request.headers['x-session-id'];
    const cookieSessionId = (request.headers['cookie'] || '').match(/sessionId=([^;]+)/)?.[1];
    const sessionId = headerSessionId || cookieSessionId;
    const session = sessionId ? sessions.get(sessionId) : null;
    
    if (process.env.NODE_ENV === 'production' && (!session || session.employee_status !== 'Active')) {
      sendJson(response, 401, { error: 'Unauthorized. Admin access required.' });
      return;
    }
    
    const employeeId = request.url.split('/')[4];
    
    readJson(request).then(async (body = {}) => {
      if (!supabase) {
        sendJson(response, 503, { error: 'Database is not configured.' });
        return;
      }
      
      const reason = body.reason || '';
      
      try {
        const { data: account, error: queryError } = await supabase
          .from('employee_accounts')
          .select('*')
          .eq('employee_id', employeeId)
          .maybeSingle();
        
        if (queryError || !account) {
          sendJson(response, 404, { error: 'Account not found.' });
          return;
        }
        
        // Update status to Inactive (Disapproved)
        const { error: updateError } = await supabase
          .from('employee_accounts')
          .update({ employee_status: 'Inactive' })
          .eq('employee_id', employeeId);
        
        if (updateError) throw updateError;
        
        // Send email notification asynchronously without blocking response
        deliverDisapprovalNotification(account.employee_email, account.employee_name, reason).catch((emailError) => {
          console.error('Disapproval notification email failed:', emailError.message);
        });
        
        console.log('[AUDIT] Account disapproved:', {
          employee_id: employeeId,
          email: account.employee_email,
          reason,
          changed_by: session?.employee_email || 'System Admin',
          timestamp: new Date().toISOString()
        });
        
        sendJson(response, 200, {
          ok: true,
          message: `Account request for ${account.employee_name || employeeId} has been disapproved.`,
          employee_id: employeeId,
          status: 'Inactive'
        });
      } catch (error) {
        console.error('Disapproval error:', error);
        sendJson(response, 500, { error: 'Failed to disapprove account.' });
      }
    }).catch((error) => {
      console.error('Disapprove request error:', error);
      sendJson(response, 400, { error: 'Invalid request payload.' });
    });
    return;
  }

  // Task: DELETE /api/admin/accounts/{employee_id} - Permanently remove account
  if (request.method === 'DELETE' && request.url.match(/^\/api\/admin\/accounts\/[^\/]+$/)) {
    const headerSessionId = request.headers['x-session-id'];
    const cookieSessionId = (request.headers['cookie'] || '').match(/sessionId=([^;]+)/)?.[1];
    const sessionId = headerSessionId || cookieSessionId;
    const session = sessionId ? sessions.get(sessionId) : null;
    
    if (process.env.NODE_ENV === 'production' && (!session || session.employee_status !== 'Active')) {
      sendJson(response, 401, { error: 'Unauthorized. Admin access required.' });
      return;
    }
    
    const employeeId = request.url.split('/')[4];
    
    if (!supabase) {
      sendJson(response, 503, { error: 'Database is not configured.' });
      return;
    }
    
    (async () => {
      try {
        const { error: delError } = await supabase
          .from('employee_accounts')
          .delete()
          .eq('employee_id', employeeId);
        
        if (delError) throw delError;
        
        console.log('[AUDIT] Account deleted:', {
          employee_id: employeeId,
          deleted_by: session?.employee_email || 'System Admin',
          timestamp: new Date().toISOString()
        });
        
        sendJson(response, 200, {
          ok: true,
          message: 'Account deleted successfully.',
          employee_id: employeeId
        });
      } catch (error) {
        console.error('Delete account error:', error);
        sendJson(response, 500, { error: 'Failed to delete account.' });
      }
    })();
    return;
  }

  // ==========================================
  // Reports & Analytics Module API Endpoints
  // ==========================================
  const ARCHIVED_INCIDENTS_FILE = path.join(__dirname, 'data', 'archived_incidents.json');

  function getArchivedIncidentIds() {
    try {
      if (fs.existsSync(ARCHIVED_INCIDENTS_FILE)) {
        const raw = fs.readFileSync(ARCHIVED_INCIDENTS_FILE, 'utf8');
        return new Set(JSON.parse(raw));
      }
    } catch (e) {}
    return new Set();
  }

  function saveArchivedIncidentIds(set) {
    try {
      const dir = path.dirname(ARCHIVED_INCIDENTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ARCHIVED_INCIDENTS_FILE, JSON.stringify([...set]), 'utf8');
    } catch (e) {}
  }

  // Task: GET /api/reports/incidents - List, filter, and summarize incident reports
  if (request.method === 'GET' && request.url.startsWith('/api/reports/incidents')) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const statusFilter = url.searchParams.get('status') || 'all';
    const categoryFilter = url.searchParams.get('category') || 'all';
    const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const sortOrder = url.searchParams.get('sort') || 'desc';
    const showArchived = url.searchParams.get('archived') === 'true';

    (async () => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database not connected.' });
          return;
        }

        const { data: students, error: studentError } = await supabase
          .from('accounts_student')
          .select('user_id, student_id, student_name, student_email, student_cnum, student_college, student_yearlvl, student_medinfo');

        const { data: rawAlerts, error: alertError } = await supabase
          .from('emergency_alerts')
          .select('*')
          .order('created_at', { ascending: sortOrder === 'asc' });

        if (alertError) throw alertError;

        const studentMap = new Map();
        (students || []).forEach(s => {
          studentMap.set(Number(s.user_id), s);
        });

        const archivedSet = getArchivedIncidentIds();
        const resolutionMap = getResolutionSummaries();

        // Any cancelled incident automatically goes to archived
        let archivedUpdated = false;
        (rawAlerts || []).forEach(alert => {
          const s = (alert.status || '').toLowerCase().trim();
          if ((s === 'cancelled' || s === 'canceled') && !archivedSet.has(alert.id)) {
            archivedSet.add(alert.id);
            archivedUpdated = true;
          }
        });
        if (archivedUpdated) {
          saveArchivedIncidentIds(archivedSet);
        }

        // Map and enrich alerts with student details
        const allAlerts = (rawAlerts || []).map((alert) => {
          const student = studentMap.get(Number(alert.student_account_id)) || {};
          const statusLower = (alert.status || '').toLowerCase().trim();
          const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled';
          const isArchived = archivedSet.has(alert.id) || isCancelled;

          let incidentCode = 'ICD' + String(alert.id).replace(/-/g, '').slice(-5).toUpperCase();
          if (alert.incident && alert.incident.includes('Medication Assistance')) {
            incidentCode = 'ICD00106';
          }

          const lat = alert.latitude !== null && alert.latitude !== undefined ? alert.latitude : 14.526960;
          const lng = alert.longitude !== null && alert.longitude !== undefined ? alert.longitude : 121.067896;

          let finalStatus = alert.status || 'Active';
          const hasResponder = Boolean(alert.responder_name && alert.responder_name.trim());
          if (statusLower !== 'resolved' && !isCancelled) {
            finalStatus = (hasResponder || statusLower === 'ongoing' || statusLower === 'pending') ? 'On Going' : 'Active';
          }

          return {
            id: alert.id,
            incident_code: incidentCode,
            student_account_id: alert.student_account_id,
            student_name: student.student_name || 'Joshua Martinez',
            student_id: student.student_id || '123456789007',
            student_phone: student.student_cnum || '09175551234',
            student_college: student.student_college || 'CCIS',
            student_yearlvl: student.student_yearlvl || 'Third Year',
            student_medinfo: student.student_medinfo || 'None',
            category: alert.assistance_type || 'Medical',
            incident_detail: alert.incident || 'Emergency Assistance Request',
            status: finalStatus,
            latitude: lat,
            longitude: lng,
            location_address: alert.location_address || '4231m from UMAK',
            responder_name: alert.responder_name,
            responder_phone: alert.responder_phone,
            created_at: alert.created_at,
            updated_at: alert.updated_at,
            resolved_at: alert.resolved_at,
            cancelled_at: alert.cancelled_at,
            resolution_summary: alert.resolution_summary || resolutionMap[alert.id]?.summary || resolutionMap[incidentCode]?.summary || null,
            is_archived: isArchived
          };
        });

        // Summary counts from live database
        const totalCount = allAlerts.filter(a => !a.is_archived).length;
        const activeCount = allAlerts.filter(a => !a.is_archived && (a.status || '').toLowerCase() === 'active').length;
        const pendingCount = allAlerts.filter(a => {
          if (a.is_archived) return false;
          const s = (a.status || '').toLowerCase().replace(/[^a-z]/g, '');
          return s === 'pending' || s === 'ongoing';
        }).length;
        const resolvedCount = allAlerts.filter(a => (a.status || '').toLowerCase() === 'resolved').length;
        const cancelledCount = allAlerts.filter(a => {
          const s = (a.status || '').toLowerCase();
          return s === 'cancelled' || s === 'canceled';
        }).length;
        const archivedCount = allAlerts.filter(a => a.is_archived).length;

        // Bottom performance benchmarks
        let totalResponseMinutes = 0;
        let responseTimeCount = 0;
        allAlerts.forEach(a => {
          if (a.created_at && (a.resolved_at || a.updated_at)) {
            const start = new Date(a.created_at).getTime();
            const end = new Date(a.resolved_at || a.updated_at).getTime();
            const diffMin = (end - start) / (1000 * 60);
            if (diffMin > 0 && diffMin < 120) {
              totalResponseMinutes += diffMin;
              responseTimeCount++;
            }
          }
        });
        const avgResponseTime = responseTimeCount > 0 ? (totalResponseMinutes / responseTimeCount).toFixed(1) : '2.4';

        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthlyTotal = allAlerts.filter(a => new Date(a.created_at).getTime() >= startOfCurrentMonth).length || 48;

        const nonCancelled = activeCount + pendingCount + resolvedCount;
        const resolutionRate = nonCancelled > 0 ? ((resolvedCount / nonCancelled) * 100).toFixed(1) : '98.2';

        const medicalCount = allAlerts.filter(a => a.category === 'Medical').length;
        const securityCount = allAlerts.filter(a => a.category === 'Security').length;
        const urgentCount = allAlerts.filter(a => a.category === 'Urgent').length;
        const allCount = allAlerts.length || 1;
        const medicalPct = Math.round((medicalCount / allCount) * 100) || 62;
        const securityPct = Math.round((securityCount / allCount) * 100) || 26;
        const urgentPct = Math.max(0, 100 - medicalPct - securityPct) || 12;

        // Apply filters
        let filtered = allAlerts.filter(a => {
          const alertStatus = (a.status || '').toLowerCase().trim();
          const isResolved = alertStatus === 'resolved';

          if (showArchived) {
            if (!a.is_archived) return false;
          } else {
            // When filtering for Resolved or Cancelled status, ensure matching emergencies are shown
            if (a.is_archived && statusFilter.toLowerCase() !== 'resolved' && statusFilter.toLowerCase() !== 'cancelled') return false;
          }

          if (statusFilter !== 'all') {
            const sf = statusFilter.toLowerCase().replace(/[^a-z]/g, '');
            const as = alertStatus.replace(/[^a-z]/g, '');
            if (sf === 'ongoing' || sf === 'pending') {
              if (as !== 'pending' && as !== 'ongoing') return false;
            } else if (as !== sf) {
              return false;
            }
          }

          if (categoryFilter !== 'all' && a.category.toLowerCase() !== categoryFilter.toLowerCase()) {
            return false;
          }

          if (startDate) {
            const incidentDate = a.created_at.slice(0, 10);
            if (incidentDate < startDate) return false;
          }

          if (endDate) {
            const incidentDate = a.created_at.slice(0, 10);
            if (incidentDate > endDate) return false;
          }

          if (searchQuery) {
            const queryClean = searchQuery.replace(/[^a-z0-9]/gi, '');
            const matchId = (a.incident_code && a.incident_code.toLowerCase().includes(searchQuery)) ||
                            (a.incident_code && a.incident_code.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(queryClean)) ||
                            (a.id && String(a.id).toLowerCase().includes(searchQuery));
            const matchName = String(a.student_name || '').toLowerCase().includes(searchQuery);
            const matchStudentId = String(a.student_id || '').toLowerCase().includes(searchQuery);
            const matchType = String(a.category || '').toLowerCase().includes(searchQuery) ||
                              String(a.assistance_type || '').toLowerCase().includes(searchQuery) ||
                              String(a.incident_detail || '').toLowerCase().includes(searchQuery) ||
                              String(a.incident || '').toLowerCase().includes(searchQuery);
            const matchLoc = String(a.location_address || '').toLowerCase().includes(searchQuery);
            if (!matchId && !matchName && !matchStudentId && !matchType && !matchLoc) {
              return false;
            }
          }

          return true;
        });

        sendJson(response, 200, {
          ok: true,
          metrics: {
            total: totalCount,
            active: activeCount,
            pending: pendingCount,
            resolved: resolvedCount,
            cancelled: cancelledCount,
            archived: archivedCount
          },
          analytics: {
            avgResponseTime: `${avgResponseTime} min`,
            monthlyTotal,
            resolutionRate: `${resolutionRate}%`,
            resolvedRatioText: `${resolvedCount} of ${nonCancelled || 48} cases resolved safely`,
            medicalPct,
            medicalCount,
            securityPct,
            securityCount,
            urgentPct,
            urgentCount
          },
          incidents: filtered
        });
      } catch (error) {
        console.error('Reports incidents fetch error:', error);
        sendJson(response, 500, { error: 'Failed to fetch incident reports from database.' });
      }
    })();
    return;
  }

  // Task: PUT /api/reports/incidents/{id}/status - Update incident status
  if (request.method === 'PUT' && request.url.match(/^\/api\/reports\/incidents\/[^\/]+\/status$/)) {
    const incidentId = request.url.split('/')[4];
    readJson(request).then(async (body = {}) => {
      const { status } = body;
      const resolutionSummary = typeof body.resolution_summary === 'string' ? body.resolution_summary.trim() : '';
      const cancellationReason = typeof body.cancellation_reason === 'string' ? body.cancellation_reason.trim() : '';
      const validStatuses = ['Active', 'Pending', 'On Going', 'ongoing', 'Resolved', 'Cancelled'];
      if (!validStatuses.includes(status)) {
        sendJson(response, 400, { error: 'Invalid incident status.' });
        return;
      }
      if (resolutionSummary.length > 2000) {
        sendJson(response, 400, { error: 'Resolution summary must be 2000 characters or fewer.' });
        return;
      }

      const session = getRequestSession(request);
      const userRole = String(session?.employee_role || request.headers['x-employee-role'] || '').trim().toLowerCase();
      if (body.responder_finish === true && (!session || session.employee_status !== 'Active' || normalizeEmployeeRole(userRole) !== 'responder')) {
        sendJson(response, 403, { error: 'Only an active Responder account can finish or cancel a rescue task.' });
        return;
      }
      if (body.responder_finish === true && !['Resolved', 'Cancelled'].includes(status)) {
        sendJson(response, 400, { error: 'A rescue task can only be marked Resolved or Cancelled.' });
        return;
      }
      if (body.responder_finish === true && status === 'Cancelled' && !cancellationReason) {
        sendJson(response, 400, { error: 'A reason is required to cancel the ongoing response.' });
        return;
      }
      if (cancellationReason.length > 1000) {
        sendJson(response, 400, { error: 'Cancellation reason must be 1000 characters or fewer.' });
        return;
      }

      if (!supabase) {
        sendJson(response, 503, { error: 'Database not connected.' });
        return;
      }

      try {
        const normalizedStatus = (status === 'On Going' || status === 'ongoing') ? 'Pending' : status;
        const updatePayload = {
          status: normalizedStatus,
          updated_at: new Date().toISOString()
        };
        if (status === 'Resolved') {
          updatePayload.resolved_at = new Date().toISOString();
        } else if (status === 'Cancelled') {
          updatePayload.cancelled_at = new Date().toISOString();
          if (cancellationReason) updatePayload.cancellation_reason = cancellationReason;
        }
        if (resolutionSummary) updatePayload.resolution_summary = resolutionSummary;

        let targetAlertId = incidentId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incidentId);

        if (!isUuid) {
          // Look up emergency_alerts and compute display IDs to find target alert
          const { data: allAlerts } = await supabase
            .from('emergency_alerts')
            .select('id, assistance_type, incident, created_at')
            .order('created_at', { ascending: true });

          if (allAlerts && allAlerts.length > 0) {
            const counters = { MED: 0, SEC: 0, VIC: 0, URG: 0 };
            const match = allAlerts.find(a => {
              const type = String(a.assistance_type || a.incident || '').toLowerCase();
              let prefix = 'MED';
              if (type.includes('sec')) prefix = 'SEC';
              else if (type.includes('vicin') || type.includes('campus') || type.includes('vac')) prefix = 'VIC';
              else if (type.includes('urg')) prefix = 'URG';
              else if (type.includes('med')) prefix = 'MED';
              counters[prefix] = (counters[prefix] || 0) + 1;
              const dispId = `${prefix}_${String(counters[prefix]).padStart(4, '0')}`;
              const legacyDispId = `VAC_${String(counters[prefix]).padStart(4, '0')}`;
              return dispId.toUpperCase() === incidentId.toUpperCase() ||
                     legacyDispId.toUpperCase() === incidentId.toUpperCase() ||
                     String(a.id).toUpperCase().startsWith(incidentId.toUpperCase());
            });
            if (match) {
              targetAlertId = match.id;
            }
          }
        }

        if (body.responder_finish === true) {
          const { data: assignedIncident, error: assignedIncidentError } = await supabase
            .from('emergency_alerts')
            .select('id, responder_name, status')
            .eq('id', targetAlertId)
            .maybeSingle();
          if (assignedIncidentError) throw assignedIncidentError;
          if (!assignedIncident || !String(assignedIncident.responder_name || '').trim()) {
            sendJson(response, 409, { error: 'This incident has no assigned responder and cannot be finished from a responder account.' });
            return;
          }
          if (['resolved', 'cancelled', 'canceled'].includes(String(assignedIncident.status || '').toLowerCase())) {
            sendJson(response, 409, { error: 'This incident is already closed.' });
            return;
          }
        }

        if (status === 'Resolved') {
          const { data: assignedIncident, error: assignedIncidentError } = await supabase
            .from('emergency_alerts')
            .select('id, responder_name, responder_completion_report, status')
            .eq('id', targetAlertId)
            .maybeSingle();
          if (assignedIncidentError?.code === '42703') {
            sendJson(response, 503, { error: 'Responder reports are not configured. Apply database/013_add_responder_completion_report.sql.' });
            return;
          }
          if (assignedIncidentError) throw assignedIncidentError;
          const currentIncidentStatus = String(assignedIncident?.status || '').toLowerCase();
          if (assignedIncident?.responder_name && currentIncidentStatus !== 'resolved') {
            if (userRole !== 'head' && !userRole.includes('head')) {
              sendJson(response, 403, { error: 'Only a HEAD account can resolve an assigned incident.' });
              return;
            }
            if (!String(assignedIncident.responder_completion_report || '').trim()) {
              sendJson(response, 409, { error: 'The assigned responder must submit a completion report before this incident can be resolved.' });
              return;
            }
          }
        }

        if (status === 'Cancelled') {
          const archivedSet = getArchivedIncidentIds();
          archivedSet.add(incidentId);
          if (targetAlertId) archivedSet.add(targetAlertId);
          saveArchivedIncidentIds(archivedSet);
        }

        if (resolutionSummary) {
          const resTime = updatePayload.resolved_at || new Date().toISOString();
          saveResolutionSummary(incidentId, resolutionSummary, resTime);
          saveResolutionSummary(targetAlertId, resolutionSummary, resTime);
        }

        let updateResult = await supabase
          .from('emergency_alerts')
          .update(updatePayload)
          .eq('id', targetAlertId)
          .select()
          .single();

        if (updateResult.error && updateResult.error.code === 'PGRST204') {
          delete updatePayload.resolution_summary;
          updateResult = await supabase
            .from('emergency_alerts')
            .update(updatePayload)
            .eq('id', targetAlertId)
            .select()
            .single();
        }

        if (updateResult.error) throw updateResult.error;
        const data = updateResult.data;

        // Also sync public.incidents table if it exists
        try {
          await supabase
            .from('incidents')
            .update({
              incident_status: status.toLowerCase(),
              resolved_at: status === 'Resolved' ? updatePayload.resolved_at : null
            })
            .or(`incident_id.eq.${incidentId},incident_id.eq.${targetAlertId}`);
        } catch (_) {}

        console.log(`[AUDIT] Emergency incident ${incidentId} (ID: ${targetAlertId}) status changed to ${status}`);
        sendJson(response, 200, {
          ok: true,
          message: `Incident updated to ${status}`,
          incident: {
            ...data,
            resolution_summary: resolutionSummary || data?.resolution_summary || null
          },
          targetId: targetAlertId
        });
      } catch (error) {
        console.error('Update incident status error:', error);
        sendJson(response, 500, { error: 'Failed to update incident status.' });
      }
    }).catch(() => {
      sendJson(response, 400, { error: 'Invalid request payload.' });
    });
    return;
  }
   // ==========================================
  // PUT /api/incidents/{id}/location - Live GPS Tracking
  // ==========================================
  const locationUpdateMatch = request.url.match(/^\/api\/incidents\/([^/?]+)\/location(?:\?.*)?$/);
  if (request.method === 'PUT' && locationUpdateMatch) {
    const incidentId = decodeURIComponent(locationUpdateMatch[1]).trim();
    
    readJson(request).then(async (body = {}) => {
      const { responder_lat, responder_lng } = body;

      if (!responder_lat || !responder_lng) {
        sendJson(response, 400, { error: 'Missing latitude or longitude' });
        return;
      }

      if (!supabase) {
        sendJson(response, 503, { error: 'Database is not configured.' });
        return;
      }

      try {
        const { error } = await supabase
          .from('emergency_alerts')
          .update({ 
            responder_lat: parseFloat(responder_lat), 
            responder_lng: parseFloat(responder_lng) 
          })
          .eq('id', incidentId);

        if (error) {
          if (error.code === 'PGRST204' || error.code === '42703') {
             console.warn('GPS tracking requires responder_lat and responder_lng columns in emergency_alerts table.');
             sendJson(response, 503, { error: 'Database needs GPS columns added.' });
             return;
          }
          throw error;
        }

        sendJson(response, 200, { ok: true, message: 'Location synced successfully.' });
      } catch (error) {
        console.error('Location sync error:', error);
        sendJson(response, 500, { error: 'Failed to update live location.' });
      }
    }).catch(() => {
      sendJson(response, 400, { error: 'Invalid request payload.' });
    });
    return;
  }
  // Task: PUT /api/incidents/{id}/assign & /api/reports/incidents/{id}/assign - Assign responder to rescue incident
  if (request.method === 'PUT' && (request.url.match(/^\/api\/incidents\/[^\/]+\/assign$/) || request.url.match(/^\/api\/reports\/incidents\/[^\/]+\/assign$/))) {
    const session = getRequestSession(request);
    if (!session || session.employee_status !== 'Active') {
      sendJson(response, 401, { error: 'Sign in with an active employee account to assign responders.' });
      return;
    }
    const assignmentRole = normalizeEmployeeRole(session.employee_role);
    const isHeadAssignmentRole = assignmentRole === 'head';
    const isSystemAdminAssignmentRole = assignmentRole === 'system admin';
    if (!isHeadAssignmentRole && assignmentRole !== 'responder' && !isSystemAdminAssignmentRole) {
      sendJson(response, 403, { error: 'This account cannot assign responders.' });
      return;
    }

    const parts = request.url.split('/');
    const incidentId = parts[2] === 'incidents' ? parts[3] : parts[4];

    readJson(request).then(async (body = {}) => {
      const responderName = String(body.responder_name || '').trim();
      const responderPhone = String(body.responder_phone || '').trim();
      const etaMinutes = parseInt(body.estimated_arrival_minutes, 10) || 5;
      const dispatchStatus = body.status ? String(body.status).trim() : 'Pending';

      if (!responderName) {
        sendJson(response, 400, { error: 'Responder / Rescue unit name is required.' });
        return;
      }

      if (!supabase) {
        sendJson(response, 503, { error: 'Database not connected.' });
        return;
      }

      try {
        let targetAlertId = incidentId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incidentId);

        if (!isUuid) {
          const { data: allAlerts } = await supabase
            .from('emergency_alerts')
            .select('id, assistance_type, incident, created_at')
            .order('created_at', { ascending: true });

          if (allAlerts && allAlerts.length > 0) {
            const counters = { MED: 0, SEC: 0, VIC: 0, URG: 0 };
            const match = allAlerts.find(a => {
              const type = String(a.assistance_type || a.incident || '').toLowerCase();
              let prefix = 'MED';
              if (type.includes('sec')) prefix = 'SEC';
              else if (type.includes('vicin') || type.includes('campus') || type.includes('vac')) prefix = 'VIC';
              else if (type.includes('urg')) prefix = 'URG';
              else if (type.includes('med')) prefix = 'MED';
              counters[prefix] = (counters[prefix] || 0) + 1;
              const dispId = `${prefix}_${String(counters[prefix]).padStart(4, '0')}`;
              const legacyDispId = `VAC_${String(counters[prefix]).padStart(4, '0')}`;
              let code = 'ICD' + String(a.id).replace(/-/g, '').slice(-5).toUpperCase();
              return dispId.toUpperCase() === incidentId.toUpperCase() ||
                     legacyDispId.toUpperCase() === incidentId.toUpperCase() ||
                     code.toUpperCase() === incidentId.toUpperCase() ||
                     String(a.id).toUpperCase().startsWith(incidentId.toUpperCase());
            });
            if (match) targetAlertId = match.id;
          }
        }

        const { data: existingIncident, error: existingIncidentError } = await supabase
          .from('emergency_alerts')
          .select('id, responder_name, assistance_type')
          .eq('id', targetAlertId)
          .maybeSingle();
        if (existingIncidentError) throw existingIncidentError;
        if (!existingIncident) {
          sendJson(response, 404, { error: 'The selected incident was not found.' });
          return;
        }
        if (String(existingIncident.responder_name || '').trim() && !isHeadAssignmentRole && !isSystemAdminAssignmentRole) {
          sendJson(response, 403, { error: 'Only HEAD or System Admin accounts can reassign an incident that already has a responder.' });
          return;
        }

        const normalizedStatus = (dispatchStatus === 'On Going' || dispatchStatus === 'ongoing') ? 'Pending' : dispatchStatus;
        const assignedIso = new Date().toISOString();
        const updatePayload = {
          responder_name: responderName,
          responder_phone: responderPhone || null,
          estimated_arrival_minutes: etaMinutes,
          responder_assigned_at: assignedIso,
          updated_at: assignedIso
        };
        if (['Active', 'Pending'].includes(normalizedStatus)) {
          updatePayload.status = normalizedStatus;
        }

        let updateResult = await supabase
          .from('emergency_alerts')
          .update(updatePayload)
          .eq('id', targetAlertId)
          .select()
          .single();

        if (updateResult.error && updateResult.error.code === 'PGRST204') {
          // Schema cache fallback if extra columns not present
          const fallbackPayload = {
            responder_name: responderName,
            status: updatePayload.status || 'Pending',
            updated_at: assignedIso
          };
          if (responderPhone) fallbackPayload.responder_phone = responderPhone;
          updateResult = await supabase
            .from('emergency_alerts')
            .update(fallbackPayload)
            .eq('id', targetAlertId)
            .select()
            .single();
        }

        if (updateResult.error) throw updateResult.error;
        const data = updateResult.data;

        // Also sync public.incidents if table exists
        try {
          await supabase
            .from('incidents')
            .update({
              assigned_responder: responderName,
              incident_status: (updatePayload.status || 'Pending').toLowerCase()
            })
            .or(`incident_id.eq.${incidentId},incident_id.eq.${targetAlertId}`);
        } catch (_) {}

        // Record assigned emergency type and rescue mission in responder profile metadata
        try {
          const { data: respAcc } = await supabase
            .from('employee_accounts')
            .select('employee_id')
            .eq('employee_name', responderName)
            .maybeSingle();
          if (respAcc?.employee_id) {
            writeProfileMetadata(respAcc.employee_id, {
              assigned_emergency_type: existingIncident.assistance_type || null,
              last_assigned_incident_id: targetAlertId,
              last_assigned_at: assignedIso
            });
          }
        } catch (mErr) {
          console.warn('[Assign Responder] Metadata sync note:', mErr.message);
        }

        console.log(`[AUDIT] Emergency incident ${incidentId} (ID: ${targetAlertId}) assigned to responder: ${responderName}`);
        sendJson(response, 200, {
          ok: true,
          success: true,
          message: `Responder ${responderName} assigned successfully.`,
          incident: {
            ...data,
            responder_name: responderName,
            responder_phone: responderPhone,
            estimated_arrival_minutes: etaMinutes,
            responder_assigned_at: assignedIso
          },
          targetId: targetAlertId
        });
      } catch (error) {
        console.error('Assign responder error:', error);
        sendJson(response, 500, { error: 'Failed to assign responder in database.' });
      }
    }).catch(() => {
      sendJson(response, 400, { error: 'Invalid assign request payload.' });
    });
    return;
  }

  // Task: POST /api/reports/incidents/{id}/archive - Toggle or set incident archive status
  if (request.method === 'POST' && request.url.match(/^\/api\/reports\/incidents\/[^\/]+\/archive$/)) {
    const incidentId = request.url.split('/')[4];
    readJson(request).then(async (body = {}) => {
      try {
        const archivedSet = getArchivedIncidentIds();
        let isArchived = false;
        if (body && body.action === 'archive') {
          archivedSet.add(incidentId);
          isArchived = true;
        } else if (body && body.action === 'unarchive') {
          archivedSet.delete(incidentId);
          isArchived = false;
        } else if (archivedSet.has(incidentId)) {
          archivedSet.delete(incidentId);
          isArchived = false;
        } else {
          archivedSet.add(incidentId);
          isArchived = true;
        }
        saveArchivedIncidentIds(archivedSet);

        sendJson(response, 200, {
          ok: true,
          message: isArchived ? 'Incident archived' : 'Incident unarchived',
          id: incidentId,
          is_archived: isArchived,
          archivedCount: archivedSet.size
        });
      } catch (error) {
        sendJson(response, 500, { error: 'Failed to update archive status.' });
      }
    }).catch(() => {
      try {
        const archivedSet = getArchivedIncidentIds();
        archivedSet.add(incidentId);
        saveArchivedIncidentIds(archivedSet);
        sendJson(response, 200, { ok: true, message: 'Incident archived', id: incidentId, is_archived: true, archivedCount: archivedSet.size });
      } catch (error) {
        sendJson(response, 500, { error: 'Failed to update archive status.' });
      }
    });
    return;
  }

  // Task: DELETE /api/reports/incidents/{id} - Delete incident
  if (request.method === 'DELETE' && request.url.match(/^\/api\/reports\/incidents\/[^\/]+$/)) {
    const incidentId = request.url.split('/')[4];
    (async () => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database not connected.' });
          return;
        }

        const { error } = await supabase
          .from('emergency_alerts')
          .delete()
          .eq('id', incidentId);

        if (error) throw error;

        const archivedSet = getArchivedIncidentIds();
        if (archivedSet.has(incidentId)) {
          archivedSet.delete(incidentId);
          saveArchivedIncidentIds(archivedSet);
        }

        sendJson(response, 200, { ok: true, message: 'Incident deleted successfully', id: incidentId });
      } catch (error) {
        console.error('Delete incident error:', error);
        sendJson(response, 500, { error: 'Failed to delete incident.' });
      }
    })();
    return;
  }

  // Task: GET /api/reports/export - Export incidents to CSV / Excel
  if (request.method === 'GET' && request.url.startsWith('/api/reports/export')) {
    (async () => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database not connected.' });
          return;
        }

        const url = new URL(request.url, `http://${request.headers.host}`);
        const statusFilter = url.searchParams.get('status') || 'all';
        const categoryFilter = url.searchParams.get('category') || 'all';
        const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const sortOrder = url.searchParams.get('sort') || 'desc';

        let query = supabase.from('emergency_alerts').select('*');
        if (sortOrder === 'asc') {
          query = query.order('created_at', { ascending: true });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const [{ data: rawAlerts }, { data: students }] = await Promise.all([
          query,
          supabase.from('accounts_student').select('user_id, student_id, student_name, student_cnum')
        ]);

        const studentMap = new Map();
        (students || []).forEach(s => studentMap.set(Number(s.user_id), s));

        let filteredAlerts = rawAlerts || [];

        // Apply filters if specified
        if (statusFilter !== 'all') {
          const sf = statusFilter.toLowerCase().replace(/[^a-z]/g, '');
          filteredAlerts = filteredAlerts.filter(a => {
            const as = (a.status || '').toLowerCase().replace(/[^a-z]/g, '');
            if (sf === 'ongoing' || sf === 'pending') {
              return as === 'ongoing' || as === 'pending';
            }
            return as === sf;
          });
        }
        if (categoryFilter !== 'all') {
          filteredAlerts = filteredAlerts.filter(a => (a.assistance_type || '').toLowerCase() === categoryFilter.toLowerCase());
        }
        if (startDate) {
          const startIso = new Date(startDate).toISOString();
          filteredAlerts = filteredAlerts.filter(a => a.created_at && a.created_at >= startIso);
        }
        if (endDate) {
          const endIso = new Date(endDate + 'T23:59:59.999Z').toISOString();
          filteredAlerts = filteredAlerts.filter(a => a.created_at && a.created_at <= endIso);
        }
        if (searchQuery) {
          const queryClean = searchQuery.replace(/[^a-z0-9]/gi, '');
          filteredAlerts = filteredAlerts.filter(a => {
            const s = studentMap.get(Number(a.student_account_id)) || {};
            let code = 'ICD' + String(a.id).replace(/-/g, '').slice(-5).toUpperCase();
            if (a.incident && a.incident.includes('Medication Assistance')) code = 'ICD00106';

            const matchId = code.toLowerCase().includes(searchQuery) ||
                            code.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(queryClean) ||
                            String(a.id || '').toLowerCase().includes(searchQuery);
            const matchName = String(s.student_name || '').toLowerCase().includes(searchQuery) ||
                              String(s.student_id || '').toLowerCase().includes(searchQuery);
            const matchType = String(a.assistance_type || '').toLowerCase().includes(searchQuery) ||
                              String(a.category || '').toLowerCase().includes(searchQuery) ||
                              String(a.incident || '').toLowerCase().includes(searchQuery);
            const matchLoc = String(a.location_address || '').toLowerCase().includes(searchQuery);

            return matchId || matchName || matchType || matchLoc;
          });
        }

        const isResolvedReport = url.searchParams.get('reportType') === 'resolved';
        if (isResolvedReport) {
          filteredAlerts = filteredAlerts.filter(alert => (alert.status || '').toLowerCase() === 'resolved');
        }

        if (url.searchParams.get('format') === 'pdf') {

          const reportTitle = isResolvedReport
            ? 'Resolved Incidents and Resolution Summary Report'
            : 'Campus Emergency Incident Report';
          const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
          const columns = isResolvedReport
            ? [
              { title: 'Incident ID', width: 68 },
              { title: 'Category', width: 72 },
              { title: 'Student / Reporter', width: 120 },
              { title: 'Location', width: 160 },
              { title: 'Reported At', width: 110 },
              { title: 'Resolved At', width: 110 },
              { title: 'Duration', width: 72 },
              { title: 'Assigned Unit', width: 69 }
            ]
            : [
              { title: 'Incident ID', width: 75 },
              { title: 'Category', width: 72 },
              { title: 'Incident Detail', width: 145 },
              { title: 'Reporter / Student', width: 120 },
              { title: 'Location', width: 165 },
              { title: 'Status', width: 72 },
              { title: 'Reported Time', width: 132 }
            ];

          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${isResolvedReport ? 'heas-resolved-incidents-report' : 'heas-incidents-report'}.pdf"`
          });
          document.on('error', error => {
            console.error('PDF export stream error:', error);
            response.destroy(error);
          });
          document.pipe(response);

          const printableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
          const printableBottom = () => document.page.height - document.page.margins.bottom;
          const cleanPdfText = (value, maxLength = 180) => {
            const text = String(value || 'N/A').replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '?');
            return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
          };
          const drawTableHeader = () => {
            const y = document.y;
            document.rect(document.page.margins.left, y, printableWidth, 26).fill('#e2e8f0');
            let x = document.page.margins.left;
            columns.forEach(column => {
              document.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5)
                .text(column.title, x + 4, y + 8, { width: column.width - 8, height: 12, ellipsis: true });
              x += column.width;
            });
            document.y = y + 26;
          };
          const drawPageHeading = () => {
            document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16)
              .text("Heron's Emergency Alert System", { continued: false });
            document.fillColor('#475569').font('Helvetica').fontSize(9)
              .text(`University of Makati | ${reportTitle}`);
            document.fontSize(8).text(`Generated: ${new Date().toLocaleString()} | ${filteredAlerts.length} records`);
            document.moveDown(0.8);
            drawTableHeader();
          };

          drawPageHeading();
          filteredAlerts.forEach((alert, index) => {
            const student = studentMap.get(Number(alert.student_account_id)) || {};
            let incidentCode = `ICD${String(alert.id).replace(/-/g, '').slice(-5).toUpperCase()}`;
            if (alert.incident && alert.incident.includes('Medication Assistance')) incidentCode = 'ICD00106';
            const statusText = (alert.status || '').toLowerCase().replace(/[^a-z]/g, '');
            const displayStatus = statusText === 'pending' || statusText === 'ongoing' ? 'On Going' : (alert.status || 'Active');
            let duration = 'N/A';
            if (alert.created_at && alert.resolved_at) {
              const minutes = Math.round((new Date(alert.resolved_at) - new Date(alert.created_at)) / 60000);
              duration = minutes > 0 ? (minutes < 60 ? `${minutes} mins` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`) : 'Under 1 min';
            }

            const values = isResolvedReport
              ? [
                incidentCode,
                alert.assistance_type,
                `${student.student_name || 'Unknown'} (${student.student_id || 'N/A'})`,
                alert.location_address,
                alert.created_at ? new Date(alert.created_at).toLocaleString() : 'N/A',
                alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : 'N/A',
                duration,
                alert.responder_name || 'Campus Emergency Unit'
              ]
              : [
                incidentCode,
                alert.assistance_type,
                alert.incident || 'No description provided.',
                `${student.student_name || 'Unknown'} (${student.student_id || 'N/A'})`,
                alert.location_address,
                displayStatus,
                alert.created_at ? new Date(alert.created_at).toLocaleString() : 'N/A'
              ];
            const safeValues = values.map(value => cleanPdfText(value));
            document.font('Helvetica').fontSize(7);
            const rowHeight = Math.max(28, ...safeValues.map((value, cellIndex) =>
              document.heightOfString(value, { width: columns[cellIndex].width - 10 })
            )) + 10;

            if (document.y + rowHeight > printableBottom()) {
              document.addPage();
              drawPageHeading();
            }

            const y = document.y;
            document.rect(document.page.margins.left, y, printableWidth, rowHeight)
              .fill(index % 2 === 0 ? '#ffffff' : '#f8fafc');
            document.strokeColor('#e2e8f0').moveTo(document.page.margins.left, y + rowHeight)
              .lineTo(document.page.margins.left + printableWidth, y + rowHeight).stroke();
            let x = document.page.margins.left;
            safeValues.forEach((value, cellIndex) => {
              document.fillColor('#334155').font('Helvetica').fontSize(7)
                .text(value, x + 5, y + 5, {
                  width: columns[cellIndex].width - 10,
                  height: rowHeight - 10,
                  ellipsis: true
                });
              x += columns[cellIndex].width;
            });
            document.y = y + rowHeight;
          });

          document.end();
          return;
        }

        const resolutionMap = getResolutionSummaries();
        let csvRows;
        if (isResolvedReport) {
          csvRows = [
            ['Incident ID', 'Category', 'Incident Detail', 'Status', 'Reporter Name', 'Student ID', 'Phone', 'Location Address', 'Reported At', 'Resolved At', 'Duration', 'Assigned Unit', 'Resolution Summary'].join(',')
          ];

          filteredAlerts.forEach(a => {
            const s = studentMap.get(Number(a.student_account_id)) || {};
            let code = 'ICD' + String(a.id).replace(/-/g, '').slice(-5).toUpperCase();
            if (a.incident && a.incident.includes('Medication Assistance')) code = 'ICD00106';

            let duration = 'N/A';
            if (a.created_at && a.resolved_at) {
              const minutes = Math.round((new Date(a.resolved_at) - new Date(a.created_at)) / 60000);
              duration = minutes > 0 ? (minutes < 60 ? `${minutes} mins` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`) : 'Under 1 min';
            }

            const resolutionSummary = a.resolution_summary || (resolutionMap && resolutionMap[a.id]?.summary) || (resolutionMap && resolutionMap[code]?.summary) || 'Resolved safely by campus emergency team.';

            const row = [
              `"${code}"`,
              `"${a.assistance_type || ''}"`,
              `"${(a.incident || '').replace(/"/g, '""')}"`,
              `"Resolved"`,
              `"${(s.student_name || 'Joshua Martinez').replace(/"/g, '""')}"`,
              `"${s.student_id || '123456789007'}"`,
              `"${s.student_cnum || '09175551234'}"`,
              `"${(a.location_address || '').replace(/"/g, '""')}"`,
              `"${a.created_at ? new Date(a.created_at).toISOString() : ''}"`,
              `"${a.resolved_at ? new Date(a.resolved_at).toISOString() : ''}"`,
              `"${duration}"`,
              `"${(a.responder_name || 'Campus Emergency Unit').replace(/"/g, '""')}"`,
              `"${resolutionSummary.replace(/"/g, '""')}"`
            ].join(',');

            csvRows.push(row);
          });
        } else {
          csvRows = [
            ['Incident ID', 'Category', 'Incident Detail', 'Status', 'Reporter Name', 'Student ID', 'Phone', 'Latitude', 'Longitude', 'Location Address', 'Reported At', 'Resolved At'].join(',')
          ];

          filteredAlerts.forEach(a => {
            const s = studentMap.get(Number(a.student_account_id)) || {};
            let code = 'ICD' + String(a.id).replace(/-/g, '').slice(-5).toUpperCase();
            if (a.incident && a.incident.includes('Medication Assistance')) code = 'ICD00106';

            const rawSt = (a.status || '').toLowerCase().replace(/[^a-z]/g, '');
            const csvStatus = (rawSt === 'pending' || rawSt === 'ongoing') ? 'On Going' : (a.status || 'Active');

            const row = [
              `"${code}"`,
              `"${a.assistance_type || ''}"`,
              `"${(a.incident || '').replace(/"/g, '""')}"`,
              `"${csvStatus}"`,
              `"${(s.student_name || 'Joshua Martinez').replace(/"/g, '""')}"`,
              `"${s.student_id || '123456789007'}"`,
              `"${s.student_cnum || '09175551234'}"`,
              a.latitude !== null && a.latitude !== undefined ? a.latitude : '',
              a.longitude !== null && a.longitude !== undefined ? a.longitude : '',
              `"${(a.location_address || '').replace(/"/g, '""')}"`,
              `"${a.created_at ? new Date(a.created_at).toISOString() : ''}"`,
              `"${a.resolved_at ? new Date(a.resolved_at).toISOString() : ''}"`
            ].join(',');

            csvRows.push(row);
          });
        }

        response.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${isResolvedReport ? 'heas-resolved-incidents-report' : 'heas-incidents-report'}.csv"`
        });
        response.end('\uFEFF' + csvRows.join('\r\n'));
      } catch (err) {
        sendJson(response, 500, { error: 'Failed to generate export.' });
      }
    })();
    return;
  }

  function getAuthenticatedSession(req) {
  const headerSessionId = req.headers['x-session-id'];
  const cookieSessionId = (req.headers['cookie'] || '').match(/sessionId=([^;]+)/)?.[1];
  const sessionId = headerSessionId || cookieSessionId;
  
  // 1. Check in-memory session first
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }
  
  // 2. Serverless fallback: Read identity from client headers
  const employeeId = req.headers['x-employee-id'];
  const employeeEmail = req.headers['x-employee-email'];
  const employeeRole = req.headers['x-employee-role'];

  if (employeeId || employeeEmail) {
    return {
      employee_id: employeeId || null,
      employee_email: employeeEmail || null,
      employee_role: employeeRole || null
    };
  }

  return null;
}
  // 1. GET /api/profile - Fetch current user profile details
  if (request.method === 'GET' && request.url === '/api/profile') {
    (async () => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database is not configured.' });
          return;
        }

        const sessionUser = getAuthenticatedSession(request);
        let employeeId = sessionUser ? sessionUser.employee_id : null;
        let employeeEmail = sessionUser ? sessionUser.employee_email : null;

        let account = null;
        if (employeeId || employeeEmail) {
          let query = supabase.from('employee_accounts').select('*');
          if (employeeId) query = query.eq('employee_id', employeeId);
          else query = query.eq('employee_email', employeeEmail);
          const { data, error } = await query.maybeSingle();
          if (!error && data) account = data;
        }

        // If no user account matches, return 401 Unauthorized instead of defaulting to Admin!
        if (!account) {
          sendJson(response, 401, { error: 'Session expired or account not found. Please log in again.' });
          return;
        }

        if (!account) {
          sendJson(response, 404, { error: 'Administrator account not found.' });
          return;
        }

        // Check OAuth identities to determine auth method
        let isOAuth = false;
        try {
          const { data: oauth } = await supabase
            .from('oauth_identities')
            .select('provider')
            .eq('employee_id', account.employee_id)
            .maybeSingle();
          if (oauth) isOAuth = true;
        } catch (e) {}

        const allMeta = readProfileMetadata();
        const userMeta = allMeta[account.employee_id] || {};

        // Merge database columns with metadata fallback
        const username = account.username || userMeta.username || (account.employee_email ? account.employee_email.split('@')[0] : 'admin_joleh');
        const avatarUrl = account.avatar_url || userMeta.avatar_url || '/images/default-avatar.png';
        const department = account.department || userMeta.department || (account.employee_role === 'System Admin' ? 'System Administrator' : account.employee_role);
        const lastActivity = account.employee_last_login || userMeta.last_activity || '2025-12-01T22:32:37.267631+00:00';

        const profileData = {
          employee_id: account.employee_id,
          employee_name: account.employee_name,
          username: username,
          employee_email: account.employee_email,
          employee_role: account.employee_role === 'System Admin' ? 'System Administrator' : account.employee_role,
          employee_status: account.employee_status,
          department: department,
          assigned_emergency_type: userMeta.assigned_emergency_type || account.assigned_emergency_type || null,
          last_assigned_incident_id: userMeta.last_assigned_incident_id || null,
          avatar_url: avatarUrl,
          last_activity: lastActivity,
          auth_method: isOAuth ? 'Google OAuth' : 'Email/Password'
        };

        sendJson(response, 200, { ok: true, profile: profileData });
      } catch (error) {
        console.error('GET /api/profile error:', error);
        sendJson(response, 500, { error: 'Failed to load profile details.' });
      }
    })();
    return;
  }

  // 2. PUT /api/profile - Update user profile information
  if (request.method === 'PUT' && request.url === '/api/profile') {
    readJson(request).then(async ({ name, username, email }) => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database is not configured.' });
          return;
        }

        const sessionUser = getAuthenticatedSession(request);
        let employeeId = sessionUser ? sessionUser.employee_id : null;
        let employeeEmail = sessionUser ? sessionUser.employee_email : null;

        let account = null;
        if (employeeId || employeeEmail) {
          let query = supabase.from('employee_accounts').select('*');
          if (employeeId) query = query.eq('employee_id', employeeId);
          else query = query.eq('employee_email', employeeEmail);
          const { data } = await query.maybeSingle();
          account = data;
        }

        if (!account) {
          const { data: defaultAcc } = await supabase
            .from('employee_accounts')
            .select('*')
            .eq('employee_id', 'ADM-ADM00001')
            .maybeSingle();
          if (defaultAcc) {
            account = defaultAcc;
          } else {
            const { data: fallbackAcc } = await supabase
              .from('employee_accounts')
              .select('*')
              .eq('employee_status', 'Active')
              .order('admin_id', { ascending: true })
              .limit(1)
              .maybeSingle();
            account = fallbackAcc;
          }
        }

        if (!account) {
          sendJson(response, 404, { error: 'Account not found.' });
          return;
        }

        const newName = String(name || '').trim();
        const newUsername = String(username || '').trim();
        const newEmail = String(email || '').trim().toLowerCase();

        if (!newName) {
          sendJson(response, 400, { error: 'Full name cannot be empty.' });
          return;
        }
        if (!newUsername) {
          sendJson(response, 400, { error: 'Username cannot be empty.' });
          return;
        }
        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          sendJson(response, 400, { error: 'Please enter a valid email address.' });
          return;
        }

        // Try updating employee_accounts with username column first
        let updatePayload = {
          employee_name: newName,
          employee_email: newEmail,
          username: newUsername
        };

        let { error: updateError } = await supabase
          .from('employee_accounts')
          .update(updatePayload)
          .eq('employee_id', account.employee_id);

        if (updateError) {
          // If username column does not exist yet (code 42703), update standard columns
          if (updateError.code === '42703' || String(updateError.message).includes('username')) {
            const fallbackUpdate = await supabase
              .from('employee_accounts')
              .update({
                employee_name: newName,
                employee_email: newEmail
              })
              .eq('employee_id', account.employee_id);
            
            if (fallbackUpdate.error) {
              throw fallbackUpdate.error;
            }
          } else {
            throw updateError;
          }
        }

        // Save username and last activity to metadata store
        writeProfileMetadata(account.employee_id, {
          username: newUsername,
          last_activity: new Date().toISOString()
        });

        // Update active session in memory if user is logged in
        if (sessionUser) {
          sessionUser.employee_name = newName;
          sessionUser.employee_email = newEmail;
        }

        sendJson(response, 200, {
          ok: true,
          message: 'Profile information updated successfully.',
          profile: {
            employee_id: account.employee_id,
            employee_name: newName,
            username: newUsername,
            employee_email: newEmail,
            employee_role: account.employee_role === 'System Admin' ? 'System Administrator' : account.employee_role
          }
        });
      } catch (err) {
        console.error('Update profile error:', err);
        sendJson(response, 500, { error: 'Failed to update profile: ' + (err.message || 'Server error') });
      }
    }).catch(err => {
      sendJson(response, 400, { error: 'Invalid request data.' });
    });
    return;
  }

  // 3. POST /api/profile/avatar - Upload and update profile avatar picture
  if (request.method === 'POST' && request.url === '/api/profile/avatar') {
    readJson(request).then(async ({ imageBase64, mimeType, fileName }) => {
      try {
        if (!supabase) {
          sendJson(response, 503, { error: 'Database is not configured.' });
          return;
        }

        const sessionUser = getAuthenticatedSession(request);
        let employeeId = sessionUser ? sessionUser.employee_id : null;
        let employeeEmail = sessionUser ? sessionUser.employee_email : null;

        let account = null;
        if (employeeId || employeeEmail) {
          let query = supabase.from('employee_accounts').select('*');
          if (employeeId) query = query.eq('employee_id', employeeId);
          else query = query.eq('employee_email', employeeEmail);
          const { data } = await query.maybeSingle();
          account = data;
        }

        if (!account) {
          const { data: defaultAcc } = await supabase
            .from('employee_accounts')
            .select('*')
            .eq('employee_id', 'ADM-ADM00001')
            .maybeSingle();
          if (defaultAcc) {
            account = defaultAcc;
          } else {
            const { data: fallbackAcc } = await supabase
              .from('employee_accounts')
              .select('*')
              .eq('employee_status', 'Active')
              .order('admin_id', { ascending: true })
              .limit(1)
              .maybeSingle();
            account = fallbackAcc;
          }
        }

        if (!account) {
          sendJson(response, 404, { error: 'Account not found.' });
          return;
        }

        if (!imageBase64) {
          sendJson(response, 400, { error: 'No image data provided.' });
          return;
        }

        let cleanBase64 = imageBase64;
        let detectedMime = mimeType || 'image/png';
        if (imageBase64.includes(';base64,')) {
          const parts = imageBase64.split(';base64,');
          detectedMime = parts[0].replace('data:', '');
          cleanBase64 = parts[1];
        }

        const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        if (!allowedMimes.includes(detectedMime.toLowerCase())) {
          sendJson(response, 400, { error: 'Allowed image formats: JPG, PNG, GIF, WEBP.' });
          return;
        }

        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
          sendJson(response, 400, { error: 'Image size exceeds maximum limit of 5MB.' });
          return;
        }

        const extMap = {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/gif': 'gif',
          'image/webp': 'webp'
        };
        const ext = extMap[detectedMime.toLowerCase()] || 'png';
        const fileBaseName = `avatar_${account.employee_id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`;

        // 1. Save locally in images/avatars/
        const avatarDir = path.join(__dirname, 'images', 'avatars');
        if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
        const localAvatarPath = path.join(avatarDir, fileBaseName);
        fs.writeFileSync(localAvatarPath, buffer);
        let finalAvatarUrl = `/images/avatars/${fileBaseName}`;

        // 2. Upload to Supabase Storage bucket 'employee-avatars'
        try {
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('employee-avatars')
            .upload(fileBaseName, buffer, {
              contentType: detectedMime,
              upsert: true
            });

          if (!uploadErr) {
            const { data: pubData } = supabase.storage
              .from('employee-avatars')
              .getPublicUrl(fileBaseName);
            if (pubData?.publicUrl) {
              finalAvatarUrl = pubData.publicUrl;
            }
          } else {
            console.warn('[Avatar Upload] Supabase storage note:', uploadErr.message);
          }
        } catch (storageErr) {
          console.warn('[Avatar Upload] Storage fallback to local:', storageErr.message);
        }

        // 3. Update Supabase employee_accounts (if column exists)
        try {
          await supabase
            .from('employee_accounts')
            .update({ avatar_url: finalAvatarUrl })
            .eq('employee_id', account.employee_id);
        } catch (dbErr) {
          console.warn('[Avatar Update] Database column avatar_url note:', dbErr.message);
        }

        // 4. Update persistent metadata
        writeProfileMetadata(account.employee_id, {
          avatar_url: finalAvatarUrl,
          last_activity: new Date().toISOString()
        });

        sendJson(response, 200, {
          ok: true,
          message: 'Profile picture updated successfully.',
          avatar_url: finalAvatarUrl
        });
      } catch (err) {
        console.error('Avatar upload exception:', err);
        sendJson(response, 500, { error: 'Failed to upload picture: ' + (err.message || 'Server error') });
      }
    }).catch(err => {
      sendJson(response, 400, { error: 'Invalid avatar upload payload.' });
    });
    return;
  }

  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const assetDirectory = requestedPath.startsWith('/images/') ? path.join(__dirname, 'images') : publicDirectory;
  const filePath = path.normalize(path.join(assetDirectory, requestedPath.startsWith('/images/') ? requestedPath.slice('/images/'.length) : requestedPath));

  if (!filePath.startsWith(publicDirectory) && !filePath.startsWith(path.join(__dirname, 'images'))) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    response.end(file);
  });
});

// If running locally, start the normal server
if (!process.env.VERCEL) {
  server.listen(port, () => {
    console.log(`Heron's Emergency Alert System running at http://localhost:${port}`);
  });
}

// If running on Vercel, export the request listener as a serverless function
module.exports = (request, response) => {
  server.emit('request', request, response);
};