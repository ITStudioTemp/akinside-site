const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildGrid, nodeState, connectionState, scrollProgress, mount } = require('../assets/system-field.js');

test('the field begins as connected hollow modules and ends dispersed', () => {
  const field = buildGrid(1200, 800);
  assert.ok(field.nodes.length > 50);
  assert.ok(field.links.length > field.nodes.length);
  for (const node of field.nodes) {
    const before = nodeState(node, 0, field);
    const after = nodeState(node, 1, field);
    assert.equal(before.x, node.x);
    assert.equal(before.y, node.y);
    assert.equal(before.opacity, 1);
    assert.ok(after.displacement > 0);
    assert.ok(after.opacity >= .5 && after.opacity <= .6);
  }
  assert.ok(field.links.every(link => connectionState(link, 1, field).opacity === 0));
});

test('squares measure 7px with 23px edge gaps at all viewport widths', () => {
  for (const width of [360, 768, 1280, 1440, 1920]) {
    const field = buildGrid(width, 800);
    assert.equal(field.size, 7);
    const horizontal = field.links.find(link => link.horizontal);
    const vertical = field.links.find(link => !link.horizontal);
    assert.equal(horizontal.b.x - horizontal.a.x, 30);
    assert.equal(horizontal.b.x - horizontal.a.x - field.size, 23);
    assert.equal(vertical.b.y - vertical.a.y - field.size, 23);
    assert.ok(field.links.length > field.nodes.length);
  }
});

test('the static fallback uses the same square size, edge gap and colour intensity', () => {
  const asset = name => fs.readFileSync(path.join(__dirname, '../assets', name), 'utf8');
  const svg = asset('system-field.svg');
  const css = asset('system-field.css');
  assert.match(css, /background-size:\s*30px 30px/);
  assert.match(svg, /viewBox="0 0 30 30"/);
  assert.match(svg, /x="11\.5" y="11\.5" width="7" height="7"/);
  assert.match(svg, /M0 15H11\.5M18\.5 15H30M15 0V11\.5M15 18\.5V30/);
  assert.match(svg, /stroke-opacity="\.30"/);
  assert.equal((svg.match(/stroke-opacity="\.30"/g) || []).length, 2);
});

test('cyan rupture precedes module displacement and dispersed modules separate significantly', () => {
  const field = buildGrid(1200, 800);
  const closest = field.nodes.reduce((a, b) => a.distance < b.distance ? a : b);
  const link = field.links.find(item => item.a === closest || item.b === closest);
  const rupture = connectionState(link, Math.min(link.a.onset, link.b.onset) + .065);
  assert.ok(rupture.flash > .5, 'a breaking connection has a short cyan flash');
  assert.equal(nodeState(closest, Math.min(link.a.onset, link.b.onset) + .065, field).displacement, 0);
  assert.ok(nodeState(closest, 1, field).displacement >= 220);
});

