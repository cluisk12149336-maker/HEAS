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
  handleHashRouting();
  loadDashboardData();
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

  const incidentsRoleBadge = document.getElementById('incidentsRoleBadge');
  if (incidentsRoleBadge) {
    incidentsRoleBadge.style.display = isSysAdmin ? 'inline-block' : 'none';
  }

  const sidebarLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-roles], dashboard-navigation nav a[data-roles]');
  sidebarLinks.forEach((link) => {
    const rolesAttr = link.getAttribute('data-roles') || '';
    const allowedRoles = rolesAttr.split(',').map((r) => r.trim().toLowerCase());
    const allowed = allowedRoles.some((allowedRole) => {
      if (allowedRole === 'head') return isHeadRole(activeRole);
      if (allowedRole === 'responder') return isResponderRole(activeRole);
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
    loadAuditAccounts();
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
    'view-profile': 'profile'
  };

  let targetView = routeMap[hash] || 'overview';
  const currentRole = getCurrentUserRole();
  if (targetView === 'teams' && isResponderRole(currentRole)) {
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
    } else if (normStatus === 'resolved') {
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.6';
      cancelBtn.style.cursor = 'not-allowed';
      cancelBtn.title = 'Cannot cancel an incident that is already resolved';
      cancelBtn.innerHTML = '&#10005; Mark as Cancelled';
    } else {
      cancelBtn.disabled = false;
      cancelBtn.style.opacity = '1';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.title = 'Cancel this incident alert';
      cancelBtn.innerHTML = '&#10005; Mark as Cancelled';
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
      // Filter for responder accounts on database
      const responderPersonnel = accounts.filter(a => {
        const role = String(a.employee_role || '').trim().toLowerCase();
        return role === 'responder' || role.includes('responder');
      });
      const listToDisplay = responderPersonnel.length > 0 ? responderPersonnel : accounts;

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
        const role = getCurrentUserRole();
        if (role) headers['x-employee-role'] = role;
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

function initAlertDetailMap(coords = [14.5628, 121.0561]) {
  const mapElement = document.querySelector('#alertDetailMap');
  if (!mapElement || typeof L === 'undefined') return;

  if (alertDetailMap) {
    alertDetailMap.setView(coords, 15);
    if (alertDetailMarker) {
      alertDetailMarker.setLatLng(coords);
    }
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
  const tableBody = document.getElementById('auditAccountsTableBody');
  if (!tableBody) return;

  try {
    const response = await fetch('/api/admin/accounts');
    if (!response.ok) throw new Error('Failed to fetch employee accounts.');
    const result = await response.json();
    const accounts = Array.isArray(result.users) ? result.users : [];

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
  const adminUsers = currentDashboardUsers.filter((user) => adminRoles.has(user.employee_role)
    && (user.employee_status || '').toLowerCase() !== 'pending');
  const statusCounts = {
    teamCountAll: adminUsers.length,
    teamCountHead: adminUsers.filter((user) => user.employee_role === 'HEAD').length,
    teamCountAdmin: adminUsers.filter((user) => user.employee_role === 'System Admin').length,
    teamCountResponder: adminUsers.filter((user) => user.employee_role === 'Responder').length,
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
  } catch (error) {
    console.warn('Dashboard data fetch notification:', error.message);
  }
}

function renderOverviewUsers(users) {
  const tbody = document.querySelector('#overviewUsersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const displayUsers = (users || []).slice(0, 5);

  tbody.innerHTML = displayUsers.map(u => {
    const isOnline = u.employee_status === 'Active';
    const statusClass = isOnline ? 'status-active' : (u.employee_status === 'Pending' ? 'status-pending' : 'status-inactive');
    const statusText = u.employee_status || 'Active';
    const timeAgo = formatTimeAgo(u.employee_created_at || u.employee_last_login);

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${escapeHtml(u.avatar_url || '/images/default-avatar.png')}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" onerror="this.src='/images/default-avatar.png'">
            <strong>${escapeHtml(u.employee_name || 'Unnamed')}</strong>
          </div>
        </td>
        <td>${escapeHtml(u.employee_role || 'Staff')}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span></td>
        <td>${timeAgo}</td>
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
        <td><strong>${escapeHtml(u.employee_role || 'Staff')}</strong></td>
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
          try {
            const resp = await fetch('/api/profile/avatar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': sessionId || '',
                'x-employee-id': storedUser.employee_id || storedUser.id || '',
                'x-employee-email': storedUser.email || '',
                'x-employee-role': storedUser.role || ''

              },
              body: JSON.stringify({
                imageBase64: dataUrl,
                mimeType: selectedAvatarFile.type,
                fileName: selectedAvatarFile.name
              })
            });

            const resData = await resp.json();
            if (!resp.ok) throw new Error(resData.error || 'Upload failed.');

            const newAvatarUrl = resData.avatar_url;
            if (previewImg) previewImg.src = newAvatarUrl;
            const heroAvatar = document.getElementById('profileHeroAvatarImg');
            if (heroAvatar) heroAvatar.src = newAvatarUrl;
            const headerAvatar = document.getElementById('headerAvatarImg');
            if (headerAvatar) headerAvatar.src = newAvatarUrl;

            selectedAvatarFile = null;
            if (fileInput) fileInput.value = '';
            showToast('Profile picture uploaded successfully!');
          } catch (uploadErr) {
            showToast(uploadErr.message || 'Failed to upload picture.', 'error');
          } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
          }
        };
        reader.readAsDataURL(selectedAvatarFile);
      } catch (err) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = originalText;
        showToast('Could not read image file.', 'error');
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
    if (inputRole) inputRole.value = p.department || p.employee_role || 'System Administrator';
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

  // Pre-load if initially on reports
  if (window.location.hash === '#reports') {
    loadReportsData();
  }
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

    // 1. Update summary cards from database
    const m = data.metrics || {};
    const elTotal = document.getElementById('reportMetricTotal');
    const elActive = document.getElementById('reportMetricActive');
    const elPending = document.getElementById('reportMetricPending');
    const elResolved = document.getElementById('reportMetricResolved');
    const elCancelled = document.getElementById('reportMetricCancelled');
    const elArchived = document.getElementById('reportArchivedCount');

    if (elTotal) elTotal.textContent = m.total ?? 0;
    if (elActive) elActive.textContent = m.active ?? 0;
    if (elPending) elPending.textContent = m.pending ?? 0;
    if (elResolved) elResolved.textContent = m.resolved ?? 0;
    if (elCancelled) elCancelled.textContent = m.cancelled ?? 0;
    if (elArchived) elArchived.textContent = m.archived ?? 0;

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
    } else if (catLower.includes('urg') || catLower.includes('assist')) {
      catClass = 'urgent';
      catIcon = '⚠️';
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

    const createdFormatted = inc.created_at ? inc.created_at.replace('T', ' ').slice(0, 19) : 'Recently';
    const resolvedFormatted = inc.resolved_at ? inc.resolved_at.replace('T', ' ').slice(0, 19) : null;
    const updatedFormatted = (statusLower === 'resolved' && resolvedFormatted) ? resolvedFormatted : (inc.updated_at ? inc.updated_at.replace('T', ' ').slice(0, 19) : createdFormatted);

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
}

async function handleDrawerExport() {
  const drawerStatus = document.getElementById('drawerStatusSelect');
  const drawerCategory = document.getElementById('drawerCategorySelect');
  const drawerSearch = document.getElementById('drawerSearchInput');
  const drawerSort = document.getElementById('drawerSortSelect');
  const drawerStartDate = document.getElementById('drawerStartDate');
  const drawerEndDate = document.getElementById('drawerEndDate');

  const status = drawerStatus ? drawerStatus.value : 'all';
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

  // PDF or Print Format handled directly on the client side
  closeExportDrawer();
  await generateAndExportReport({
    format: currentExportFormat,
    reportType: currentExportReportType,
    status, category, search, sort, startDate, endDate
  });
}

async function generateAndExportReport(options) {
  try {
    const isResolvedReport = options.reportType === 'resolved';
    showToast(`Generating ${isResolvedReport ? 'Resolved' : 'Incident'} ${options.format.toUpperCase()} report...`);

    const params = new URLSearchParams();
    if (options.status !== 'all') params.set('status', options.status);
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

    const reportTitle = isResolvedReport
      ? 'Resolved Incidents & Resolution Summary Report'
      : 'Comprehensive Campus Emergency Incident Report';
    const timestamp = new Date().toLocaleString();
    const filterInfo = [
      `Status: ${options.status === 'all' ? (isResolvedReport ? 'Resolved Only' : 'All Statuses') : options.status}`,
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
    if (['HEAD', 'System Admin', 'Responder'].includes(activeTeamsAccountFilter)) {
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
    } else if (catLower.includes('vicin') || catLower.includes('campus')) {
      color = '#2563eb'; // Blue for Vicinity
    }

    const popupContent = `
      <div class="incident-popup-card">
        <div class="popup-header">
          <div class="status-tag" style="background:${color}20;border-left:3px solid ${color}">
            <span class="pulse-dot" style="background:${color}"></span> ${incident.status || 'Active'}
          </div>
          <span class="incident-id">${incident.display_id || incident.id.slice(0,8)}</span>
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



