const fs = require('fs');

// 1. UPDATE public/dashboard.css
let css = fs.readFileSync('public/dashboard.css', 'utf8');

const cssTarget = '.btn-drawer-generate:active {\r\n  transform: translateY(0);\r\n}';
const cssTargetAlt = '.btn-drawer-generate:active {\n  transform: translateY(0);\n}';

const newCss = `
/* Status locked styling when Resolved Report is selected */
.drawer-filter-group.status-locked select {
  background-color: #f1f5f9 !important;
  color: #64748b !important;
  cursor: not-allowed !important;
  border-color: #cbd5e1 !important;
}

/* Empty records warning sign inside export drawer */
.drawer-empty-notice {
  background: #fffbeb;
  border: 1.5px solid #fde68a;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  animation: fadeInNotice 0.2s ease-in-out;
}

@keyframes fadeInNotice {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}

.drawer-empty-notice .notice-icon {
  color: #d97706;
  font-size: 18px;
  margin-top: 2px;
  flex-shrink: 0;
}

.drawer-empty-notice .notice-text strong {
  display: block;
  font-size: 12px;
  color: #92400e;
  margin-bottom: 2px;
}

.drawer-empty-notice .notice-text p {
  margin: 0;
  font-size: 11px;
  color: #b45309;
  line-height: 1.4;
}

.drawer-record-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  transition: all 0.2s ease;
}

.drawer-record-badge.has-records {
  background: #dcfce7;
  color: #15803d;
  border-color: #86efac;
}

.drawer-record-badge.no-records {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}`;

if (css.includes(cssTarget)) {
  css = css.replace(cssTarget, cssTarget + '\n' + newCss);
} else if (css.includes(cssTargetAlt)) {
  css = css.replace(cssTargetAlt, cssTargetAlt + '\n' + newCss);
} else {
  css += '\n' + newCss;
}

fs.writeFileSync('public/dashboard.css', css, 'utf8');
console.log('public/dashboard.css updated successfully.');
