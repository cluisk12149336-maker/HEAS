const fs = require('fs');
const html = fs.readFileSync('public/dashboard.html', 'utf8');
const js = fs.readFileSync('public/dashboard.js', 'utf8');

// Find all onclick attributes
const onclickRegex = /onclick="([^"]+)"/g;
let match;
const inlineCalls = new Set();
while ((match = onclickRegex.exec(html)) !== null) {
  const handler = match[1];
  // extract potential function names
  const fns = handler.match(/([a-zA-Z0-9_$]+)\s*\(/g) || [];
  for (const f of fns) {
    const fnName = f.replace('(', '').trim();
    if (!['if', 'close', 'stopPropagation', 'preventDefault', 'alert', 'confirm', 'querySelector'].includes(fnName)) {
      inlineCalls.add(fnName);
    }
  }
}

console.log('Inline functions called in HTML onclick:');
console.log([...inlineCalls]);

console.log('\nChecking if functions are exposed to window:');
for (const fn of inlineCalls) {
  // Check if defined at root: function fnName(
  // or window.fnName =
  const rootFn = js.match(new RegExp('^function\\s+' + fn + '\\b', 'm'));
  const windowFn = js.match(new RegExp('window\\.' + fn + '\\s*=', 'm'));
  const constFn = js.match(new RegExp('^(?:const|let|var)\\s+' + fn + '\\s*=', 'm'));
  
  // Also check if inside any function or DOMContentLoaded
  const anyFn = js.match(new RegExp('\\bfunction\\s+' + fn + '\\b'));
  
  console.log(`${fn}: rootFn=${!!rootFn}, windowFn=${!!windowFn}, constFn=${!!constFn}, anyFn=${!!anyFn}`);
}
