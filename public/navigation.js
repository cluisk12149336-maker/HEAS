/* =========================================================
   HERON'S EMERGENCY ALERT SYSTEM - GLOBAL NAVIGATION COMPONENT
   Script: navigation.js
   ========================================================= */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GlobalNavigation = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const DEFAULT_ITEMS = [
    {
      id: 'overview',
      view: 'overview',
      href: '#dashboard',
      label: 'Dashboard',
      icon: 'solar:widget-2-bold-duotone',
      roles: ['System Admin', 'HEAD', 'Responder']
    },
    {
      id: 'map',
      view: 'map',
      href: '#map',
      label: 'Live Map',
      icon: 'solar:map-point-wave-bold-duotone',
      roles: ['System Admin', 'HEAD', 'Responder']
    },
    {
      id: 'incidents',
      view: 'incidents',
      href: '#incidents',
      label: 'Incidents',
      icon: 'solar:danger-triangle-bold-duotone',
      roles: ['System Admin', 'HEAD', 'Responder']
    },
    {
      id: 'users',
      view: 'users',
      href: '#users',
      label: 'Users',
      icon: 'solar:users-group-two-rounded-bold-duotone',
      roles: ['System Admin', 'HEAD']
    },
    {
      id: 'teams',
      view: 'teams',
      href: '#teams',
      label: 'Teams',
      icon: 'solar:shield-user-bold-duotone',
      roles: ['System Admin', 'HEAD']
    },
    {
      id: 'reports',
      view: 'reports',
      href: '#reports',
      label: 'Reports',
      icon: 'solar:chart-2-bold-duotone',
      roles: ['System Admin', 'HEAD']
    },
    {
      id: 'audit',
      view: 'audit',
      href: '#audit',
      label: 'Audit Logs',
      icon: 'solar:history-bold-duotone',
      roles: ['System Admin', 'HEAD']
    }
  ];

  class GlobalNavigationManager {
    constructor() {
      this.items = [...DEFAULT_ITEMS];
      this.currentView = 'overview';
      this.currentRole = 'System Administrator';
      this.listeners = [];
      this.mountedContainers = new Set();
    }

    /**
     * Generate semantic HTML for the navigation rail
     */
    generateHTML(activeView = this.currentView, userRole = this.currentRole) {
      const linksHtml = this.items.map(item => {
        const isActive = item.view === activeView;
        const isAllowed = this._isRoleAllowed(item.roles, userRole);
        const displayStyle = isAllowed ? '' : 'style="display:none;"';

        return `
          <a class="${isActive ? 'active' : ''}" 
             href="${item.href}" 
             data-view="${item.view}" 
             data-roles="${item.roles.join(',')}" 
             title="${item.label}" 
             aria-label="${item.label}"
             ${displayStyle}>
            <span class="nav-icon"><iconify-icon icon="${item.icon}"></iconify-icon></span>
            <span class="nav-tooltip">${item.label}</span>
          </a>`;
      }).join('');

      return `<nav aria-label="Dashboard navigation">${linksHtml}</nav>`;
    }

    /**
     * Mount into a DOM container
     */
    mount(target, options = {}) {
      const container = typeof target === 'string' ? document.querySelector(target) : target;
      if (!container) return null;

      if (options.active) this.currentView = options.active;
      if (options.role) this.currentRole = options.role;

      container.innerHTML = this.generateHTML(this.currentView, this.currentRole);
      this.bindEvents(container);
      this.mountedContainers.add(container);

      return container;
    }

    /**
     * Bind click listeners to navigation links
     */
    bindEvents(container) {
      const links = container.querySelectorAll('a[data-view]');
      links.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetView = link.getAttribute('data-view');
          const href = link.getAttribute('href');

          this.setActive(targetView);

          if (href) {
            window.location.hash = href;
          }

          if (typeof window.switchView === 'function') {
            window.switchView(targetView);
          }

          this._notifyChange(targetView, link);
        });
      });
    }

    /**
     * Set active link across all mounted instances
     */
    setActive(viewName) {
      this.currentView = viewName;
      const allLinks = document.querySelectorAll('.dashboard-sidebar nav a, dashboard-navigation nav a');
      allLinks.forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }

    /**
     * Filter navigation links by role
     */
    filterByRole(role) {
      this.currentRole = role;
      const allLinks = document.querySelectorAll('.dashboard-sidebar nav a[data-roles], dashboard-navigation nav a[data-roles]');
      allLinks.forEach(link => {
        const rolesAttr = link.getAttribute('data-roles');
        if (!rolesAttr) return;
        const allowedRoles = rolesAttr.split(',').map(r => r.trim());
        if (this._isRoleAllowed(allowedRoles, role)) {
          link.style.display = '';
        } else {
          link.style.display = 'none';
        }
      });
    }

    _isRoleAllowed(allowedRoles, role) {
      if (!role) return true;
      if (role === 'System Administrator' || role === 'System Admin') return true;
      return allowedRoles.includes(role);
    }

    _notifyChange(view, linkEl) {
      const event = new CustomEvent('nav-change', {
        bubbles: true,
        detail: { view, link: linkEl }
      });
      document.dispatchEvent(event);

      this.listeners.forEach(fn => {
        try { fn(view, linkEl); } catch (err) { console.error('Nav listener error:', err); }
      });
    }

    on(listener) {
      if (typeof listener === 'function') {
        this.listeners.push(listener);
      }
    }

    /**
     * Automatically discover and mount any navigation container in the document
     */
    init() {
      const containers = document.querySelectorAll('.dashboard-sidebar[data-component="navigation"], .dashboard-sidebar:empty, [data-global-nav]');
      containers.forEach(c => this.mount(c));
    }
  }

  const instance = new GlobalNavigationManager();

  // Define Custom Web Component: <dashboard-navigation>
  if (typeof customElements !== 'undefined' && !customElements.get('dashboard-navigation')) {
    class DashboardNavigationElement extends HTMLElement {
      connectedCallback() {
        const active = this.getAttribute('active') || instance.currentView;
        const role = this.getAttribute('role') || instance.currentRole;
        instance.mount(this, { active, role });
      }

      static get observedAttributes() {
        return ['active', 'role'];
      }

      attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'active') instance.setActive(newValue);
        if (name === 'role') instance.filterByRole(newValue);
      }
    }

    customElements.define('dashboard-navigation', DashboardNavigationElement);
  }

  // Auto-initialize when DOM is ready if requested
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => instance.init());
    } else {
      instance.init();
    }
  }

  return instance;
});
