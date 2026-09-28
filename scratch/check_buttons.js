const fs = require('fs');
const html = fs.readFileSync('public/dashboard.html', 'utf8');
const js = fs.readFileSync('public/dashboard.js', 'utf8');

const onclickMatches = [...html.matchAll(/onclick=["']([^"']+)["']/g)];
console.log('Found ' + onclickMatches.length + ' onclick attributes in HTML');
const missingFns = [];
for (const match of onclickMatches) {
  const handler = match[1];
  const fnCalls = handler.match(/([a-zA-Z0-9_$]+)\s*\(/g) || [];
  for (const call of fnCalls) {
    const fnName = call.replace('(', '').trim();
    if (['close', 'stopPropagation', 'preventDefault', 'alert', 'confirm'].includes(fnName)) continue;
    const hasDef = js.includes('function ' + fnName) || js.includes(fnName + ' =') || js.includes(fnName + '=') || js.includes('window.' + fnName);
    if (!hasDef) {
      console.log('Missing function:', fnName, 'in handler:', handler);
      missingFns.push(fnName);
    }
  }
}
if (missingFns.length === 0) console.log('All onclick functions exist in JS!');

console.log('\n--- GETELEMENTBYID IN JS ---');
const idMatches = [...new Set([...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]))];
const missingIds = [];
for (const id of idMatches) {
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missingIds.push(id);
  }
}
console.log('Missing element IDs in HTML (' + missingIds.length + '):', missingIds);

console.log('\n--- QUERYSELECTOR IN JS WITH # ---');
const qsMatches = [...new Set([...js.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map(m => m[1]))];
const missingQs = [];
for (const id of qsMatches) {
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missingQs.push(id);
  }
}
console.log('Missing querySelector IDs in HTML (' + missingQs.length + '):', missingQs);
