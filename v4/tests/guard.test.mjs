// Tests for the pure guard rules in v4/harvest_v4.html (between the V4-GUARD-PURE markers).
// Run: node --test v4/tests/guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'harvest_v4.html'), 'utf8');
const a = html.indexOf('/* V4-GUARD-PURE:BEGIN */'), b = html.indexOf('/* V4-GUARD-PURE:END */');
assert.ok(a !== -1 && b > a, 'V4-GUARD-PURE markers not found');
const { v4DistanceM, v4GpsVerdict, v4ValidOwnerName, v4NormalizePhone, v4IdentityMissing } =
  new Function(html.slice(a, b) + '; return {v4DistanceM, v4GpsVerdict, v4ValidOwnerName, v4NormalizePhone, v4IdentityMissing};')();

const item = { id: 7, lat: 8.5880, lng: 123.3410 };
const now = Date.parse('2026-11-17T08:00:00Z');
const fix = (o = {}) => ({ lat: 8.5881, lng: 123.3411, acc: 12, at: '2026-11-17T07:58:00Z', itemId: 7, ...o });

test('distance: ~445 m for 0.004 deg of latitude', () => {
  const d = v4DistanceM(8.5880, 123.3410, 8.5920, 123.3410);
  assert.ok(d > 400 && d < 490, String(d));
});

test('gate: no GPS → blocked with the required message', () => {
  const v = v4GpsVerdict(null, item, now, 0);
  assert.equal(v.ok, false);
  assert.equal(v.msg, 'GPS required. Tap 📍 Get GPS while standing at the vendo.');
});
test('gate: GPS taken at another vendo → blocked', () => {
  assert.equal(v4GpsVerdict(fix({ itemId: 8 }), item, now, 0).ok, false);
});
test('gate: GPS older than 15 min → blocked', () => {
  assert.equal(v4GpsVerdict(fix({ at: '2026-11-17T07:44:59Z' }), item, now, 0).ok, false);
  assert.equal(v4GpsVerdict(fix({ at: '2026-11-17T07:45:01Z' }), item, now, 0).ok, true);
});
test('gate: outside the Philippines → blocked', () => {
  assert.equal(v4GpsVerdict(fix({ lat: 35.6, lng: 139.7 }), item, now, 0).ok, false);
});
test('gate: weak fix (>100 m) → blocked on tries 0 and 1, allowed with flag weak on try 2', () => {
  const w = v4GpsVerdict(fix({ acc: 140 }), item, now, 1);
  assert.equal(w.ok, false);
  assert.equal(w.msg, 'Weak GPS (±140 m) — step outside and tap Get GPS again');
  assert.equal(v4GpsVerdict(fix({ acc: 140 }), item, now, 0).ok, false);
  const w2 = v4GpsVerdict(fix({ acc: 140 }), item, now, 2);
  assert.deepEqual([w2.ok, w2.flag], [true, 'weak']);
});
test('gate: fix > 300 m from the vendo on file → allowed, flag far, distance kept', () => {
  const far = v4GpsVerdict(fix({ lat: 8.5920 }), item, now, 0);
  assert.equal(far.ok, true);
  assert.equal(far.flag, 'far');
  assert.ok(far.distM > 400 && far.distM < 490, String(far.distM));
});
test('gate: nothing on file → ok; close to file → ok with distance', () => {
  const none = v4GpsVerdict(fix(), { id: 7, lat: null, lng: null }, now, 0);
  assert.deepEqual([none.ok, none.flag, none.distM], [true, 'ok', null]);
  const near = v4GpsVerdict(fix(), item, now, 0);
  assert.deepEqual([near.ok, near.flag], [true, 'ok']);
  assert.ok(near.distM >= 0 && near.distM < 50);
});

test('owner name: real names pass, junk fails', () => {
  assert.equal(v4ValidOwnerName('Maria Santos'), true);
  assert.equal(v4ValidOwnerName('  Jo  '), true);
  for (const s of ['', 'x', '1234', 'none', 'N/A', 'wala', 'unknown', 'NONE ']) assert.equal(v4ValidOwnerName(s), false, s);
});
test('phone: PH mobile formats normalize to 09XXXXXXXXX, junk is null', () => {
  assert.equal(v4NormalizePhone('0917 123 4567'), '09171234567');
  assert.equal(v4NormalizePhone('+63 917-123-4567'), '09171234567');
  assert.equal(v4NormalizePhone('639171234567'), '09171234567');
  for (const s of ['', '12345', '0917123456', '09999999999', '00000000000', '08171234567', 'none']) assert.equal(v4NormalizePhone(s), null, s);
});

const blank = { lat: null, lng: null, owner_name: '', contact_number: '', barangay: '' };
const full = { lat: 8.58, lng: 123.34, owner_name: 'Maria Santos', contact_number: '09171234567', barangay: 'Dicayas' };
test('identity: blank vendo, nothing entered → all four missing in order', () => {
  assert.deepEqual(v4IdentityMissing(blank, { owner: '', contact: '', barangay: '' }, true, null),
    ['GPS', 'Owner name', 'Contact number', 'Barangay']);
});
test('identity: blank vendo, everything entered, weak GPS this harvest → nothing missing', () => {
  assert.deepEqual(v4IdentityMissing(blank, { owner: 'Maria Santos', contact: '09171234567', barangay: 'Dicayas' }, true, 'weak'), []);
});
test('identity: barangay not required when the area has no list', () => {
  assert.deepEqual(v4IdentityMissing(blank, { owner: 'Maria Santos', contact: '09171234567', barangay: '' }, false, 'ok'), []);
});
test('identity: complete vendo → guard off even with nothing entered and no GPS yet', () => {
  assert.deepEqual(v4IdentityMissing(full, { owner: '', contact: '', barangay: '' }, true, null), []);
});
test('identity: junk on file does not count', () => {
  assert.deepEqual(v4IdentityMissing({ ...full, contact_number: 'none' }, { owner: '', contact: '', barangay: '' }, true, null), ['Contact number']);
  assert.deepEqual(v4IdentityMissing({ ...full, owner_name: 'n/a' }, { owner: '', contact: '', barangay: '' }, true, null), ['Owner name']);
});
test('identity: entered junk is refused', () => {
  assert.deepEqual(v4IdentityMissing(blank, { owner: 'none', contact: '00000000000', barangay: 'Dicayas' }, true, 'ok'), ['Owner name', 'Contact number']);
});

// Rule change (Wendell, 2026-11-17): a fresh GPS reading is required only when the
// vendo has no GPS on file. If GPS exists, don't ask; all four details must be complete.
const { v4HasGpsOnFile } =
  new Function(html.slice(a, b) + '; return {v4HasGpsOnFile};')();
test('gps on file: real coords → true; null, 0,0 or junk → false', () => {
  assert.equal(v4HasGpsOnFile({ lat: 8.58, lng: 123.34 }), true);
  assert.equal(v4HasGpsOnFile({ lat: '8.58', lng: '123.34' }), true);
  for (const it of [{ lat: null, lng: null }, { lat: 0, lng: 0 }, { lat: 'x', lng: 123 }, {}]) assert.equal(v4HasGpsOnFile(it), false, JSON.stringify(it));
});
