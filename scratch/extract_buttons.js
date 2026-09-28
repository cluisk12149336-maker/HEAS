const fs = require('fs');

const html = fs.readFileSync('public/dashboard.html', 'utf8');
const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
let match;
const buttons = [];
while ((match = buttonRegex.exec(html)) !== null) {
  const attrs = match[1];
  const rawText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = attrs.match(/id=['"]([^'"]+)['"]/i);
  const onclickMatch = attrs.match(/onclick=['"]([^'"]+)['"]/i);
  const classMatch = attrs.match(/class=['"]([^'"]+)['"]/i);
  const typeMatch = attrs.match(/type=['"]([^'"]+)['"]/i);
  buttons.push({
    id: idMatch ? idMatch[1] : null,
    text: rawText.slice(0, 40),
    onclick: onclickMatch ? onclickMatch[1] : null,
    className: classMatch ? classMatch[1] : '',
    type: typeMatch ? typeMatch[1] : 'button'
  });
}

console.log(`Found ${buttons.length} buttons in dashboard.html:`);
buttons.forEach((b, i) => {
  console.log(`${i+1}. id: "${b.id || ''}" | class: "${b.className}" | onclick: "${b.onclick || ''}" | text: "${b.text}"`);
});
