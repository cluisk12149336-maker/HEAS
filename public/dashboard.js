/* =========================================================
   HERON'S EMERGENCY ALERT SYSTEM - ADMINISTRATOR DASHBOARD
   Script: dashboard.js
   ========================================================= */

let incidentMap = null;
let liveIncidentMap = null;
let alertDetailMap = null;
let toastTimer = null;
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
  initLogout();
  initMetricCardSpotlights();
  handleHashRouting();
});

// 1. Session and RBAC Setup
function initUserSession() {
  const userInfoStr = sessionStorage.getItem('oauthUserInfo');
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

  const nameEl = document.querySelector('#dashboardName');
  const roleEl = document.querySelector('#dashboardRole');
  const avatarEl = document.querySelector('.user-avatar');

  if (nameEl) nameEl.textContent = userName;
  if (roleEl) roleEl.textContent = `${userRole} dashboard`;
  if (avatarEl && userName) {
    avatarEl.textContent = userName.trim().charAt(0).toUpperCase();
  }

  applyRoleBasedAccessControl(userRole);
}

function applyRoleBasedAccessControl(userRole) {
  if (window.GlobalNavigation && typeof window.GlobalNavigation.filterByRole === 'function') {
    window.GlobalNavigation.filterByRole(userRole);
  } else {
    const sidebarLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-roles]');
    sidebarLinks.forEach((link) => {
      const allowedRoles = link.getAttribute('data-roles').split(',').map((r) => r.trim());
      if (allowedRoles.includes(userRole) || userRole === 'System Administrator' || userRole === 'System Admin') {
        link.style.display = '';
      } else {
        link.style.display = 'none';
      }
    });
  }
}

// 2. Navigation & Page Switching
function initNavigation() {
  if (window.GlobalNavigation) {
    const sidebar = document.querySelector('#dashboardSidebar, .dashboard-sidebar');
    if (sidebar) {
      window.GlobalNavigation.mount(sidebar, { active: 'overview' });
    }
  }

  // Ensure click delegation and hash routing
  const navLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-view], dashboard-navigation nav a[data-view]');
  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const targetView = link.getAttribute('data-view');
      switchView(targetView);
      window.location.hash = link.getAttribute('href');
    });
  });

  window.addEventListener('hashchange', handleHashRouting);
}

function switchView(viewName) {
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
}

function handleHashRouting() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) {
    switchView('overview');
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
    settings: 'settings'
  };

  const targetView = routeMap[hash] || 'overview';
  switchView(targetView);

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

