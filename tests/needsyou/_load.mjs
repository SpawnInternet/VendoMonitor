// Loads a dashboard script into a stub browser so its pure functions and window exports can be tested with Node.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function stubWindow(extra = {}) {
  const noop = () => {};
  const el = () => ({ innerHTML: '', style: {}, classList: { contains: () => false, toggle: noop, add: noop }, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, insertAdjacentHTML: noop, dataset: {}, textContent: '' });
  const g = globalThis;
  g.window = g;
  g.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: el, body: { appendChild: noop }, visibilityState: 'visible' };
  g.localStorage = { getItem: () => null, setItem: noop };
  Object.defineProperty(g, 'navigator', { value: { onLine: true, clipboard: { writeText: async () => {} } }, configurable: true });
  g.SB_URL = 'http://stub'; g.HDR = {};
  g.sb = async () => [];
  g.setInterval = () => 0; g.clearInterval = noop;
  g.alert = noop; g.confirm = () => true;
  Object.assign(g, extra);
  return g;
}

export function load(relPath) {
  const code = readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');
  vm.runInThisContext(code, { filename: relPath });
}

export function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); }
