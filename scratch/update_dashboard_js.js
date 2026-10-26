const fs = require('fs');

let js = fs.readFileSync('public/dashboard.js', 'utf8');

// 1. Update selectReportType and openExportDrawer and drawer functions
const targetOpenExport = 'function openExportDrawer() {';
const targetSelectReportType = 'function selectReportType(type) {';
const targetHandleDrawerExport = 'async function handleDrawerExport() {';
const targetGenerateExport = 'async function generateAndExportReport(options) {';
const targetDownloadAll = 'function downloadAllIncidentsPdf() {';

const idxOpen = js.indexOf(targetOpenExport);
const idxDownloadAll = js.indexOf(targetDownloadAll);

if (idxOpen === -1 || idxDownloadAll === -1) {
  console.error('Target function markers not found!', { idxOpen, idxDownloadAll });
  process.exit(1);
}

const newDrawerSection = `function openExportDrawer() {
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

  // Check matching records and update live status sign
  updateExportDrawerPreview();

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
  const statusNote = document.getElementById('drawerStatusLockedNote');
  const statusGroup = document.getElementById('drawerStatusFilterGroup');

  // REQUIREMENT: When resolved report is selected, block / disable the status selection
  if (type === 'resolved') {
    if (statusSelect) {
      if (!statusSelect.disabled) {
        statusSelect.dataset.prevStatus = statusSelect.value;
      }
      statusSelect.value = 'Resolved';
      statusSelect.disabled = true;
      statusSelect.title = 'Status selection is locked to Resolved when Resolved Report is selected.';
    }
    if (statusNote) statusNote.style.display = 'block';
    if (statusGroup) statusGroup.classList.add('status-locked');
  } else {
    // Re-enable status selection for standard reports
    if (statusSelect) {
      statusSelect.disabled = false;
      statusSelect.removeAttribute('title');
      if (statusSelect.dataset.prevStatus && statusSelect.dataset.prevStatus !== 'Resolved') {
        statusSelect.value = statusSelect.dataset.prevStatus;
      } else {
        const mainStatus = document.getElementById('reportStatusFilter');
        statusSelect.value = mainStatus ? mainStatus.value : 'all';
      }
    }
    if (statusNote) statusNote.style.display = 'none';
    if (statusGroup) statusGroup.classList.remove('status-locked');
  }

  updateExportDrawerPreview();
}

async function updateExportDrawerPreview() {
  const badge = document.getElementById('drawerRecordBadge');
  const notice = document.getElementById('drawerNoRecordsNotice');
  const reportTypeSpan = document.getElementById('noRecordsReportType');
  const generateBtn = document.getElementById('btnDrawerGenerateExport');

  const drawerStatus = document.getElementById('drawerStatusSelect');
  const drawerCategory = document.getElementById('drawerCategorySelect');
  const drawerSearch = document.getElementById('drawerSearchInput');
  const drawerSort = document.getElementById('drawerSortSelect');
  const drawerStartDate = document.getElementById('drawerStartDate');
  const drawerEndDate = document.getElementById('drawerEndDate');

  const isResolved = currentExportReportType === 'resolved';
  const status = isResolved ? 'Resolved' : (drawerStatus ? drawerStatus.value : 'all');
  const category = drawerCategory ? drawerCategory.value : 'all';
  const search = drawerSearch ? drawerSearch.value.trim() : '';
  const sort = drawerSort ? drawerSort.value : 'desc';
  const startDate = drawerStartDate ? drawerStartDate.value : '';
  const endDate = drawerEndDate ? drawerEndDate.value : '';

  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (category !== 'all') params.set('category', category);
  if (search) params.set('search', search);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (sort) params.set('sort', sort);
  if (reportsShowArchived) params.set('archived', 'true');

  try {
    const res = await fetch(\`/api/reports/incidents?\${params.toString()}\`);
    if (!res.ok) throw new Error('Failed to query incidents');
    const data = await res.json();
    let incidents = data.incidents || [];

    if (isResolved) {
      incidents = incidents.filter(i => (i.status || '').toLowerCase() === 'resolved');
    }

    const count = incidents.length;
    if (badge) {
      badge.textContent = \`\${count} record\${count === 1 ? '' : 's'} found\`;
      badge.className = \`drawer-record-badge \${count > 0 ? 'has-records' : 'no-records'}\`;
    }

    // REQUIREMENT: Notification or sign when there are no records for that specific selected report type
    if (count === 0) {
      if (notice) notice.style.display = 'flex';
      if (reportTypeSpan) reportTypeSpan.textContent = isResolved ? 'Resolved Report' : 'Just Report';
      if (generateBtn) {
        generateBtn.title = 'No records found for current filters.';
      }
    } else {
      if (notice) notice.style.display = 'none';
      if (generateBtn) {
        generateBtn.removeAttribute('title');
      }
    }
    return count;
  } catch (err) {
    console.warn('Preview query error:', err);
    return -1;
  }
}

async function handleDrawerExport() {
  const drawerStatus = document.getElementById('drawerStatusSelect');
  const drawerCategory = document.getElementById('drawerCategorySelect');
  const drawerSearch = document.getElementById('drawerSearchInput');
  const drawerSort = document.getElementById('drawerSortSelect');
  const drawerStartDate = document.getElementById('drawerStartDate');
  const drawerEndDate = document.getElementById('drawerEndDate');

  const isResolved = currentExportReportType === 'resolved';
  const status = isResolved ? 'Resolved' : (drawerStatus ? drawerStatus.value : 'all');
  const category = drawerCategory ? drawerCategory.value : 'all';
  const search = drawerSearch ? drawerSearch.value.trim() : '';
  const sort = drawerSort ? drawerSort.value : 'desc';
  const startDate = drawerStartDate ? drawerStartDate.value : '';
  const endDate = drawerEndDate ? drawerEndDate.value : '';

  // REQUIREMENT: Check if there are records; notify user if no records found
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (category !== 'all') params.set('category', category);
  if (search) params.set('search', search);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (sort) params.set('sort', sort);
  if (reportsShowArchived) params.set('archived', 'true');

  try {
    const res = await fetch(\`/api/reports/incidents?\${params.toString()}\`);
    if (res.ok) {
      const data = await res.json();
      let incidents = data.incidents || [];
      if (isResolved) {
        incidents = incidents.filter(i => (i.status || '').toLowerCase() === 'resolved');
      }

      if (incidents.length === 0) {
        const typeLabel = isResolved ? 'Resolved Report' : 'Just Report';
        showToast(\`Notice: No records found for \${typeLabel} with the current filter criteria.\`, 'warning');
        const notice = document.getElementById('drawerNoRecordsNotice');
        if (notice) notice.style.display = 'flex';
        return;
      }
    }
  } catch (e) {
    // Proceed if probe fails
  }

  if (currentExportFormat === 'excel') {
    const exportParams = new URLSearchParams();
    exportParams.set('format', currentExportFormat);
    if (isResolved) exportParams.set('reportType', 'resolved');
    if (status !== 'all') exportParams.set('status', status);
    if (category !== 'all') exportParams.set('category', category);
    if (search) exportParams.set('search', search);
    if (startDate) exportParams.set('startDate', startDate);
    if (endDate) exportParams.set('endDate', endDate);
    if (sort) exportParams.set('sort', sort);
    if (reportsShowArchived) exportParams.set('archived', 'true');

    const downloadLink = document.createElement('a');
    downloadLink.href = \`/api/reports/export?\${exportParams.toString()}\`;
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

function downloadServerPdf(options = {}) {
  const isResolved = options.reportType === 'resolved';
  const params = new URLSearchParams();
  params.set('format', 'pdf');
  if (isResolved) params.set('reportType', 'resolved');
  if (options.status && options.status !== 'all') params.set('status', options.status);
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.search) params.set('search', options.search);
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);
  if (options.sort) params.set('sort', options.sort);
  if (reportsShowArchived) params.set('archived', 'true');

  const downloadLink = document.createElement('a');
  downloadLink.href = \`/api/reports/export?\${params.toString()}\`;
  downloadLink.download = isResolved ? 'heas-resolved-incidents-report.pdf' : 'heas-incidents-report.pdf';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  showToast('Downloading official PDF report...');
}

async function generateAndExportReport(options) {
  try {
    const isResolvedReport = options.reportType === 'resolved';
    showToast(\`Generating \${isResolvedReport ? 'Resolved' : 'Incident'} \${options.format.toUpperCase()} report...\`);

    const params = new URLSearchParams();
    if (options.status !== 'all') params.set('status', options.status);
    if (options.category !== 'all') params.set('category', options.category);
    if (options.search) params.set('search', options.search);
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    if (options.sort) params.set('sort', options.sort);
    if (reportsShowArchived) params.set('archived', 'true');

    const res = await fetch(\`/api/reports/incidents?\${params.toString()}\`);
    if (!res.ok) throw new Error('Failed to retrieve incident telemetry for export');
    const data = await res.json();
    let incidents = data.incidents || [];

    if (isResolvedReport) {
      incidents = incidents.filter(i => (i.status || '').toLowerCase() === 'resolved');
    }

    // REQUIREMENT: Check if there are no records for that specific selected report type
    if (incidents.length === 0) {
      const typeLabel = isResolvedReport ? 'Resolved Report' : 'Just Report';
      showToast(\`Notice: No records found for \${typeLabel} with the selected filters.\`, 'warning');
      return;
    }

    // Explicit sorting enforcement (asc vs desc)
    incidents.sort((a, b) => {
      const dateA = new Date((isResolvedReport && a.resolved_at) ? a.resolved_at : a.created_at).getTime() || 0;
      const dateB = new Date((isResolvedReport && b.resolved_at) ? b.resolved_at : b.created_at).getTime() || 0;
      return options.sort === 'asc' ? dateA - dateB : dateB - dateA;
    });

    const reportTitle = isResolvedReport
      ? 'Resolved Incidents &amp; Resolution Summary Report'
      : 'Comprehensive Campus Emergency Incident Report';
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const filterInfo = [
      \`Status: \${options.status === 'all' || !options.status ? (isResolvedReport ? 'Resolved Only' : 'All Statuses') : options.status}\`,
      \`Category: \${options.category === 'all' || !options.category ? 'All Categories' : options.category}\`,
      options.startDate ? \`From: \${options.startDate}\` : '',
      options.endDate ? \`To: \${options.endDate}\` : '',
      options.search ? \`Query: "\${options.search}"\` : ''
    ].filter(Boolean).join(' &bull; ');

    const totalRecords = incidents.length;
    let countActive = 0;
    let countOngoing = 0;
    let countResolved = 0;
    let countCancelled = 0;

    incidents.forEach(inc => {
      const s = (inc.status || '').toLowerCase().replace(/[^a-z]/g, '');
      if (s === 'resolved') countResolved++;
      else if (s === 'pending' || s === 'ongoing' || s === 'responder') countOngoing++;
      else if (s === 'cancelled' || s === 'canceled') countCancelled++;
      else countActive++;
    });

    let tableHeaders = '';
    let tableRows = '';

    if (isResolvedReport) {
      tableHeaders = \`
        <tr style="background: #0d3b4f; color: #ffffff;">
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 12%;">Incident ID</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 13%;">Category</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 19%;">Student / Reporter</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 20%;">Location</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 11%;">Status</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 11%;">Duration</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; width: 14%;">Assigned Unit</th>
        </tr>
      \`;

      tableRows = incidents.map((inc, idx) => {
        let durationStr = 'N/A';
        if (inc.created_at && inc.resolved_at) {
          const diffMs = new Date(inc.resolved_at) - new Date(inc.created_at);
          if (diffMs > 0) {
            const mins = Math.round(diffMs / 60000);
            durationStr = mins < 60 ? \`\${mins} mins\` : \`\${Math.floor(mins / 60)}h \${mins % 60}m\`;
          } else {
            durationStr = '< 1 min';
          }
        }

        const catLower = (inc.category || '').toLowerCase();
        let catBadgeBg = '#fee2e2';
        let catBadgeColor = '#991b1b';
        let catBadgeBorder = '#fca5a5';
        let catSymbol = '&#9888;';
        if (catLower.includes('med')) {
          catBadgeBg = '#dcfce7'; catBadgeColor = '#15803d'; catBadgeBorder = '#86efac'; catSymbol = '&#9829;';
        } else if (catLower.includes('sec')) {
          catBadgeBg = '#fef3c7'; catBadgeColor = '#b45309'; catBadgeBorder = '#fde68a'; catSymbol = '&#9670;';
        } else if (catLower.includes('vicin') || catLower.includes('campus')) {
          catBadgeBg = '#e0e7ff'; catBadgeColor = '#4338ca'; catBadgeBorder = '#c7d2fe'; catSymbol = '&#9679;';
        }

        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const studentName = escapeHtml(inc.student_name || 'Student Reporter');
        const studentId = inc.student_id ? escapeHtml(inc.student_id) : 'ID N/A';
        const resolutionSummary = inc.resolution_summary ? escapeHtml(inc.resolution_summary) : '';

        return \`
          <tr style="background: \${rowBg}; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 9px 12px; font-family: 'Consolas', 'Courier New', monospace; font-weight: 800; font-size: 11px; color: #0d3b4f; border-right: 1px solid #e2e8f0;">
              \${escapeHtml(inc.incident_code || inc.id)}
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2.5px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background: \${catBadgeBg}; color: \${catBadgeColor}; border: 1px solid \${catBadgeBorder}; text-transform: uppercase;">
                <span style="font-size: 8.5px;">\${catSymbol}</span> \${escapeHtml(inc.category || 'Medical')}
              </span>
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #0f172a; font-size: 11.5px;">\${studentName}</div>
              <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">ID: \${studentId}</div>
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <div style="color: #334155; font-size: 11px; line-height: 1.35;">\${escapeHtml(inc.location_address || 'UMak Campus')}</div>
              \${resolutionSummary ? \`<div style="font-size: 9.5px; color: #15803d; margin-top: 3px; font-style: italic;">Res: \${resolutionSummary}</div>\` : ''}
            </td>
            <td style="padding: 9px 12px; text-align: center; border-right: 1px solid #e2e8f0;">
              <span style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 2.5px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background: #dcfce7; color: #15803d; border: 1px solid #86efac;">
                <span style="width: 5px; height: 5px; border-radius: 50%; background: #16a34a;"></span> Resolved
              </span>
            </td>
            <td style="padding: 9px 12px; text-align: center; border-right: 1px solid #e2e8f0; font-size: 11px; font-weight: 700; color: #0f172a;">
              \${escapeHtml(durationStr)}
            </td>
            <td style="padding: 9px 12px; font-size: 11px; color: #334155;">
              \${escapeHtml(inc.responder_name || 'Campus Emergency Unit')}
            </td>
          </tr>
        \`;
      }).join('');
    } else {
      tableHeaders = \`
        <tr style="background: #0d3b4f; color: #ffffff;">
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 13%;">Incident ID</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 14%;">Category</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 22%;">Student / Reporter</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 23%;">Location</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1px solid rgba(255,255,255,0.12); width: 12%;">Status</th>
          <th style="padding: 10px 12px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; width: 16%;">Reported Time</th>
        </tr>
      \`;

      tableRows = incidents.map((inc, idx) => {
        const rawSt = (inc.status || '').toLowerCase().replace(/[^a-z]/g, '');
        let dispStatus = 'Active';
        let statusBg = '#fee2e2';
        let statusColor = '#b91c1c';
        let statusBorder = '#fca5a5';
        let statusDot = '#dc2626';

        if (rawSt === 'resolved') {
          dispStatus = 'Resolved';
          statusBg = '#dcfce7';
          statusColor = '#15803d';
          statusBorder = '#86efac';
          statusDot = '#16a34a';
        } else if (rawSt === 'pending' || rawSt === 'ongoing' || rawSt === 'responder') {
          dispStatus = 'On Going';
          statusBg = '#fef3c7';
          statusColor = '#b45309';
          statusBorder = '#fde68a';
          statusDot = '#d97706';
        } else if (rawSt === 'cancelled' || rawSt === 'canceled') {
          dispStatus = 'Cancelled';
          statusBg = '#f1f5f9';
          statusColor = '#475569';
          statusBorder = '#cbd5e1';
          statusDot = '#64748b';
        }

        const catLower = (inc.category || '').toLowerCase();
        let catBadgeBg = '#fee2e2';
        let catBadgeColor = '#991b1b';
        let catBadgeBorder = '#fca5a5';
        let catSymbol = '&#9888;';
        if (catLower.includes('med')) {
          catBadgeBg = '#dcfce7'; catBadgeColor = '#15803d'; catBadgeBorder = '#86efac'; catSymbol = '&#9829;';
        } else if (catLower.includes('sec')) {
          catBadgeBg = '#fef3c7'; catBadgeColor = '#b45309'; catBadgeBorder = '#fde68a'; catSymbol = '&#9670;';
        } else if (catLower.includes('vicin') || catLower.includes('campus')) {
          catBadgeBg = '#e0e7ff'; catBadgeColor = '#4338ca'; catBadgeBorder = '#c7d2fe'; catSymbol = '&#9679;';
        }

        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const studentName = escapeHtml(inc.student_name || 'Student Reporter');
        const studentId = inc.student_id ? escapeHtml(inc.student_id) : 'ID N/A';
        const formattedTime = inc.created_at
          ? new Date(inc.created_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
          : 'N/A';

        return \`
          <tr style="background: \${rowBg}; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 9px 12px; font-family: 'Consolas', 'Courier New', monospace; font-weight: 800; font-size: 11px; color: #0d3b4f; border-right: 1px solid #e2e8f0;">
              \${escapeHtml(inc.incident_code || inc.id)}
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2.5px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background: \${catBadgeBg}; color: \${catBadgeColor}; border: 1px solid \${catBadgeBorder}; text-transform: uppercase;">
                <span style="font-size: 8.5px;">\${catSymbol}</span> \${escapeHtml(inc.category || 'Medical')}
              </span>
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #0f172a; font-size: 11.5px;">\${studentName}</div>
              <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">ID: \${studentId}</div>
            </td>
            <td style="padding: 9px 12px; border-right: 1px solid #e2e8f0;">
              <div style="color: #334155; font-size: 11px; line-height: 1.35;">\${escapeHtml(inc.location_address || 'UMak Campus')}</div>
              \${inc.incident_detail ? \`<div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">\${escapeHtml(inc.incident_detail)}</div>\` : ''}
            </td>
            <td style="padding: 9px 12px; text-align: center; border-right: 1px solid #e2e8f0;">
              <span style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 2.5px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background: \${statusBg}; color: \${statusColor}; border: 1px solid \${statusBorder};">
                <span style="width: 5px; height: 5px; border-radius: 50%; background: \${statusDot};"></span>
                \${escapeHtml(dispStatus)}
              </span>
            </td>
            <td style="padding: 9px 12px; font-size: 10.5px; color: #334155;">
              \${escapeHtml(formattedTime)}
            </td>
          </tr>
        \`;
      }).join('');
    }

    const htmlContent = \`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px 28px; background: #ffffff; width: 1040px; box-sizing: border-box;">
        <!-- Institutional Header Banner -->
        <div style="border-bottom: 2.5px solid #0d3b4f; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #0d3b4f 0%, #1e5a73 100%); border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 800; font-size: 20px; box-shadow: 0 2px 6px rgba(13,59,79,0.3);">
              H
            </div>
            <div>
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #0284c7; font-weight: 800;">
                University of Makati &bull; Campus Safety &amp; Emergency Command
              </div>
              <h1 style="margin: 2px 0 0; font-size: 19px; font-weight: 800; color: #0d3b4f; letter-spacing: -0.4px;">
                HERON'S EMERGENCY ALERT SYSTEM (HEAS)
              </h1>
              <div style="font-size: 12.5px; color: #475569; font-weight: 600; margin-top: 2px;">
                \${reportTitle}
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 8px; font-size: 9.5px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">
              CONFIDENTIAL &bull; FOR OFFICIAL USE ONLY
            </span>
            <div style="font-size: 10.5px; color: #64748b;"><strong>Generated:</strong> \${timestamp}</div>
            <div style="font-size: 10.5px; color: #64748b;"><strong>Console:</strong> HEAS Security Admin</div>
          </div>
        </div>

        <!-- Filters & Summary Metric Strip -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="font-size: 11px; color: #334155;">
            <span style="color: #64748b; font-weight: 600;">Criteria:</span>
            <strong style="color: #0f172a;">\${filterInfo}</strong>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;">
              Total: \${totalRecords}
            </span>
            <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;">
              Active: \${countActive}
            </span>
            <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">
              On Going: \${countOngoing}
            </span>
            <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;">
              Resolved: \${countResolved}
            </span>
          </div>
        </div>

        <!-- Main Structured Incidents Table -->
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; margin-bottom: 20px;">
          <thead>\${tableHeaders}</thead>
          <tbody>
            \${tableRows.length > 0 ? tableRows : '<tr><td colspan="7" style="text-align: center; padding: 32px; color: #64748b; font-size: 12px; background: #ffffff;">No incident records match the selected export criteria.</td></tr>'}
          </tbody>
        </table>

        <!-- Official Institutional Sign-off Footer -->
        <div style="border-top: 1.5px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #94a3b8;">
          <div>
            Certified Official Telemetry Audit &bull; University of Makati Heron's Emergency Alert System (HEAS)
          </div>
          <div>
            Record Verification: <strong>HEAS-SEC-PASS</strong> &bull; Total Incidents Listed: \${totalRecords}
          </div>
        </div>
      </div>
    \`;

    if (options.format === 'pdf') {
      const container = document.createElement('div');
      container.id = 'heas-pdf-render-container';
      container.style.position = 'fixed';
      container.style.left = '-99999px';
      container.style.top = '0';
      container.style.width = '1040px';
      container.style.background = '#ffffff';
      container.style.zIndex = '-999';
      container.innerHTML = htmlContent;
      document.body.appendChild(container);

      const filename = isResolvedReport ? 'HEAS-Resolved-Incidents-Report.pdf' : 'HEAS-Campus-Incidents-Report.pdf';

      if (typeof html2pdf !== 'undefined') {
        const opt = {
          margin: [8, 8, 8, 8],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf()
          .set(opt)
          .from(container)
          .save()
          .then(() => {
            showToast('PDF downloaded successfully.', 'success');
          })
          .catch((pdfErr) => {
            console.warn('html2pdf client rendering failed, using server PDF fallback:', pdfErr);
            downloadServerPdf(options);
          })
          .finally(() => {
            if (container && container.parentNode) {
              container.parentNode.removeChild(container);
            }
          });
      } else {
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
        downloadServerPdf(options);
      }
    } else if (options.format === 'print') {
      const reportWindow = window.open('', '_blank');
      if (!reportWindow) {
        showToast('Pop-up blocked. Please allow pop-ups to print.', 'error');
        return;
      }
      reportWindow.document.write('<!DOCTYPE html><html><head><title>' + reportTitle + '</title><style>@page{size: landscape; margin: 10mm;}</style></head><body style="margin:0;padding:0;">' + htmlContent + '<script>window.onload=function(){window.print();}</script></body></html>');
      reportWindow.document.close();
    }
  } catch (err) {
    console.error('Error generating report:', err);
    showToast('Failed to generate export report: ' + err.message, 'error');
    downloadServerPdf(options);
  }
}
`;

