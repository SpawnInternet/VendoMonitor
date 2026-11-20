// Employees tab: Audit harvest money questions are answered through hq_audit_decide (admin gateway), never the chat reply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');

test('money questions go to hq_audit_decide; every other answer keeps the chat reply', () => {
  assert.match(src, /async function chatDecide\(/);
  assert.match(src, /callReply\('hq_audit_decide', \{ p_msg: /);
  assert.match(src, /m && m\.topic === 'audit_money' \? chatDecide\(/);
});

test('Charge asks for a confirm showing the amount and the undo place before writing', () => {
  const d = src.split('async function chatDecide(')[1].split('\n  async function ')[0];
  assert.match(d, /choice === 'charge'/);
  assert.match(d, /askConfirm\(/);
  assert.match(d, /undo it in the Recon tab/);
});
