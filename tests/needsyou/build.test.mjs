// Task 5: pure builders of the Needs you panel (window.needsYou).
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ employeesChatActions: { ICON: { name_matcher: '🔗' } }, SPAWN_FIX: { supervisor: { label: '🖥 Open System', panel: 'status' } } });
load('js/dash.23.needsyou.js');
const N = g.window.needsYou;
assert(N && typeof N.tabVisible === 'function', 'window.needsYou exists');

// tabVisible
assert(N.tabVisible([]) === false, 'tabVisible([]) is false (gateway too old or no rows)');
assert(N.tabVisible([{ key: 'hq_needs_you', value: 'on' }]) === true, 'tabVisible on');
assert(N.tabVisible([{ key: 'hq_needs_you', value: 'off' }]) === false, 'tabVisible off');

// buildGroups: rank order money → lights → identity → doubts → other, empty input → []
const rows = [
  { item: 'q', rank: 5, msg_id: 1, employee_id: 'name_matcher', employee: 'Name matcher', topic: 'spawnfi_link', text: 'a', options: null, free_text: true },
  { item: 'light', rank: 2, employee_id: 'supervisor', employee: 'Supervisor', text: '3 failed runs' },
  { item: 'q', rank: 1, msg_id: 2, employee_id: 'audit_harvest', employee: 'Audit harvest', topic: 'audit_money', text: 'short ₱1,298', options: [{ v: 'charge', label: 'Charge Gilbert ₱1,298' }, { v: 'ok', label: "It's OK" }, { v: 'later', label: 'Later' }] },
  { item: 'q', rank: 3, msg_id: 3, employee_id: 'newly_installed', employee: 'Newly installed', topic: 'newvendo', text: 'Vendo: X', options: [{ v: 'create', label: 'New vendo' }] },
];
const groups = N.buildGroups(rows);
assert(JSON.stringify(groups.map(x => x.key)) === JSON.stringify(['money', 'lights', 'identity', 'other']), 'buildGroups order money, lights, identity, other');
assert(groups[0].rows[0].msg_id === 2 && groups[1].rows[0].employee_id === 'supervisor' && groups[2].rows[0].msg_id === 3 && groups[3].rows[0].msg_id === 1, 'each row lands in its group');
assert(JSON.stringify(N.buildGroups([])) === '[]', 'buildGroups([]) is []');
assert(/MONEY/.test(groups[0].title) && /RED LIGHTS/.test(groups[1].title), 'group titles');

// rowHtml
const freeHtml = N.rowHtml(rows[0]);
assert(/data-free="1"/.test(freeHtml), 'free-text question without options renders an input');
assert(/data-thread="name_matcher"/.test(freeHtml), 'question row has Open thread link');
const lightHtml = N.rowHtml({ item: 'light', rank: 2, employee_id: 'zzz', employee: 'Zed', text: 'silent' });
assert(/data-fix="agents"/.test(lightHtml) && /🤖/.test(lightHtml), 'light row for an unknown employee falls back to Agents with the robot icon');
const supHtml = N.rowHtml(rows[1]);
assert(/data-fix="status"/.test(supHtml) && /data-fixwin="status"/.test(supHtml), 'light row with a FIX entry links to its panel and new window');
const moneyHtml = N.rowHtml(rows[2]);
assert((moneyHtml.match(/data-ans="/g) || []).length === 3 && /It&#39;s OK/.test(moneyHtml), 'three option buttons with escaped labels');

// summaryLine
assert(/Name matcher: 5 shown, 73 waiting/.test(N.summaryLine([{ employee: 'Name matcher', in_queue: 5, hidden_by_cap: 73 }])), 'summary line text');
assert(N.summaryLine([{ employee: 'X', in_queue: 2, hidden_by_cap: 0 }]) === '', 'summary line is empty when nothing is hidden');

// ── final-review fixes ──
// F1: the notice must survive a re-render (panelHtml carries it)
const ph = N.panelHtml(groups, [], 'Not saved: shortfall moved');
assert(/Not saved: shortfall moved/.test(ph) && /id="needsyou-notice"[^>]*display:block/.test(ph), 'panelHtml shows a live notice');
assert(/id="needsyou-notice"[^>]*display:none/.test(N.panelHtml(groups, [], '')), 'panelHtml hides an empty notice');
// F2: rows just decided are filtered out of the next render
assert(N.filterDecided(rows, new Set([2, 3])).map(r => r.msg_id ?? r.employee_id).join(',') === '1,supervisor', 'filterDecided drops decided msg_ids, keeps lights');
// F3: only HTTP 200 is truth
assert(JSON.stringify(N.queueState({ rows: [{ a: 1 }] }, { status: 200, rows: [] })) === JSON.stringify({ rows: [], error: '' }), 'queueState: 200 replaces rows');
assert(JSON.stringify(N.queueState({ rows: [{ a: 1 }] }, { status: 500, rows: [] })) === JSON.stringify({ rows: [{ a: 1 }], error: 'Could not read the queue (HTTP 500), retrying' }), 'queueState: non-200 keeps last rows and reports');
assert(N.switchState({ on: true, known: true }, { status: 500, rows: [] }).on === true, 'switchState: failed read keeps last known state');
assert(N.switchState({ on: true, known: true }, { status: 403, rows: [] }).on === false, 'switchState: 403 hides the tab');
assert(N.switchState({ on: false, known: false }, { status: 200, rows: [{ key: 'hq_needs_you', value: 'on' }] }).on === true, 'switchState: 200 on');
