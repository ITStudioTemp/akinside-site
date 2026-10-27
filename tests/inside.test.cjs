const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'assets', 'inside.js');

test('illustration has one native checkbox and one associated label in every mode', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const area = html.match(/<div class="inspection">([\s\S]*?)<ol class="inspection-stages"/)[1];
  assert.equal((area.match(/<input\b/gi) || []).length, 1);
  assert.equal((area.match(/<label\b/gi) || []).length, 1);
  assert.equal((area.match(/<button\b/gi) || []).length, 0);
  assert.match(area, /<input[^>]*id="inside-fallback"[^>]*type="checkbox"/);
  assert.match(area, /<label[^>]*for="inside-fallback"/);
  assert.doesNotMatch(area, /<span class="fallback-(?:on|off)" aria-hidden/);
  assert.doesNotMatch(area, /<input[^>]*(?:disabled|hidden)(?:\s|>|=)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');
  assert.match(css, /\.inside-fallback\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(css.match(/\.inside-fallback\s*\{([^}]*)\}/)[1], /grid-area/);
  assert.match(css, /#inside-fallback:focus-visible\s*~\s*\.inspection-controls/);
  assert.doesNotMatch(css, /data-inside-mode/);
});

test('CSS keeps the visible instruction and SVG state aligned with the checkbox', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.readFileSync(scriptPath, 'utf8');
  assert.match(html, /class="fallback-on">Вернуться к внешнему виду/);
  assert.match(html, /class="fallback-off">Показать изнутри/);
  assert.match(css, /\.fallback-off\s*\{\s*display:\s*none/);
  assert.match(css, /#inside-fallback:not\(:checked\)\s*~\s*\.inspection-controls\s+\.fallback-on\s*\{\s*display:\s*none/);
  assert.match(css, /#inside-fallback:not\(:checked\)\s*~\s*\.inspection-controls\s+\.fallback-off\s*\{\s*display:\s*inline/);
  assert.match(css, /#inside-fallback:not\(:checked\)\s*~\s*\.inspection-visual\s+\.layer\s*\{\s*opacity:\s*0/);
  assert.match(css, /#inside-fallback:not\(:checked\)\s*~\s*\.inspection-visual\s+\.connections\s*\{\s*opacity:\s*0/);
  assert.doesNotMatch(js, /inside-fallback|inside-toggle|insideMode/);
});

test('process follows the viewport, clamps progress and batches scroll updates', () => {
  let scrollY = 600;
  let frames = [];
  const events = {};
  const positions = [1000, 1200, 1400];
  const steps = positions.map((position, index) => {
    const classes = new Set();
    const marker = { getBoundingClientRect() { return { top: position - scrollY - 10.7 }; } };
    return {
      classes,
      classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
      getBoundingClientRect() { return { top: position - scrollY - 10.7, height: 80 + index * 40 }; },
      querySelector(selector) { return selector === 'span' ? marker : null; },
    };
  });
  const properties = {};
  const list = {
    querySelectorAll(selector) { return selector === 'li' ? steps : []; },
    getBoundingClientRect() { return { top: 980 - scrollY }; },
    style: { setProperty(name, value) { properties[name] = value; } },
  };
  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    querySelector(selector) { return selector === '.work-steps' ? list : null; },
  };
  const window = {
    innerHeight: 800,
    getComputedStyle() { return { top: '7.2px', height: '7px' }; },
    addEventListener(type, listener, options) { events[type] = { listener, options }; },
    requestAnimationFrame(callback) { frames.push(callback); },
  };
  const flush = () => { const pending = frames; frames = []; pending.forEach(callback => callback()); };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { document, window }, { filename: scriptPath });
  flush();
  assert.equal(Number(properties['--progress']), 0);
  assert.ok(Math.abs(parseFloat(properties['--track-start']) - 20) < 0.001);
  assert.ok(Math.abs(parseFloat(properties['--track-length']) - 400) < 0.001);
  assert.deepEqual(steps.map(step => step.classes.has('is-active')), [true, false, false]);
  assert.equal(events.scroll.options.passive, true);

  scrollY = 800;
  events.scroll.listener();
  events.scroll.listener();
  assert.equal(frames.length, 1, 'scroll updates share a frame');
  flush();
  assert.equal(Number(properties['--progress']), 0.5);
  assert.deepEqual(steps.map(step => step.classes.has('is-active')), [false, true, false]);

  scrollY = 1600;
  events.resize.listener();
  flush();
  assert.equal(Number(properties['--progress']), 1);
  assert.deepEqual(steps.map(step => step.classes.has('is-active')), [false, false, true]);
});

function pointerEnvironment({ fine = true, reduced = false } = {}) {
  const events = {};
  const properties = {};
  const pending = [];
  let measurements = 0;
  const link = {
    style: {
      setProperty(name, value) { properties[name] = value; },
      removeProperty(name) { delete properties[name]; },
    },
    getBoundingClientRect() { measurements++; return { left: 100, top: 200 }; },
    addEventListener(type, listener) { events[type] = listener; },
    removeEventListener(type, listener) { if (events[type] === listener) delete events[type]; },
  };
  const media = initial => ({
    matches: initial,
    addEventListener(type, listener) { if (type === 'change') this.change = listener; },
  });
  const fineQuery = media(fine);
  const reducedQuery = media(reduced);
  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === '.action-link' ? [link] : []; },
  };
  const window = {
    matchMedia(query) { return query.includes('prefers-reduced-motion') ? reducedQuery : fineQuery; },
    requestAnimationFrame(callback) { pending.push(callback); return pending.length; },
    cancelAnimationFrame() {}, // Execute cancelled frames deliberately to expose stale writes.
  };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { document, window }, { filename: scriptPath });
  return { events, properties, pending, fineQuery, reducedQuery, measurements: () => measurements };
}

