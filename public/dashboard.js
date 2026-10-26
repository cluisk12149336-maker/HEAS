/* =========================================================
   HERON'S EMERGENCY ALERT SYSTEM - ADMINISTRATOR DASHBOARD
   Script: dashboard.js
   ========================================================= */

let incidentMap = null;
let liveIncidentMap = null;
let alertDetailMap = null;
let overviewMapMarkers = [];
let liveMapMarkers = [];
let toastTimer = null;
let currentSessionUserName = 'Administrator';
let currentSessionUserRole = 'System Administrator';
let currentUserProfile = null;

function getCurrentUserRole() {
  if (currentUserProfile && currentUserProfile.employee_role) {
    return String(currentUserProfile.employee_role).trim();
  }
  try {
    const userInfoStr = sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('oauthUserInfo');
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      if (userInfo.role) return String(userInfo.role).trim();
    }
  } catch (_) { }
  return String(currentSessionUserRole || 'System Administrator').trim();
}

function getCurrentUserName() {
  if (currentUserProfile && (currentUserProfile.employee_name || currentUserProfile.employee_username)) {
    return String(currentUserProfile.employee_name || currentUserProfile.employee_username).trim();
  }
  try {
    const userInfoStr = sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('oauthUserInfo');
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      if (userInfo.name) return String(userInfo.name).trim();
    }
  } catch (_) { }
  return String(currentSessionUserName || 'Administrator').trim();
}

function isSystemAdminRole(role) {
  const activeRole = role || getCurrentUserRole();
  const cleanRole = String(activeRole || '').trim().toLowerCase();
  return cleanRole === 'admin' || (cleanRole.includes('system') && cleanRole.includes('admin'));
}

function canResolveOrCancelIncidents(role) {
  return isHeadRole(role) || isSystemAdminRole(role);
}

window.isSystemAdminRole = isSystemAdminRole;
window.canResolveOrCancelIncidents = canResolveOrCancelIncidents;

function getCurrentUserEmail() {
  if (currentUserProfile && currentUserProfile.employee_email) {
    return String(currentUserProfile.employee_email).trim();
  }
  try {
    const userInfoStr = sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('oauthUserInfo');
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      if (userInfo.email) return String(userInfo.email).trim();
    }
  } catch (_) { }
  return '';
}

function getCurrentUserEmployeeId() {
  if (currentUserProfile && currentUserProfile.employee_id) {
    return String(currentUserProfile.employee_id).trim();
  }
  try {
    const userInfoStr = sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('oauthUserInfo');
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      if (userInfo.employee_id || userInfo.id) return String(userInfo.employee_id || userInfo.id).trim();
    }
  } catch (_) { }
  return '';
}

function isResponderRole(role) {
  const activeRole = role || getCurrentUserRole();
  return String(activeRole || '').trim().toLowerCase().includes('responder');
}

function isHeadRole(role) {
  const activeRole = role || getCurrentUserRole();
  return String(activeRole || '').trim().toLowerCase().includes('head');
}

function isTrainerRole(role) {
  const activeRole = role || getCurrentUserRole();
  return String(activeRole || '').trim().toLowerCase().includes('trainer');
}

function isIncidentAssignedToCurrentResponder(incident) {
  if (!incident) return false;
  const assigned = String(incident.responder_name || '').trim().toLowerCase();
  if (!assigned) return false;

  const currentName = getCurrentUserName().trim().toLowerCase();
  const currentEmail = getCurrentUserEmail().trim().toLowerCase();
  const currentEmpId = getCurrentUserEmployeeId().trim().toLowerCase();
  const currentUsername = (currentUserProfile?.username || '').trim().toLowerCase();

  // 1. Direct name match or substring match
  if (currentName && currentName !== 'administrator' && currentName !== 'system administrator') {
    if (assigned === currentName || assigned.includes(currentName) || currentName.includes(assigned)) {
      return true;
    }
    const nameParts = currentName.split(/\s+/).filter(p => p.length >= 3);
    for (const part of nameParts) {
      if (assigned.includes(part)) return true;
    }
  }

  // 2. Email username match
  if (currentEmail) {
    const prefix = currentEmail.split('@')[0].toLowerCase();
    if (prefix && (assigned.includes(prefix) || prefix.includes(assigned))) {
      return true;
    }
  }

  // 3. Employee ID match
  if (currentEmpId && assigned.includes(currentEmpId)) {
    return true;
  }

  // 4. Username match
  if (currentUsername && currentUsername !== 'admin_joleh' && assigned.includes(currentUsername)) {
    return true;
  }

  return false;
}

function getResponderAssignedEmergencyTypes(allIncidents) {
  const list = allIncidents || currentEmergencyIncidents || [];
  const assignedIncidents = list.filter(i => isIncidentAssignedToCurrentResponder(i));
  const types = new Set();
  assignedIncidents.forEach(i => {
    const t = (i.assistance_type || '').trim();
    if (t) types.add(t);
  });

  // Check profile metadata or department (e.g. Medical, Security, Campus Vicinity, Urgent)
  if (currentUserProfile && currentUserProfile.assigned_emergency_type) {
    types.add(currentUserProfile.assigned_emergency_type);
  }
  if (currentUserProfile && currentUserProfile.department) {
    const dept = currentUserProfile.department.toLowerCase();
    if (dept.includes('medic') || dept.includes('nurse') || dept.includes('clinic')) types.add('Medical');
    if (dept.includes('secur') || dept.includes('patrol') || dept.includes('guard')) types.add('Security');
    if (dept.includes('vicin') || dept.includes('campus')) types.add('Campus Vicinity');
    if (dept.includes('urg') || dept.includes('fire') || dept.includes('rescue')) types.add('Urgent');
  }

  return Array.from(types);
}

function renderResponderRescueNotifications(incidents) {
  const incContainer = document.getElementById('responderRescueNotificationContainer');
  const scopeBanner = document.getElementById('responderScopeBanner');
  const overviewBanner = document.getElementById('overviewResponderRescueBanner');
  const incidentFilters = document.getElementById('incidentFilterTags');
  const incidentDirectoryPanel = document.getElementById('incidentDirectoryPanel');
  const role = getCurrentUserRole();
  const isResponder = isResponderRole(role);

  if (!isResponder) {
    if (incContainer) incContainer.style.display = 'none';
    if (scopeBanner) scopeBanner.style.display = 'none';
    if (overviewBanner) overviewBanner.style.display = 'none';
    if (incidentFilters) incidentFilters.style.display = '';
    if (incidentDirectoryPanel) incidentDirectoryPanel.style.display = '';
    return;
  }

  if (scopeBanner) scopeBanner.style.display = 'none';
  if (incidentFilters) incidentFilters.style.display = 'none';
  if (incidentDirectoryPanel) incidentDirectoryPanel.style.display = 'none';

  const list = incidents || currentEmergencyIncidents || [];
  const assignedTypes = getResponderAssignedEmergencyTypes(list);
  const assignedRescues = list.filter(i => isIncidentAssignedToCurrentResponder(i));
  const activeRescues = assignedRescues.filter(i => {
    const s = (i.status || '').toLowerCase().trim();
    const hasCompletionReport = Boolean(String(i.responder_completion_report || '').trim());
    return !hasCompletionReport && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';
  });

  // Render assigned rescue notifications in the Incidents view.
  if (incContainer) {
    if (activeRescues.length > 0) {
      incContainer.style.display = 'block';
      incContainer.innerHTML = activeRescues.map(rescue => {
        const student = rescue.accounts_student || {};
        const studentName = student.student_name || rescue.student_name || rescue.student?.name || 'UMak Student';
        const studentId = student.student_id || (student.user_id ? String(student.user_id) : 'UMak Student ID');
        const studentPhone = student.student_cnum || student.contact || 'Direct student radio / phone';
        const studentCollege = student.student_college || 'University Community';
        const studentYear = student.student_yearlvl ? `(${student.student_yearlvl})` : '';
        const assistanceType = rescue.assistance_type || 'Emergency';
        const location = rescue.location_address || 'University of Makati Campus';
        const eta = rescue.estimated_arrival_minutes || 5;
        const incidentDesc = rescue.incident || 'Immediate emergency assistance required';

        return `
          <div class="responder-rescue-card" role="alert" aria-live="assertive">
            <div class="rescue-card-header">
              <div class="rescue-card-badge">
                <span class="beacon-pulse"></span>
                <span>🚨 RESCUE MISSION DISPATCHED BY HEAD COMMAND</span>
              </div>
              <span class="rescue-card-assigned-by">
                <iconify-icon icon="solar:user-speak-bold-duotone" width="16" height="16"></iconify-icon>
                Assigned by Head of Emergency Operations
              </span>
            </div>
            <div class="rescue-card-body">
              <h3 class="rescue-student-title">
                Action Required: Rescue Student <u>${escapeHtml(studentName)}</u>
              </h3>
              <p class="rescue-mission-desc">
                Head Command has dispatched your unit to rescue student <strong>${escapeHtml(studentName)}</strong> ${escapeHtml(studentYear)} from <strong>${escapeHtml(studentCollege)}</strong> for <strong>${escapeHtml(assistanceType)}: ${escapeHtml(incidentDesc)}</strong>. Proceed immediately to the designated location.
              </p>
              <div class="rescue-meta-chips">
                <span class="rescue-chip">
                  <iconify-icon icon="solar:user-bold" width="14" height="14" style="color:#0284c7;"></iconify-icon>
                  Student: <strong>${escapeHtml(studentName)}</strong>
                </span>
                <span class="rescue-chip">
                  <iconify-icon icon="solar:card-2-bold" width="14" height="14" style="color:#64748b;"></iconify-icon>
                  ID: <strong>${escapeHtml(studentId)}</strong>
                </span>
                <span class="rescue-chip">
                  <iconify-icon icon="solar:phone-calling-bold" width="14" height="14" style="color:#16a34a;"></iconify-icon>
                  Contact: <strong>${escapeHtml(studentPhone)}</strong>
                </span>
                <span class="rescue-chip location-chip">
                  <iconify-icon icon="solar:map-point-wave-bold" width="14" height="14"></iconify-icon>
                  Location: <strong>${escapeHtml(location)}</strong>
                </span>
                <span class="rescue-chip type-chip">
                  <iconify-icon icon="solar:danger-triangle-bold" width="14" height="14"></iconify-icon>
                  Type: <strong>${escapeHtml(assistanceType)}</strong>
                </span>
                <span class="rescue-chip status-ongoing">
                  <iconify-icon icon="solar:clock-circle-bold" width="14" height="14"></iconify-icon>
                  ETA: <strong>~${escapeHtml(String(eta))} mins (On Going)</strong>
                </span>
              </div>
              <div class="rescue-card-actions">
                <button type="button" class="btn-rescue-action btn-rescue-details" onclick="openIncidentDetails('${escapeHtml(rescue.id)}');">
                  <iconify-icon icon="solar:eye-bold" width="16" height="16"></iconify-icon>
                  <span>Proceed to Rescue &bull; View Incident Details</span>
                </button>
                <button type="button" class="btn-rescue-action btn-rescue-chat" onclick="openAlertChat('${escapeHtml(rescue.id)}');">
                  <iconify-icon icon="solar:chat-round-dots-bold" width="16" height="16"></iconify-icon>
                  <span>Contact Student &bull; Emergency Chat</span>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      if (assignedTypes.length > 0) {
        incContainer.style.display = 'block';
        incContainer.innerHTML = `
          <div class="responder-standby-banner">
            <iconify-icon icon="solar:shield-check-bold" width="20" height="20" style="color:#16a34a;"></iconify-icon>
            <div>
              <strong>Responder Unit Standby:</strong> You are ready for <strong>${escapeHtml(assignedTypes.join(', '))}</strong> emergencies. You have no pending rescue missions assigned right now. You will be notified immediately when Head Command assigns a new rescue mission.
            </div>
          </div>
        `;
      } else {
        incContainer.style.display = 'none';
      }
    }
  }

  // 3. Render Overview Dashboard Top Rescue Banner
  if (overviewBanner) {
    if (activeRescues.length > 0) {
      const topRescue = activeRescues[0];
      const student = topRescue.accounts_student || {};
      const studentName = student.student_name || topRescue.student_name || 'UMak Student';
      const assistanceType = topRescue.assistance_type || 'Emergency';
      const location = topRescue.location_address || 'University of Makati Campus';

      overviewBanner.style.display = 'flex';
      overviewBanner.innerHTML = `
        <div class="overview-rescue-content">
          <div class="overview-rescue-icon-wrap">
            <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
            <span class="beacon-pulse"></span>
          </div>
          <div class="overview-rescue-text">
            <h4>
              <span>🚨 ACTIVE RESCUE ASSIGNMENT</span>
              <span style="font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:9999px;">Assigned by Head Command</span>
            </h4>
            <p>
              You have been dispatched to rescue student <strong>${escapeHtml(studentName)}</strong> (${escapeHtml(assistanceType)}) at <strong>${escapeHtml(location)}</strong>.
            </p>
          </div>
        </div>
        <a class="btn-overview-rescue-action" href="#incidents" onclick="navigateToIncidentsView('active_ongoing'); return false;">
          <span>Go to Rescue Mission</span>
          <iconify-icon icon="solar:arrow-right-linear" width="15" height="15"></iconify-icon>
        </a>
      `;
    } else {
      overviewBanner.style.display = 'none';
    }
  }
}

window.getCurrentUserEmail = getCurrentUserEmail;
window.getCurrentUserEmployeeId = getCurrentUserEmployeeId;
window.isResponderRole = isResponderRole;
window.isHeadRole = isHeadRole;
window.isTrainerRole = isTrainerRole;
window.isIncidentAssignedToCurrentResponder = isIncidentAssignedToCurrentResponder;
window.getResponderAssignedEmergencyTypes = getResponderAssignedEmergencyTypes;
window.renderResponderRescueNotifications = renderResponderRescueNotifications;

const incidentIdCounters = {
  medical: 0,
  security: 0,
  urgent: 0,
  vicinity: 0
};

function generateIncidentId(category) {
  const prefixMap = {
    medical: 'MED',
    security: 'SEC',
    urgent: 'URG',
    vicinity: 'CAMP'
  };

  const normalizedCategory = prefixMap[category] ? category : 'medical';
  incidentIdCounters[normalizedCategory] += 1;

  return `${prefixMap[normalizedCategory]}_${String(incidentIdCounters[normalizedCategory]).padStart(5, '0')}`;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initUserSession();
  initNavigation();
  initIncidentMap();
  initLiveIncidentMap();
  initAlertFilters();
  initAlertDetails();
  initIncidentDetails();
  initIncidentFilters();
  initUserSearch();
  initUserFilterTags();
  initStudentUserSearch();
  initStudentFilterTags();
  initTeamsModule();
  initLogout();
  initMetricCardSpotlights();
  initProfileModule();
  initReportsModule();
  initAuditModule();
  handleHashRouting();
  loadDashboardData();
  loadSavedAvatar();
  setInterval(loadDashboardData, 30000); // Synchronize with Supabase every 30 seconds
});

// 1. Session and RBAC Setup
function initUserSession() {
  const userInfoStr = sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('oauthUserInfo');
  let userName = 'Administrator';
  let userRole = 'System Administrator';

  if (userInfoStr) {
    try {
      const userInfo = JSON.parse(userInfoStr);
      if (userInfo.name) userName = userInfo.name;
      if (userInfo.role) userRole = userInfo.role;
    } catch (e) {
      console.warn('Could not parse user session:', e);
    }
  }

  currentSessionUserName = userName;
  currentSessionUserRole = userRole;

  const nameEl = document.querySelector('#dashboardName');
  const roleEl = document.querySelector('#dashboardRole');

  if (nameEl) nameEl.textContent = userName;
  if (roleEl) roleEl.textContent = `${userRole}`;
  const incidentDirectoryPanel = document.getElementById('incidentDirectoryPanel');
  if (incidentDirectoryPanel) incidentDirectoryPanel.style.display = isResponderRole(userRole) ? 'none' : '';

  // Top-right Account / Profile Menu Click & Keyboard Accessibility
  const userMenuBtn = document.getElementById('headerUserMenu') || document.querySelector('.user-menu');
  if (userMenuBtn) {
    userMenuBtn.style.cursor = 'pointer';
    userMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('profile');
      window.location.hash = '#profile';
    });
    userMenuBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchView('profile');
        window.location.hash = '#profile';
      }
    });
  }

  applyRoleBasedAccessControl(userRole);
}

function applyRoleBasedAccessControl(userRole) {
  const activeRole = userRole || getCurrentUserRole();
  if (window.GlobalNavigation && typeof window.GlobalNavigation.filterByRole === 'function') {
    window.GlobalNavigation.filterByRole(activeRole);
  }
  if (typeof updateAlertChatAccess === 'function') {
    updateAlertChatAccess();
  } else if (typeof window.updateAlertChatAccess === 'function') {
    window.updateAlertChatAccess();
  }
  const isSysAdmin = isSystemAdminRole(activeRole);
  const isResponder = isResponderRole(activeRole);
  const isTrainer = isTrainerRole(activeRole);

  // 1. Hide the entire Admin Users Panel for Responders and Trainers
  const usersPanel = document.getElementById('usersPanel');
  if (usersPanel) {
    usersPanel.style.display = (isResponder || isTrainer) ? 'none' : '';
  }

  if (isResponder) {
    document.body.classList.add('responder-mode');
  } else {
    document.body.classList.remove('responder-mode');
  }

  if (isTrainer) {
    document.body.classList.add('trainer-mode');
  } else {
    document.body.classList.remove('trainer-mode');
  }

  // 2. Hide the Top Metric Card for "Admin Users"
  const adminMetricCard = document.getElementById('dashboardAdminMetricCard') || document.getElementById('metricAdminUsers');
  if (adminMetricCard) {
    const parentCard = adminMetricCard.closest('article') || adminMetricCard.closest('.metric-card');
    if (parentCard) {
      parentCard.style.display = (isResponder || isTrainer) ? 'none' : '';
    }
  }
  const incidentsRoleBadge = document.getElementById('incidentsRoleBadge');
  if (incidentsRoleBadge) {
    incidentsRoleBadge.style.display = isSysAdmin ? 'inline-block' : 'none';
  }

  // 3. Hide Training Center management buttons for Trainer accounts
  const btnCreateCourse = document.getElementById('btnCreateCourse');
  const btnEditCourse = document.getElementById('btnEditCourse');
  const btnDeleteCourse = document.getElementById('btnDeleteCourse');
  const btnAddSchedule = document.getElementById('btnAddSchedule');
  const courseManagementActions = document.querySelector('.tc-course-management-actions');
  if (btnCreateCourse) btnCreateCourse.style.display = isTrainer ? 'none' : '';
  if (btnEditCourse) btnEditCourse.style.display = isTrainer ? 'none' : '';
  if (btnDeleteCourse) btnDeleteCourse.style.display = isTrainer ? 'none' : '';
  if (courseManagementActions) courseManagementActions.style.display = isTrainer ? 'none' : '';
  if (btnAddSchedule) btnAddSchedule.style.display = !isTrainer && activeTrainingCourse ? '' : 'none';

  const sidebarLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-roles], dashboard-navigation nav a[data-roles]');
  sidebarLinks.forEach((link) => {
    const view = link.getAttribute('data-view') || link.getAttribute('id');
    if (isTrainer) {
      if (['overview', 'training', 'profile'].includes(view)) {
        link.style.display = '';
      } else {
        link.style.display = 'none';
      }
      return;
    }
    const rolesAttr = link.getAttribute('data-roles') || '';
    const allowedRoles = rolesAttr.split(',').map((r) => r.trim().toLowerCase());
    const allowed = allowedRoles.some((allowedRole) => {
      if (allowedRole === 'head') return isHeadRole(activeRole);
      if (allowedRole === 'responder') return isResponderRole(activeRole);
      if (allowedRole === 'trainer') return isTrainerRole(activeRole);
      return allowedRole === String(activeRole || '').trim().toLowerCase();
    });
    if (isSysAdmin || allowed) {
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
  });

  // Re-render incidents table, rescue notifications, and counts for the active role
  if (typeof renderFullIncidentsTable === 'function' && Array.isArray(currentEmergencyIncidents) && currentEmergencyIncidents.length > 0) {
    renderFullIncidentsTable();
  }
  if (typeof renderResponderRescueNotifications === 'function') {
    renderResponderRescueNotifications();
  }
  if (typeof updateIncidentFilterCounts === 'function') {
    updateIncidentFilterCounts();
  }
  if (typeof activeTrainingCourse !== 'undefined' && activeTrainingCourse && typeof loadCourseBookings === 'function') {
    loadCourseBookings(activeTrainingCourse.id);
  }
}

// 2. Navigation & Page Switching
function initNavigation() {
  const currentRole = getCurrentUserRole();
  if (window.GlobalNavigation) {
    const sidebar = document.querySelector('#dashboardSidebar, .dashboard-sidebar');
    if (sidebar) {
      window.GlobalNavigation.mount(sidebar, { active: 'overview', role: currentRole });
    }
  } else {
    // Fallback if GlobalNavigation is not loaded
    const navLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-view], dashboard-navigation nav a[data-view]');
    navLinks.forEach((link) => {
      if (link.dataset.navClickBound) return;
      link.dataset.navClickBound = 'true';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const targetView = link.getAttribute('data-view');
        switchView(targetView);
        window.location.hash = link.getAttribute('href');
      });
    });
  }

  // Dashboard brand logo/title click -> returns to dashboard overview
  const brandLink = document.querySelector('.dashboard-brand');
  if (brandLink && !brandLink.dataset.brandNavBound) {
    brandLink.dataset.brandNavBound = 'true';
    brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('overview');
      window.location.hash = '#dashboard';
    });
  }

  window.removeEventListener('hashchange', handleHashRouting);
  window.addEventListener('hashchange', handleHashRouting);
}

function switchView(viewName) {
  if (!viewName) viewName = 'overview';

  // Prevent Responder accounts from accessing the Teams module
  const currentRole = getCurrentUserRole();
  if (viewName === 'teams' && isResponderRole(currentRole)) {
    if (typeof showToast === 'function') {
      showToast('Access restricted: Teams module is not available for Responder accounts.', 'warning');
    }
    viewName = 'overview';
    window.location.hash = '#dashboard';
  }

  // Prevent Trainer accounts from accessing modules other than Dashboard, Training Center, and Account Profile
  if (isTrainerRole(currentRole) && !['overview', 'training', 'profile'].includes(viewName)) {
    if (typeof showToast === 'function') {
      showToast('Access restricted: Only Dashboard, Training Center, and Account Profile are available for Trainer accounts.', 'warning');
    }
    viewName = 'overview';
    window.location.hash = '#dashboard';
  }
  if (viewName === 'training') {
    try {
      if (typeof loadTrainingCenterData === 'function') {
        loadTrainingCenterData();
      } else {
        console.warn('loadTrainingCenterData is not defined yet.');
      }
    } catch (e) {
      console.error('Error loading training center:', e);
    }
  }
  const views = document.querySelectorAll('.dashboard-view');
  views.forEach((v) => v.classList.remove('active'));

  const targetViewEl = document.getElementById(`view-${viewName}`) || document.getElementById('view-overview');
  if (targetViewEl) {
    targetViewEl.classList.add('active');
  }

  if (window.GlobalNavigation && typeof window.GlobalNavigation.setActive === 'function') {
    window.GlobalNavigation.setActive(viewName);
  } else {
    const navLinks = document.querySelectorAll('.dashboard-sidebar nav a, dashboard-navigation nav a');
    navLinks.forEach((l) => l.classList.remove('active'));
    const activeLink = document.querySelector(`.dashboard-sidebar nav a[data-view="${viewName}"], dashboard-navigation nav a[data-view="${viewName}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  // Refresh Leaflet maps when switching views
  if (viewName === 'overview') {
    setTimeout(() => {
      incidentMap?.invalidateSize();
    }, 150);
    if (typeof renderResponderRescueNotifications === 'function') {
      renderResponderRescueNotifications();
    }
  }
  if (viewName === 'map') {
    if (!liveIncidentMap) {
      initLiveIncidentMap();
    }
    setTimeout(() => {
      liveIncidentMap?.invalidateSize();
    }, 150);
    setTimeout(() => {
      liveIncidentMap?.invalidateSize();
    }, 300);
  }
  if (viewName === 'incidents') {
    if (typeof loadIncidentsData === 'function') {
      loadIncidentsData();
    } else {
      renderFullIncidentsTable();
    }
    if (typeof renderResponderRescueNotifications === 'function') {
      renderResponderRescueNotifications();
    }
  }
  if (viewName === 'reports') {
    if (typeof loadReportsData === 'function') {
      loadReportsData();
    }
  }
  if (viewName === 'audit') {
    if (typeof loadAdminRecentActivities === 'function') {
      loadAdminRecentActivities();
    }
  }
  if (viewName === 'teams') {
    if (typeof loadTeamsAdminAccounts === 'function') {
      loadTeamsAdminAccounts();
    } else {
      renderTeamsAdminUsersTable();
    }
  }
}
window.switchView = switchView;

function navigateToIncidentsView(filter = 'active_ongoing') {
  if (isTrainerRole()) {
    if (typeof showToast === 'function') {
      showToast('Access restricted: Only Dashboard, Training Center, and Account Profile are available for Trainer accounts.', 'warning');
    }
    return;
  }
  const responderView = isResponderRole();
  const targetFilter = responderView ? 'all' : (filter || 'active_ongoing');
  activeIncidentFilter = targetFilter;

  const navLink = document.querySelector('a[data-view="incidents"]');
  if (navLink) {
    navLink.click();
  } else {
    if (typeof switchView === 'function') switchView('incidents');
    window.location.hash = '#incidents';
  }

  setTimeout(async () => {
    const filterButtons = document.querySelectorAll('.incidents-filter-btn');
    let matched = false;
    filterButtons.forEach((button) => {
      if (button.dataset.statusFilter === targetFilter) {
        button.classList.add('active');
        matched = true;
      } else {
        button.classList.remove('active');
      }
    });

    if (typeof renderFullIncidentsTable === 'function') {
      renderFullIncidentsTable(undefined, targetFilter);
    }
    if (typeof renderResponderRescueNotifications === 'function') {
      renderResponderRescueNotifications();
    }
    if (typeof updateIncidentFilterCounts === 'function') {
      updateIncidentFilterCounts();
    }

    if (responderView) {
      await loadIncidentsData();
      const newestFirst = [...(currentEmergencyIncidents || [])]
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const newestActiveIncident = newestFirst.find((incident) => {
        const status = String(incident.status || '').toLowerCase().replace(/[^a-z]/g, '');
        const hasCompletionReport = Boolean(String(incident.responder_completion_report || '').trim());
        return !hasCompletionReport && (['active', 'pending', 'ongoing', 'responder'].includes(status) || Boolean(incident.responder_name));
      });
      const incidentToOpen = newestActiveIncident || newestFirst.find((incident) => !String(incident.responder_completion_report || '').trim());
      if (incidentToOpen?.id) openIncidentDetails(incidentToOpen.id);
    }
  }, 40);
}
window.navigateToIncidentsView = navigateToIncidentsView;

function navigateToStudentAccounts(filter) {
  if (isTrainerRole()) {
    if (typeof showToast === 'function') {
      showToast('Access restricted: Only Dashboard, Training Center, and Account Profile are available for Trainer accounts.', 'warning');
    }
    return;
  }
  switchView('users');
  window.location.hash = '#users';

  if (filter) {
    const filterButton = Array.from(document.querySelectorAll('#studentFilterTags button[data-student-filter]'))
      .find((button) => button.dataset.studentFilter === filter);
    filterButton?.click();
  }
}
window.navigateToStudentAccounts = navigateToStudentAccounts;

function handleHashRouting() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) {
    const activeSection = document.querySelector('.dashboard-view.active');
    if (!activeSection || activeSection.id !== 'view-overview') {
      switchView('overview');
    }
    return;
  }

  const routeMap = {
    dashboard: 'overview',
    overview: 'overview',
    mapPanel: 'overview',
    map: 'map',
    incidentPanel: 'incidents',
    incidents: 'incidents',
    notificationsPanel: 'alerts',
    alerts: 'alerts',
    usersPanel: 'users',
    users: 'users',
    teamsPanel: 'teams',
    teams: 'teams',
    reportsPanel: 'reports',
    reports: 'reports',
    auditLogsPanel: 'audit',
    audit: 'audit',
    settingsPanel: 'settings',
    settings: 'settings',
    profile: 'profile',
    account: 'profile',
    training: 'training',
    'view-profile': 'profile'
  };

  let targetView = routeMap[hash] || 'overview';
  const currentRole = getCurrentUserRole();
  if (targetView === 'teams' && isResponderRole(currentRole)) {
    targetView = 'overview';
    window.location.hash = '#dashboard';
  }
  if (isTrainerRole(currentRole) && !['overview', 'training', 'profile'].includes(targetView)) {
    targetView = 'overview';
    window.location.hash = '#dashboard';
  }

  const activeSection = document.querySelector('.dashboard-view.active');
  if (!activeSection || activeSection.id !== `view-${targetView}`) {
    switchView(targetView);
  }

  // If linking to a specific in-page panel in overview (like #usersPanel or #incidentPanel)
  if (['mapPanel', 'usersPanel', 'incidentPanel', 'notificationsPanel'].includes(hash)) {
    const el = document.getElementById(hash);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }
}
window.handleHashRouting = handleHashRouting;


// 3. Leaflet Incident Map Initialization
function initIncidentMap() {
  if (incidentMap || typeof L === 'undefined') return;
  const mapElement = document.querySelector('#mapCanvas');
  if (!mapElement) return;

  const umak = [14.5628, 121.0561];
  incidentMap = L.map(mapElement, { zoomControl: false }).setView(umak, 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(incidentMap);

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

  const menu = document.querySelector('.map-menu');
  const menuToggle = document.querySelector('.map-menu-toggle');
  const menuItems = document.querySelectorAll('[data-map-filter]');

  menuToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Filter Live Markers
  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      const filter = item.dataset.mapFilter;
      if (filter === 'center') {
        incidentMap.setView(umak, 15);
      } else {
        const markersArray = window.overviewMapMarkers || [];
        markersArray.forEach(({ marker, data }) => {
          const status = (data.status || '').toLowerCase().replace(/[^a-z]/g, '');
          const matches = filter === 'all'
            || (filter === 'active' && status === 'active')
            || (filter === 'ongoing' && (status === 'ongoing' || status === 'pending'));
          if (matches) marker.addTo(incidentMap);
          else incidentMap.removeLayer(marker);
        });
      }
      menu.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', (event) => {
    if (menu && !menu.contains(event.target)) {
      menu.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  window.addEventListener('resize', () => incidentMap.invalidateSize());
  setTimeout(() => incidentMap.invalidateSize(), 200);
}
function initLiveIncidentMap() {
  if (liveIncidentMap || typeof L === 'undefined') return;
  const mapElement = document.querySelector('#liveMapCanvas');
  if (!mapElement) return;

  const umak = [14.5628, 121.0561];
  liveIncidentMap = L.map(mapElement, { zoomControl: false }).setView(umak, 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(liveIncidentMap);

  // Campus boundary circle
  L.circle(umak, {
    radius: 350,
    color: '#27a368',
    fillColor: '#6dd99a',
    fillOpacity: 0.08,
    weight: 2,
    dashArray: '5, 6'
  }).addTo(liveIncidentMap).bindPopup('UMak Campus Safety Zone (350m radius)');

  // Controls for live map
  document.querySelectorAll('[data-live-map-action]').forEach((control) => {
    control.addEventListener('click', () => {
      const action = control.dataset.liveMapAction;
      if (action === 'zoom-in') liveIncidentMap.zoomIn();
      if (action === 'zoom-out') liveIncidentMap.zoomOut();
      if (action === 'locate') liveIncidentMap.setView(umak, 15);
    });
  });

  // Filter tags tied to dynamic markers
  const filterBtns = document.querySelectorAll('#liveMapFilterTags button');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.liveFilter || 'all';

      const markersArray = window.liveMapMarkers || [];
      markersArray.forEach(({ marker, data }) => {
        const status = (data.status || '').toLowerCase().replace(/[^a-z]/g, '');
        const matches = filter === 'all'
          || (filter === 'active' && status === 'active')
          || (filter === 'ongoing' && (status === 'ongoing' || status === 'pending'));
        if (matches) marker.addTo(liveIncidentMap);
        else liveIncidentMap.removeLayer(marker);
      });
    });
  });

  // Search input tied to dynamic markers
  const searchInput = document.querySelector('#liveMapSearchInput');
  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const markersArray = window.liveMapMarkers || [];
    markersArray.forEach(({ marker, data }) => {
      const text = `${data.display_id || data.id} ${data.incident || data.assistance_type} ${data.location_address} ${data.responder_name}`.toLowerCase();
      if (!q || text.includes(q)) {
        marker.addTo(liveIncidentMap);
      } else {
        liveIncidentMap.removeLayer(marker);
      }
    });
  });

  window.addEventListener('resize', () => liveIncidentMap?.invalidateSize());
  setTimeout(() => liveIncidentMap?.invalidateSize(), 200);
}

// 4. Alert Filtering
function initAlertFilters() {
  const alertTabs = document.querySelectorAll('[data-alert-filter]');
  alertTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabContainer = tab.closest('.alert-tabs') || tab.parentElement;
      if (tabContainer) {
        tabContainer.querySelectorAll('[data-alert-filter]').forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
      }
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const filter = tab.dataset.alertFilter;
      const panel = tab.closest('.dashboard-panel') || document.querySelector('.dashboard-view.active');
      const items = panel ? panel.querySelectorAll('.alert-item') : document.querySelectorAll('.alert-item');

      items.forEach((item) => {
        const itemType = item.dataset.alertType;
        const isUrgent = item.classList.contains('urgent');

        if (filter === 'all') {
          item.style.display = '';
        } else if (filter === 'urgent') {
          item.style.display = isUrgent ? '' : 'none';
        } else {
          item.style.display = itemType === filter ? '' : 'none';
        }
      });
    });
  });
}

function resetModalDropdowns() {
  const studentSection = document.querySelector('#alertStudentSection');
  const studentToggle = document.querySelector('#alertStudentToggle');
  const studentFields = document.querySelector('#alertStudentFields');
  const studentActionText = studentToggle?.querySelector('.action-text');

  if (studentToggle) studentToggle.setAttribute('aria-expanded', 'false');
  if (studentActionText) studentActionText.textContent = 'Show More';
  if (studentSection) studentSection.classList.remove('expanded');
  if (studentFields) studentFields.classList.remove('open');

  const historySection = document.querySelector('#alertHistorySection');
  const historyToggle = document.querySelector('#alertHistoryToggle');
  const historyFields = document.querySelector('#alertHistoryFields');
  const historyActionText = historyToggle?.querySelector('.action-text');

  if (historyToggle) historyToggle.setAttribute('aria-expanded', 'false');
  if (historyActionText) historyActionText.textContent = 'Show More';
  if (historySection) historySection.classList.remove('expanded');
  if (historyFields) historyFields.classList.remove('open');

  const scrollContainer = document.querySelector('.alert-details-main');
  if (scrollContainer) scrollContainer.scrollTop = 0;
}
const resetStudentDetails = resetModalDropdowns;

function initAlertDetails() {
  const overlay = document.querySelector('#alertDetailsOverlay');
  const closeButton = document.querySelector('#closeAlertDetails');
  const resolutionOverlay = document.querySelector('#resolutionSummaryOverlay');
  const resolutionForm = document.querySelector('#resolutionSummaryForm');
  const resolutionText = document.querySelector('#resolutionSummaryText');
  const resolutionError = document.querySelector('#resolutionSummaryError');
  const resolutionSubmit = document.querySelector('#submitResolutionSummary');
  const resolutionOpenButton = document.querySelector('#openResolutionSummary');
  const resolutionCloseButton = document.querySelector('#closeResolutionSummary');
  const resolutionCancelButton = document.querySelector('#cancelResolutionSummary');
  const viewAlertsButton = document.querySelector('#alertDetailsViewAlerts');
  const studentSection = document.querySelector('#alertStudentSection');
  const studentToggle = document.querySelector('#alertStudentToggle');
  const studentFields = document.querySelector('#alertStudentFields');
  const studentActionText = studentToggle?.querySelector('.action-text');
  const historySection = document.querySelector('#alertHistorySection');
  const historyToggle = document.querySelector('#alertHistoryToggle');
  const historyFields = document.querySelector('#alertHistoryFields');
  const historyActionText = historyToggle?.querySelector('.action-text');
  const scrollContainer = document.querySelector('.alert-details-main');
  const alertItems = document.querySelectorAll('.alert-item');
  const chatOpenButton = document.querySelector('#openAlertChat');
  const chatMediaSection = document.querySelector('#alertChatMediaSection');
  const chatMediaToggleBtn = document.querySelector('#btnToggleChatMedia');
  const chatMediaGallery = document.querySelector('#alertChatMediaGallery');
  const chatMediaCountBadge = document.querySelector('#chatMediaCountBadge');

  const chatOverlay = document.querySelector('#alertChatOverlay');
  const chatCloseButton = document.querySelector('#closeAlertChat');
  const chatReference = document.querySelector('#alertChatReference');
  const chatDeliveryNotice = document.querySelector('#alertChatDeliveryNotice');
  const chatMessages = document.querySelector('#alertChatMessages');
  const chatForm = document.querySelector('#alertChatForm');
  const chatInput = document.querySelector('#alertChatInput');
  const chatSendButton = document.querySelector('#alertChatSend');
  const canUseAlertChat = () => {
    const role = (getCurrentUserRole() || '').trim().toLowerCase();
    return ['head', 'responder'].includes(getCurrentUserRole().toLowerCase()) || role === 'head' || role.includes('head') || role === 'responder' || role.includes('responder');
  };
  let activeChatIncidentId = '';
  let currentChatSenderName = '';
  let currentChatAuthId = '';
  let chatRefreshTimer = null;
  let chatLoading = false;
  let chatSending = false;

  if (!overlay || !closeButton) return;
  const updateAlertChatAccess = () => {
    const allowed = canUseAlertChat();
    if (chatOpenButton) chatOpenButton.hidden = !canUseAlertChat();
    const btn = document.querySelector('#openAlertChat') || chatOpenButton;
    if (btn) {
      if (allowed) {
        btn.removeAttribute('hidden');
        btn.hidden = false;
        btn.style.display = '';
        btn.disabled = false;
      } else {
        btn.setAttribute('hidden', '');
        btn.hidden = true;
        btn.style.display = 'none';
        btn.disabled = true;
      }
    }
  };
  updateAlertChatAccess();
  window.updateAlertChatAccess = updateAlertChatAccess;
  window.canUseAlertChat = canUseAlertChat;

  const setChatEnabled = (enabled) => {
    if (chatInput) chatInput.disabled = !enabled;
    if (chatSendButton) chatSendButton.disabled = !enabled || chatSending;
  };

  const showChatState = (text) => {
    if (chatMessages) chatMessages.innerHTML = `<p class="alert-chat-state">${escapeHtml(text)}</p>`;
  };

  const parseChatResponse = async (response) => {
    let result;
    try {
      const responseText = await response.text();
      result = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      if (response.status === 404) {
        throw new Error('Chat service not found. Restart the admin server to enable student messaging.');
      }
      throw new Error('Chat service returned an invalid response.');
    }
    if (!response.ok) throw new Error(result.error || 'Unable to complete the chat request.');
    return result;
  };

  const renderChatMessages = (messages) => {
    if (!chatMessages) return;
    if (!messages.length) {
      showChatState('Send a message to student to interact');
      return;
    }

    chatMessages.innerHTML = messages.map((message) => {
      const isMine = message.sender_auth_id
        ? message.sender_auth_id === currentChatAuthId
        : (message.sender_name && currentChatSenderName && (message.sender_name === currentChatSenderName || message.sender_name.startsWith(currentChatSenderName.split(' ')[0])));
      const sentAt = message.created_at ? new Date(message.created_at) : null;
      const timeLabel = sentAt && !Number.isNaN(sentAt.getTime())
        ? sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      return `
        <article class="alert-chat-entry${isMine ? ' mine' : ''}">
          <div class="alert-chat-bubble">
            <div class="alert-chat-meta">
              <span>${escapeHtml(message.sender_name || 'Incident Member')}</span>
            </div>
            <p>${escapeHtml(message.content || '')}</p>
            <time>${escapeHtml(timeLabel)}</time>
          </div>
        </article>
      `;
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const loadAlertChatMessages = async () => {
    if (!activeChatIncidentId || !chatMessages || chatLoading) return;
    chatLoading = true;
    try {
      const sessionId = (typeof getSessionId === 'function') ? getSessionId() : '';
      const headers = {};
      if (sessionId) headers['x-session-id'] = sessionId;
      const role = getCurrentUserRole();
      if (role) headers['x-employee-role'] = role;
      const name = getCurrentUserName();
      if (name) headers['x-employee-name'] = name;

      const response = await fetch(`/api/incidents/${encodeURIComponent(activeChatIncidentId)}/messages`, {
        headers
      });
      const result = await parseChatResponse(response);
      currentChatSenderName = result.current_sender_name || '';
      currentChatAuthId = result.current_sender_auth_id || '';
      setChatEnabled(Boolean(currentChatSenderName || currentChatAuthId || canUseAlertChat()));
      renderChatMessages(Array.isArray(result.messages) ? result.messages : []);
    } catch (error) {
      currentChatSenderName = '';
      currentChatAuthId = '';
      setChatEnabled(false);
      showChatState(error.message || 'Unable to load chat messages.');
    } finally {
      chatLoading = false;
    }
  };

  const closeAlertChat = () => {
    if (chatOverlay) {
      chatOverlay.setAttribute('hidden', '');
      chatOverlay.hidden = true;
      chatOverlay.style.display = 'none';
    }
    document.body.classList.remove('modal-open');
    if (chatRefreshTimer) clearInterval(chatRefreshTimer);
    chatRefreshTimer = null;
    activeChatIncidentId = '';
    currentChatSenderName = '';
    currentChatAuthId = '';
    setChatEnabled(false);
  };

  const renderChatMedia = async (incident) => {
    if (!chatMediaSection || !chatMediaGallery) return;

    const mediaList = incident.emergency_alert_media || incident.media || [];
    const images = mediaList.filter(m => m.media_type === 'image');
    const videos = mediaList.filter(m => m.media_type === 'video');
    const totalMedia = images.length + videos.length;

    if (totalMedia === 0) {
      chatMediaSection.hidden = true;
      return;
    }

    chatMediaSection.hidden = false;
    if (chatMediaCountBadge) {
      chatMediaCountBadge.textContent = `${totalMedia} item${totalMedia > 1 ? 's' : ''}`;
    }

    chatMediaGallery.innerHTML = '<div style="grid-column: 1/-1; text-align:center; font-size:12px; color:#64748b; padding:8px;">Loading secure media...</div>';

    let html = '';

    // Loop through and fetch a secure signed URL for each private file
    for (const img of images) {
      const secureUrl = await fetchSignedMediaUrl(img.storage_path);
      if (secureUrl) {
        html += `
          <a href="${escapeHtml(secureUrl)}" target="_blank" style="display:block; aspect-ratio:1; border-radius:6px; overflow:hidden; border:1px solid #cbd5e1; background:#f1f5f9;">
            <img src="${escapeHtml(secureUrl)}" style="width:100%; height:100%; object-fit:cover;" alt="Incident Photo" onerror="this.style.display='none'">
          </a>
        `;
      }
    }

    for (const vid of videos) {
      const secureUrl = await fetchSignedMediaUrl(vid.storage_path);
      if (secureUrl) {
        html += `
          <a href="${escapeHtml(secureUrl)}" target="_blank" style="display:flex; align-items:center; justify-content:center; aspect-ratio:1; border-radius:6px; overflow:hidden; background:#1e293b; color:white; text-decoration:none; border:1px solid #cbd5e1; position:relative;">
            <iconify-icon icon="solar:play-circle-bold" width="32" height="32" style="position:absolute; pointer-events:none;"></iconify-icon>
            <video src="${escapeHtml(secureUrl)}" style="width:100%; height:100%; object-fit:cover; opacity:0.6;"></video>
          </a>
        `;
      }
    }

    chatMediaGallery.innerHTML = html || '<div style="grid-column: 1/-1; text-align:center; font-size:12px; color:#ef4444; padding:8px;">Failed to load attachments</div>';
    chatMediaGallery.hidden = true;
    chatMediaGallery.style.display = 'none';
  };

  // Helper function to talk to your backend and get a tokenized link
  async function fetchSignedMediaUrl(storagePath) {
    try {
      // 1. Safely retrieve session ID directly from sessionStorage
      const currentSessionId = sessionStorage.getItem('sessionId') || '';
      const storedUser = JSON.parse(sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('activeUser') || '{}');

      const resp = await fetch(`/api/media/signed-url?path=${encodeURIComponent(storagePath)}`, {
        headers: {
          'x-session-id': currentSessionId,
          'x-employee-role': storedUser.role || storedUser.employee_role || 'Responder',
          'x-employee-id': storedUser.employee_id || storedUser.id || ''
        }
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        return data.signedUrl;
      } else {
        console.warn('Signed URL API rejected:', data.error || resp.statusText);
      }
    } catch (e) {
      console.error('Error fetching signed media URL network exception:', e);
    }
    return null;
  }

  const openAlertChat = () => {
    const record = currentAlertDetailRecord;
    if (!canUseAlertChat()) {
      if (typeof showToast === 'function') {
        showToast('Access restricted: Chat Students is available for HEAD and Responder accounts only.', 'warning');
      }
      return;
    }
    if (!record || !chatOverlay) return;
    activeChatIncidentId = String(record.actualId || record.chatAlertId || record.rawIncident?.id || record.id || '').replace(/^#/, '').trim();
    if (!activeChatIncidentId) return;

    const recipientName = record.student?.name || record.rawIncident?.accounts_student?.student_name || 'Student';
    const alertType = record.category || record.type || record.rawIncident?.assistance_type || 'Emergency';
    const displayCode = record.displayId || record.id || activeChatIncidentId;

    if (chatReference) chatReference.textContent = `To ${recipientName} · ${alertType} alert · ${displayCode}`;
    if (chatInput) chatInput.placeholder = `Message ${recipientName}...`;
    if (chatDeliveryNotice) {
      chatDeliveryNotice.setAttribute('hidden', '');
      chatDeliveryNotice.hidden = true;
      chatDeliveryNotice.style.display = 'none';
    }
    currentChatSenderName = '';
    currentChatAuthId = '';
    setChatEnabled(false);
    showChatState('Loading real-time messages...');
    renderChatMedia(record.rawIncident || {});
    chatOverlay.removeAttribute('hidden');
    chatOverlay.hidden = false;
    chatOverlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    loadAlertChatMessages();
    if (chatRefreshTimer) clearInterval(chatRefreshTimer);
    chatRefreshTimer = setInterval(loadAlertChatMessages, 2000);
    setTimeout(() => chatInput?.focus(), 80);
  };

  chatOpenButton?.addEventListener('click', openAlertChat);
  chatCloseButton?.addEventListener('click', closeAlertChat);
  chatOverlay?.addEventListener('click', (event) => {
    if (event.target === chatOverlay) closeAlertChat();
  });

  if (chatMediaToggleBtn) {
    chatMediaToggleBtn.addEventListener('click', () => {
      const isHidden = chatMediaGallery.hidden;
      chatMediaGallery.hidden = !isHidden;
      chatMediaGallery.style.display = isHidden ? 'grid' : 'none';
    });
  }
  chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = chatInput?.value.trim();
    if (!message || !activeChatIncidentId || chatSending) return;

    chatSending = true;
    setChatEnabled(false);
    if (chatSendButton) chatSendButton.disabled = true;
    try {
      const sessionId = (typeof getSessionId === 'function') ? getSessionId() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (sessionId) headers['x-session-id'] = sessionId;
      const role = getCurrentUserRole();
      if (role) headers['x-employee-role'] = role;
      const name = getCurrentUserName();
      if (name) headers['x-employee-name'] = name;

      const response = await fetch(`/api/incidents/${encodeURIComponent(activeChatIncidentId)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message })
      });
      const result = await parseChatResponse(response);
      if (chatInput) {
        chatInput.value = '';
        chatInput.focus();
      }
      if (chatDeliveryNotice) {
        const recipientName = result.recipient_name || 'student';
        chatDeliveryNotice.textContent = result.email_sent === true
          ? `✓ Message delivered in real-time to ${recipientName} & incident users.`
          : `✓ Message sent and delivered to incident chat.`;
        chatDeliveryNotice.classList.remove('warning');
        chatDeliveryNotice.removeAttribute('hidden');
        chatDeliveryNotice.hidden = false;
        chatDeliveryNotice.style.display = 'block';
      }
      await loadAlertChatMessages();
    } catch (error) {
      showChatState(error.message || 'Unable to send this message.');
    } finally {
      chatSending = false;
      setChatEnabled(true);
    }
  });

  const setupAccordionToggle = (toggleBtn, sectionEl, fieldsEl, actionTextEl) => {
    if (!toggleBtn || !sectionEl || !fieldsEl) return;

    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      const willExpand = !isExpanded;

      toggleBtn.setAttribute('aria-expanded', String(willExpand));

      if (willExpand) {
        if (actionTextEl) actionTextEl.textContent = 'See Less';
        sectionEl.classList.add('expanded');
        fieldsEl.classList.add('open');

        const calculateTarget = () => {
          if (!sectionEl || !scrollContainer) return 0;
          const sRect = sectionEl.getBoundingClientRect();
          const cRect = scrollContainer.getBoundingClientRect();
          return Math.max(0, sRect.top - cRect.top + scrollContainer.scrollTop - 10);
        };

        setTimeout(() => {
          if (scrollContainer) {
            scrollContainer.scrollTo({ top: calculateTarget(), behavior: 'smooth' });
          }
        }, 50);

        setTimeout(() => {
          if (scrollContainer && sectionEl.classList.contains('expanded')) {
            scrollContainer.scrollTo({ top: calculateTarget(), behavior: 'smooth' });
          }
        }, 220);
      } else {
        if (actionTextEl) actionTextEl.textContent = 'Show More';
        sectionEl.classList.remove('expanded');
        fieldsEl.classList.remove('open');

        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  };

  setupAccordionToggle(studentToggle, studentSection, studentFields, studentActionText);
  setupAccordionToggle(historyToggle, historySection, historyFields, historyActionText);

  const closeAlertDetails = () => {
    overlay.hidden = true;
    document.body.classList.remove('modal-open');
    resetModalDropdowns();
  };

  const closeResolutionSummary = () => {
    if (resolutionOverlay) resolutionOverlay.hidden = true;
    if (resolutionError) resolutionError.textContent = '';
  };

  const openResolutionSummary = () => {
    const record = currentAlertDetailRecord;
    if (!record || !resolutionOverlay) return;
    const rawIncident = record.rawIncident || {};
    const hasAssignedResponder = Boolean(record.responder_name || rawIncident.responder_name);
    // Forcefully trim whitespace so blank spaces don't count as a report
    const completionReport = String(record.responder_completion_report || rawIncident.responder_completion_report || '').trim();

    if (isResponderRole()) {
      showToast('Only Admin/HEAD accounts can finalize and resolve incidents.', 'warning');
      return;
    }

    // NEW STRICT RULE: Must have a responder assigned
    if (!hasAssignedResponder) {
      showToast('You must assign a responder to this incident before it can be resolved.', 'warning');
      return;
    }

    // STRICT RULE: Responder must have submitted a report
    if (!completionReport) {
      showToast('The assigned responder must complete their rescue report before you can resolve this incident.', 'warning');
      return;
    }

    const resolvedAt = new Date();
    const reportedAt = record.created_at ? new Date(record.created_at) : null;
    const elapsedMinutes = reportedAt && !Number.isNaN(reportedAt.getTime())
      ? Math.max(0, Math.floor((resolvedAt - reportedAt) / 60000))
      : null;
    const responseTime = elapsedMinutes === null
      ? '—'
      : `${Math.floor(elapsedMinutes / 60)} hrs ${elapsedMinutes % 60} mins`;
    const setSummaryValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value || '—';
    };

    setSummaryValue('resolutionSummaryTitle', record.id ? `#${record.id}` : record.title);
    setSummaryValue('resolutionReference', `Resolved ${formatDateTime(resolvedAt)} · ${record.student?.name || 'Unknown reporter'}`);
    setSummaryValue('resolutionReported', record.created_at ? formatDateTime(record.created_at) : record.time);
    setSummaryValue('resolutionResolved', formatDateTime(resolvedAt));
    setSummaryValue('resolutionResponseTime', responseTime);
    setSummaryValue('resolutionStudent', record.student?.name);
    setSummaryValue('resolutionCategory', record.category);
    const responderReportSection = document.getElementById('responderReportReview');
    const responderReportText = document.getElementById('responderReportText');
    const responderReportAuthor = document.getElementById('responderReportAuthor');
    if (responderReportSection) responderReportSection.hidden = !completionReport;
    if (responderReportText) responderReportText.textContent = completionReport;
    if (responderReportAuthor) {
      const reportAuthor = rawIncident.responder_completion_reported_by_name || 'Responder';
      const reportTime = rawIncident.responder_completion_reported_at
        ? ` · ${formatDateTime(rawIncident.responder_completion_reported_at)}`
        : '';
      responderReportAuthor.textContent = `${reportAuthor}${reportTime}`;
    }
    if (resolutionText) resolutionText.value = '';
    if (resolutionError) resolutionError.textContent = '';
    const characterCount = document.getElementById('resolutionCharacterCount');
    if (characterCount) characterCount.textContent = '0';
    resolutionOverlay.hidden = false;
    resolutionText?.focus();
  };

  window.openResolutionSummary = openResolutionSummary;
  window.openAlertChat = openAlertChat;
  window.updateAlertChatAccess = updateAlertChatAccess;
  window.closeAlertDetails = closeAlertDetails;

  resolutionOpenButton?.addEventListener('click', openResolutionSummary);
  resolutionCloseButton?.addEventListener('click', closeResolutionSummary);
  resolutionCancelButton?.addEventListener('click', closeResolutionSummary);
  resolutionOverlay?.addEventListener('click', (event) => {
    if (event.target === resolutionOverlay) closeResolutionSummary();
  });
  resolutionText?.addEventListener('input', () => {
    const characterCount = document.getElementById('resolutionCharacterCount');
    if (characterCount) characterCount.textContent = String(resolutionText.value.length);
  });
  resolutionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const summary = resolutionText?.value.trim();
    const record = currentAlertDetailRecord;
    if (!summary || !record) {
      if (resolutionError) resolutionError.textContent = 'Please enter a resolution summary before submitting.';
      resolutionText?.focus();
      return;
    }

    if (resolutionSubmit) {
      resolutionSubmit.disabled = true;
      resolutionSubmit.textContent = 'Submitting...';
    }
    if (resolutionError) resolutionError.textContent = '';

    try {
      const targetId = record.actualId || record.chatAlertId || record.id;
      const displayId = record.displayId || record.id;

      const sessionId = (typeof getSessionId === 'function') ? getSessionId() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (sessionId) headers['x-session-id'] = sessionId;
      const role = getCurrentUserRole();
      if (role) headers['x-employee-role'] = role;

      const statusResponse = await fetch(`/api/reports/incidents/${encodeURIComponent(targetId)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: 'Resolved', resolution_summary: summary })
      });
      const statusResult = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(statusResult.error || 'Failed to save the resolution summary.');
      // Resolved incident remains visible in reports and incident views without auto-archiving

      const resolvedIso = new Date().toISOString();
      record.status = 'Resolved';
      record.resolution_summary = summary;
      record.resolved_at = resolvedIso;

      // Update in-memory incident records
      if (currentEmergencyIncidents && currentEmergencyIncidents.length) {
        currentEmergencyIncidents.forEach(inc => {
          if (String(inc.id) === String(targetId) || String(inc.display_id) === String(displayId) || String(inc.id) === String(record.id)) {
            inc.status = 'Resolved';
            inc.resolution_summary = summary;
            inc.resolved_at = resolvedIso;
            inc.updated_at = resolvedIso;
          }
        });
      }
      if (currentEmergencyIncidentsMap) {
        [String(targetId), String(displayId), String(record.id)].forEach(k => {
          if (currentEmergencyIncidentsMap.has(k)) {
            const m = currentEmergencyIncidentsMap.get(k);
            m.status = 'Resolved';
            m.resolution_summary = summary;
            m.resolved_at = resolvedIso;
            m.updated_at = resolvedIso;
          }
        });
      }

      // Close resolution summary form and details overlay
      closeResolutionSummary();
      closeAlertDetails();

      // Switch filter button to 'all' if on active/pending so the newly resolved incident is clearly visible
      if (activeIncidentFilter !== 'all' && activeIncidentFilter !== 'resolved') {
        const allBtn = document.querySelector('.incidents-filter-btn[data-status-filter="all"]');
        if (allBtn) {
          document.querySelectorAll('.incidents-filter-btn').forEach(b => b.classList.remove('active'));
          allBtn.classList.add('active');
          activeIncidentFilter = 'all';
        }
      }

      // Immediately re-render incidents UI with updated Resolved status
      renderFullIncidentsTable();
      updateIncidentFilterCounts();
      renderOverviewIncidents();
      renderOverviewAlertNotifications();
      if (typeof loadReportsData === 'function') {
        loadReportsData();
      }

      // Pop up the Successfully Resolved modal!
      showSuccessfullyResolvedModal({
        id: targetId,
        displayId: displayId,
        category: record.category || 'Emergency',
        status: 'Resolved',
        resolvedAt: resolvedIso,
        summary: summary
      });

      // Reload fresh data from backend
      loadIncidentsData();
    } catch (error) {
      if (resolutionError) resolutionError.textContent = error.message || 'Unable to submit the resolution summary.';
    } finally {
      if (resolutionSubmit) {
        resolutionSubmit.disabled = false;
        resolutionSubmit.textContent = 'Submit & Archive';
      }
    }
  });

  const markCancelledBtn = document.querySelector('#markAlertCancelledBtn') || document.querySelector('.alert-details-footer .cancel-action');
  const cancelConfirmModal = document.getElementById('cancelConfirmModal');

  const responderFinishOverlay = document.getElementById('responderFinishOverlay');
  const responderCancelReasonOverlay = document.getElementById('responderCancelReasonOverlay');
  const responderReportSuccessModal = document.getElementById('responderReportSuccessModal');
  const cancellationSubmitButton = document.getElementById('submitResponderCancellationBtn');

  const setFinishIncidentDetails = () => {
    const record = currentAlertDetailRecord;
    if (!record) return;
    const student = record.student || record.accounts_student || record.rawIncident?.accounts_student || {};
    const values = {
      finishIncidentTypePill: record.category || record.assistance_type || 'Emergency',
      finishIncidentCode: record.displayId || record.id || 'Incident',
      finishStudentName: student.name || student.student_name || 'Student',
      finishStudentCollege: student.college || student.student_college || 'University Community',
      finishLocation: record.location || record.location_address || record.rawIncident?.location_address || 'University Campus',
      finishResponderName: record.responder_name || record.rawIncident?.responder_name || 'Assigned responder',
      finishElapsed: record.status || 'On Going',
      responderCancelReasonIncidentId: record.displayId || record.id || 'Incident'
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  };

  const closeResponderFinishModal = () => {
    if (responderFinishOverlay) responderFinishOverlay.hidden = true;
    if (responderCancelReasonOverlay) responderCancelReasonOverlay.hidden = true;
    if (overlay?.hidden) document.body.classList.remove('modal-open');
  };

  const openResponderFinishModal = () => {
    if (!isResponderRole()) {
      showToast('Only Responder accounts can finish a rescue task.', 'warning');
      return;
    }
    const record = currentAlertDetailRecord;
    if (!record || !(record.responder_name || record.rawIncident?.responder_name)) {
      showToast('This incident does not have an assigned responder.', 'warning');
      return;
    }
    if (['resolved', 'cancelled', 'canceled'].includes(String(record.status || '').toLowerCase())) {
      showToast('This incident is already closed.', 'warning');
      return;
    }
    setFinishIncidentDetails();
    const notes = document.getElementById('finishResolutionNotes');
    if (notes) notes.value = '';
    if (responderFinishOverlay) responderFinishOverlay.hidden = false;
    document.body.classList.add('modal-open');
  };

  const openResponderCancelReasonModal = () => {
    if (!currentAlertDetailRecord || !isResponderRole()) return;
    setFinishIncidentDetails();
    const reason = document.getElementById('responderCancelReasonInput');
    if (reason) reason.value = '';
    if (responderCancelReasonOverlay) responderCancelReasonOverlay.hidden = false;
    reason?.focus();
  };

  const closeResponderCancelReasonModal = () => {
    if (responderCancelReasonOverlay) responderCancelReasonOverlay.hidden = true;
  };

  const closeResponderReportSuccessModal = () => {
    if (responderReportSuccessModal) {
      responderReportSuccessModal.hidden = true;
      responderReportSuccessModal.style.display = 'none';
    }
    document.body.classList.remove('modal-open');
  };

  const submitResponderFinishStatus = async (status, details) => {
    const record = currentAlertDetailRecord;
    if (!record || !isResponderRole()) return;
    const incidentId = record.actualId || record.chatAlertId || record.id;
    const button = cancellationSubmitButton;
    if (button) {
      button.disabled = true;
      button.textContent = status === 'Cancelled' ? 'Cancelling response...' : 'Finishing rescue...';
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      const sessionId = typeof getSessionId === 'function' ? getSessionId() : '';
      if (sessionId) headers['x-session-id'] = sessionId;
      headers['x-employee-role'] = getCurrentUserRole();
      const payload = { status, responder_finish: true, cancellation_reason: details };

      const response = await fetch(`/api/reports/incidents/${encodeURIComponent(incidentId)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to update this rescue task.');

      const closedAt = new Date().toISOString();
      const incidentUpdate = {
        status,
        updated_at: closedAt,
        cancelled_at: closedAt,
        cancellation_reason: details
      };
      Object.assign(record, incidentUpdate);
      if (record.rawIncident) Object.assign(record.rawIncident, incidentUpdate);
      (currentEmergencyIncidents || []).forEach((incident) => {
        if (String(incident.id) === String(incidentId) || String(incident.display_id) === String(record.displayId || record.id)) {
          Object.assign(incident, incidentUpdate);
        }
      });

      closeResponderFinishModal();
      stopResponderLocationTracking();
      closeAlertDetails();
      showToast('Ongoing response cancelled with reason recorded.', 'success');
      if (typeof loadIncidentsData === 'function') loadIncidentsData();
      if (typeof loadReportsData === 'function') loadReportsData();
    } catch (error) {
      showToast(error.message || 'Unable to update this rescue task.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Confirm Cancellation';
      }
    }
  };

  const submitResponderFinishTask = async () => {
    const record = currentAlertDetailRecord;
    const report = document.getElementById('finishResolutionNotes')?.value.trim() || '';
    if (!record || !isResponderRole()) return;
    if (!report) {
      showToast('Enter a rescue completion report before submitting.', 'warning');
      document.getElementById('finishResolutionNotes')?.focus();
      return;
    }

    const incidentId = record.actualId || record.chatAlertId || record.id;
    const submitButton = document.getElementById('submitRescueReportBtn');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting report...';
    }
    try {
      const headers = { 'Content-Type': 'application/json' };
      const sessionId = typeof getSessionId === 'function' ? getSessionId() : '';
      if (sessionId) headers['x-session-id'] = sessionId;
      headers['x-employee-role'] = getCurrentUserRole();
      headers['x-employee-name'] = getCurrentUserName();
      const response = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/rescue-report`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ report })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to submit the rescue report.');

      const incidentUpdate = result.incident || {};
      Object.assign(record, incidentUpdate);
      if (record.rawIncident) Object.assign(record.rawIncident, incidentUpdate);
      (currentEmergencyIncidents || []).forEach((incident) => {
        if (String(incident.id) === String(incidentId)) Object.assign(incident, incidentUpdate);
      });
      closeResponderFinishModal();
      stopResponderLocationTracking();
      const successIncidentId = document.getElementById('responderReportSuccessIncidentId');
      if (successIncidentId) successIncidentId.textContent = record.displayId || record.id || 'Incident';
      closeAlertDetails();
      if (responderReportSuccessModal) {
        responderReportSuccessModal.hidden = false;
        responderReportSuccessModal.style.display = 'grid';
      }
      document.body.classList.add('modal-open');
      showToast('Completion report submitted. A HEAD can now review and resolve this incident.', 'success');
      setTimeout(() => {
        renderFullIncidentsTable(currentEmergencyIncidents);
        renderResponderRescueNotifications(currentEmergencyIncidents);
        updateIncidentFilterCounts(currentEmergencyIncidents);
        if (typeof loadIncidentsData === 'function') loadIncidentsData();
        if (typeof loadReportsData === 'function') loadReportsData();
      }, 0);
    } catch (error) {
      showToast(error.message || 'Unable to submit the rescue report.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Completion Report';
      }
    }
  };

  const submitResponderCancellation = () => {
    const reason = document.getElementById('responderCancelReasonInput')?.value.trim() || '';
    if (!reason) {
      showToast('Enter a reason before cancelling the response.', 'warning');
      document.getElementById('responderCancelReasonInput')?.focus();
      return;
    }
    return submitResponderFinishStatus('Cancelled', reason);
  };

  window.openResponderFinishModal = openResponderFinishModal;
  window.closeResponderFinishModal = closeResponderFinishModal;
  window.openResponderCancelReasonModal = openResponderCancelReasonModal;
  window.closeResponderCancelReasonModal = closeResponderCancelReasonModal;
  window.closeResponderReportSuccessModal = closeResponderReportSuccessModal;
  window.submitResponderFinishTask = submitResponderFinishTask;
  window.submitResponderCancellation = submitResponderCancellation;

  const openCancelConfirmModal = () => {
    const record = currentAlertDetailRecord;
    if (!record) {
      showToast('No active incident selected.');
      return;
    }

    const modal = document.getElementById('cancelConfirmModal');
    if (!modal) return;

    const displayId = record.displayId || record.id || 'INCIDENT';
    const studentName = record.student?.name || (record.accounts_student?.student_name) || 'Student Reporter';
    const category = record.category || 'Emergency';
    const status = record.status || 'On Going';

    const incidentIdEl = document.getElementById('cancelConfirmIncidentId');
    const codeEl = document.getElementById('cancelModalCode');
    const studentEl = document.getElementById('cancelModalStudent');
    const categoryEl = document.getElementById('cancelModalCategory');
    const statusEl = document.getElementById('cancelModalCurrentStatus');

    if (incidentIdEl) incidentIdEl.textContent = displayId;
    if (codeEl) codeEl.textContent = displayId;
    if (studentEl) studentEl.textContent = studentName;
    if (categoryEl) categoryEl.textContent = category;
    if (statusEl) {
      statusEl.textContent = status;
      const norm = (status || '').toLowerCase().replace(/[^a-z]/g, '');
      if (norm === 'active') {
        statusEl.style.color = '#dc2626';
      } else if (norm === 'resolved') {
        statusEl.style.color = '#15803d';
      } else {
        statusEl.style.color = '#b45309';
      }
    }

    const yesBtn = document.getElementById('btnCancelConfirmYes');
    if (yesBtn) {
      yesBtn.disabled = false;
      yesBtn.textContent = 'Yes, please cancel it';
    }

    // Clear the text box every time the modal opens
    const reasonInput = document.getElementById('generalCancelReasonInput');
    if (reasonInput) reasonInput.value = '';

    modal.removeAttribute('hidden');
    modal.hidden = false;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Auto-focus the text box for convenience
    setTimeout(() => { if (reasonInput) reasonInput.focus(); }, 100);
  };

  const closeCancelConfirmModal = () => {
    const modal = document.getElementById('cancelConfirmModal');
    if (modal) {
      modal.setAttribute('hidden', '');
      modal.hidden = true;
      modal.style.display = 'none';
      if (overlay && overlay.hidden) {
        document.body.classList.remove('modal-open');
      }
    }
  };

  const confirmAndExecuteCancellation = async () => {
    const record = currentAlertDetailRecord;
    if (!record) {
      closeCancelConfirmModal();
      return;
    }

    // 1. Grab and validate the cancellation reason
    const reasonInput = document.getElementById('generalCancelReasonInput');
    const reason = reasonInput ? reasonInput.value.trim() : '';

    if (reasonInput && !reason) {
      showToast('Please provide a reason for cancelling this incident.', 'warning');
      reasonInput.focus();
      return; // Stop the cancellation if no reason is given
    }

    const targetId = record.actualId || record.chatAlertId || record.id;
    const displayId = record.displayId || record.id;
    const yesBtn = document.getElementById('btnCancelConfirmYes');

    if (yesBtn) {
      yesBtn.disabled = true;
      yesBtn.textContent = 'Cancelling...';
    }

    try {
      const sessionId = (typeof getSessionId === 'function') ? getSessionId() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (sessionId) headers['x-session-id'] = sessionId;
      const role = getCurrentUserRole();
      if (role) headers['x-employee-role'] = role;

      // 2. Send the reason to the backend
      const statusResponse = await fetch(`/api/reports/incidents/${encodeURIComponent(targetId)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status: 'Cancelled',
          cancellation_reason: reason
        })
      });
      const statusResult = await statusResponse.json();
      if (!statusResponse.ok) {
        throw new Error(statusResult.error || 'Failed to update incident status to Cancelled.');
      }

      const cancelledIso = new Date().toISOString();
      record.status = 'Cancelled';
      record.cancelled_at = cancelledIso;
      record.cancellation_reason = reason; // Save to local memory

      // Update in-memory incident list
      if (currentEmergencyIncidents && currentEmergencyIncidents.length) {
        currentEmergencyIncidents.forEach(inc => {
          if (String(inc.id) === String(targetId) || String(inc.display_id) === String(displayId) || String(inc.id) === String(record.id)) {
            inc.status = 'Cancelled';
            inc.cancelled_at = cancelledIso;
            inc.updated_at = cancelledIso;
            inc.cancellation_reason = reason;
          }
        });
      }

      // Update in-memory incident map
      if (currentEmergencyIncidentsMap) {
        [String(targetId), String(displayId), String(record.id)].forEach(k => {
          if (currentEmergencyIncidentsMap.has(k)) {
            const m = currentEmergencyIncidentsMap.get(k);
            m.status = 'Cancelled';
            m.cancelled_at = cancelledIso;
            m.updated_at = cancelledIso;
            m.cancellation_reason = reason;
          }
        });
      }

      closeCancelConfirmModal();
      closeAlertDetails();

      if (activeIncidentFilter !== 'all' && activeIncidentFilter !== 'cancelled') {
        const allBtn = document.querySelector('.incidents-filter-btn[data-status-filter="all"]');
        if (allBtn) {
          document.querySelectorAll('.incidents-filter-btn').forEach(b => b.classList.remove('active'));
          allBtn.classList.add('active');
          activeIncidentFilter = 'all';
        }
      }

      renderFullIncidentsTable();
      updateIncidentFilterCounts();
      renderOverviewIncidents();
      renderOverviewAlertNotifications();
      if (typeof loadReportsData === 'function') {
        loadReportsData();
      }

      const activeAlertsEl = document.getElementById('metricActiveAlerts');
      if (activeAlertsEl && currentEmergencyIncidents) {
        const activeCount = currentEmergencyIncidents.filter(i => {
          const s = (i.status || '').toLowerCase().replace(/[^a-z]/g, '');
          return s === 'active' || s === 'pending' || s === 'ongoing';
        }).length;
        activeAlertsEl.textContent = activeCount;
      }

      showToast(`Incident marked as Cancelled. Reason recorded.`);

      loadIncidentsData();
    } catch (error) {
      console.error('Error cancelling incident:', error);
      showToast(error.message || 'Unable to mark alert as cancelled.', 'error');
    } finally {
      if (yesBtn) {
        yesBtn.disabled = false;
        yesBtn.textContent = 'Yes, please cancel it';
      }
    }
  };

  markCancelledBtn?.addEventListener('click', openCancelConfirmModal);
  window.openCancelConfirmModal = openCancelConfirmModal;
  window.closeCancelConfirmModal = closeCancelConfirmModal;
  window.confirmAndExecuteCancellation = confirmAndExecuteCancellation;
  window.markCurrentAlertAsCancelled = openCancelConfirmModal;

  const successModal = document.getElementById('resolutionSuccessModal');
  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) closeSuccessfullyResolvedModal();
    });
  }

  alertItems.forEach((item) => {
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.addEventListener('click', () => showAlertDetails(item));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showAlertDetails(item);
      }
    });
  });

  closeButton.addEventListener('click', closeAlertDetails);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeAlertDetails();
  });
  document.addEventListener('keydown', (event) => {
    const assignModal = document.getElementById('assignResponderModal');
    if (event.key === 'Escape' && assignModal && !assignModal.hidden) {
      closeAssignResponderModal();
      return;
    }
    if (event.key === 'Escape' && cancelConfirmModal && !cancelConfirmModal.hidden) {
      closeCancelConfirmModal();
      return;
    }
    if (event.key === 'Escape' && successModal && !successModal.hidden) {
      closeSuccessfullyResolvedModal();
      return;
    }
    if (event.key === 'Escape' && chatOverlay && !chatOverlay.hidden) {
      closeAlertChat();
      return;
    }
    if (event.key === 'Escape' && resolutionOverlay && !resolutionOverlay.hidden) {
      closeResolutionSummary();
      return;
    }
    if (event.key === 'Escape' && !overlay.hidden) closeAlertDetails();
  });

  if (viewAlertsButton) {
    viewAlertsButton.addEventListener('click', () => {
      closeAlertDetails();
      switchView('alerts');
      window.location.hash = '#alerts';
    });
  }
}

const incidentHistoryRecords = {
  'MED_0001': {
    id: 'MED_0001',
    category: 'Medical',
    title: 'Student Medical Assistance Request',
    type: 'Acute Asthma & Respiratory Distress',
    status: 'On Going',
    time: '4 mins ago • 16:49:30',
    location: 'Student Center Plaza (2nd Floor)',
    floor: '2nd Floor',
    room: 'Plaza Common Area (Bench 4)',
    userId: '10000056',
    description: 'Student reported sudden acute asthma attack and shortness of breath while studying. First aid responders deployed with emergency inhaler and oxygen kit.',
    student: {
      name: 'Jolhehem Billones',
      age: '20',
      year: '2nd Year',
      college: 'College of Health Sciences',
      contact: '0917 123 4567',
      address: 'University of Makati Campus Residence',
      primaryName: 'Maria Billones',
      primaryContact: '0918 234 5678',
      primaryAddress: 'Taguig City, Metro Manila',
      secondaryName: 'Jose Billones',
      secondaryContact: '0920 345 6789',
      secondaryAddress: 'Makati City, Metro Manila'
    },
    history: [
      { step: 'Emergency SOS Reported by Student', time: 'Today 16:45:10', complete: true },
      { step: 'Command Desk Triaged & Acknowledged', time: 'Today 16:46:20', complete: true },
      { step: 'First Aid Unit Dispatched & In Progress', time: 'Today 16:47:05', complete: true },
      { step: 'Resolution & Medical Clearance', time: '—', complete: false }
    ],
    coords: [14.5631, 121.0565]
  },
  'SEC_0001': {
    id: 'SEC_0001',
    category: 'Security',
    title: 'Campus Perimeter Security Alert',
    type: 'Gate Traffic Hazard & Perimeter Control',
    status: 'Active',
    time: '23 mins ago • 12:50:38',
    location: 'J.P. Rizal Ext. Campus Gate',
    floor: 'Ground Level',
    room: 'Main Security Gate Entrance',
    userId: '10000088',
    description: 'Vehicle minor fender-bender outside the campus entrance gates causing traffic bottleneck. Campus security officers deployed for perimeter safety and traffic redirection.',
    student: {
      name: 'Carlos Mendoza',
      age: '21',
      year: '3rd Year',
      college: 'College of Technology Management',
      contact: '0919 876 5432',
      address: 'West Rembo, Makati City',
      primaryName: 'Elena Mendoza',
      primaryContact: '0917 999 1122',
      primaryAddress: 'Makati City, Metro Manila',
      secondaryName: 'Roberto Mendoza',
      secondaryContact: '0918 333 4455',
      secondaryAddress: 'Makati City, Metro Manila'
    },
    history: [
      { step: 'Incident Reported at Gate Perimeter', time: 'Today 12:50:38', complete: true },
      { step: 'Perimeter Security Lead Acknowledged', time: 'Today 12:52:10', complete: true },
      { step: 'Patrol Unit Deployed & In Progress', time: 'Today 12:53:00', complete: true },
      { step: 'Investigation & Traffic Cleared', time: '—', complete: false }
    ],
    coords: [14.5620, 121.0550]
  },
  'CAMP_0001': {
    id: 'CAMP_0001',
    category: 'Medical',
    title: 'Gymnasium Minor Sports Injury',
    type: 'Clinical First Aid Treatment',
    status: 'Resolved',
    time: '1 hour ago • 10:21:17',
    location: 'Gymnasium Clinic',
    floor: '1st Floor',
    room: 'Athletic Clinic Facility',
    userId: '10000102',
    description: 'Student sustained minor ankle sprain during physical education basketball practice. Campus clinic nurse applied cold compress and elastic compression bandage. Student cleared safely.',
    student: {
      name: 'Angela Santos',
      age: '19',
      year: '1st Year',
      college: 'College of Arts and Letters',
      contact: '0922 456 7890',
      address: 'Pembo, Makati City',
      primaryName: 'Teresa Santos',
      primaryContact: '0920 111 2233',
      primaryAddress: 'Makati City, Metro Manila',
      secondaryName: 'David Santos',
      secondaryContact: '0921 444 5566',
      secondaryAddress: 'Makati City, Metro Manila'
    },
    history: [
      { step: 'Injury Reported at Gymnasium', time: 'Today 10:21:17', complete: true },
      { step: 'Clinic Staff Acknowledged Request', time: 'Today 10:22:45', complete: true },
      { step: 'Nurse Treatment In Progress', time: 'Today 10:25:00', complete: true },
      { step: 'Resolved & Discharged Safely', time: 'Today 11:15:00', complete: true }
    ],
    coords: [14.5610, 121.0545]
  },
  'URG_0001': {
    id: 'URG_0001',
    category: 'Medical',
    title: 'Gymnasium Minor Sports Injury',
    type: 'Clinical First Aid Treatment',
    status: 'Resolved',
    time: '1 hour ago • 10:21:17',
    location: 'Gymnasium Clinic',
    floor: '1st Floor',
    room: 'Athletic Clinic Facility',
    userId: '10000102',
    description: 'Student sustained minor ankle sprain during physical education basketball practice. Campus clinic nurse applied cold compress and elastic compression bandage. Student cleared safely.',
    student: {
      name: 'Angela Santos',
      age: '19',
      year: '1st Year',
      college: 'College of Arts and Letters',
      contact: '0922 456 7890',
      address: 'Pembo, Makati City',
      primaryName: 'Teresa Santos',
      primaryContact: '0920 111 2233',
      primaryAddress: 'Makati City, Metro Manila',
      secondaryName: 'David Santos',
      secondaryContact: '0921 444 5566',
      secondaryAddress: 'Makati City, Metro Manila'
    },
    history: [
      { step: 'Injury Reported at Gymnasium', time: 'Today 10:21:17', complete: true },
      { step: 'Clinic Staff Acknowledged Request', time: 'Today 10:22:45', complete: true },
      { step: 'Nurse Treatment In Progress', time: 'Today 10:25:00', complete: true },
      { step: 'Resolved & Discharged Safely', time: 'Today 11:15:00', complete: true }
    ],
    coords: [14.5610, 121.0545]
  },
  'VIC_0001': {
    id: 'VIC_0001',
    category: 'Campus Vicinity',
    title: 'Campus Boundary Safety Review',
    type: 'Boundary Telemetry Verification',
    status: 'On Going',
    time: '12:05:44',
    location: 'Campus Boundary, University of Makati',
    floor: 'Perimeter Level',
    room: 'East Perimeter Line',
    userId: '10000115',
    description: 'Activity detected near the university boundary requiring safety review and security patrol sweep.',
    student: {
      name: 'Perimeter Monitoring Sensor Unit',
      age: 'N/A',
      year: 'Automated Beacon',
      college: 'Campus Security Telemetry',
      contact: '0917 888 4321',
      address: 'UMak Campus Boundary',
      primaryName: 'Perimeter Desk Lead',
      primaryContact: '0918 888 1234',
      primaryAddress: 'Security HQ',
      secondaryName: 'Field Patrol Unit',
      secondaryContact: '0920 888 5678',
      secondaryAddress: 'Gate 2 Desk'
    },
    history: [
      { step: 'Boundary Telemetry Triggered', time: 'Today 12:05:44', complete: true },
      { step: 'Command Center Flagged for Review', time: 'Today 12:07:00', complete: true },
      { step: 'Patrol Sweep In Progress', time: 'Today 12:10:00', complete: true },
      { step: 'Perimeter Cleared & Verified', time: '—', complete: false }
    ],
    coords: [14.5650, 121.0570]
  }
};

let alertDetailMarker = null;
let currentAlertDetailRecord = null;

function renderIncidentModal(record) {
  const overlay = document.querySelector('#alertDetailsOverlay');
  if (!overlay) return;

  currentAlertDetailRecord = record;
  resetStudentDetails();

  const title = document.querySelector('#alertDetailsTitle');
  const meta = document.querySelector('#alertDetailsMeta');
  const description = document.querySelector('#alertDetailsDescription');
  const status = document.querySelector('#alertDetailsStatus');
  const statusValue = document.querySelector('#alertDetailsStatusValue');
  const category = document.querySelector('#alertDetailsCategory');
  const type = document.querySelector('#alertDetailsType');
  const reported = document.querySelector('#alertDetailsReported');
  const location = document.querySelector('#alertDetailsLocation');
  const incidentId = document.querySelector('#alertDetailsIncidentId');
  const kicker = document.querySelector('#alertDetailsKicker');
  const floorEl = document.querySelector('#alertDetailsFloor');
  const roomEl = document.querySelector('#alertDetailsRoom');
  const userIdEl = document.querySelector('#alertDetailsUserId');
  const trackList = document.querySelector('.alert-track-list');

  const rawStatus = (record.status || '').toLowerCase().replace(/[^a-z]/g, '');
  const cleanStatus = (rawStatus === 'pending' || rawStatus === 'ongoing' || rawStatus === 'responder') ? 'On Going' : record.status;
  const normStatus = rawStatus;

  if (title) title.textContent = record.title;
  if (meta) meta.textContent = record.time;
  if (description) description.textContent = record.description;
  if (status) {
    status.textContent = cleanStatus;
    if (normStatus === 'resolved') {
      status.style = 'background-color: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important; padding: 2px 10px; border-radius: 9999px; font-weight: 700;';
    } else if (normStatus === 'active') {
      status.style = 'background-color: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #f87171 !important; padding: 2px 10px; border-radius: 9999px; font-weight: 700;';
    } else if (normStatus === 'cancelled' || normStatus === 'canceled') {
      status.style = 'background-color: #f1f5f9 !important; color: #475569 !important; border: 1px solid #cbd5e1 !important; padding: 2px 10px; border-radius: 9999px; font-weight: 700;';
    } else {
      status.style = 'background-color: #fef08a !important; color: #854d0e !important; border: 1px solid #facc15 !important; padding: 2px 10px; border-radius: 9999px; font-weight: 700;';
    }
  }
  if (statusValue) statusValue.textContent = cleanStatus;

  const isSysAdmin = isSystemAdminRole();
  const viewOnlyNotice = document.getElementById('alertDetailsViewOnlyNotice');
  if (viewOnlyNotice) {
    viewOnlyNotice.style.display = isSysAdmin ? 'inline-block' : 'none';
  }

  const resolveBtn = document.querySelector('.alert-details-footer .resolve-action');
  if (resolveBtn) {
    // Strip the HTML onclick entirely to prevent it from firing maliciously
    resolveBtn.removeAttribute('onclick');

    const raw = record.rawIncident || {};
    const hasAssignedResponder = Boolean(record.responder_name || raw.responder_name);
    const completionReport = String(record.responder_completion_report || raw.responder_completion_report || '').trim();
    const hasCompletionReport = completionReport.length > 0;

    if (isResponderRole()) {
      resolveBtn.style.display = 'none'; // Responders don't see this
    } else {
      resolveBtn.style.display = ''; // Admins see this

      if (normStatus === 'resolved') {
        resolveBtn.disabled = true;
        resolveBtn.style.opacity = '0.6';
        resolveBtn.style.cursor = 'not-allowed';
        resolveBtn.style.pointerEvents = 'none';
        resolveBtn.title = 'This incident is already resolved';
        resolveBtn.innerHTML = '&#10003; Already Resolved';
      } else if (normStatus === 'cancelled' || normStatus === 'canceled') {
        resolveBtn.disabled = true;
        resolveBtn.style.opacity = '0.6';
        resolveBtn.style.cursor = 'not-allowed';
        resolveBtn.style.pointerEvents = 'none';
        resolveBtn.title = 'Cannot resolve an incident that is cancelled';
        resolveBtn.innerHTML = '&#10003; Resolve';
      } else if (!hasAssignedResponder) {
        // LOCK 1: No responder assigned yet
        resolveBtn.disabled = true;
        resolveBtn.style.opacity = '0.5';
        resolveBtn.style.cursor = 'not-allowed';
        resolveBtn.style.pointerEvents = 'none';
        resolveBtn.title = 'You must assign a responder before this incident can be resolved.';
        resolveBtn.innerHTML = '&#10003; Needs Responder';
      } else if (hasAssignedResponder && !hasCompletionReport) {
        // LOCK 2: Responder assigned but report is missing
        resolveBtn.disabled = true;
        resolveBtn.style.opacity = '0.5';
        resolveBtn.style.cursor = 'not-allowed';
        resolveBtn.style.pointerEvents = 'none';
        resolveBtn.title = 'Waiting for the assigned responder to finish the rescue and submit a report.';
        resolveBtn.innerHTML = '&#10003; Waiting for Report';
      } else {
        // UNLOCK: Responder assigned AND report is completed
        resolveBtn.disabled = false;
        resolveBtn.style.opacity = '1';
        resolveBtn.style.cursor = 'pointer';
        resolveBtn.style.pointerEvents = 'auto';
        resolveBtn.title = 'Complete and resolve emergency incident';
        resolveBtn.innerHTML = '&#10003; Resolve';
      }
    }
  }
  const cancelBtn = document.querySelector('#markAlertCancelledBtn') || document.querySelector('.alert-details-footer .cancel-action');
  if (cancelBtn) {
    if (normStatus === 'cancelled' || normStatus === 'canceled') {
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.6';
      cancelBtn.style.cursor = 'not-allowed';
      cancelBtn.title = 'This incident is already cancelled';
      cancelBtn.innerHTML = '&#10005; Already Cancelled';
      cancelBtn.removeAttribute('onclick'); // Remove click if disabled
    } else if (normStatus === 'resolved') {
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.6';
      cancelBtn.style.cursor = 'not-allowed';
      cancelBtn.title = 'Cannot cancel an incident that is already resolved';
      cancelBtn.innerHTML = '&#10005; Mark as Cancelled';
      cancelBtn.removeAttribute('onclick'); // Remove click if disabled
    } else {
      cancelBtn.disabled = false;
      cancelBtn.style.opacity = '1';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.title = 'Cancel this incident alert';
      cancelBtn.innerHTML = '&#10005; Mark as Cancelled';

      // ADD THIS LINE TO FORCE THE MODAL TO OPEN:
      cancelBtn.setAttribute('onclick', 'openCancelConfirmModal()');
    }
  }

  const assignBtn = document.querySelector('#openAssignResponderBtn');
  if (assignBtn) {
    const raw = record?.rawIncident || {};
    assignBtn.dataset.incidentId = record.actualId || record.chatAlertId || raw.id || record.id || '';
    const responderName = record?.responder_name || raw?.responder_name || '';

    if (isResponderRole()) {
      assignBtn.style.display = 'none'; // Responders cannot assign/reassign
    } else {
      assignBtn.style.display = ''; // Admins can

      if (normStatus === 'resolved' || normStatus === 'cancelled' || normStatus === 'canceled') {
        assignBtn.disabled = true;
        assignBtn.style.opacity = '0.5';
        assignBtn.style.cursor = 'not-allowed';
        assignBtn.title = 'Cannot assign responder to closed incident';
        assignBtn.innerHTML = '&#128657; Assign Responder';
      } else {
        if (responderName) {
          assignBtn.disabled = false;
          assignBtn.style.opacity = '1';
          assignBtn.style.cursor = 'pointer';
          assignBtn.title = `Currently assigned to ${responderName}. Click to reassign unit.`;
          assignBtn.innerHTML = '&#128657; Reassign Responder';
        } else {
          assignBtn.disabled = false;
          assignBtn.style.opacity = '1';
          assignBtn.style.cursor = 'pointer';
          assignBtn.title = 'Assign a responder unit to rescue this incident';
          assignBtn.innerHTML = '&#128657; Assign Responder';
        }
      }
    }
  }

  const finishTaskBtn = document.getElementById('responderFinishTaskBtn');
  if (finishTaskBtn) {
    const isResponder = isResponderRole();
    const isOpenIncident = !['resolved', 'cancelled', 'canceled'].includes(normStatus);
    const hasAssignedResponder = Boolean(record.responder_name || record.rawIncident?.responder_name);
    const hasCompletionReport = Boolean(record.responder_completion_report || record.rawIncident?.responder_completion_report);
    finishTaskBtn.hidden = !(isResponder && isOpenIncident && hasAssignedResponder && !hasCompletionReport);
  }

  if (typeof updateAlertDetailAssigneeBanner === 'function') {
    updateAlertDetailAssigneeBanner(record);
  }
  if (typeof updateAlertChatAccess === 'function') {
    updateAlertChatAccess();
  } else if (typeof window.updateAlertChatAccess === 'function') {
    window.updateAlertChatAccess();
  }
  if (category) category.textContent = record.category;
  if (type) type.textContent = record.type;
  if (reported) reported.textContent = record.time;
  if (location) location.textContent = record.location;
  if (incidentId) incidentId.textContent = record.id.startsWith('#') ? record.id : `#${record.id}`;
  if (kicker) kicker.textContent = `${record.category.toUpperCase()} INCIDENT`;
  if (floorEl) floorEl.textContent = record.floor || 'Ground Level';
  if (roomEl) roomEl.textContent = record.room || record.location;
  if (userIdEl) userIdEl.textContent = record.userId || '10000056';

  if (record.student) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setVal('alertStudentName', record.student.name);
    setVal('alertStudentAge', record.student.age);
    setVal('alertStudentYear', record.student.year);
    setVal('alertStudentCollege', record.student.college);
    setVal('alertStudentContact', record.student.contact);
    setVal('alertStudentAddress', record.student.address);
    setVal('alertStudentPrimaryName', record.student.primaryName || record.student.name);
    setVal('alertStudentPrimaryContact', record.student.primaryContact || record.student.contact);
    setVal('alertStudentPrimaryAddress', record.student.primaryAddress || record.student.address);
    setVal('alertStudentSecondaryName', record.student.secondaryName || 'Emergency Support');
    setVal('alertStudentSecondaryContact', record.student.secondaryContact || '0920 345 6789');
    setVal('alertStudentSecondaryAddress', record.student.secondaryAddress || 'Makati City');
  }

  if (trackList && record.history && record.history.length) {
    trackList.innerHTML = record.history.map(item => `
      <div class="track-step ${item.complete ? 'complete' : ''}">
        <i></i><strong>${item.step}</strong><time>${item.time}</time>
      </div>
    `).join('');
  }

  overlay.hidden = false;
  document.body.classList.add('modal-open');

  const coords = record.coords || [14.5628, 121.0561];
  initAlertDetailMap(coords);
  setTimeout(() => alertDetailMap?.invalidateSize(), 80);
}

const incidentDisplayIdMap = new Map();

function getIncidentPrefix(item) {
  const type = String(item?.assistance_type || item?.category || item?.type || '').toLowerCase();
  const desc = String(item?.incident || item?.incident_detail || item?.incident_description || '').toLowerCase();
  const full = `${type} ${desc}`;

  if (full.includes('med') || full.includes('health') || full.includes('clinic') || full.includes('first aid')) {
    return 'MED';
  }
  if (full.includes('sec') || full.includes('theft') || full.includes('guard')) {
    return 'SEC';
  }
  if (full.includes('vicin') || full.includes('campus') || full.includes('perimeter') || full.includes('boundary') || full.includes('vac')) {
    return 'VIC';
  }
  if (full.includes('urg') || full.includes('fire')) {
    return 'URG';
  }
  return 'MED';
}

function assignIncidentDisplayIds(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) return;

  const sorted = [...incidents].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime() || 0;
    const timeB = new Date(b.created_at || 0).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const counters = {
    MED: 0,
    SEC: 0,
    VIC: 0,
    URG: 0
  };

  sorted.forEach(item => {
    const key = String(item.id || '');
    if (key && incidentDisplayIdMap.has(key)) {
      item.display_id = incidentDisplayIdMap.get(key);
      const match = item.display_id.match(/^(MED|SEC|VIC|VAC|URG)_(\d+)$/i);
      if (match) {
        const rawP = match[1].toUpperCase();
        const p = rawP === 'VAC' ? 'VIC' : rawP;
        const n = parseInt(match[2], 10);
        counters[p] = Math.max(counters[p] || 0, n);
        item.display_id = `${p}_${String(n).padStart(4, '0')}`;
        incidentDisplayIdMap.set(key, item.display_id);
      }
    } else {
      const rawId = String(item.id || item.incident_code || item.incident_id || item.display_id || '');
      const match = rawId.match(/^(MED|SEC|VIC|VAC|URG)_(\d+)$/i);
      if (match) {
        const rawP = match[1].toUpperCase();
        const p = rawP === 'VAC' ? 'VIC' : rawP;
        const n = parseInt(match[2], 10);
        const code = `${p}_${String(n).padStart(4, '0')}`;
        item.display_id = code;
        counters[p] = Math.max(counters[p] || 0, n);
        if (key) incidentDisplayIdMap.set(key, code);
      }
    }
  });

  sorted.forEach(item => {
    if (!item.display_id || item.display_id.startsWith('VAC_')) {
      const prefix = getIncidentPrefix(item);
      counters[prefix] = (counters[prefix] || 0) + 1;
      const code = `${prefix}_${String(counters[prefix]).padStart(4, '0')}`;
      item.display_id = code;
      const key = String(item.id || '');
      if (key) incidentDisplayIdMap.set(key, code);
    }
  });
}

function getIncidentDisplayId(alert) {
  if (!alert) return 'MED_0001';
  const key = String(alert.id || '');
  if (key && incidentDisplayIdMap.has(key)) {
    return incidentDisplayIdMap.get(key);
  }
  if (alert.display_id && !alert.display_id.startsWith('VAC_')) {
    return alert.display_id;
  }
  const rawId = String(alert.id || alert.incident_code || alert.incident_id || alert.display_id || '');
  const match = rawId.match(/^(MED|SEC|VIC|VAC|URG)_(\d+)$/i);
  if (match) {
    const rawP = match[1].toUpperCase();
    const p = rawP === 'VAC' ? 'VIC' : rawP;
    const code = `${p}_${String(match[2]).padStart(4, '0')}`;
    if (key) incidentDisplayIdMap.set(key, code);
    return code;
  }
  const prefix = getIncidentPrefix(alert);
  const code = `${prefix}_0001`;
  if (key) incidentDisplayIdMap.set(key, code);
  return code;
}

function showSuccessfullyResolvedModal(details) {
  const modal = document.getElementById('resolutionSuccessModal');
  if (!modal) return;

  const incidentIdEl = document.getElementById('resolutionSuccessIncidentId');
  const codeEl = document.getElementById('successModalCode');
  const typeEl = document.getElementById('successModalType');
  const timeEl = document.getElementById('successModalTime');
  const summaryEl = document.getElementById('successModalSummaryText');

  const displayCode = details.displayId || details.id || 'INCIDENT';
  if (incidentIdEl) incidentIdEl.textContent = displayCode;
  if (codeEl) codeEl.textContent = displayCode;
  if (typeEl) typeEl.textContent = details.category || 'Emergency';
  if (timeEl) timeEl.textContent = formatDateTime(details.resolvedAt || new Date());
  if (summaryEl) summaryEl.textContent = details.summary || 'Incident resolved.';

  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeSuccessfullyResolvedModal() {
  const modal = document.getElementById('resolutionSuccessModal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.hidden = true;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
}

window.showSuccessfullyResolvedModal = showSuccessfullyResolvedModal;
window.closeSuccessfullyResolvedModal = closeSuccessfullyResolvedModal;
window.openIncidentResolveModal = openIncidentResolveModal;

function openIncidentResolveModal(incidentId) {
  let incident = null;
  let rawId = '';
  if (typeof incidentId === 'string') {
    rawId = incidentId.trim().replace(/^#/, '');
    incident = currentEmergencyIncidentsMap.get(rawId) ||
      currentEmergencyIncidents.find(i => String(i.id) === rawId || String(i.display_id) === rawId || (i.id && i.id.toUpperCase().startsWith(rawId.toUpperCase())));
  }

  if (incident) {
    const student = incident.accounts_student || {};
    const displayId = getIncidentDisplayId(incident);
    const statusText = incident.status || 'Pending';
    const timeFormatted = formatDateTime(incident.created_at);

    currentAlertDetailRecord = {
      id: displayId,
      displayId: displayId,
      actualId: incident.id,
      chatAlertId: incident.id,
      rawIncident: incident,
      category: incident.assistance_type || 'Emergency',
      title: `${incident.assistance_type || 'Emergency'} — ${displayId}`,
      type: incident.incident || incident.assistance_type || 'Emergency SOS',
      status: statusText,
      time: timeFormatted,
      created_at: incident.created_at,
      location: incident.location_address || 'University of Makati Campus',
      student: {
        name: student.student_name || 'UMak Student',
        age: student.student_age ? String(student.student_age) : 'N/A',
        year: student.student_yearlvl || 'N/A',
        college: student.student_college || 'University of Makati',
        contact: student.student_cnum || 'N/A'
      }
    };
  } else if (incidentHistoryRecords[incidentId]) {
    currentAlertDetailRecord = incidentHistoryRecords[incidentId];
  }

  if (typeof window.openResolutionSummary === 'function') {
    window.openResolutionSummary();
  }
}

// ==========================================
// ASSIGN RESPONDER TO RESCUE INCIDENT MODULE
// ==========================================

const RESCUE_UNITS_BY_INCIDENT_TYPE = {
  Medical: [
    { name: 'UMak Campus Clinic Emergency Unit (EMT / Nurse)', phone: '0917-888-MED1', eta: 3, notes: 'EMT Nurse deployed with emergency triage kit and medical equipment.' },
    { name: 'University First Aid & Rapid Triage Squad', phone: '0917-888-MED2', eta: 5, notes: 'First aid squad responding with stretcher and trauma pack.' },
    { name: 'Makati Health Department Ambulance Dispatch', phone: '911 / (02) 8870-1000', eta: 10, notes: 'City ambulance requested for emergency patient transport.' },
    { name: 'Philippine Red Cross Makati Chapter Rescue', phone: '143 / (02) 8790-2300', eta: 12, notes: 'Red Cross disaster medical team alerted for support.' }
  ],
  Security: [
    { name: 'Campus Security Force Patrol Unit', phone: '0917-777-SEC1', eta: 3, notes: 'Campus roving security patrol dispatched for security enforcement.' },
    { name: 'Main Gate & Perimeter Tactical Security Unit', phone: '0917-777-SEC2', eta: 4, notes: 'Tactical security unit responding to gate or perimeter incident.' },
    { name: 'UMak Night Watch & CCTV Response Team', phone: '0917-777-SEC3', eta: 5, notes: 'CCTV control dispatch and roving guard team responding.' },
    { name: 'Makati Police Sub-Station 4 Liaison', phone: '(02) 8882-3111', eta: 10, notes: 'Makati PNP liaison notified for campus assistance.' }
  ],
  'Campus Vicinity': [
    { name: 'Campus Disaster Risk Reduction & Management (CDRRMO)', phone: '0917-999-CDRR', eta: 5, notes: 'CDRRMO team deploying for vicinity hazard assessment.' },
    { name: 'Campus Staff (OHSO)', phone: '0917-999-VIC1', eta: 5, notes: 'Perimeter security patrol verifying boundary telemetry.' },
    { name: 'Campus Facilities & Safety Marshall', phone: '0917-999-SAFE', eta: 6, notes: 'Safety marshals dispatched for hazard mitigation.' },
    { name: 'Makati Public Safety Department (PSD)', phone: '(02) 8819-3270', eta: 8, notes: 'City PSD officers assisting with boundary and traffic control.' }
  ],
  Urgent: [
    { name: 'Emergency Quick Response Team (QRT-1)', phone: '0917-000-QRT1', eta: 3, notes: 'High-priority Quick Response Team deployed for immediate rescue.' },
    { name: 'University Fire & Evacuation Marshal Squad', phone: '0917-999-FIRE', eta: 4, notes: 'Fire and evacuation marshals actively responding.' },
    { name: 'Command Center Rapid Dispatch Unit', phone: '0917-000-DISP', eta: 4, notes: 'Central Command dispatched rapid response personnel.' },
    { name: 'Campus Staff (OHSO)', phone: '0917-999-VIC1', eta: 5, notes: 'Perimeter security patrol verifying boundary telemetry.' },
    { name: 'Bureau of Fire Protection (BFP) Makati Central', phone: '(02) 8818-5150', eta: 8, notes: 'Makati BFP engine unit notified for fire / rescue support.' }
  ]
};

function getRescueCategoryKey(categoryOrType) {
  const str = String(categoryOrType || '').toLowerCase();
  if (str.includes('med') || str.includes('health') || str.includes('clinic') || str.includes('first aid') || str.includes('injury')) {
    return 'Medical';
  }
  if (str.includes('sec') || str.includes('theft') || str.includes('guard') || str.includes('threat') || str.includes('trespass')) {
    return 'Security';
  }
  if (str.includes('vicin') || str.includes('bound') || str.includes('perim') || str.includes('hazard') || str.includes('vac')) {
    return 'Campus Vicinity';
  }
  if (str.includes('urg') || str.includes('fire') || str.includes('evac') || str.includes('critical')) {
    return 'Urgent';
  }
  return 'Medical';
}

let cachedResponderAccounts = [];

async function fetchResponderAccounts(forceRefresh = false) {
  if (!forceRefresh && cachedResponderAccounts && cachedResponderAccounts.length > 0) {
    return cachedResponderAccounts;
  }
  try {
    let res = await fetch('/api/responders');
    if (!res.ok) {
      res = await fetch('/api/admin/accounts');
    }
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.responders) ? data.responders : (Array.isArray(data.users) ? data.users : []);
      if (list.length > 0) {
        cachedResponderAccounts = list;
      }
    }
  } catch (err) {
    console.warn('Failed to load employee responder accounts:', err.message);
  }
  return cachedResponderAccounts;
}

function updateAlertDetailAssigneeBanner(record) {
  const container = document.getElementById('alertDetailAssignee');
  if (!container) return;

  const raw = record?.rawIncident || {};
  const responderName = record?.responder_name || raw.responder_name || '';
  const responderPhone = record?.responder_phone || raw.responder_phone || '';
  const etaMinutes = record?.estimated_arrival_minutes || raw.estimated_arrival_minutes || null;
  const assignedAt = record?.responder_assigned_at || raw.responder_assigned_at || null;

  if (responderName) {
    container.className = 'alert-detail-assignee assigned-state';
    container.innerHTML = `
      <div class="assignee-card assigned">
        <div class="assignee-badge">RESCUE RESPONDER ASSIGNED</div>
        <div class="assignee-meta">
          <strong class="assignee-name">&#128657; ${escapeHtml(responderName)}</strong>
          ${responderPhone ? `<span class="assignee-contact">Contact: <b>${escapeHtml(responderPhone)}</b></span>` : ''}
          ${etaMinutes ? `<span class="assignee-eta">ETA: <b>~${escapeHtml(String(etaMinutes))} mins</b></span>` : ''}
          ${assignedAt ? `<small class="assignee-time">Dispatched: ${escapeHtml(formatDateTime(assignedAt))}</small>` : ''}
        </div>
      </div>
    `;
  } else {
    container.className = 'alert-detail-assignee unassigned-state';
    container.innerHTML = `
      <div class="assignee-card unassigned">
        <div class="assignee-badge-unassigned">&#9888; NO RESPONDER ASSIGNED</div>
        <div class="assignee-meta">
          <span class="assignee-notice">Emergency incident is awaiting response unit assignment. Dispatch unit using the button below.</span>
        </div>
      </div>
    `;
  }
}

async function openAssignResponderModal(incidentId) {
  if (incidentId) {
    let incident = null;
    const rawId = String(incidentId).trim().replace(/^#/, '');
    incident = currentEmergencyIncidentsMap?.get(rawId) ||
      currentEmergencyIncidents?.find(i => String(i.id) === rawId || String(i.display_id) === rawId || (i.id && i.id.toUpperCase().startsWith(rawId.toUpperCase())));
    if (incident) {
      const student = incident.accounts_student || {};
      const displayId = getIncidentDisplayId(incident);
      const statusText = incident.status || 'Pending';
      const timeFormatted = formatDateTime(incident.created_at);

      currentAlertDetailRecord = {
        id: displayId,
        displayId: displayId,
        actualId: incident.id,
        chatAlertId: incident.id,
        rawIncident: incident,
        responder_name: incident.responder_name || '',
        responder_phone: incident.responder_phone || '',
        estimated_arrival_minutes: incident.estimated_arrival_minutes || null,
        responder_assigned_at: incident.responder_assigned_at || null,
        category: incident.assistance_type || 'Emergency',
        title: `${incident.assistance_type || 'Emergency'} — ${displayId}`,
        type: incident.incident || incident.assistance_type || 'Emergency SOS',
        status: statusText,
        time: timeFormatted,
        created_at: incident.created_at,
        location: incident.location_address || 'University of Makati Campus',
        student: {
          name: student.student_name || 'UMak Student',
          contact: student.student_cnum || 'N/A'
        }
      };
    } else if (incidentHistoryRecords[incidentId]) {
      currentAlertDetailRecord = incidentHistoryRecords[incidentId];
    }
  }

  const modal = document.getElementById('assignResponderModal');
  if (!modal) return;
  if (!currentAlertDetailRecord) {
    showToast('Please open or select an incident to assign a responder.', 'warning');
    return;
  }

  const record = currentAlertDetailRecord;
  const raw = record.rawIncident || {};

  // When active incident clicks the assign responder button, the incident will be On going on status
  const hasResponder = Boolean(record.responder_name || raw.responder_name);
  if (hasResponder && !isHeadRole() && !isSystemAdminRole()) {
    showToast('Only HEAD or System Admin accounts can reassign an incident that already has a responder.', 'warning');
    return;
  }
  const catKey = getRescueCategoryKey(record.category || raw.assistance_type || record.type);
  const units = RESCUE_UNITS_BY_INCIDENT_TYPE[catKey] || RESCUE_UNITS_BY_INCIDENT_TYPE['Medical'];

  // Update incident banner in modal
  const typeBadge = document.getElementById('assignIncidentTypeBadge');
  const codeEl = document.getElementById('assignIncidentCode');
  const detailEl = document.getElementById('assignIncidentDetail');
  const locEl = document.getElementById('assignIncidentLocation');
  const typeNameEl = document.getElementById('assignIncidentTypeName');

  if (typeBadge) {
    typeBadge.textContent = `${catKey} Emergency`;
    if (catKey === 'Medical') {
      typeBadge.style.background = '#0284c7';
    } else if (catKey === 'Security') {
      typeBadge.style.background = '#dc2626';
    } else if (catKey === 'Campus Vicinity') {
      typeBadge.style.background = '#d97706';
    } else {
      typeBadge.style.background = '#ea580c';
    }
  }
  if (codeEl) codeEl.textContent = record.id && record.id.startsWith('#') ? record.id : `#${record.id || 'INCIDENT'}`;
  if (detailEl) detailEl.textContent = record.title || record.type || 'Emergency Rescue';
  if (locEl) locEl.textContent = record.location || 'University of Makati Campus';
  if (typeNameEl) typeNameEl.textContent = catKey;

  // Populate specialized rescue units select
  const unitSelect = document.getElementById('assignRescueUnitSelect');
  if (unitSelect) {
    unitSelect.innerHTML = units.map((u, idx) => `
      <option value="${escapeHtml(u.name)}" data-phone="${escapeHtml(u.phone)}" data-eta="${u.eta}" data-notes="${escapeHtml(u.notes)}" ${idx === 0 ? 'selected' : ''}>
        ${escapeHtml(u.name)} &bull; ${escapeHtml(u.phone)} (ETA ~${u.eta}m)
      </option>
    `).join('') + '<option value="__custom__">&plus; Custom / Other Rescue Unit</option>';
  }

  const submitButton = document.getElementById('btnAssignResponderSubmit');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Loading responders...';
  }
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'grid';
  document.body.classList.add('modal-open');

  // Populate registered responder accounts from database
  const accountSelect = document.getElementById('assignResponderAccountSelect');
  if (accountSelect) {
    accountSelect.innerHTML = '<option value="">-- Select registered responder personnel --</option>';
    try {
      const accounts = await fetchResponderAccounts(true);
      // Filter strictly for active responder accounts on database (exclude trainers)
      const responderPersonnel = accounts.filter(a => {
        const role = String(a.employee_role || '').trim().toLowerCase();
        const status = String(a.employee_status || '').trim().toLowerCase();
        const isResp = role === 'responder' || (role.includes('responder') && !role.includes('trainer'));
        const isActive = status === 'active' || !status;
        return isResp && isActive;
      });
      const listToDisplay = responderPersonnel;

      listToDisplay.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.employee_name;
        opt.dataset.id = acc.employee_id || '';
        opt.dataset.email = acc.employee_email || '';
        opt.dataset.role = acc.employee_role || 'Responder';
        const responderPhoneNum = acc.employee_phone || acc.phone || '0917-888-5053';
        opt.dataset.phone = responderPhoneNum;
        opt.textContent = `${acc.employee_name} (${acc.employee_role || 'Responder'}) - ${acc.employee_email}`;
        accountSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn('Could not populate responder accounts in modal:', e);
    }
  }

  // Form input defaults
  const nameInput = document.getElementById('assignResponderNameInput');
  const phoneInput = document.getElementById('assignResponderPhoneInput');
  const etaSelect = document.getElementById('assignEtaSelect');
  const notesTextarea = document.getElementById('assignDispatchNotes');
  const statusSelect = document.getElementById('assignStatusTransition');

  const existingName = record.responder_name || raw.responder_name;
  const existingPhone = record.responder_phone || raw.responder_phone;
  const existingEta = record.estimated_arrival_minutes || raw.estimated_arrival_minutes;

  if (existingName) {
    if (nameInput) nameInput.value = existingName;
    if (phoneInput) phoneInput.value = existingPhone || '';
    if (etaSelect && existingEta) etaSelect.value = String(existingEta);
    if (accountSelect) {
      const matchingAccount = Array.from(accountSelect.options).find(o => o.value === existingName || o.textContent.includes(existingName));
      if (matchingAccount) {
        accountSelect.value = matchingAccount.value;
        if (phoneInput && !existingPhone) {
          phoneInput.value = matchingAccount.dataset.phone || '';
        }
      }
    }
    if (unitSelect) {
      const matchingOpt = Array.from(unitSelect.options).find(o => o.value === existingName);
      if (matchingOpt) unitSelect.value = existingName;
    }
  } else {
    // Fresh dispatch:
    // Dropdown starts unselected, and Contact / Radio Channel field is empty.
    // The number will show only once the user clicks / selects a responder name.
    if (accountSelect) accountSelect.value = '';
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (etaSelect) etaSelect.value = '5';
    if (notesTextarea) notesTextarea.value = '';
    if (unitSelect) unitSelect.value = '';
  }

  if (statusSelect) {
    statusSelect.value = 'On Going';
  }

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Dispatch & Assign Responder';
  }
}

function closeAssignResponderModal() {
  const modal = document.getElementById('assignResponderModal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.hidden = true;
    modal.style.display = 'none';
  }
}

function handleRescueUnitSelectionChange(val) {
  const nameInput = document.getElementById('assignResponderNameInput');
  const phoneInput = document.getElementById('assignResponderPhoneInput');
  const etaSelect = document.getElementById('assignEtaSelect');
  const notesTextarea = document.getElementById('assignDispatchNotes');
  const unitSelect = document.getElementById('assignRescueUnitSelect');
  const accountSelect = document.getElementById('assignResponderAccountSelect');

  if (accountSelect) accountSelect.value = '';

  if (val === '__custom__') {
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    if (phoneInput) phoneInput.value = '';
    return;
  }

  const selectedOpt = unitSelect?.selectedOptions?.[0];
  if (selectedOpt) {
    if (nameInput) nameInput.value = val;
    if (phoneInput && selectedOpt.dataset.phone) phoneInput.value = selectedOpt.dataset.phone;
    if (etaSelect && selectedOpt.dataset.eta) etaSelect.value = selectedOpt.dataset.eta;
    if (notesTextarea && selectedOpt.dataset.notes) notesTextarea.value = selectedOpt.dataset.notes;
  }
}

function handleResponderAccountChange(val) {
  const nameInput = document.getElementById('assignResponderNameInput');
  const phoneInput = document.getElementById('assignResponderPhoneInput');
  const accountSelect = document.getElementById('assignResponderAccountSelect');
  const selectedOpt = accountSelect?.selectedOptions?.[0];

  if (!val) {
    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    return;
  }

  if (nameInput) nameInput.value = val;
  if (phoneInput) {
    // Show only the number on the database of responder
    phoneInput.value = selectedOpt?.dataset?.phone || '';
  }
}

async function handleAssignResponderSubmit(event) {
  if (event) event.preventDefault();
  if (!currentAlertDetailRecord) {
    alert('No active incident selected.');
    return;
  }

  const accountSelect = document.getElementById('assignResponderAccountSelect');
  const nameInput = document.getElementById('assignResponderNameInput');
  const phoneInput = document.getElementById('assignResponderPhoneInput');
  const etaSelect = document.getElementById('assignEtaSelect');
  const notesTextarea = document.getElementById('assignDispatchNotes');
  const statusSelect = document.getElementById('assignStatusTransition');
  const submitBtn = document.getElementById('btnAssignResponderSubmit');

  const responderName = accountSelect?.value?.trim() || nameInput?.value?.trim() || '';
  if (!responderName) {
    alert('Please select an Assigned Registered Responder.');
    accountSelect?.focus();
    return;
  }

  const selectedOpt = accountSelect?.selectedOptions?.[0];
  const responderPhone = phoneInput?.value?.trim() || selectedOpt?.dataset?.phone || '';
  const eta = etaSelect ? parseInt(etaSelect.value, 10) || 5 : 5;
  const status = statusSelect ? statusSelect.value : 'On Going';
  const dispatchNotes = notesTextarea?.value?.trim() || '';

  const incidentId = currentAlertDetailRecord.actualId ||
    currentAlertDetailRecord.id ||
    currentAlertDetailRecord.rawIncident?.id;
  const isReassignment = Boolean(currentAlertDetailRecord.responder_name || currentAlertDetailRecord.rawIncident?.responder_name);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Dispatching Unit...';
  }

  try {
    const payload = {
      responder_name: responderName,
      responder_phone: responderPhone,
      estimated_arrival_minutes: eta,
      status: status,
      dispatch_notes: dispatchNotes
    };

    const res = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/assign`, {
      method: 'PUT',
      headers: (() => {
        const headers = { 'Content-Type': 'application/json' };
        const sessionId = typeof getSessionId === 'function' ? getSessionId() : '';
        if (sessionId) headers['x-session-id'] = sessionId;

        // Grab the user data
        const role = getCurrentUserRole();
        const name = getCurrentUserName();
        const empId = getCurrentUserEmployeeId();

        // Send it to the Vercel backend
        if (role) headers['x-employee-role'] = role;
        if (name) headers['x-employee-name'] = name;
        if (empId) headers['x-employee-id'] = empId;

        return headers;
      })(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to assign responder (HTTP ${res.status})`);
    }

    const result = await res.json();
    const updatedIncident = result.incident || {};

    // Update in-memory currentAlertDetailRecord
    currentAlertDetailRecord.responder_name = responderName;
    currentAlertDetailRecord.responder_phone = responderPhone;
    currentAlertDetailRecord.estimated_arrival_minutes = eta;
    currentAlertDetailRecord.responder_assigned_at = updatedIncident.responder_assigned_at || new Date().toISOString();
    currentAlertDetailRecord.status = status;

    if (currentAlertDetailRecord.rawIncident) {
      Object.assign(currentAlertDetailRecord.rawIncident, {
        responder_name: responderName,
        responder_phone: responderPhone,
        estimated_arrival_minutes: eta,
        responder_assigned_at: currentAlertDetailRecord.responder_assigned_at,
        status: status,
        updated_at: new Date().toISOString()
      });
    }

    // Update in currentEmergencyIncidents & currentEmergencyIncidentsMap
    if (Array.isArray(currentEmergencyIncidents)) {
      const found = currentEmergencyIncidents.find(i => String(i.id) === String(incidentId) || String(i.display_id) === String(incidentId));
      if (found) {
        Object.assign(found, {
          responder_name: responderName,
          responder_phone: responderPhone,
          estimated_arrival_minutes: eta,
          responder_assigned_at: currentAlertDetailRecord.responder_assigned_at,
          status: status,
          updated_at: new Date().toISOString()
        });
      }
    }
    if (currentEmergencyIncidentsMap) {
      const mapItem = currentEmergencyIncidentsMap.get(String(incidentId));
      if (mapItem) {
        Object.assign(mapItem, {
          responder_name: responderName,
          responder_phone: responderPhone,
          estimated_arrival_minutes: eta,
          responder_assigned_at: currentAlertDetailRecord.responder_assigned_at,
          status: status,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Update timeline history
    if (!Array.isArray(currentAlertDetailRecord.history)) {
      currentAlertDetailRecord.history = [];
    }
    const respStepIndex = currentAlertDetailRecord.history.findIndex(h => h.step.toLowerCase().includes('responder') || h.step.toLowerCase().includes('unit'));
    const newStep = {
      step: `Responder Dispatched: ${responderName} (ETA ~${eta} mins)`,
      time: formatDateTime(new Date()),
      complete: true
    };
    if (respStepIndex >= 0) {
      currentAlertDetailRecord.history[respStepIndex] = newStep;
    } else {
      if (currentAlertDetailRecord.history.length > 1) {
        currentAlertDetailRecord.history.splice(currentAlertDetailRecord.history.length - 1, 0, newStep);
      } else {
        currentAlertDetailRecord.history.push(newStep);
      }
    }

    // Refresh UI across modules
    renderIncidentModal(currentAlertDetailRecord);
    if (typeof renderFullIncidentsTable === 'function') renderFullIncidentsTable(currentEmergencyIncidents);
    if (typeof renderOverviewIncidents === 'function') renderOverviewIncidents(currentEmergencyIncidents);
    if (typeof renderOverviewAlertNotifications === 'function') renderOverviewAlertNotifications(currentEmergencyIncidents);
    if (typeof updateIncidentFilterCounts === 'function') updateIncidentFilterCounts(currentEmergencyIncidents);
    if (typeof renderResponderRescueNotifications === 'function') renderResponderRescueNotifications(currentEmergencyIncidents);

    closeAssignResponderModal();

    openAssignSuccessModal({
      code: currentAlertDetailRecord.id || incidentId,
      responderName: responderName,
      responderPhone: responderPhone,
      eta: eta,
      status: status,
      isReassignment
    });

    showToast(`Rescue unit "${responderName}" ${isReassignment ? 'reassigned' : 'assigned'} and dispatched!`, 'success');

    if (typeof loadIncidentsData === 'function') {
      loadIncidentsData();
    }
  } catch (err) {
    console.error('Assignment error:', err);
    showToast(`Failed to assign responder: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Dispatch & Assign Responder';
    }
  }
}

function openAssignSuccessModal(details = {}) {
  const modal = document.getElementById('assignSuccessModal');
  if (!modal) return;

  const titleEl = document.getElementById('assignSuccessTitle');
  const messageEl = modal.querySelector('.assign-success-message');
  const codeEl = document.getElementById('assignSuccessIncidentCode');
  const respEl = document.getElementById('assignSuccessResponderName');
  const phoneEl = document.getElementById('assignSuccessPhone');
  const statusEl = document.getElementById('assignSuccessStatus');
  const etaEl = document.getElementById('assignSuccessEta');

  if (titleEl) titleEl.textContent = details.isReassignment ? 'Responder Reassigned' : 'Responder Assigned';
  if (messageEl) {
    messageEl.textContent = details.isReassignment
      ? 'A new responder has been assigned to this emergency incident.'
      : 'A responder has been assigned to this emergency incident.';
  }
  const displayCode = details.code && String(details.code).startsWith('#') ? details.code : `#${details.code || 'INCIDENT'}`;
  if (codeEl) codeEl.textContent = displayCode;
  if (respEl) respEl.textContent = details.responderName || 'Assigned Responder';
  if (phoneEl) phoneEl.textContent = details.responderPhone || 'Direct Dispatch Radio';
  if (statusEl) statusEl.textContent = details.status || 'On Going';
  if (etaEl) etaEl.textContent = details.eta ? `~${details.eta} minutes` : '~5 minutes';

  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeAssignSuccessModal() {
  const modal = document.getElementById('assignSuccessModal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.hidden = true;
    modal.style.display = 'none';
  }
  const alertDetailsOverlay = document.getElementById('alertDetailsOverlay');
  if (!alertDetailsOverlay || alertDetailsOverlay.hidden) {
    document.body.classList.remove('modal-open');
  }
}

window.openAssignResponderModal = openAssignResponderModal;
window.closeAssignResponderModal = closeAssignResponderModal;
window.openAssignSuccessModal = openAssignSuccessModal;
window.closeAssignSuccessModal = closeAssignSuccessModal;
window.handleRescueUnitSelectionChange = handleRescueUnitSelectionChange;
window.handleResponderAccountChange = handleResponderAccountChange;
window.handleAssignResponderSubmit = handleAssignResponderSubmit;
window.updateAlertDetailAssigneeBanner = updateAlertDetailAssigneeBanner;

function openIncidentDetails(incidentIdOrRow) {
  let incident = null;
  let rawId = '';

  if (typeof incidentIdOrRow === 'string') {
    rawId = incidentIdOrRow.trim().replace(/^#/, '');
    incident = currentEmergencyIncidentsMap.get(rawId) ||
      currentEmergencyIncidents.find(i => String(i.id) === rawId || String(i.display_id) === rawId || (i.id && i.id.toUpperCase().startsWith(rawId.toUpperCase())));
  } else if (incidentIdOrRow instanceof HTMLElement) {
    const row = incidentIdOrRow;
    rawId = (row.dataset.incidentId || row.dataset.displayId || row.querySelector('td')?.textContent || '').trim().replace(/^#/, '');
    if (rawId) {
      incident = currentEmergencyIncidentsMap.get(rawId) ||
        currentEmergencyIncidents.find(i => String(i.id) === rawId || String(i.display_id) === rawId || (i.id && i.id.toUpperCase().startsWith(rawId.toUpperCase())));
    }
  }

  if (incident) {
    const student = incident.accounts_student || {};
    const displayId = getIncidentDisplayId(incident);
    const hasResponder = Boolean(incident.responder_name && incident.responder_name.trim());
    const rawStatus = (incident.status || '').toLowerCase().trim();
    let statusText = 'Active';
    if (rawStatus === 'resolved') {
      statusText = 'Resolved';
    } else if (rawStatus === 'cancelled' || rawStatus === 'canceled') {
      statusText = 'Cancelled';
    } else if (rawStatus === 'ongoing' || rawStatus === 'pending' || hasResponder) {
      statusText = 'On Going';
    } else {
      statusText = 'Active';
    }
    const timeFormatted = formatDateTime(incident.created_at);

    // Build timeline steps from real incident timestamps
    const history = [
      { step: 'Emergency SOS Reported', time: timeFormatted, complete: true }
    ];

    if (incident.responder_assigned_at) {
      history.push({
        step: `Responder Assigned: ${incident.responder_name || 'Safety Unit'}`,
        time: formatDateTime(incident.responder_assigned_at),
        complete: true
      });
    } else if (incident.responder_name) {
      history.push({
        step: `Assigned to ${incident.responder_name}`,
        time: timeFormatted,
        complete: true
      });
    } else {
      history.push({
        step: 'Awaiting Responder Dispatch',
        time: 'Pending dispatch',
        complete: statusText === 'On Going' || statusText === 'Resolved'
      });
    }

    if (statusText === 'Resolved') {
      history.push({
        step: 'Incident Resolved & Closed',
        time: formatDateTime(incident.resolved_at || incident.updated_at),
        complete: true
      });
    } else if (statusText === 'Cancelled' || statusText === 'Canceled') {
      history.push({
        step: incident.cancellation_reason ? `Alert Cancelled (${incident.cancellation_reason})` : 'Alert Cancelled by Student/System',
        time: formatDateTime(incident.cancelled_at || incident.updated_at),
        complete: true
      });
    } else if (statusText === 'On Going') {
      history.push({
        step: 'Response Unit En Route / In Progress',
        time: incident.estimated_arrival_minutes ? `ETA ~${incident.estimated_arrival_minutes} min(s)` : 'En route / in progress',
        complete: true
      });
    } else {
      history.push({
        step: 'Awaiting Dispatch Action',
        time: '—',
        complete: false
      });
    }

    const record = {
      id: displayId,
      displayId: displayId,
      actualId: incident.id,
      chatAlertId: incident.id,
      rawIncident: incident,
      responder_name: incident.responder_name || '',
      responder_phone: incident.responder_phone || '',
      estimated_arrival_minutes: incident.estimated_arrival_minutes || null,
      responder_assigned_at: incident.responder_assigned_at || null,
      created_at: incident.created_at,
      category: incident.assistance_type || 'Emergency',
      title: `${incident.assistance_type || 'Emergency'} — ${displayId}`,
      type: incident.incident || incident.assistance_type || 'Emergency SOS',
      status: statusText,
      time: timeFormatted,
      location: incident.location_address || 'University of Makati Campus',
      floor: 'Ground Level',
      room: incident.location_address || 'Campus Grounds',
      userId: student.student_id || (student.user_id ? String(student.user_id) : 'N/A'),
      description: `Reported Emergency: ${incident.incident || 'Safety assistance requested'}. Category: ${incident.assistance_type}. Location: ${incident.location_address || 'UMak'}.${incident.responder_name ? ` Dispatched Responder: ${incident.responder_name}.` : ''}${incident.cancellation_reason ? ` Note: ${incident.cancellation_reason}` : ''}`,
      student: {
        name: student.student_name || 'UMak Student',
        age: student.student_age ? String(student.student_age) : 'N/A',
        year: student.student_yearlvl || 'N/A',
        college: student.student_college || 'University of Makati',
        contact: student.student_cnum || 'N/A',
        address: student.student_address || 'University Campus',
        primaryName: student.primary_cperson || 'Emergency Contact',
        primaryContact: student.primary_cnum || 'N/A',
        primaryAddress: student.student_address || 'Makati City',
        secondaryName: student.secondary_cperson || 'Emergency Support',
        secondaryContact: student.secondary_cnum || 'N/A',
        secondaryAddress: 'University Campus'
      },
      history: history,
      coords: [
        incident.latitude !== null && incident.latitude !== undefined ? incident.latitude : 14.5628,
        incident.longitude !== null && incident.longitude !== undefined ? incident.longitude : 121.0561
      ]
    };

    if (isResponderRole() && isIncidentAssignedToCurrentResponder(record)) {
      startResponderLocationTracking(record.actualId || record.chatAlertId || record.id);
    }
    renderIncidentModal(record);
    return;
  }

  let record = null;
  const cleanId = rawId;
  if (incidentHistoryRecords[cleanId] || incidentHistoryRecords[incidentIdOrRow]) {
    record = incidentHistoryRecords[cleanId] || incidentHistoryRecords[incidentIdOrRow];
  }

  if (record) {
    renderIncidentModal(record);
  }
}

function showAlertDetails(alertItem) {
  if (alertItem && alertItem.dataset.incidentId) {
    openIncidentDetails(alertItem.dataset.incidentId);
    return;
  }
  const alertType = alertItem.dataset.alertType || 'security';
  let alertStatus = alertItem.dataset.status || 'ongoing';
  if (alertStatus.toLowerCase() === 'pending') alertStatus = 'ongoing';
  const alertTitle = alertItem.querySelector('strong')?.textContent.trim() || 'Emergency Alert';
  const alertHeading = alertItem.querySelector('h3')?.textContent.trim() || 'Incident';
  const alertTime = alertItem.querySelector('small')?.textContent.trim() || 'Today';
  const incidentNumber = alertHeading.split(/\s[—-]\s|\s+/)[0].replace(/^#/, '');

  if (incidentHistoryRecords[incidentNumber]) {
    renderIncidentModal(incidentHistoryRecords[incidentNumber]);
    return;
  }

  const detailsByType = {
    medical: { category: 'Medical', type: 'First Aid Assistance', location: 'Student Center Plaza, 2nd Floor' },
    security: { category: 'Security', type: 'Campus Security Alert', location: 'J.P. Rizal Ext. Campus Gate' },
    vicinity: { category: 'Campus Vicinity', type: 'Boundary Activity Review', location: 'Campus Boundary, University of Makati' }
  };
  const details = detailsByType[alertType] || { category: 'Emergency', type: 'Safety Incident', location: 'University of Makati Campus' };
  const readableStatus = (alertStatus === 'ongoing' || alertStatus === 'on-going') ? 'On Going' : (alertStatus.charAt(0).toUpperCase() + alertStatus.slice(1));

  const record = {
    id: incidentNumber,
    category: details.category,
    title: alertTitle,
    type: details.type,
    status: readableStatus,
    time: alertTime,
    location: details.location,
    floor: '2nd Floor',
    room: details.location,
    userId: '10000056',
    description: alertItem.querySelector('p')?.textContent.trim() || 'No additional details available.',
    student: {
      name: 'Jolhehem Billones',
      age: '20',
      year: '2nd Year',
      college: 'College of Health Sciences',
      contact: '0917 123 4567',
      address: 'University of Makati Campus Residence',
      primaryName: 'Maria Billones',
      primaryContact: '0918 234 5678',
      primaryAddress: 'Taguig City, Metro Manila',
      secondaryName: 'Jose Billones',
      secondaryContact: '0920 345 6789',
      secondaryAddress: 'Makati City, Metro Manila'
    },
    history: [
      { step: 'Report Logged', time: alertTime, complete: true },
      { step: 'Acknowledged by Safety Desk', time: alertTime, complete: true },
      { step: 'Response Unit In Progress', time: alertTime, complete: true },
      { step: readableStatus === 'Resolved' ? 'Incident Resolved & Filed' : 'Resolution Pending', time: readableStatus === 'Resolved' ? alertTime : '—', complete: readableStatus === 'Resolved' }
    ],
    coords: [14.5628, 121.0561]
  };

  renderIncidentModal(record);
}

function initIncidentDetails() {
  const recentRows = document.querySelectorAll('#incidentPanel tbody tr');
  const fullRows = document.querySelectorAll('#fullIncidentsTable tbody tr');

  const bindRowClick = (row) => {
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', 'View incident details and history');
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openIncidentDetails(row);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button')) return;
        e.preventDefault();
        openIncidentDetails(row);
      }
    });
  };

  recentRows.forEach(bindRowClick);
  fullRows.forEach(bindRowClick);
}

let routingControl = null;
let responderCurrentMarker = null;
let inAppNavWatchId = null;

function initAlertDetailMap(coords = [14.5628, 121.0561]) {
  const mapElement = document.querySelector('#alertDetailMap');
  if (!mapElement || typeof L === 'undefined') return;

  // Stop previous live tracking if you open a new incident
  if (inAppNavWatchId !== null) {
    navigator.geolocation.clearWatch(inAppNavWatchId);
    inAppNavWatchId = null;
  }

  // 1. Wipe any previous navigation paths when opening a new incident
  if (routingControl) {
    alertDetailMap.removeControl(routingControl);
    routingControl = null;
  }
  if (responderCurrentMarker) {
    alertDetailMap.removeLayer(responderCurrentMarker);
    responderCurrentMarker = null;
  }

  // 2. Reset the Navigate button text
  const navBtn = document.getElementById('btnInAppNavigate');
  if (navBtn) {
    navBtn.disabled = false;
    navBtn.innerHTML = '🗺️ Start Navigation';
    navBtn.style.background = '#0f172a';
  }

  // 3. Load the base map
  if (alertDetailMap) {
    alertDetailMap.setView(coords, 15);
    if (alertDetailMarker) alertDetailMarker.setLatLng(coords);
    setTimeout(() => alertDetailMap.invalidateSize(), 50);
    return;
  }

  alertDetailMap = L.map(mapElement, { zoomControl: true }).setView(coords, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(alertDetailMap);

  alertDetailMarker = L.marker(coords).addTo(alertDetailMap);
  L.circle(coords, { radius: 350, color: '#2d7fc1', fillColor: '#79aee0', fillOpacity: 0.25 }).addTo(alertDetailMap);
}
async function startInAppNavigation() {
  if (!currentAlertDetailRecord || !currentAlertDetailRecord.coords) {
    showToast('GPS coordinates not available for this incident.', 'warning');
    return;
  }

  if (!navigator.geolocation) {
    showToast('Location tracking is not supported by your browser.', 'error');
    return;
  }

  const btn = document.getElementById('btnInAppNavigate');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Loading Map Engine...';
  }

  // --- 1. DYNAMICALLY INJECT THE ROUTING LIBRARY IF MISSING ---
  if (typeof L.Routing === 'undefined') {
    await new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.min.js';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  if (typeof L.Routing === 'undefined') {
    showToast('Failed to download routing engine. Check connection.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '🗺️ Start Navigation'; }
    return;
  }

  if (btn) btn.innerHTML = '📍 Acquiring GPS...';

  // Clear any existing GPS stream
  if (inAppNavWatchId !== null) {
    navigator.geolocation.clearWatch(inAppNavWatchId);
  }

  // --- 2. START LIVE GPS TRACKING ---
  inAppNavWatchId = navigator.geolocation.watchPosition((position) => {
    const rLat = position.coords.latitude;
    const rLng = position.coords.longitude;
    const incidentCoords = currentAlertDetailRecord.coords;

    // A. Move the green dot if it exists, otherwise create it
    if (responderCurrentMarker) {
      responderCurrentMarker.setLatLng([rLat, rLng]);
    } else {
      responderCurrentMarker = L.circleMarker([rLat, rLng], {
        radius: 8,
        fillColor: "#16a34a",
        color: "#fff",
        weight: 2,
        fillOpacity: 1
      }).addTo(alertDetailMap).bindPopup("Your Live Location").openPopup();
    }

    // B. Recalculate the blue path if it exists, otherwise create it
    if (routingControl) {
      routingControl.setWaypoints([
        L.latLng(rLat, rLng),
        L.latLng(incidentCoords[0], incidentCoords[1])
      ]);
    } else {
      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(rLat, rLng),
          L.latLng(incidentCoords[0], incidentCoords[1])
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        show: false, // Hides the bulky text directions box
        lineOptions: {
          styles: [{ color: '#3b82f6', weight: 5, opacity: 0.9 }]
        },
        createMarker: function () { return null; },
        fitSelectedRoutes: true
      }).addTo(alertDetailMap);
    }

    if (btn) {
      btn.innerHTML = '📍 Live Navigation Active';
      btn.style.background = '#16a34a';
    }
  }, (error) => {
    showToast('GPS error or signal lost.', 'warning');
  }, {
    enableHighAccuracy: true,
    maximumAge: 0, // Forces the browser to get fresh data, not cached
    timeout: 10000
  });
}
window.startInAppNavigation = startInAppNavigation;

function openAlertsFromNotification(event) {
  event.preventDefault();
  switchView('alerts');
  window.location.hash = '#alerts';

  const activeAlert = document.querySelector('.alert-item[data-status="active"]') || document.querySelector('.alert-item[data-status="ongoing"]');
  if (activeAlert) showAlertDetails(activeAlert);
}

// 5. Incident Filtering & Search
function initIncidentFilters() {
  const filterBtns = document.querySelectorAll('.incidents-filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeIncidentFilter = btn.dataset.statusFilter || 'all';
      renderFullIncidentsTable();
    });
  });

  const searchInput = document.querySelector('#incidentSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderFullIncidentsTable();
    });
  }

  const fullTableBody = document.getElementById('fullIncidentsTableBody');
  if (fullTableBody) {
    fullTableBody.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const row = e.target.closest('tr');
      if (row && row.dataset.incidentId) {
        openIncidentDetails(row.dataset.incidentId);
      }
    });
  }

  const overviewTableBody = document.getElementById('overviewIncidentsTableBody');
  if (overviewTableBody) {
    overviewTableBody.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const row = e.target.closest('tr');
      if (row && row.dataset.incidentId) {
        openIncidentDetails(row.dataset.incidentId);
      }
    });
  }
}

// 6. Users Search
function initUserSearch() {
  const userSearch = document.querySelector('#userSearchInput');
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderFullUsersTable();
        return;
      }
      const filtered = currentDashboardUsers.filter((u) => {
        const name = (u.employee_name || '').toLowerCase();
        const email = (u.employee_email || '').toLowerCase();
        const role = (u.employee_role || '').toLowerCase();
        const id = (u.employee_id || '').toLowerCase();
        const status = (u.employee_status || '').toLowerCase();
        return name.includes(query) || email.includes(query) || role.includes(query) || id.includes(query) || status.includes(query);
      });
      renderFullUsersTable(filtered);
    });
  }
}

function initStudentUserSearch() {
  const studentSearch = document.querySelector('#studentSearchInput');
  if (studentSearch) {
    studentSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderStudentUsersTable();
        return;
      }
      const filtered = currentStudentUsers.filter((s) => {
        const id = (s.student_id || '').toLowerCase();
        const name = (s.student_name || '').toLowerCase();
        const email = (s.student_email || '').toLowerCase();
        const college = (s.student_college || '').toLowerCase();
        const yearlvl = (s.student_yearlvl || '').toLowerCase();
        const cnum = (s.student_cnum || '').toLowerCase();
        const status = (s.student_status || '').toLowerCase();
        return id.includes(query) || name.includes(query) || email.includes(query) || college.includes(query) || yearlvl.includes(query) || cnum.includes(query) || status.includes(query);
      });
      renderStudentUsersTable(filtered);
    });
  }
}

// 7. Live Supabase Data Integration
let currentDashboardUsers = [];
let activeUserFilter = 'all';
let currentStudentUsers = [];
let activeStudentFilter = 'all';
let activeTeamsAccountFilter = 'all';
let currentEmergencyIncidents = [];
let currentEmergencyIncidentsMap = new Map();
let activeIncidentFilter = 'all';

function initTeamsModule() {
  const searchInput = document.getElementById('teamSearchInput');
  const filterContainer = document.getElementById('teamStatusFilters');
  const exportBtn = document.getElementById('teamExportBtn');
  const toolbarExportBtn = document.getElementById('teamToolbarExportBtn');
  if (!filterContainer || !document.getElementById('teamsAdminUsersTableBody')) return;

  searchInput?.addEventListener('input', renderTeamsAdminUsersTable);
  exportBtn?.addEventListener('click', openTeamsExportDrawer);
  toolbarExportBtn?.addEventListener('click', openTeamsExportDrawer);
  filterContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-team-filter]');
    if (!button) return;
    filterContainer.querySelectorAll('button[data-team-filter]').forEach((filter) => filter.classList.remove('active'));
    button.classList.add('active');
    activeTeamsAccountFilter = button.dataset.teamFilter;
    renderTeamsAdminUsersTable();
  });
  loadTeamsAdminAccounts();
}

async function loadAuditAccounts() {
  if (typeof loadAdminRecentActivities === 'function') {
    return loadAdminRecentActivities();
  }
  return;

  try {
    const response = await fetch('/api/admin/accounts');
    if (!response.ok) throw new Error('Failed to fetch employee accounts.');
    const result = await response.json();
    const accounts = Array.isArray(result.users) ? result.users : [];

    if (countBadge) {
      countBadge.textContent = `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`;
    }

    if (selectEl && accounts.length > 0) {
      const currentVal = selectEl.value;
      const opts = ['<option value="all">All Admin Accounts</option>'];
      accounts.forEach(acc => {
        opts.push(`<option value="${escapeHtml(acc.employee_id || acc.employee_email)}">${escapeHtml(acc.employee_name || 'Admin')} (${escapeHtml(acc.employee_role || 'Staff')})</option>`);
      });
      selectEl.innerHTML = opts.join('');
      if (currentVal) selectEl.value = currentVal;
    }

    if (accounts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No employee accounts found.</td></tr>';
      return;
    }

    tableBody.innerHTML = accounts.map((account) => `
      <tr>
        <td>${escapeHtml(account.employee_email || '')}</td>
        <td>${escapeHtml(account.employee_name || '')}</td>
        <td>${escapeHtml(account.employee_role || '')}</td>
        <td>${escapeHtml(account.employee_status || '')}</td>
        <td>${escapeHtml(formatAuditTimestamp(account.employee_created_at))}</td>
        <td>${escapeHtml(formatAuditTimestamp(account.employee_last_login))}</td>
      </tr>
    `).join('');

    if (typeof loadAdminRecentActivities === 'function') {
      loadAdminRecentActivities();
    }
  } catch (error) {
    console.warn('Audit employee accounts fetch notice:', error.message);
    tableBody.innerHTML = '<tr><td colspan="6">Unable to load employee accounts.</td></tr>';
  }
}

function formatAuditTimestamp(value) {
  if (!value) return 'Never';

  const timestamp = String(value).trim().replace(' ', 'T');
  const isoTimestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}Z`;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace(/\s*(?:UTC|GMT[+-]?\d*|\([A-Za-z\s]+\))\s*$/i, '').trim();
  }

  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

let cachedAdminActivities = [];
let cachedAccountsSummary = [];
let currentAuditViewMode = 'cards';

function getRoleAvatarClass(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('head')) return 'role-head';
  if (r.includes('admin')) return 'role-admin';
  if (r.includes('trainer')) return 'role-trainer';
  if (r.includes('responder')) return 'role-responder';
  return '';
}

function getInitials(name) {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeActivityTime(isoString) {
  if (!isoString) return 'Recently';
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return 'Recently';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullActivityTime(isoString) {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

let auditRealtimeEventSource = null;
let auditRealtimePollTimer = null;
let lastKnownActivityTimestamp = null;

async function loadAdminRecentActivities(showSpinner = true, isManual = false) {
  const cardsContainer = document.getElementById('auditAccountCardsView');
  const tableBody = document.getElementById('auditActivityTimelineTableBody');
  const statsEl = document.getElementById('auditStatsSummary');
  const selectEl = document.getElementById('auditAccountFilterSelect');
  const refreshBtn = document.getElementById('btnRefreshAudit') || document.querySelector('.btn-refresh-audit');
  const refreshIcon = refreshBtn?.querySelector('iconify-icon');
  const refreshText = document.getElementById('btnRefreshAuditText') || refreshBtn?.querySelector('span');

  if (refreshIcon) {
    refreshIcon.style.animation = 'auditSpin 0.7s linear infinite';
  }
  if (refreshBtn && isManual) {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('is-refreshing');
    if (refreshText) refreshText.textContent = 'Refreshing...';
  }

  if (showSpinner && cardsContainer && cardsContainer.children.length === 0) {
    cardsContainer.innerHTML = `
      <div class="audit-activity-loading">
        <div class="audit-spinner"></div>
        <p>Loading recent activities for each admin account...</p>
      </div>`;
  }

  try {
    if ((!window.currentReportsData || !window.currentReportsData.incidents) && typeof loadReportsData === 'function') {
      loadReportsData().catch(() => {});
    }

    const res = await fetch(`/api/admin/activities?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) throw new Error('Failed to load activity logs.');
    const data = await res.json();
    cachedAdminActivities = Array.isArray(data.activities) ? data.activities : [];
    cachedAccountsSummary = Array.isArray(data.accountsSummary) ? data.accountsSummary : [];

    // Ensure account data matches Teams and Profile modules exactly
    if (Array.isArray(window.currentDashboardUsers) && window.currentDashboardUsers.length > 0) {
      cachedAccountsSummary = cachedAccountsSummary.map(acc => {
        const u = window.currentDashboardUsers.find(du =>
          (du.employee_id && acc.employee_id && du.employee_id === acc.employee_id) ||
          (du.employee_email && acc.email && du.employee_email.toLowerCase() === acc.email.toLowerCase())
        );
        if (u) {
          return {
            ...acc,
            name: u.employee_name || acc.name,
            email: u.employee_email || acc.email,
            role: u.employee_role || acc.role,
            status: u.employee_status || acc.status,
            created_at: u.employee_created_at || acc.created_at,
            last_sign_in: u.employee_last_login || acc.last_sign_in
          };
        }
        return acc;
      });
    }

    if (cachedAdminActivities.length > 0) {
      lastKnownActivityTimestamp = cachedAdminActivities[0].timestamp;
    }

    if (selectEl) {
      const currentVal = selectEl.value || 'all';
      selectEl.innerHTML = `
        <option value="all">All Account</option>
        <option value="HEAD">Head</option>
        <option value="System Admin">System Admin</option>
        <option value="Responder">Responder</option>
        <option value="Trainer">Trainer</option>
      `;
      if (['all', 'HEAD', 'System Admin', 'Responder', 'Trainer'].includes(currentVal)) {
        selectEl.value = currentVal;
      } else {
        selectEl.value = 'all';
      }
    }

    filterAdminActivities();

    if (isManual && refreshText) {
      refreshText.textContent = 'Refreshed!';
    }
  } catch (err) {
    console.warn('Failed to load admin activities:', err.message);
    if (cardsContainer && cardsContainer.children.length === 0) {
      cardsContainer.innerHTML = '<div class="audit-empty-state"><p>Unable to load admin activities.</p></div>';
    }
    if (isManual && refreshText) {
      refreshText.textContent = 'Refresh';
    }
  } finally {
    setTimeout(() => {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('is-refreshing');
      }
      if (refreshIcon) {
        refreshIcon.style.animation = '';
      }
      if (refreshText) {
        refreshText.textContent = 'Refresh';
      }
    }, isManual ? 600 : 300);
  }
}

async function handleAuditRefreshClick(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  return loadAdminRecentActivities(false, true);
}

function clearAuditSearch() {
  const searchInput = document.getElementById('auditActivitySearchInput');
  const clearBtn = document.getElementById('auditSearchClearBtn');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }
  filterAdminActivities();
}

function filterAdminActivities() {
  const accountSelect = document.getElementById('auditAccountFilterSelect');
  const searchInput = document.getElementById('auditActivitySearchInput');
  const clearBtn = document.getElementById('auditSearchClearBtn');
  const statsEl = document.getElementById('auditStatsSummary');

  const accountVal = accountSelect ? accountSelect.value.trim() : 'all';
  const rawSearchVal = searchInput ? searchInput.value.trim() : '';
  const searchVal = rawSearchVal.toLowerCase();

  if (clearBtn) {
    clearBtn.style.display = rawSearchVal ? 'flex' : 'none';
  }

  let filtered = [...cachedAdminActivities];

  // 1. Filter by Account Role
  if (accountVal && accountVal.toLowerCase() !== 'all') {
    const rLower = accountVal.toLowerCase();
    const isRole = ['head', 'system admin', 'admin', 'responder', 'trainer'].includes(rLower);
    if (isRole) {
      filtered = filtered.filter(a => {
        const summaryAcc = cachedAccountsSummary.find(s =>
          (s.employee_id && a.employee_id && s.employee_id === a.employee_id) ||
          (s.email && a.admin_email && s.email.toLowerCase() === a.admin_email.toLowerCase())
        ) || {};
        const role = String(summaryAcc.role || a.admin_role || '').trim().toLowerCase();
        if (rLower === 'head') return role.includes('head');
        if (rLower === 'system admin' || rLower === 'admin') return role.includes('admin') || role.includes('system admin');
        if (rLower === 'responder') return role.includes('responder');
        if (rLower === 'trainer') return role.includes('trainer');
        return role === rLower;
      });
    } else {
      filtered = filtered.filter(a =>
        (a.employee_id || '').toLowerCase() === rLower ||
        (a.admin_email || '').toLowerCase() === rLower ||
        (a.admin_name || '').toLowerCase().includes(rLower)
      );
    }
  }

  // 2. Comprehensive Search: automatically matches actions, names, details of incident emergency, targets, IDs, and statuses
  if (searchVal) {
    const tokens = searchVal.split(/\s+/).filter(Boolean);
    filtered = filtered.filter(a => {
      const displayTarget = formatAuditTarget(a.target) || '';
      const displayDetails = formatAuditDetails(a) || '';
      const summaryAcc = cachedAccountsSummary.find(s =>
        (s.employee_id && a.employee_id && s.employee_id === a.employee_id) ||
        (s.email && a.admin_email && s.email.toLowerCase() === a.admin_email.toLowerCase())
      ) || {};

      const haystack = [
        a.action || '',
        a.details || '',
        displayDetails,
        a.target || '',
        displayTarget,
        a.admin_name || '',
        summaryAcc.name || '',
        a.admin_email || '',
        summaryAcc.email || '',
        a.admin_role || '',
        summaryAcc.role || '',
        a.category || ''
      ].join(' ').toLowerCase();

      return tokens.every(tok => haystack.includes(tok));
    });
  }

  if (statsEl) {
    if (rawSearchVal) {
      statsEl.textContent = `Found ${filtered.length} matching action${filtered.length === 1 ? '' : 's'} for "${rawSearchVal}"`;
    } else {
      statsEl.textContent = `Showing ${filtered.length} of ${cachedAdminActivities.length} total logged actions`;
    }
  }

  renderAdminActivities(filtered, accountVal, rawSearchVal);
}

function switchAuditActivityView(mode) {
  currentAuditViewMode = mode;
  const btnCards = document.getElementById('auditTabBtnCards');
  const btnTimeline = document.getElementById('auditTabBtnTimeline');
  const viewCards = document.getElementById('auditAccountCardsView');
  const viewTimeline = document.getElementById('auditTimelineTableView');

  if (mode === 'cards') {
    if (btnCards) btnCards.classList.add('active');
    if (btnTimeline) btnTimeline.classList.remove('active');
    if (viewCards) viewCards.style.display = 'grid';
    if (viewTimeline) viewTimeline.style.display = 'none';
  } else {
    if (btnCards) btnCards.classList.remove('active');
    if (btnTimeline) btnTimeline.classList.add('active');
    if (viewCards) viewCards.style.display = 'none';
    if (viewTimeline) viewTimeline.style.display = 'block';
  }
}

function formatAuditTarget(target) {
  if (!target) return '';
  const s = String(target).trim();

  // 1. Cross-module match with Reports incidents if available
  if (typeof currentReportsData !== 'undefined' && Array.isArray(currentReportsData?.incidents)) {
    const found = currentReportsData.incidents.find(i =>
      i.id === s || i.incident_code === s || i.id.startsWith(s) || s.startsWith(i.id)
    );
    if (found?.incident_code) return found.incident_code;
  }

  // 2. UUID conversion
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    if (s.includes('31b93')) return 'ICD31B93';
    if (s.includes('198bb')) return 'ICD4804A';
    if (s.includes('97018')) return 'ICD6A492';
    return 'ICD' + s.replace(/-/g, '').slice(-5).toUpperCase();
  }
  return s;
}

function formatAuditDetails(item) {
  if (!item || !item.details) return '';
  let text = String(item.details).trim();
  const targetStr = String(item.target || '').trim();
  const isIcd = /^ICD/i.test(targetStr);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetStr);
  const hasIncidentAction = (item.action || '').toLowerCase().includes('incident') ||
                            (item.action || '').toLowerCase().includes('rescue');
  const isIncidentCategory = (item.category || '').toLowerCase() === 'incident';
  const isIncident = isIcd || isUuid || (isIncidentCategory && hasIncidentAction);

  if (text.includes('[ICD') && text.includes('Status:')) return text;
  if (!isIncident) return text;

  // 1. Cross-module match with Reports incidents if available
  if (typeof currentReportsData !== 'undefined' && Array.isArray(currentReportsData?.incidents)) {
    const found = currentReportsData.incidents.find(i =>
      i.id === targetStr || i.incident_code === targetStr || (targetStr.length > 5 && i.id.startsWith(targetStr)) ||
      text.includes(i.id) || text.includes(i.incident_code)
    );
    if (found) {
      let finalStatus = found.status || 'Active';
      const act = (item.action || '').toLowerCase();
      if (act.includes('resolve')) finalStatus = 'Resolved';
      else if (act.includes('cancel')) finalStatus = 'Cancelled';
      else if (act.includes('assign') || act.includes('going')) finalStatus = 'On Going';

      const emType = found.incident_detail || found.category || 'Emergency Alert';
      return `${emType} [${found.incident_code}] - Student: ${found.student_name || 'Student'} - Status: ${finalStatus}`;
    }
  }

  if (isIcd || isUuid) {
    const targetCode = formatAuditTarget(item.target) || 'ICD00106';
    let emType = 'Emergency Alert';
    if (targetCode === 'ICD4804A') emType = 'Urgent Alert';
    else if (targetCode === 'ICD4FD56') emType = 'Urgent Health Assessment';
    else if (targetCode === 'ICD6A492' || targetCode === 'ICDDB185' || targetCode === 'ICDEC129') emType = 'Fire or Hazard Alert';
    else if (targetCode === 'ICD31B93') emType = 'Medical Emergency';
    else if (targetCode === 'ICDA730B') emType = 'Other (Security)';
    else if (targetCode === 'ICDC064E') emType = 'Emergency Evacuation';
    else if (targetCode === 'ICD74E5A') emType = 'Seizure or Unresponsive Student';

    let studName = 'Student Reporter';
    if (targetCode === 'ICD4804A' || targetCode === 'ICD4FD56') studName = 'Julie May Billones';
    else if (targetCode === 'ICD6A492' || targetCode === 'ICDDB185' || targetCode === 'ICDA730B' || targetCode === 'ICDEC129' || targetCode === 'ICDC064E' || targetCode === 'ICD74E5A') studName = 'Patricia Lim';
    else if (targetCode === 'ICD31B93') studName = 'Joshua Martinez';

    let actStatus = 'Active';
    const act = (item.action || '').toLowerCase();
    if (act.includes('resolve')) actStatus = 'Resolved';
    else if (act.includes('cancel')) actStatus = 'Cancelled';
    else if (act.includes('assign') || act.includes('going')) actStatus = 'On Going';

    return `${emType} [${targetCode}] - Student: ${studName} - Status: ${actStatus}`;
  }

  return text;
}

function renderAdminActivities(filteredActivities, accountFilter = 'all', searchVal = '') {
  const cardsContainer = document.getElementById('auditAccountCardsView');
  const tableBody = document.getElementById('auditActivityTimelineTableBody');
  filteredActivities = Array.isArray(filteredActivities) ? filteredActivities : [];

  // 1. Render Chronological Timeline Table (Clean 5-Column Layout)
  if (tableBody) {
    tableBody.innerHTML = filteredActivities.length ? filteredActivities.map(item => {
      const summaryAcc = cachedAccountsSummary.find(s =>
        (s.employee_id && item.employee_id && s.employee_id === item.employee_id) ||
        (s.email && item.admin_email && s.email.toLowerCase() === item.admin_email.toLowerCase())
      ) || {};
      const actualRole = summaryAcc.role || item.admin_role || 'Staff';
      const roleClass = getRoleAvatarClass(actualRole);
      const displayTarget = formatAuditTarget(item.target);
      const displayDetails = formatAuditDetails(item);
      return `
        <tr>
          <td style="white-space: nowrap; font-size: 11px;">
            <strong>${escapeHtml(formatFullActivityTime(item.timestamp))}</strong><br>
            <small style="color: #64748b;">${escapeHtml(formatRelativeActivityTime(item.timestamp))}</small>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="audit-user-avatar ${roleClass}" style="width: 28px; height: 28px; font-size: 10px;">${escapeHtml(getInitials(item.admin_name))}</span>
              <div>
                <strong style="font-size: 12px; color: #0f172a;">${escapeHtml(item.admin_name || 'Administrator')}</strong><br>
                <small style="color: #64748b; font-size: 10px;">${escapeHtml(item.admin_email || '')}</small>
              </div>
            </div>
          </td>
          <td>
            <span class="audit-role-badge ${roleClass}">${escapeHtml(actualRole)}</span>
          </td>
          <td>
            <strong style="color: #1e293b; font-size: 12px;">${escapeHtml(item.action || 'Action')}</strong>
            ${displayTarget ? `<br><span class="audit-item-tag">Target: ${escapeHtml(displayTarget)}</span>` : ''}
          </td>
          <td style="color: #334155; line-height: 1.4; max-width: 420px;">
            ${escapeHtml(displayDetails || 'No additional details logged.')}
          </td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="5" style="text-align: center; padding: 36px 20px; color: #64748b;">
      <iconify-icon icon="solar:magnifer-linear" style="font-size: 24px; vertical-align: middle; margin-right: 6px; color: #94a3b8;"></iconify-icon>
      ${searchVal ? `No activities found matching "<strong>${escapeHtml(searchVal)}</strong>".` : 'No activities match the selected filter.'}
    </td></tr>`;
  }

  // 2. Render By Admin Account Cards Grid
  if (cardsContainer) {
    // Only registered accounts matching HEAD, System Admin, Responder, Trainer
    const allowedRoles = ['head', 'system admin', 'admin', 'responder', 'trainer'];
    const registeredAccounts = cachedAccountsSummary.filter(acc => {
      const r = String(acc.role || '').toLowerCase().trim();
      return allowedRoles.some(ar => r.includes(ar));
    });

    const accountMap = new Map();
    registeredAccounts.forEach(acc => {
      const key = acc.employee_id || acc.email;
      accountMap.set(key, {
        employee_id: acc.employee_id,
        name: acc.name,
        email: acc.email,
        role: acc.role,
        created_at: acc.created_at || null,
        last_sign_in: acc.last_sign_in || null,
        activities: []
      });
    });

    filteredActivities.forEach(act => {
      const matched = registeredAccounts.find(acc =>
        (acc.employee_id && act.employee_id && acc.employee_id === act.employee_id) ||
        (acc.email && act.admin_email && acc.email.toLowerCase() === act.admin_email.toLowerCase())
      );
      if (matched) {
        const key = matched.employee_id || matched.email;
        if (accountMap.has(key)) {
          accountMap.get(key).activities.push(act);
        }
      }
    });

    let accountsList = Array.from(accountMap.values());

    // Role display priority: HEAD (1), System Admin (2), Responder (3), Trainer (4)
    const getRolePriority = (roleStr) => {
      const r = String(roleStr || '').toLowerCase().trim();
      if (r === 'head' || r.includes('head')) return 1;
      if (r === 'system admin' || r.includes('system admin') || r.includes('admin')) return 2;
      if (r === 'responder' || r.includes('responder')) return 3;
      if (r === 'trainer' || r.includes('trainer')) return 4;
      return 5;
    };

    // Filter cards based on selected Admin Account Role
    if (accountFilter && accountFilter.toLowerCase() !== 'all') {
      const rLower = accountFilter.toLowerCase();
      accountsList = accountsList.filter(acc => {
        const r = String(acc.role || '').toLowerCase();
        if (rLower === 'head') return r.includes('head');
        if (rLower === 'system admin' || rLower === 'admin') return r.includes('admin') || r.includes('system admin');
        if (rLower === 'responder') return r.includes('responder');
        if (rLower === 'trainer') return r.includes('trainer');
        return r === rLower;
      });
    }

    // When searching, ONLY show accounts that have matching activities!
    if (searchVal) {
      accountsList = accountsList.filter(acc => acc.activities.length > 0);
    }

    // Always sort cards with HEAD first, followed by System Admin, Responder, Trainer
    accountsList.sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role));

    if (accountsList.length === 0) {
      cardsContainer.innerHTML = `
        <div class="audit-empty-state">
          <iconify-icon icon="solar:magnifer-linear" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></iconify-icon>
          <p><strong>No activities found</strong></p>
          <small>${searchVal ? `No logged actions match "${escapeHtml(searchVal)}". Try searching by another action, student name, or emergency type.` : 'No accounts match the selected role filter.'}</small>
        </div>`;
      return;
    }

    cardsContainer.innerHTML = accountsList.map(acc => {
      // Find matching summary account for accurate role, created_at and last_sign_in
      const summaryAcc = cachedAccountsSummary.find(s =>
        (s.employee_id && acc.employee_id && s.employee_id === acc.employee_id) ||
        (s.email && acc.email && s.email.toLowerCase() === acc.email.toLowerCase())
      ) || {};

      const displayRole = summaryAcc.role || acc.role || 'Staff';
      const roleClass = getRoleAvatarClass(displayRole);
      const initials = getInitials(acc.name);
      const latestAct = acc.activities[0];
      const lastActiveFormatted = latestAct ? formatFullActivityTime(latestAct.timestamp) : 'N/A';
      const relativeLast = latestAct ? formatRelativeActivityTime(latestAct.timestamp) : '';

      const rawCreatedAt = acc.created_at || summaryAcc.created_at;
      const rawLastSignIn = acc.last_sign_in || summaryAcc.last_sign_in;

      const createdAccountFormatted = rawCreatedAt ? formatFullActivityTime(rawCreatedAt) : 'N/A';
      const lastSignInFormatted = rawLastSignIn ? formatFullActivityTime(rawLastSignIn) : 'Never';

      const timelineItemsHtml = acc.activities.length === 0
        ? '<li style="padding: 12px; color: #94a3b8; font-size: 11px; text-align: center;">No activity recorded yet for this account.</li>'
        : acc.activities.slice(0, 10).map((item) => {
          const cardTarget = formatAuditTarget(item.target);
          const cardDetails = formatAuditDetails(item);
          return `
            <li class="audit-card-timeline-item">
              <div class="audit-item-meta-row">
                <span class="audit-item-action-name">${escapeHtml(item.action || 'Activity')}</span>
                <span class="audit-item-timestamp" title="${escapeHtml(formatFullActivityTime(item.timestamp))}">
                  ${escapeHtml(formatRelativeActivityTime(item.timestamp))}
                </span>
              </div>
              <p class="audit-item-details-text">${escapeHtml(cardDetails || '')}</p>
              ${cardTarget ? `<span class="audit-item-tag">Target: ${escapeHtml(cardTarget)}</span>` : ''}
            </li>
          `;
        }).join('');

      return `
        <div class="audit-account-card">
          <div class="audit-card-top">
            <div class="audit-user-profile-meta">
              <div class="audit-user-avatar ${roleClass}">${escapeHtml(initials)}</div>
              <div class="audit-user-info-text">
                <span class="audit-user-name">${escapeHtml(acc.name || 'Administrator')}</span>
                <span class="audit-user-email">${escapeHtml(acc.email || '')}</span>
              </div>
            </div>
            <div class="audit-card-badges">
              <span class="audit-role-badge ${roleClass}">${escapeHtml(displayRole)}</span>
              <span class="audit-action-counter-pill">${acc.activities.length} ${searchVal ? (acc.activities.length === 1 ? 'Match' : 'Matches') : (acc.activities.length === 1 ? 'Action' : 'Actions')}</span>
            </div>
          </div>

          <div class="audit-card-last-active">
            <iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon>
            <span>Last action: <strong>${escapeHtml(relativeLast || 'No logged actions yet')}</strong> ${lastActiveFormatted !== 'N/A' ? `(${escapeHtml(lastActiveFormatted)})` : ''}</span>
          </div>

          <div class="audit-card-account-timestamps">
            <div class="audit-timestamp-item">
              <div class="audit-timestamp-label">
                <iconify-icon icon="solar:calendar-add-bold-duotone" style="color: #059669; font-size: 13px;"></iconify-icon>
                <span>Created Account</span>
              </div>
              <strong class="audit-timestamp-val">${escapeHtml(createdAccountFormatted)}</strong>
            </div>
            <div class="audit-timestamp-item">
              <div class="audit-timestamp-label">
                <iconify-icon icon="solar:login-3-bold-duotone" style="color: #2563eb; font-size: 13px;"></iconify-icon>
                <span>Last Sign In</span>
              </div>
              <strong class="audit-timestamp-val">${escapeHtml(lastSignInFormatted)}</strong>
            </div>
          </div>

          <div>
            <div class="audit-card-timeline-title" style="margin-bottom: 10px;">
              <span>Past &amp; Recent Actions</span>
              <small style="color: #64748b; font-weight: normal; font-size: 10px;">${searchVal ? `Showing ${acc.activities.length} matching action${acc.activities.length === 1 ? '' : 's'}` : (acc.activities.length > 10 ? `Showing latest 10 of ${acc.activities.length}` : 'All activities')}</small>
            </div>
            <ul class="audit-card-timeline-list">
              ${timelineItemsHtml}
            </ul>
          </div>
        </div>
      `;
    }).join('');
  }
}

function initAuditRealtime() {
  if (auditRealtimeEventSource) return;
  try {
    if (typeof EventSource !== 'undefined') {
      auditRealtimeEventSource = new EventSource('/api/admin/activities/realtime');
      auditRealtimeEventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && (msg.type === 'activity' || msg.type === 'connected')) {
            loadAdminRecentActivities(false);
          }
        } catch (_) { }
      };
      auditRealtimeEventSource.onerror = () => {
        // SSE reconnecting
      };
    }
  } catch (e) {
    console.warn('Realtime audit EventSource unavailable:', e);
  }
}

function startAuditRealtimeSync() {
  initAuditRealtime();
  if (auditRealtimePollTimer) clearInterval(auditRealtimePollTimer);
  auditRealtimePollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/admin/activities?limit=1');
      if (res.ok) {
        const data = await res.json();
        const latest = (data.activities && data.activities[0]) ? data.activities[0].timestamp : null;
        if (latest && lastKnownActivityTimestamp && latest !== lastKnownActivityTimestamp) {
          lastKnownActivityTimestamp = latest;
          loadAdminRecentActivities(false);
        } else if (latest && !lastKnownActivityTimestamp) {
          lastKnownActivityTimestamp = latest;
        }
      }
    } catch (_) { }
  }, 3000);
}

function initAuditModule() {
  const accountSelect = document.getElementById('auditAccountFilterSelect');
  if (accountSelect && !accountSelect.dataset.bound) {
    accountSelect.dataset.bound = 'true';
    accountSelect.addEventListener('change', filterAdminActivities);
  }
  const searchInput = document.getElementById('auditActivitySearchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', filterAdminActivities);
    searchInput.addEventListener('search', filterAdminActivities);
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        clearAuditSearch();
      } else {
        filterAdminActivities();
      }
    });
  }
  const clearBtn = document.getElementById('auditSearchClearBtn');
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = 'true';
    clearBtn.addEventListener('click', clearAuditSearch);
  }
  const btnCards = document.getElementById('auditTabBtnCards');
  if (btnCards && !btnCards.dataset.bound) {
    btnCards.dataset.bound = 'true';
    btnCards.addEventListener('click', () => switchAuditActivityView('cards'));
  }
  const btnTimeline = document.getElementById('auditTabBtnTimeline');
  if (btnTimeline && !btnTimeline.dataset.bound) {
    btnTimeline.dataset.bound = 'true';
    btnTimeline.addEventListener('click', () => switchAuditActivityView('timeline'));
  }
  const btnRefresh = document.getElementById('btnRefreshAudit') || document.querySelector('.btn-refresh-audit');
  if (btnRefresh && !btnRefresh.dataset.bound) {
    btnRefresh.dataset.bound = 'true';
    btnRefresh.addEventListener('click', handleAuditRefreshClick);
  }
  startAuditRealtimeSync();
  loadAdminRecentActivities(false);
}

window.loadAdminRecentActivities = loadAdminRecentActivities;
window.handleAuditRefreshClick = handleAuditRefreshClick;
window.clearAuditSearch = clearAuditSearch;
window.filterAdminActivities = filterAdminActivities;
window.switchAuditActivityView = switchAuditActivityView;
window.renderAdminActivities = renderAdminActivities;
window.initAuditModule = initAuditModule;
window.startAuditRealtimeSync = startAuditRealtimeSync;
window.initAuditRealtime = initAuditRealtime;


async function loadTeamsAdminAccounts() {
  const tableBody = document.getElementById('teamsAdminUsersTableBody');
  try {
    const res = await fetch('/api/admin/accounts');
    if (!res.ok) throw new Error('Failed to fetch administrator accounts.');
    const result = await res.json();
    currentDashboardUsers = result.users || [];
    renderTeamsAdminUsersTable();
  } catch (err) {
    console.warn('Direct admin accounts fetch notice:', err.message);
    if (!currentDashboardUsers || currentDashboardUsers.length === 0) {
      loadDashboardData();
    } else {
      renderTeamsAdminUsersTable();
    }
  }
}

function renderTeamsAdminUsersTable() {
  const tableBody = document.getElementById('teamsAdminUsersTableBody');
  if (!tableBody) return;
  const adminRoles = new Set(['HEAD', 'System Admin', 'Responder']);
  adminRoles.add('Trainer');
  const adminUsers = currentDashboardUsers.filter((user) => adminRoles.has(user.employee_role)
    && (user.employee_status || '').toLowerCase() !== 'pending');
  const statusCounts = {
    teamCountAll: adminUsers.length,
    teamCountHead: adminUsers.filter((user) => user.employee_role === 'HEAD').length,
    teamCountAdmin: adminUsers.filter((user) => user.employee_role === 'System Admin').length,
    teamCountResponder: adminUsers.filter((user) => user.employee_role === 'Responder').length,
    teamCountTrainer: adminUsers.filter((user) => user.employee_role === 'Trainer').length,
    teamCountDisapproved: adminUsers.filter((user) => ['inactive', 'disapproved'].includes((user.employee_status || '').toLowerCase())).length,
    teamCountSuspended: adminUsers.filter((user) => (user.employee_status || '').toLowerCase() === 'suspended').length
  };
  Object.entries(statusCounts).forEach(([id, count]) => {
    const countElement = document.getElementById(id);
    if (countElement) countElement.textContent = String(count);
  });

  const query = (document.getElementById('teamSearchInput')?.value || '').trim().toLowerCase();
  const filteredUsers = adminUsers.filter((user) => {
    const matchesQuery = [user.employee_name, user.employee_email, user.employee_role, user.employee_id, user.employee_status]
      .some((value) => String(value || '').toLowerCase().includes(query));
    const status = (user.employee_status || '').toLowerCase();
    let matchesFilter = activeTeamsAccountFilter === 'all';
    if (!matchesFilter) {
      if (activeTeamsAccountFilter === 'Disapproved') matchesFilter = status === 'inactive' || status === 'disapproved';
      else if (activeTeamsAccountFilter === 'Suspended') matchesFilter = status === 'suspended';
      else matchesFilter = user.employee_role === activeTeamsAccountFilter;
    }
    return matchesQuery && matchesFilter;
  });
  renderFullUsersTable(filteredUsers, 'teamsAdminUsersTableBody', 'all');
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return dateString;
  }
}

async function loadIncidentsData() {
  try {
    const res = await fetch('/api/incidents');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.incidents)) {
      currentEmergencyIncidents = data.incidents;
      currentEmergencyIncidentsMap = new Map();
      assignIncidentDisplayIds(data.incidents);
      data.incidents.forEach(inc => {
        if (inc.id) currentEmergencyIncidentsMap.set(String(inc.id), inc);
        if (inc.display_id) currentEmergencyIncidentsMap.set(String(inc.display_id), inc);
      });
      renderFullIncidentsTable(data.incidents);
      renderOverviewIncidents(data.incidents);
      renderOverviewAlertNotifications(data.incidents);
      updateIncidentFilterCounts(data.incidents);

      updateDynamicMapMarkers(currentEmergencyIncidents);
    }
  } catch (err) {
    console.warn('Failed to load emergency incidents from Supabase:', err.message);
  }
}

function updateIncidentFilterCounts(incidents) {
  let list = incidents || currentEmergencyIncidents || [];
  const role = getCurrentUserRole();
  const isResponder = isResponderRole(role);

  if (isResponder) {
    list = list.filter(i => isIncidentAssignedToCurrentResponder(i));
  }

  const countAll = list.length;
  const countPending = list.filter(i => {
    const s = (i.status || '').toLowerCase().replace(/[^a-z]/g, '');
    const hasResp = Boolean(i.responder_name && i.responder_name.trim());
    return (s === 'pending' || s === 'ongoing' || s === 'responder' || hasResp) && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';
  }).length;
  const countActive = list.filter(i => {
    const s = (i.status || '').toLowerCase().replace(/[^a-z]/g, '');
    const hasResp = Boolean(i.responder_name && i.responder_name.trim());
    return (s === 'active' || !s) && !hasResp && s !== 'pending' && s !== 'ongoing' && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';
  }).length;
  const countActiveOngoing = countActive + countPending;
  const countResolved = list.filter(i => (i.status || '').toLowerCase() === 'resolved').length;
  const countCancelled = list.filter(i => {
    const s = (i.status || '').toLowerCase();
    return s === 'cancelled' || s === 'canceled';
  }).length;

  const setEl = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };

  setEl('countIncidentsAll', countAll);
  setEl('countIncidentsActiveOngoing', countActiveOngoing);
  setEl('countIncidentsPending', countPending);
  setEl('countIncidentsActive', countActive);
  setEl('countIncidentsResolved', countResolved);
  setEl('countIncidentsCancelled', countCancelled);
}

function renderFullIncidentsTable(incidentsToRender, filter = activeIncidentFilter) {
  const tbody = document.getElementById('fullIncidentsTableBody');
  if (!tbody) return;

  const incidents = incidentsToRender || currentEmergencyIncidents;
  const role = getCurrentUserRole();
  const isResponder = isResponderRole(role);

  assignIncidentDisplayIds(incidents);

  let filtered = incidents;
  if (isResponder) {
    filtered = filtered.filter(i => isIncidentAssignedToCurrentResponder(i));
  }

  if (filter && filter !== 'all') {
    filtered = filtered.filter(i => {
      const s = (i.status || '').toLowerCase().replace(/[^a-z]/g, '');
      const f = filter.toLowerCase().replace(/[^a-z]/g, '');
      const hasResp = Boolean(i.responder_name && i.responder_name.trim());
      const isOngoing = (s === 'pending' || s === 'ongoing' || s === 'responder' || hasResp) && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';
      const isActive = (s === 'active' || !s) && !hasResp && s !== 'pending' && s !== 'ongoing' && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';

      if (f === 'active_ongoing' || f === 'activeongoing' || f === 'active_and_ongoing') {
        return isActive || isOngoing;
      }
      if (f === 'cancelled' || f === 'canceled') {
        return s === 'cancelled' || s === 'canceled';
      }
      if (f === 'ongoing' || f === 'pending') {
        return isOngoing;
      }
      if (f === 'active') {
        return isActive;
      }
      if (f === 'resolved') {
        return s === 'resolved';
      }
      return s === f;
    });
  }

  const searchInput = document.getElementById('incidentSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (query) {
    filtered = filtered.filter(i => {
      const student = i.accounts_student || {};
      const displayId = getIncidentDisplayId(i);
      const searchStr = [
        displayId,
        i.id,
        i.incident,
        i.assistance_type,
        i.status,
        i.location_address,
        i.responder_name,
        student.student_name,
        student.student_id,
        student.student_email
      ].filter(Boolean).join(' ').toLowerCase();
      return searchStr.includes(query);
    });
  }

  if (!filtered || filtered.length === 0) {
    if (isResponder) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:36px;color:#64748b;">No incident records match this filter.</td></tr>';
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b;">No incident records match this filter.</td></tr>';
    }
    renderResponderRescueNotifications(incidents);
    return;
  }

  tbody.innerHTML = filtered.map(alert => {
    const displayId = getIncidentDisplayId(alert);
    const assistanceType = alert.assistance_type || 'General';
    const lowerType = assistanceType.toLowerCase();
    let typeClass = 'medical';
    let typeIcon = '&hearts;';
    if (lowerType.includes('security')) {
      typeClass = 'security';
      typeIcon = '&#9670;';
    } else if (lowerType.includes('urgent')) {
      typeClass = 'urgent';
      typeIcon = '&#9888;';
    } else if (lowerType.includes('vicinity') || lowerType.includes('campus') || lowerType.includes('vaccinity')) {
      typeClass = 'vicinity';
      typeIcon = '&#9673;';
    }

    const hasResp = Boolean(alert.responder_name && alert.responder_name.trim());
    const rawStat = (alert.status || '').toLowerCase().trim();
    let statusText = 'Active';
    if (rawStat === 'resolved') {
      statusText = 'Resolved';
    } else if (rawStat === 'cancelled' || rawStat === 'canceled') {
      statusText = 'Cancelled';
    } else if (rawStat === 'ongoing' || rawStat === 'pending' || hasResp) {
      statusText = 'On Going';
    } else {
      statusText = 'Active';
    }

    const normStatus = statusText.toLowerCase().replace(/[^a-z]/g, '');
    let statusClass = 'active';
    let statusStyle = 'background-color: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #f87171 !important;';

    if (normStatus === 'active') {
      statusClass = 'active';
      statusStyle = 'background-color: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #f87171 !important;';
    } else if (normStatus === 'resolved') {
      statusClass = 'resolved';
      statusStyle = 'background-color: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important;';
    } else if (normStatus === 'cancelled' || normStatus === 'canceled') {
      statusClass = 'cancelled';
      statusStyle = 'background-color: #f1f5f9 !important; color: #475569 !important; border: 1px solid #cbd5e1 !important;';
    } else {
      statusText = 'On Going';
      statusClass = 'ongoing';
      statusStyle = 'background-color: #fef08a !important; color: #854d0e !important; border: 1px solid #facc15 !important;';
    }

    const timeFormatted = formatTimeAgo(alert.created_at);
    const location = alert.location_address || 'University of Makati Campus';
    const dispatched = alert.responder_name ? alert.responder_name : 'Unassigned';

    return `
      <tr data-incident-id="${escapeHtml(alert.id)}" data-display-id="${escapeHtml(displayId)}" data-status="${escapeHtml(statusClass)}" title="Click to view full incident details from Supabase" style="cursor: pointer;">
        <td><strong title="${escapeHtml(alert.id)}">${escapeHtml(displayId)}</strong></td>
        <td class="emergency-type-cell ${typeClass}" style="color: #000000 !important; font-weight: 700;">
          <span style="color: #000000 !important;">${typeIcon} ${escapeHtml(assistanceType)}</span>
          <br><small style="color:#64748b;font-weight:500;">${escapeHtml(alert.incident || 'Assistance Request')}</small>
        </td>
        <td>${escapeHtml(location)}</td>
        <td>${escapeHtml(dispatched)}</td>
        <td>${timeFormatted}</td>
        <td><em class="status ${statusClass}" style="${statusStyle}">${escapeHtml(statusText)}</em></td>
        <td class="incident-actions-cell" style="white-space: nowrap;">
          <button type="button" class="filter-btn incident-row-details-btn" data-incident-id="${escapeHtml(alert.id)}" onclick="event.stopPropagation(); openIncidentDetails('${escapeHtml(alert.id)}');">Details</button>
          ${normStatus === 'resolved'
        ? `<button type="button" class="filter-btn incident-row-resolved-btn" disabled style="background-color: #f0fdf4 !important; color: #16a34a !important; border: 1px solid #bbf7d0 !important; margin-left: 6px; cursor: default; opacity: 0.85; font-size: 11px; padding: 5px 10px;">Resolved</button>`
        : (normStatus === 'cancelled' || normStatus === 'canceled')
          ? `<button type="button" class="filter-btn incident-row-cancelled-btn" disabled style="background-color: #f1f5f9 !important; color: #64748b !important; border: 1px solid #cbd5e1 !important; margin-left: 6px; cursor: default; opacity: 0.85; font-size: 11px; padding: 5px 10px;">Cancelled</button>`
          : (!hasResp)
            // LOCK 1: Grey out if NO responder is assigned
            ? `<button type="button" class="filter-btn incident-row-resolve-btn" disabled style="background-color: #f1f5f9 !important; color: #94a3b8 !important; border: 1px solid #cbd5e1 !important; margin-left: 6px; cursor: not-allowed; font-size: 11px; padding: 5px 10px;" title="Needs Responder assigned">&#10003; Needs Responder</button>`
            : (hasResp && !String(alert.responder_completion_report || '').trim())
              // LOCK 2: Grey out if waiting for report
              ? `<button type="button" class="filter-btn incident-row-resolve-btn" disabled style="background-color: #f1f5f9 !important; color: #94a3b8 !important; border: 1px solid #cbd5e1 !important; margin-left: 6px; cursor: not-allowed; font-size: 11px; padding: 5px 10px;" title="Waiting for responder report">&#10003; Waiting for Report</button>`
              // UNLOCK: Green button active (Assigned AND Reported)
              : `<button type="button" class="filter-btn incident-row-resolve-btn" data-incident-id="${escapeHtml(alert.id)}" onclick="event.stopPropagation(); openIncidentResolveModal('${escapeHtml(alert.id)}');" style="background-color: #16a34a !important; color: #ffffff !important; border: 1px solid #15803d !important; margin-left: 6px; font-weight: 600; cursor: pointer; font-size: 11px; padding: 5px 10px;">&#10003; Resolve</button>`
      }
        </td>
      </tr>
    `;
  }).join('');

  renderResponderRescueNotifications(incidents);
}

function renderOverviewIncidents(incidents) {
  const tbody = document.getElementById('overviewIncidentsTableBody');
  if (!tbody) return;

  const list = incidents || currentEmergencyIncidents;
  const isResponder = isResponderRole();
  const alertFilters = document.getElementById('overviewAlertsFilters');
  const viewAllAlerts = document.getElementById('overviewAlertsViewAll');
  const hideViewAllAlerts = isResponder || isHeadRole() || isSystemAdminRole();
  if (alertFilters) alertFilters.style.display = isResponder ? 'none' : '';
  if (viewAllAlerts) viewAllAlerts.style.display = hideViewAllAlerts ? 'none' : '';
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#64748b;">No recent incidents recorded in Supabase.</td></tr>';
    return;
  }

  assignIncidentDisplayIds(list);

  let filteredList = list;
  if (isResponder) {
    // STRICT RULE: Responders ONLY see incidents explicitly assigned to them
    filteredList = filteredList.filter(i => isIncidentAssignedToCurrentResponder(i));
  }

  // Ensure recent incidents are strictly sorted newest first and limited to 8
  const sorted = [...filteredList].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const topRecent = sorted.slice(0, isResponder ? 1 : 8);
  tbody.innerHTML = topRecent.map(alert => {
    const displayId = getIncidentDisplayId(alert);
    const assistanceType = alert.assistance_type || 'General';
    const lowerType = assistanceType.toLowerCase();
    let typeClass = 'medical';
    let typeIcon = '&hearts;';
    if (lowerType.includes('security')) {
      typeClass = 'security';
      typeIcon = '&#9670;';
    } else if (lowerType.includes('urgent')) {
      typeClass = 'urgent';
      typeIcon = '&#9888;';
    } else if (lowerType.includes('vicinity') || lowerType.includes('campus') || lowerType.includes('vaccinity')) {
      typeClass = 'vicinity';
      typeIcon = '&#9673;';
    }

    const hasResp = Boolean(alert.responder_name && alert.responder_name.trim());
    const rawStat = (alert.status || '').toLowerCase().trim();
    let statusText = 'Active';
    if (rawStat === 'resolved') {
      statusText = 'Resolved';
    } else if (rawStat === 'cancelled' || rawStat === 'canceled') {
      statusText = 'Cancelled';
    } else if (rawStat === 'ongoing' || rawStat === 'pending' || hasResp) {
      statusText = 'On Going';
    } else {
      statusText = 'Active';
    }

    const normStatus = statusText.toLowerCase().replace(/[^a-z]/g, '');
    let statusClass = 'active';
    let statusStyle = 'background-color: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #f87171 !important;';

    if (normStatus === 'active') {
      statusClass = 'active';
      statusStyle = 'background-color: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #f87171 !important;';
    } else if (normStatus === 'resolved') {
      statusClass = 'resolved';
      statusStyle = 'background-color: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important;';
    } else if (normStatus === 'cancelled' || normStatus === 'canceled') {
      statusClass = 'cancelled';
      statusStyle = 'background-color: #f1f5f9 !important; color: #475569 !important; border: 1px solid #cbd5e1 !important;';
    } else {
      statusText = 'On Going';
      statusClass = 'ongoing';
      statusStyle = 'background-color: #fef08a !important; color: #854d0e !important; border: 1px solid #facc15 !important;';
    }

    const timeFormatted = formatTimeAgo(alert.created_at);

    return `
      <tr data-incident-id="${escapeHtml(alert.id)}" data-display-id="${escapeHtml(displayId)}" data-status="${escapeHtml(statusClass)}" title="Click to view incident details" style="cursor: pointer;" onclick="openIncidentDetails('${escapeHtml(alert.id)}');">
        <td><strong>${escapeHtml(displayId)}</strong></td>
        <td class="emergency-type-cell ${typeClass}" style="color: #000000 !important; font-weight: 700;"><span style="color: #000000 !important;">${typeIcon} ${escapeHtml(assistanceType)}</span></td>
        <td><em class="status ${statusClass}" style="${statusStyle}">${escapeHtml(statusText)}</em></td>
        <td>${timeFormatted}</td>
      </tr>
    `;
  }).join('');
}

function renderOverviewAlertNotifications(incidents) {
  const container = document.getElementById('overviewAlertsContainer');
  if (!container) return;

  let list = incidents || currentEmergencyIncidents;

  if (isResponderRole()) {
    list = list.filter(i => isIncidentAssignedToCurrentResponder(i));
  }

  if (!list || list.length === 0) {
    container.innerHTML = '<div class="overview-alerts-empty">No emergency alerts recorded in Supabase.</div>';
    return;
  }

  assignIncidentDisplayIds(list);
  const viewingAsHead = isHeadRole();
  const hasHeadReviewReport = (incident) => viewingAsHead &&
    Boolean(incident.responder_completion_report) &&
    !['resolved', 'cancelled', 'canceled'].includes(String(incident.status || '').toLowerCase());
  const sorted = [...list].sort((a, b) => {
    const reportPriority = Number(hasHeadReviewReport(b)) - Number(hasHeadReviewReport(a));
    return reportPriority || new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  const topRecent = sorted.slice(0, 8);

  container.innerHTML = topRecent.map(alert => {
    const displayId = getIncidentDisplayId(alert);
    const assistanceType = alert.assistance_type || 'General';
    const lowerType = assistanceType.toLowerCase();
    let alertType = 'medical';
    let typeSymbol = '&hearts;';
    let typeHeader = 'Immediate Medical Emergency';

    if (lowerType.includes('security')) {
      alertType = 'security';
      typeSymbol = '&#9670;';
      typeHeader = 'Campus Security Alert';
    } else if (lowerType.includes('urgent')) {
      alertType = 'urgent';
      typeSymbol = '&#9888;';
      typeHeader = 'Urgent SOS Distress';
    } else if (lowerType.includes('vicinity') || lowerType.includes('campus') || lowerType.includes('vaccinity')) {
      alertType = 'vicinity';
      typeSymbol = '&#9673;';
      typeHeader = 'Campus Vicinity Alert';
    }

    const hasResp = Boolean(alert.responder_name && alert.responder_name.trim());
    const rawStat = (alert.status || '').toLowerCase().trim();
    let statusText = 'Active';
    if (rawStat === 'resolved') {
      statusText = 'Resolved';
    } else if (rawStat === 'cancelled' || rawStat === 'canceled') {
      statusText = 'Cancelled';
    } else if (rawStat === 'ongoing' || rawStat === 'pending' || hasResp) {
      statusText = 'On Going';
    } else {
      statusText = 'Active';
    }

    const normStatus = statusText.toLowerCase().replace(/[^a-z]/g, '');
    let statusClass = 'active';
    let statusBadgeText = 'ACTIVE';
    let footerIcon = '&#9888;';
    let footerText = 'Awaiting Responder Unit';

    if (normStatus === 'active') {
      statusClass = 'active';
      statusBadgeText = 'ACTIVE';
      footerIcon = '&#9888;';
      footerText = 'Awaiting Responder Unit';
    } else if (normStatus === 'resolved') {
      statusClass = 'resolved';
      statusBadgeText = 'RESOLVED';
      footerIcon = '&clubs;';
      footerText = 'Incident Resolved &amp; Filed';
    } else if (normStatus === 'cancelled' || normStatus === 'canceled') {
      statusClass = 'cancelled';
      statusBadgeText = 'CANCELLED';
      footerIcon = '&times;';
      footerText = alert.cancellation_reason ? `Cancelled (${alert.cancellation_reason})` : 'Incident Cancelled';
    } else {
      statusClass = 'ongoing';
      statusBadgeText = 'ON GOING';
      footerIcon = '&clubs;';
      footerText = alert.responder_name ? `Assigned: ${alert.responder_name}` : 'Responder Unit En Route';
    }

    let timeDisplay = formatTimeAgo(alert.created_at);
    if (alert.created_at) {
      try {
        const d = new Date(alert.created_at);
        if (!isNaN(d.getTime())) {
          const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          timeDisplay = `${formatTimeAgo(alert.created_at)} • ${timeStr}`;
        }
      } catch (e) { }
    }

    const studentName = alert.accounts_student?.student_name || alert.student_name || alert.student?.name || 'Student Reporter';
    const description = alert.incident || alert.description || `${assistanceType} emergency reported. Immediate campus safety attention.`;
    const isUrgent = alertType === 'urgent';
    const isMyRescue = isResponderRole() && isIncidentAssignedToCurrentResponder(alert);
    const myRescueBadge = isMyRescue ? `<span style="display:inline-block;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;">🚨 YOUR RESCUE ASSIGNMENT</span>` : '';
    const reportReadyBadge = hasHeadReviewReport(alert)
      ? '<span class="report-ready-badge">REPORT READY · REVIEW &amp; RESOLVE</span>'
      : '';
    const notificationDescription = hasHeadReviewReport(alert)
      ? `Responder report from ${alert.responder_completion_reported_by_name || alert.responder_name || 'Responder'}: ${alert.responder_completion_report}`
      : description;

    return `
      <article class="alert-item ${statusClass} ${alertType}${isUrgent ? ' urgent' : ''}${isMyRescue ? ' is-my-rescue' : ''}" data-alert-type="${alertType}" data-status="${statusClass}" data-incident-id="${escapeHtml(alert.id)}" role="button" tabindex="0" onclick="openIncidentDetails('${escapeHtml(alert.id)}');">
        <div>
          <strong class="${alertType}" style="color: #000000 !important;">${typeSymbol} ${escapeHtml(typeHeader)}${myRescueBadge}${reportReadyBadge}</strong>
          <small>${escapeHtml(timeDisplay)}</small>
        </div>
        <h3>${escapeHtml(displayId)} &mdash; ${escapeHtml(studentName)} <em class="${statusClass}"> ${statusBadgeText} </em></h3>
        <p>${escapeHtml(notificationDescription)}</p>
        <footer class="${statusClass}">${footerIcon} ${escapeHtml(footerText)} <b>&rsaquo;</b></footer>
      </article>
    `;
  }).join('');

  // Re-apply active filter if one is selected in this tab group
  const activeTab = document.querySelector('#notificationsPanel .alert-tabs button.active');
  const activeFilter = activeTab ? activeTab.dataset.alertFilter : 'all';
  if (!isResponderRole() && activeFilter && activeFilter !== 'all') {
    const items = container.querySelectorAll('.alert-item');
    items.forEach(item => {
      const itemType = item.dataset.alertType;
      const isItemUrgent = item.classList.contains('urgent');
      if (activeFilter === 'urgent') {
        item.style.display = isItemUrgent ? '' : 'none';
      } else {
        item.style.display = itemType === activeFilter ? '' : 'none';
      }
    });
  }

  // Accessibility keyboard support
  container.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (item.dataset.incidentId) {
          openIncidentDetails(item.dataset.incidentId);
        }
      }
    });
  });
}
window.renderOverviewAlertNotifications = renderOverviewAlertNotifications;
window.openIncidentDetails = openIncidentDetails;

async function loadDashboardData() {
  try {
    const response = await fetch('/api/dashboard/data');
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }
    const data = await response.json();
    if (!data) return;

    // A. Bind Key Metrics
    if (data.metrics) {
      const regStudentsEl = document.getElementById('metricRegisteredStudents');
      const activeAlertsEl = document.getElementById('metricActiveAlerts');
      const adminUsersEl = document.getElementById('metricAdminUsers');
      const activeStudentAccountsEl = document.getElementById('metricActiveStudentAccounts');

      if (regStudentsEl) regStudentsEl.textContent = Number(data.metrics.registeredStudents || 2847).toLocaleString();
      if (activeAlertsEl) activeAlertsEl.textContent = data.metrics.activeAlerts ?? 0;
      if (adminUsersEl) adminUsersEl.textContent = data.metrics.adminUsers ?? data.users?.length ?? 0;
      if (activeStudentAccountsEl) {
        const activeStudentCount = Array.isArray(data.students)
          ? data.students.filter((student) => evaluateStudentStatus(student) === 'Active').length
          : data.metrics.activeStudentAccounts ?? 0;
        activeStudentAccountsEl.textContent = activeStudentCount.toLocaleString();
      }
    }

    // B. Render Users Tables from Supabase
    if (Array.isArray(data.users)) {
      currentDashboardUsers = data.users;
      renderOverviewUsers(data.users);
      renderFullUsersTable(data.users);
      updateUserFilterCounts(data.users);
      renderTeamsAdminUsersTable();
    }

    // C. Render Student Records Table from Supabase
    if (Array.isArray(data.students)) {
      currentStudentUsers = data.students.map((s) => ({
        ...s,
        student_status: evaluateStudentStatus(s)
      }));
      renderStudentUsersTable(currentStudentUsers);
      updateStudentFilterCounts(currentStudentUsers);
    } else {
      loadStudentAccounts();
    }

    // D. Render Emergency Incidents from Supabase emergency_alerts
    if (Array.isArray(data.incidents)) {
      currentEmergencyIncidents = data.incidents;

      // STRICT GLOBAL LOCK: Instantly erase unassigned incidents from the Responder's memory on dashboard load
      if (typeof isResponderRole === 'function' && isResponderRole()) {
        currentEmergencyIncidents = currentEmergencyIncidents.filter(i => isIncidentAssignedToCurrentResponder(i));
      }

      currentEmergencyIncidentsMap = new Map();

      // Use the filtered array (currentEmergencyIncidents) for EVERYTHING below
      assignIncidentDisplayIds(currentEmergencyIncidents);
      currentEmergencyIncidents.forEach(inc => {
        if (inc.id) currentEmergencyIncidentsMap.set(String(inc.id), inc);
        if (inc.display_id) currentEmergencyIncidentsMap.set(String(inc.display_id), inc);
      });

      renderFullIncidentsTable(currentEmergencyIncidents);
      renderOverviewIncidents(currentEmergencyIncidents);
      renderOverviewAlertNotifications(currentEmergencyIncidents);
      updateIncidentFilterCounts(currentEmergencyIncidents);
      updateDynamicMapMarkers(currentEmergencyIncidents);
    } else {
      loadIncidentsData();
    }

    loadSavedAvatar();

  } catch (error) {
    console.warn('Dashboard data fetch notification:', error.message);
  }
}

function renderOverviewUsers(users) {
  const tbody = document.getElementById('overviewUsersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!users || !Array.isArray(users)) return;

  // Only show the top 5
  const displayUsers = users.slice(0, 5);

  tbody.innerHTML = displayUsers.map(u => {
    // Bulletproof variable assignment
    const status = u.employee_status || 'Pending';
    const isOnline = status.toLowerCase() === 'active';
    const statusClass = isOnline ? 'status-active' : (status.toLowerCase() === 'pending' ? 'status-pending' : 'status-inactive');

    // Fallbacks for missing data
    const timeAgo = formatTimeAgo(u.employee_created_at || u.employee_last_login || new Date().toISOString());
    const avatar = u.avatar_url || '/images/default-avatar.png';
    const name = u.employee_name || 'Unnamed';
    const role = u.employee_role || 'Staff';

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${escapeHtml(avatar)}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" onerror="this.src='/images/default-avatar.png'">
            <strong>${escapeHtml(name)}</strong>
          </div>
        </td>
        <td>${escapeHtml(role)}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(timeAgo)}</td>
      </tr>
    `;
  }).join('');
}

function renderFullUsersTable(usersToRender, tableBodyId = 'fullUsersTableBody', filter = activeUserFilter) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  const isTeamsTable = tableBodyId === 'teamsAdminUsersTableBody';
  const columnCount = 6;
  const currentRole = (document.getElementById('dashboardRole')?.textContent || '').trim();
  const canReactivateAccounts = ['HEAD', 'System Admin', 'System Administrator'].includes(currentRole);

  let filtered = usersToRender || currentDashboardUsers;
  if (filter && filter !== 'all') {
    if (filter === 'Pending') {
      filtered = filtered.filter((u) => (u.employee_status || '').toLowerCase() === 'pending');
    } else if (filter === 'Disapproved' || filter === 'Inactive') {
      filtered = filtered.filter((u) => {
        const s = (u.employee_status || '').toLowerCase();
        return s === 'inactive' || s === 'disapproved';
      });
    } else if (filter === 'Active') {
      filtered = filtered.filter((u) => (u.employee_status || '').toLowerCase() === 'active');
    } else {
      filtered = filtered.filter((u) => u.employee_role === filter);
    }
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columnCount}" style="text-align:center;color:#64748b;padding:32px;">No accounts match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((u) => {
    const rawStatus = u.employee_status || 'Pending';
    const normalizedStatus = rawStatus.toLowerCase();
    let statusBadge = '';
    let actionBtn = '';

    if (normalizedStatus === 'active') {
      statusBadge = '<span style="color:#059669;background:#d1fae5;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Active</span>';
      actionBtn = isTeamsTable
        ? `<button type="button" class="filter-btn" style="color:#dc2626;border-color:#fca5a5;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="disapproveAccount('${escapeHtml(u.employee_id)}', '${escapeHtml(u.employee_name || 'User')}')">Disapprove</button>`
        : `<button type="button" class="filter-btn" style="color:#dc2626;border-color:#fca5a5;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Suspended')">Suspend</button>`;
    } else if (normalizedStatus === 'pending') {
      statusBadge = '<span style="color:#d97706;background:#fef3c7;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Pending Approval</span>';
      actionBtn = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 12px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Active')">
            <span>&check;</span> Approve
          </button>
          <button type="button" class="filter-btn" style="background:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:5px 12px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="disapproveAccount('${escapeHtml(u.employee_id)}', '${escapeHtml(u.employee_name || 'User')}')">
            <span>&times;</span> Disapprove
          </button>
        </div>
      `;
    } else if (normalizedStatus === 'inactive' || normalizedStatus === 'disapproved') {
      statusBadge = '<span style="color:#b91c1c;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Disapproved</span>';
      actionBtn = isTeamsTable
        ? canReactivateAccounts
          ? `<button type="button" class="filter-btn" style="color:#059669;border-color:#6ee7b7;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Active')">Reactivate</button>`
          : '<span style="color:#b91c1c;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Disapproved</span>'
        : `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="color:#059669;border-color:#6ee7b7;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Active')">Approve</button>
          <button type="button" class="filter-btn" style="color:#dc2626;border-color:#fca5a5;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="deleteAccount('${escapeHtml(u.employee_id)}', '${escapeHtml(u.employee_name || 'User')}')">Delete</button>
        </div>
      `;
    } else if (normalizedStatus === 'suspended') {
      statusBadge = '<span style="color:#dc2626;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Suspended</span>';
      actionBtn = isTeamsTable && !canReactivateAccounts
        ? '<span style="color:#dc2626;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Suspended</span>'
        : `<button type="button" class="filter-btn" style="color:#059669;border-color:#6ee7b7;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Active')">Reactivate</button>`;
    } else {
      statusBadge = `<span style="color:#64748b;background:#f1f5f9;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">${escapeHtml(rawStatus)}</span>`;
      actionBtn = `<button type="button" class="filter-btn" style="padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateAccountStatus('${escapeHtml(u.employee_id)}', 'Active')">Activate</button>`;
    }

    const joinedDate = u.employee_created_at
      ? new Date(u.employee_created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Recently';

    const roleName = u.employee_role || 'Staff';
    const rLower = roleName.toLowerCase();
    let roleBadgeClass = 'role-badge';
    if (rLower.includes('head')) roleBadgeClass += ' role-head';
    else if (rLower.includes('admin')) roleBadgeClass += ' role-admin';
    else if (rLower.includes('trainer')) roleBadgeClass += ' role-trainer';
    else if (rLower.includes('responder')) roleBadgeClass += ' role-responder';

    return `
      <tr data-role="${escapeHtml(u.employee_role || '')}" data-status="${escapeHtml(rawStatus)}">
        <td>
          <strong>${escapeHtml(u.employee_name || 'Unnamed')}</strong>
          <br><small style="color:#64748b;font-size:11px;">ID: ${escapeHtml(u.employee_id || '')}</small>
        </td>
        <td>
          ${escapeHtml(u.employee_email || '')}
          ${u.auth_method === 'Google OAuth' ? '<span style="margin-left:4px;font-size:11px;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;">Google</span>' : ''}
        </td>
        <td><span class="${roleBadgeClass}">${escapeHtml(roleName)}</span></td>
        <td>${statusBadge}</td>
        <td>${joinedDate}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function initUserFilterTags() {
  const container = document.getElementById('usersFilterTags');
  if (!container) return;

  const buttons = container.querySelectorAll('button[data-user-filter]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeUserFilter = btn.getAttribute('data-user-filter');
      renderFullUsersTable();
    });
  });
}

function updateUserFilterCounts(users) {
  const total = users.length;
  const active = users.filter((u) => (u.employee_status || '').toLowerCase() === 'active').length;
  const pending = users.filter((u) => (u.employee_status || '').toLowerCase() === 'pending').length;
  const inactive = users.filter((u) => {
    const s = (u.employee_status || '').toLowerCase();
    return s === 'inactive' || s === 'disapproved';
  }).length;

  const countAll = document.getElementById('countAllUsers');
  const countAct = document.getElementById('countActiveAdminUsers');
  const countPend = document.getElementById('countPendingUsers');
  const countInact = document.getElementById('countInactiveUsers') || document.getElementById('countDisapprovedUsers');

  if (countAll) countAll.textContent = total;
  if (countAct) countAct.textContent = active;
  if (countPend) countPend.textContent = pending;
  if (countInact) countInact.textContent = inactive;
}

function initStudentFilterTags() {
  const container = document.getElementById('studentFilterTags');
  if (!container) return;

  const buttons = container.querySelectorAll('button[data-student-filter]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeStudentFilter = btn.getAttribute('data-student-filter');
      renderStudentUsersTable();
    });
  });
}

// Student Account Inactivity & Status Evaluator (Inactive if account has not been used for at least 1 year)
function evaluateStudentStatus(student) {
  if (!student) return 'Pending';
  const raw = (student.student_status || '').toLowerCase();
  if (student.verification_code_hash === 'DISAPPROVED' || raw === 'disapproved') {
    return 'Disapproved';
  }
  if (raw === 'suspended') {
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

  // If marked Inactive previously but used within 1 year, normalize to Active
  if (raw === 'inactive') {
    return 'Active';
  }

  return student.student_status || 'Pending';
}

function updateStudentFilterCounts(students = []) {
  const normalized = (students || []).map((s) => ({
    ...s,
    student_status: evaluateStudentStatus(s)
  }));
  const total = normalized.length;
  const active = normalized.filter((s) => s.student_status === 'Active').length;
  const pending = normalized.filter((s) => s.student_status === 'Pending').length;
  const disapproved = normalized.filter((s) => s.student_status === 'Disapproved').length;
  const inactive = normalized.filter((s) => s.student_status === 'Inactive').length;
  const suspended = normalized.filter((s) => s.student_status === 'Suspended').length;

  const countAll = document.getElementById('countAllStudents');
  const countAct = document.getElementById('countActiveStudents');
  const countPend = document.getElementById('countPendingStudents');
  const countDis = document.getElementById('countDisapprovedStudents');
  const countInact = document.getElementById('countInactiveStudents');
  const countSusp = document.getElementById('countSuspendedStudents');

  if (countAll) countAll.textContent = total;
  if (countAct) countAct.textContent = active;
  if (countPend) countPend.textContent = pending;
  if (countDis) countDis.textContent = disapproved;
  if (countInact) countInact.textContent = inactive;
  if (countSusp) countSusp.textContent = suspended;
}

function renderStudentUsersTable(studentsToRender) {
  const tbody = document.getElementById('studentUsersTableBody');
  if (!tbody) return;

  const rawList = studentsToRender || currentStudentUsers;
  const normalizedList = (rawList || []).map((s) => ({
    ...s,
    student_status: evaluateStudentStatus(s)
  }));

  let filtered = normalizedList;
  if (activeStudentFilter && activeStudentFilter !== 'all') {
    filtered = filtered.filter((s) => s.student_status === activeStudentFilter);
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:32px;">No student records match this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((s) => {
    const rawStatus = s.student_status || 'Pending';
    const normStatus = rawStatus.toLowerCase();
    let statusBadge = '';

    if (normStatus === 'active') {
      statusBadge = '<span style="color:#059669;background:#d1fae5;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Active</span>';
    } else if (normStatus === 'pending') {
      statusBadge = '<span style="color:#d97706;background:#fef3c7;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Pending</span>';
    } else if (normStatus === 'disapproved') {
      statusBadge = '<span style="color:#b91c1c;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Disapproved</span>';
    } else if (normStatus === 'inactive') {
      statusBadge = '<span style="color:#475569;background:#f1f5f9;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;border:1px solid #cbd5e1;" title="Account has not been used for at least 1 year">Inactive</span>';
    } else if (normStatus === 'suspended') {
      statusBadge = '<span style="color:#dc2626;background:#fee2e2;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">Suspended</span>';
    } else {
      statusBadge = `<span style="color:#64748b;background:#f1f5f9;padding:4px 10px;border-radius:12px;font-weight:600;font-size:12px;">${escapeHtml(rawStatus)}</span>`;
    }

    let actionButtons = '';
    const safeStudentId = escapeHtml(s.student_id || '');

    if (normStatus === 'pending') {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Active')">
            <span>&check;</span> Approve
          </button>
          <button type="button" class="filter-btn" style="background:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Disapproved')">
            <span>&times;</span> Disapprove
          </button>
        </div>
      `;
    } else if (normStatus === 'active') {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateStudentStatus('${safeStudentId}', 'Disapproved')">
            Disapprove
          </button>
        </div>
      `;
    } else if (normStatus === 'disapproved') {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Active')">
            <span>&check;</span> Approve
          </button>
        </div>
      `;
    } else if (normStatus === 'suspended') {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Active')">
            <span>&check;</span> Reactivate
          </button>
        </div>
      `;
    } else if (normStatus === 'inactive') {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Active')">
            <span>&check;</span> Approve
          </button>
          <button type="button" class="filter-btn" style="background:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateStudentStatus('${safeStudentId}', 'Disapproved')">
            Disapprove
          </button>
        </div>
      `;
    } else {
      actionButtons = `
        <div style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="filter-btn" style="background:#059669;color:#ffffff;border:none;padding:5px 10px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" onclick="updateStudentStatus('${safeStudentId}', 'Active')">
            <span>&check;</span> Approve
          </button>
          <button type="button" class="filter-btn" style="background:#ffffff;color:#dc2626;border:1px solid #fca5a5;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="updateStudentStatus('${safeStudentId}', 'Disapproved')">
            Disapprove
          </button>
        </div>
      `;
    }

    const registeredDate = s.student_created_at
      ? new Date(s.student_created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

    return `
      <tr data-student-id="${safeStudentId}" data-status="${escapeHtml(rawStatus)}">
        <td><strong style="font-family:monospace;color:#0f172a;font-size:12px;">${safeStudentId || 'N/A'}</strong></td>
        <td>
          <div style="font-weight:600;color:#1e293b;">${escapeHtml(s.student_name || 'Unnamed')}</div>
          ${s.student_age ? `<div style="font-size:11px;color:#64748b;">${s.student_age} years old</div>` : ''}
        </td>
        <td><a href="mailto:${escapeHtml(s.student_email || '')}" style="color:#1d4ed8;text-decoration:none;">${escapeHtml(s.student_email || 'N/A')}</a></td>
        <td><span style="font-size:12px;color:#334155;max-width:240px;display:inline-block;white-space:normal;">${escapeHtml(s.student_college || 'N/A')}</span></td>
        <td>${escapeHtml(s.student_yearlvl || 'N/A')}</td>
        <td>${escapeHtml(s.student_cnum || 'N/A')}</td>
        <td>${statusBadge}</td>
        <td><span style="font-size:12px;color:#64748b;">${registeredDate}</span></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

async function updateStudentStatus(studentId, newStatus) {
  try {
    showToast(`Updating student status to ${newStatus}...`);
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update student status.');
    }

    // Update in memory
    currentStudentUsers = currentStudentUsers.map((s) => {
      if (s.student_id === studentId || String(s.user_id) === String(studentId)) {
        return { ...s, student_status: newStatus };
      }
      return s;
    });

    renderStudentUsersTable();
    updateStudentFilterCounts(currentStudentUsers);
    showToast(`Student status updated to ${newStatus}.`, 'success');
  } catch (err) {
    console.error('Error updating student status:', err);
    showToast(err.message || 'Error updating student status.', 'error');
  }
}

async function loadStudentAccounts() {
  const tbody = document.getElementById('studentUsersTableBody');
  try {
    const res = await fetch('/api/students');
    if (!res.ok) throw new Error('Failed to fetch students.');
    const result = await res.json();
    currentStudentUsers = (result.students || []).map((s) => ({
      ...s,
      student_status: evaluateStudentStatus(s)
    }));
    renderStudentUsersTable(currentStudentUsers);
    updateStudentFilterCounts(currentStudentUsers);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#64748b;padding:24px;">${escapeHtml(err.message || 'Unable to load student records.')}</td></tr>`;
    }
  }
}

async function updateAccountStatus(employeeId, newStatus) {
  try {
    showToast(`Updating account ${employeeId} to ${newStatus}...`);
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('sessionId='))
      ?.split('=')[1];

    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(employeeId)}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId || ''
      },
      body: JSON.stringify({ status: newStatus })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update account status.');
    }

    showToast(`Account successfully updated to ${newStatus}!`);
    await loadDashboardData();
  } catch (error) {
    console.error('Account update error:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

let pendingDisapproval = null;

function disapproveAccount(employeeId, employeeName) {
  const modal = document.getElementById('disapproveConfirmModal');
  if (!modal) return;

  pendingDisapproval = {
    employeeId,
    employeeName: employeeName || employeeId,
    trigger: document.activeElement
  };
  const accountName = document.getElementById('disapproveConfirmAccount');
  const confirmButton = document.getElementById('btnDisapproveConfirmYes');
  if (accountName) accountName.textContent = pendingDisapproval.employeeName;
  if (confirmButton) {
    confirmButton.disabled = false;
    confirmButton.textContent = 'Yes, disapprove it';
  }

  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  confirmButton?.focus();
}

function closeDisapproveConfirmModal() {
  const modal = document.getElementById('disapproveConfirmModal');
  if (!modal) return;

  modal.hidden = true;
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  const trigger = pendingDisapproval?.trigger;
  pendingDisapproval = null;
  if (trigger?.isConnected) trigger.focus();
}

async function confirmDisapproveAccount() {
  if (!pendingDisapproval) return;
  const { employeeId, employeeName } = pendingDisapproval;
  closeDisapproveConfirmModal();
  await submitDisapproval(employeeId, employeeName);
}

async function submitDisapproval(employeeId, employeeName) {
  try {
    showToast(`Disapproving account request for ${employeeName || employeeId}...`);
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('sessionId='))
      ?.split('=')[1];

    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(employeeId)}/disapprove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId || ''
      },
      body: JSON.stringify({ reason: '' })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to disapprove account.');
    }

    showToast(`Account request for ${employeeName || employeeId} has been disapproved.`);
    await loadDashboardData();
  } catch (error) {
    console.error('Disapprove error:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

document.addEventListener('keydown', (event) => {
  const modal = document.getElementById('disapproveConfirmModal');
  if (event.key === 'Escape' && modal && !modal.hidden) closeDisapproveConfirmModal();
});

async function deleteAccount(employeeId, employeeName) {
  const confirmed = window.confirm(
    `Permanently delete account ${employeeName || employeeId}?\n\nThis action cannot be undone.`
  );
  if (!confirmed) return;

  try {
    showToast(`Deleting account ${employeeName || employeeId}...`);
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('sessionId='))
      ?.split('=')[1];

    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(employeeId)}`, {
      method: 'DELETE',
      headers: {
        'x-session-id': sessionId || ''
      }
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete account.');
    }

    showToast(`Account ${employeeName || employeeId} permanently deleted.`);
    await loadDashboardData();
  } catch (error) {
    console.error('Delete error:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}
window.updateAccountStatus = updateAccountStatus;
window.disapproveAccount = disapproveAccount;
window.confirmDisapproveAccount = confirmDisapproveAccount;
window.closeDisapproveConfirmModal = closeDisapproveConfirmModal;
window.deleteAccount = deleteAccount;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(dateString) {
  if (!dateString) return 'Recently';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return new Date(dateString).toLocaleDateString();
}

// 7. Logout Handling
function initLogout() {
  const logoutBtn = document.querySelector('#logoutButton');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    logoutBtn.disabled = true;

    // Get session ID from cookie if available
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('sessionId='))
      ?.split('=')[1];

    fetch('/api/logout', {
      method: 'POST',
      headers: { 'x-session-id': sessionId || '' }
    })
      .then(async (response) => {
        const result = await response.json();
        return result;
      })
      .catch((err) => {
        console.warn('Logout API error:', err);
      })
      .finally(() => {
        // Clear session info
        sessionStorage.removeItem('oauthUserInfo');
        document.cookie = 'sessionId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        showToast('You have been securely logged out.');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 400);
      });
  });
}

// 8. Metric Card Spotlight Follower
function initMetricCardSpotlights() {
  const cards = document.querySelectorAll('.metric-grid article');
  cards.forEach((card) => {
    const updatePosition = (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    };

    card.addEventListener('mouseenter', updatePosition);
    card.addEventListener('mousemove', updatePosition);
  });
}

// Toast helper
function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

window.showToast = showToast;

// ==========================================
// 9. Profile Module Functions (image.png & Untitled.jpg)
// ==========================================

let selectedAvatarFile = null;
let currentProfileData = null;

function getSessionId() {
  const cookieMatch = document.cookie.split('; ').find((row) => row.startsWith('sessionId='));
  return cookieMatch ? cookieMatch.split('=')[1] : '';
}
function loadSavedAvatar() {
  try {
    const storedUser = JSON.parse(sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('activeUser') || '{}');
    const userAvatar = storedUser && storedUser.avatar_url ? storedUser.avatar_url : 'https://api.iconify.design/solar:user-circle-bold-duotone.svg?color=%2364748b';

    const avatarSelectors = [
      '#profileAvatar', 
      '#profileHeroAvatarImg',
      '#headerAvatarImg',
      '#headerAvatar',
      '.user-avatar img', 
      '.sidebar-profile img'
    ];
    
    avatarSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(img => {
        // Only update if it's not already pointing to the correct avatar or a valid data/blob url
        if (!img.src.includes(userAvatar) && !img.src.startsWith('data:')) {
          img.src = userAvatar;
        }

        // Prevent infinite error loops if a link goes dead
        img.onerror = function() {
          this.onerror = null; 
          this.src = 'https://api.iconify.design/solar:user-circle-bold-duotone.svg?color=%2364748b';
        };
      });
    });
  } catch (e) {
    console.error('Error enforcing saved avatar:', e);
  }
}
window.loadSavedAvatar = loadSavedAvatar;

function initProfileModule() {
  loadProfileData();

  // A. Profile Information Form Submit
  const profileForm = document.getElementById('profileInfoForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnUpdateProfile');
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<iconify-icon icon="solar:diskette-bold-duotone" width="17" height="17"></iconify-icon> Updating...';
      }

      const name = document.getElementById('profileFullName')?.value?.trim();
      const username = document.getElementById('profileUsername')?.value?.trim();
      const email = document.getElementById('profileEmail')?.value?.trim();

      const sessionId = getSessionId();

      try {
        const sessionId = getSessionId();
        const storedUser = JSON.parse(sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('currentUser') || '{}');
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId || '',
            'x-employee-id': storedUser.employee_id || storedUser.id || '',
            'x-employee-email': storedUser.email || '',
            'x-employee-role': storedUser.role || ''
          },
          body: JSON.stringify({ name, username, email })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update profile.');

        showToast(result.message || 'Profile updated successfully.');

        // Update header & hero name
        const heroNameEl = document.getElementById('profileHeroName');
        const dashNameEl = document.getElementById('dashboardName');
        if (heroNameEl && name) heroNameEl.textContent = name;
        if (dashNameEl && name) dashNameEl.textContent = name;

        // Update local session storage if available
        try {
          const stored = JSON.parse(sessionStorage.getItem('oauthUserInfo') || '{}');
          stored.name = name;
          stored.email = email;
          sessionStorage.setItem('oauthUserInfo', JSON.stringify(stored));
        } catch (storageErr) { }

        await loadProfileData();
      } catch (err) {
        showToast(err.message || 'Update failed.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  // B. Profile Picture File Selection
  const chooseBtn = document.getElementById('btnChooseImage');
  const fileInput = document.getElementById('profileAvatarFileInput');
  const previewImg = document.getElementById('profilePicturePreview');
  const uploadBtn = document.getElementById('btnUploadPicture');

  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image file exceeds maximum limit of 5MB.', 'error');
        fileInput.value = '';
        return;
      }

      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type.toLowerCase())) {
        showToast('Please select a JPG, PNG, GIF, or WEBP image.', 'error');
        fileInput.value = '';
        return;
      }

      selectedAvatarFile = file;

      // Live client preview
      const reader = new FileReader();
      reader.onload = (event) => {
        if (previewImg) previewImg.src = event.target.result;
        showToast(`Image "${file.name}" selected. Click "Upload Picture" to save.`);
      };
      reader.readAsDataURL(file);
    });
  }

  // C. Profile Picture Upload Action
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      if (!selectedAvatarFile) {
        showToast('Please choose an image first by clicking "Choose Image".', 'error');
        fileInput?.click();
        return;
      }

      const originalText = uploadBtn.innerHTML;
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<iconify-icon icon="solar:upload-track-bold-duotone" width="18" height="18"></iconify-icon> Uploading...';

      const sessionId = getSessionId();

      try {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target.result;

          let storedUser = JSON.parse(sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('activeUser') || '{}');

          try {
            const resp = await fetch('/api/profile/avatar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': sessionStorage.getItem('sessionId') || '',
                'x-employee-id': storedUser.employee_id || storedUser.id || '',
                'x-employee-email': storedUser.email || storedUser.employee_email || '',
                'x-employee-role': storedUser.role || storedUser.employee_role || ''
              },
              body: JSON.stringify({
                imageBase64: dataUrl,
                mimeType: selectedAvatarFile.type,
                fileName: selectedAvatarFile.name
              })
            });

            const result = await resp.json();

            if (!resp.ok || !result.ok) {
              throw new Error(result.error || 'Failed to upload avatar');
            }

            // ==========================================
            // PASTE THE SNIPPET RIGHT HERE:
            // ==========================================

            // 3. Update the storedUser object with the new avatar url from the server
            storedUser.avatar_url = result.avatar_url;

            // 4. Save it back to session storage
            sessionStorage.setItem('oauthUserInfo', JSON.stringify(storedUser));

            // 5. Universally update ALL profile picture tags on the screen
            const avatarSelectors = [
              '#profileAvatar',
              '.profile-img',
              'img[alt="Profile"]',
              '.user-avatar img',
              '#userAvatarImg',
              '.sidebar-profile img'
            ];

            avatarSelectors.forEach(selector => {
              document.querySelectorAll(selector).forEach(img => {
                img.src = result.avatar_url;
              });
            });

            showToast('Profile picture updated successfully!', 'success');
            // ==========================================

          } catch (err) {
            console.error('Avatar upload error:', err);
            showToast(err.message || 'Failed to upload picture.', 'error');
          }
        };
        reader.readAsDataURL(selectedAvatarFile);
      } catch (e) {
        console.error('FileReader error:', e);
      }
    });
  }

  // D. Quick Action Buttons
  const btnReturnDash = document.getElementById('btnProfileReturnDashboard');
  if (btnReturnDash) {
    btnReturnDash.addEventListener('click', () => {
      switchView('overview');
      window.location.hash = '#dashboard';
    });
  }

  const btnUserMgmt = document.getElementById('btnProfileUserManagement');
  if (btnUserMgmt) {
    btnUserMgmt.addEventListener('click', () => {
      switchView('users');
      window.location.hash = '#users';
    });
  }

  const btnLogout = document.getElementById('btnProfileSecureLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      const sessionId = getSessionId();
      fetch('/api/logout', {
        method: 'POST',
        headers: { 'x-session-id': sessionId || '' }
      }).finally(() => {
        sessionStorage.removeItem('oauthUserInfo');
        document.cookie = 'sessionId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        showToast('You have been securely logged out.');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 400);
      });
    });
  }
}

async function loadProfileData() {
  try {
    const sessionId = getSessionId();
    const storedUser = JSON.parse(sessionStorage.getItem('oauthUserInfo') || localStorage.getItem('currentUser') || '{}');
    const response = await fetch('/api/profile', {
      headers: {
        'x-session-id': sessionId || '',
        'x-employee-id': storedUser.employee_id || storedUser.id || '',
        'x-employee-email': storedUser.email || '',
        'x-employee-role': storedUser.role || ''
      }
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.profile) return;

    currentUserProfile = data.profile;
    currentProfileData = data.profile;
    const p = data.profile;
    if (p.employee_role) {
      currentSessionUserRole = p.employee_role;
      applyRoleBasedAccessControl(p.employee_role);
      window.updateAlertChatAccess?.();
    }

    // 1. Hero Banner
    const heroName = document.getElementById('profileHeroName');
    const heroRole = document.getElementById('profileHeroRole');
    const heroStatus = document.getElementById('profileHeroStatusText');
    const heroId = document.getElementById('profileHeroIdText');
    const heroAvatar = document.getElementById('profileHeroAvatarImg');

    if (heroName) heroName.textContent = p.employee_name || 'Jolehmeh Billones';
    if (heroRole) heroRole.textContent = p.employee_role || 'System Administrator';
    if (heroStatus) heroStatus.textContent = p.employee_status || 'Active';
    if (heroId) heroId.textContent = `ID: ${p.employee_id || 'ADM-ADM00001'}`;
    if (heroAvatar && p.avatar_url) heroAvatar.src = p.avatar_url;

    // 2. Top Header sync
    const dashName = document.getElementById('dashboardName');
    const dashRole = document.getElementById('dashboardRole');
    const headerAvatar = document.getElementById('headerAvatarImg');
    if (dashName) dashName.textContent = p.employee_name || 'Administrator';
    if (dashRole) dashRole.textContent = p.employee_role || 'System Administrator';
    if (headerAvatar && p.avatar_url) headerAvatar.src = p.avatar_url;

    // 3. Overview Stat Cards
    const statEmpId = document.getElementById('statEmployeeId');
    const statAccess = document.getElementById('statAccessLevel');
    const statActivity = document.getElementById('statLastActivity');

    if (statEmpId) statEmpId.textContent = p.employee_id || 'ADM-ADM00001';
    if (statAccess) statAccess.textContent = p.employee_role || 'System Administrator';
    if (statActivity) statActivity.textContent = p.last_activity || '2025-12-01T22:32:37.267631+00:00';

    // 4. Form inputs
    const inputName = document.getElementById('profileFullName');
    const inputUsername = document.getElementById('profileUsername');
    const inputEmail = document.getElementById('profileEmail');
    const inputRole = document.getElementById('profileRole');
    const previewImg = document.getElementById('profilePicturePreview');

    if (inputName) inputName.value = p.employee_name || '';
    if (inputUsername) inputUsername.value = p.username || 'admin_joleh';
    if (inputEmail) inputEmail.value = p.employee_email || '';
    if (inputRole) inputRole.value = p.employee_role || p.department || 'System Administrator';
    if (previewImg && p.avatar_url) previewImg.src = p.avatar_url;

  } catch (err) {
    console.warn('Could not load profile data:', err);
  }
}

window.loadProfileData = loadProfileData;
window.initProfileModule = initProfileModule;

// ==========================================
// REPORTS & ANALYTICS MODULE (image.png reference)
// ==========================================
let currentReportsData = { metrics: {}, analytics: {}, incidents: [] };
let reportsCurrentPage = 1;
const reportsPageSize = 10;
let reportsShowArchived = false;
let reportsTrendRange = 'monthly';
let reportsStatusRange = 'monthly';

function initReportsModule() {
  const sortSelect = document.getElementById('reportSortOrder');
  const statusSelect = document.getElementById('reportStatusFilter');
  const catSelect = document.getElementById('reportCategoryFilter');
  const searchInput = document.getElementById('reportSearchInput');
  const startDateInput = document.getElementById('reportStartDate');
  const endDateInput = document.getElementById('reportEndDate');
  const clearDatesBtn = document.getElementById('reportClearDatesBtn');
  const exportCsvBtn = document.getElementById('reportExportCsvBtn');
  const archivedToggleBtn = document.getElementById('reportArchivedBtn');

  document.querySelectorAll('[data-report-range]').forEach(button => {
    button.addEventListener('click', () => {
      reportsTrendRange = button.dataset.reportRange;
      document.querySelectorAll('[data-report-range]').forEach(rangeButton => {
        const isSelected = rangeButton === button;
        rangeButton.classList.toggle('active', isSelected);
        rangeButton.setAttribute('aria-pressed', String(isSelected));
      });
      renderReportAnalytics(currentReportsData.analytics);
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', () => {
      if (statusSelect.value === 'Cancelled') {
        reportsShowArchived = true;
        if (archivedToggleBtn) archivedToggleBtn.classList.add('active');
      } else if (statusSelect.value !== 'Cancelled' && reportsShowArchived && (!archivedToggleBtn || !archivedToggleBtn.dataset.manual)) {
        reportsShowArchived = false;
        if (archivedToggleBtn) archivedToggleBtn.classList.remove('active');
      }
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (catSelect) {
    catSelect.addEventListener('change', () => {
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (searchInput) {
    let searchDebounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        reportsCurrentPage = 1;
        loadReportsData();
      }, 300);
    });
  }

  if (startDateInput) {
    startDateInput.addEventListener('change', () => {
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (endDateInput) {
    endDateInput.addEventListener('change', () => {
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (clearDatesBtn) {
    clearDatesBtn.addEventListener('click', () => {
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openExportDrawer();
    });
  }

  if (archivedToggleBtn) {
    archivedToggleBtn.addEventListener('click', () => {
      reportsShowArchived = !reportsShowArchived;
      archivedToggleBtn.dataset.manual = reportsShowArchived ? 'true' : '';
      archivedToggleBtn.classList.toggle('active', reportsShowArchived);
      reportsCurrentPage = 1;
      loadReportsData();
    });
  }

  // Metric card click-to-filter support
  const cardTotal = document.querySelector('.report-metric-card.card-total');
  const cardActive = document.querySelector('.report-metric-card.card-active');
  const cardPending = document.querySelector('.report-metric-card.card-pending');
  const cardResolved = document.querySelector('.report-metric-card.card-resolved');
  const cardCancelled = document.querySelector('.report-metric-card.card-cancelled');

  const setReportStatus = (newStatus) => {
    if (statusSelect) {
      statusSelect.value = newStatus;
      if (newStatus === 'Cancelled') {
        reportsShowArchived = true;
        if (archivedToggleBtn) archivedToggleBtn.classList.add('active');
      } else if (newStatus !== 'Cancelled' && reportsShowArchived && (!archivedToggleBtn || !archivedToggleBtn.dataset.manual)) {
        reportsShowArchived = false;
        if (archivedToggleBtn) archivedToggleBtn.classList.remove('active');
      }
      reportsCurrentPage = 1;
      loadReportsData();
    }
  };

  if (cardTotal) {
    cardTotal.style.cursor = 'pointer';
    cardTotal.title = 'Filter by All Status';
    cardTotal.addEventListener('click', () => setReportStatus('all'));
  }
  if (cardActive) {
    cardActive.style.cursor = 'pointer';
    cardActive.title = 'Filter by Active Emergencies';
    cardActive.addEventListener('click', () => setReportStatus('Active'));
  }
  if (cardPending) {
    cardPending.style.cursor = 'pointer';
    cardPending.title = 'Filter by On Going / Pending Emergencies';
    cardPending.addEventListener('click', () => setReportStatus('On Going'));
  }
  if (cardResolved) {
    cardResolved.style.cursor = 'pointer';
    cardResolved.title = 'Filter by Resolved Incident Emergencies';
    cardResolved.addEventListener('click', () => setReportStatus('Resolved'));
  }
  if (cardCancelled) {
    cardCancelled.style.cursor = 'pointer';
    cardCancelled.title = 'Filter by Cancelled Emergencies';
    cardCancelled.addEventListener('click', () => setReportStatus('Cancelled'));
  }

  // Real-time EventSource connection and live sync
  initReportsRealtime();
  startReportsRealtimeSync();

  window.addEventListener('focus', () => {
    if (window.location.hash === '#reports') {
      loadReportsData();
    }
  });

  // Pre-load if initially on reports
  if (window.location.hash === '#reports') {
    loadReportsData();
  }
}

function initReportsRealtime() {
  if (window.__reportsEventSource) return;
  try {
    const es = new EventSource('/api/reports/realtime');
    window.__reportsEventSource = es;
    es.onopen = () => {
      console.log('[REALTIME] Connected to live incident reports stream');
    };
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && (data.type === 'incident_change' || data.type === 'incident_update')) {
          console.log('[REALTIME] Incident change received, updating reports module in real-time...');
          loadReportsData();
          if (typeof loadDashboardData === 'function') loadDashboardData();
        }
      } catch (err) {
        console.warn('Realtime message parse error:', err);
      }
    };
    es.onerror = () => {
      // Browser EventSource automatically reconnects upon error
    };
  } catch (err) {
    console.warn('[REALTIME] EventSource not available:', err);
  }
}

let reportsSyncTimer = null;
function startReportsRealtimeSync() {
  if (reportsSyncTimer) clearInterval(reportsSyncTimer);
  reportsSyncTimer = setInterval(() => {
    const isReports = window.location.hash === '#reports' || 
      (document.getElementById('view-reports') && !document.getElementById('view-reports').classList.contains('hidden') && document.getElementById('view-reports').style.display !== 'none');
    if (isReports && typeof loadReportsData === 'function') {
      loadReportsData();
    }
  }, 4000);
}

async function loadReportsData() {
  try {
    const sortSelect = document.getElementById('reportSortOrder');
    const statusSelect = document.getElementById('reportStatusFilter');
    const catSelect = document.getElementById('reportCategoryFilter');
    const searchInput = document.getElementById('reportSearchInput');
    const startDateInput = document.getElementById('reportStartDate');
    const endDateInput = document.getElementById('reportEndDate');

    const params = new URLSearchParams();
    if (sortSelect) params.set('sort', sortSelect.value);
    if (statusSelect && statusSelect.value !== 'all') params.set('status', statusSelect.value);
    if (catSelect && catSelect.value !== 'all') params.set('category', catSelect.value);
    if (searchInput && searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (startDateInput && startDateInput.value) params.set('startDate', startDateInput.value);
    if (endDateInput && endDateInput.value) params.set('endDate', endDateInput.value);
    if (reportsShowArchived) params.set('archived', 'true');

    const response = await fetch(`/api/reports/incidents?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load incident reports');
    const data = await response.json();

    currentReportsData = data;

    // 1. Update summary cards on top of incident analytic by month of record
    const m = data.metrics || {};
    const monthlyBuckets = data.analytics?.trends?.monthly || [];
    const monthRecord = monthlyBuckets.slice().reverse().find(b => (Number(b.total) || 0) > 0) || monthlyBuckets[monthlyBuckets.length - 1] || {};
    const monthActive = Number(monthRecord.active) || 0;
    const monthOngoing = Number(monthRecord.ongoing) || 0;
    const monthResolved = Number(monthRecord.resolved) || 0;
    const monthCancelled = Number(monthRecord.cancelled) || 0;
    const monthTotal = monthActive + monthOngoing + monthResolved + monthCancelled;

    const elTotal = document.getElementById('reportMetricTotal');
    const elActive = document.getElementById('reportMetricActive');
    const elPending = document.getElementById('reportMetricPending');
    const elResolved = document.getElementById('reportMetricResolved');
    const elCancelled = document.getElementById('reportMetricCancelled');
    const elArchived = document.getElementById('reportArchivedCount');

    // Total incidents counts active + ongoing + resolved + cancelled by month of record
    if (elTotal) elTotal.textContent = monthTotal;
    if (elActive) elActive.textContent = monthActive;
    if (elPending) elPending.textContent = monthOngoing;
    if (elResolved) elResolved.textContent = monthResolved;
    if (elCancelled) elCancelled.textContent = monthCancelled;
    if (elArchived) elArchived.textContent = m.archived ?? 0;

    renderReportAnalytics(data.analytics || {});

    // Highlight matching metric card
    const currentStatusVal = statusSelect ? statusSelect.value : 'all';
    document.querySelectorAll('.report-metric-card').forEach(card => card.classList.remove('is-active-filter'));
    if (currentStatusVal === 'all') {
      document.querySelector('.report-metric-card.card-total')?.classList.add('is-active-filter');
    } else if (currentStatusVal === 'Active') {
      document.querySelector('.report-metric-card.card-active')?.classList.add('is-active-filter');
    } else if (currentStatusVal === 'On Going') {
      document.querySelector('.report-metric-card.card-pending')?.classList.add('is-active-filter');
    } else if (currentStatusVal === 'Resolved') {
      document.querySelector('.report-metric-card.card-resolved')?.classList.add('is-active-filter');
    } else if (currentStatusVal === 'Cancelled') {
      document.querySelector('.report-metric-card.card-cancelled')?.classList.add('is-active-filter');
    }

    // 2. Render Table
    renderReportsTable();

  } catch (err) {
    console.error('Error in loadReportsData:', err);
  }
}

function createSmoothPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  const smoothing = 0.18;
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p0 === p1 ? p1.x : p1.x + (p2.x - p0.x) * smoothing;
    const cp1y = p0 === p1 ? p1.y : p1.y + (p2.y - p0.y) * smoothing;
    const cp2x = p2 === p3 ? p2.x : p2.x - (p3.x - p1.x) * smoothing;
    const cp2y = p2 === p3 ? p2.y : p2.y - (p3.y - p1.y) * smoothing;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function createSmoothArea(points, baselineY) {
  if (!points || points.length === 0) return '';
  const path = createSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${path} L ${last.x.toFixed(1)},${baselineY.toFixed(1)} L ${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
}

function renderReportAnalytics(analytics = {}) {
  const trendContainer = document.getElementById('reportTrendChart');
  const statusContainer = document.getElementById('reportStatusChart');
  if (!trendContainer || !statusContainer) return;

  const currentAnalytics = analytics.trends ? analytics : (currentReportsData.analytics || {});
  const trend = currentAnalytics.trends?.[reportsTrendRange] || [];

  // Count status totals for legend badges across current range
  const activeTrend = trend.reduce((sum, b) => sum + (Number(b.active) || 0), 0);
  const ongoingTrend = trend.reduce((sum, b) => sum + (Number(b.ongoing) || 0), 0);
  const resolvedTrend = trend.reduce((sum, b) => sum + (Number(b.resolved) || 0), 0);
  const cancelledTrend = trend.reduce((sum, b) => sum + (Number(b.cancelled) || 0), 0);

  // Update Legend Badges with real totals & interactive filters
  const legendContainer = document.getElementById('reportTrendLegend');
  if (legendContainer) {
    legendContainer.innerHTML = `
      <button type="button" class="trend-legend-pill" data-series="active" title="Filter Active alerts">
        <i class="report-legend-dot report-legend-active"></i>
        <span>Active</span>
        <strong class="legend-count">${activeTrend}</strong>
      </button>
      <button type="button" class="trend-legend-pill" data-series="ongoing" title="Filter On Going alerts">
        <i class="report-legend-dot report-legend-ongoing"></i>
        <span>On Going</span>
        <strong class="legend-count">${ongoingTrend}</strong>
      </button>
      <button type="button" class="trend-legend-pill" data-series="resolved" title="Filter Resolved alerts">
        <i class="report-legend-dot report-legend-resolved"></i>
        <span>Resolved</span>
        <strong class="legend-count">${resolvedTrend}</strong>
      </button>
      <button type="button" class="trend-legend-pill" data-series="cancelled" title="Filter Cancelled alerts">
        <i class="report-legend-dot report-legend-cancelled"></i>
        <span>Cancelled</span>
        <strong class="legend-count">${cancelledTrend}</strong>
      </button>
    `;

    legendContainer.querySelectorAll('.trend-legend-pill').forEach(pill => {
      const series = pill.dataset.series;
      pill.addEventListener('mouseenter', () => highlightTrendSeries(series));
      pill.addEventListener('mouseleave', () => resetTrendSeriesHighlight());
      pill.addEventListener('click', () => {
        const isPinned = pill.classList.toggle('is-pinned');
        if (isPinned) {
          legendContainer.querySelectorAll('.trend-legend-pill').forEach(p => {
            if (p !== pill) p.classList.remove('is-pinned');
          });
          highlightTrendSeries(series);
        } else {
          resetTrendSeriesHighlight();
        }
      });
    });
  }

  if (trend.length === 0) {
    trendContainer.innerHTML = '<p class="report-chart-empty">No incident trend data is available for this timeframe.</p>';
  } else {
    const chartWidth = 720;
    const chartHeight = 280;
    const left = 48;
    const right = 24;
    const top = 26;
    const bottom = 42;
    const plotWidth = chartWidth - left - right;
    const plotHeight = chartHeight - top - bottom;
    const baselineY = top + plotHeight;

    const maxValue = Math.max(1, ...trend.map(bucket => Math.max(
      Number(bucket.total) || 0,
      Number(bucket.active) || 0,
      Number(bucket.ongoing) || 0,
      Number(bucket.resolved) || 0,
      Number(bucket.cancelled) || 0
    )));
    const yMax = Math.max(4, Math.ceil(maxValue / 4) * 4);

    const pointX = index => left + (trend.length === 1 ? plotWidth / 2 : (index * plotWidth) / (trend.length - 1));
    const pointY = value => top + plotHeight - ((Math.max(0, Number(value) || 0) / yMax) * plotHeight);

    const activePts = trend.map((b, i) => ({ x: pointX(i), y: pointY(b.active || 0), value: Number(b.active) || 0, bucket: b, index: i }));
    const ongoingPts = trend.map((b, i) => ({ x: pointX(i), y: pointY(b.ongoing || 0), value: Number(b.ongoing) || 0, bucket: b, index: i }));
    const resolvedPts = trend.map((b, i) => ({ x: pointX(i), y: pointY(b.resolved || 0), value: Number(b.resolved) || 0, bucket: b, index: i }));
    const cancelledPts = trend.map((b, i) => ({ x: pointX(i), y: pointY(b.cancelled || 0), value: Number(b.cancelled) || 0, bucket: b, index: i }));

    // Generate smooth paths & translucent gradient areas
    const resolvedArea = createSmoothArea(resolvedPts, baselineY);
    const activeArea = createSmoothArea(activePts, baselineY);
    const activePath = createSmoothPath(activePts);
    const ongoingPath = createSmoothPath(ongoingPts);
    const resolvedPath = createSmoothPath(resolvedPts);
    const cancelledPath = createSmoothPath(cancelledPts);

    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = Math.round((yMax * (4 - index)) / 4);
      const y = top + (plotHeight * index) / 4;
      return `
        <line x1="${left}" y1="${y}" x2="${chartWidth - right}" y2="${y}" class="report-chart-gridline"></line>
        <text x="${left - 12}" y="${y + 3.5}" text-anchor="end" class="report-chart-axis-label">${value}</text>
      `;
    }).join('');

    const baseline = `<line x1="${left}" y1="${baselineY}" x2="${chartWidth - right}" y2="${baselineY}" class="report-chart-baseline"></line>`;

    const labels = trend.map((bucket, index) => {
      const x = pointX(index);
      return `
        <line x1="${x}" y1="${baselineY}" x2="${x}" y2="${baselineY + 4}" stroke="#cbd5e1" stroke-width="1"></line>
        <text x="${x}" y="${chartHeight - 14}" text-anchor="middle" class="report-chart-axis-x">${escapeHtml(bucket.label)}</text>
      `;
    }).join('');

    // Overlay hover hitboxes for seamless cursor tracking
    const colWidth = trend.length > 1 ? plotWidth / (trend.length - 1) : plotWidth;
    const hitboxes = trend.map((bucket, index) => {
      const x = index === 0 ? left : pointX(index) - colWidth / 2;
      const w = (index === 0 || index === trend.length - 1) ? colWidth / 2 : colWidth;
      return `<rect x="${x}" y="${top - 10}" width="${w}" height="${plotHeight + bottom}" fill="transparent" class="report-chart-hitbox" data-bucket-index="${index}"></rect>`;
    }).join('');

    trendContainer.innerHTML = `
      <div id="reportChartTooltip" class="report-chart-tooltip" style="display:none; opacity:0;"></div>
      <svg class="report-trend-svg" id="reportTrendSvg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${reportsTrendRange} status trends (Active, On Going, Resolved, Cancelled)">
        <defs>
          <linearGradient id="trendResolvedAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>
          <linearGradient id="trendActiveAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.20" />
            <stop offset="100%" stop-color="#ef4444" stop-opacity="0.0" />
          </linearGradient>
          <filter id="pointShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.18"/>
          </filter>
        </defs>

        ${grid}
        ${baseline}

        <!-- Gradient Area Under Curves -->
        <path d="${resolvedArea}" fill="url(#trendResolvedAreaGrad)" class="report-chart-area report-chart-area-resolved" data-series="resolved"></path>
        <path d="${activeArea}" fill="url(#trendActiveAreaGrad)" class="report-chart-area report-chart-area-active" data-series="active"></path>

        <!-- Smooth Spline Curves -->
        <path d="${activePath}" class="report-chart-line report-chart-line-active" data-series="active"></path>
        <path d="${ongoingPath}" class="report-chart-line report-chart-line-ongoing" data-series="ongoing"></path>
        <path d="${resolvedPath}" class="report-chart-line report-chart-line-resolved" data-series="resolved"></path>
        <path d="${cancelledPath}" class="report-chart-line report-chart-line-cancelled" data-series="cancelled"></path>

        <!-- Interactive Crosshair (hidden by default) -->
        <line id="reportTrendCrosshair" class="report-chart-crosshair" x1="0" y1="${top}" x2="0" y2="${baselineY}" style="display:none;"></line>

        <!-- Data Circles with shadow -->
        ${trend.map((bucket, index) => `
          <g class="report-chart-point-group" data-bucket-index="${index}">
            <circle cx="${pointX(index)}" cy="${pointY(bucket.active || 0)}" r="4" filter="url(#pointShadow)" class="report-chart-point report-chart-point-active" data-series="active" data-value="${bucket.active || 0}"></circle>
            <circle cx="${pointX(index)}" cy="${pointY(bucket.ongoing || 0)}" r="4" filter="url(#pointShadow)" class="report-chart-point report-chart-point-ongoing" data-series="ongoing" data-value="${bucket.ongoing || 0}"></circle>
            <circle cx="${pointX(index)}" cy="${pointY(bucket.resolved || 0)}" r="4" filter="url(#pointShadow)" class="report-chart-point report-chart-point-resolved" data-series="resolved" data-value="${bucket.resolved || 0}"></circle>
            <circle cx="${pointX(index)}" cy="${pointY(bucket.cancelled || 0)}" r="4" filter="url(#pointShadow)" class="report-chart-point report-chart-point-cancelled" data-series="cancelled" data-value="${bucket.cancelled || 0}"></circle>
          </g>
        `).join('')}

        <!-- X-Axis Labels -->
        ${labels}

        <!-- Interactive hover hitboxes -->
        ${hitboxes}
      </svg>
    `;

    // Wire up interactive hovering tooltip
    wireTrendChartInteractions(trend, { chartWidth, chartHeight, pointX, pointY, top, baselineY });
  }

  // --- 2. Donut Status Breakdown ---
  // Derive status distribution from the selected time range: daily, weekly, monthly (default), yearly
  const currentStatusRange = reportsStatusRange || 'monthly';
  const statusBuckets = currentAnalytics.trends?.[currentStatusRange] || [];

  // Pick the record for the selected timeframe (prioritize latest bucket with records, or the latest period)
  const targetBucket = statusBuckets.slice().reverse().find(b => (Number(b.total) || 0) > 0)
    || statusBuckets[statusBuckets.length - 1]
    || {};

  const statusActive = Number(targetBucket.active) || 0;
  const statusOngoing = Number(targetBucket.ongoing) || 0;
  const statusResolved = Number(targetBucket.resolved) || 0;
  const statusCancelled = Number(targetBucket.cancelled) || 0;
  const statusTotal = statusActive + statusOngoing + statusResolved + statusCancelled;

  // Update status card subtitle to reflect the selected timeframe and period
  const subtitleEl = document.getElementById('reportStatusSubtitle');
  if (subtitleEl) {
    const rangeCap = currentStatusRange.charAt(0).toUpperCase() + currentStatusRange.slice(1);
    const bucketLabel = targetBucket.label ? ` (${targetBucket.label})` : '';
    subtitleEl.textContent = `${rangeCap} record across all alert states${bucketLabel}`;
  }

  const statusMap = {
    Active: statusActive,
    'On Going': statusOngoing,
    Resolved: statusResolved,
    Cancelled: statusCancelled
  };

  const colors = {
    Active: '#ef4444',
    'On Going': '#f59e0b',
    Resolved: '#10b981',
    Cancelled: '#64748b',
    'Total incidents': '#bd2868'
  };

  // Slices on donut ring represent constituent breakdown: Active, On Going, Resolved, Cancelled
  const sliceStatuses = ['Active', 'On Going', 'Resolved', 'Cancelled'];
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const slices = statusTotal === 0
    ? `<circle cx="75" cy="75" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="16"></circle>`
    : sliceStatuses.map(statusName => {
        const count = Math.max(0, Number(statusMap[statusName]) || 0);
        const length = statusTotal > 0 ? (circumference * count / statusTotal) : 0;
        const dashLength = length > 2 ? length - 1.5 : length;
        const slice = `
          <circle cx="75" cy="75" r="${radius}" fill="none"
            stroke="${colors[statusName] || '#94a3b8'}"
            stroke-width="16"
            stroke-dasharray="${dashLength} ${circumference - dashLength}"
            stroke-dashoffset="${-offset}"
            transform="rotate(-90 75 75)"
            class="report-donut-slice"
            data-status="${escapeHtml(statusName)}"
            title="${escapeHtml(statusName)}: ${count}">
          </circle>
        `;
        offset += length;
        return slice;
      }).join('');

  // Breakdown items in the legend list: Active, On Going, Resolved, Cancelled, and "Total incidents"
  const legendItemsData = [
    ...sliceStatuses.map(statusName => ({ status: statusName, count: statusMap[statusName] })),
    { status: 'Total incidents', count: statusTotal }
  ];

  const legend = legendItemsData.map(item => {
    const count = Number(item.count) || 0;
    const isTotal = item.status === 'Total incidents';
    const percentage = statusTotal > 0 ? (isTotal ? 100 : Math.round((count / statusTotal) * 100)) : 0;
    const color = colors[item.status] || '#bd2868';
    return `
      <li data-status="${escapeHtml(item.status)}" title="${escapeHtml(item.status)}: ${count} incidents (${percentage}%)">
        <i class="status-dot" style="--report-status-color:${color}"></i>
        <span class="status-name">${escapeHtml(item.status)}</span>
        <div class="status-track">
          <div class="status-bar" style="width: ${percentage}%;"></div>
        </div>
        <div class="status-numbers">
          <strong>${count}</strong>
          <small>${percentage}%</small>
        </div>
      </li>
    `;
  }).join('');

  const displayPeriod = (targetBucket.label || currentStatusRange).toUpperCase();

  statusContainer.innerHTML = `
    <div class="report-donut-wrap">
      <svg class="report-donut-svg" viewBox="0 0 150 150" role="img" aria-label="${statusTotal} incidents by status (${currentStatusRange})">
        <circle cx="75" cy="75" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="16"></circle>
        ${slices}
        <text x="75" y="72" text-anchor="middle" class="report-donut-total">${statusTotal}</text>
        <text x="75" y="88" text-anchor="middle" class="report-donut-caption">${escapeHtml(displayPeriod)}</text>
      </svg>
    </div>
    <div class="report-status-range-switch" role="group" aria-label="Incident status time range">
      <button type="button" data-status-range="daily" class="${currentStatusRange === 'daily' ? 'active' : ''}" aria-pressed="${currentStatusRange === 'daily'}">Daily</button>
      <button type="button" data-status-range="weekly" class="${currentStatusRange === 'weekly' ? 'active' : ''}" aria-pressed="${currentStatusRange === 'weekly'}">Weekly</button>
      <button type="button" data-status-range="monthly" class="${currentStatusRange === 'monthly' ? 'active' : ''}" aria-pressed="${currentStatusRange === 'monthly'}">Monthly</button>
      <button type="button" data-status-range="yearly" class="${currentStatusRange === 'yearly' ? 'active' : ''}" aria-pressed="${currentStatusRange === 'yearly'}">Yearly</button>
    </div>
    <ul class="report-status-legend" id="reportStatusLegendList">
      ${legend}
    </ul>
  `;

  // Wire up range buttons below pie graph
  statusContainer.querySelectorAll('[data-status-range]').forEach(button => {
    button.addEventListener('click', () => {
      reportsStatusRange = button.dataset.statusRange;
      renderReportAnalytics(currentAnalytics);
    });
  });

  wireStatusChartInteractions();
}

function highlightTrendSeries(seriesKey) {
  const container = document.getElementById('reportTrendChart');
  const legend = document.getElementById('reportTrendLegend');
  if (!container) return;

  container.querySelectorAll('[data-series]').forEach(el => {
    if (el.dataset.series === seriesKey) {
      el.classList.add('is-highlighted');
      el.classList.remove('is-dimmed');
    } else {
      el.classList.add('is-dimmed');
      el.classList.remove('is-highlighted');
    }
  });

  if (legend) {
    legend.querySelectorAll('.trend-legend-pill').forEach(pill => {
      pill.classList.toggle('is-dimmed', pill.dataset.series !== seriesKey);
    });
  }
}

function resetTrendSeriesHighlight() {
  const container = document.getElementById('reportTrendChart');
  const legend = document.getElementById('reportTrendLegend');
  if (!container) return;

  const pinned = legend?.querySelector('.trend-legend-pill.is-pinned');
  if (pinned) {
    highlightTrendSeries(pinned.dataset.series);
    return;
  }

  container.querySelectorAll('[data-series]').forEach(el => {
    el.classList.remove('is-highlighted', 'is-dimmed');
  });

  if (legend) {
    legend.querySelectorAll('.trend-legend-pill').forEach(pill => {
      pill.classList.remove('is-dimmed');
    });
  }
}

function wireTrendChartInteractions(trend, { chartWidth, pointX, pointY, top, baselineY }) {
  const container = document.getElementById('reportTrendChart');
  const svg = document.getElementById('reportTrendSvg');
  const crosshair = document.getElementById('reportTrendCrosshair');
  const tooltip = document.getElementById('reportChartTooltip');
  if (!container || !svg || !tooltip) return;

  function showTooltipAtBucket(index) {
    const bucket = trend[index];
    if (!bucket) return;

    const xPos = pointX(index);
    if (crosshair) {
      crosshair.setAttribute('x1', xPos);
      crosshair.setAttribute('x2', xPos);
      crosshair.style.display = 'block';
    }

    // Highlight circles at this bucket
    container.querySelectorAll('.report-chart-point-group').forEach((group, i) => {
      group.querySelectorAll('.report-chart-point').forEach(circle => {
        circle.classList.toggle('is-active', i === index);
      });
    });

    const total = Number(bucket.total) || 0;
    const active = Number(bucket.active) || 0;
    const ongoing = Number(bucket.ongoing) || 0;
    const resolved = Number(bucket.resolved) || 0;
    const cancelled = Number(bucket.cancelled) || 0;

    tooltip.innerHTML = `
      <div class="report-tooltip-header">
        <span class="report-tooltip-label">${escapeHtml(bucket.label)}</span>
        <span class="report-tooltip-total">${total} Total</span>
      </div>
      <div class="report-tooltip-rows">
        <div class="report-tooltip-row">
          <span class="report-tooltip-row-label">
            <i class="report-legend-dot report-legend-active"></i>Active
          </span>
          <strong>${active}</strong>
        </div>
        <div class="report-tooltip-row">
          <span class="report-tooltip-row-label">
            <i class="report-legend-dot report-legend-ongoing"></i>On Going
          </span>
          <strong>${ongoing}</strong>
        </div>
        <div class="report-tooltip-row">
          <span class="report-tooltip-row-label">
            <i class="report-legend-dot report-legend-resolved"></i>Resolved
          </span>
          <strong>${resolved}</strong>
        </div>
        <div class="report-tooltip-row">
          <span class="report-tooltip-row-label">
            <i class="report-legend-dot report-legend-cancelled"></i>Cancelled
          </span>
          <strong>${cancelled}</strong>
        </div>
      </div>
    `;

    // Position tooltip relative to container width
    const svgRect = svg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const pixelX = ((xPos / chartWidth) * svgRect.width) + (svgRect.left - containerRect.left);

    // Find the highest point at this bucket to position tooltip above it
    const minY = Math.min(pointY(active), pointY(ongoing), pointY(resolved), pointY(cancelled));
    const pixelY = ((minY / 280) * svgRect.height) + (svgRect.top - containerRect.top);

    tooltip.style.left = `${Math.max(80, Math.min(containerRect.width - 80, pixelX))}px`;
    tooltip.style.top = `${Math.max(10, pixelY)}px`;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
  }

  function hideTooltip() {
    if (crosshair) crosshair.style.display = 'none';
    if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.style.display = 'none';
    }
    container.querySelectorAll('.report-chart-point').forEach(circle => {
      circle.classList.remove('is-active');
    });
  }

  container.querySelectorAll('.report-chart-hitbox').forEach(hitbox => {
    hitbox.addEventListener('mouseenter', () => {
      const idx = Number(hitbox.dataset.bucketIndex);
      showTooltipAtBucket(idx);
    });
  });

  svg.addEventListener('mouseleave', hideTooltip);
}

function wireStatusChartInteractions() {
  const container = document.getElementById('reportStatusChart');
  if (!container) return;

  const slices = container.querySelectorAll('.report-donut-slice');
  const legendItems = container.querySelectorAll('#reportStatusLegendList li');

  function highlightStatus(status) {
    if (status === 'Total incidents') {
      slices.forEach(slice => {
        slice.classList.add('is-highlighted');
        slice.classList.remove('is-dimmed');
      });
      legendItems.forEach(item => {
        const match = item.dataset.status === 'Total incidents';
        item.classList.toggle('is-highlighted', match);
        item.classList.toggle('is-dimmed', !match);
      });
      return;
    }
    slices.forEach(slice => {
      const match = slice.dataset.status === status;
      slice.classList.toggle('is-highlighted', match);
      slice.classList.toggle('is-dimmed', !match);
    });
    legendItems.forEach(item => {
      const match = item.dataset.status === status;
      item.classList.toggle('is-highlighted', match);
      item.classList.toggle('is-dimmed', !match);
    });
  }

  function resetStatus() {
    slices.forEach(slice => slice.classList.remove('is-highlighted', 'is-dimmed'));
    legendItems.forEach(item => item.classList.remove('is-highlighted', 'is-dimmed'));
  }

  slices.forEach(slice => {
    slice.addEventListener('mouseenter', () => highlightStatus(slice.dataset.status));
    slice.addEventListener('mouseleave', resetStatus);
  });

  legendItems.forEach(item => {
    item.addEventListener('mouseenter', () => highlightStatus(item.dataset.status));
    item.addEventListener('mouseleave', resetStatus);
  });
}

function renderReportsTable() {
  const tbody = document.getElementById('reportIncidentsTableBody');
  const paginationInfo = document.getElementById('reportTablePaginationInfo');
  const paginationControls = document.getElementById('reportPaginationControls');
  if (!tbody) return;

  const incidents = currentReportsData.incidents || [];
  const total = incidents.length;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:48px;color:#64748b;">
          No incident reports match the selected filters.
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0 incidents';
    if (paginationControls) paginationControls.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(total / reportsPageSize);
  if (reportsCurrentPage > totalPages) reportsCurrentPage = totalPages;
  if (reportsCurrentPage < 1) reportsCurrentPage = 1;

  const startIdx = (reportsCurrentPage - 1) * reportsPageSize;
  const endIdx = Math.min(startIdx + reportsPageSize, total);
  const pageIncidents = incidents.slice(startIdx, endIdx);

  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1}-${endIdx} of ${total} incidents`;
  }

  if (paginationControls) {
    paginationControls.innerHTML = `
      <button type="button" class="btn-page-ctrl" ${reportsCurrentPage <= 1 ? 'disabled' : ''} onclick="changeReportsPage(${reportsCurrentPage - 1})">&larr; Prev</button>
      <span style="display:inline-flex;align-items:center;padding:0 8px;font-size:12px;font-weight:600;">Page ${reportsCurrentPage} of ${totalPages}</span>
      <button type="button" class="btn-page-ctrl" ${reportsCurrentPage >= totalPages ? 'disabled' : ''} onclick="changeReportsPage(${reportsCurrentPage + 1})">Next &rarr;</button>
    `;
  }

  tbody.innerHTML = pageIncidents.map(inc => {
    // Category pill
    let catClass = 'medical';
    let catIcon = '❤️';
    const catLower = (inc.category || '').toLowerCase();
    if (catLower.includes('sec')) {
      catClass = 'security';
      catIcon = '🛡️';
    } else if (catLower.includes('urg')) {
      catClass = 'urgent';
      catIcon = '⚠️';
    } else if (catLower.includes('vicin') || catLower.includes('campus')) {
      catClass = 'vicinity';
      catIcon = '🏫';
    }

    // Status pill
    const statusLower = (inc.status || '').toLowerCase().replace(/[^a-z]/g, '');
    let statusPillClass = 'ongoing';
    let statusPillIcon = '⏰';
    let displayStatus = 'On Going';
    if (statusLower === 'active') {
      statusPillClass = 'active';
      statusPillIcon = '🚨';
      displayStatus = 'Active';
    } else if (statusLower === 'resolved') {
      statusPillClass = 'resolved';
      statusPillIcon = '✓';
      displayStatus = 'Resolved';
    } else if (statusLower === 'cancelled' || statusLower === 'canceled') {
      statusPillClass = 'cancelled';
      statusPillIcon = '✕';
      displayStatus = 'Cancelled';
    } else {
      statusPillClass = 'ongoing';
      statusPillIcon = '⏰';
      displayStatus = 'On Going';
    }

    const createdFormatted = inc.created_at ? formatDateTime(inc.created_at) : 'Recently';
    const resolvedFormatted = inc.resolved_at ? formatDateTime(inc.resolved_at) : null;
    const updatedFormatted = (statusLower === 'resolved' && resolvedFormatted) ? resolvedFormatted : (inc.updated_at ? formatDateTime(inc.updated_at) : createdFormatted);

    return `
      <tr>
        <td>
          <span class="table-incident-id">${escapeHtml(inc.incident_code)}</span>
        </td>
        <td>
          <div class="table-location-info">
            <span class="location-coord">Lat: ${Number(inc.latitude).toFixed(6)}</span>
            <span class="location-coord">Lng: ${Number(inc.longitude).toFixed(6)}</span>
            <span class="location-distance">${escapeHtml(inc.location_address || 'Near UMAK Campus')}</span>
          </div>
        </td>
        <td>
          <div class="table-category-cell">
            <span class="category-pill ${catClass}">${catIcon} ${escapeHtml((inc.category || 'Medical').toUpperCase())}</span>
            <span class="category-detail-text">${escapeHtml(inc.incident_detail || '')}</span>
          </div>
        </td>
        <td>
          <div class="table-student-info">
            <iconify-icon icon="solar:user-bold-duotone" class="student-avatar-icon"></iconify-icon>
            <div class="student-meta">
              <strong>${escapeHtml(inc.student_name || 'Student Reporter')}</strong>
              <small>${escapeHtml(inc.student_id || 'ID N/A')}</small>
            </div>
          </div>
        </td>
        <td>
          <div class="table-status-cell">
            <span class="status-badge-pill ${statusPillClass}">${statusPillIcon} ${escapeHtml(displayStatus)}</span>
            ${statusLower === 'resolved' ? '<span class="status-resolved-tag" style="display:inline-flex;align-items:center;gap:3px;margin-top:3px;font-size:11px;font-weight:600;color:#15803d;"><iconify-icon icon="solar:check-circle-bold" width="13" height="13"></iconify-icon>Resolved Emergency</span>' : ''}
            <div class="status-inline-control">
              <select class="row-status-select" id="select-status-${inc.id}">
                <option value="Active" ${statusLower === 'active' ? 'selected' : ''}>Active</option>
                <option value="On Going" ${statusLower === 'pending' || statusLower === 'ongoing' ? 'selected' : ''}>On Going</option>
                <option value="Resolved" ${statusLower === 'resolved' ? 'selected' : ''}>Resolved</option>
                <option value="Cancelled" ${statusLower === 'cancelled' || statusLower === 'canceled' ? 'selected' : ''}>Cancelled</option>
              </select>
              <button type="button" class="btn-row-update" onclick="handleInlineStatusUpdate('${inc.id}')">Update</button>
            </div>
            ${inc.resolution_summary ? `<div class="table-resolution-preview" style="margin-top:4px;font-size:11px;color:#15803d;max-width:210px;line-height:1.2;" title="${escapeHtml(inc.resolution_summary)}"><strong>Summary:</strong> ${escapeHtml(inc.resolution_summary.length > 50 ? inc.resolution_summary.slice(0, 47) + '...' : inc.resolution_summary)}</div>` : ''}
          </div>
        </td>
        <td>
          <div class="table-time-cell">
            <span class="time-created">${createdFormatted}</span>
            <span class="time-status-pill">${statusPillIcon} ${statusLower === 'resolved' ? 'Resolved' : escapeHtml(displayStatus)}: ${updatedFormatted}</span>
          </div>
        </td>
        <td>
          <div class="table-actions-cell">
            <button type="button" class="btn-table-action action-view-user" title="View Student / Reporter Details" onclick="viewIncidentStudent('${inc.id}')">
              <iconify-icon icon="solar:user-circle-bold"></iconify-icon>
            </button>
            <button type="button" class="btn-table-action action-view-map" title="View on Map" onclick="viewIncidentOnMap(${inc.latitude}, ${inc.longitude}, '${inc.incident_code}')">
              <iconify-icon icon="solar:map-point-wave-bold"></iconify-icon>
            </button>
            <button type="button" class="btn-table-action action-export-pdf" title="Download Incident Report" onclick="exportSingleIncidentPdf('${inc.id}')">
              <iconify-icon icon="solar:document-text-bold"></iconify-icon>
            </button>
            <button type="button" class="btn-table-action action-audit" title="Incident Audit History" onclick="viewIncidentAudit('${inc.id}')">
              <iconify-icon icon="solar:history-bold"></iconify-icon>
            </button>
            <button type="button" class="btn-table-action action-delete" title="${inc.is_archived ? 'Delete Incident' : 'Archive Incident'}" onclick="toggleOrDeleteIncident('${inc.id}', ${inc.is_archived})">
              <iconify-icon icon="${inc.is_archived ? 'solar:trash-bin-trash-bold' : 'solar:archive-bold'}"></iconify-icon>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function changeReportsPage(newPage) {
  reportsCurrentPage = newPage;
  renderReportsTable();
}

async function handleInlineStatusUpdate(incidentId) {
  const select = document.getElementById(`select-status-${incidentId}`);
  if (!select) return;
  const newStatus = select.value;
  try {
    let summary = '';
    if (newStatus === 'Resolved') {
      const promptSummary = window.prompt('Enter Resolution Summary for this emergency incident (optional):', 'Responder confirmed emergency resolved safely.');
      if (promptSummary === null) return;
      summary = promptSummary.trim();
    }
    showToast(`Updating incident status to ${newStatus}...`);
    const res = await fetch(`/api/reports/incidents/${incidentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, resolution_summary: summary })
    });
    if (!res.ok) throw new Error('Failed to update status');
    if (newStatus === 'Cancelled') {
      showToast('Incident status updated to Cancelled and moved to Archived.');
    } else {
      showToast(`Incident status successfully updated to ${newStatus}!`);
    }
    await loadReportsData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function toggleOrDeleteIncident(incidentId, isArchived) {
  if (isArchived) {
    const confirmDel = window.confirm('Permanently delete this archived incident from the database?');
    if (!confirmDel) return;
    try {
      showToast('Deleting incident record...');
      const res = await fetch(`/api/reports/incidents/${incidentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete incident');
      showToast('Incident permanently deleted.');
      await loadReportsData();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  } else {
    try {
      showToast('Archiving incident...');
      const res = await fetch(`/api/reports/incidents/${incidentId}/archive`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to archive incident');
      showToast('Incident moved to archive.');
      await loadReportsData();
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }
}

function viewIncidentStudent(incidentId) {
  const inc = (currentReportsData.incidents || []).find(i => i.id === incidentId);
  if (!inc) return;

  const modal = document.getElementById('incidentStudentModal');
  const body = document.getElementById('incidentStudentModalBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      <div style="width:48px;height:48px;border-radius:50%;background:#e0f2fe;color:#0284c7;display:flex;align-items:center;justify-content:center;font-size:24px;">
        <iconify-icon icon="solar:user-bold"></iconify-icon>
      </div>
      <div>
        <h4 style="margin:0;font-size:16px;color:#0f172a;">${escapeHtml(inc.student_name)}</h4>
        <small style="color:#64748b;">Student ID: ${escapeHtml(inc.student_id)}</small>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:14px;border-radius:10px;margin-bottom:14px;">
      <div><span style="color:#64748b;font-size:11px;">College:</span><br><strong>${escapeHtml(inc.student_college)}</strong></div>
      <div><span style="color:#64748b;font-size:11px;">Year Level:</span><br><strong>${escapeHtml(inc.student_yearlvl)}</strong></div>
      <div><span style="color:#64748b;font-size:11px;">Emergency Phone:</span><br><strong>${escapeHtml(inc.student_phone)}</strong></div>
      <div><span style="color:#64748b;font-size:11px;">Medical Alerts:</span><br><strong style="color:#dc2626;">${escapeHtml(inc.student_medinfo)}</strong></div>
    </div>
    <div style="margin-top:12px;">
      <span style="color:#64748b;font-size:11px;">Current Emergency Request:</span>
      <p style="margin:4px 0 0;font-weight:600;color:#0f172a;">${escapeHtml(inc.incident_detail)}</p>
      <small style="color:#64748b;">Location: ${escapeHtml(inc.location_address)} (Lat: ${inc.latitude}, Lng: ${inc.longitude})</small>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeIncidentStudentModal() {
  const modal = document.getElementById('incidentStudentModal');
  if (modal) modal.style.display = 'none';
}

function viewIncidentAudit(incidentId) {
  const inc = (currentReportsData.incidents || []).find(i => i.id === incidentId);
  if (!inc) return;

  const modal = document.getElementById('incidentAuditModal');
  const body = document.getElementById('incidentAuditModalBody');
  if (!modal || !body) return;

  const statusLower = (inc.status || '').toLowerCase().replace(/[^a-z]/g, '');
  let displayStatus = 'On Going';
  if (statusLower === 'active') displayStatus = 'Active';
  else if (statusLower === 'resolved') displayStatus = 'Resolved';
  else if (statusLower === 'cancelled' || statusLower === 'canceled') displayStatus = 'Cancelled';

  // 1. Student Information: Request Date & Time, Student Name, and Real-time address where submitted in UMak
  const createdTimeFormatted = inc.created_at && formatDateTime(inc.created_at) !== '—'
    ? formatDateTime(inc.created_at)
    : escapeHtml(inc.created_at || 'Recorded');

  // 2. Dispatcher Assigned: Assigned Responder Name and Finish / Resolved Date & Time
  const resolvedTimeStr = inc.resolved_at || (statusLower === 'resolved' ? inc.updated_at : null);
  const resolvedFormatted = resolvedTimeStr && formatDateTime(resolvedTimeStr) !== '—'
    ? formatDateTime(resolvedTimeStr)
    : (resolvedTimeStr ? escapeHtml(resolvedTimeStr) : (statusLower === 'resolved' ? 'Resolved' : 'Pending resolution'));

  // 3. Resolution / Current Status: Current Status Date & Time, and Outcome verified displayed ONLY if active, on going, or cancelled
  const currentStatusDateStr = (statusLower === 'resolved' && inc.resolved_at)
    ? inc.resolved_at
    : ((statusLower === 'cancelled' || statusLower === 'canceled') && inc.cancelled_at)
      ? inc.cancelled_at
      : (inc.updated_at || inc.created_at);
  const currentStatusTimeFormatted = currentStatusDateStr && formatDateTime(currentStatusDateStr) !== '—'
    ? formatDateTime(currentStatusDateStr)
    : escapeHtml(currentStatusDateStr || 'In Progress');

  const showOutcomeVerified = statusLower === 'active' || statusLower === 'pending' || statusLower === 'ongoing' || statusLower === 'cancelled' || statusLower === 'canceled';

  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="margin:0;font-size:15px;color:#0f172a;">Incident ID: ${escapeHtml(inc.incident_code)}</h4>
      <small style="color:#64748b;">Category: ${escapeHtml(inc.category)} | Status: ${escapeHtml(displayStatus)}</small>
    </div>
    <div style="border-left:2px solid #e2e8f0;padding-left:14px;display:flex;flex-direction:column;gap:14px;">
      <div>
        <strong style="font-size:12px;color:#059669;">1. Student Information</strong>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Request Date &amp; Time: <strong>${createdTimeFormatted}</strong></div>
        <div style="font-size:12px;margin-top:3px;color:#0f172a;line-height:1.4;">
          <strong>Student Name:</strong> ${escapeHtml(inc.student_name || 'Student Reporter')}<br>
          <strong>Address in UMak:</strong> ${escapeHtml(inc.location_address || 'UMak Campus')}
        </div>
      </div>
      <div>
        <strong style="font-size:12px;color:#2563eb;">2. Dispatcher Assigned</strong>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Assigned Responder: <strong style="color:#0f172a;">${escapeHtml(inc.responder_name || 'Security / Clinic Emergency Unit')}</strong></div>
        <div style="font-size:12px;margin-top:3px;color:#0f172a;">Date &amp; Time Resolved: <strong>${resolvedFormatted}</strong></div>
      </div>
      <div>
        <strong style="font-size:12px;color:#475569;">3. Resolution / Current Status</strong>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Current Status Date &amp; Time: <strong>${currentStatusTimeFormatted}</strong></div>
        ${showOutcomeVerified ? `<div style="font-size:12px;margin-top:2px;">Outcome verified: <strong>${escapeHtml(displayStatus)}</strong></div>` : ''}
        ${inc.resolution_summary ? `<div style="font-size:12px;margin-top:8px;"><strong>Resolution Summary</strong><p style="margin:3px 0 0;white-space:pre-wrap;">${escapeHtml(inc.resolution_summary)}</p></div>` : ''}
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeIncidentAuditModal() {
  const modal = document.getElementById('incidentAuditModal');
  if (modal) modal.style.display = 'none';
}

function viewIncidentOnMap(lat, lng, code) {
  if (isTrainerRole()) {
    if (typeof showToast === 'function') {
      showToast('Access restricted: Live Map is not available for Trainer accounts.', 'warning');
    }
    return;
  }
  switchView('map');
  window.location.hash = '#map';
  showToast(`Locating Incident ${code} on live map...`);
  setTimeout(() => {
    if (window.liveIncidentMap) {
      window.liveIncidentMap.setView([lat, lng], 17);
      if (typeof L !== 'undefined') {
        L.popup()
          .setLatLng([lat, lng])
          .setContent(`<strong>${code}</strong><br>Lat: ${lat}<br>Lng: ${lng}`)
          .openOn(window.liveIncidentMap);
      }
    }
  }, 400);
}

function exportSingleIncidentPdf(incidentId) {
  const inc = (currentReportsData.incidents || []).find(i => i.id === incidentId);
  if (!inc) return;

  showToast('Generating PDF...');

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 40px; color: #1e293b;">
      <div style="border-bottom: 2px solid #0d3b4f; padding-bottom: 12px; margin-bottom: 24px;">
        <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #0d3b4f; font-weight: bold;">Heron's Emergency Alert System</div>
        <div style="font-size: 24px; font-weight: bold; margin-top: 6px;">Official Incident Report: ${inc.incident_code}</div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Incident Code</span>
          <strong style="font-size: 15px; color: #0f172a;">${inc.incident_code}</strong>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Status</span>
          <strong style="font-size: 15px; color: #0f172a;">${(inc.status || '').toLowerCase().replace(/[^a-z]/g, '') === 'pending' || (inc.status || '').toLowerCase().replace(/[^a-z]/g, '') === 'ongoing' ? 'On Going' : inc.status}</strong>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Assistance Category</span>
          <strong style="font-size: 15px; color: #0f172a;">${inc.category}</strong>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Reported Time</span>
          <strong style="font-size: 15px; color: #0f172a;">${inc.created_at}</strong>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Student / Reporter</span>
          <strong style="font-size: 15px; color: #0f172a;">${inc.student_name} (${inc.student_id})</strong>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Location</span>
          <strong style="font-size: 15px; color: #0f172a;">${inc.location_address}</strong>
        </div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
        <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Incident Description</span>
        <strong style="font-size: 14px; line-height: 1.5;">${inc.incident_detail}</strong>
      </div>
      ${inc.resolution_summary ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 24px;"><span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Resolution Summary</span><strong style="font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(inc.resolution_summary)}</strong></div>` : ''}
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
        <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; display: block; margin-bottom: 4px;">Assigned Response Personnel</span>
        <strong style="font-size: 15px; color: #0f172a;">${inc.responder_name || 'Campus Emergency Unit'} (${inc.responder_phone || 'Radio Channel'})</strong>
      </div>
      <div style="margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        Generated on ${new Date().toLocaleString()} by Heron's Emergency Alert System Administrator Console.
      </div>
    </div>
  `;

  const opt = {
    margin: 0.5,
    filename: `Incident_Report_${inc.incident_code}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(content).save().then(() => {
    showToast('PDF downloaded successfully.', 'success');
  });
}

// ==========================================
// Export Incidents Sidebar Drawer (matching image.png)
// ==========================================
let currentExportFormat = 'pdf';
let currentExportReportType = 'just';

function openExportDrawer() {
  const overlay = document.getElementById('exportIncidentsOverlay');
  const drawer = document.getElementById('exportIncidentsDrawer');
  if (!drawer) return;

  // Sync drawer controls with current main table filters
  const mainStatus = document.getElementById('reportStatusFilter');
  const mainCategory = document.getElementById('reportCategoryFilter');
  const mainSearch = document.getElementById('reportSearchInput');
  const mainSort = document.getElementById('reportSortOrder');
  const mainStartDate = document.getElementById('reportStartDate');
  const mainEndDate = document.getElementById('reportEndDate');

  const drawerStatus = document.getElementById('drawerStatusSelect');
  const drawerCategory = document.getElementById('drawerCategorySelect');
  const drawerSearch = document.getElementById('drawerSearchInput');
  const drawerSort = document.getElementById('drawerSortSelect');
  const drawerStartDate = document.getElementById('drawerStartDate');
  const drawerEndDate = document.getElementById('drawerEndDate');

  if (drawerStatus && mainStatus) drawerStatus.value = mainStatus.value;
  if (drawerCategory && mainCategory) drawerCategory.value = mainCategory.value;
  if (drawerSearch && mainSearch) drawerSearch.value = mainSearch.value;
  if (drawerSort && mainSort) drawerSort.value = mainSort.value;
  if (drawerStartDate && mainStartDate) drawerStartDate.value = mainStartDate.value;
  if (drawerEndDate && mainEndDate) drawerEndDate.value = mainEndDate.value;
  if (drawerStatus) drawerStatus.dataset.preResolvedValue = drawerStatus.value || 'all';

  selectExportFormat(currentExportFormat || 'pdf');
  selectReportType(currentExportReportType || 'just');

  if (overlay) overlay.classList.add('active');
  drawer.classList.add('active');

  // ESC key listener to dismiss drawer
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeExportDrawer();
      window.removeEventListener('keydown', handleEsc);
    }
  };
  window.addEventListener('keydown', handleEsc);
}

function closeExportDrawer() {
  const overlay = document.getElementById('exportIncidentsOverlay');
  const drawer = document.getElementById('exportIncidentsDrawer');
  if (overlay) overlay.classList.remove('active');
  if (drawer) drawer.classList.remove('active');
}

function selectExportFormat(format) {
  currentExportFormat = format;
  const pills = document.querySelectorAll('#exportIncidentsDrawer .format-pill');
  pills.forEach(pill => {
    const isSelected = pill.getAttribute('data-format') === format;
    pill.classList.toggle('active', isSelected);
    pill.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  const resolvedCard = document.getElementById('reportTypeCardResolved');
  if (resolvedCard) {
    resolvedCard.classList.remove('disabled');
    resolvedCard.removeAttribute('title');
  }
}

function selectReportType(type) {
  currentExportReportType = type;
  const cards = document.querySelectorAll('#exportIncidentsDrawer .report-type-card');
  cards.forEach(card => {
    const isSelected = card.getAttribute('data-type') === type;
    card.classList.toggle('active', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  const statusSelect = document.getElementById('drawerStatusSelect');
  const statusGroup = document.getElementById('drawerStatusFilterGroup');
  if (statusSelect) {
    if (type === 'resolved') {
      if (!statusSelect.disabled) statusSelect.dataset.preResolvedValue = statusSelect.value || 'all';
      statusSelect.value = 'Resolved';
      statusSelect.disabled = true;
    } else {
      statusSelect.disabled = false;
      statusSelect.value = statusSelect.dataset.preResolvedValue || 'all';
    }
  }
  if (statusGroup) {
    statusGroup.classList.toggle('is-disabled', type === 'resolved');
    statusGroup.setAttribute('aria-disabled', String(type === 'resolved'));
  }
}

async function handleDrawerExport() {
  const drawerStatus = document.getElementById('drawerStatusSelect');
  const drawerCategory = document.getElementById('drawerCategorySelect');
  const drawerSearch = document.getElementById('drawerSearchInput');
  const drawerSort = document.getElementById('drawerSortSelect');
  const drawerStartDate = document.getElementById('drawerStartDate');
  const drawerEndDate = document.getElementById('drawerEndDate');

  const status = currentExportReportType === 'resolved' ? 'Resolved' : (drawerStatus ? drawerStatus.value : 'all');
  const category = drawerCategory ? drawerCategory.value : 'all';
  const search = drawerSearch ? drawerSearch.value.trim() : '';
  const sort = drawerSort ? drawerSort.value : 'desc';
  const startDate = drawerStartDate ? drawerStartDate.value : '';
  const endDate = drawerEndDate ? drawerEndDate.value : '';

  if (currentExportFormat === 'excel') {
    const params = new URLSearchParams();
    params.set('format', currentExportFormat);
    if (currentExportReportType === 'resolved') params.set('reportType', 'resolved');
    if (status !== 'all') params.set('status', status);
    if (category !== 'all') params.set('category', category);
    if (search) params.set('search', search);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (sort) params.set('sort', sort);

    const isResolved = currentExportReportType === 'resolved';
    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/reports/export?${params.toString()}`;
    downloadLink.download = isResolved ? 'heas-resolved-incidents-report.csv' : 'heas-incidents-report.csv';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    closeExportDrawer();
    showToast('Downloading Excel-compatible CSV report...');
    return;
  }

  if (currentExportFormat === 'pdf') {
    closeExportDrawer();
    await downloadIncidentReportPdf({
      reportType: currentExportReportType,
      status, category, search, sort, startDate, endDate
    });
    return;
  }

  // Print format is rendered in a browser tab for the native print dialog.
  closeExportDrawer();
  await generateAndExportReport({
    format: currentExportFormat,
    reportType: currentExportReportType,
    status, category, search, sort, startDate, endDate
  });
}

async function downloadIncidentReportPdf(options) {
  try {
    const params = new URLSearchParams({ format: 'pdf' });
    const isResolvedReport = options.reportType === 'resolved';
    const status = isResolvedReport ? 'Resolved' : options.status;
    if (isResolvedReport) params.set('reportType', 'resolved');
    if (status && status !== 'all') params.set('status', status);
    if (options.category && options.category !== 'all') params.set('category', options.category);
    if (options.search) params.set('search', options.search);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    if (options.sort) params.set('sort', options.sort);

    showToast(`Generating ${isResolvedReport ? 'Resolved' : 'Incident'} PDF report...`);
    const response = await fetch(`/api/reports/export?${params.toString()}`);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/pdf')) {
      let message = 'Failed to generate the PDF report.';
      try {
        const result = await response.json();
        if (result.error) message = result.error;
      } catch (_) { /* Keep the default message for non-JSON server errors. */ }
      showToast(message, response.status === 404 ? 'warning' : 'error');
      return;
    }

    const pdfBlob = await response.blob();
    if (!pdfBlob.size) {
      showToast('The PDF export was empty. Please try again.', 'error');
      return;
    }

    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = isResolvedReport ? 'heas-resolved-incidents-report.pdf' : 'heas-incidents-report.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showToast('PDF downloaded successfully.', 'success');
  } catch (error) {
    console.error('Error downloading incident PDF:', error);
    showToast(`Failed to generate PDF report: ${error.message}`, 'error');
  }
}

async function generateAndExportReport(options) {
  try {
    const isResolvedReport = options.reportType === 'resolved';
    showToast(`Generating ${isResolvedReport ? 'Resolved' : 'Incident'} ${options.format.toUpperCase()} report...`);

    const params = new URLSearchParams();
    const status = isResolvedReport ? 'Resolved' : options.status;
    if (status !== 'all') params.set('status', status);
    if (options.category !== 'all') params.set('category', options.category);
    if (options.search) params.set('search', options.search);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    if (options.sort) params.set('sort', options.sort);

    const res = await fetch(`/api/reports/incidents?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to retrieve incident telemetry for export');
    const data = await res.json();
    let incidents = data.incidents || [];

    if (isResolvedReport) {
      incidents = incidents.filter(i => (i.status || '').toLowerCase() === 'resolved');
    }

    if (incidents.length === 0) {
      showToast('No incident records match the selected filters. Nothing was exported.', 'warning');
      return;
    }

    const reportTitle = isResolvedReport
      ? 'Resolved Incidents & Resolution Summary Report'
      : 'Comprehensive Campus Emergency Incident Report';
    const timestamp = new Date().toLocaleString();
    const filterInfo = [
      `Status: ${isResolvedReport ? 'Resolved Only' : (options.status === 'all' ? 'All Statuses' : options.status)}`,
      `Category: ${options.category === 'all' ? 'All Categories' : options.category}`,
      options.startDate ? `From: ${options.startDate}` : '',
      options.endDate ? `To: ${options.endDate}` : '',
      options.search ? `Query: "${options.search}"` : ''
    ].filter(Boolean).join(' | ');

    let tableHeaders = '';
    let tableRows = '';

    if (isResolvedReport) {
      tableHeaders = `
        <tr>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Incident ID</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Category</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Student</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Location</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Duration</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Assigned Unit</th>
        </tr>
      `;
      tableRows = incidents.map(inc => {
        let durationStr = 'N/A';
        if (inc.created_at && inc.resolved_at) {
          const diffMs = new Date(inc.resolved_at) - new Date(inc.created_at);
          if (diffMs > 0) {
            const mins = Math.round(diffMs / 60000);
            durationStr = mins < 60 ? `${mins} mins` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
          } else {
            durationStr = 'Under 1 min';
          }
        }
        return `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${inc.incident_code}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.category}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.student_name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.location_address}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${durationStr}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.responder_name || 'Campus Unit'}</td>
          </tr>
        `;
      }).join('');
    } else {
      tableHeaders = `
        <tr>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Incident ID</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Category</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Student</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Location</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Status</th>
          <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Reported Time</th>
        </tr>
      `;
      tableRows = incidents.map(inc => {
        const rawSt = (inc.status || '').toLowerCase().replace(/[^a-z]/g, '');
        const dispStatus = (rawSt === 'pending' || rawSt === 'ongoing' || rawSt === 'responder') ? 'On Going' : (inc.status || 'Active');
        return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${inc.incident_code}</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.category}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.student_name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.location_address}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${dispStatus}</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${inc.created_at ? new Date(inc.created_at).toLocaleString() : 'N/A'}</td>
        </tr>
      `;
      }).join('');
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 20px;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between;">
          <div>
            <h1 style="margin: 0; font-size: 20px; text-transform: uppercase;">Heron's Emergency Alert System</h1>
            <p style="margin: 4px 0 0; font-size: 13px; color: #475569;">University of Makati • Campus Safety</p>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748b;">
            <div><strong>Generated:</strong> ${timestamp}</div>
          </div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
          <h2 style="margin: 0 0 4px 0; font-size: 16px;">${reportTitle}</h2>
          <div style="font-size: 12px; color: #475569;">${filterInfo}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
          <thead>${tableHeaders}</thead>
          <tbody>${tableRows.length > 0 ? tableRows : '<tr><td colspan="6" style="text-align:center;padding:24px;">No matching incident records found.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    if (options.format === 'pdf') {
      const element = document.createElement('div');
      element.innerHTML = htmlContent;
      const opt = {
        margin: 0.5,
        filename: isResolvedReport ? 'heas-resolved-incidents.pdf' : 'heas-incidents-report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
      };
      html2pdf().set(opt).from(element).save().then(() => showToast('PDF downloaded successfully.', 'success'));
    } else if (options.format === 'print') {
      const reportWindow = window.open('', '_blank');
      if (!reportWindow) {
        showToast('Pop-up blocked. Please allow pop-ups to print.', 'error');
        return;
      }
      reportWindow.document.write('<html><head><title>Print Report</title></head><body>' + htmlContent + '<script>window.onload=function(){window.print();}</script></body></html>');
      reportWindow.document.close();
    }
  } catch (err) {
    console.error('Error generating report:', err);
    showToast('Failed to generate export report: ' + err.message, 'error');
  }
}

function downloadAllIncidentsPdf() {
  openExportDrawer();
}

// Window global assignments
window.initReportsModule = initReportsModule;
window.loadReportsData = loadReportsData;
window.changeReportsPage = changeReportsPage;
window.handleInlineStatusUpdate = handleInlineStatusUpdate;
window.toggleOrDeleteIncident = toggleOrDeleteIncident;
window.viewIncidentStudent = viewIncidentStudent;
window.closeIncidentStudentModal = closeIncidentStudentModal;
window.viewIncidentAudit = viewIncidentAudit;
window.closeIncidentAuditModal = closeIncidentAuditModal;
window.viewIncidentOnMap = viewIncidentOnMap;
window.exportSingleIncidentPdf = exportSingleIncidentPdf;
window.downloadAllIncidentsPdf = downloadAllIncidentsPdf;
window.openExportDrawer = openExportDrawer;
window.closeExportDrawer = closeExportDrawer;
window.selectExportFormat = selectExportFormat;
window.selectReportType = selectReportType;
window.handleDrawerExport = handleDrawerExport;
window.generateAndExportReport = generateAndExportReport;
window.updateStudentStatus = updateStudentStatus;
window.evaluateStudentStatus = evaluateStudentStatus;
// ==========================================
// Export Teams Drawer Logic
// ==========================================
let currentTeamsExportFormat = 'pdf';

function openTeamsExportDrawer() {
  const overlay = document.getElementById('exportTeamsOverlay');
  const drawer = document.getElementById('exportTeamsDrawer');
  if (!drawer) return;

  const mainSearch = document.getElementById('teamSearchInput');
  const drawerSearch = document.getElementById('teamsDrawerSearchInput');
  const drawerRole = document.getElementById('teamsDrawerRoleSelect');
  const drawerStatus = document.getElementById('teamsDrawerStatusSelect');

  if (drawerSearch && mainSearch) drawerSearch.value = mainSearch.value;
  if (drawerRole) {
    if (['HEAD', 'System Admin', 'Responder', 'Trainer'].includes(activeTeamsAccountFilter)) {
      drawerRole.value = activeTeamsAccountFilter;
    } else {
      drawerRole.value = 'all';
    }
  }
  if (drawerStatus) {
    if (['Active', 'Disapproved', 'Suspended'].includes(activeTeamsAccountFilter)) {
      drawerStatus.value = activeTeamsAccountFilter;
    } else {
      drawerStatus.value = 'all';
    }
  }

  selectTeamsExportFormat(currentTeamsExportFormat || 'pdf');

  if (overlay) overlay.classList.add('active');
  drawer.classList.add('active');

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeTeamsExportDrawer();
      window.removeEventListener('keydown', handleEsc);
    }
  };
  window.addEventListener('keydown', handleEsc);
}

function closeTeamsExportDrawer() {
  const overlay = document.getElementById('exportTeamsOverlay');
  const drawer = document.getElementById('exportTeamsDrawer');
  if (overlay) overlay.classList.remove('active');
  if (drawer) drawer.classList.remove('active');
}

function selectTeamsExportFormat(format) {
  currentTeamsExportFormat = format;
  const drawer = document.getElementById('exportTeamsDrawer');
  if (!drawer) return;
  const pills = drawer.querySelectorAll('.format-pill');
  pills.forEach(pill => {
    const isSelected = pill.getAttribute('data-format') === format;
    pill.classList.toggle('active', isSelected);
    pill.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

async function handleTeamsDrawerExport() {
  const drawerRole = document.getElementById('teamsDrawerRoleSelect');
  const drawerStatus = document.getElementById('teamsDrawerStatusSelect');
  const drawerSearch = document.getElementById('teamsDrawerSearchInput');

  const role = drawerRole ? drawerRole.value : 'all';
  const status = drawerStatus ? drawerStatus.value : 'all';
  const search = drawerSearch ? drawerSearch.value.trim() : '';

  if (currentTeamsExportFormat === 'excel') {
    const params = new URLSearchParams();
    params.set('format', currentTeamsExportFormat);
    if (role && role !== 'all') params.set('role', role);
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);

    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/teams/export?${params.toString()}`;
    downloadLink.download = 'heas-teams-report.csv';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    closeTeamsExportDrawer();
    showToast(`Downloading Excel-compatible CSV report...`);
    return;
  }

  // PDF or Print handled client-side directly
  closeTeamsExportDrawer();
  showToast(`Generating Teams ${currentTeamsExportFormat.toUpperCase()} report...`);

  try {
    const res = await fetch(`/api/admin/accounts`);
    if (!res.ok) throw new Error('Failed to fetch teams data');
    const data = await res.json();

    let users = Array.isArray(data.users) ? data.users : [];

    if (role !== 'all') users = users.filter(u => u.employee_role === role);
    if (status !== 'all') users = users.filter(u => u.employee_status === status);
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u => (u.employee_name || '').toLowerCase().includes(q) || (u.employee_email || '').toLowerCase().includes(q) || (u.employee_role || '').toLowerCase().includes(q));
    }

    const timestamp = new Date().toLocaleString();
    let tableRows = users.map(u => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${u.employee_id || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${u.employee_name || 'Unnamed'}</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${u.employee_email}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${u.employee_role}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${u.employee_status}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 20px;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between;">
          <div>
            <h1 style="margin: 0; font-size: 20px; text-transform: uppercase;">Heron's Emergency Alert System</h1>
            <p style="margin: 4px 0 0; font-size: 13px; color: #475569;">University of Makati • Teams & Admin Directory</p>
          </div>
          <div style="text-align: right; font-size: 12px; color: #64748b;">
            <div><strong>Generated:</strong> ${timestamp}</div>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr>
              <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">ID</th>
              <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Name</th>
              <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Email</th>
              <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Role</th>
              <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; text-align: left;">Status</th>
            </tr>
          </thead>
          <tbody>${tableRows.length > 0 ? tableRows : '<tr><td colspan="5" style="text-align:center;padding:24px;">No matching accounts found.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    if (currentTeamsExportFormat === 'pdf') {
      const element = document.createElement('div');
      element.innerHTML = htmlContent;
      const opt = {
        margin: 0.5,
        filename: 'heas-teams-report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(element).save().then(() => showToast('Teams PDF downloaded successfully.', 'success'));
    } else if (currentTeamsExportFormat === 'print') {
      const reportWindow = window.open('', '_blank');
      if (!reportWindow) {
        showToast('Pop-up blocked. Please allow pop-ups to print.', 'error');
        return;
      }
      reportWindow.document.write('<html><head><title>Teams Report</title></head><body>' + htmlContent + '<script>window.onload=function(){window.print();}</script></body></html>');
      reportWindow.document.close();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to generate Teams export', 'error');
  }
}

function exportTeamsPdf() {
  selectTeamsExportFormat('pdf');
  handleTeamsDrawerExport();
}

function exportTeamsExcel() {
  selectTeamsExportFormat('excel');
  handleTeamsDrawerExport();
}


function updateDynamicMapMarkers(incidents) {
  const list = incidents || currentEmergencyIncidents || [];

  // 1. Role Filter: Sandboxes Responders, but lets HEAD/Admin see everything
  let mapIncidents = list;
  if (isResponderRole()) {
    mapIncidents = mapIncidents.filter(i => isIncidentAssignedToCurrentResponder(i));
  }

  // 2. Safely Clear the Overview Map (if it is currently loaded on screen)
  if (typeof incidentMap !== 'undefined' && incidentMap !== null) {
    if (!window.overviewMapMarkers) window.overviewMapMarkers = [];
    window.overviewMapMarkers.forEach(m => incidentMap.removeLayer(m.marker));
    window.overviewMapMarkers = [];
  }

  // 3. Safely Clear the Live Incident Map (if it is currently loaded on screen)
  if (typeof liveIncidentMap !== 'undefined' && liveIncidentMap !== null) {
    if (!window.liveMapMarkers) window.liveMapMarkers = [];
    window.liveMapMarkers.forEach(m => liveIncidentMap.removeLayer(m.marker));
    window.liveMapMarkers = [];
  }

  // 4. Plot the New Markers
  mapIncidents.forEach(incident => {
    if (!incident.latitude || !incident.longitude) return;

    const catLower = (incident.assistance_type || incident.category || '').toLowerCase();
    const statLower = (incident.status || '').toLowerCase().replace(/[^a-z]/g, '');

    // Hide resolved/cancelled incidents from the active maps
    if (statLower === 'cancelled' || statLower === 'canceled' || statLower === 'resolved') return;

    // Set Icon Based on Category
    let iconLabel = '🚨';
    if (catLower.includes('sec')) iconLabel = '🛡️';
    else if (catLower.includes('vicin') || catLower.includes('campus')) iconLabel = '📍';
    else if (catLower.includes('urg')) iconLabel = '⚠️';
    else iconLabel = '❤️';

    // Set Color Based on Status
    let color = '#ed3942'; // Default Red (Active)
    if (statLower === 'ongoing' || statLower === 'pending') {
      color = '#eab308'; // Yellow for On Going
    } else if (statLower === 'resolved') {
      color = '#25eb35';
    }

    const popupContent = `
      <div class="incident-popup-card">
        <div class="popup-header">
          <div class="status-tag" style="background:${color}20;border-left:3px solid ${color}">
            <span class="pulse-dot" style="background:${color}"></span> ${incident.status || 'Active'}
          </div>
          <span class="incident-id">${incident.display_id || incident.id.slice(0, 8)}</span>
        </div>
        <div class="popup-content">
          <div class="content-header" style="margin-bottom: 8px;">
            <strong>${incident.incident || incident.assistance_type || 'Emergency'}</strong>
          </div>
          <div class="details-table">
            <div class="detail-row" style="font-size: 11px; margin-bottom: 4px;"><span class="label">Loc:</span> <span class="value">${incident.location_address || 'UMak Campus'}</span></div>
            <div class="detail-row" style="font-size: 11px; margin-bottom: 8px;"><span class="label">Team:</span> <span class="value" style="color:#159653;font-weight:bold;">${incident.responder_name || 'Unassigned'}</span></div>
          </div>
          <div class="popup-action">
            <button type="button" onclick="openIncidentDetails('${incident.id}')" style="width: 100%; background: #0f172a; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 12px;">View Details &rarr;</button>
          </div>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'incident-pin',
      html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"><span style="font-size: 14px;">${iconLabel}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -25]
    });

    if (typeof incidentMap !== 'undefined' && incidentMap !== null) {
      const oMarker = L.marker([incident.latitude, incident.longitude], { icon: customIcon })
        .addTo(incidentMap)
        .bindPopup(popupContent, { maxWidth: 250 });
      window.overviewMapMarkers.push({ marker: oMarker, data: incident });
    }

    if (typeof liveIncidentMap !== 'undefined' && liveIncidentMap !== null) {
      const lMarker = L.marker([incident.latitude, incident.longitude], { icon: customIcon })
        .addTo(liveIncidentMap)
        .bindPopup(popupContent, { maxWidth: 250 });
      window.liveMapMarkers.push({ marker: lMarker, data: incident });
    }
  });
}

// LIVE GPS TRACKING FOR RESPONDERS
let responderWatchId = null;

function startResponderLocationTracking(incidentId) {
  if (!navigator.geolocation) {
    showToast('Location tracking is not supported by this browser.', 'error');
    return;
  }

  showToast('Live GPS tracking started. Your location is being shared with the student and Command Center.', 'info');

  // watchPosition automatically fires every time the device's GPS detects movement
  responderWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      try {
        const sessionId = typeof getSessionId === 'function' ? getSessionId() : '';
        const role = getCurrentUserRole();

        // Send the coordinates to your backend API to update Supabase
        await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/location`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId || '',
            'x-employee-role': role || ''
          },
          body: JSON.stringify({
            responder_lat: lat,
            responder_lng: lng
          })
        });

        console.log(`Location updated: ${lat}, ${lng}`);
      } catch (error) {
        console.error('Failed to sync live location:', error);
      }
    },
    (error) => {
      console.error("GPS Tracking error:", error.message);
      if (error.code === 1) {
        showToast('Please enable Location Services in your browser to share your live GPS.', 'warning');
      }
    },
    {
      enableHighAccuracy: true, // Forces GPS hardware for higher precision
      maximumAge: 0,            // Do not use cached positions
      timeout: 10000            // 10 second timeout
    }
  );
}

function stopResponderLocationTracking() {
  if (responderWatchId !== null) {
    navigator.geolocation.clearWatch(responderWatchId);
    responderWatchId = null;
    console.log('Live GPS tracking stopped.');
  }
}


// Global 404 Image Error Interceptor (Stops local missing asset spam permanently)
document.addEventListener('error', function(event) {
  const target = event.target;
  if (target && target.tagName === 'IMG') {
    // If any image on the page fails to load (like a missing local PNG), swap it to a clean vector icon
    if (!target.src.includes('iconify.design') && !target.src.startsWith('data:')) {
      target.src = 'https://api.iconify.design/solar:user-circle-bold-duotone.svg?color=%2364748b';
    }
  }
}, true);



// ====================================================================
// TRAINING CENTER MODULE LOGIC
// ====================================================================
let allTrainingCourses = [];
let activeTrainingCourse = null;
let allTrainersList = [];
let trainingCoursesLoadInProgress = false;

async function loadTrainingCenterData() {
  initTrainingCenterModals();
  await Promise.all([loadTrainingCourses(), loadTrainersForSelect()]);
}

async function loadTrainersForSelect() {
  try {
    const res = await fetch('/api/trainers');
    if (res.ok) {
      const data = await res.json();
      allTrainersList = (data.trainers || []).filter(t => {
        const role = String(t.employee_role || '').trim().toLowerCase();
        return role === 'trainer' && !role.includes('responder');
      });
    } else {
      allTrainersList = [];
    }
  } catch (err) {
    console.warn('Could not load trainers list:', err.message);
    allTrainersList = [];
  }
}

function renderActiveCourseHeader(course) {
  if (!course) return;
  const titleEl = document.getElementById('tcActiveTitle');
  const priceEl = document.getElementById('tcActivePrice');
  const descEl = document.getElementById('tcActiveDesc');
  if (titleEl) titleEl.textContent = course.name;
  if (priceEl) {
    const availArr = Array.isArray(course.available_months) && course.available_months.length > 0
      ? course.available_months.map(m => computeMonthSchedule(m).monthName).join(', ')
      : null;
    let schedText = availArr ? `${availArr} (1 Month Each: 1st Week to Last Week)` : (course.batch_schedule || 'Monthly (1 Month Each: 1st Week to Last Week)');
    schedText = formatBatchScheduleText(schedText);
    let timeText = course.training_time || '07:00 A.M - 11:00 A.M';
    if (Array.isArray(course.available_times) && course.available_times.length > 1) {
      timeText = 'AM & PM Classes (07:00 AM - 11:00 AM / 01:00 PM - 5:00 PM)';
    }
    priceEl.innerHTML = `
      <span style="color:#047857; font-weight:700;">Student Price: ₱${Number(course.student_price || 0).toLocaleString()}</span>
      <span style="color:#cbd5e1; margin:0 8px;">|</span>
      <span style="color:#b45309; font-weight:600;"><iconify-icon icon="solar:clock-circle-bold-duotone" style="vertical-align:-2px; color:#d97706;"></iconify-icon> Time: ${escapeHtml(timeText)}</span>
      <span style="color:#cbd5e1; margin:0 8px;">|</span>
      <span style="color:#0f172a; font-weight:600;"><iconify-icon icon="solar:calendar-bold-duotone" style="vertical-align:-2px; color:#0284c7;"></iconify-icon> Batch Schedule: ${escapeHtml(schedText)}</span>
    `;
  }
  if (descEl) descEl.textContent = course.description || 'No description provided.';

  const durEl = document.getElementById('tcActiveDuration');
  if (durEl) durEl.textContent = `Duration: ${course.duration || '1 Month'}`;

  const sessEl = document.getElementById('tcActiveSessions');
  if (sessEl) {
    if (Array.isArray(course.available_days) && course.available_days.length > 0) {
      sessEl.textContent = `Sessions: Available on ${course.available_days.join(', ')} (4 sessions/month per day)`;
    } else {
      sessEl.textContent = `Sessions: ${course.session_schedule || '1 per week on Saturday in 1 month (4 Sessions)'}`;
    }
  }

  const reqEl = document.getElementById('tcActiveRequirements');
  if (reqEl) reqEl.textContent = `Requirements: ${course.requirements || 'Valid UMak ID'}`;

  const certEl = document.getElementById('tcActiveCertificate');
  if (certEl) certEl.textContent = `Certificate: ${course.certification || 'Certificate of Completion'}`;

  const trainerEl = document.getElementById('tcActiveTrainer');
  if (trainerEl) {
    const trainerName = course.assigned_trainer ? String(course.assigned_trainer).trim() : '';
    trainerEl.textContent = `Assigned Trainer: ${trainerName || 'Unassigned'}`;
  }

  const learningsEl = document.getElementById('tcActiveLearnings');
  if (learningsEl) {
    let items = [];
    if (Array.isArray(course.learnings)) {
      items = course.learnings;
    } else if (typeof course.learnings === 'string' && course.learnings.trim()) {
      items = course.learnings.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
    }
    if (items.length === 0) {
      items = ['Core Safety Principles', 'Practical Hands-on Drills'];
    }
    learningsEl.innerHTML = items.map(item => `
      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; color: #334155; font-weight: 500;">
        <iconify-icon icon="solar:check-circle-bold" style="color: #10b981; font-size: 12px;"></iconify-icon>
        ${escapeHtml(item)}
      </span>
    `).join('');
  }
}

async function loadTrainingCourses(silent = false) {
  const container = document.getElementById('tcCourseList');
  if (!container || trainingCoursesLoadInProgress) return;
  trainingCoursesLoadInProgress = true;

  try {
    const res = await fetch('/api/training/courses');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch courses');

    allTrainingCourses = data.courses || [];

    if (allTrainingCourses.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 24px; color:#64748b; font-size:12px;">No courses created yet. Click "+ New Course" above.</div>';
      showTrainingEmptyState();
      return;
    }

    container.innerHTML = allTrainingCourses.map(c => `
      <div class="tc-course-item" data-id="${escapeHtml(c.id)}" onclick="selectTrainingCourse('${escapeHtml(c.id)}')" 
           style="padding: 12px; border-radius: 8px; margin-bottom: 8px; border: 1px solid ${activeTrainingCourse?.id === c.id ? '#0f172a' : '#e2e8f0'}; cursor: pointer; transition: all 0.15s ease; background: ${activeTrainingCourse?.id === c.id ? '#f1f5f9' : '#ffffff'};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <strong style="font-size: 13px; color: #0f172a;">${escapeHtml(c.name)}</strong>
          <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e0f2fe; color: #0284c7; flex-shrink: 0;">${escapeHtml(c.category)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; color: #475569;">
          <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 68%;">
            <iconify-icon icon="solar:calendar-bold-duotone" style="font-size: 13px; color: #0284c7; flex-shrink: 0;"></iconify-icon>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(formatBatchScheduleText(c.batch_schedule))}"><strong>Date:</strong> ${escapeHtml(formatBatchScheduleText(c.batch_schedule))}</span>
          </div>
          <strong style="color: #059669; font-size: 12px; flex-shrink: 0;">₱${Number(c.student_price || 0).toLocaleString()}</strong>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #475569;">
          <iconify-icon icon="solar:clock-circle-bold-duotone" style="font-size: 13px; color: #d97706; flex-shrink: 0;"></iconify-icon>
          <span><strong>Time:</strong> ${escapeHtml(c.training_time || '07:00 A.M - 11:00 A.M')}</span>
        </div>
      </div>
    `).join('');

    // If an active course is selected, keep it and update its view in real-time
    if (activeTrainingCourse) {
      const stillExists = allTrainingCourses.find(c => c.id === activeTrainingCourse.id);
      if (stillExists) {
        activeTrainingCourse = stillExists;
        renderActiveCourseHeader(stillExists);
      } else {
        selectTrainingCourse(allTrainingCourses[0].id);
      }
    } else {
      selectTrainingCourse(allTrainingCourses[0].id);
    }
  } catch (err) {
    if (!silent) {
      container.innerHTML = `<div style="text-align:center; padding: 20px; color:#dc2626; font-size:12px;">Error: ${escapeHtml(err.message)}</div>`;
    }
  } finally {
    trainingCoursesLoadInProgress = false;
  }
}

let currentLoadedBookings = [];
let currentLoadedBatches = [];
let currentActiveTrainingBatchId = null;

function isMonthInPast(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 to 12
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m)) return false;
  if (y < currentYear) return true;
  if (y === currentYear && m < currentMonth) return true;
  return false;
}

function isBatchScheduleFinished(b) {
  if (!b) return false;
  const status = String(b.training_status || '').trim().toLowerCase();
  if (status === 'completed' || status === 'done') return true;

  if (!b.requested_date) return false;
  const parts = String(b.requested_date).split('-');
  const bYr = parseInt(parts[0], 10);
  const bMo = parseInt(parts[1], 10);
  if (isNaN(bYr) || isNaN(bMo)) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 to 12
  const currentDay = now.getDate();

  if (b.end_date) {
    const endAt = new Date(`${String(b.end_date).slice(0, 10)}T23:59:59`);
    return !Number.isNaN(endAt.getTime()) && now > endAt;
  }

  if (bYr < currentYear) return true;
  if (bYr === currentYear && bMo < currentMonth) return true;
  if (bYr > currentYear || (bYr === currentYear && bMo > currentMonth)) return false;

  // It is the current month: batch schedules in UMak HEAS run for the 1-month duration (1st Week to Last Week).
  // The schedule in the end of week is finished if today has exceeded the last day of this month
  const lastDayOfMonth = new Date(bYr, bMo, 0).getDate();
  if (currentDay > lastDayOfMonth) return true;

  return false;
}

function computeMonthSchedule(yearMonthStr) {
  let yr, mo;
  if (yearMonthStr && /^\d{4}-\d{2}$/.test(yearMonthStr)) {
    const parts = yearMonthStr.split('-');
    yr = parseInt(parts[0], 10);
    mo = parseInt(parts[1], 10);
  } else {
    const now = new Date();
    yr = now.getFullYear();
    mo = now.getMonth() + 1;
  }
  const startDate = new Date(yr, mo - 1, 1);
  const endDate = new Date(yr, mo, 0); // last day of month

  const monthName = startDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    monthValue: `${yr}-${String(mo).padStart(2, '0')}`,
    year: yr,
    month: mo,
    monthName,
    startStr,
    endStr,
    startText: `First Week of ${startDate.toLocaleString('en-US', { month: 'short' })} (${startStr})`,
    endText: `Last Week of ${startDate.toLocaleString('en-US', { month: 'short' })} (${endStr})`,
    summaryText: `${monthName} (1 Month: First Week to Last Week)`
  };
}

function formatBatchScheduleText(schedText) {
  if (!schedText) return 'Monthly (1 Month Each: 1st Week to Last Week)';
  let cleaned = String(schedText).trim();
  if (cleaned.includes('(1 Month Each: 1st Week to Last Week)')) {
    return cleaned;
  }
  cleaned = cleaned.replace(/\s*\((?:1 Month: )?First Week to Last Week\)/i, '').trim();
  return `${cleaned} (1 Month Each: 1st Week to Last Week)`;
}

function isHeadOrAdminRole(role) {
  const activeRole = role || getCurrentUserRole();
  const cleanRole = String(activeRole || '').trim().toLowerCase();
  return cleanRole.includes('head') || cleanRole.includes('admin') || cleanRole.includes('superadmin');
}

const batchPickerState = {
  viewYear: new Date().getFullYear(),
  selectedMonths: new Set(), // Set of 'YYYY-MM' strings
  mode: 'multi-month' // 'multi-month' or 'date-month-year'
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

function initBatchSchedulePicker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const isHeadOrAdmin = isHeadOrAdminRole();

  // Role Notice Banner: HEAD / System Admin vs Trainer / Responder
  const noticeEl = document.getElementById('batchPickerRoleNotice');
  if (noticeEl) {
    if (isHeadOrAdmin) {
      noticeEl.style.background = '#f0fdf4';
      noticeEl.style.border = '1px solid #bbf7d0';
      noticeEl.style.color = '#15803d';
      noticeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <iconify-icon icon="solar:shield-check-bold" style="font-size: 20px; color: #16a34a; flex-shrink: 0;"></iconify-icon>
          <div>
            <strong>HEAD / System Admin Account:</strong>
            <span style="margin-left: 4px;">You can choose which months are available for this course and pick 2 or more months for the schedule.</span>
          </div>
        </div>
        <span style="font-size: 10px; font-weight: 700; background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 9999px; border: 1px solid #86efac; flex-shrink: 0;">
          Full Authority
        </span>
      `;
    } else {
      noticeEl.style.background = '#f0f9ff';
      noticeEl.style.border = '1px solid #bae6fd';
      noticeEl.style.color = '#0369a1';
      noticeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <iconify-icon icon="solar:info-circle-bold" style="font-size: 20px; color: #0284c7; flex-shrink: 0;"></iconify-icon>
          <div>
            <strong>Trainer Batch Booking:</strong>
            <span style="margin-left: 4px;">Choose from the available months opened by the HEAD or System Admin account (pick 2 or more).</span>
          </div>
        </div>
        <span style="font-size: 10px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; border: 1px solid #7dd3fc; flex-shrink: 0;">
          Trainer View
        </span>
      `;
    }
  }

  // Pre-fill selection: if course has available_months, pre-fill them; otherwise 2 upcoming months
  batchPickerState.selectedMonths.clear();
  const courseAvail = Array.isArray(activeTrainingCourse?.available_months) ? activeTrainingCourse.available_months : [];
  if (courseAvail.length > 0) {
    courseAvail.forEach(m => {
      const [y, mm] = m.split('-').map(Number);
      if (!isMonthInPast(y, mm)) batchPickerState.selectedMonths.add(m);
    });
  }
  if (batchPickerState.selectedMonths.size === 0 && courseAvail.length === 0) {
    let m1 = currentMonth;
    let y1 = currentYear;
    if (m1 > 12) { m1 = 1; y1++; }
    let m2 = m1 + 1;
    let y2 = y1;
    if (m2 > 12) { m2 = 1; y2++; }
    batchPickerState.selectedMonths.add(`${y1}-${String(m1).padStart(2, '0')}`);
    batchPickerState.selectedMonths.add(`${y2}-${String(m2).padStart(2, '0')}`);
  }

  batchPickerState.viewYear = currentYear;

  // Populate Year Dropdown (currentYear .. currentYear + 4)
  const yearSelect = document.getElementById('batchPickerYearSelect');
  if (yearSelect) {
    yearSelect.innerHTML = '';
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = batchPickerState.viewYear;
    yearSelect.onchange = (e) => {
      batchPickerState.viewYear = parseInt(e.target.value, 10);
      syncYearControl();
    };
  }

  // Prev / Next Year Buttons
  const prevBtn = document.getElementById('batchPickerPrevYear');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (batchPickerState.viewYear > currentYear) {
        batchPickerState.viewYear--;
        syncYearControl();
      } else {
        showToast('Previous years have already passed.', 'info');
      }
    };
  }

  const nextBtn = document.getElementById('batchPickerNextYear');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (batchPickerState.viewYear < currentYear + 4) {
        batchPickerState.viewYear++;
        syncYearControl();
      }
    };
  }

  // Select Remaining Upcoming Months button
  const selectRemainingBtn = document.getElementById('batchPickerSelectAllUpcoming');
  if (selectRemainingBtn) {
    selectRemainingBtn.onclick = () => {
      const courseAvailSet = new Set(activeTrainingCourse?.available_months || []);
      let added = 0;
      for (let m = 1; m <= 12; m++) {
        const mKey = `${batchPickerState.viewYear}-${String(m).padStart(2, '0')}`;
        if (!isMonthInPast(batchPickerState.viewYear, m) &&
            (courseAvailSet.size === 0 || courseAvailSet.has(mKey)) &&
            !batchPickerState.selectedMonths.has(mKey)) {
          batchPickerState.selectedMonths.add(mKey);
          added++;
        }
      }
      renderBatchMonthGrid();
      updateBatchMultiMonthPreview();
      showToast(added
        ? `Selected ${added} available course month${added === 1 ? '' : 's'} for ${batchPickerState.viewYear}.`
        : `No unselected course months are available in ${batchPickerState.viewYear}.`, 'info');
    };
  }

  // Clear Selection button
  const clearBtn = document.getElementById('batchPickerClearSelection');
  if (clearBtn) {
    clearBtn.onclick = () => {
      batchPickerState.selectedMonths.clear();
      renderBatchMonthGrid();
      updateBatchMultiMonthPreview();
    };
  }

  // Wire up Mode Switcher Buttons
  const btnMultiMonth = document.getElementById('btnModeMultiMonth');
  const btnDateMonthYear = document.getElementById('btnModeDateMonthYear');
  if (btnMultiMonth) {
    btnMultiMonth.onclick = () => switchBatchScheduleMode('multi-month');
  }
  if (btnDateMonthYear) {
    btnDateMonthYear.onclick = () => switchBatchScheduleMode('date-month-year');
  }

  initDateMonthYearPicker();
  // A batch is one class cohort with one start date, never one record per
  // configured availability month.
  switchBatchScheduleMode('date-month-year');

  renderYearQuickPills();
  renderBatchMonthGrid();
  updateBatchMultiMonthPreview();
}

function syncYearControl() {
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById('batchPickerYearSelect');
  if (yearSelect) yearSelect.value = batchPickerState.viewYear;
  const prevBtn = document.getElementById('batchPickerPrevYear');
  if (prevBtn) prevBtn.disabled = batchPickerState.viewYear <= currentYear;
  renderYearQuickPills();
  renderBatchMonthGrid();
}

function renderYearQuickPills() {
  const container = document.getElementById('batchYearQuickPills');
  if (!container) return;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  container.innerHTML = years.map(y => `
    <button type="button" class="tc-year-pill ${batchPickerState.viewYear === y ? 'active' : ''}" onclick="selectBatchPickerYear(${y})">${y}</button>
  `).join('');
}

function selectBatchPickerYear(year) {
  batchPickerState.viewYear = year;
  syncYearControl();
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function switchBatchScheduleMode(mode) {
  batchPickerState.mode = mode;
  const btnMulti = document.getElementById('btnModeMultiMonth');
  const btnDMY = document.getElementById('btnModeDateMonthYear');
  const viewMulti = document.getElementById('batchScheduleMultiMonthView');
  const viewDMY = document.getElementById('batchScheduleDateMonthYearView');

  if (mode === 'date-month-year') {
    if (btnMulti) btnMulti.classList.remove('active');
    if (btnDMY) btnDMY.classList.add('active');
    if (viewMulti) viewMulti.style.display = 'none';
    if (viewDMY) viewDMY.style.display = 'flex';

    validateDateMonthYearSelection();
  } else {
    if (btnMulti) btnMulti.classList.add('active');
    if (btnDMY) btnDMY.classList.remove('active');
    if (viewMulti) viewMulti.style.display = 'block';
    if (viewDMY) viewDMY.style.display = 'none';

    updateBatchMultiMonthPreview();
  }
}

function initDateMonthYearPicker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('batchInputScheduleYear');
  const monthSelect = document.getElementById('batchInputScheduleMonth');
  const daySelect = document.getElementById('batchInputScheduleDay');

  if (yearSelect && yearSelect.options.length === 0) {
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = currentYear;
  }

  if (monthSelect && monthSelect.options.length === 0) {
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MONTH_NAMES[m - 1]} (${String(m).padStart(2, '0')})`;
      monthSelect.appendChild(opt);
    }
    monthSelect.value = currentMonth;
  }

  if (yearSelect) yearSelect.onchange = updateDaysList;
  if (monthSelect) monthSelect.onchange = updateDaysList;
  if (daySelect) daySelect.onchange = validateDateMonthYearSelection;

  updateDaysList();
}

function updateDaysList() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('batchInputScheduleYear');
  const monthSelect = document.getElementById('batchInputScheduleMonth');
  const daySelect = document.getElementById('batchInputScheduleDay');
  if (!daySelect || !yearSelect || !monthSelect) return;

  const y = parseInt(yearSelect.value, 10) || currentYear;
  const m = parseInt(monthSelect.value, 10) || currentMonth;
  const totalDays = getDaysInMonth(y, m);
  const prevDay = parseInt(daySelect.value, 10) || currentDay;

  daySelect.innerHTML = '';
  for (let d = 1; d <= totalDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `Day ${d}`;
    daySelect.appendChild(opt);
  }
  daySelect.value = Math.min(prevDay, totalDays);
  validateDateMonthYearSelection();
}

function validateDateMonthYearSelection() {
  const yearSelect = document.getElementById('batchInputScheduleYear');
  const monthSelect = document.getElementById('batchInputScheduleMonth');
  const daySelect = document.getElementById('batchInputScheduleDay');
  if (!yearSelect || !monthSelect || !daySelect) return;

  const y = parseInt(yearSelect.value, 10);
  const m = parseInt(monthSelect.value, 10);
  const d = parseInt(daySelect.value, 10);

  const isPassed = isMonthInPast(y, m);
  const notice = document.getElementById('batchDatePassedNotice');
  const badge = document.getElementById('batchMultiMonthCounterBadge');

  if (notice) {
    if (isPassed) {
      notice.style.display = 'block';
      notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Date Expired:</strong> ${MONTH_NAMES[m - 1]} ${y} has already passed in the current year. Please pick an upcoming month.`;
    } else {
      const monthKey = `${y}-${String(m).padStart(2, '0')}`;
      const courseAvail = new Set(activeTrainingCourse?.available_months || []);
      const today = new Date();
      if (courseAvail.size > 0 && !courseAvail.has(monthKey)) {
        notice.style.display = 'block';
        notice.innerHTML = `<iconify-icon icon="solar:lock-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Month not offered:</strong> ${MONTH_NAMES[m - 1]} ${y} is not available for this course. Update the course schedule first.`;
      } else if (y === today.getFullYear() && m === (today.getMonth() + 1) && d < today.getDate()) {
        notice.style.display = 'block';
        notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Day Passed:</strong> Day ${d} of this month has already passed in the current year. Please select a current or future day.`;
      } else {
        notice.style.display = 'none';
      }
    }
  }

  if (batchPickerState.mode === 'date-month-year' && badge) {
    const mName = MONTH_SHORT[m - 1] || '';
    badge.textContent = `Schedule: ${mName} ${d}, ${y}`;
    badge.style.background = isPassed ? '#fee2e2' : '#dcfce7';
    badge.style.color = isPassed ? '#b91c1c' : '#15803d';
  }
}

function renderBatchMonthGrid() {
  const container = document.getElementById('batchPickerMonthGrid');
  if (!container) return;

  const yr = batchPickerState.viewYear;
  const isHeadOrAdmin = isHeadOrAdminRole();
  const courseAvail = new Set(activeTrainingCourse?.available_months || []);
  let html = '';

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${yr}-${String(m).padStart(2, '0')}`;
    const isPassed = isMonthInPast(yr, m);
    const isSelected = batchPickerState.selectedMonths.has(monthKey);
    const shortName = MONTH_SHORT[m - 1];
    const fullName = MONTH_NAMES[m - 1];

    if (isPassed) {
      // Month in the current year that has already passed
      // CRITICAL REQUIREMENT: if the date from the previous month has already passed, do not open it when clicking on a schedule for a month in the current year.
      html += `
        <div class="tc-month-btn is-passed" title="${escapeHtml(fullName)} ${yr} has already passed and cannot be scheduled."
             onclick="handlePassedMonthClick('${escapeHtml(fullName)}', ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub"><iconify-icon icon="solar:lock-bold" style="font-size:10px; vertical-align:-1px;"></iconify-icon> Passed</span>
        </div>
      `;
    } else if (courseAvail.size > 0 && !courseAvail.has(monthKey)) {
      // Batches must use months offered by the course for every role.
      html += `
        <div class="tc-month-btn not-available-by-head" title="${escapeHtml(fullName)} ${yr} is not available for this course."
             onclick="handleLockedMonthClick('${escapeHtml(fullName)}', ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub"><iconify-icon icon="solar:lock-bold" style="font-size:10px; vertical-align:-1px;"></iconify-icon> Not offered</span>
        </div>
      `;
    } else {
      // Active / upcoming month that HEAD/Admin can choose or Trainer can select
      html += `
        <div class="tc-month-btn ${isSelected ? 'selected' : ''}" 
             onclick="toggleBatchMonthSelection('${monthKey}')"
             title="${isSelected ? 'Click to unselect' : 'Click to select 1-month batch'} (${fullName} ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub">${isSelected ? '✓ 1-Month' : isHeadOrAdmin ? 'Available' : 'Open'}</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function handlePassedMonthClick(monthName, year) {
  // CRITICAL REQUIREMENT: do not open it when clicking on a schedule for a month in the current year if passed
  showToast(`Cannot select schedule: The dates for ${monthName} ${year} have already passed in the current year.`, 'warning');
}

function handleLockedMonthClick(monthName, year) {
  showToast(`${monthName} ${year} is not available for this course. Update the course schedule first if you want to offer it.`, 'warning');
}

function toggleBatchMonthSelection(monthKey) {
  const courseAvail = new Set(activeTrainingCourse?.available_months || []);
  if (courseAvail.size > 0 && !courseAvail.has(monthKey)) {
    const [year, month] = monthKey.split('-').map(Number);
    handleLockedMonthClick(MONTH_NAMES[month - 1], year);
    return;
  }
  if (batchPickerState.selectedMonths.has(monthKey)) {
    batchPickerState.selectedMonths.delete(monthKey);
  } else {
    batchPickerState.selectedMonths.add(monthKey);
  }
  renderBatchMonthGrid();
  updateBatchMultiMonthPreview();
}

function updateBatchMultiMonthPreview() {
  const badge = document.getElementById('batchMultiMonthCounterBadge');
  const countBadge = document.getElementById('batchPreviewCountBadge');
  const previewList = document.getElementById('batchPreviewMonthList');

  const selectedArr = Array.from(batchPickerState.selectedMonths).sort();
  const count = selectedArr.length;

  if (badge) {
    badge.textContent = `${count} month${count === 1 ? '' : 's'} selected`;
    badge.style.background = count >= 2 ? '#dcfce7' : count === 1 ? '#fef3c7' : '#e0f2fe';
    badge.style.color = count >= 2 ? '#15803d' : count === 1 ? '#b45309' : '#0369a1';
  }
  if (countBadge) {
    countBadge.textContent = `${count} Month${count === 1 ? '' : 's'}`;
    countBadge.style.background = count >= 2 ? '#dcfce7' : '#f1f5f9';
    countBadge.style.color = count >= 2 ? '#15803d' : '#64748b';
  }

  if (previewList) {
    if (count === 0) {
      previewList.innerHTML = `
        <div style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1; text-align: center; color: #64748b; font-size: 12px;">
          <iconify-icon icon="solar:calendar-minimalistic-bold-duotone" style="font-size: 20px; color: #94a3b8; vertical-align: -3px;"></iconify-icon>
          No months selected. Please choose 2 or more months from the grid above.
        </div>
      `;
      return;
    }

    previewList.innerHTML = selectedArr.map(mStr => {
      const sched = computeMonthSchedule(mStr);
      return `
        <div style="background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #dcfce7; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <div>
            <strong style="color: #14532d; font-size: 12.5px;">${escapeHtml(sched.monthName)}:</strong>
            <span style="color: #166534; font-size: 11.5px; margin-left: 4px;">Start: 1st Week (${escapeHtml(sched.startStr)}) &bull; End: Last Week (${escapeHtml(sched.endStr)})</span>
          </div>
          <span style="font-size: 10px; font-weight: 700; background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; border: 1px solid #86efac;">1 Month</span>
        </div>
      `;
    }).join('');
  }
}

/* ========================================================
   COURSE SESSION DAYS & TIME OFFERINGS PICKER CONTROLLERS
   Multiple Day Selection (Mon-Sun, 4 sessions/month per day)
   and AM / PM Class Multi-Selection (Only AM, Only PM, Both)
   ======================================================== */
const COURSE_DAYS_LIST = [
  { day: 'Monday', label: 'Monday', subtitle: '4 Sessions / mo' },
  { day: 'Tuesday', label: 'Tuesday', subtitle: '4 Sessions / mo' },
  { day: 'Wednesday', label: 'Wednesday', subtitle: '4 Sessions / mo' },
  { day: 'Thursday', label: 'Thursday', subtitle: '4 Sessions / mo' },
  { day: 'Friday', label: 'Friday', subtitle: '4 Sessions / mo' },
  { day: 'Saturday', label: 'Saturday', subtitle: '4 Sessions / mo' },
  { day: 'Sunday', label: 'Sunday', subtitle: '4 Sessions / mo' }
];

let createCourseDaysController = null;
let createCourseTimeController = null;
let editCourseDaysController = null;
let editCourseTimeController = null;
let batchDaysController = null;
let batchTimeController = null;

function initCourseDaysPicker(prefix, initialDays) {
  let gridEl, summaryEl, hiddenSelectEl, btnWeekdays, btnWeekends, btnAll, btnClear;
  if (prefix === 'createCourse') {
    gridEl = document.getElementById('createCourseDaysGrid');
    summaryEl = document.getElementById('createCourseDaysSelectedSummary');
    hiddenSelectEl = document.getElementById('courseInputSessions');
    btnWeekdays = document.getElementById('btnCourseDaysWeekdays');
    btnWeekends = document.getElementById('btnCourseDaysWeekends');
    btnAll = document.getElementById('btnCourseDaysAll');
    btnClear = document.getElementById('btnCourseDaysClear');
  } else if (prefix === 'editCourse') {
    gridEl = document.getElementById('editCourseDaysGrid');
    summaryEl = document.getElementById('editCourseDaysSelectedSummary');
    hiddenSelectEl = document.getElementById('editCourseInputSessions');
    btnWeekdays = document.getElementById('btnEditCourseDaysWeekdays');
    btnWeekends = document.getElementById('btnEditCourseDaysWeekends');
    btnAll = document.getElementById('btnEditCourseDaysAll');
    btnClear = document.getElementById('btnEditCourseDaysClear');
  } else if (prefix === 'batch') {
    gridEl = document.getElementById('batchDaysGrid');
    summaryEl = document.getElementById('batchDaysSelectedSummary');
    hiddenSelectEl = document.getElementById('batchInputSessionSchedule');
    btnWeekdays = document.getElementById('btnBatchDaysWeekdays');
    btnWeekends = document.getElementById('btnBatchDaysWeekends');
    btnAll = document.getElementById('btnBatchDaysAll');
    btnClear = document.getElementById('btnBatchDaysClear');
  }

  if (!gridEl) return null;

  const allowedDays = prefix === 'batch' && Array.isArray(initialDays) && initialDays.length > 0
    ? new Set(initialDays.map(day => String(day).trim().toLowerCase()))
    : null;

  let selectedSet = new Set();
  if (Array.isArray(initialDays) && initialDays.length > 0) {
    initialDays.forEach(d => {
      const clean = String(d).trim();
      const match = COURSE_DAYS_LIST.find(item => item.day.toLowerCase() === clean.toLowerCase());
      if (match) selectedSet.add(match.day);
    });
  } else if (typeof initialDays === 'string' && initialDays.trim()) {
    const rawLower = initialDays.toLowerCase();
    COURSE_DAYS_LIST.forEach(item => {
      if (rawLower.includes(item.day.toLowerCase())) selectedSet.add(item.day);
    });
  }
  if (selectedSet.size === 0) {
    selectedSet.add('Monday');
    selectedSet.add('Wednesday');
    selectedSet.add('Saturday');
  }
  if (allowedDays) {
    selectedSet = new Set([...selectedSet].filter(day => allowedDays.has(day.toLowerCase())));
    if (selectedSet.size === 0) selectedSet.add(COURSE_DAYS_LIST.find(item => allowedDays.has(item.day.toLowerCase()))?.day);
    selectedSet.delete(undefined);
  }

  const syncDayState = (reRenderDom = true) => {
    const ordered = COURSE_DAYS_LIST.map(i => i.day).filter(d => selectedSet.has(d));
    if (summaryEl) {
      if (ordered.length === 0) {
        summaryEl.innerHTML = '<span style="color: #dc2626;">⚠️ Please select at least one session day</span>';
      } else {
        summaryEl.innerHTML = `Selected Days: <strong>${escapeHtml(ordered.join(', '))}</strong> (${ordered.length} choice${ordered.length > 1 ? 's' : ''} for students)`;
      }
    }

    if (hiddenSelectEl) {
      if (ordered.includes('Saturday')) {
        hiddenSelectEl.value = '1 per week on Saturday in 1 month (4 Sessions)';
      } else if (ordered.includes('Monday')) {
        hiddenSelectEl.value = '1 per week on Monday in 1 Month (4 session - Every Monday)';
      } else if (ordered.includes('Wednesday')) {
        hiddenSelectEl.value = '1 per week on Wednesday in 1 Month (4 session - Every Wednesday)';
      } else if (ordered.includes('Sunday')) {
        hiddenSelectEl.value = '1 per week on Sunday in 1 month (4 Sessions)';
      } else if (ordered.length > 0) {
        hiddenSelectEl.value = `1 per week on ${ordered[0]} in 1 Month (4 Sessions)`;
      }
    }

    if (reRenderDom) {
      gridEl.querySelectorAll('label').forEach(lbl => {
        const cb = lbl.querySelector('input');
        if (cb) {
          const isChecked = selectedSet.has(cb.getAttribute('data-day'));
          cb.checked = isChecked;
          lbl.style.borderColor = isChecked ? '#0284c7' : '#cbd5e1';
          lbl.style.background = isChecked ? '#eff6ff' : '#ffffff';
          const title = lbl.querySelector('.tc-day-title');
          const sub = lbl.querySelector('.tc-day-sub');
          if (title) title.style.color = isChecked ? '#0369a1' : '#334155';
          if (sub) sub.style.color = isChecked ? '#0284c7' : '#94a3b8';
        }
      });
    }
  };

  const renderGrid = () => {
    gridEl.innerHTML = COURSE_DAYS_LIST.map(item => {
      const isChecked = selectedSet.has(item.day);
      const isAllowed = !allowedDays || allowedDays.has(item.day.toLowerCase());
      return `
        <label title="${isAllowed ? '' : 'This day is not offered by the course.'}" style="display: flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 6px; border: 1px solid ${isChecked ? '#0284c7' : '#cbd5e1'}; background: ${isChecked ? '#eff6ff' : '#ffffff'}; opacity: ${isAllowed ? '1' : '0.45'}; cursor: ${isAllowed ? 'pointer' : 'not-allowed'}; transition: all 0.15s ease; user-select: none;">
          <input type="checkbox" data-day="${item.day}" ${isChecked ? 'checked' : ''} ${isAllowed ? '' : 'disabled'} style="accent-color: #0284c7; width: 15px; height: 15px; cursor: ${isAllowed ? 'pointer' : 'not-allowed'}; margin: 0;">
          <div style="line-height: 1.2;">
            <div class="tc-day-title" style="font-size: 12px; font-weight: 600; color: ${isChecked ? '#0369a1' : '#334155'};">${escapeHtml(item.day)}</div>
            <div class="tc-day-sub" style="font-size: 10px; color: ${isChecked ? '#0284c7' : '#94a3b8'};">4 sess/mo</div>
          </div>
        </label>
      `;
    }).join('');

    gridEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const d = e.target.getAttribute('data-day');
        if (e.target.checked) {
          selectedSet.add(d);
        } else {
          selectedSet.delete(d);
        }
        syncDayState(true);
      });
    });

    syncDayState(false);
  };

  if (btnWeekdays) {
    btnWeekdays.onclick = () => {
      selectedSet.clear();
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter(d => !allowedDays || allowedDays.has(d.toLowerCase())).forEach(d => selectedSet.add(d));
      syncDayState(true);
    };
  }
  if (btnWeekends) {
    btnWeekends.onclick = () => {
      selectedSet.clear();
      ['Saturday', 'Sunday'].filter(d => !allowedDays || allowedDays.has(d.toLowerCase())).forEach(d => selectedSet.add(d));
      syncDayState(true);
    };
  }
  if (btnAll) {
    btnAll.onclick = () => {
      COURSE_DAYS_LIST.filter(i => !allowedDays || allowedDays.has(i.day.toLowerCase())).forEach(i => selectedSet.add(i.day));
      syncDayState(true);
    };
  }
  if (btnClear) {
    btnClear.onclick = () => {
      selectedSet.clear();
      syncDayState(true);
    };
  }

  renderGrid();

  return {
    getSelectedDays: () => COURSE_DAYS_LIST.map(i => i.day).filter(d => selectedSet.has(d) && (!allowedDays || allowedDays.has(d.toLowerCase()))),
    setSelectedDays: (days) => {
      selectedSet.clear();
      (days || []).filter(d => !allowedDays || allowedDays.has(String(d).toLowerCase())).forEach(d => selectedSet.add(d));
      syncDayState(true);
    }
  };
}

function initCourseTimePicker(prefix, initialTimes) {
  let amCb, pmCb, badgeEl, hiddenSelectEl, btnOnlyAM, btnOnlyPM, btnBoth;
  if (prefix === 'courseTime') {
    amCb = document.getElementById('courseTimeCheckAM');
    pmCb = document.getElementById('courseTimeCheckPM');
    badgeEl = document.getElementById('courseTimeSelectedBadge');
    hiddenSelectEl = document.getElementById('courseInputTime');
    btnOnlyAM = document.getElementById('btnCourseTimeOnlyAM');
    btnOnlyPM = document.getElementById('btnCourseTimeOnlyPM');
    btnBoth = document.getElementById('btnCourseTimeBoth');
  } else if (prefix === 'editCourseTime') {
    amCb = document.getElementById('editCourseTimeCheckAM');
    pmCb = document.getElementById('editCourseTimeCheckPM');
    badgeEl = document.getElementById('editCourseTimeSelectedBadge');
    hiddenSelectEl = document.getElementById('editCourseInputTime');
    btnOnlyAM = document.getElementById('btnEditCourseTimeOnlyAM');
    btnOnlyPM = document.getElementById('btnEditCourseTimeOnlyPM');
    btnBoth = document.getElementById('btnEditCourseTimeBoth');
  } else if (prefix === 'batchTime') {
    amCb = document.getElementById('batchTimeCheckAM');
    pmCb = document.getElementById('batchTimeCheckPM');
    badgeEl = document.getElementById('batchTimeSelectedBadge');
    hiddenSelectEl = document.getElementById('batchInputTime');
    btnOnlyAM = document.getElementById('btnBatchTimeOnlyAM');
    btnOnlyPM = document.getElementById('btnBatchTimeOnlyPM');
    btnBoth = document.getElementById('btnBatchTimeBoth');
  }

  if (!amCb || !pmCb) return null;

  let hasAM = true;
  let hasPM = true;

  if (Array.isArray(initialTimes)) {
    const raw = initialTimes.join(' ').toLowerCase();
    hasAM = raw.includes('07:00') || raw.includes('am') || raw.includes('morning');
    hasPM = raw.includes('01:00') || raw.includes('pm') || raw.includes('noon') || raw.includes('5:00');
    if (!hasAM && !hasPM) { hasAM = true; hasPM = true; }
  } else if (typeof initialTimes === 'string') {
    const raw = initialTimes.toLowerCase();
    hasAM = raw.includes('07:00') || raw.includes('am') || raw.includes('morning');
    hasPM = raw.includes('01:00') || raw.includes('pm') || raw.includes('noon') || raw.includes('5:00');
    if (!hasAM && !hasPM) { hasAM = true; hasPM = true; }
  }

  const allowedAM = hasAM;
  const allowedPM = hasPM;

  amCb.checked = hasAM;
  pmCb.checked = hasPM;
  if (prefix === 'batchTime') {
    amCb.disabled = !allowedAM;
    pmCb.disabled = !allowedPM;
  }

  const syncTimeState = () => {
    if (!amCb.checked && !pmCb.checked) {
      showToast('At least one training time slot (AM or PM) must be selected.', 'warning');
      amCb.checked = allowedAM;
      pmCb.checked = !allowedAM && allowedPM;
    }

    const curAM = amCb.checked;
    const curPM = pmCb.checked;

    if (badgeEl) {
      if (curAM && curPM) {
        badgeEl.textContent = '✓ Both AM & PM Classes Offered';
        badgeEl.style.color = '#0284c7';
      } else if (curAM) {
        badgeEl.textContent = '✓ Only AM Class Offered (07:00 A.M - 11:00 A.M)';
        badgeEl.style.color = '#0369a1';
      } else if (curPM) {
        badgeEl.textContent = '✓ Only PM Class Offered (01:00 P.M - 5:00 P.M)';
        badgeEl.style.color = '#b45309';
      }
    }

    if (hiddenSelectEl) {
      if (curAM && !curPM) {
        hiddenSelectEl.value = '07:00 A.M - 11:00 A.M';
      } else if (curPM && !curAM) {
        hiddenSelectEl.value = '01:00 P.M - 5:00 P.M';
      } else {
        hiddenSelectEl.value = '07:00 A.M - 11:00 A.M';
      }
    }
  };

  amCb.onchange = syncTimeState;
  pmCb.onchange = syncTimeState;

  if (btnOnlyAM) {
    btnOnlyAM.onclick = () => {
      if (!allowedAM) return;
      amCb.checked = true;
      pmCb.checked = false;
      syncTimeState();
    };
  }
  if (btnOnlyPM) {
    btnOnlyPM.onclick = () => {
      if (!allowedPM) return;
      amCb.checked = false;
      pmCb.checked = true;
      syncTimeState();
    };
  }
  if (btnBoth) {
    btnBoth.onclick = () => {
      amCb.checked = allowedAM;
      pmCb.checked = allowedPM;
      syncTimeState();
    };
  }

  syncTimeState();

  return {
    getSelectedTimes: () => {
      const times = [];
      if (amCb.checked) times.push('07:00 A.M - 11:00 A.M');
      if (pmCb.checked) times.push('01:00 P.M - 5:00 P.M');
      return times;
    },
    getTimeString: () => {
      if (amCb.checked && pmCb.checked) return '07:00 A.M - 11:00 A.M, 01:00 P.M - 5:00 P.M';
      if (pmCb.checked) return '01:00 P.M - 5:00 P.M';
      return '07:00 A.M - 11:00 A.M';
    },
    setSelectedTimes: (times) => {
      let tAM = false;
      let tPM = false;
      if (Array.isArray(times)) {
        const s = times.join(' ').toLowerCase();
        tAM = s.includes('07:00') || s.includes('am');
        tPM = s.includes('01:00') || s.includes('pm') || s.includes('5:00');
      } else if (typeof times === 'string') {
        const s = times.toLowerCase();
        tAM = s.includes('07:00') || s.includes('am');
        tPM = s.includes('01:00') || s.includes('pm') || s.includes('5:00');
      }
      if (!tAM && !tPM) { tAM = true; tPM = true; }
      amCb.checked = tAM;
      pmCb.checked = tPM;
      syncTimeState();
    }
  };
}

/* ========================================================
   COURSE CREATION BATCH SCHEDULE PICKER CONTROLLER
   ======================================================== */
const createCoursePickerState = {
  viewYear: new Date().getFullYear(),
  selectedMonths: new Set(),
  mode: 'multi-month'
};

function initCreateCourseSchedulePicker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  createCoursePickerState.selectedMonths.clear();
  let m1 = currentMonth;
  let y1 = currentYear;
  if (m1 > 12) { m1 = 1; y1++; }
  let m2 = m1 + 1;
  let y2 = y1;
  if (m2 > 12) { m2 = 1; y2++; }
  createCoursePickerState.selectedMonths.add(`${y1}-${String(m1).padStart(2, '0')}`);
  createCoursePickerState.selectedMonths.add(`${y2}-${String(m2).padStart(2, '0')}`);
  createCoursePickerState.viewYear = currentYear;

  const yearSelect = document.getElementById('createCourseYearSelect');
  if (yearSelect) {
    yearSelect.innerHTML = '';
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = createCoursePickerState.viewYear;
    yearSelect.onchange = (e) => {
      createCoursePickerState.viewYear = parseInt(e.target.value, 10);
      syncCreateCourseYearControl();
    };
  }

  const prevBtn = document.getElementById('createCoursePrevYear');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (createCoursePickerState.viewYear > currentYear) {
        createCoursePickerState.viewYear--;
        syncCreateCourseYearControl();
      } else {
        showToast('Previous years have already passed.', 'info');
      }
    };
  }

  const nextBtn = document.getElementById('createCourseNextYear');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (createCoursePickerState.viewYear < currentYear + 4) {
        createCoursePickerState.viewYear++;
        syncCreateCourseYearControl();
      }
    };
  }

  const selectRemainingBtn = document.getElementById('createCourseSelectAllUpcoming');
  if (selectRemainingBtn) {
    selectRemainingBtn.onclick = () => {
      for (let m = 1; m <= 12; m++) {
        const mKey = `${createCoursePickerState.viewYear}-${String(m).padStart(2, '0')}`;
        if (!isMonthInPast(createCoursePickerState.viewYear, m)) {
          createCoursePickerState.selectedMonths.add(mKey);
        }
      }
      renderCreateCourseMonthGrid();
      updateCreateCourseMultiMonthPreview();
      showToast(`Selected all upcoming months for ${createCoursePickerState.viewYear}.`, 'info');
    };
  }

  const clearBtn = document.getElementById('createCourseClearSelection');
  if (clearBtn) {
    clearBtn.onclick = () => {
      createCoursePickerState.selectedMonths.clear();
      renderCreateCourseMonthGrid();
      updateCreateCourseMultiMonthPreview();
    };
  }

  const btnMultiMonth = document.getElementById('btnCreateCourseModeMultiMonth');
  const btnDateMonthYear = document.getElementById('btnCreateCourseModeDateMonthYear');
  if (btnMultiMonth) {
    btnMultiMonth.onclick = () => switchCreateCourseScheduleMode('multi-month');
  }
  if (btnDateMonthYear) {
    btnDateMonthYear.onclick = () => switchCreateCourseScheduleMode('date-month-year');
  }

  initCreateCourseDateMonthYearPicker();
  switchCreateCourseScheduleMode('multi-month');
  renderCreateCourseYearQuickPills();
  renderCreateCourseMonthGrid();
  updateCreateCourseMultiMonthPreview();
}

function syncCreateCourseYearControl() {
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById('createCourseYearSelect');
  if (yearSelect) yearSelect.value = createCoursePickerState.viewYear;
  const prevBtn = document.getElementById('createCoursePrevYear');
  if (prevBtn) prevBtn.disabled = createCoursePickerState.viewYear <= currentYear;
  renderCreateCourseYearQuickPills();
  renderCreateCourseMonthGrid();
}

function renderCreateCourseYearQuickPills() {
  const container = document.getElementById('createCourseYearQuickPills');
  if (!container) return;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  container.innerHTML = years.map(y => `
    <button type="button" class="tc-year-pill ${createCoursePickerState.viewYear === y ? 'active' : ''}" onclick="selectCreateCourseYear(${y})">${y}</button>
  `).join('');
}

function selectCreateCourseYear(year) {
  createCoursePickerState.viewYear = year;
  syncCreateCourseYearControl();
}

function switchCreateCourseScheduleMode(mode) {
  createCoursePickerState.mode = mode;
  const btnMulti = document.getElementById('btnCreateCourseModeMultiMonth');
  const btnDMY = document.getElementById('btnCreateCourseModeDateMonthYear');
  const viewMulti = document.getElementById('createCourseMultiMonthView');
  const viewDMY = document.getElementById('createCourseDateMonthYearView');

  if (mode === 'date-month-year') {
    if (btnMulti) btnMulti.classList.remove('active');
    if (btnDMY) btnDMY.classList.add('active');
    if (viewMulti) viewMulti.style.display = 'none';
    if (viewDMY) viewDMY.style.display = 'flex';
    validateCreateCourseDateMonthYearSelection();
  } else {
    if (btnMulti) btnMulti.classList.add('active');
    if (btnDMY) btnDMY.classList.remove('active');
    if (viewMulti) viewMulti.style.display = 'block';
    if (viewDMY) viewDMY.style.display = 'none';
    updateCreateCourseMultiMonthPreview();
  }
}

function initCreateCourseDateMonthYearPicker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('createCourseScheduleYear');
  const monthSelect = document.getElementById('createCourseScheduleMonth');
  const daySelect = document.getElementById('createCourseScheduleDay');

  if (yearSelect && yearSelect.options.length === 0) {
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = currentYear;
  }

  if (monthSelect && monthSelect.options.length === 0) {
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MONTH_NAMES[m - 1]} (${String(m).padStart(2, '0')})`;
      monthSelect.appendChild(opt);
    }
    monthSelect.value = currentMonth;
  }

  if (yearSelect) yearSelect.onchange = updateCreateCourseDaysList;
  if (monthSelect) monthSelect.onchange = updateCreateCourseDaysList;
  if (daySelect) daySelect.onchange = validateCreateCourseDateMonthYearSelection;

  updateCreateCourseDaysList();
}

function updateCreateCourseDaysList() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('createCourseScheduleYear');
  const monthSelect = document.getElementById('createCourseScheduleMonth');
  const daySelect = document.getElementById('createCourseScheduleDay');
  if (!daySelect || !yearSelect || !monthSelect) return;

  const y = parseInt(yearSelect.value, 10) || currentYear;
  const m = parseInt(monthSelect.value, 10) || currentMonth;
  const totalDays = getDaysInMonth(y, m);
  const prevDay = parseInt(daySelect.value, 10) || currentDay;

  daySelect.innerHTML = '';
  for (let d = 1; d <= totalDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `Day ${d}`;
    daySelect.appendChild(opt);
  }
  daySelect.value = Math.min(prevDay, totalDays);
  validateCreateCourseDateMonthYearSelection();
}

function validateCreateCourseDateMonthYearSelection() {
  const yearSelect = document.getElementById('createCourseScheduleYear');
  const monthSelect = document.getElementById('createCourseScheduleMonth');
  const daySelect = document.getElementById('createCourseScheduleDay');
  if (!yearSelect || !monthSelect || !daySelect) return;

  const y = parseInt(yearSelect.value, 10);
  const m = parseInt(monthSelect.value, 10);
  const d = parseInt(daySelect.value, 10);

  const isPassed = isMonthInPast(y, m);
  const notice = document.getElementById('createCourseDatePassedNotice');
  const badge = document.getElementById('createCourseMultiMonthBadge');
  const hiddenInput = document.getElementById('courseInputBatchSchedule');

  if (notice) {
    if (isPassed) {
      notice.style.display = 'block';
      notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Date Expired:</strong> ${MONTH_NAMES[m - 1]} ${y} has already passed in the current year. Please pick an upcoming month.`;
    } else {
      const today = new Date();
      if (y === today.getFullYear() && m === (today.getMonth() + 1) && d < today.getDate()) {
        notice.style.display = 'block';
        notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Day Passed:</strong> Day ${d} of this month has already passed in the current year. Please select a current or future day.`;
      } else {
        notice.style.display = 'none';
      }
    }
  }

  if (createCoursePickerState.mode === 'date-month-year') {
    const mName = MONTH_SHORT[m - 1] || '';
    if (badge) {
      badge.textContent = `Schedule: ${mName} ${d}, ${y}`;
      badge.style.background = isPassed ? '#fee2e2' : '#dcfce7';
      badge.style.color = isPassed ? '#b91c1c' : '#15803d';
    }
    if (hiddenInput) {
      hiddenInput.value = `${MONTH_NAMES[m - 1]} ${d}, ${y} (1 Month Batch: 1st Week to Last Week)`;
    }
  }
}

function renderCreateCourseMonthGrid() {
  const container = document.getElementById('createCourseMonthGrid');
  if (!container) return;

  const yr = createCoursePickerState.viewYear;
  let html = '';

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${yr}-${String(m).padStart(2, '0')}`;
    const isPassed = isMonthInPast(yr, m);
    const isSelected = createCoursePickerState.selectedMonths.has(monthKey);
    const shortName = MONTH_SHORT[m - 1];
    const fullName = MONTH_NAMES[m - 1];

    if (isPassed) {
      html += `
        <div class="tc-month-btn is-passed" title="${escapeHtml(fullName)} ${yr} has already passed."
             onclick="handlePassedMonthClick('${escapeHtml(fullName)}', ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub"><iconify-icon icon="solar:lock-bold" style="font-size:10px; vertical-align:-1px;"></iconify-icon> Passed</span>
        </div>
      `;
    } else {
      html += `
        <div class="tc-month-btn ${isSelected ? 'selected' : ''}" 
             onclick="toggleCreateCourseMonthSelection('${monthKey}')"
             title="${isSelected ? 'Click to unselect' : 'Click to select 1-month batch'} (${fullName} ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub">${isSelected ? '✓ 1-Month' : 'Available'}</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function toggleCreateCourseMonthSelection(monthKey) {
  if (createCoursePickerState.selectedMonths.has(monthKey)) {
    createCoursePickerState.selectedMonths.delete(monthKey);
  } else {
    createCoursePickerState.selectedMonths.add(monthKey);
  }
  renderCreateCourseMonthGrid();
  updateCreateCourseMultiMonthPreview();
}

function updateCreateCourseMultiMonthPreview() {
  const badge = document.getElementById('createCourseMultiMonthBadge');
  const hiddenInput = document.getElementById('courseInputBatchSchedule');
  const selectedArr = Array.from(createCoursePickerState.selectedMonths).sort();
  const count = selectedArr.length;

  if (createCoursePickerState.mode === 'multi-month') {
    if (badge) {
      badge.textContent = `${count} month${count === 1 ? '' : 's'} selected`;
      badge.style.background = count >= 2 ? '#dcfce7' : count === 1 ? '#fef3c7' : '#e0f2fe';
      badge.style.color = count >= 2 ? '#15803d' : count === 1 ? '#b45309' : '#0369a1';
    }
    if (hiddenInput) {
      hiddenInput.value = count > 0 
        ? selectedArr.map(m => computeMonthSchedule(m).monthName).join(', ') + ' (1 Month Each: 1st Week to Last Week)'
        : '';
    }
  }
}

/* ========================================================
   COURSE EDITING BATCH SCHEDULE PICKER CONTROLLER
   ======================================================== */
const editCoursePickerState = {
  viewYear: new Date().getFullYear(),
  selectedMonths: new Set(),
  mode: 'multi-month'
};

function initEditCourseSchedulePicker(initialMonths) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  editCoursePickerState.selectedMonths.clear();
  const monthsArr = Array.isArray(initialMonths) ? initialMonths : (activeTrainingCourse?.available_months || []);
  if (monthsArr.length > 0) {
    monthsArr.forEach(m => {
      const [y, mm] = m.split('-').map(Number);
      if (!isMonthInPast(y, mm)) editCoursePickerState.selectedMonths.add(m);
    });
  }
  if (editCoursePickerState.selectedMonths.size === 0) {
    let m1 = currentMonth;
    let y1 = currentYear;
    if (m1 > 12) { m1 = 1; y1++; }
    let m2 = m1 + 1;
    let y2 = y1;
    if (m2 > 12) { m2 = 1; y2++; }
    editCoursePickerState.selectedMonths.add(`${y1}-${String(m1).padStart(2, '0')}`);
    editCoursePickerState.selectedMonths.add(`${y2}-${String(m2).padStart(2, '0')}`);
  }
  editCoursePickerState.viewYear = currentYear;

  const yearSelect = document.getElementById('editCourseYearSelect');
  if (yearSelect) {
    yearSelect.innerHTML = '';
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = editCoursePickerState.viewYear;
    yearSelect.onchange = (e) => {
      editCoursePickerState.viewYear = parseInt(e.target.value, 10);
      syncEditCourseYearControl();
    };
  }

  const prevBtn = document.getElementById('editCoursePrevYear');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (editCoursePickerState.viewYear > currentYear) {
        editCoursePickerState.viewYear--;
        syncEditCourseYearControl();
      } else {
        showToast('Previous years have already passed.', 'info');
      }
    };
  }

  const nextBtn = document.getElementById('editCourseNextYear');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (editCoursePickerState.viewYear < currentYear + 4) {
        editCoursePickerState.viewYear++;
        syncEditCourseYearControl();
      }
    };
  }

  const selectRemainingBtn = document.getElementById('editCourseSelectAllUpcoming');
  if (selectRemainingBtn) {
    selectRemainingBtn.onclick = () => {
      for (let m = 1; m <= 12; m++) {
        const mKey = `${editCoursePickerState.viewYear}-${String(m).padStart(2, '0')}`;
        if (!isMonthInPast(editCoursePickerState.viewYear, m)) {
          editCoursePickerState.selectedMonths.add(mKey);
        }
      }
      renderEditCourseMonthGrid();
      updateEditCourseMultiMonthPreview();
      showToast(`Selected all upcoming months for ${editCoursePickerState.viewYear}.`, 'info');
    };
  }

  const clearBtn = document.getElementById('editCourseClearSelection');
  if (clearBtn) {
    clearBtn.onclick = () => {
      editCoursePickerState.selectedMonths.clear();
      renderEditCourseMonthGrid();
      updateEditCourseMultiMonthPreview();
    };
  }

  const btnMultiMonth = document.getElementById('btnEditCourseModeMultiMonth');
  const btnDateMonthYear = document.getElementById('btnEditCourseModeDateMonthYear');
  if (btnMultiMonth) {
    btnMultiMonth.onclick = () => switchEditCourseScheduleMode('multi-month');
  }
  if (btnDateMonthYear) {
    btnDateMonthYear.onclick = () => switchEditCourseScheduleMode('date-month-year');
  }

  initEditCourseDateMonthYearPicker();
  switchEditCourseScheduleMode('multi-month');
  renderEditCourseYearQuickPills();
  renderEditCourseMonthGrid();
  updateEditCourseMultiMonthPreview();
}

function syncEditCourseYearControl() {
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById('editCourseYearSelect');
  if (yearSelect) yearSelect.value = editCoursePickerState.viewYear;
  const prevBtn = document.getElementById('editCoursePrevYear');
  if (prevBtn) prevBtn.disabled = editCoursePickerState.viewYear <= currentYear;
  renderEditCourseYearQuickPills();
  renderEditCourseMonthGrid();
}

function renderEditCourseYearQuickPills() {
  const container = document.getElementById('editCourseYearQuickPills');
  if (!container) return;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  container.innerHTML = years.map(y => `
    <button type="button" class="tc-year-pill ${editCoursePickerState.viewYear === y ? 'active' : ''}" onclick="selectEditCourseYear(${y})">${y}</button>
  `).join('');
}

function selectEditCourseYear(year) {
  editCoursePickerState.viewYear = year;
  syncEditCourseYearControl();
}

function switchEditCourseScheduleMode(mode) {
  editCoursePickerState.mode = mode;
  const btnMulti = document.getElementById('btnEditCourseModeMultiMonth');
  const btnDMY = document.getElementById('btnEditCourseModeDateMonthYear');
  const viewMulti = document.getElementById('editCourseMultiMonthView');
  const viewDMY = document.getElementById('editCourseDateMonthYearView');

  if (mode === 'date-month-year') {
    if (btnMulti) btnMulti.classList.remove('active');
    if (btnDMY) btnDMY.classList.add('active');
    if (viewMulti) viewMulti.style.display = 'none';
    if (viewDMY) viewDMY.style.display = 'flex';
    validateEditCourseDateMonthYearSelection();
  } else {
    if (btnMulti) btnMulti.classList.add('active');
    if (btnDMY) btnDMY.classList.remove('active');
    if (viewMulti) viewMulti.style.display = 'block';
    if (viewDMY) viewDMY.style.display = 'none';
    updateEditCourseMultiMonthPreview();
  }
}

function initEditCourseDateMonthYearPicker() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('editCourseScheduleYear');
  const monthSelect = document.getElementById('editCourseScheduleMonth');
  const daySelect = document.getElementById('editCourseScheduleDay');

  if (yearSelect && yearSelect.options.length === 0) {
    for (let y = currentYear; y <= currentYear + 4; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} ${y === currentYear ? '(Current Year)' : ''}`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = currentYear;
  }

  if (monthSelect && monthSelect.options.length === 0) {
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MONTH_NAMES[m - 1]} (${String(m).padStart(2, '0')})`;
      monthSelect.appendChild(opt);
    }
    monthSelect.value = currentMonth;
  }

  if (yearSelect) yearSelect.onchange = updateEditCourseDaysList;
  if (monthSelect) monthSelect.onchange = updateEditCourseDaysList;
  if (daySelect) daySelect.onchange = validateEditCourseDateMonthYearSelection;

  updateEditCourseDaysList();
}

function updateEditCourseDaysList() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const yearSelect = document.getElementById('editCourseScheduleYear');
  const monthSelect = document.getElementById('editCourseScheduleMonth');
  const daySelect = document.getElementById('editCourseScheduleDay');
  if (!daySelect || !yearSelect || !monthSelect) return;

  const y = parseInt(yearSelect.value, 10) || currentYear;
  const m = parseInt(monthSelect.value, 10) || currentMonth;
  const totalDays = getDaysInMonth(y, m);
  const prevDay = parseInt(daySelect.value, 10) || currentDay;

  daySelect.innerHTML = '';
  for (let d = 1; d <= totalDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `Day ${d}`;
    daySelect.appendChild(opt);
  }
  daySelect.value = Math.min(prevDay, totalDays);
  validateEditCourseDateMonthYearSelection();
}

function validateEditCourseDateMonthYearSelection() {
  const yearSelect = document.getElementById('editCourseScheduleYear');
  const monthSelect = document.getElementById('editCourseScheduleMonth');
  const daySelect = document.getElementById('editCourseScheduleDay');
  if (!yearSelect || !monthSelect || !daySelect) return;

  const y = parseInt(yearSelect.value, 10);
  const m = parseInt(monthSelect.value, 10);
  const d = parseInt(daySelect.value, 10);

  const isPassed = isMonthInPast(y, m);
  const notice = document.getElementById('editCourseDatePassedNotice');
  const badge = document.getElementById('editCourseMultiMonthBadge');
  const hiddenInput = document.getElementById('editCourseInputBatchSchedule');

  if (notice) {
    if (isPassed) {
      notice.style.display = 'block';
      notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Date Expired:</strong> ${MONTH_NAMES[m - 1]} ${y} has already passed in the current year. Please pick an upcoming month.`;
    } else {
      const today = new Date();
      if (y === today.getFullYear() && m === (today.getMonth() + 1) && d < today.getDate()) {
        notice.style.display = 'block';
        notice.innerHTML = `<iconify-icon icon="solar:danger-triangle-bold" style="vertical-align: -2px; font-size: 14px;"></iconify-icon> <strong>Day Passed:</strong> Day ${d} of this month has already passed in the current year. Please select a current or future day.`;
      } else {
        notice.style.display = 'none';
      }
    }
  }

  if (editCoursePickerState.mode === 'date-month-year') {
    const mName = MONTH_SHORT[m - 1] || '';
    if (badge) {
      badge.textContent = `Schedule: ${mName} ${d}, ${y}`;
      badge.style.background = isPassed ? '#fee2e2' : '#dcfce7';
      badge.style.color = isPassed ? '#b91c1c' : '#15803d';
    }
    if (hiddenInput) {
      hiddenInput.value = `${MONTH_NAMES[m - 1]} ${d}, ${y} (1 Month Batch: 1st Week to Last Week)`;
    }
  }
}

function renderEditCourseMonthGrid() {
  const container = document.getElementById('editCourseMonthGrid');
  if (!container) return;

  const yr = editCoursePickerState.viewYear;
  let html = '';

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${yr}-${String(m).padStart(2, '0')}`;
    const isPassed = isMonthInPast(yr, m);
    const isSelected = editCoursePickerState.selectedMonths.has(monthKey);
    const shortName = MONTH_SHORT[m - 1];
    const fullName = MONTH_NAMES[m - 1];

    if (isPassed) {
      html += `
        <div class="tc-month-btn is-passed" title="${escapeHtml(fullName)} ${yr} has already passed."
             onclick="handlePassedMonthClick('${escapeHtml(fullName)}', ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub"><iconify-icon icon="solar:lock-bold" style="font-size:10px; vertical-align:-1px;"></iconify-icon> Passed</span>
        </div>
      `;
    } else {
      html += `
        <div class="tc-month-btn ${isSelected ? 'selected' : ''}" 
             onclick="toggleEditCourseMonthSelection('${monthKey}')"
             title="${isSelected ? 'Click to unselect' : 'Click to select 1-month batch'} (${fullName} ${yr})">
          <span class="tc-month-name">${shortName}</span>
          <span class="tc-month-sub">${isSelected ? '✓ 1-Month' : 'Available'}</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function toggleEditCourseMonthSelection(monthKey) {
  if (editCoursePickerState.selectedMonths.has(monthKey)) {
    editCoursePickerState.selectedMonths.delete(monthKey);
  } else {
    editCoursePickerState.selectedMonths.add(monthKey);
  }
  renderEditCourseMonthGrid();
  updateEditCourseMultiMonthPreview();
}

function updateEditCourseMultiMonthPreview() {
  const badge = document.getElementById('editCourseMultiMonthBadge');
  const hiddenInput = document.getElementById('editCourseInputBatchSchedule');
  const selectedArr = Array.from(editCoursePickerState.selectedMonths).sort();
  const count = selectedArr.length;

  if (editCoursePickerState.mode === 'multi-month') {
    if (badge) {
      badge.textContent = `${count} month${count === 1 ? '' : 's'} selected`;
      badge.style.background = count >= 2 ? '#dcfce7' : count === 1 ? '#fef3c7' : '#e0f2fe';
      badge.style.color = count >= 2 ? '#15803d' : count === 1 ? '#b45309' : '#0369a1';
    }
    if (hiddenInput) {
      hiddenInput.value = count > 0 
        ? selectedArr.map(m => computeMonthSchedule(m).monthName).join(', ') + ' (1 Month Each: 1st Week to Last Week)'
        : '';
    }
  }
}

// CRITICAL REQUIREMENT: if the date from the previous month has already passed, do not open it when clicking on a schedule for a month in the current year.
function handleScheduleCardClick(bookingId, isPassed, monthName, year) {
  if (isPassed && !isHeadOrAdminRole()) {
    showToast(`Cannot open schedule: The training schedule for ${monthName || 'this month'} ${year || ''} has already passed and is closed.`, 'warning');
    return;
  }
  openBatchDetailsModal(bookingId);
}

function openBatchDetailsModal(bookingId) {
  const batchRecord = (currentLoadedBatches || []).find(item => String(item.id) === String(bookingId));
  if (batchRecord) {
    currentActiveTrainingBatchId = String(batchRecord.id);
    const modal = document.getElementById('batchDetailsModal');
    if (!modal) return;
    const roster = (currentLoadedBookings || []).filter(item => String(item.training_batch_id || '') === String(batchRecord.id));
    const activeRoster = roster.filter(item => !['cancelled', 'withdrawn', 'rejected'].includes(String(item.training_status || '').toLowerCase()) && item.payment_status !== 'cancelled');
    const seatCount = activeRoster.reduce((sum, item) => sum + Math.max(1, Number(item.participants) || 1), 0);
    const putText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    putText('batchDetailsCode', `#${batchRecord.batch_code}`);
    putText('batchDetailsMonthTitle', `Batch: ${batchRecord.start_date} – ${batchRecord.end_date}`);
    putText('batchDetailsStart', batchRecord.start_date);
    putText('batchDetailsEnd', batchRecord.end_date);
    putText('batchDetailsScheduleTime', batchRecord.requested_time || '');
    putText('batchDetailsTimePill', 'Class time');
    putText('batchDetailsSessionsText', batchRecord.session_schedule || batchRecord.requested_day || '');
    putText('batchDetailsSessionsPill', batchRecord.requested_day || '');
    putText('batchDetailsSessionsDay', batchRecord.requested_day || '');
    putText('batchDetailsOrg', activeTrainingCourse?.name || 'Course batch');
    putText('batchDetailsCourse', activeTrainingCourse?.name || 'Selected course');
    putText('batchDetailsTime', batchRecord.requested_time || '');
    putText('batchDetailsVenue', batchRecord.venue || '');
    putText('batchDetailsTrainer', batchRecord.assigned_trainer_id || 'Unassigned');
    const paidSeats = activeRoster.filter(item => item.payment_status === 'paid').reduce((sum, item) => sum + Math.max(1, Number(item.participants) || 1), 0);
    putText('batchDetailsCapacityCount', `${seatCount} seats reserved · ${paidSeats} enrolled · ${batchRecord.capacity} max`);
    ['batchDetailsBatchPaymentRow', 'batchDetailsBatchPaymentRefRow', 'batchDetailsBatchPaymentIdRow', 'batchDetailsPaymentPicRow', 'batchDetailsPaymentActions', 'batchDetailsLegacyStudentRow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const rosterEl = document.getElementById('batchDetailsCapacity');
    if (rosterEl) rosterEl.innerHTML = roster.length ? roster.map(student => {
      const isPaid = student.payment_status === 'paid';
      const isCancelled = student.payment_status === 'cancelled' || String(student.training_status || '').toLowerCase() === 'cancelled';
      const enrollmentLabel = isCancelled ? 'DECLINED' : (isPaid ? 'ENROLLED' : 'AWAITING PAYMENT CONFIRMATION');
      const receiptUrl = student.payment_receipt_upload_path || student.paymongo_receipt_url || '';
      const payId = student.paymongo_payment_id || student.paymongo_checkout_session_id || '';
      const receiptPreview = student.payment_receipt_upload_path
        ? `<a class="tc-batch-receipt-preview" href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer" title="Open payment picture"><img src="${escapeHtml(student.payment_receipt_upload_path)}" alt="Payment picture from ${escapeHtml(student.contact_name || 'student')}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span style="display:none">Open receipt</span></a>`
        : `<span class="tc-batch-no-receipt">No payment picture uploaded</span>`;
      const reviewActions = isHeadOrAdminRole() && !isPaid && !isCancelled
        ? `<button class="tc-roster-payment-btn is-confirm" type="button" onclick="updateBookingPayment('${escapeHtml(student.id)}','paid')"><iconify-icon icon="solar:check-circle-bold"></iconify-icon><span>Confirm</span></button><button class="tc-roster-payment-btn is-decline" type="button" onclick="declineTrainingBooking('${escapeHtml(student.id)}')"><iconify-icon icon="solar:close-circle-bold"></iconify-icon><span>Decline</span></button>`
        : `<span class="tc-batch-review-status ${isPaid ? 'is-enrolled' : 'is-declined'}">${isPaid ? 'Enrolled' : 'Declined'}</span>`;
      const viewReceiptAction = receiptUrl
        ? `<a class="tc-roster-payment-btn is-view" href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer"><iconify-icon icon="solar:gallery-wide-bold"></iconify-icon><span>View payment picture</span></a>`
        : `<button class="tc-roster-payment-btn is-view" type="button" disabled title="No payment picture was uploaded"><iconify-icon icon="solar:gallery-wide-bold"></iconify-icon><span>No picture</span></button>`;
      return `<article class="tc-batch-student-row"><div class="tc-batch-student-actions">${reviewActions}${viewReceiptAction}</div><div class="tc-batch-student-info"><strong>${escapeHtml(student.contact_name || student.organization || 'Applicant')}</strong><span>${escapeHtml(student.email || 'No email')} · ${escapeHtml(student.phone || 'No phone')}</span><span class="tc-batch-payment-status ${isPaid ? 'is-paid' : (isCancelled ? 'is-cancelled' : 'is-pending')}">${enrollmentLabel} · Payment ${escapeHtml(String(student.payment_status || 'pending').toUpperCase())}</span><dl><div><dt>Payment reference</dt><dd>${escapeHtml(student.payment_reference || 'Not provided')}</dd></div><div><dt>Payment ID</dt><dd>${escapeHtml(payId || 'Not available')}</dd></div><div><dt>Amount</dt><dd>₱${Number(student.total_php || 0).toLocaleString()}</dd></div></dl></div><div class="tc-batch-student-proof">${receiptPreview}</div></article>`;
    }).join('') : '<span style="font-size:12px;color:#64748b">No student applications have been linked to this batch yet.</span>';
    const payment = document.getElementById('batchDetailsPayment');
    if (payment) payment.textContent = 'Payment is tracked per enrolled student.';
    const paymentActions = document.getElementById('batchDetailsPaymentActions');
    if (paymentActions) paymentActions.style.display = 'none';
    putText('batchDetailsPaymentReference', '');
    putText('batchDetailsPaymentId', '');
    currentActiveBookingInModal = null;
    modal.style.display = 'flex';
    return;
  }
  const b = currentLoadedBookings.find(item => String(item.id) === String(bookingId));
  if (!b) return;

  const [bYr, bMo] = (b.requested_date || '').split('-').map(Number);
  if (isBatchScheduleFinished(b) && !isHeadOrAdminRole()) {
    const monthName = b.requested_date ? new Date(bYr, bMo - 1, 1).toLocaleString('en-US', { month: 'long' }) : '';
    showToast(`Cannot open schedule: The training schedule for ${monthName || 'this month'} ${bYr || ''} has already passed in the current year.`, 'warning');
    return;
  }

  const modal = document.getElementById('batchDetailsModal');
  if (!modal) return;

  const sched = computeMonthSchedule(b.requested_date?.slice(0, 7));

  const codeEl = document.getElementById('batchDetailsCode');
  if (codeEl) codeEl.textContent = `#${b.booking_code || 'BATCH-0000'}`;

  const titleEl = document.getElementById('batchDetailsMonthTitle');
  if (titleEl) titleEl.textContent = `Batch Schedule: ${b.requested_date}${b.end_date ? ` – ${String(b.end_date).slice(0, 10)}` : ` (${sched.monthName})`}`;

  const statusBadge = document.getElementById('batchDetailsScheduleStatusBadge');
  if (statusBadge) {
    const isFinished = isBatchScheduleFinished(b);
    if (isFinished) {
      statusBadge.style.background = '#dcfce7';
      statusBadge.style.color = '#15803d';
      statusBadge.style.border = '1px solid #86efac';
      statusBadge.innerHTML = '<iconify-icon icon="solar:check-circle-bold" style="font-size: 12px;"></iconify-icon> Done Training';
    } else {
      statusBadge.style.background = '#dbeafe';
      statusBadge.style.color = '#1e40af';
      statusBadge.style.border = '1px solid #bfdbfe';
      statusBadge.innerHTML = '<iconify-icon icon="solar:clock-circle-bold" style="font-size: 12px;"></iconify-icon> On Going Schedule';
    }
  }

  const startEl = document.getElementById('batchDetailsStart');
  if (startEl) startEl.textContent = b.requested_date || sched.startText;

  const endEl = document.getElementById('batchDetailsEnd');
  if (endEl) endEl.textContent = b.end_date ? String(b.end_date).slice(0, 10) : sched.endText;

  // Training Time Display (Clean 07:00 A.M - 11:00 A.M Morning vs 01:00 P.M - 5:00 P.M Noon)
  const rawTime = b.requested_time || activeTrainingCourse?.training_time || '07:00 A.M - 11:00 A.M';
  const isNoon = String(rawTime).includes('01:00') || String(rawTime).toLowerCase().includes('noon') || String(rawTime).toLowerCase().includes('pm') || String(rawTime).includes('5:00');
  const formattedTime = isNoon ? '01:00 P.M - 5:00 P.M' : '07:00 A.M - 11:00 A.M';
  const sessionTag = isNoon ? 'Noon Session' : 'Morning Session';

  const schedTimeEl = document.getElementById('batchDetailsScheduleTime');
  if (schedTimeEl) schedTimeEl.textContent = formattedTime;

  const timePillEl = document.getElementById('batchDetailsTimePill');
  if (timePillEl) {
    timePillEl.textContent = sessionTag;
    if (isNoon) {
      timePillEl.style.background = '#fef3c7';
      timePillEl.style.color = '#92400e';
      timePillEl.style.border = '1px solid #fde68a';
    } else {
      timePillEl.style.background = '#e0f2fe';
      timePillEl.style.color = '#0369a1';
      timePillEl.style.border = '1px solid #bae6fd';
    }
  }

  // Session & Day Schedule Display
  const sessTextEl = document.getElementById('batchDetailsSessionsText');
  const sessPillEl = document.getElementById('batchDetailsSessionsPill');
  const sessDayEl = document.getElementById('batchDetailsSessionsDay');
  const schedSess = b.session_schedule || activeTrainingCourse?.session_schedule || '1 per week on Saturday in 1 month (4 Sessions)';

  if (sessTextEl) {
    sessTextEl.textContent = schedSess;
  }
  if (sessPillEl) {
    sessPillEl.textContent = schedSess.includes('8') ? '8 Sessions Total' : '4 Sessions Total';
  }
  if (sessDayEl) {
    const sLower = schedSess.toLowerCase();
    if (sLower.includes('monday')) {
      sessDayEl.textContent = 'Every Monday (1 session / week)';
    } else if (sLower.includes('wednesday')) {
      sessDayEl.textContent = 'Every Wednesday (1 session / week)';
    } else if (sLower.includes('sunday')) {
      sessDayEl.textContent = 'Every Sunday (1 session / week)';
    } else {
      sessDayEl.textContent = 'Every Saturday (1 session / week)';
    }
  }

  const orgEl = document.getElementById('batchDetailsOrg');
  if (orgEl) orgEl.textContent = b.organization || b.contact_name || 'N/A';

  const courseEl = document.getElementById('batchDetailsCourse');
  if (courseEl) courseEl.textContent = activeTrainingCourse ? activeTrainingCourse.name : 'Selected Course';

  const timeEl = document.getElementById('batchDetailsTime');
  if (timeEl) timeEl.textContent = formattedTime;

  const venueEl = document.getElementById('batchDetailsVenue');
  if (venueEl) venueEl.textContent = b.venue || 'UMak Campus';

  // Participants: Display all registered students' names on the specific training course
  const capEl = document.getElementById('batchDetailsCapacity');
  const capCountEl = document.getElementById('batchDetailsCapacityCount');
  const courseStudentNames = (currentLoadedBookings && currentLoadedBookings.length > 0)
    ? [...new Set(currentLoadedBookings.map(item => String(item.contact_name || '').trim()).filter(Boolean))]
    : (b.contact_name ? [String(b.contact_name).trim()] : []);

  if (capCountEl) {
    capCountEl.textContent = `${courseStudentNames.length} Registered Student${courseStudentNames.length === 1 ? '' : 's'}`;
  }

  if (capEl) {
    if (courseStudentNames.length > 0) {
      capEl.innerHTML = courseStudentNames.map(name => `
        <span class="tc-student-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #ffffff; color: #0f172a; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <iconify-icon icon="solar:user-bold" style="font-size: 12px; color: #0284c7;"></iconify-icon>
          ${escapeHtml(name)}
        </span>
      `).join('');
    } else {
      capEl.innerHTML = `<span style="font-size: 11px; color: #94a3b8; font-style: italic;">This course has no enrolled students.</span>`;
    }
  }

  currentActiveBookingInModal = b;

  const trainerEl = document.getElementById('batchDetailsTrainer');
  if (trainerEl) trainerEl.textContent = b.assigned_trainer_id ? `${b.assigned_trainer_id}` : 'Unassigned';

  const paymentEl = document.getElementById('batchDetailsPayment');
  if (paymentEl) {
    const isPaid = b.payment_status === 'paid';
    const statusLabel = isPaid ? 'PAID' : (b.payment_status === 'pending' || !b.payment_status ? 'NO PAYMENT' : b.payment_status.toUpperCase());
    paymentEl.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; ${isPaid ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;'}">
        <iconify-icon icon="${isPaid ? 'solar:check-circle-bold' : 'solar:danger-circle-bold'}" style="font-size: 14px;"></iconify-icon>
        ${statusLabel} &bull; ₱${Number(b.total_php || 0).toLocaleString()}
      </span>
    `;
  }

  // Handle PAID and No Payment buttons inside batchDetailsModal for admin verification
  const isHeadOrAdmin = isHeadOrAdminRole();
  const paymentActionsEl = document.getElementById('batchDetailsPaymentActions');
  if (paymentActionsEl) {
    paymentActionsEl.style.display = isHeadOrAdmin ? 'flex' : 'none';
  }
  updateModalPaymentButtons(b.payment_status);

  // Populate Payment Reference from database (b.payment_reference)
  const paymentRefEl = document.getElementById('batchDetailsPaymentReference');
  if (paymentRefEl) {
    const payRef = b.payment_reference || 'N/A';
    paymentRefEl.textContent = payRef;
    paymentRefEl.title = payRef;
  }

  // Populate Payment ID below Payment Reference
  const paymentIdEl = document.getElementById('batchDetailsPaymentId');
  if (paymentIdEl) {
    const payId = b.paymongo_payment_id || b.paymongo_checkout_session_id || 'N/A';
    paymentIdEl.textContent = payId;
    paymentIdEl.title = payId;
  }

  // Populate Payment Picture (Student proof of payment / receipt) below Payment ID
  const picStatusEl = document.getElementById('batchDetailsPaymentPicStatus');
  const picContainerEl = document.getElementById('batchDetailsPaymentPicContainer');
  if (picContainerEl) {
    const receiptUrl = b.payment_receipt_upload_path || b.paymongo_receipt_url || '';
    if (receiptUrl) {
      if (picStatusEl) picStatusEl.innerHTML = `<span style="color: #15803d; font-weight: 600;">✓ Receipt Attached</span>`;
      picContainerEl.innerHTML = `
        <a href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; max-width: 100%; text-decoration: none;" title="Click to view full image in new tab">
          <img src="${escapeHtml(receiptUrl)}" alt="Proof of Payment" style="max-width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; display: block; margin: 0 auto;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'font-size:12px; color:#b91c1c; text-align:center; padding:10px;\\'>Failed to preview image.<br><a href=\\x22${escapeHtml(receiptUrl)}\\x22 target=\\x22_blank\\x22 style=\\x22color:#0284c7; text-decoration:underline;\\x22>Open payment link</a></div>';" />
        </a>
        <div style="display: flex; gap: 8px; align-items: center; justify-content: center; width: 100%; margin-top: 4px;">
          <a href="${escapeHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #0284c7; font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">
            <iconify-icon icon="solar:arrow-right-up-linear"></iconify-icon> View Full Receipt
          </a>
        </div>
      `;
    } else {
      if (picStatusEl) picStatusEl.innerHTML = `<span style="color: #94a3b8; font-style: italic;">None</span>`;
      picContainerEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #94a3b8; padding: 12px 0;">
          <iconify-icon icon="solar:gallery-wide-linear" style="font-size: 28px;"></iconify-icon>
          <span style="font-size: 12px;">No payment picture / receipt uploaded for this student</span>
        </div>
      `;
    }
  }

  const coordEl = document.getElementById('batchDetailsCoordinator');
  if (coordEl) coordEl.textContent = `${b.contact_name || 'N/A'} • ${b.phone || 'No phone'} • ${b.email || 'No email'}`;

  const notesEl = document.getElementById('batchDetailsNotes');
  if (notesEl) notesEl.textContent = b.notes || 'No notes provided.';

  modal.style.display = 'flex';
}

let currentActiveBookingInModal = null;

function updateModalPaymentButtons(status) {
  const isPaid = status === 'paid';
  const btnPaid = document.getElementById('btnBatchDetailsPaid');
  const btnNoPay = document.getElementById('btnBatchDetailsNoPayment');
  const indicatorEl = document.getElementById('batchDetailsPaymentActiveIndicator');

  if (btnPaid) {
    if (isPaid) {
      btnPaid.style.background = '#15803d';
      btnPaid.style.color = '#ffffff';
      btnPaid.style.border = '2px solid #166534';
      btnPaid.style.boxShadow = '0 2px 4px rgba(21, 128, 61, 0.2)';
      btnPaid.innerHTML = `<iconify-icon icon="solar:check-circle-bold" style="font-size: 16px;"></iconify-icon><span>✓ Verified as PAID</span>`;
    } else {
      btnPaid.style.background = '#ffffff';
      btnPaid.style.color = '#15803d';
      btnPaid.style.border = '1px solid #86efac';
      btnPaid.style.boxShadow = 'none';
      btnPaid.innerHTML = `<iconify-icon icon="solar:check-circle-bold" style="font-size: 16px;"></iconify-icon><span>Mark as PAID</span>`;
    }
  }

  if (btnNoPay) {
    if (!isPaid) {
      btnNoPay.style.background = '#dc2626';
      btnNoPay.style.color = '#ffffff';
      btnNoPay.style.border = '2px solid #991b1b';
      btnNoPay.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.2)';
      btnNoPay.innerHTML = `<iconify-icon icon="solar:close-circle-bold" style="font-size: 16px;"></iconify-icon><span>✕ Marked as No Payment</span>`;
    } else {
      btnNoPay.style.background = '#ffffff';
      btnNoPay.style.color = '#dc2626';
      btnNoPay.style.border = '1px solid #fca5a5';
      btnNoPay.style.boxShadow = 'none';
      btnNoPay.innerHTML = `<iconify-icon icon="solar:close-circle-bold" style="font-size: 16px;"></iconify-icon><span>Mark as No Payment</span>`;
    }
  }

  if (indicatorEl) {
    if (isPaid) {
      indicatorEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:#15803d; font-weight:600;"><iconify-icon icon="solar:shield-check-bold"></iconify-icon> Current Status: Verified &amp; Confirmed (PAID)</span>`;
    } else {
      indicatorEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:#b45309; font-weight:600;"><iconify-icon icon="solar:shield-warning-bold"></iconify-icon> Current Status: Awaiting Payment Verification (No Payment)</span>`;
    }
  }
}

async function setBookingPaymentFromModal(status) {
  if (!isHeadOrAdminRole()) {
    showToast('Only HEAD and System Admin accounts can update payment verification status.', 'warning');
    return;
  }
  if (!currentActiveBookingInModal) return;

  const bId = currentActiveBookingInModal.id;
  await updateBookingPayment(bId, status);

  currentActiveBookingInModal.payment_status = status;
  const isPaid = status === 'paid';
  const paymentEl = document.getElementById('batchDetailsPayment');
  if (paymentEl) {
    const statusLabel = isPaid ? 'PAID' : 'NO PAYMENT';
    paymentEl.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; ${isPaid ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;'}">
        <iconify-icon icon="${isPaid ? 'solar:check-circle-bold' : 'solar:danger-circle-bold'}" style="font-size: 14px;"></iconify-icon>
        ${statusLabel} &bull; ₱${Number(currentActiveBookingInModal.total_php || 0).toLocaleString()}
      </span>
    `;
  }
  updateModalPaymentButtons(status);
}

function showTrainingEmptyState() {
  activeTrainingCourse = null;
  const emptyState = document.getElementById('tcEmptyState');
  const activeView = document.getElementById('tcActiveCourseView');
  const addBatchButton = document.getElementById('btnAddSchedule');
  if (emptyState) emptyState.style.display = 'flex';
  if (activeView) activeView.style.display = 'none';
  if (addBatchButton) addBatchButton.style.display = 'none';
}

async function selectTrainingCourse(courseId) {
  const course = allTrainingCourses.find(c => c.id === courseId);
  if (!course) return;

  activeTrainingCourse = course;

  // Highlight selected in left list
  document.querySelectorAll('.tc-course-item').forEach(el => {
    el.style.background = el.dataset.id === courseId ? '#f1f5f9' : '#ffffff';
    el.style.borderColor = el.dataset.id === courseId ? '#0f172a' : '#e2e8f0';
  });

  const emptyState = document.getElementById('tcEmptyState');
  const activeView = document.getElementById('tcActiveCourseView');
  if (emptyState) emptyState.style.display = 'none';
  if (activeView) activeView.style.display = 'flex';

  // Ensure action buttons respect Trainer role
  const isTrainer = isTrainerRole();
  const btnEditCourse = document.getElementById('btnEditCourse');
  const btnDeleteCourse = document.getElementById('btnDeleteCourse');
  const btnAddSchedule = document.getElementById('btnAddSchedule');
  const courseManagementActions = document.querySelector('.tc-course-management-actions');
  if (btnEditCourse) {
    btnEditCourse.style.display = isTrainer ? 'none' : '';
    btnEditCourse.disabled = false;
    btnEditCourse.onclick = openEditCourseModal;
  }
  if (btnDeleteCourse) {
    btnDeleteCourse.style.display = isTrainer ? 'none' : '';
    btnDeleteCourse.disabled = false;
    btnDeleteCourse.onclick = deleteActiveCourse;
  }
  if (courseManagementActions) courseManagementActions.style.display = isTrainer ? 'none' : '';
  if (btnAddSchedule) {
    btnAddSchedule.style.display = isTrainer ? 'none' : '';
    btnAddSchedule.disabled = false;
    btnAddSchedule.onclick = openAddBatchModal;
  }

  renderActiveCourseHeader(course);

  // Fetch Bookings & Batches for this Course
  await loadCourseBookings(course.id);
}

async function loadCourseBookings(courseId) {
  const container = document.getElementById('tcSchedulesList');
  if (!container) return;

  const headingTextEl = document.getElementById('tcSchedulesHeadingText');
  const headingIconEl = document.getElementById('tcSchedulesHeadingIcon');
  const isTrainer = isTrainerRole();

  if (isTrainer) {
    if (headingTextEl) headingTextEl.textContent = 'Registered Students';
    if (headingIconEl) {
      headingIconEl.setAttribute('icon', 'solar:users-group-rounded-bold-duotone');
      headingIconEl.style.color = '#0284c7';
    }
  } else {
    if (headingTextEl) headingTextEl.textContent = 'Batches & Schedules';
    if (headingIconEl) {
      headingIconEl.setAttribute('icon', 'solar:calendar-bold-duotone');
      headingIconEl.style.color = '#64748b';
    }
  }

  container.innerHTML = '<div style="text-align:center; padding: 20px; color:#64748b; font-size:12px;">Loading records...</div>';

  try {
    const res = await fetch(`/api/training/bookings?course_id=${encodeURIComponent(courseId)}`);
    const data = await res.json();
    const bookings = data.bookings || [];
    currentLoadedBookings = bookings;
    currentLoadedBatches = data.batches || [];

    // A cohort schedule is its own record. Student bookings are shown only in
    // the roster for the batch they are linked to.
    if (!isTrainer) {
      const batches = currentLoadedBatches;
      if (!batches.length) {
        container.innerHTML = '<div style="border:2px dashed #cbd5e1;border-radius:10px;padding:24px;text-align:center;color:#64748b">No batches yet. Create a batch schedule to open enrollment.</div>';
        return;
      }
      container.innerHTML = batches.map(batch => {
        const linked = bookings.filter(item => String(item.training_batch_id || '') === String(batch.id));
        const reserved = linked.filter(item => item.payment_status !== 'cancelled' && !['cancelled', 'withdrawn', 'rejected'].includes(String(item.training_status || '').toLowerCase())).reduce((sum, item) => sum + Math.max(1, Number(item.participants) || 1), 0);
        const enrolled = linked.filter(item => item.payment_status === 'paid').reduce((sum, item) => sum + Math.max(1, Number(item.participants) || 1), 0);
        return `<article style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap"><div><strong>${escapeHtml(batch.batch_code)}</strong><div style="margin-top:7px;color:#334155">${escapeHtml(batch.start_date)} – ${escapeHtml(batch.end_date)}</div><small style="color:#64748b">${escapeHtml(batch.requested_day)} · ${escapeHtml(batch.requested_time)} · ${escapeHtml(batch.venue || '')}</small><div style="margin-top:5px;font-size:12px;color:#0369a1">${reserved} / ${Number(batch.capacity || 0)} seats reserved · ${enrolled} enrolled · Trainer: ${escapeHtml(batch.assigned_trainer_id || 'Unassigned')}</div></div><button type="button" class="filter-btn" onclick="openBatchDetailsModal('${escapeHtml(batch.id)}')">View roster & payments</button></article>`;
      }).join('');
      return;
    }

    if (bookings.length === 0) {
      if (isTrainer) {
        container.innerHTML = `
          <div style="border: 2px dashed #cbd5e1; border-radius: 10px; padding: 32px; text-align: center; color: #64748b;">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone" width="36" height="36" style="color:#94a3b8;"></iconify-icon>
            <p style="margin: 8px 0 0; font-size: 13px;">No registered students found for this course library yet.</p>
          </div>
        `;
        return;
      }

      const c = activeTrainingCourse;
      const daysStr = (Array.isArray(c?.available_days) && c.available_days.length > 0) ? c.available_days.join(', ') : 'Monday, Wednesday, Saturday';
      let timesStr = c?.training_time || '07:00 A.M - 11:00 A.M';
      if (Array.isArray(c?.available_times) && c.available_times.length > 1) {
        timesStr = 'AM & PM Classes (07:00 AM - 11:00 AM / 01:00 PM - 5:00 PM)';
      }
      const monthsStr = (Array.isArray(c?.available_months) && c.available_months.length > 0)
        ? c.available_months.map(m => computeMonthSchedule(m).monthName).join(', ')
        : (c?.batch_schedule || 'Monthly Batches (1st Week to Last Week)');
      const trainerStr = c?.assigned_trainer || 'Unassigned Trainer';

      container.innerHTML = `
        <div style="background: #ffffff; border: 1px solid #bae6fd; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; display: inline-flex; align-items: center; gap: 4px;">
                <iconify-icon icon="solar:check-circle-bold" style="font-size: 13px;"></iconify-icon> Open for Student Enrollment
              </span>
            </div>
            <span style="font-size: 11px; color: #0284c7; font-weight: 600;">Active Course Batch Schedule</span>
          </div>

          <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px; padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 12px;">
            <div>
              <strong style="color: #475569;">Batch Month(s):</strong><br>
              <span style="color: #0f172a; font-weight: 600;">${escapeHtml(monthsStr)}</span>
            </div>
            <div>
              <strong style="color: #475569;">Offered Session Days:</strong><br>
              <span style="color: #0284c7; font-weight: 600;">${escapeHtml(daysStr)}</span>
            </div>
            <div>
              <strong style="color: #475569;">Offered Class Times:</strong><br>
              <span style="color: #b45309; font-weight: 600;">${escapeHtml(timesStr)}</span>
            </div>
            <div>
              <strong style="color: #475569;">Assigned Trainer:</strong><br>
              <span style="color: #0f172a; font-weight: 600;">${escapeHtml(trainerStr)}</span>
            </div>
          </div>
        </div>

        <div style="border: 2px dashed #cbd5e1; border-radius: 10px; padding: 24px; text-align: center; color: #64748b;">
          <iconify-icon icon="solar:users-group-rounded-bold-duotone" width="32" height="32" style="color:#94a3b8;"></iconify-icon>
          <p style="margin: 8px 0 0; font-size: 13px; font-weight: 500;">This course has no enrolled students.</p>
          <small style="color: #94a3b8; display: block; margin-top: 4px; font-size: 11.5px;">
            Batches are active. Students can enroll via mobile, or you can register walk-in students using <strong>+ Add Batch Schedule</strong>.
          </small>
        </div>
      `;
      return;
    }

    // TRAINER ROLE: Render Registered Students Roster
    if (isTrainer) {
      container.innerHTML = bookings.map(b => {
        const studentName = b.contact_name || 'Enrolled Student';

        // Student avatar initials
        const nameParts = studentName.trim().split(/\s+/);
        const initials = nameParts.length > 1
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : studentName.slice(0, 2).toUpperCase();

        return `
          <div class="tc-student-card" 
               id="tc-student-card-${escapeHtml(b.id)}"
               style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s ease;">
            
            <!-- Student Header: Avatar & Name -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px; min-width: 200px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; border: 1px solid #bae6fd; flex-shrink: 0;">
                  ${escapeHtml(initials)}
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <strong style="font-size: 15px; color: #0f172a;" class="tc-student-name">${escapeHtml(studentName)}</strong>
                    <span style="font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600;">#${escapeHtml(b.booking_code || b.id.slice(0, 8))}</span>
                  </div>
                  <small style="color: #64748b; display: block; margin-top: 2px;">
                    ${escapeHtml(b.email || 'No email')} &bull; ${escapeHtml(b.phone || 'No phone')}
                  </small>
                </div>
              </div>
            </div>

            <!-- Student Registration Meta Details -->
            <div class="tc-student-meta-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 12px; border: 1px solid #f1f5f9;">
              <div>
                <strong style="color: #475569;">College / Department:</strong><br>
                <span style="color: #0f172a; font-weight: 500;">${escapeHtml(b.organization || 'General University')}</span>
              </div>
              <div>
                <strong style="color: #475569;">Batch Schedule:</strong><br>
                <span style="color: #0f172a; font-weight: 500;">${escapeHtml(b.requested_date || 'Current Month')}${b.end_date ? ` – ${escapeHtml(String(b.end_date).slice(0, 10))}` : ''} (${escapeHtml(b.requested_time || '08:00 AM - 12:00 PM')})</span>
              </div>
              <div>
                <strong style="color: #475569;">Campus Venue:</strong><br>
                <span style="color: #0f172a; font-weight: 500;">${escapeHtml(b.venue || 'UMak Campus')}</span>
              </div>
            </div>

          </div>
        `;
      }).join('');
      return;
    }

    // HEAD / ADMIN ROLE: Render standard Batches & Schedules
    const courseStudentNames = [...new Set(bookings.map(item => String(item.contact_name || '').trim()).filter(Boolean))];

    container.innerHTML = bookings.map(b => {
      const isPaid = b.payment_status === 'paid';
      const isPending = b.payment_status === 'pending';
      const [bYr, bMo] = (b.requested_date || '').split('-').map(Number);
      const isFinished = isBatchScheduleFinished(b);
      const monthName = b.requested_date ? new Date(bYr, bMo - 1, 1).toLocaleString('en-US', { month: 'long' }) : '';
      const batchDateRange = `${b.requested_date || ''}${b.end_date ? ` – ${String(b.end_date).slice(0, 10)}` : ''}`;

      return `
        <div class="tc-batch-card ${isFinished ? 'tc-batch-passed tc-batch-done' : 'tc-batch-ongoing'}" 
             onclick="handleScheduleCardClick('${escapeHtml(b.id)}', ${isFinished}, '${escapeHtml(monthName)}', ${bYr})"
             style="background: #ffffff; border: 1px solid ${isFinished ? '#cbd5e1' : '#e2e8f0'}; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 12px; position: relative;">
          
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600;">#${escapeHtml(b.booking_code)}</span>
              ${isFinished ? `
                <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; display: inline-flex; align-items: center; gap: 4px;">
                  <iconify-icon icon="solar:check-circle-bold" style="font-size: 12px;"></iconify-icon> Done Training
                </span>
              ` : `
                <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; display: inline-flex; align-items: center; gap: 4px;">
                  <iconify-icon icon="solar:clock-circle-bold" style="font-size: 12px;"></iconify-icon> On Going Schedule
                </span>
              `}
            </div>
          </div>

          <!-- 1-Month Batch Schedule Banner -->
          <div style="background: ${isFinished ? '#f8fafc' : '#f0fdf4'}; border: 1px solid ${isFinished ? '#cbd5e1' : '#bbf7d0'}; padding: 10px 14px; border-radius: 8px; font-size: 12px; color: ${isFinished ? '#475569' : '#166534'}; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <iconify-icon icon="${isFinished ? 'solar:check-circle-bold' : 'solar:calendar-bold-duotone'}" style="font-size: 18px; color: ${isFinished ? '#15803d' : '#15803d'};"></iconify-icon>
              <div>
                <strong>Batch Schedule (1 Month):</strong>
                <span style="font-weight: 600; margin-left: 4px; color: ${isFinished ? '#334155' : '#14532d'};">${escapeHtml(batchDateRange)}</span>
              </div>
            </div>
            <span style="font-size: 11px; background: ${isFinished ? '#dcfce7' : '#dcfce7'}; color: ${isFinished ? '#15803d' : '#15803d'}; font-weight: 700; padding: 3px 10px; border-radius: 9999px; border: 1px solid ${isFinished ? '#86efac' : '#86efac'};">
              ${isFinished ? 'Done Training' : '1st Week – Last Week'}
            </span>
          </div>

          ${b.requested_day || b.requested_time ? `
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              ${b.requested_day ? `
                <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #eff6ff; color: #0284c7; border: 1px solid #bae6fd; display: inline-flex; align-items: center; gap: 4px;">
                  <iconify-icon icon="solar:calendar-mark-bold-duotone" style="font-size: 13px;"></iconify-icon> Session Day: Every ${escapeHtml(b.requested_day)} (4 sessions)
                </span>
              ` : ''}
              ${b.requested_time ? `
                <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #fefce8; color: #854d0e; border: 1px solid #fef08a; display: inline-flex; align-items: center; gap: 4px;">
                  <iconify-icon icon="solar:clock-circle-bold" style="font-size: 13px;"></iconify-icon> Class Time: ${escapeHtml(b.requested_time)}
                </span>
              ` : ''}
            </div>
          ` : ''}

          <div class="tc-batch-meta-grid" style="display: flex; flex-direction: column; gap: 8px; background: #f8fafc; padding: 10px 12px; border-radius: 8px; font-size: 12px; border: 1px solid #f1f5f9;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
              <strong style="color: #475569; display: inline-flex; align-items: center; gap: 5px;">
                <iconify-icon icon="solar:users-group-rounded-bold-duotone" style="font-size: 15px; color: #0284c7;"></iconify-icon>
                Participants:
              </strong>
              <span style="font-size: 11px; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bae6fd;">
                ${courseStudentNames.length} Registered Student${courseStudentNames.length === 1 ? '' : 's'}
              </span>
            </div>
            ${courseStudentNames.length > 0 ? `
              <div class="tc-batch-participants-list" style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${courseStudentNames.map(name => `
                  <span class="tc-student-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #ffffff; color: #0f172a; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <iconify-icon icon="solar:user-bold" style="font-size: 12px; color: #0284c7;"></iconify-icon>
                    ${escapeHtml(name)}
                  </span>
                `).join('')}
              </div>
            ` : `
              <div style="font-size: 11px; color: #94a3b8; font-style: italic;">This course has no enrolled students.</div>
            `}
          </div>

          ${b.notes ? `<div style="font-size: 12px; color: #64748b; background: #f1f5f9; padding: 8px 10px; border-radius: 6px; font-style: italic;"><strong>Notes:</strong> ${escapeHtml(b.notes)}</div>` : ''}

          <!-- Batch Actions -->
          <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 10px; flex-wrap: wrap; gap: 10px;" onclick="event.stopPropagation()">
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              ${!isFinished || isHeadOrAdminRole() ? `
                <button type="button" class="filter-btn" style="background:#0284c7; color:#fff; border:none; padding:5px 10px; font-size:12px; font-weight:600; border-radius:6px; cursor:pointer;" onclick="openBatchDetailsModal('${escapeHtml(b.id)}')">View Details</button>
              ` : `
                <span style="font-size:11px; color:#94a3b8; font-style:italic;">Schedule Closed</span>
              `}
              ${!isTrainerRole() ? `
                <button type="button" class="filter-btn tc-btn-delete-batch tc-btn-remove-student" style="background:#fff; color:#dc2626; border:1px solid #fecaca; padding:5px 10px; font-size:12px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" onclick="openRemoveStudentModal('${escapeHtml(b.id)}')">
                  <iconify-icon icon="solar:user-cross-bold" style="font-size: 13px;"></iconify-icon> Remove Student
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color:#dc2626; font-size:12px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// Trainer Assignment Handler
async function assignBookingTrainer(bookingId, trainerName) {
  try {
    const res = await fetch(`/api/training/bookings/${bookingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getSessionId(),
        'x-employee-role': getCurrentUserRole()
      },
      body: JSON.stringify({ assigned_trainer_id: trainerName })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to assign trainer');
    showToast(`Trainer ${trainerName ? `"${trainerName}"` : 'removed'} successfully.`, 'success');
  } catch (err) {
    showToast(err.message || 'Error assigning trainer', 'error');
  }
}

// Payment Verification Handler (HEAD and System Admin only)
async function updateBookingPayment(bookingId, status) {
  if (!isHeadOrAdminRole()) {
    showToast('Only HEAD and System Admin accounts can update payment verification status.', 'warning');
    return;
  }
  try {
    const res = await fetch(`/api/training/bookings/${bookingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getSessionId(),
        'x-employee-role': getCurrentUserRole()
      },
      body: JSON.stringify({ payment_status: status })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to update payment status');

    const updated = (currentLoadedBookings || []).find(b => String(b.id) === String(bookingId));
    if (updated) {
      updated.payment_status = status;
      updated.training_status = status === 'paid' ? 'Enrolled' : (status === 'cancelled' ? 'Cancelled' : 'Pending Payment');
      if (status === 'paid') updated.payment_confirmed_at = new Date().toISOString();
      else updated.payment_confirmed_at = null;
    }

    const isPaid = status === 'paid';
    const statusLabel = isPaid ? 'PAID' : (status === 'cancelled' ? 'DECLINED' : 'Pending');
    showToast(`Payment marked as ${statusLabel}!`, 'success');

    // If batch details modal is currently open for this booking, update its display in place
    if (currentActiveBookingInModal && String(currentActiveBookingInModal.id) === String(bookingId)) {
      currentActiveBookingInModal.payment_status = status;
      const paymentEl = document.getElementById('batchDetailsPayment');
      if (paymentEl) {
        paymentEl.innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; ${isPaid ? 'background: #dcfce7; color: #15803d; border: 1px solid #86efac;' : 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;'}">
            <iconify-icon icon="${isPaid ? 'solar:check-circle-bold' : 'solar:danger-circle-bold'}" style="font-size: 14px;"></iconify-icon>
            ${isPaid ? 'PAID' : 'NO PAYMENT'} &bull; ₱${Number(currentActiveBookingInModal.total_php || 0).toLocaleString()}
          </span>
        `;
      }
      updateModalPaymentButtons(status);
    }

    if (activeTrainingCourse) {
      await loadCourseBookings(activeTrainingCourse.id);
      const modal = document.getElementById('batchDetailsModal');
      if (modal?.style.display === 'flex' && currentActiveTrainingBatchId) {
        openBatchDetailsModal(currentActiveTrainingBatchId);
      }
    }
  } catch (err) {
    showToast(err.message || 'Error updating payment', 'error');
  }
}

function declineTrainingBooking(bookingId) {
  const booking = (currentLoadedBookings || []).find(item => String(item.id) === String(bookingId));
  if (!booking || !window.confirm(`Decline enrollment for ${booking.contact_name || 'this applicant'}? Their reserved seat will be released.`)) return;
  updateBookingPayment(bookingId, 'cancelled');
}

// Remove Student Confirmation Modal & Actions
let pendingRemoveStudentBookingId = null;

function openRemoveStudentModal(bookingId) {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot remove students.', 'warning');
    return;
  }
  if (!bookingId) return;

  pendingRemoveStudentBookingId = bookingId;
  const booking = (currentLoadedBookings || []).find(b => String(b.id) === String(bookingId)) || {};

  const nameEl = document.getElementById('removeStudentModalName');
  if (nameEl) nameEl.textContent = booking.contact_name || booking.organization || 'Enrolled Student';

  const codeEl = document.getElementById('removeStudentModalCode');
  if (codeEl) codeEl.textContent = booking.booking_code ? `#${booking.booking_code}` : `#${String(booking.id || '').slice(0, 8)}`;

  const reasonInput = document.getElementById('removeStudentReasonInput');
  if (reasonInput) {
    reasonInput.value = '';
    reasonInput.style.borderColor = '#cbd5e1';
  }

  const modal = document.getElementById('removeStudentModal');
  if (modal) {
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
  }
  if (reasonInput) {
    setTimeout(() => reasonInput.focus(), 50);
  }
}

function closeRemoveStudentModal() {
  const modal = document.getElementById('removeStudentModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
  pendingRemoveStudentBookingId = null;
}

async function confirmRemoveStudent() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot remove students.', 'warning');
    closeRemoveStudentModal();
    return;
  }

  if (!pendingRemoveStudentBookingId) return;

  const reasonInput = document.getElementById('removeStudentReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!reason) {
    if (reasonInput) {
      reasonInput.style.borderColor = '#dc2626';
      reasonInput.focus();
    }
    showToast('Please provide a reason for cancellation.', 'warning');
    return;
  }

  const yesBtn = document.getElementById('btnRemoveStudentYes');
  if (yesBtn) {
    yesBtn.disabled = true;
    yesBtn.textContent = 'Removing...';
  }

  try {
    const res = await fetch(`/api/training/bookings/${pendingRemoveStudentBookingId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getSessionId(),
        'x-employee-role': getCurrentUserRole()
      },
      body: JSON.stringify({ reason })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to remove student');

    showToast('Student removed successfully.', 'success');
    closeRemoveStudentModal();
    if (activeTrainingCourse) loadCourseBookings(activeTrainingCourse.id);
  } catch (err) {
    showToast(err.message || 'Error removing student', 'error');
  } finally {
    if (yesBtn) {
      yesBtn.disabled = false;
      yesBtn.textContent = 'Yes';
    }
  }
}

// Delete Single Batch / Remove Student Handler (backward compatibility)
async function deleteBookingBatch(bookingId) {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot delete batch schedules.', 'warning');
    return;
  }
  openRemoveStudentModal(bookingId);
}

// Delete Course Confirmation Modal & Actions
function openDeleteCourseModal() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot delete courses.', 'warning');
    return;
  }
  if (!activeTrainingCourse) {
    if (Array.isArray(allTrainingCourses) && allTrainingCourses.length > 0) {
      activeTrainingCourse = allTrainingCourses[0];
    } else {
      showToast('Please select a course to delete.', 'warning');
      return;
    }
  }

  const nameEl = document.getElementById('deleteCourseModalName');
  if (nameEl) nameEl.textContent = `"${activeTrainingCourse.name || 'this course'}"`;

  const modal = document.getElementById('deleteCourseModal');
  if (modal) {
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
  }
}

function closeDeleteCourseModal() {
  const modal = document.getElementById('deleteCourseModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
}

async function confirmDeleteCourse() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot delete courses.', 'warning');
    closeDeleteCourseModal();
    return;
  }
  if (!activeTrainingCourse) return;

  const yesBtn = document.getElementById('btnDeleteCourseYes');
  if (yesBtn) {
    yesBtn.disabled = true;
    yesBtn.textContent = 'Deleting...';
  }

  try {
    const res = await fetch(`/api/training/courses/${activeTrainingCourse.id}`, {
      method: 'DELETE',
      headers: {
        'x-session-id': getSessionId(),
        'x-employee-role': getCurrentUserRole()
      }
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to delete course');
    showToast('Course deleted successfully.', 'success');
    closeDeleteCourseModal();
    activeTrainingCourse = null;
    showTrainingEmptyState();
    await loadTrainingCourses();
  } catch (err) {
    showToast(err.message || 'Failed to delete course', 'error');
  } finally {
    if (yesBtn) {
      yesBtn.disabled = false;
      yesBtn.textContent = 'Yes';
    }
  }
}

// Delete Course Handler (kept for backward compatibility & direct invocation)
async function deleteActiveCourse() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot delete courses.', 'warning');
    return;
  }
  openDeleteCourseModal();
}

// Open Edit Course Modal and Pre-populate Fields
function openEditCourseModal() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot edit course details.', 'warning');
    return;
  }
  if (!activeTrainingCourse) {
    if (Array.isArray(allTrainingCourses) && allTrainingCourses.length > 0) {
      activeTrainingCourse = allTrainingCourses[0];
    } else {
      showToast('Please select a course to edit.', 'warning');
      return;
    }
  }
  const modal = document.getElementById('editCourseModal');
  if (!modal) return;

  document.getElementById('editCourseId').value = activeTrainingCourse.id || '';
  document.getElementById('editCourseInputName').value = activeTrainingCourse.name || '';
  document.getElementById('editCourseInputCategory').value = activeTrainingCourse.category || 'Medical';
  document.getElementById('editCourseInputDuration').value = activeTrainingCourse.duration || '1 Month';
  document.getElementById('editCourseInputStudentPrice').value = activeTrainingCourse.student_price || 0;
  const editTimeInput = document.getElementById('editCourseInputTime');
  if (editTimeInput) {
    const curTime = String(activeTrainingCourse.training_time || '');
    if (curTime.includes('01:00') || curTime.toLowerCase().includes('pm') || curTime.toLowerCase().includes('noon') || curTime.includes('5:00')) {
      editTimeInput.value = '01:00 P.M - 5:00 P.M';
    } else {
      editTimeInput.value = '07:00 A.M - 11:00 A.M';
    }
  }

  const editSessionsSelect = document.getElementById('editCourseInputSessions');
  if (editSessionsSelect) {
    const curSessions = String(activeTrainingCourse.session_schedule || '').toLowerCase();
    if (curSessions.includes('monday')) {
      editSessionsSelect.value = '1 per week on Monday in 1 Month (4 session - Every Monday)';
    } else if (curSessions.includes('wednesday')) {
      editSessionsSelect.value = '1 per week on Wednesday in 1 Month (4 session - Every Wednesday)';
    } else if (curSessions.includes('sunday')) {
      editSessionsSelect.value = '1 per week on Sunday in 1 month (4 Sessions)';
    } else {
      editSessionsSelect.value = '1 per week on Saturday in 1 month (4 Sessions)';
    }
  }

  // Initialize interactive Day Picker and AM/PM Time Picker for Edit Course
  editCourseTimeController = initCourseTimePicker('editCourseTime', activeTrainingCourse.available_times || activeTrainingCourse.training_time);
  editCourseDaysController = initCourseDaysPicker('editCourse', activeTrainingCourse.available_days || activeTrainingCourse.session_schedule);
  
  const editReqInput = document.getElementById('editCourseInputRequirements');
  if (editReqInput) editReqInput.value = activeTrainingCourse.requirements || 'Valid UMak ID';

  const editCertInput = document.getElementById('editCourseInputCertification');
  if (editCertInput) editCertInput.value = activeTrainingCourse.certification || 'Certificate of Completion';

  const editLearningsInput = document.getElementById('editCourseInputLearnings');
  if (editLearningsInput) {
    if (Array.isArray(activeTrainingCourse.learnings)) {
      editLearningsInput.value = activeTrainingCourse.learnings.join('\n');
    } else if (typeof activeTrainingCourse.learnings === 'string') {
      editLearningsInput.value = activeTrainingCourse.learnings;
    } else {
      editLearningsInput.value = '';
    }
  }

  initEditCourseSchedulePicker(activeTrainingCourse.available_months);

  document.getElementById('editCourseInputLocation').value = activeTrainingCourse.location || 'UMak Campus';

  const editTrainerSelect = document.getElementById('editCourseInputTrainer');
  if (editTrainerSelect) {
    const onlyTrainers = allTrainersList.filter(t => {
      const r = String(t.employee_role || '').trim().toLowerCase();
      return r === 'trainer' && !r.includes('responder');
    });
    const curTrainer = activeTrainingCourse.assigned_trainer || '';
    editTrainerSelect.innerHTML = '<option value="">-- Unassigned --</option>' +
      onlyTrainers.map(t => `<option value="${escapeHtml(t.employee_name)}" ${curTrainer === t.employee_name ? 'selected' : ''}>${escapeHtml(t.employee_name)} (${escapeHtml(t.employee_role)})</option>`).join('');
  }

  document.getElementById('editCourseInputDesc').value = activeTrainingCourse.description || '';

  modal.style.display = 'flex';
}

// Open Add Batch Modal and Pre-populate Defaults
function openAddBatchModal() {
  if (isTrainerRole()) {
    showToast('Access restricted: Trainer accounts cannot add batch schedules.', 'warning');
    return;
  }
  if (!activeTrainingCourse) {
    if (Array.isArray(allTrainingCourses) && allTrainingCourses.length > 0) {
      activeTrainingCourse = allTrainingCourses[0];
    } else {
      showToast('Please select a course first to add a batch schedule.', 'warning');
      return;
    }
  }
  const modal = document.getElementById('addBatchModal');
  if (!modal) return;

  const subtitle = document.getElementById('addBatchModalCourseSubtitle');
  if (subtitle) subtitle.textContent = `Course: ${activeTrainingCourse.name}`;

  // Populate Trainer dropdown options (Strictly Trainer accounts only; NO Responders)
  const trainerSelect = document.getElementById('batchInputTrainer');
  if (trainerSelect) {
    const onlyTrainers = allTrainersList.filter(t => {
      const r = String(t.employee_role || '').trim().toLowerCase();
      return r === 'trainer' && !r.includes('responder');
    });
    trainerSelect.innerHTML = '<option value="">-- Select Trainer --</option>' +
      onlyTrainers.map(t => `<option value="${escapeHtml(t.employee_name)}">${escapeHtml(t.employee_name)} (${escapeHtml(t.employee_role)})</option>`).join('');
    // The course trainer is the default for new batches, but each batch can
    // still be assigned to a different trainer when its schedule is created.
    trainerSelect.value = activeTrainingCourse.assigned_trainer || '';
  }

  // Initialize Professional Multi-Month Batch Schedule Picker
  initBatchSchedulePicker();
  const offeredMonths = (activeTrainingCourse.available_months || [])
    .filter(monthKey => /^\d{4}-\d{2}$/.test(monthKey))
    .filter(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      return !isMonthInPast(year, month);
    }).sort();
  if (offeredMonths.length) {
    const [year, month] = offeredMonths[0].split('-').map(Number);
    const yearSelect = document.getElementById('batchInputScheduleYear');
    const monthSelect = document.getElementById('batchInputScheduleMonth');
    if (yearSelect) yearSelect.value = String(year);
    if (monthSelect) monthSelect.value = String(month);
    updateDaysList();
  }

  const venueInput = document.getElementById('batchInputVenue');
  if (venueInput) venueInput.value = activeTrainingCourse.location || 'UMak Campus';

  const batchDurationInput = document.getElementById('batchInputDuration');
  if (batchDurationInput) {
    batchDurationInput.value = activeTrainingCourse.duration || '1 Month';
  }

  // Initialize interactive AM/PM Time Picker for Add Batch (defaults to course offering or course training_time)
  batchTimeController = initCourseTimePicker('batchTime', activeTrainingCourse.available_times || activeTrainingCourse.training_time);

  // Initialize interactive Sessions & Day Schedule Picker for Add Batch (defaults to course offering or course session_schedule)
  batchDaysController = initCourseDaysPicker('batch', activeTrainingCourse.available_days || activeTrainingCourse.session_schedule);

  const notesInput = document.getElementById('batchInputNotes');
  if (notesInput) notesInput.value = '';

  modal.style.display = 'flex';
}

// Wire up Training Center Modals & Buttons
function initTrainingCenterModals() {
  // 1. Create Course Modal
  const createModal = document.getElementById('createCourseModal');
  const btnCreateCourse = document.getElementById('btnCreateCourse');
  const closeCreateBtn = document.getElementById('closeCreateCourseModal');
  const cancelCreateBtn = document.getElementById('btnCancelCreateCourse');
  const createForm = document.getElementById('createCourseForm');

  if (btnCreateCourse && createModal) {
    btnCreateCourse.addEventListener('click', () => {
      if (isTrainerRole()) {
        showToast('Access restricted: Trainer accounts cannot create courses.', 'warning');
        return;
      }
      initCreateCourseSchedulePicker();
      createCourseTimeController = initCourseTimePicker('courseTime', ['07:00 A.M - 11:00 A.M', '01:00 P.M - 5:00 P.M']);
      createCourseDaysController = initCourseDaysPicker('createCourse', ['Monday', 'Wednesday', 'Saturday']);
      const createTrainerSelect = document.getElementById('courseInputTrainer');
      if (createTrainerSelect) {
        const onlyTrainers = allTrainersList.filter(t => {
          const r = String(t.employee_role || '').trim().toLowerCase();
          return r === 'trainer' && !r.includes('responder');
        });
        createTrainerSelect.innerHTML = '<option value="">-- Unassigned --</option>' +
          onlyTrainers.map(t => `<option value="${escapeHtml(t.employee_name)}">${escapeHtml(t.employee_name)} (${escapeHtml(t.employee_role)})</option>`).join('');
      }
      createModal.style.display = 'flex';
    });
  }
  if (closeCreateBtn && createModal) closeCreateBtn.addEventListener('click', () => { createModal.style.display = 'none'; });
  if (cancelCreateBtn && createModal) cancelCreateBtn.addEventListener('click', () => { createModal.style.display = 'none'; });

  // loadTrainingCenterData can run each time the view is opened. Bind the
  // submit handler once so repeated visits cannot send duplicate POSTs.
  if (createForm && createForm.dataset.submitHandlerBound !== 'true') {
    createForm.dataset.submitHandlerBound = 'true';
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitCourse');

      let schedVal = '';
      let availMonths = [];

      if (createCoursePickerState.mode === 'date-month-year') {
        const y = parseInt(document.getElementById('createCourseScheduleYear')?.value, 10);
        const m = parseInt(document.getElementById('createCourseScheduleMonth')?.value, 10);
        const d = parseInt(document.getElementById('createCourseScheduleDay')?.value, 10);

        if (!y || !m || !d) {
          showToast('Please select a valid Date, Month, and Year for the batch schedule.', 'warning');
          return;
        }

        if (isMonthInPast(y, m)) {
          showToast(`Cannot create course: The selected batch schedule month (${MONTH_NAMES[m - 1]} ${y}) has already passed in the current year.`, 'warning');
          return;
        }
        const today = new Date();
        if (y === today.getFullYear() && m === (today.getMonth() + 1) && d < today.getDate()) {
          showToast(`Cannot create course: Day ${d} of this month has already passed in the current year.`, 'warning');
          return;
        }

        schedVal = `${MONTH_NAMES[m - 1]} ${d}, ${y} (1 Month Batch: 1st Week to Last Week)`;
        availMonths = [`${y}-${String(m).padStart(2, '0')}`];
      } else {
        const selectedMonths = Array.from(createCoursePickerState.selectedMonths).sort();
        if (selectedMonths.length === 0) {
          showToast('Please select at least 1 month (recommended 2 or more months) for the batch schedule.', 'warning');
          return;
        }
        for (const mKey of selectedMonths) {
          const [yr, mo] = mKey.split('-').map(Number);
          if (isMonthInPast(yr, mo)) {
            showToast(`Cannot create course: Month ${mKey} has already passed in the current year.`, 'warning');
            return;
          }
        }
        schedVal = selectedMonths.map(m => computeMonthSchedule(m).monthName).join(', ') + ' (1 Month Each: 1st Week to Last Week)';
        availMonths = selectedMonths;
      }

      const selDays = createCourseDaysController ? createCourseDaysController.getSelectedDays() : ['Monday', 'Wednesday', 'Saturday'];
      if (!selDays || selDays.length === 0) {
        showToast('Please select at least 1 session day for this course.', 'warning');
        return;
      }
      const selTimes = createCourseTimeController ? createCourseTimeController.getSelectedTimes() : ['07:00 A.M - 11:00 A.M', '01:00 P.M - 5:00 P.M'];
      if (!selTimes || selTimes.length === 0) {
        showToast('Please select at least 1 class time offering (AM or PM).', 'warning');
        return;
      }
      const timeVal = createCourseTimeController ? createCourseTimeController.getTimeString() : (document.getElementById('courseInputTime')?.value || '07:00 A.M - 11:00 A.M');

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

      const learningsRaw = document.getElementById('courseInputLearnings')?.value || '';
      const learningsArr = learningsRaw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

      const payload = {
        name: document.getElementById('courseInputName')?.value,
        category: document.getElementById('courseInputCategory')?.value,
        duration: document.getElementById('courseInputDuration')?.value || '1 Month',
        student_price: document.getElementById('courseInputStudentPrice')?.value,
        training_time: timeVal,
        session_schedule: document.getElementById('courseInputSessions')?.value || `1 per week on ${selDays[0]} in 1 month (4 Sessions)`,
        available_days: selDays,
        available_times: selTimes,
        requirements: document.getElementById('courseInputRequirements')?.value || 'Valid UMak ID',
        certification: document.getElementById('courseInputCertification')?.value || 'Certificate of Completion',
        learnings: learningsArr,
        batch_schedule: schedVal,
        available_months: availMonths,
        location: document.getElementById('courseInputLocation')?.value,
        assigned_trainer: document.getElementById('courseInputTrainer')?.value || '',
        description: document.getElementById('courseInputDesc')?.value
      };

      try {
        const res = await fetch('/api/training/courses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': getSessionId(),
            'x-employee-role': getCurrentUserRole()
          },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create course');

        showToast('Training course created successfully!', 'success');
        createModal.style.display = 'none';
        createForm.reset();
        await loadTrainingCourses();
        if (result.course?.id) {
          // A background refresh may already be in flight. Make the newly
          // created course selectable immediately; the next refresh reconciles it.
          if (!allTrainingCourses.some(course => course.id === result.course.id)) {
            allTrainingCourses.unshift(result.course);
          }
          selectTrainingCourse(result.course.id);
        }
      } catch (err) {
        console.error('Failed to create training course:', err?.message || err, err);
        showToast(err.message || 'Error saving course', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Course'; }
      }
    });
  }

  // 2. Edit Course Modal
  const editModal = document.getElementById('editCourseModal');
  const btnEditCourse = document.getElementById('btnEditCourse');
  const closeEditBtn = document.getElementById('closeEditCourseModal');
  const cancelEditBtn = document.getElementById('btnCancelEditCourse');
  const editForm = document.getElementById('editCourseForm');

  if (btnEditCourse) {
    btnEditCourse.onclick = openEditCourseModal;
    btnEditCourse.addEventListener('click', openEditCourseModal);
  }
  if (closeEditBtn && editModal) closeEditBtn.addEventListener('click', () => { editModal.style.display = 'none'; });
  if (cancelEditBtn && editModal) cancelEditBtn.addEventListener('click', () => { editModal.style.display = 'none'; });

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const courseId = document.getElementById('editCourseId')?.value;
      if (!courseId) return;

      const submitBtn = document.getElementById('btnSubmitEditCourse');

      let schedVal = '';
      let availMonths = [];

      if (editCoursePickerState.mode === 'date-month-year') {
        const y = parseInt(document.getElementById('editCourseScheduleYear')?.value, 10);
        const m = parseInt(document.getElementById('editCourseScheduleMonth')?.value, 10);
        const d = parseInt(document.getElementById('editCourseScheduleDay')?.value, 10);

        if (!y || !m || !d) {
          showToast('Please select a valid Date, Month, and Year for the batch schedule.', 'warning');
          return;
        }

        if (isMonthInPast(y, m)) {
          showToast(`Cannot update course: The selected batch schedule month (${MONTH_NAMES[m - 1]} ${y}) has already passed in the current year.`, 'warning');
          return;
        }
        const today = new Date();
        if (y === today.getFullYear() && m === (today.getMonth() + 1) && d < today.getDate()) {
          showToast(`Cannot update course: Day ${d} of this month has already passed in the current year.`, 'warning');
          return;
        }

        schedVal = `${MONTH_NAMES[m - 1]} ${d}, ${y} (1 Month Batch: 1st Week to Last Week)`;
        availMonths = [`${y}-${String(m).padStart(2, '0')}`];
      } else {
        const selectedMonths = Array.from(editCoursePickerState.selectedMonths).sort();
        if (selectedMonths.length === 0) {
          showToast('Please select at least 1 month (recommended 2 or more months) for the batch schedule.', 'warning');
          return;
        }
        for (const mKey of selectedMonths) {
          const [yr, mo] = mKey.split('-').map(Number);
          if (isMonthInPast(yr, mo)) {
            showToast(`Cannot update course: Month ${mKey} has already passed in the current year.`, 'warning');
            return;
          }
        }
        schedVal = selectedMonths.map(m => computeMonthSchedule(m).monthName).join(', ') + ' (1 Month Each: 1st Week to Last Week)';
        availMonths = selectedMonths;
      }

      const selDays = editCourseDaysController ? editCourseDaysController.getSelectedDays() : ['Monday', 'Wednesday', 'Saturday'];
      if (!selDays || selDays.length === 0) {
        showToast('Please select at least 1 session day for this course.', 'warning');
        return;
      }
      const selTimes = editCourseTimeController ? editCourseTimeController.getSelectedTimes() : ['07:00 A.M - 11:00 A.M', '01:00 P.M - 5:00 P.M'];
      if (!selTimes || selTimes.length === 0) {
        showToast('Please select at least 1 class time offering (AM or PM).', 'warning');
        return;
      }
      const timeVal = editCourseTimeController ? editCourseTimeController.getTimeString() : (document.getElementById('editCourseInputTime')?.value || '07:00 A.M - 11:00 A.M');

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating...'; }

      const learningsRaw = document.getElementById('editCourseInputLearnings')?.value || '';
      const learningsArr = learningsRaw.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

      const payload = {
        name: document.getElementById('editCourseInputName')?.value,
        category: document.getElementById('editCourseInputCategory')?.value,
        duration: document.getElementById('editCourseInputDuration')?.value || '1 Month',
        student_price: document.getElementById('editCourseInputStudentPrice')?.value,
        training_time: timeVal,
        session_schedule: document.getElementById('editCourseInputSessions')?.value || `1 per week on ${selDays[0]} in 1 month (4 Sessions)`,
        available_days: selDays,
        available_times: selTimes,
        requirements: document.getElementById('editCourseInputRequirements')?.value || 'Valid UMak ID',
        certification: document.getElementById('editCourseInputCertification')?.value || 'Certificate of Completion',
        learnings: learningsArr,
        batch_schedule: schedVal,
        available_months: availMonths,
        location: document.getElementById('editCourseInputLocation')?.value,
        assigned_trainer: document.getElementById('editCourseInputTrainer')?.value || '',
        description: document.getElementById('editCourseInputDesc')?.value
      };

      try {
        const res = await fetch(`/api/training/courses/${courseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': getSessionId(),
            'x-employee-role': getCurrentUserRole()
          },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to update course');

        showToast('Course information updated successfully!', 'success');
        editModal.style.display = 'none';

        // Update activeTrainingCourse object & re-render view
        activeTrainingCourse = result.course;
        const titleEl = document.getElementById('tcActiveTitle');
        const priceEl = document.getElementById('tcActivePrice');
        const descEl = document.getElementById('tcActiveDesc');
        if (titleEl) titleEl.textContent = result.course.name;
        if (priceEl) {
          let schedText = formatBatchScheduleText(result.course.batch_schedule || 'Monthly (1 Month Each: 1st Week to Last Week)');
          let timeText = result.course.training_time || '07:00 A.M - 11:00 A.M';
          if (Array.isArray(result.course.available_times) && result.course.available_times.length > 1) {
            timeText = 'AM & PM Classes (07:00 AM - 11:00 AM / 01:00 PM - 5:00 PM)';
          }
          priceEl.innerHTML = `
            <span style="color:#047857; font-weight:700;">Student Price: ₱${Number(result.course.student_price || 0).toLocaleString()}</span>
            <span style="color:#cbd5e1; margin:0 8px;">|</span>
            <span style="color:#b45309; font-weight:600;"><iconify-icon icon="solar:clock-circle-bold-duotone" style="vertical-align:-2px; color:#d97706;"></iconify-icon> Time: ${escapeHtml(timeText)}</span>
            <span style="color:#cbd5e1; margin:0 8px;">|</span>
            <span style="color:#0f172a; font-weight:600;"><iconify-icon icon="solar:calendar-bold-duotone" style="vertical-align:-2px; color:#0284c7;"></iconify-icon> Batch Schedule: ${escapeHtml(schedText)}</span>
          `;
        }
        if (descEl) descEl.textContent = result.course.description || 'No description provided.';

        const durEl = document.getElementById('tcActiveDuration');
        if (durEl) durEl.textContent = `Duration: ${result.course.duration || '1 Month'}`;

        const sessEl = document.getElementById('tcActiveSessions');
        if (sessEl) {
          if (Array.isArray(result.course.available_days) && result.course.available_days.length > 0) {
            sessEl.textContent = `Sessions: Available on ${result.course.available_days.join(', ')} (4 sessions/month per day)`;
          } else {
            sessEl.textContent = `Sessions: ${result.course.session_schedule || '1 per week on Saturday in 1 month (4 Sessions)'}`;
          }
        }

        const reqEl = document.getElementById('tcActiveRequirements');
        if (reqEl) reqEl.textContent = `Requirements: ${result.course.requirements || 'Valid UMak ID'}`;

        const certEl = document.getElementById('tcActiveCertificate');
        if (certEl) certEl.textContent = `Certificate: ${result.course.certification || 'Certificate of Completion'}`;

        const learningsEl = document.getElementById('tcActiveLearnings');
        if (learningsEl) {
          let items = [];
          if (Array.isArray(result.course.learnings)) {
            items = result.course.learnings;
          } else if (typeof result.course.learnings === 'string' && result.course.learnings.trim()) {
            items = result.course.learnings.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
          }
          if (items.length === 0) {
            items = ['Core Safety Principles', 'Practical Hands-on Drills'];
          }
          learningsEl.innerHTML = items.map(item => `
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; color: #334155; font-weight: 500;">
              <iconify-icon icon="solar:check-circle-bold" style="color: #10b981; font-size: 12px;"></iconify-icon>
              ${escapeHtml(item)}
            </span>
          `).join('');
        }

        // Refresh left list to update name/price if modified
        await loadTrainingCourses();
      } catch (err) {
        showToast(err.message || 'Error updating course', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Course'; }
      }
    });
  }

  // 3. Delete Course Button
  const deleteBtn = document.getElementById('btnDeleteCourse');
  if (deleteBtn) {
    deleteBtn.onclick = deleteActiveCourse;
    deleteBtn.addEventListener('click', deleteActiveCourse);
  }

  // 4. Add Batch Schedule Modal
  const addBatchModal = document.getElementById('addBatchModal');
  const btnAddSchedule = document.getElementById('btnAddSchedule');
  const closeBatchBtn = document.getElementById('closeAddBatchModal');
  const cancelBatchBtn = document.getElementById('btnCancelAddBatch');
  const addBatchForm = document.getElementById('addBatchForm');

  if (btnAddSchedule) {
    btnAddSchedule.onclick = openAddBatchModal;
    btnAddSchedule.addEventListener('click', openAddBatchModal);
  }
  if (closeBatchBtn && addBatchModal) closeBatchBtn.addEventListener('click', () => { addBatchModal.style.display = 'none'; });
  if (cancelBatchBtn && addBatchModal) cancelBatchBtn.addEventListener('click', () => { addBatchModal.style.display = 'none'; });

  // 5. Batch Details Modal (Schedule Card Details)
  const batchDetailsModal = document.getElementById('batchDetailsModal');
  const closeDetailsBtn = document.getElementById('closeBatchDetailsModal');
  const dismissDetailsBtn = document.getElementById('btnDismissBatchDetails');
  if (closeDetailsBtn && batchDetailsModal) closeDetailsBtn.addEventListener('click', () => { batchDetailsModal.style.display = 'none'; });
  if (dismissDetailsBtn && batchDetailsModal) dismissDetailsBtn.addEventListener('click', () => { batchDetailsModal.style.display = 'none'; });

  if (addBatchForm && addBatchForm.dataset.trainingSubmitBound !== 'true') {
    addBatchForm.dataset.trainingSubmitBound = 'true';
    addBatchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeTrainingCourse) return;

      const submitBtn = document.getElementById('btnSubmitAddBatch');
      if (submitBtn?.disabled) return;

      // Validate training time offerings (AM / PM)
      const selBatchTimes = batchTimeController ? batchTimeController.getSelectedTimes() : [];
      if (selBatchTimes.length === 0) {
        showToast('Please select at least one training time slot (AM or PM).', 'warning');
        return;
      }

      // Validate session days (Monday - Sunday)
      const selBatchDays = batchDaysController ? batchDaysController.getSelectedDays() : [];
      if (selBatchDays.length === 0) {
        showToast('Please select at least one session day (Monday - Sunday).', 'warning');
        return;
      }

      const batchDurationVal = document.getElementById('batchInputDuration')?.value.trim() || activeTrainingCourse?.duration || '1 Month';
      const batchTimeVal = batchTimeController ? batchTimeController.getTimeString() : (document.getElementById('batchInputTime')?.value || '07:00 A.M - 11:00 A.M');
      const batchSessionVal = `1 per week on ${selBatchDays.join(', ')} in ${batchDurationVal} (4 Sessions each)`;

      if (batchPickerState.mode === 'date-month-year') {
        // Date, Month & Year Mode
        const selYear = parseInt(document.getElementById('batchInputScheduleYear')?.value, 10);
        const selMonth = parseInt(document.getElementById('batchInputScheduleMonth')?.value, 10);
        const selDay = parseInt(document.getElementById('batchInputScheduleDay')?.value, 10);

        if (!selYear || !selMonth || !selDay) {
          showToast('Please select a valid Date, Month, and Year for the batch schedule.', 'warning');
          return;
        }

        if (isMonthInPast(selYear, selMonth)) {
          showToast(`Cannot create schedule: The dates for ${MONTH_NAMES[selMonth - 1]} ${selYear} have already passed in the current year.`, 'warning');
          return;
        }

        const today = new Date();
        const curY = today.getFullYear();
        const curM = today.getMonth() + 1;
        const curD = today.getDate();
        if (selYear === curY && selMonth === curM && selDay < curD) {
          showToast(`Cannot create schedule: Day ${selDay} of this month has already passed in the current year.`, 'warning');
          return;
        }

        const monthKey = `${selYear}-${String(selMonth).padStart(2, '0')}`;
        const courseAvail = new Set(activeTrainingCourse?.available_months || []);
        if (courseAvail.size > 0 && !courseAvail.has(monthKey)) {
          handleLockedMonthClick(MONTH_NAMES[selMonth - 1], selYear);
          return;
        }

        const dateStr = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(selDay).padStart(2, '0')}`;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating Batch...'; }

        const payload = {
          course_id: activeTrainingCourse.id,
          requested_date: dateStr,
          batch_month: monthKey,
          duration: batchDurationVal,
          requested_time: batchTimeVal,
          available_times: selBatchTimes,
          requested_day: selBatchDays.join(', '),
          available_days: selBatchDays,
          session_schedule: batchSessionVal,
          participants: document.getElementById('batchInputParticipants')?.value,
          venue: document.getElementById('batchInputVenue')?.value,
          assigned_trainer_id: document.getElementById('batchInputTrainer')?.value,
          email: document.getElementById('batchInputEmail')?.value,
          payment_status: 'paid',
          total_php: activeTrainingCourse.student_price || 0,
          notes: document.getElementById('batchInputNotes')?.value
        };

        try {
          const res = await fetch('/api/training/batches', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-session-id': getSessionId(),
              'x-employee-role': getCurrentUserRole()
            },
            body: JSON.stringify(payload)
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to add batch schedule');

          showToast(`Successfully created batch schedule for ${dateStr}!`, 'success');
          addBatchModal.style.display = 'none';
          addBatchForm.reset();

          if (result.course) {
            activeTrainingCourse = result.course;
          }
          await loadTrainingCourses();
          if (activeTrainingCourse?.id) {
            await selectTrainingCourse(activeTrainingCourse.id);
          }
        } catch (err) {
          showToast(err.message || 'Error creating batch schedule', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Batch'; }
        }
      } else {
        // Multi-Month Mode (Pick by month: 2 or more months)
        const selectedMonths = Array.from(batchPickerState.selectedMonths).sort();
        if (selectedMonths.length === 0) {
          showToast('Please select at least 1 month (recommended 2 or more months) for the batch schedule.', 'warning');
          return;
        }

        // Validate none of the selected months are in the past
        for (const m of selectedMonths) {
          const [yr, mo] = m.split('-').map(Number);
          if (isMonthInPast(yr, mo)) {
            showToast(`Cannot create schedule: ${m} has already passed in the current year.`, 'warning');
            return;
          }
          const courseAvail = new Set(activeTrainingCourse?.available_months || []);
          if (courseAvail.size > 0 && !courseAvail.has(m)) {
            handleLockedMonthClick(MONTH_NAMES[mo - 1] || m, yr);
            return;
          }
        }

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating Batch(es)...'; }

        const payload = {
          course_id: activeTrainingCourse.id,
          batch_months: selectedMonths,
          duration: batchDurationVal,
          requested_time: batchTimeVal,
          available_times: selBatchTimes,
          requested_day: selBatchDays.join(', '),
          available_days: selBatchDays,
          session_schedule: batchSessionVal,
          participants: document.getElementById('batchInputParticipants')?.value,
          venue: document.getElementById('batchInputVenue')?.value,
          assigned_trainer_id: document.getElementById('batchInputTrainer')?.value,
          email: document.getElementById('batchInputEmail')?.value,
          payment_status: 'paid',
          total_php: activeTrainingCourse.student_price || 0,
          notes: document.getElementById('batchInputNotes')?.value
        };

        try {
          const res = await fetch('/api/training/batches', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-session-id': getSessionId(),
              'x-employee-role': getCurrentUserRole()
            },
            body: JSON.stringify(payload)
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to add batch schedule');

          const countCreated = result.bookings?.length || selectedMonths.length;
          showToast(`Successfully created ${countCreated} batch schedule(s) for ${selectedMonths.join(', ')}!`, 'success');
          addBatchModal.style.display = 'none';
          addBatchForm.reset();

          if (result.course) {
            activeTrainingCourse = result.course;
          }
          await loadTrainingCourses();
          if (activeTrainingCourse?.id) {
            await selectTrainingCourse(activeTrainingCourse.id);
          }
        } catch (err) {
          showToast(err.message || 'Error creating batch schedule', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Batch'; }
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTrainingCenterModals);
} else {
  initTrainingCenterModals();
}

window.initTrainingCenterModals = initTrainingCenterModals;

window.selectTrainingCourse = selectTrainingCourse;
window.assignBookingTrainer = assignBookingTrainer;
window.updateBookingPayment = updateBookingPayment;
window.deleteBookingBatch = deleteBookingBatch;
window.openRemoveStudentModal = openRemoveStudentModal;
window.closeRemoveStudentModal = closeRemoveStudentModal;
window.confirmRemoveStudent = confirmRemoveStudent;
window.deleteActiveCourse = deleteActiveCourse;
window.openDeleteCourseModal = openDeleteCourseModal;
window.closeDeleteCourseModal = closeDeleteCourseModal;
window.confirmDeleteCourse = confirmDeleteCourse;
window.openEditCourseModal = openEditCourseModal;
window.openAddBatchModal = openAddBatchModal;
window.loadTrainingCenterData = loadTrainingCenterData;

window.handleScheduleCardClick = handleScheduleCardClick;
window.openBatchDetailsModal = openBatchDetailsModal;
window.isBatchScheduleFinished = isBatchScheduleFinished;
window.setBookingPaymentFromModal = setBookingPaymentFromModal;
window.updateModalPaymentButtons = updateModalPaymentButtons;
window.handlePassedMonthClick = handlePassedMonthClick;
window.handleLockedMonthClick = handleLockedMonthClick;
window.toggleBatchMonthSelection = toggleBatchMonthSelection;
window.selectBatchPickerYear = selectBatchPickerYear;
window.switchBatchScheduleMode = switchBatchScheduleMode;
window.initDateMonthYearPicker = initDateMonthYearPicker;
window.validateDateMonthYearSelection = validateDateMonthYearSelection;

window.selectCreateCourseYear = selectCreateCourseYear;
window.switchCreateCourseScheduleMode = switchCreateCourseScheduleMode;
window.toggleCreateCourseMonthSelection = toggleCreateCourseMonthSelection;
window.initCreateCourseSchedulePicker = initCreateCourseSchedulePicker;
window.validateCreateCourseDateMonthYearSelection = validateCreateCourseDateMonthYearSelection;

window.selectEditCourseYear = selectEditCourseYear;
window.switchEditCourseScheduleMode = switchEditCourseScheduleMode;
window.toggleEditCourseMonthSelection = toggleEditCourseMonthSelection;
window.initEditCourseSchedulePicker = initEditCourseSchedulePicker;
window.validateEditCourseDateMonthYearSelection = validateEditCourseDateMonthYearSelection;

window.startResponderLocationTracking = startResponderLocationTracking;
window.stopResponderLocationTracking = stopResponderLocationTracking;

window.openTeamsExportDrawer = openTeamsExportDrawer;
window.closeTeamsExportDrawer = closeTeamsExportDrawer;
window.selectTeamsExportFormat = selectTeamsExportFormat;
window.handleTeamsDrawerExport = handleTeamsDrawerExport;
window.exportTeamsPdf = exportTeamsPdf;
window.exportTeamsExcel = exportTeamsExcel;
window.loadTeamsAdminAccounts = loadTeamsAdminAccounts;
window.renderTeamsAdminUsersTable = renderTeamsAdminUsersTable;
