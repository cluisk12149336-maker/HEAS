const signInButton = document.querySelector('#signInButton');
const sosButton = document.querySelector('#sosButton');
const toast = document.querySelector('#toast');
const loginOverlay = document.querySelector('#loginOverlay');
const loginForm = document.querySelector('#loginForm');
const emailInput = document.querySelector('#emailInput');
const passwordInput = document.querySelector('#passwordInput');
const loginError = document.querySelector('#loginError');
const otpStep = document.querySelector('#otpStep');
const otpInput = document.querySelector('#otpInput');
const otpError = document.querySelector('#otpError');
const resendOtp = document.querySelector('#resendOtp');
const adminLogin = document.querySelector('.admin-login');
const resetStep = document.querySelector('#resetStep');
const resetRequestForm = document.querySelector('#resetRequestForm');
const resetVerifyForm = document.querySelector('#resetVerifyForm');
const resetUpdateForm = document.querySelector('#resetUpdateForm');
const requestStep = document.querySelector('#requestStep');
const requestSuccessStep = document.querySelector('#requestSuccessStep');
const requestAccountForm = document.querySelector('#requestAccountForm');
const requestEmail = document.querySelector('#requestEmail');
const requestPassword = document.querySelector('#requestPassword');
const requestConfirmPassword = document.querySelector('#requestConfirmPassword');
const requestRole = document.querySelector('#requestRole');
const requestAccountError = document.querySelector('#requestAccountError');
const resetEmail = document.querySelector('#resetEmail');
const resetCode = document.querySelector('#resetCode');
const resetPassword = document.querySelector('#resetPassword');
const confirmPassword = document.querySelector('#confirmPassword');
const resetRequestError = document.querySelector('#resetRequestError');
const resetVerifyError = document.querySelector('#resetVerifyError');
const resetUpdateError = document.querySelector('#resetUpdateError');
const umakEmailPattern = /^[A-Za-z0-9._%+-]+@umak\.edu\.ph$/i;
let challengeId = null;
let resetId = null;
let sessionId = null;
let toastTimer;
let incidentMap;
let landingMap;
let resetSessionEmail = null;
let resendCountdownInterval = null;

