// Employees tab: Income checker (report only) and Newly installed (Same as … / New vendo / Ignore → hq_newvendo_decide).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');
const nav = readFileSync(join(here, '..', 'js', 'dash.22.nav.js'), 'utf8');
const nv = () => src.split('async function chatNewVendo(')[1].split('\n  async function ')[0];

test('both icon maps know Income checker and Newly installed', () => {
  assert.match(src, /const ICON = \{[^}]*income_checker: '📈'[^}]*newly_installed: '🆕'/);
  assert.match(src, /const ICON2 = \{[^}]*income_checker: '📈 Income checker'[^}]*newly_installed: '🆕 Newly installed'/);
});

test('new-vendo answers go to hq_newvendo_decide; pull-out and money answers keep their own paths', () => {
  assert.match(src, /m && m\.topic === 'newvendo' \? chatNewVendo\(/);
  assert.match(src, /m && m\.topic === 'pullout' \? chatPullout\(/);
  assert.match(src, /m\.topic === 'audit_money' \? chatDecide\(/);
  assert.match(nv(), /callReply\('hq_newvendo_decide', \{ p_msg: Number\(m\.id\), p_choice: choice, p_note: null \}\)/);
});

test('New vendo asks for a confirm first; the others save straight away', () => {
  const d = nv();
  assert.match(d, /choice === 'create'/);
  assert.match(d, /askConfirm\(/);
  assert.match(d, /first harvest group of its area/);
});

test('Fix it links: Income checker → Harvest, Newly installed → Vendos', () => {
  assert.match(nav, /income_checker:\s+\{ label: '🧺 Open Harvest',\s+panel: 'harvest' \}/);
  assert.match(nav, /newly_installed:\s+\{ label: '🔗 Open Vendos',\s+panel: 'vendos' \}/);
});
