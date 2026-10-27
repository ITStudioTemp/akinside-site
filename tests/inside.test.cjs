const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'assets', 'inside.js');

function element(attributes = {}) {
  const attrs = { ...attributes };
  const listeners = {};
  return {
    hidden: Object.hasOwn(attrs, 'hidden'),
    textContent: '',
    dataset: new Proxy({}, {
      get: (_, key) => attrs[`data-${String(key).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`],
      set: (_, key, value) => {
        attrs[`data-${String(key).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`] = String(value);
        return true;
      },
    }),
    setAttribute(name, value) { attrs[name] = String(value); if (name === 'hidden') this.hidden = true; },
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; if (name === 'hidden') this.hidden = false; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    click() { for (const listener of listeners.click || []) listener({ currentTarget: this }); },
  };
}

function run({ section = element({ 'data-inside-mode': 'inside' }), button = element({ hidden: '', 'aria-pressed': 'true' }), readyState = 'complete' } = {}) {
  assert.ok(fs.existsSync(scriptPath), 'assets/inside.js should exist');
  const nodes = { inspection: section, 'inside-toggle': button };
  const listeners = {};
  const document = {
    readyState,
    getElementById(id) { return nodes[id] || null; },
    querySelector(selector) { return selector.startsWith('#') ? nodes[selector.slice(1)] || null : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
  };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { document }, { filename: scriptPath });
  return { section, button, dispatchReady() { for (const listener of listeners.DOMContentLoaded || []) listener(); } };
}

test('initializes visible control in surface mode and switches repeatedly', () => {
  const { section, button } = run();
  assert.equal(section.dataset.insideMode, 'surface');
  assert.equal(button.hidden, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.textContent.trim(), 'Показать изнутри');

  button.click();
  assert.equal(section.dataset.insideMode, 'inside');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.textContent.trim(), 'Вернуться к внешнему виду');

  button.click();
  assert.equal(section.dataset.insideMode, 'surface');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.textContent.trim(), 'Показать изнутри');
});

test('waits for DOM readiness when the document is loading', () => {
  const { section, button, dispatchReady } = run({ readyState: 'loading' });
  assert.equal(section.dataset.insideMode, 'inside');
  assert.equal(button.hidden, true);
  dispatchReady();
  assert.equal(section.dataset.insideMode, 'surface');
  assert.equal(button.hidden, false);
});

test('does not throw when either required element is missing', () => {
  assert.doesNotThrow(() => run({ section: null }));
  assert.doesNotThrow(() => run({ button: null }));
  assert.doesNotThrow(() => run({ section: null, button: null }));
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