function initializeLandingMap() {
  if (landingMap || typeof L === 'undefined') return;
  const landingMapElement = document.querySelector('#landingMapCanvas');
  if (!landingMapElement) return;

  // Exact geographic coordinates for University of Makati (UMak) Main Campus
  const umakCoords = [14.5628, 121.0561];
  const sosCoords = [14.5631, 121.0565]; // Within UMak campus grounds (Student Center Plaza)
  const responderCoords = [14.5620, 121.0550]; // J.P. Rizal Ext. Campus Gate Patrol Unit

  landingMap = L.map(landingMapElement, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    dragging: true
  }).setView(umakCoords, 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(landingMap);

  // 1. Prominent University of Makati (UMak) Main Campus Location Pin
  const umakPinIcon = L.divIcon({
    className: 'landing-pin',
    html: `
      <div class="landing-pin-umak" title="University of Makati Main Campus (14.5628° N, 121.0561° E)">
        <div class="umak-pin-seal">🎓</div>
        <div class="umak-pin-tag">
          <strong>University of Makati</strong>
          <small>14.5628° N, 121.0561° E</small>
        </div>
      </div>
    `,
    iconSize: [180, 36],
    iconAnchor: [90, 18],
    popupAnchor: [0, -22]
  });

  const umakMarker = L.marker(umakCoords, { icon: umakPinIcon, zIndexOffset: 500 })
    .addTo(landingMap)
    .bindPopup(`
      <div class="umak-map-popup">
        <div class="popup-head">
          <div class="popup-badge">UMak</div>
          <div>
            <h4>University of Makati</h4>
            <p>Main Campus &bull; 14.5628&deg; N, 121.0561&deg; E</p>
          </div>
        </div>
        <div class="popup-body">
          <div class="popup-info-line">📍 <span>J.P. Rizal Ext., West Rembo, Makati City</span></div>
          <div class="popup-info-line">🛡️ <span>Occupational Health and Safety Office (OHSO)</span></div>
          <div class="popup-info-line">🟢 <strong style="color:#15804c;">Campus Emergency Monitoring: 24/7 Active</strong></div>
        </div>
      </div>
    `, { className: 'landing-map-popup custom-umak-popup', minWidth: 270 });

  // 2. Sample SOS Alert Marker (Clickable with rich details)
  const sosPinIcon = L.divIcon({
    className: 'landing-pin',
    html: `
      <div class="landing-pin-sos" title="Click to view Active SOS Alert details">
        <div class="sos-wave-ring"></div>
        <div class="sos-badge-core">
          <span class="sos-icon-flash">🚨</span>
          <b>SOS ALERT</b>
        </div>
        <div class="sos-sub-name">Christine Joy R.</div>
      </div>
    `,
    iconSize: [110, 48],
    iconAnchor: [55, 24],
    popupAnchor: [0, -28]
  });

  const sosMarker = L.marker(sosCoords, { icon: sosPinIcon, zIndexOffset: 1000 })
    .addTo(landingMap)
    .bindPopup(`
      <div class="sos-map-popup-card">
        <div class="sos-popup-header">
          <div class="sos-status-tag">
            <span class="pulse-red-light"></span> ACTIVE EMERGENCY
          </div>
          <span class="sos-alert-id">#SOS-2024-00125</span>
        </div>
        <div class="sos-popup-content">
          <div class="sos-student-banner">
            <div class="student-avatar-badge">C</div>
            <div>
              <h5>Christine Joy Reyes</h5>
              <small>Student ID: <strong>2024-00125</strong> &bull; College of Technology</small>
            </div>
          </div>
          <div class="sos-details-table">
            <div class="sos-row">
              <span class="sos-lbl">Emergency:</span>
              <strong class="sos-val red-text">Immediate Medical Assistance</strong>
            </div>
            <div class="sos-row">
              <span class="sos-lbl">Location:</span>
              <span class="sos-val">UMak Student Center Plaza (2nd Flr)</span>
            </div>
            <div class="sos-row">
              <span class="sos-lbl">Coordinates:</span>
              <span class="sos-val">14.5631° N, 121.0565° E (UMak Zone)</span>
            </div>
            <div class="sos-row">
              <span class="sos-lbl">Reported:</span>
              <span class="sos-val">2 min ago &bull; 01:01:14 AM</span>
            </div>
            <div class="sos-row">
              <span class="sos-lbl">Dispatch:</span>
              <span class="sos-val green-text">Alpha Team 1 (ETA: ~45s)</span>
            </div>
            <div class="sos-row">
              <span class="sos-lbl">Guardians:</span>
              <span class="sos-val">3 Emergency Contacts Alerted</span>
            </div>
          </div>
          <div class="sos-popup-footer">
            <button type="button" class="sos-action-btn" id="popupManageBtn">Manage Incident Dispatch &rsaquo;</button>
          </div>
        </div>
      </div>
    `, { className: 'landing-map-popup custom-sos-popup', minWidth: 290 });

  // 3. Responder Unit Marker
  const responderIcon = L.divIcon({
    className: 'landing-pin',
    html: `
      <div class="landing-pin-responder" title="Responder Unit Alpha 1">
        <span class="resp-num">3</span>
        <small class="resp-lbl">Alpha 1</small>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
  });

  L.marker(responderCoords, { icon: responderIcon })
    .addTo(landingMap)
    .bindPopup(`
      <div style="padding:5px 3px;">
        <strong style="color:#15804c;display:block;font-size:13px;margin-bottom:4px;">🛡️ Alpha Team Unit 1 (Patrol)</strong>
        <span style="font-size:11.5px;color:#37474f;display:block;">Status: <strong>En Route to Student Center Plaza</strong></span>
        <span style="font-size:10.5px;color:#78909c;display:block;margin-top:4px;">Distance: 175m &bull; ETA: &lt; 1 min</span>
      </div>
    `, { className: 'landing-map-popup', minWidth: 220 });

  // 4. Campus safety boundary geofence (around UMak campus center 14.5628, 121.0561)
  L.circle(umakCoords, {
    radius: 350,
    color: '#15804c',
    fillColor: '#86efac',
    fillOpacity: 0.09,
    weight: 1.5,
    dashArray: '5, 6'
  }).addTo(landingMap);

  // Link Callout Card click to focus on the SOS Alert Marker
  const calloutCard = document.querySelector('.active-sos-callout');
  if (calloutCard) {
    calloutCard.style.cursor = 'pointer';
    calloutCard.addEventListener('click', () => {
      landingMap.setView(sosCoords, 17, { animate: true });
      sosMarker.openPopup();
      showToast('Viewing active SOS emergency details at University of Makati.');
    });
  }

  // Handle popup manage button click
  landingMap.on('popupopen', () => {
    const popupBtn = document.querySelector('#popupManageBtn');
    if (popupBtn) {
      popupBtn.addEventListener('click', () => {
        loginOverlay.hidden = false;
        document.body.classList.add('modal-open');
        emailInput.focus();
        showToast('Sign in to access real-time emergency dispatch tools.');
      });
    }
  });

  // Map Controls overlay listeners
  document.querySelectorAll('[data-landing-map]').forEach((control) => {
    control.addEventListener('click', () => {
      const action = control.dataset.landingMap;
      if (action === 'zoom-in') landingMap.zoomIn();
      if (action === 'zoom-out') landingMap.zoomOut();
      if (action === 'recenter') {
        landingMap.setView(umakCoords, 16, { animate: true });
        umakMarker.openPopup();
        showToast('Map recentered on University of Makati.');
      }
    });
  });

  window.addEventListener('resize', () => landingMap.invalidateSize());
  setTimeout(() => landingMap.invalidateSize(), 200);
}

// Initialize landing map on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLandingMap);
} else {
  initializeLandingMap();
}

function initializeIncidentMap() {
  if (incidentMap || typeof L === 'undefined') return;
  const mapElement = document.querySelector('#mapCanvas');
  if (!mapElement) return;

  const umak = [14.5628, 121.0561];
  incidentMap = L.map(mapElement, { zoomControl: false }).setView(umak, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(incidentMap);

  // Enhanced marker function with rich popups (landing page style)
  const createMarker = (position, color, label, incidentData) => {
    const icon = L.divIcon({
      className: 'incident-pin',
      html: `
        <div class="incident-marker-badge" style="--pin-color:${color}">
          <span class="pin-label">${label}</span>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -35]
    });
    
    const popupContent = `
      <div class="incident-popup-card">
        <div class="popup-header">
          <div class="status-tag" style="background:${color}20;border-left:3px solid ${color}">
            <span class="pulse-dot" style="background:${color}"></span> ${incidentData.status}
          </div>
          <span class="incident-id">#${incidentData.id}</span>
        </div>
        <div class="popup-content">
          <div class="content-header">
            <strong>${incidentData.type}</strong>
            <small>${incidentData.time}</small>
          </div>
          <div class="details-table">
            <div class="detail-row">
              <span class="label">Type:</span>
              <span class="value">${incidentData.category}</span>
            </div>
            <div class="detail-row">
              <span class="label">Location:</span>
              <span class="value">${incidentData.location}</span>
            </div>
            <div class="detail-row">
              <span class="label">Distance:</span>
              <span class="value">${incidentData.distance}</span>
            </div>
            <div class="detail-row">
              <span class="label">Team:</span>
              <span class="value" style="color:#159653;font-weight:bold;">${incidentData.team}</span>
            </div>
          </div>
          <div class="popup-action">
            <button style="padding:8px 12px;background:#27a368;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">View Details →</button>
          </div>
        </div>
      </div>
    `;
    
    L.marker(position, { icon }).addTo(incidentMap).bindPopup(popupContent, { maxWidth: 280 });
  };

  // Sample incidents with rich data
  createMarker([14.5631, 121.0565], '#ed3942', '!', {
    id: 'SOS-2024-00125',
    status: 'ACTIVE EMERGENCY',
    type: 'Medical Emergency',
    category: 'Immediate Medical Assistance',
    time: '2 min ago • 14:32:15',
    location: 'UMak Student Center Plaza (2nd Floor)',
    distance: '0m from UMAK',
    team: 'Alpha Team 1 (ETA: 45s)'
  });

  createMarker([14.5620, 121.0550], '#159653', '3', {
    id: 'RSP-2024-00245',
    status: 'EN ROUTE',
    type: 'Responder Unit',
    category: 'Alpha Team Unit 1',
    time: 'Active patrol • 14:28:00',
    location: 'J.P. Rizal Campus Gate (Patrol Unit)',
    distance: '175m from incident',
    team: 'Alpha Team 1'
  });

  createMarker([14.5615, 121.0575], '#e5ad2f', '!', {
    id: 'SOS-2024-00124',
    status: 'PENDING',
    type: 'Security Alert',
    category: 'Suspicious Activity Report',
    time: '8 min ago • 14:24:30',
    location: 'Library Building Main Entrance',
    distance: '280m from UMAK',
    team: 'Awaiting Assignment'
  });

  createMarker([14.5645, 121.0555], '#626968', '✓', {
    id: 'SOS-2024-00123',
    status: 'RESOLVED',
    type: 'Resolved Incident',
    category: 'Fire Alarm Test',
    time: '15 min ago • 14:17:00',
    location: 'Administrative Building',
    distance: '120m from UMAK',
    team: 'Bravo Team 2'
  });

  // Additional 3 incidents
  createMarker([14.5610, 121.0545], '#ff6b9d', 'i', {
    id: 'SOS-2024-00126',
    status: 'ACTIVE',
    type: 'Medical Assistance',
    category: 'Minor Injury Report',
    time: '5 min ago • 14:29:45',
    location: 'Sports Complex - Basketball Court',
    distance: '450m from UMAK',
    team: 'Beta Team 1 (ETA: 2m)'
  });

  createMarker([14.5650, 121.0570], '#9f7aea', '◆', {
    id: 'SOS-2024-00127',
    status: 'MONITORING',
    type: 'Welfare Check',
    category: 'Student Welfare Concern',
    time: '12 min ago • 14:20:30',
    location: 'Dormitory Building C',
    distance: '380m from UMAK',
    team: 'Gamma Team 3'
  });

  createMarker([14.5590, 121.0580], '#4299e1', '⚠', {
    id: 'SOS-2024-00128',
    status: 'STANDBY',
    type: 'Traffic Incident',
    category: 'Vehicle Accident Report',
    time: '18 min ago • 14:14:15',
    location: 'Campus Main Gate - Entrance Road',
    distance: '620m from UMAK',
    team: 'Response Unit 2 (Standby)'
  });

  // Campus boundary circle
  L.circle(umak, { 
    radius: 350, 
    color: '#27a368', 
    fillColor: '#6dd99a', 
    fillOpacity: 0.08, 
    weight: 2,
    dashArray: '5, 6'
  }).addTo(incidentMap).bindPopup('UMak Campus Safety Zone (350m radius)');

  // Map controls
  document.querySelectorAll('[data-map-action]').forEach((control) => {
    control.addEventListener('click', () => {
      const action = control.dataset.mapAction;
      if (action === 'zoom-in') incidentMap.zoomIn();
      if (action === 'zoom-out') incidentMap.zoomOut();
      if (action === 'locate') incidentMap.setView(umak, 15);
    });
  });
  window.addEventListener('resize', () => incidentMap.invalidateSize());
  setTimeout(() => incidentMap.invalidateSize(), 0);
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// RBAC: Filter sidebar menu items based on user role
function applyRoleBasedAccessControl(userRole) {
  const sidebarLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-roles]');
  
  sidebarLinks.forEach((link) => {
    const allowedRoles = link.getAttribute('data-roles').split(',').map(r => r.trim());
    
    if (allowedRoles.includes(userRole)) {
      link.style.display = '';  // Show
    } else {
      link.style.display = 'none';  // Hide
    }
  });
  
  console.log(`[RBAC] Applied permissions for role: ${userRole}`);
}