js = js.slice(0, idxOpen) + newDrawerSection + js.slice(idxDownloadAll);

// Attach event listeners in initReportsModule for drawer inputs
const initReportsTarget = "if (exportCsvBtn) {";
const drawerListeners = `  // Live sync & preview listeners for export drawer controls
  ['drawerStatusSelect', 'drawerCategorySelect', 'drawerSortSelect', 'drawerStartDate', 'drawerEndDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => updateExportDrawerPreview());
  });
  const drawerSearchEl = document.getElementById('drawerSearchInput');
  if (drawerSearchEl) {
    let dDebounce;
    drawerSearchEl.addEventListener('input', () => {
      clearTimeout(dDebounce);
      dDebounce = setTimeout(() => updateExportDrawerPreview(), 250);
    });
  }

  if (exportCsvBtn) {`;

if (js.includes(initReportsTarget) && !js.includes("drawerSearchEl")) {
  js = js.replace(initReportsTarget, drawerListeners);
}

// Window exports
if (!js.includes('window.updateExportDrawerPreview = updateExportDrawerPreview;')) {
  js = js.replace(
    'window.generateAndExportReport = generateAndExportReport;',
    'window.generateAndExportReport = generateAndExportReport;\nwindow.updateExportDrawerPreview = updateExportDrawerPreview;\nwindow.downloadServerPdf = downloadServerPdf;'
  );
}

fs.writeFileSync('public/dashboard.js', js, 'utf8');
console.log('public/dashboard.js updated successfully.');
