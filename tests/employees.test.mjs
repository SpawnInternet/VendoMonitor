// Employees tab (js/dash.19.employee.js): Name Matcher icon, reply on companion bubbles, chat reply v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');

test('answers and replies go through spawn_hq_chat_reply_v2, never v1', () => {
  assert.match(src, /rpc\/spawn_hq_chat_reply_v2/);
  assert.doesNotMatch(src, /rpc\/spawn_hq_chat_reply[`"']/);
});

test('reply control exists and is shown only for companion employees', () => {
  assert.match(src, /data-reply-to=/);
  assert.match(src, /function chatReplyTo\(/);
  assert.match(src, /const COMPANIONS = new Set\(\['name_matcher'\]\)/);
  assert.match(src, /COMPANIONS\.has\(m\.employee_id\)/);
});

test('the Name Matcher has an icon in both icon maps', () => {
  const icon = src.match(/const ICON = \{[^}]*\}/s)[0];
  const icon2 = src.match(/const ICON2 = \{[^}]*\}/s)[0];
  assert.match(icon, /name_matcher:/);
  assert.match(icon2, /name_matcher:/);
});

test('owner replies are recognised by topic reply (view column) and render a re: prefix', () => {
  assert.match(src, /m\.topic === 'reply'/);
  assert.match(src, /↩ re:/);
});
