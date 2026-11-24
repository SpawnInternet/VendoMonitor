// Task 3: the chat's decision handlers are exported and accept an optional ctx {after, notice}.
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow();
let fetchResult = { ok: true, json: async () => ({ ok: true }) };
g.fetch = async () => fetchResult;
load('js/dash.19.employee.js');

const A = g.window.employeesChatActions;
assert(A && typeof A.decide === 'function' && typeof A.pullout === 'function' && typeof A.newvendo === 'function' && typeof A.answer === 'function', 'employeesChatActions exports decide/pullout/newvendo/answer');
assert(A && A.ICON && A.ICON.network_watch === '📡' && A.ICON.sms_gateway === '📱' && A.ICON.system_doctor === '🩺', 'ICON has the three red-light employees');

let afterCalls = 0, afterArgs = [], notices = [];
const ctx = { after: ok => { afterCalls++; afterArgs.push(ok); }, notice: m => notices.push(m) };

await A.answer(1, 'yes', '', ctx);
assert(afterCalls === 1 && afterArgs[0] === true, 'answer with ctx calls after(true) once on success');
assert(notices.length === 0, 'answer with ctx does not call notice() on success');

fetchResult = { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
afterCalls = 0; afterArgs = []; notices = [];
await A.answer(2, 'yes', '', ctx);
assert(afterCalls === 1 && afterArgs[0] === false, 'answer with ctx calls after(false) on failure');
assert(notices.length === 1 && notices[0] === 'Could not send: boom', 'answer with ctx reports the error through notice()');

// pullout: a non-flag choice skips the confirm and posts; failure goes to notice
fetchResult = { ok: false, status: 500, json: async () => ({ error: 'nope' }) };
afterCalls = 0; afterArgs = []; notices = [];
await A.pullout({ id: 3 }, 'still_there', ctx);
assert(afterCalls === 1 && afterArgs[0] === false && notices.length === 1 && notices[0] === 'Not saved: nope', 'pullout with ctx: notice on failure, then after(false)');

fetchResult = { ok: true, json: async () => ({ ok: true }) };
afterCalls = 0; afterArgs = []; notices = [];
await A.newvendo({ id: 4 }, 'ignore', ctx);
assert(afterCalls === 1 && afterArgs[0] === true && notices.length === 0, 'newvendo with ctx: after(true) on success, no notice');

// F2 (final review): a click blocked by chatBusy must not call after() at all
let release; fetchResult = new Promise(res => { release = () => res({ ok: true, json: async () => ({ ok: true }) }); });
afterCalls = 0; afterArgs = []; notices = [];
const p1 = A.answer(10, 'yes', '', ctx);
await A.answer(11, 'yes', '', ctx);            // second click while the first is in flight
assert(afterCalls === 0 && notices.length === 0, 'blocked second answer calls neither after() nor notice()');
release(); await p1;
assert(afterCalls === 1 && afterArgs[0] === true, 'first answer still completes with after(true)');
