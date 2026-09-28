const fs = require('fs');
const html = fs.readFileSync('public/dashboard.html', 'utf8');

const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
let match;
let i = 0;
while ((match = btnRegex.exec(html)) !== null && i < 35) {
  i++;
  const attrs = match[1];
  const content = match[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ').substring(0, 40);
  const idMatch = attrs.match(/id=["']([^"']+)["']/);
  const onclickMatch = attrs.match(/onclick=["']([^"']+)["']/);
  const classMatch = attrs.match(/class=["']([^"']+)["']/);
  console.log(`[${i}] ID: "${idMatch ? idMatch[1] : ''}" | Text: "${content}" | onclick: "${onclickMatch ? onclickMatch[1] : ''}" | class: "${classMatch ? classMatch[1] : ''}"`);
}