// 3. Leaflet Incident Map Initialization
function initIncidentMap() {
  if (incidentMap || typeof L === 'undefined') return;
  const mapElement = document.querySelector('#mapCanvas');
  if (!mapElement) return;

  const umak = [14.5628, 121.0561];
  const mapMarkers = [];
  incidentMap = L.map(mapElement, { zoomControl: false }).setView(umak, 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(incidentMap);

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
            <button type="button" onclick="openIncidentDetails('${incidentData.id}')">View Details &rarr;</button>
          </div>
        </div>
      </div>
    `;

    const marker = L.marker(position, { icon }).addTo(incidentMap).bindPopup(popupContent, { maxWidth: 280 });
    mapMarkers.push({ marker, status: incidentData.status.toLowerCase(), data: incidentData });
  };

  createMarker([14.5631, 121.0565], '#ed3942', '!', {
    id: 'MED_0001',
    status: 'ACTIVE',
    type: 'Medical Emergency',
    category: 'Acute Respiratory Distress',
    time: '4 min ago • 16:49:30',
    location: 'UMak Student Center Plaza (2nd Floor)',
    distance: '0m from UMAK',
    team: 'Alpha Team 1 (ETA: 45s)'
  });

  createMarker([14.5620, 121.0550], '#eab308', '3', {
    id: 'SEC_0001',
    status: 'ON GOING',
    type: 'Perimeter Security Alert',
    category: 'Gate Traffic Hazard & Perimeter Control',
    time: '23 min ago • 12:50:38',
    location: 'J.P. Rizal Campus Gate (Patrol Unit)',
    distance: '175m from incident',
    team: 'Alpha Team 1'
  });

  createMarker([14.5615, 121.0575], '#eab308', '!', {
    id: 'VIC_0001',
    status: 'ON GOING',
    type: 'Security Review',
    category: 'Suspicious Activity Report',
    time: '8 min ago • 14:24:30',
    location: 'Library Building Main Entrance',
    distance: '280m from UMAK',
    team: 'Awaiting Assignment'
  });

  createMarker([14.5645, 121.0555], '#16a34a', '✓', {
    id: 'CAMP_0001',
    status: 'RESOLVED',
    type: 'Gymnasium Minor Sports Injury',
    category: 'Clinical First Aid Treatment',
    time: '1 hour ago • 10:21:17',
    location: 'Gymnasium Clinic',
    distance: '120m from UMAK',
    team: 'Bravo Team 2'
  });

  createMarker([14.5610, 121.0545], '#ed3942', 'i', {
    id: 'URG_0001',
    status: 'ACTIVE',
    type: 'Medical Assistance',
    category: 'Minor Injury Report',
    time: '1 hour ago • 10:21:17',
    location: 'Sports Complex - Basketball Court',
    distance: '450m from UMAK',
    team: 'Beta Team 1 (ETA: 2m)'
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

  const menu = document.querySelector('.map-menu');
  const menuToggle = document.querySelector('.map-menu-toggle');
  const menuItems = document.querySelectorAll('[data-map-filter]');

  menuToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      const filter = item.dataset.mapFilter;
      if (filter === 'center') {
        incidentMap.setView(umak, 15);
      } else {
        mapMarkers.forEach(({ marker, status }) => {
          const matches = filter === 'all'
            || (filter === 'active' && status.includes('active'))
            || (filter === 'ongoing' && (status.includes('ongoing') || status.includes('on going')))
            || (filter === 'resolved' && status.includes('resolved'))
            || status.includes(filter);
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

// 3b. Live Interactive Map View Initialization (Live Map Tab)
function initLiveIncidentMap() {
  if (liveIncidentMap || typeof L === 'undefined') return;
  const mapElement = document.querySelector('#liveMapCanvas');
  if (!mapElement) return;

  const umak = [14.5628, 121.0561];
  const liveMarkers = [];
  liveIncidentMap = L.map(mapElement, { zoomControl: false }).setView(umak, 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(liveIncidentMap);

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
            <button type="button" onclick="openIncidentDetails('${incidentData.id}')">View Details &rarr;</button>
          </div>
        </div>
      </div>
    `;

    const marker = L.marker(position, { icon }).addTo(liveIncidentMap).bindPopup(popupContent, { maxWidth: 280 });
    liveMarkers.push({ marker, status: incidentData.status.toLowerCase(), data: incidentData });
  };

  createMarker([14.5631, 121.0565], '#ed3942', '!', {
    id: 'MED_0001',
    status: 'ACTIVE',
    type: 'Medical Emergency',
    category: 'Acute Respiratory Distress',
    time: '4 mins ago • 16:49:30',
    location: 'UMak Student Center Plaza (2nd Floor)',
    distance: '0m from UMAK',
    team: 'Alpha Team 1 (ETA: 45s)'
  });

  createMarker([14.5620, 121.0550], '#eab308', '!', {
    id: 'SEC_0001',
    status: 'ON GOING',
    type: 'Perimeter Security Alert',
    category: 'Gate Traffic Hazard & Perimeter Control',
    time: '23 mins ago • 12:50:38',
    location: 'J.P. Rizal Ext. Campus Gate',
    distance: '175m from incident',
    team: 'Alpha Team 1'
  });

  createMarker([14.5615, 121.0575], '#eab308', '!', {
    id: 'VIC_0001',
    status: 'ON GOING',
    type: 'Security Review',
    category: 'Suspicious Activity Report',
    time: '8 min ago • 14:24:30',
    location: 'Library Building Main Entrance',
    distance: '280m from UMAK',
    team: 'Awaiting Assignment'
  });

  createMarker([14.5645, 121.0555], '#16a34a', '✓', {
    id: 'CAMP_0001',
    status: 'RESOLVED',
    type: 'Gymnasium Minor Sports Injury',
    category: 'Clinical First Aid Treatment',
    time: '1 hour ago • 10:21:17',
    location: 'Gymnasium Clinic',
    distance: '120m from UMAK',
    team: 'Bravo Team 2'
  });

  createMarker([14.5610, 121.0545], '#ed3942', '!', {
    id: 'URG_0001',
    status: 'ACTIVE',
    type: 'Medical Assistance',
    category: 'Minor Injury Report',
    time: '1 hour ago • 10:21:17',
    location: 'Sports Complex - Basketball Court',
    distance: '450m from UMAK',
    team: 'Beta Team 1 (ETA: 2m)'
  });

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

  // Filter tags
  const filterBtns = document.querySelectorAll('#liveMapFilterTags button');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.liveFilter || 'all';

      liveMarkers.forEach(({ marker, status }) => {
        const matches = filter === 'all'
          || (filter === 'active' && status.includes('active'))
          || (filter === 'ongoing' && (status.includes('ongoing') || status.includes('on going')))
          || (filter === 'resolved' && status.includes('resolved'));
        if (matches) marker.addTo(liveIncidentMap);
        else liveIncidentMap.removeLayer(marker);
      });
    });
  });

  // Search input
  const searchInput = document.querySelector('#liveMapSearchInput');
  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    liveMarkers.forEach(({ marker, data }) => {
      const text = `${data.id} ${data.type} ${data.category} ${data.location} ${data.team}`.toLowerCase();
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
      alertTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const filter = tab.dataset.alertFilter;
      const activeView = document.querySelector('.dashboard-view.active');
      const items = activeView ? activeView.querySelectorAll('.alert-item') : document.querySelectorAll('.alert-item');

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

  if (!overlay || !closeButton) return;

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

function renderIncidentModal(record) {
  const overlay = document.querySelector('#alertDetailsOverlay');
  if (!overlay) return;

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

  const cleanStatus = record.status.toLowerCase() === 'pending' ? 'On Going' : record.status;

  if (title) title.textContent = record.title;
  if (meta) meta.textContent = record.time;
  if (description) description.textContent = record.description;
  if (status) status.textContent = cleanStatus;
  if (statusValue) statusValue.textContent = cleanStatus;
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

function openIncidentDetails(incidentIdOrRow) {
  let record = null;
  if (typeof incidentIdOrRow === 'string') {
    const cleanId = incidentIdOrRow.replace(/^#/, '').trim();
    record = incidentHistoryRecords[cleanId] || incidentHistoryRecords[incidentIdOrRow];
  } else if (incidentIdOrRow instanceof HTMLElement) {
    const row = incidentIdOrRow;
    const cells = row.querySelectorAll('td');
    const rawId = (row.dataset.incidentId || cells[0]?.textContent.trim() || '').replace(/^#/, '').trim();
    const isRecentPanel = !!row.closest('#incidentPanel');

    if (incidentHistoryRecords[rawId]) {
      record = incidentHistoryRecords[rawId];
    } else {
      const typeText = cells[1]?.textContent.trim().replace(/^[^\w\s]+/, '').trim() || 'Emergency Incident';
      const locText = !isRecentPanel && cells[2] ? cells[2].textContent.trim() : 'University of Makati Campus';
      const teamText = !isRecentPanel && cells[3] ? cells[3].textContent.trim() : 'Alpha Team 1';
      const timeText = isRecentPanel ? cells[3]?.textContent.trim() : (cells[4]?.textContent.trim() || 'Recent');
      let statusText = isRecentPanel ? cells[2]?.textContent.trim() : (cells[5]?.textContent.trim() || 'On Going');
      if (statusText.toLowerCase() === 'pending') statusText = 'On Going';

      const isResolved = statusText.toLowerCase() === 'resolved';
      const category = typeText.toLowerCase().includes('medical') ? 'Medical' : (typeText.toLowerCase().includes('security') ? 'Security' : 'Emergency');

      record = {
        id: rawId,
        category: category,
        title: `${typeText} &mdash; ${locText}`,
        type: typeText,
        status: statusText,
        time: timeText,
        location: locText,
        floor: locText.includes('2nd Floor') ? '2nd Floor' : (locText.includes('Floor') ? 'Upper Level' : 'Ground Level'),
        room: locText,
        userId: '10000' + String(Math.floor(100 + Math.random() * 900)),
        description: `Campus incident report logged for ${typeText} at ${locText}. Dispatched team: ${teamText}. Current Status: ${statusText}.`,
        student: {
          name: 'UMak Community Member',
          age: '20',
          year: '2nd Year',
          college: 'University of Makati',
          contact: '0917 000 1234',
          address: 'University of Makati Campus',
          primaryName: 'Campus Security Command',
          primaryContact: '0918 000 5678',
          primaryAddress: 'University Security Station',
          secondaryName: 'Campus Medical Clinic',
          secondaryContact: '0920 000 9012',
          secondaryAddress: 'University Health Services'
        },
        history: [
          { step: 'Emergency SOS Reported', time: timeText, complete: true },
          { step: `Triaged & Dispatched to ${teamText}`, time: timeText, complete: true },
          { step: 'Response Team On Scene & In Progress', time: isResolved ? 'Completed' : 'Current Active Status', complete: true },
          { step: isResolved ? 'Incident Resolved & Closed' : 'Resolution Clearance', time: isResolved ? timeText : '—', complete: isResolved }
        ],
        coords: [14.5628, 121.0561]
      };
    }
  }

  if (record) {
    renderIncidentModal(record);
  }
}

function showAlertDetails(alertItem) {
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
      const statusFilter = btn.dataset.statusFilter;

      const rows = document.querySelectorAll('#fullIncidentsTable tbody tr');
      rows.forEach((row) => {
        const status = row.dataset.status;
        if (statusFilter === 'all' || status === statusFilter) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  });

  const searchInput = document.querySelector('#incidentSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#fullIncidentsTable tbody tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }
}

// 6. Users Search
function initUserSearch() {
  const userSearch = document.querySelector('#userSearchInput');
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#fullUsersTable tbody tr');
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }
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