test('mouse pointer effect batches coordinates and keeps its last position on leave', () => {
  const { events, properties, pending, measurements } = pointerEnvironment();
  assert.equal(typeof events.pointermove, 'function');
  events.pointermove({ pointerType: 'touch', clientX: 110, clientY: 210 });
  assert.equal(pending.length, 0);
  events.pointermove({ pointerType: 'mouse', clientX: 110, clientY: 220 });
  events.pointermove({ pointerType: 'mouse', clientX: 130, clientY: 240 });
  assert.equal(pending.length, 1);
  assert.equal(measurements(), 0, 'geometry is read only during the animation frame');
  pending.shift()();
  assert.equal(measurements(), 1, 'multiple events require only one geometry read');
  assert.equal(properties['--pointer-x'], '30px');
  assert.equal(properties['--pointer-y'], '40px');
  events.pointermove({ pointerType: 'mouse', clientX: 140, clientY: 250 });
  events.pointerleave({ pointerType: 'mouse' });
  pending.shift()();
  assert.equal(properties['--pointer-x'], '30px');
  assert.equal(properties['--pointer-y'], '40px');
});

test('leaving before the first frame does not write stale coordinates', () => {
  const { events, properties, pending, measurements } = pointerEnvironment();
  events.pointermove({ pointerType: 'mouse', clientX: 140, clientY: 250 });
  events.pointerleave({ pointerType: 'mouse' });
  pending.shift()();
  assert.equal(properties['--pointer-x'], undefined);
  assert.equal(properties['--pointer-y'], undefined);
  assert.equal(measurements(), 0);
});

test('pointer handlers follow fine hover and reduced-motion preferences', () => {
  for (const options of [{ fine: false }, { reduced: true }]) {
    const state = pointerEnvironment(options);
    assert.equal(state.events.pointermove, undefined);
  }
  const state = pointerEnvironment();
  state.events.pointermove({ pointerType: 'mouse', clientX: 110, clientY: 210 });
  state.pending.shift()();
  assert.equal(state.properties['--pointer-x'], '10px');
  state.events.pointermove({ pointerType: 'mouse', clientX: 120, clientY: 220 });
  state.reducedQuery.matches = true;
  state.reducedQuery.change();
  assert.equal(state.events.pointermove, undefined);
  state.pending.shift()();
  assert.equal(state.properties['--pointer-x'], undefined);
  state.reducedQuery.matches = false;
  state.reducedQuery.change();
  assert.equal(typeof state.events.pointermove, 'function');
  state.fineQuery.matches = false;
  state.fineQuery.change();
  assert.equal(state.events.pointermove, undefined);
});
