/* 🤖 The digital employee as a row of AGENTS — one strip on the home page (2026-11-13; Wendell: "make it agents").
   Reads view v_employee_counts_v1 (one row: every agent's switch + today's numbers; service_role only, through the admin gateway).
   Absent → the strip stays empty. Counts only. Decisions are taken in Spawn Text → 💳 GCash → ⚠ Exceptions; this strip only shows them. */
(function(){
  const el = () => document.getElementById('employee-strip');
  const n = v => Number(v || 0).toLocaleString('en-PH');
  const peso = v => '₱' + Number(v || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // switch value → light + word
  const MODE = { on:['#027e60', 'on'], watch:['#b45309', 'watch'], once:['#b45309', 'test'], shadow:['#7c3aed', 'shadow'], off:['#9ca3af', 'off'] };
  const light = m => { const [c, w] = MODE[m] || MODE.off; return `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:4px;vertical-align:middle"></span><span style="font-size:9px;color:${c};font-weight:700">${w}</span>`; };
  function agent(icon, name, mode, main, sub, title){
    return `<div title="${esc(title || '')}" style="flex:1 1 120px;min-width:120px;padding:7px 10px;border-radius:8px;background:var(--bg2, #f8fafc);border:1px solid var(--line, #e5e7eb)">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--mu,#6b7280);text-transform:uppercase;letter-spacing:.04em"><span>${icon} ${name}</span>${light(mode)}</div>
      <div style="font-size:16px;font-weight:800;margin-top:2px">${main}</div>
      <div style="font-size:10px;color:var(--mu,#6b7280)">${sub}</div></div>`;
  }
  function render(r){
    const host = el(); if (!host) return;
    if (!r) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="cs"><div class="cs-t">🤖 Digital employee · the agents today
        <span style="float:right;font-size:9px;color:var(--mu);font-weight:400;text-transform:none;letter-spacing:0">decide in Spawn Text → 💳 GCash → ⚠ Exceptions</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${agent('📷', 'Reader', r.reader_mode, n(r.reads_24h) + ' <span style="font-size:11px;color:#027e60">' + n(r.confirmed_24h) + ' in GCash</span>', 'receipts read, last 24 h', 'Messenger receipts read in the last 24 hours, and how many the GCash export confirms')}
        ${agent('🏷', 'Namer', r.pair_mode, n(r.unnamed) + ' <span style="font-size:11px;color:#b45309">' + n(r.conflicts) + ' conflicts</span>', 'receipts still unnamed', 'receipts nobody has named · bubble name vs record conflicts')}
        ${agent('💸', 'Collector', 'on', n(r.unclaimed) + ' <span style="font-size:11px;color:#b91c1c">' + peso(r.unclaimed_amount) + '</span>', 'GCash in, nobody claims (60 d)', 'GCash money in that no book row, app record, text or receipt claims')}
        ${agent('🧾', 'Cashier', 'on', n(r.or_gaps) + (r.week_booked_no_photo != null ? ' <span style="font-size:11px;color:#b45309">' + n(r.week_booked_no_photo) + ' no photo</span>' : ''),
                r.week_booked_no_photo != null ? 'OR gaps · this week: ' + n(r.week_booked_no_photo) + ' booked without a photo' + (r.week_amount_no_photo ? ' (' + peso(r.week_amount_no_photo) + ')' : '') : 'paper ORs not in the book',
                'official receipts photographed in the chat but not written in BASHANG · this week: cash in the book with no OR photo (office counter can be exempt)')}
        ${agent('🤖', 'Recorder', r.record_mode, n(r.record_mode === 'on' ? r.recorded_fb : r.would_record), r.record_mode === 'on' ? 'screenshot payments recorded' : 'would record (watch)', 'screenshot payments confirmed by the export and written into the subscriber\'s months')}
        ${agent('📇', 'Clerk', r.fill_mode, n(r.fills_today), 'subscriber fields filled today', 'mobile, install date, PPPoE and address filled from the New Subscriber chat (empty fields only)')}
        ${agent('📱', 'Texter', r.sms_mode === 'live' ? 'on' : r.sms_mode === 'dry_run' ? 'watch' : 'off', n(r.texts_out_today) + ' <span style="font-size:11px;color:var(--mu)">' + n(r.texts_in_today) + ' in</span>', 'texts sent today', 'Spawn Text reminders and replies sent today · texts received')}
        ${agent('✂', 'Disconnector', r.disc_mode === 'on' ? 'shadow' : 'off', n(r.disc_candidates) + ' <span style="font-size:11px;color:var(--mu)">' + n(r.disc_hold) + ' hold</span>', 'shadow list' + (r.disc_as_of ? ' · as of ' + new Date(r.disc_as_of).toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : ''), '2+ unpaid months and no evidence of paying · on hold for a reason · computed once a day at 09:30 · nobody is disconnected by this')}
        ${agent('🧑‍💼', 'Office', r.exceptions_mode, n(r.taps_today), 'answers given today', 'taps on the exceptions screen today')}
      </div></div>`;
  }
  async function load(){
    if (!el()) return;
    try {
      const rows = await sb('v_employee_counts_v1', 'select=*', 1);
      render(Array.isArray(rows) && rows.length ? rows[0] : null);
    } catch (e) { render(null); }
  }
  window.employeeStripLoad = load;
  document.addEventListener('DOMContentLoaded', () => { load(); setInterval(load, 5 * 60 * 1000); });
})();
