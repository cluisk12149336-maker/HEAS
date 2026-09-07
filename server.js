const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const port = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, 'public');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};
const pendingLogins = new Map();
const passwordResets = new Map();
const sessions = new Map();
const failedLoginAttempts = new Map();
const oauth_sessions = new Map();
const maxLoginAttempts = 3;
const umakEmailPattern = /^[A-Za-z0-9._%+-]+@umak\.edu\.ph$/i;

// Google OAuth Configuration (Task 1.1)
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
let GOOGLE_OAUTH_CALLBACK_URL = process.env.NODE_ENV === 'production'
  ? (process.env.GOOGLE_OAUTH_CALLBACK_URL_PROD || 'https://heas-website-sos.onrender.com/api/auth/google/callback')
  : (process.env.GOOGLE_OAUTH_CALLBACK_URL_DEV || 'http://localhost:3000/api/auth/google/callback');
let GOOGLE_OAUTH_ENABLED = !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_CALLBACK_URL);

if (!GOOGLE_OAUTH_ENABLED) {
  console.warn('[OAuth] Missing Google OAuth credentials. OAuth login disabled.');
}
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;
const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS.replace(/\s/g, '') } })
  : null;

async function deliverOtp(email, otp, subject = "Your Heron's Emergency Alert System verification code") {
  if (!mailer) {
    console.log(`[OTP demo] ${email}: ${otp} (expires in 5 minutes)`);
    return false;
  }

  const safeOtp = String(otp || '').trim();
  const info = await mailer.sendMail({
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
  console.log(`[OTP email sent] ${email} (messageId: ${info.messageId})`);
  return true;
}

async function deliverAccountConfirmation(email, employeeId, employeeName, employeeRole, employeeStatus) {
  if (!mailer) {
    console.log(`[Account confirmation demo] ${email} (ID: ${employeeId}, Role: ${employeeRole}, Status: ${employeeStatus})`);
    return false;
  }

  const info = await mailer.sendMail({
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
  console.log(`[Account confirmation email sent] ${email} (Employee ID: ${employeeId}, messageId: ${info.messageId})`);
  return true;
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

// Task 1.2: Domain Validator
function validateEmailDomain(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const pattern = /^[a-z0-9._%+-]+@umak\.edu\.ph$/i;
  return pattern.test(normalizedEmail);
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
  if (!mailer) {
    console.log(`[Admin notification demo] New OAuth account pending approval: ${userEmail} (${employeeId})`);
    return false;
  }
  
  const info = await mailer.sendMail({
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
  
  console.log(`[Admin notification email sent] for ${userEmail} (messageId: ${info.messageId})`);
  return true;
}

// Helper: Send account approval email
async function deliverApprovalNotification(userEmail, userName) {
  if (!mailer) {
    console.log(`[Approval notification demo] Account approved for ${userEmail}`);
    return false;
  }
  
  const info = await mailer.sendMail({
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
  
  console.log(`[Approval notification email sent] to ${userEmail} (messageId: ${info.messageId})`);
  return true;
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
        .select('employee_email, employee_pass, employee_name, employee_role, employee_status')
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
      sendJson(response, 200, { challengeId, email: account.employee_email, expiresIn: 300, emailSent: Boolean(mailer) });
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
      sendJson(response, 200, { email: challenge.account.employee_email, emailSent: Boolean(mailer), expiresIn: 300 });
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

      sendJson(response, 200, { email: reset.email, emailSent: Boolean(mailer), expiresIn: 300 });
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
    readJson(request).then(({ challengeId, code }) => {
      const challenge = pendingLogins.get(challengeId);
      const normalizedCode = String(code || '').replace(/\D/g, '');
      if (!challenge || challenge.expires < Date.now() || challenge.otp !== normalizedCode) {
        sendJson(response, 401, { error: 'Incorrect or expired verification code.' });
        return;
      }
      pendingLogins.delete(challengeId);
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
      sendJson(response, 200, { sessionId, name: challenge.account.employee_name, role: challenge.account.employee_role });
    }).catch(() => sendJson(response, 400, { error: 'Invalid request.' }));
    return;
  }

  if (request.method === 'POST' && request.url === '/api/logout') {
    const sessionId = request.headers['x-session-id'];
    if (sessionId) sessions.delete(sessionId);
    sendJson(response, 200, { ok: true });
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

  // Task 1.11: GET /api/admin/pending-accounts - List pending accounts
  if (request.method === 'GET' && request.url.startsWith('/api/admin/pending-accounts')) {
    const sessionId = request.headers['x-session-id'];
    const session = sessions.get(sessionId);
    
    if (!session || session.employee_status !== 'Active') {
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
    const sessionId = request.headers['x-session-id'];
    const session = sessions.get(sessionId);
    
    if (!session || session.employee_status !== 'Active') {
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
        }
        
        // Log audit event
        console.log('[AUDIT] Account status changed:', {
          employee_id: employeeId,
          old_status: account.employee_status,
          new_status: status,
          changed_by: session.employee_email,
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

server.listen(port, () => {
  console.log(`Heron's Emergency Alert System running at http://localhost:${port}`);
});
