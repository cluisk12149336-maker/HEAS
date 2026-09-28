const fs = require('fs');
const path = require('path');

describe('Active Alerts & On Going Navigation and Responder Scoping Feature', () => {
  const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
  const jsPath = path.join(__dirname, '..', 'public', 'dashboard.js');
  const cssPath = path.join(__dirname, '..', 'public', 'dashboard.css');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  test('dashboard.html contains Active Alerts & On Going card with navigateToIncidentsView("active_ongoing")', () => {
    expect(html).toContain('ACTIVE ALERTS &amp; ON GOING');
    expect(html).toContain('navigateToIncidentsView(\'active_ongoing\')');
  });

  test('dashboard.html contains Active & On Going filter tab in Incidents module', () => {
    expect(html).toContain('data-status-filter="active_ongoing"');
    expect(html).toContain('id="countIncidentsActiveOngoing"');
  });

  test('dashboard.html contains Responder Scope and Rescue Notification containers', () => {
    expect(html).toContain('id="responderScopeBanner"');
    expect(html).toContain('id="responderRescueNotificationContainer"');
    expect(html).toContain('id="overviewResponderRescueBanner"');
    expect(html).toContain('id="incidentDirectoryPanel"');
  });

  test('dashboard.css defines styles for responder rescue cards and scope banner', () => {
    expect(css).toContain('.responder-rescue-card');
    expect(css).toContain('.responder-scope-banner');
    expect(css).toContain('.overview-responder-rescue-banner');
    expect(css).toContain('.beacon-pulse');
  });

  test('dashboard.js defines navigateToIncidentsView supporting active_ongoing filter', () => {
    expect(js).toContain('function navigateToIncidentsView(');
    expect(js).toContain('active_ongoing');
    expect(js).toContain('const responderView = isResponderRole()');
    expect(js).toContain('await loadIncidentsData()');
    expect(js).toContain('if (incidentToOpen?.id) openIncidentDetails(incidentToOpen.id)');
  });

  test('dashboard.js defines isResponderRole, isHeadRole, and isIncidentAssignedToCurrentResponder', () => {
    expect(js).toContain('function isResponderRole(');
    expect(js).toContain('function isHeadRole(');
    expect(js).toContain('function isIncidentAssignedToCurrentResponder(');
    expect(js).toContain('function getResponderAssignedEmergencyTypes(');
  });

  test('Responder Incidents view hides scope and status filters while showing the full incident list', () => {
    expect(js).toContain("if (scopeBanner) scopeBanner.style.display = 'none'");
    expect(js).toContain("if (incidentFilters) incidentFilters.style.display = 'none'");
    expect(js).toContain("if (incidentDirectoryPanel) incidentDirectoryPanel.style.display = 'none'");
    expect(js).toContain("if (incidentDirectoryPanel) incidentDirectoryPanel.style.display = ''");
    expect(js).toContain("const targetFilter = responderView ? 'all' : (filter || 'active_ongoing')");
    expect(js).toContain("list = list.filter(i => !String(i.responder_completion_report || '').trim())");
    expect(js).toContain("incidents.filter(i => !String(i.responder_completion_report || '').trim())");
    expect(js).toContain("return !hasCompletionReport && s !== 'resolved' && s !== 'cancelled' && s !== 'canceled';");
    expect(js).toContain('list = list.filter(i => !String(i.responder_completion_report || \'\').trim())');
    expect(js).toContain('incidents.filter(i => !String(i.responder_completion_report || \'\').trim())');
    const submitStart = js.indexOf('const submitResponderFinishTask = async () => {');
    const submitEnd = js.indexOf('const submitResponderCancellation = () => {', submitStart);
    const submitHandler = js.slice(submitStart, submitEnd);
    expect(submitHandler).toContain('setTimeout(() => {');
    expect(submitHandler).toContain('renderFullIncidentsTable(currentEmergencyIncidents);');
    expect(submitHandler).toContain('renderResponderRescueNotifications(currentEmergencyIncidents);');
    expect(submitHandler).toContain('updateIncidentFilterCounts(currentEmergencyIncidents);');
    expect(js).toContain('newestFirst.find((incident) => !String(incident.responder_completion_report || \'\').trim())');
    expect(js).not.toContain('const assignedTypes = getResponderAssignedEmergencyTypes(incidents)');
    expect(js).toContain('active_ongoing');
    expect(js).toContain('renderResponderRescueNotifications');
  });

  test('Responder dashboard alert notifications show only the latest incident without View All controls', () => {
    expect(html).toContain('id="overviewAlertsFilters"');
    expect(html).toContain('id="overviewAlertsViewAll"');
    expect(js).toContain("alertFilters.style.display = isResponder ? 'none' : ''");
    expect(js).toContain('const hideViewAllAlerts = isResponder || isHeadRole() || isSystemAdminRole()');
    expect(js).toContain("viewAllAlerts.style.display = hideViewAllAlerts ? 'none' : ''");
    expect(js).toContain('sorted.slice(0, isResponder ? 1 : 8)');
    expect(js).toContain('if (!isResponder && activeFilter && activeFilter !== \'all\')');
  });

  test('dashboard.js renderResponderRescueNotifications creates actionable rescue notification card with student details', () => {
    expect(js).toContain('RESCUE MISSION DISPATCHED BY HEAD COMMAND');
    expect(js).toContain('Action Required: Rescue Student');
    expect(js).toContain('Proceed to Rescue');
    expect(js).toContain('Emergency Chat');
  });
});
