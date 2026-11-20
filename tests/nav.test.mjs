// js/dash.22.nav.js — AM/PM text, "Fix it" links per employee, deep links / new windows (2026-11-20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nav = require(join(here, '..', 'js', 'dash.22.nav.js'));

test('24-hour times in message text become AM/PM', () => {
  assert.equal(nav.to12h('Dicayas · waiting list · Nov 20 12:40'), 'Dicayas · waiting list · Nov 20 12:40 PM');
  assert.equal(nav.to12h('silent since Nov 19 11:17 — this list may be old'), 'silent since Nov 19 11:17 AM — this list may be old');
  assert.equal(nav.to12h('last seen 14:05, first 09:30'), 'last seen 2:05 PM, first 9:30 AM');
  assert.equal(nav.to12h('midnight run 00:30'), 'midnight run 12:30 AM');
});

test('times that already say AM/PM, and things that only look like times, stay as they are', () => {
  assert.equal(nav.to12h('Nov 20, 2:05 PM'), 'Nov 20, 2:05 PM');
  assert.equal(nav.to12h('opened 10:30am'), 'opened 10:30am');
  assert.equal(nav.to12h('router 172.16.104.1 VLAN 108'), 'router 172.16.104.1 VLAN 108');
  assert.equal(nav.to12h('ratio 3:2'), 'ratio 3:2');
  assert.equal(nav.to12h('stamp 10:15:30'), 'stamp 10:15:30');
  assert.equal(nav.to12h('not a time 24:00 or 7:75'), 'not a time 24:00 or 7:75');
  assert.equal(nav.to12h(null), '');
});

test('every employee has a "Fix it" destination; GCash goes to the Exceptions sub-tab', () => {
  for (const emp of ['eod_harvest', 'harvest_auditor', 'accuracy_check', 'name_matcher', 'supervisor', 'job_dispatcher',
                     'gcash_autopay', 'spawn_remind', 'poller_dicayas', 'poller_dapitan']) {
    assert.ok(nav.FIX[emp] && nav.FIX[emp].panel && nav.FIX[emp].label, emp);
  }
  assert.deepEqual({ panel: nav.FIX.gcash_autopay.panel, sub: nav.FIX.gcash_autopay.sub }, { panel: 'subscribers', sub: 'exc' });
  assert.equal(nav.FIX.poller_dicayas.panel, 'status');
  assert.equal(nav.FIX.eod_harvest.panel, 'harvest');
});

test('a panel opens in its own window through a dashboard deep link', () => {
  assert.equal(nav.panelUrl('subscribers', 'exc'), 'dashboard.html?panel=subscribers&sub=exc');
  assert.equal(nav.panelUrl('harvest'), 'dashboard.html?panel=harvest');
  assert.equal(nav.panelUrl('bad id!<x>'), 'dashboard.html?panel=badidx');
});

test('the dashboard loads the nav script and the Subscribers area exposes its sub-tab switch', () => {
  const html = readFileSync(join(here, '..', 'dashboard.html'), 'utf8');
  assert.match(html, /<script defer src="js\/dash\.22\.nav\.js\?v=[a-z0-9]+"><\/script>/);
  const sub = readFileSync(join(here, '..', 'js', 'dash.15.subcol.js'), 'utf8');
  assert.match(sub, /window\.subGoTab = k => stGo\(k\)/);
});

test('the Employees tab shows bubble text in AM/PM and a Fix it link per bubble', () => {
  const emp = readFileSync(join(here, '..', 'js', 'dash.19.employee.js'), 'utf8');
  assert.match(emp, /spawnTo12h\(m\.text\)/);
  assert.match(emp, /data-fix=/);
});