test('canvas redraws on demand, respects reduced motion, resize and tab visibility', () => {
  const listeners = {};
  const events = target => ({
    addEventListener(name, callback) { listeners[target + ':' + name] = callback; }
  });
  const pending = [];
  let transforms = [];
  let squares = [];
  let lineColors = [];
  const ctx = {
    setTransform(...args) { transforms.push(args); },
    clearRect() { squares = []; lineColors = []; },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { lineColors.push(this.strokeStyle); },
    rect(x, y, w, h) { squares.push([x, y, w, h]); }
  };
  const canvas = { getContext: () => ctx };
  const classes = new Set();
  const host = { querySelector: () => canvas, classList: { add: value => classes.add(value) } };
  const motion = { matches: false, ...events('motion') };
  const doc = { hidden: false, documentElement: { scrollHeight: 4800 }, body: { scrollHeight: 4800 }, querySelector: () => host, ...events('document') };
  const win = {
    document: doc, innerWidth: 360, innerHeight: 800, scrollY: 0,
    devicePixelRatio: 4, matchMedia: () => motion,
    requestAnimationFrame(callback) { pending.push(callback); return pending.length; },
    ...events('window')
  };
  const runFrame = () => { const callback = pending.shift(); assert.ok(callback); callback(); };

  mount(win);
  assert.equal(canvas.width, 720);
  assert.equal(canvas.height, 1600);
  assert.deepEqual(transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  assert.equal(pending.length, 1);
  runFrame();
  const initial = squares.map(square => [...square]);
  assert.ok(initial.length > 0);
  assert.ok(classes.has('is-rendered'));
  assert.ok(lineColors.length <= 4 * 20, 'paths are batched instead of one stroke per shape');
  assert.ok(squares.every(square => square[2] === 7 && square[3] === 7));
  assert.equal(pending.length, 0);

  win.scrollY = 1000;
  listeners['window:scroll']();
  listeners['window:scroll']();
  assert.equal(pending.length, 1, 'scroll events share one animation frame');
  runFrame();
  assert.notDeepEqual(squares, initial);
  assert.ok(lineColors.some(color => color.startsWith('rgba(75, 219, 238,')), 'rupturing links draw in cyan');
  assert.ok(lineColors.every(color => {
    const alpha = Number(color.match(/, ([0-9.]+)\)$/)[1]);
    return alpha <= (color.startsWith('rgba(75, 219, 238,') ? .25 : .30);
  }), 'cyan and static strokes stay below the readability limits');
  assert.equal(pending.length, 0, 'draw does not start an animation loop');

  const atOriginalLength = squares.map(square => [...square]);
  doc.documentElement.scrollHeight = 6800;
  doc.body.scrollHeight = 6800;
  listeners['window:scroll']();
  runFrame();
  assert.notDeepEqual(squares, atOriginalLength, 'progress uses the current document length');

  motion.matches = true;
  listeners['motion:change']();
  runFrame();
  assert.deepEqual(squares, initial, 'reduced motion returns to the connected state');
  listeners['window:scroll']();
  assert.equal(pending.length, 0, 'reduced motion does not redraw on scroll');

  win.innerWidth = 390;
  listeners['window:resize']();
  assert.equal(canvas.width, 780);
  runFrame();
  assert.equal(pending.length, 0);

  doc.hidden = true;
  listeners['document:visibilitychange']();
  listeners['window:resize']();
  assert.equal(pending.length, 0);
  doc.hidden = false;
  listeners['document:visibilitychange']();
  assert.equal(pending.length, 1);
  runFrame();
  assert.equal(pending.length, 0);
});

test('rupture starts near the right centre, with links breaking before modules move', () => {
  const field = buildGrid(1200, 800);
  const closest = field.nodes.reduce((a, b) => a.distance < b.distance ? a : b);
  const farthest = field.nodes.reduce((a, b) => a.distance > b.distance ? a : b);
  assert.ok(closest.x > 850);
  assert.ok(Math.abs(closest.y - 400) < 80);
  const link = field.links.find(item => item.a === closest || item.b === closest);
  const broken = connectionState(link, .08, field);
  assert.ok(broken.opacity < 1);
  assert.equal(nodeState(closest, .08, field).displacement, 0);
  assert.ok(nodeState(closest, .35, field).displacement > 0);
  assert.equal(nodeState(farthest, .35, field).displacement, 0);
});

test('scroll mapping spans the whole document and reverses deterministically', () => {
  const field = buildGrid(1200, 800);
  const node = field.nodes.find(item => item.x > 1000 && item.y > 300 && item.y < 500);
  const documentHeight = 4800;
  const viewportHeight = 800;
  const before = nodeState(node, scrollProgress(600, documentHeight, viewportHeight), field);
  const further = nodeState(node, scrollProgress(2800, documentHeight, viewportHeight), field);
  const back = nodeState(node, scrollProgress(600, documentHeight, viewportHeight), field);
  assert.equal(scrollProgress(-20, documentHeight, viewportHeight), 0);
  assert.equal(scrollProgress(0, documentHeight, viewportHeight), 0);
  assert.equal(scrollProgress(2800, documentHeight, viewportHeight), .7);
  assert.equal(scrollProgress(4000, documentHeight, viewportHeight), 1);
  assert.equal(scrollProgress(100, 800, 800), 0);
  assert.deepEqual(back, before);
  assert.ok(further.displacement > before.displacement);
  const farthest = field.nodes.reduce((a, b) => a.distance > b.distance ? a : b);
  assert.ok(nodeState(farthest, .7, field).displacement < field.spread,
    'at 70% of page scroll the rupture remains incomplete');
  assert.ok(field.links.some(link => connectionState(link, .7).opacity > 0),
    'some connections remain at 70%');
  assert.ok(nodeState(farthest, .95, field).displacement < field.spread,
    'the last fragments continue moving near the end');
  assert.equal(nodeState(farthest, 1, field).displacement, field.spread);
  assert.ok(scrollProgress(1000, 6800, 800) < scrollProgress(1000, 4800, 800),
    'document length affects progress');
});