signInButton.addEventListener('click', () => {
  loginOverlay.hidden = false;
  document.body.classList.add('modal-open');
  emailInput.focus();
});

document.querySelector('#closeLogin').addEventListener('click', closeLogin);
loginOverlay.addEventListener('click', (event) => {
  if (event.target === loginOverlay) closeLogin();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !loginOverlay.hidden) closeLogin();
});

function closeLogin() {
  loginOverlay.hidden = true;
  document.body.classList.remove('modal-open');
  loginError.textContent = '';
  if (requestSuccessStep) requestSuccessStep.hidden = true;
}

function resetLoginState() {
  loginForm.reset();
  loginForm.querySelector('button[type="submit"]').disabled = false;
  passwordInput.type = 'password';
  document.querySelector('#passwordToggle').setAttribute('aria-label', 'Show password');
  otpInput.value = '';
  adminLogin.hidden = false;
  otpStep.hidden = true;
  resetStep.hidden = true;
  requestStep.hidden = true;
  if (requestSuccessStep) requestSuccessStep.hidden = true;
  resetRequestForm.reset();
  resetVerifyForm.reset();
  resetUpdateForm.reset();
  document.querySelectorAll('[data-password-target]').forEach((toggle) => {
    const input = document.querySelector(`#${toggle.dataset.passwordTarget}`);
    input.type = 'password';
    const label = toggle.dataset.passwordLabel || (input.id === 'resetPassword' ? 'new password' : 'confirmed password');
    toggle.setAttribute('aria-label', `Show ${label}`);
  });
  document.querySelectorAll('.password-requirements li').forEach((requirement) => requirement.classList.remove('valid'));
  resetRequestForm.querySelector('button[type="submit"]').disabled = false;
  document.querySelector('#verifyResetCodeButton').disabled = false;
  document.querySelector('#resetPasswordButton').disabled = false;
  resetVerifyForm.hidden = true;
  resetUpdateForm.hidden = true;
  resetId = null;
  resetSessionEmail = null;
  if (resendCountdownInterval) clearInterval(resendCountdownInterval);
  otpError.textContent = '';
  loginError.textContent = '';
  resetRequestError.textContent = '';
  resetVerifyError.textContent = '';
  resetUpdateError.textContent = '';
  requestAccountForm.reset();
  requestAccountError.textContent = '';
  // Hide resend section
  const resendSection = document.querySelector('.resend-section');
  if (resendSection) resendSection.hidden = false;
  const resendButton = document.querySelector('#resendResetCode');
  if (resendButton) resendButton.disabled = false;
}

