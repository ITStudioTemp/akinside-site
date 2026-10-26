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
  assert.equal(button.textContent.trim(), 'Показать изнутри');

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
