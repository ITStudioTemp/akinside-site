const test = require('node:test');
const assert = require('node:assert/strict');
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

test('connected modules form a denser field on desktop and mobile', () => {
  const desktop = buildGrid(1200, 800);
  const mobile = buildGrid(360, 800);
  assert.ok(desktop.nodes.length >= 230, 'desktop contains a connected structure, not a sparse pattern');
  assert.ok(mobile.nodes.length >= 100, 'mobile retains a visible structure');
  for (const field of [desktop, mobile]) {
    assert.ok(field.size >= 14);
    assert.ok(field.links.length > field.nodes.length);
  }
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
    strokeRect(x, y, w, h) { squares.push([x, y, w, h]); }
  };
  const canvas = { getContext: () => ctx };
  const classes = new Set();
  const host = { querySelector: () => canvas, classList: { add: value => classes.add(value) } };
  const motion = { matches: false, ...events('motion') };
  const doc = { hidden: false, querySelector: () => host, ...events('document') };
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
  assert.equal(pending.length, 0);

  win.scrollY = 1000;
  listeners['window:scroll']();
  listeners['window:scroll']();
  assert.equal(pending.length, 1, 'scroll events share one animation frame');
  runFrame();
  assert.notDeepEqual(squares, initial);
  assert.ok(lineColors.some(color => color.startsWith('rgba(75, 219, 238,')), 'rupturing links draw in cyan');
  assert.equal(pending.length, 0, 'draw does not start an animation loop');

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

test('scroll mapping is bounded and deterministic in either direction', () => {
  const field = buildGrid(1200, 800);
  const node = field.nodes.find(item => item.x > 1000 && item.y > 300 && item.y < 500);
  const before = nodeState(node, scrollProgress(150, 800), field);
  const further = nodeState(node, scrollProgress(1100, 800), field);
  const back = nodeState(node, scrollProgress(150, 800), field);
  assert.equal(scrollProgress(-20, 800), 0);
  assert.equal(scrollProgress(0, 800), 0);
  assert.equal(scrollProgress(1600, 800), 1);
  assert.deepEqual(back, before);
  assert.ok(further.displacement > before.displacement);
  assert.ok(scrollProgress(400, 800) < scrollProgress(800, 800));
});