const closeRequestSuccess = document.querySelector('#closeRequestSuccess');
if (closeRequestSuccess) {
  closeRequestSuccess.addEventListener('click', closeLogin);
}
const backToLoginFromSuccess = document.querySelector('#backToLoginFromSuccess');
if (backToLoginFromSuccess) {
  backToLoginFromSuccess.addEventListener('click', resetLoginState);
}

document.querySelector('#passwordToggle').addEventListener('click', (event) => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
});

document.querySelectorAll('[data-password-target]').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const input = document.querySelector(`#${toggle.dataset.passwordTarget}`);
    const isPassword = input.type === 'password';
    const label = toggle.dataset.passwordLabel || (input.id === 'resetPassword' ? 'new password' : 'confirmed password');
    input.type = isPassword ? 'text' : 'password';
    toggle.setAttribute('aria-label', isPassword ? `Hide ${label}` : `Show ${label}`);
  });
});

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!loginForm.checkValidity()) {
    loginError.textContent = 'Enter a valid email and password.';
    loginForm.reportValidity();
    return;
  }
  if (!umakEmailPattern.test(emailInput.value.trim())) {
    showToast('Use your @umak.edu.ph email address.', 'error');
    emailInput.focus();
    return;
  }
  loginError.textContent = '';
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => {
      challengeId = result.challengeId;
      document.querySelector('#otpEmail').textContent = result.email;
      adminLogin.hidden = true;
      otpStep.hidden = false;
      otpInput.focus();
      showToast('Verification code sent to your registered email.');
    })
    .catch((error) => { submitButton.disabled = false; loginError.textContent = error.message; showToast(error.message, 'error'); });
});

