const fs = require('fs');
const path = require('path');

// 1. UPDATE public/dashboard.html
let html = fs.readFileSync('public/dashboard.html', 'utf8');

// A. Add drawerRecordBadge in the Filters heading
const filterHeadingOld = '<div class="drawer-section-heading">\r\n          <iconify-icon icon="solar:filter-bold" class="heading-icon"></iconify-icon>\r\n          <span>Filters:</span>\r\n        </div>';
const filterHeadingAlt = '<div class="drawer-section-heading">\n          <iconify-icon icon="solar:filter-bold" class="heading-icon"></iconify-icon>\n          <span>Filters:</span>\n        </div>';

const filterHeadingNew = `<div class="drawer-section-heading" style="justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 7px;">
            <iconify-icon icon="solar:filter-bold" class="heading-icon"></iconify-icon>
            <span>Filters:</span>
          </div>
          <span class="drawer-record-badge" id="drawerRecordBadge">Checking records...</span>
        </div>`;

if (html.includes(filterHeadingOld)) {
  html = html.replace(filterHeadingOld, filterHeadingNew);
} else if (html.includes(filterHeadingAlt)) {
  html = html.replace(filterHeadingAlt, filterHeadingNew);
} else {
  console.warn('filterHeading pattern not found directly, checking regex...');
  html = html.replace(/<div class="drawer-section-heading">\s*<iconify-icon icon="solar:filter-bold"[^>]*><\/iconify-icon>\s*<span>Filters:<\/span>\s*<\/div>/, filterHeadingNew);
}

// B. Add id="drawerStatusFilterGroup" and drawerStatusLockedNote to Status filter group
const statusGroupOld = `<div class="drawer-filter-group">
          <label for="drawerStatusSelect">Status:</label>
          <div class="drawer-select-wrapper">
            <select id="drawerStatusSelect" class="drawer-select">`;

const statusGroupNew = `<div class="drawer-filter-group" id="drawerStatusFilterGroup">
          <label for="drawerStatusSelect">Status:</label>
          <div class="drawer-select-wrapper" id="drawerStatusWrapper">
            <select id="drawerStatusSelect" class="drawer-select">`;

html = html.replace(statusGroupOld, statusGroupNew);

// Add locked note after the select wrapper
const statusCloseSelect = `</select>
          </div>
        </div>

        <div class="drawer-filter-group">
          <label for="drawerCategorySelect">Category:</label>`;

const statusCloseSelectNew = `</select>
          </div>
          <small id="drawerStatusLockedNote" style="display:none; color:#15803d; font-size:11px; font-weight:600; margin-top:2px;">
            <iconify-icon icon="solar:lock-bold" style="vertical-align:middle;"></iconify-icon> Status locked to Resolved for Resolved Report
          </small>
        </div>

        <div class="drawer-filter-group">
          <label for="drawerCategorySelect">Category:</label>`;

html = html.replace(statusCloseSelect, statusCloseSelectNew);

// C. Add drawerNoRecordsNotice before Action button
const noteBoxOld = `<!-- 4. Note Box -->
      <div class="drawer-note-box">
        <iconify-icon icon="solar:info-circle-bold" class="drawer-note-icon"></iconify-icon>
        <div class="drawer-note-text">
          <strong>Note:</strong> PDF and Excel-compatible CSV download automatically. Print opens the print dialog.
        </div>
      </div>`;

const noteBoxNew = `<!-- 4. Note Box -->
      <div class="drawer-note-box">
        <iconify-icon icon="solar:info-circle-bold" class="drawer-note-icon"></iconify-icon>
        <div class="drawer-note-text">
          <strong>Note:</strong> PDF and Excel-compatible CSV download automatically. Print opens the print dialog.
        </div>
      </div>

      <!-- No Records Notification Sign -->
      <div id="drawerNoRecordsNotice" class="drawer-empty-notice" style="display:none;">
        <iconify-icon icon="solar:danger-triangle-bold" class="notice-icon"></iconify-icon>
        <div class="notice-text">
          <strong>No matching records found</strong>
          <p>There are no incident records matching the selected report type (<span id="noRecordsReportType">Resolved Report</span>) and filters in the database.</p>
        </div>
      </div>`;

html = html.replace(noteBoxOld, noteBoxNew);

fs.writeFileSync('public/dashboard.html', html, 'utf8');
console.log('public/dashboard.html updated successfully.');
