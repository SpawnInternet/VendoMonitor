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
        ${harvestCard(r)}
      </div>${harvestPanel(r)}</div>`;
    host.querySelectorAll('details[data-hk]').forEach(d => d.addEventListener('toggle', () => { d.open ? OPEN.add(d.dataset.hk) : OPEN.delete(d.dataset.hk); }));
  }

  /* 🧺 Harvest agent (2026-11-19, eod_harvest): live every 30 min 09:00–18:30, final report 18:30.
     Reads the harvest_* columns appended to v_employee_counts_v1. Reports only; nothing here writes. */
  const OPEN = new Set();                      // which <details> stay open across the 5-minute refresh
  const tm = iso => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : '';
  const det = (key, summary, body, style) => `<details data-hk="${esc(key)}" ${OPEN.has(key) ? 'open' : ''} style="margin-top:6px;${style || ''}">
      <summary style="cursor:pointer;font-size:12px;font-weight:700">${summary}</summary>${body}</details>`;
  function harvestCard(r){
    const R = r.harvest_report; if (!R) return '';
    const T = R.totals || {}, cols = R.collectors || [];
    const last = cols.map(c => c.last).filter(Boolean).sort().pop();
    const warn = (R.advice || []).filter(a => a.level === 'warn').length;
    return agent('🧺', 'Harvest', r.harvest_mode, n(T.harvests) + ' <span style="font-size:11px;color:#027e60">' + peso(T.spawn) + '</span>',
                 (R.final ? 'final · ' : 'so far · ') + n(T.collectors) + ' collectors' + (last ? ' · last ' + last : '') + (warn ? ' · ' + warn + ' ⚠' : ''),
                 'Harvests saved today and Spawn share · live every 30 min, final at 18:30 · open the Harvest agent report below');
  }
  function harvestPanel(r){
    const R = r.harvest_report; if (!R) return '';
    const T = R.totals || {}, O = R.overdue || {}, B = O.buckets || {}, L = R.learned || {};
    const adv = R.advice || [], qs = R.questions || [], cols = R.collectors || [];
    const mu = 'color:var(--mu,#6b7280)', cell = 'padding:3px 6px;border-bottom:1px solid var(--line,#e5e7eb);vertical-align:top';
    const advHtml = adv.length ? adv.map(a => `<div style="font-size:12px;padding:3px 0;${a.level === 'warn' ? 'color:#b45309;font-weight:600' : mu}">${a.level === 'warn' ? '⚠' : 'ℹ'} ${esc(a.text)}</div>`).join('')
                               : `<div style="font-size:12px;${mu}">Nothing unusual against what it has learned.</div>`;
    const colHtml = cols.map(c => {
      const u = c.usual;
      const vs = u ? `usual ${u.harvests} · ${peso(u.spawn)} · starts ${esc(u.first)}` : 'no history yet';
      const rows = (c.items || []).map(i => {
        const note = [i.late_min ? `synced ${i.late_min} min late (offline)` : '', i.office ? 'office entry' : '', i.unlinked ? 'card has no vendo' : '', i.low ? `low · usually ${peso(i.low)}` : ''].filter(Boolean).join(' · ');
        return `<tr><td style="${cell};font-variant-numeric:tabular-nums">${esc(i.time)}</td><td style="${cell}">${esc(i.vendo)}</td><td style="${cell}">${esc(i.area || '')}</td>
          <td style="${cell};text-align:right">${peso(i.spawn)}</td><td style="${cell}">${esc(i.gps || '—')}</td>
          <td style="${cell};text-align:right;${i.gap_min >= 120 ? 'color:#b91c1c;font-weight:700' : ''}">${i.gap_min != null ? i.gap_min + 'm' : ''}</td>
          <td style="${cell};${i.low || i.unlinked ? 'color:#b91c1c' : mu}">${esc(note)}</td></tr>`;
      }).join('');
      return det('c:' + c.collector,
        `${esc(c.collector)} · ${n(c.harvests)} harvests · ${peso(c.spawn)} <span style="font-weight:400;${mu}">· ${esc(c.first || '—')}–${esc(c.last || '—')} · longest gap ${c.longest_gap_min != null ? c.longest_gap_min + ' min' : '—'} · GPS ${n(c.gps_n)}/${n(c.harvests)} · ${vs}</span>`,
        `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px"><thead><tr style="${mu}">
           <th style="${cell};text-align:left">Saved</th><th style="${cell};text-align:left">Vendo</th><th style="${cell};text-align:left">Area</th><th style="${cell};text-align:right">Spawn</th>
           <th style="${cell};text-align:left">GPS</th><th style="${cell};text-align:right">Gap</th><th style="${cell};text-align:left">Note</th></tr></thead><tbody>${rows}</tbody></table></div>`);
    }).join('') || `<div style="font-size:12px;${mu};margin-top:6px">No harvests saved yet today.</div>`;
    const qHtml = qs.length ? det('q', `❓ Questions for you · ${n(qs.length)}`,
        qs.map(q => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--line,#e5e7eb)">${esc(q.q)}</div>`).join('')) : '';
    const areas = Object.entries(O.by_area || {}).sort((a, b) => b[1] - a[1]).map(([a, k]) => esc(a) + ' ' + n(k)).join(' · ');
    const top = (O.top || []).slice(0, 40).map(t => `<tr><td style="${cell}">${esc(t.vendo)}</td><td style="${cell}">${esc(t.area)}</td><td style="${cell};text-align:right">${n(t.days)}d</td>
        <td style="${cell};${mu}">${t.usual_cycle != null ? 'usually every ' + t.usual_cycle + 'd' : ''}</td><td style="${cell}">${t.online ? '🟢' : '⚪'}</td></tr>`).join('');
    const oHtml = det('o', `⏳ Overdue · ${n(O.over30)} over 30 days · ${n(O.over30_online)} online · ${n(O.never)} never harvested`,
        `<div style="font-size:11px;${mu};margin:4px 0">31–44d ${n(B.d31_44)} · 45–59d ${n(B.d45_59)} · 60–89d ${n(B.d60_89)} · 90+d ${n(B.d90)} · ${n(O.past_own_cycle)} past twice their own cycle${areas ? '<br>' + areas : ''}</div>
         <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>${top}</tbody></table></div>
         <div style="font-size:10px;${mu};margin-top:3px">Online first, then oldest · top 40 · same list as the Overdue tab</div>`);
    const head = `🧺 Harvest agent report · ${R.final ? 'final' : 'so far today'} · ${n(T.harvests)} harvests · ${peso(T.spawn)} Spawn · ${n(adv.filter(a => a.level === 'warn').length)} ⚠ · ${n(qs.length)} ❓
      <span style="font-weight:400;${mu}">· as of ${tm(R.as_of || r.harvest_built_at)}</span>`;
    return det('panel', head,
      `<div style="padding:6px 2px 2px">${advHtml}
         <div style="font-size:11px;font-weight:700;${mu};margin-top:8px;text-transform:uppercase;letter-spacing:.04em">Collectors · tap one for every save time</div>${colHtml}
         ${qHtml}${oHtml}
         <div style="font-size:10px;${mu};margin-top:8px">Learned from ${n(L.collector_days)} collector-days and ${n(L.book_rows)} book rows · ${n(L.vendos_with_cycle)} vendos with their own cycle · relearns every run · reports only</div></div>`,
      'padding:6px 10px;border-radius:8px;border:1px solid var(--line,#e5e7eb);background:var(--bg2,#f8fafc)');
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