document.querySelector('#verifyOtp').addEventListener('click', () => {
  if (!/^\d{6}$/.test(otpInput.value)) { otpError.textContent = 'Enter the 6-digit verification code.'; showToast('Enter the 6-digit verification code.', 'error'); return; }
  fetch('/api/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, code: otpInput.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => {
      sessionId = result.sessionId;
      document.cookie = `sessionId=${result.sessionId}; path=/; max-age=1800`;
      sessionStorage.setItem('oauthUserInfo', JSON.stringify({
        name: result.name,
        email: result.email,
        role: result.role
      }));
      closeLogin();
      showToast('Verification successful. Opening your dashboard.');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 650);
    })
    .catch((error) => { otpError.textContent = error.message; showToast(error.message, 'error'); });
});

resendOtp.addEventListener('click', () => {
  resendOtp.disabled = true;
  fetch('/api/resend-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => { showToast(result.emailSent ? `A new code was sent to ${result.email}.` : 'Demo code generated. Check the server terminal.'); startResendCountdown(); })
    .catch((error) => { showToast(error.message, 'error'); resendOtp.disabled = false; });
});

function startResendCountdown() {
  let seconds = 30;
  const timer = setInterval(() => {
    seconds -= 1;
    resendOtp.textContent = `Resend available in ${seconds}s`;
    if (seconds <= 0) { clearInterval(timer); resendOtp.innerHTML = "Didn’t receive the code? <strong>Resend</strong>"; resendOtp.disabled = false; }
  }, 1000);
}

function handleResendResetCode() {
  if (!resetId) {
    showToast('Reset session not found. Please request a new password reset.', 'error');
    return;
  }

  const resendButton = document.querySelector('#resendResetCode');
  const resendStatus = document.querySelector('#resendStatus');

  // Disable button and show loading state
  resendButton.disabled = true;
  resendStatus.textContent = 'Sending...';
  resendStatus.classList.remove('error');
  resendStatus.hidden = false;

  fetch('/api/resend-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => {
      resendStatus.classList.remove('error');
      resendStatus.textContent = result.emailSent ? 'New code sent. Check your email.' : 'Code generated. Check server console.';
      resendStatus.hidden = false;
      showToast('New code sent. You can verify it now.');
      startResendResetCodeCountdown(30);
    })
    .catch((error) => {
      // Handle throttle error
      if (error.message.includes('30 seconds')) {
        resendStatus.classList.add('error');
        resendStatus.textContent = error.message;
        resendStatus.hidden = false;
        const match = error.message.match(/\d+/);
        const seconds = match ? parseInt(match[0]) : 30;
        startResendResetCodeCountdown(seconds);
      }
      // Handle session expired error
      else if (error.message.includes('Verification session expired')) {
        resendButton.disabled = false;
        resendStatus.classList.add('error');
        resendStatus.textContent = 'Reset session expired. Request a new password reset.';
        resendStatus.hidden = false;
        showToast('Session expired. Please request a new password reset.', 'error');
      }
      // Handle other errors
      else {
        resendButton.disabled = false;
        resendStatus.classList.add('error');
        resendStatus.textContent = error.message || 'Unable to resend code.';
        resendStatus.hidden = false;
        showToast(error.message, 'error');
      }
    });
}

function startResendResetCodeCountdown(seconds = 30) {
  const resendButton = document.querySelector('#resendResetCode');
  const resendStatus = document.querySelector('#resendStatus');

  resendButton.disabled = true;

  if (resendCountdownInterval) clearInterval(resendCountdownInterval);

  resendStatus.textContent = `Try again in ${seconds} second${seconds === 1 ? '' : 's'}`;
  resendStatus.hidden = false;

  resendCountdownInterval = setInterval(() => {
    seconds -= 1;
    if (seconds > 0) {
      resendStatus.textContent = `Try again in ${seconds} second${seconds === 1 ? '' : 's'}`;
    } else {
      clearInterval(resendCountdownInterval);
      resendCountdownInterval = null;
      resendStatus.hidden = true;
      resendStatus.textContent = '';
      resendButton.disabled = false;
    }
  }, 1000);
}

