'use strict';
// Lightweight checks for the current static site; browser QA remains necessary.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const errors = [];
const read = (file) => {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); }
  catch { errors.push(`Missing file: ${file}`); return ''; }
};
const html = read('index.html');
if (read('CNAME').trim() !== 'akinside.com') errors.push('CNAME must contain akinside.com');
if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push('Expected exactly one h1');
const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*?)>/gi)];
const attrs = (s) => {
  const out = {};
  for (const m of s.matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
};
const ids = new Set();
const links = [];
const resources = [];
for (const [, name, raw] of tags) {
  const tag = name.toLowerCase();
  const a = attrs(raw);
  if (a.id) { if (ids.has(a.id)) errors.push(`Duplicate id: ${a.id}`); ids.add(a.id); }
  if (tag === 'a' && a.href && a.href.startsWith('#') && a.href !== '#') links.push(a.href.slice(1));
  if (tag === 'a' && a.target === '_blank') {
    const rel = new Set((a.rel || '').toLowerCase().split(/\s+/));
    if (!rel.has('noopener') || !rel.has('noreferrer')) errors.push(`External link missing safe rel: ${a.href || '(no href)'}`);
  }
  if (['script', 'img', 'source', 'iframe', 'video', 'audio', 'embed'].includes(tag) && a.src) resources.push([a.src, 'index.html']);
  if (tag === 'link' && /\b(stylesheet|icon|preload|modulepreload)\b/i.test(a.rel || '') && a.href) resources.push([a.href, 'index.html']);
}
for (const link of links) { let id; try { id = decodeURIComponent(link); } catch { id = link; } if (!ids.has(id)) errors.push(`Broken anchor: #${link}`); }
const projectSection = html.match(/<section\b[^>]*\bid=["']projects["'][^>]*>([\s\S]*?)<\/section>/i);
if (!projectSection) errors.push('Missing projects section');
else {
  const projectLinks = [...projectSection[1].matchAll(/<a\b([^<>]*?)>([\s\S]*?)<\/a>/gi)]
    .map(([, raw, label]) => ({ ...attrs(raw), label: label.replace(/<[^>]*>/g, '').trim() }));
  const requiredLinks = [
    ['https://github.com/ITStudioTemp/akinside-site', 'Исходный код'],
    ['https://freelance.ru/portfolio/project/view/1690759', 'Описание проекта'],
  ];
  for (const [href, label] of requiredLinks) {
    if (!projectLinks.some(link => link.href === href && link.label.startsWith(label))) errors.push(`Missing project link: ${label}`);
  }
  if (projectLinks.some(link => /^https?:\/\/(?:www\.)?akinside\.com\/?(?:[?#].*)?$/i.test(link.href || ''))) errors.push('Project section must not link to the current site');
}
const illustration = html.match(/<div class="inspection">([\s\S]*?)<ol class="inspection-stages"/i);
if (!illustration) errors.push('Missing illustration controls');
else {
  const controls = [...illustration[1].matchAll(/<(input|button|label)\b([^<>]*?)>/gi)]
    .map(([, name, raw]) => ({ name: name.toLowerCase(), ...attrs(raw) }));
  const checkbox = controls.filter(control => control.name === 'input');
  const labels = controls.filter(control => control.name === 'label');
  if (checkbox.length !== 1 || checkbox[0].id !== 'inside-fallback' || checkbox[0].type !== 'checkbox' || Object.hasOwn(checkbox[0], 'hidden') || Object.hasOwn(checkbox[0], 'disabled')) errors.push('Illustration must have one enabled native checkbox');
  if (labels.length !== 1 || labels[0].for !== 'inside-fallback' || Object.hasOwn(labels[0], 'hidden')) errors.push('Illustration must have one visible associated label');
  if (controls.some(control => control.name === 'button')) errors.push('Illustration must not have a second control');
}

const checked = new Set();
function checkResource(ref, from) {
  if (/^(?:data:|#)/i.test(ref)) return;
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(ref)) {
    let url; try { url = new URL(ref, 'https://akinside.com'); } catch { errors.push(`Invalid resource URL: ${ref}`); return; }
    if (url.origin !== 'https://akinside.com') { errors.push(`Third-party resource: ${ref}`); return; }
    ref = url.pathname;
  }
  const clean = ref.split(/[?#]/)[0];
  let decoded; try { decoded = decodeURIComponent(clean); } catch { errors.push(`Invalid resource path: ${ref}`); return; }
  const file = decoded.startsWith('/') ? path.resolve(root, '.' + decoded) : path.resolve(root, path.dirname(from), decoded);
  if (file !== root && !file.startsWith(root + path.sep)) { errors.push(`Resource outside site: ${ref}`); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { errors.push(`Missing resource: ${ref} (${from})`); return; }
  if (checked.has(file)) return;
  checked.add(file);
  const rel = path.relative(root, file);
  if (/\.css$/i.test(file)) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/gi)) checkResource(m[1].trim(), rel);
    for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/gi)) checkResource(m[1], rel);
  }
  if (/\.m?js$/i.test(file)) {
    const js = fs.readFileSync(file, 'utf8');
    if (/\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|sendBeacon\s*\()/i.test(js)) errors.push(`Network API requires review: ${rel}`);
  }
}
for (const [ref, from] of resources) checkResource(ref, from);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Site structure, assets, fallback and CNAME checks passed.');
