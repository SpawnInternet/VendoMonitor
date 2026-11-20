// Employees tab (js/dash.19.employee.js): Name Matcher icon, reply on any bubble, chat reply v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');

test('answers and replies go through spawn_hq_chat_reply_v2, never v1', () => {
  assert.match(src, /rpc\/spawn_hq_chat_reply_v2/);
  assert.doesNotMatch(src, /rpc\/spawn_hq_chat_reply`/);
});

test('every agent bubble carries a reply control', () => {
  assert.match(src, /data-reply-to=/);
  assert.match(src, /function chatReplyTo\(/);
});

test('the Name Matcher has an icon in both icon maps', () => {
  const icon = src.match(/const ICON = \{[^}]*\}/s)[0];
  const icon2 = src.match(/const ICON2 = \{[^}]*\}/s)[0];
  assert.match(icon, /name_matcher:/);
  assert.match(icon2, /name_matcher:/);
});

test('owner replies render with a re: prefix of the parent text', () => {
  assert.match(src, /↩ re:/);
});