// Add event listener for resend button
const resendResetCodeButton = document.querySelector('#resendResetCode');
if (resendResetCodeButton) {
  resendResetCodeButton.addEventListener('click', handleResendResetCode);
}

document.querySelector('#backLogin').addEventListener('click', () => { otpStep.hidden = true; adminLogin.hidden = false; otpError.textContent = ''; });
const logoutButton = document.querySelector('#logoutButton');
if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    logoutButton.disabled = true;
    fetch('/api/logout', { method: 'POST', headers: { 'x-session-id': sessionId || '' } })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(() => {
        sessionId = null;
        challengeId = null;
        resetId = null;
        const dash = document.querySelector('#dashboard');
        if (dash) dash.hidden = true;
        document.querySelector('.hero-shell').hidden = false;
        resetLoginState();
        showToast('You have been securely logged out.');
      })
      .catch((error) => { logoutButton.disabled = false; showToast(error.message, 'error'); });
  });
}

// Task 3.2: Google login click handler
document.querySelector('#googleLogin').addEventListener('click', () => {
  window.location.href = '/api/auth/google/login';
});

// Task 3.3: OAuth callback handler
function handleGoogleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  
  if (error) {
    showToast(`Google sign-in was cancelled: ${error}`, 'error');
    // Clear URL
    window.history.replaceState({}, document.title, window.location.pathname);
    resetLoginState();
    loginOverlay.hidden = false;
    document.body.classList.add('modal-open');
    return;
  }
  
  if (!code) {
    showToast('Invalid OAuth response from Google', 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  
  // Show loading state
  const googleButton = document.querySelector('#googleLogin');
  if (googleButton) googleButton.disabled = true;
  showToast('Completing Google sign-in...');
  
  fetch('/api/auth/google/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state })
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      return data;
    })
    .then((data) => {
      sessionId = data.sessionId;
      
      // Clear URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Redirect based on account status
      if (data.status === 'pending') {
        closeLogin();
        const pendingMessage = 'Your account is pending admin approval. An administrator will review it shortly.';
        showToast(pendingMessage, 'info');
        setTimeout(() => {
          window.location.href = '/index.html?oauth_status=pending&oauth_message=' + encodeURIComponent(pendingMessage);
        }, 500);
      } else if (data.status === 'active') {
        closeLogin();
        document.cookie = `sessionId=${data.sessionId}; path=/; max-age=1800`;
        sessionStorage.setItem('oauthUserInfo', JSON.stringify({
          name: data.name,
          email: data.email,
          role: data.role
        }));
        showToast('Google sign-in successful. Opening your dashboard.');
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 650);
      } else if (data.status === 'suspended' || data.status === 'inactive') {
        closeLogin();
        showToast('Your account is currently inactive or suspended. Contact an administrator.', 'error');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 2000);
      }
    })
    .catch((error) => {
      if (googleButton) googleButton.disabled = false;
      const errorMessage = error.message || 'Google sign-in failed. Please try again or use email/password.';
      loginError.textContent = errorMessage;
      showToast(errorMessage, 'error');
      // Clear URL
      window.history.replaceState({}, document.title, window.location.pathname);
    });
}

// Check if this is an OAuth callback
if (new URLSearchParams(window.location.search).has('code')) {
  handleGoogleOAuthCallback();
}

// Handle OAuth errors and status from intermediate callback page
const params = new URLSearchParams(window.location.search);
if (params.has('oauth_error')) {
  const errorMsg = params.get('oauth_error');
  showToast(`Google sign-in failed: ${errorMsg}`, 'error');
  loginOverlay.hidden = false;
  document.body.classList.add('modal-open');
  window.history.replaceState({}, document.title, window.location.pathname);
}

