// Employees tab: Pull-out questions are answered through hq_pullout_decide (admin gateway), never the chat reply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');
const nav = readFileSync(join(here, '..', 'js', 'dash.22.nav.js'), 'utf8');
const pull = () => src.split('async function chatPullout(')[1].split('\n  async function ')[0];

test('both icon maps know Overdue and Pull-out', () => {
  assert.match(src, /const ICON = \{[^}]*overdue: '🗓'[^}]*pullout: '📍'/);
  assert.match(src, /const ICON2 = \{[^}]*overdue: '🗓 Overdue'[^}]*pullout: '📍 Pull-out'/);
});

test('pull-out answers go to hq_pullout_decide; money answers still go to hq_audit_decide', () => {
  assert.match(src, /m && m\.topic === 'pullout' \? chatPullout\(/);
  assert.match(src, /m\.topic === 'audit_money' \? chatDecide\(/);
  assert.match(pull(), /callReply\('hq_pullout_decide', \{ p_msg: Number\(m\.id\), p_choice: choice, p_note: null \}\)/);
});

test('Flag for pull-out asks for a confirm that says the status is not changed', () => {
  const d = pull();
  assert.match(d, /choice === 'flag'/);
  assert.match(d, /askConfirm\(/);
  assert.match(d, /status is not changed/);
});

test('Fix it links: Overdue → Harvest, Pull-out → Vendos', () => {
  assert.match(nav, /overdue:\s+\{ label: '🧺 Open Harvest',\s+panel: 'harvest' \}/);
  assert.match(nav, /pullout:\s+\{ label: '🔗 Open Vendos',\s+panel: 'vendos' \}/);
});