if (params.has('oauth_status')) {
  const status = params.get('oauth_status');
  if (status === 'pending') {
    const pendingMessage = params.get('oauth_message') || 'Your account is pending admin approval.';
    showToast(pendingMessage, 'info');
    loginOverlay.hidden = false;
    document.body.classList.add('modal-open');
  } else if (status === 'active') {
    // Read sessionId from cookie and redirect to dashboard
    const cookieSessionId = document.cookie.split('; ').find(row => row.startsWith('sessionId='))?.split('=')[1];
    if (cookieSessionId) {
      sessionId = cookieSessionId;
      showToast('Google sign-in successful. Opening your dashboard.');
      setTimeout(() => {
        loginOverlay.hidden = true;
        document.body.classList.remove('modal-open');
        window.location.href = '/dashboard.html';
      }, 500);
    }
  } else if (status === 'inactive' || status === 'suspended') {
    showToast('Your account is currently inactive or suspended. Contact an administrator.', 'error');
    loginOverlay.hidden = false;
    document.body.classList.add('modal-open');
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}

document.querySelector('#forgotPassword').addEventListener('click', (event) => {
  event.preventDefault();
  adminLogin.hidden = true;
  otpStep.hidden = true;
  resetStep.hidden = false;
  resetEmail.value = emailInput.value;
  resetEmail.focus();
});

document.querySelector('#requestAccount').addEventListener('click', () => {
  adminLogin.hidden = true;
  otpStep.hidden = true;
  resetStep.hidden = true;
  requestStep.hidden = false;
  requestEmail.value = emailInput.value;
  document.querySelector('#requestName').focus();
});

document.querySelector('#backRequestLogin').addEventListener('click', resetLoginState);

function updateRequestPasswordRequirements() {
  const checks = {
    requestRequirementLength: requestPassword.value.length >= 16,
    requestRequirementUppercase: /[A-Z]/.test(requestPassword.value),
    requestRequirementLowercase: /[a-z]/.test(requestPassword.value),
    requestRequirementNumber: /\d/.test(requestPassword.value),
    requestRequirementSpecial: /[^A-Za-z0-9]/.test(requestPassword.value)
  };
  Object.entries(checks).forEach(([id, valid]) => document.querySelector(`#${id}`).classList.toggle('valid', valid));
  return Object.values(checks).every(Boolean);
}

requestPassword.addEventListener('input', updateRequestPasswordRequirements);

const fullNamePattern = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const requestNameInput = document.querySelector('#requestName');

requestNameInput.addEventListener('keydown', (event) => {
  const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' '];
  const isLetter = /^[A-Za-z]$/.test(event.key);
  if (!isLetter && !allowedKeys.includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    showToast('Full name must contain letters only.', 'error');
  }
});

requestNameInput.addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/[^A-Za-z\s]/g, '').replace(/\s{2,}/g, ' ').trimStart();
  requestAccountError.textContent = '';
});

requestAccountForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!requestAccountForm.checkValidity()) {
    requestAccountForm.reportValidity();
    return;
  }
  const fullName = document.querySelector('#requestName').value.trim();
  if (!fullNamePattern.test(fullName)) {
    showToast('Full name must contain letters only.', 'error');
    document.querySelector('#requestName').focus();
    return;
  }
  if (!umakEmailPattern.test(requestEmail.value.trim())) {
    requestAccountError.textContent = 'Use your @umak.edu.ph email address.';
    showToast('Use your @umak.edu.ph email address.', 'error');
    requestEmail.focus();
    return;
  }
  if (!updateRequestPasswordRequirements()) {
    requestAccountError.textContent = 'Password does not meet all requirements.';
    showToast('Password does not meet all requirements.', 'error');
    requestPassword.focus();
    return;
  }
  if (requestPassword.value !== requestConfirmPassword.value) {
    requestAccountError.textContent = 'Passwords do not match.';
    showToast('Passwords do not match.', 'error');
    requestConfirmPassword.focus();
    return;
  }
  const submitButton = requestAccountForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  requestAccountError.textContent = '';
  fetch('/api/request-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#requestName').value, email: requestEmail.value, password: requestPassword.value, role: requestRole.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => {
      submitButton.disabled = false;
      const submittedName = document.querySelector('#requestName').value.trim();
      const submittedEmail = requestEmail.value.trim().toLowerCase();
      const submittedRole = requestRole.value;

      const successNameEl = document.querySelector('#successApplicantName');
      const successEmailEl = document.querySelector('#successApplicantEmail');
      const successRoleEl = document.querySelector('#successApplicantRole');

      if (successNameEl) successNameEl.textContent = submittedName;
      if (successEmailEl) successEmailEl.textContent = submittedEmail;
      if (successRoleEl) successRoleEl.textContent = submittedRole;

      requestAccountForm.reset();
      requestAccountError.textContent = '';
      document.querySelectorAll('.request-password-checks li').forEach((req) => req.classList.remove('valid'));

      requestStep.hidden = true;
      if (requestSuccessStep) requestSuccessStep.hidden = false;

      showToast(result.message || 'Account request submitted for approval.', 'success');
    })
    .catch((error) => { submitButton.disabled = false; requestAccountError.textContent = error.message; showToast(error.message, 'error'); });
});

resetRequestForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!resetRequestForm.checkValidity()) { resetRequestForm.reportValidity(); return; }
  if (!umakEmailPattern.test(resetEmail.value.trim())) {
    resetRequestError.textContent = 'Use your @umak.edu.ph email address.';
    resetEmail.focus();
    return;
  }
  const requestButton = resetRequestForm.querySelector('button[type="submit"]');
  requestButton.disabled = true;
  resetRequestError.textContent = '';
  fetch('/api/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetEmail.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then((result) => {
      resetId = result.resetId;
      resetSessionEmail = resetEmail.value;
      document.querySelector('#resetEmailDisplay').textContent = resetSessionEmail;
      resetRequestForm.hidden = true;
      resetVerifyForm.hidden = false;
      resetCode.focus();
      showToast(result.emailSent ? 'A reset code was sent to your email.' : 'Reset code generated. Check the server terminal.');
    })
    .catch((error) => { requestButton.disabled = false; resetRequestError.textContent = error.message; showToast(error.message, 'error'); });
});

resetVerifyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!resetVerifyForm.checkValidity()) { resetVerifyForm.reportValidity(); return; }
  const verifyButton = document.querySelector('#verifyResetCodeButton');
  verifyButton.disabled = true;
  resetVerifyError.textContent = '';
  fetch('/api/verify-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId, code: resetCode.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then(() => {
      const resendSection = document.querySelector('.resend-section');
      if (resendSection) resendSection.hidden = true;
      resetVerifyForm.hidden = true;
      resetUpdateForm.hidden = false;
      resetPassword.focus();
      showToast('Code verified. Create your new password.');
    })
    .catch((error) => { verifyButton.disabled = false; resetVerifyError.textContent = error.message; showToast(error.message, 'error'); });
});

function updatePasswordRequirements() {
  const checks = {
    requirementLength: resetPassword.value.length >= 16,
    requirementUppercase: /[A-Z]/.test(resetPassword.value),
    requirementLowercase: /[a-z]/.test(resetPassword.value),
    requirementNumber: /\d/.test(resetPassword.value),
    requirementSpecial: /[^A-Za-z0-9]/.test(resetPassword.value)
  };
  Object.entries(checks).forEach(([id, valid]) => document.querySelector(`#${id}`).classList.toggle('valid', valid));
  return Object.values(checks).every(Boolean);
}

resetPassword.addEventListener('input', updatePasswordRequirements);

resetUpdateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!resetUpdateForm.checkValidity()) { resetUpdateForm.reportValidity(); return; }
  if (!updatePasswordRequirements()) { resetUpdateError.textContent = 'Password does not meet all requirements.'; showToast('Password does not meet all requirements.', 'error'); return; }
  if (resetPassword.value !== confirmPassword.value) { resetUpdateError.textContent = 'Passwords do not match.'; showToast('Passwords do not match.', 'error'); return; }
  const updateButton = document.querySelector('#resetPasswordButton');
  updateButton.disabled = true;
  resetUpdateError.textContent = '';
  fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetId, newPassword: resetPassword.value }) })
    .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
    .then(() => {
      resetLoginState();
      showToast('Password updated. You can now sign in.');
    })
    .catch((error) => { updateButton.disabled = false; resetUpdateError.textContent = error.message; showToast(error.message, 'error'); });
});
document.querySelector('#cancelReset').addEventListener('click', resetLoginState);

if (sosButton) {
  sosButton.addEventListener('click', () => {
    sosButton.classList.add('active');
    showToast('SOS demo activated. Campus safety has been notified.');
    setTimeout(() => sosButton.classList.remove('active'), 1300);
  });
}

const alertScreenMockup = document.querySelector('.alert-screen');
if (alertScreenMockup) {
  alertScreenMockup.style.cursor = 'pointer';
  alertScreenMockup.addEventListener('click', () => {
    showToast('Heron\'s Emergency Alert System mobile app demo.');
  });
}

// Interactive triggers for landing sections
const oversightViewMap = document.querySelector('#oversightViewMap');
if (oversightViewMap) {
  oversightViewMap.addEventListener('click', () => {
    loginOverlay.hidden = false;
    document.body.classList.add('modal-open');
    emailInput.focus();
    showToast('Sign in with your credentials to access the live incident map.');
  });
}

const viewAllAlertsLink = document.querySelector('#viewAllAlertsLink');
if (viewAllAlertsLink) {
  viewAllAlertsLink.addEventListener('click', (event) => {
    event.preventDefault();
    loginOverlay.hidden = false;
    document.body.classList.add('modal-open');
    emailInput.focus();
    showToast('Sign in to view the complete alert & response queue.');
  });
}

document.querySelectorAll('.map-pin').forEach((pin) => {
  pin.addEventListener('click', () => {
    const label = pin.getAttribute('title') || 'Campus Location';
    showToast(`Pin selected: ${label}.`);
  });
});

document.querySelectorAll('.alert-card').forEach((card) => {
  card.addEventListener('click', () => {
    const alertName = card.querySelector('.alert-name')?.textContent || 'Incident Alert';
    showToast(`${alertName} selected. Sign in for full incident dispatch.`);
  });
});

