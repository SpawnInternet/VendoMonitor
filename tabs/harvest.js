// ── HARVEST TAB — COLLECTOR SUMMARY ──────────────────────────────
// Injects a live collector progress bar at the top of the harvest panel.
// The main harvest table/live feed/reconciliation tabs below are handled
// by the existing htLoad() / lfLoadToday() / rcRun() functions.

async function harvestTabLoad() {
  const el = document.getElementById('harvest-collector-summary');
  if (!el) return;

  el.innerHTML = '<div style="font-size:12px;color:var(--mu);padding:4px 0 8px">Loading collector summary...</div>';

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch today's harvests live — by actual collector who submitted
    const r = await fetch(
      `${SB_URL}/rest/v1/harvests?harvest_date=eq.${today}&select=collector,net_collectible,coins_total&order=collector.asc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();

    // Total pending from harvest_group_items
    const r2 = await fetch(
      `${SB_URL}/rest/v1/harvest_group_items?status=eq.pending&select=id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact', Range: '0-0' } }
    );
    const cr = r2.headers ? r2.headers.get('Content-Range') : null;
    const totalPending = cr ? parseInt(cr.split('/')[1] || 0) : 0;

    // Overdue from cache (non-critical)
    const cached = await apiLoad();
    const overdue = (cached && cached.overdue_vendos) || [];

    harvestSummaryRenderLive(rows, totalPending, overdue);
  } catch(e) {
    console.warn('[harvestTabLoad] live fetch failed:', e.message);
    el.innerHTML = '<div style="font-size:12px;color:var(--mu);padding:8px">Could not load harvest summary.</div>';
  }

  if (typeof htLoad === 'function') htLoad();
}

function harvestSummaryRenderLive(rows, totalPending, overdue) {
  const el = document.getElementById('harvest-collector-summary');
  if (!el) return;

  // Group by collector
  const byCollector = {};
  rows.forEach(r => {
    const c = r.collector || 'Unknown';
    if (!byCollector[c]) byCollector[c] = { done: 0, net: 0 };
    byCollector[c].done += 1;
    byCollector[c].net  += parseFloat(r.net_collectible || 0);
  });

  const totalDone = rows.length;
  const totalNet  = rows.reduce((s, r) => s + parseFloat(r.net_collectible || 0), 0);
  const overdueCount = overdue.length;

  const COLLECTOR_COLORS = {
    'Gilbert': '#1565c0',
    'Tandoy':  '#7c3aed',
    'Ailyn':   '#be185d',
    'Axcel':   '#0891b2',
    'Carlona': '#0369a1',
  };

  const collectorCards = Object.entries(byCollector).map(([name, s]) => {
    const color = COLLECTOR_COLORS[name] || '#374151';
    return `
      <div style="background:var(--cs);border:1px solid var(--bd);border-radius:10px;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-weight:600;font-size:13px;color:${color}">${name}</div>
          <div style="font-size:11px;font-weight:600;color:#16a34a">${fmtPeso(s.net)}</div>
        </div>
        <div style="font-size:10px;color:var(--mu)">${s.done} harvested today</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
      <div class="stat" style="border-bottom-color:#1565c0;padding:8px 10px">
        <div class="sl">Harvested</div>
        <div class="sv blue" style="font-size:18px">${fmtNum(totalDone)}</div>
        <div style="font-size:9px;color:var(--mu)">today</div>
      </div>
      <div class="stat" style="border-bottom-color:#16a34a;padding:8px 10px">
        <div class="sl">Net Collected</div>
        <div class="sv green" style="font-size:18px">${fmtPeso(totalNet)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#d97706;padding:8px 10px">
        <div class="sl">Pending</div>
        <div class="sv" style="font-size:18px;color:#d97706">${fmtNum(totalPending)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#dc2626;padding:8px 10px;cursor:pointer" onclick="harvestShowOverdue()">
        <div class="sl">Overdue 30d+</div>
        <div class="sv red" style="font-size:18px">${fmtNum(overdueCount)}</div>
      </div>
    </div>

    ${collectorCards ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:12px">
      ${collectorCards}
    </div>` : '<div style="font-size:12px;color:var(--mu);margin-bottom:12px">No harvests submitted today yet.</div>'}

    <div id="harvest-overdue-panel" style="display:none;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:12px;font-weight:600;color:#dc2626">🔴 Overdue Vendos (30+ days)</div>
        <button onclick="document.getElementById('harvest-overdue-panel').style.display='none'"
          style="border:none;background:none;cursor:pointer;font-size:16px;color:var(--mu)">✕</button>
      </div>
      <div style="max-height:200px;overflow-y:auto;border:1px solid #fecaca;border-radius:8px;background:#fff8f8">
        ${overdue.length ? overdue.slice(0, 50).map(v => {
          const days = daysSince(v.last_harvest_date);
          const color = days > 60 ? '#dc2626' : '#d97706';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #fecaca;font-size:11px">
            <div>
              <span style="font-weight:500">${v.sheet_name || v.tg_name || '—'}</span>
              <span style="color:var(--mu);margin-left:6px">${v.area} · VLAN ${v.vlan || '—'}</span>
            </div>
            <span style="font-weight:600;color:${color}">${days === 999 ? '∞' : days + 'd'}</span>
          </div>`;
        }).join('') : '<div style="padding:12px;color:var(--mu);font-size:12px">No overdue vendos</div>'}
      </div>
    </div>

    <div style="border-top:1px solid var(--bd);margin-bottom:8px"></div>
  `;
}

function harvestSummaryRender(groups, overdue) {
  // Legacy — kept for fallback compatibility
  const el = document.getElementById('harvest-collector-summary');
  if (!el || !groups || !groups.length) { if(el) el.innerHTML=''; return; }
  const rows = [];
  groups.forEach(g => {
    for (let i = 0; i < (g.items_done||0); i++) rows.push({ collector: g.collector, net_collectible: (parseFloat(g.net_total||0)/(g.items_done||1)).toFixed(2) });
  });
  const totalPending = groups.reduce((s,g)=>s+(g.items_total||0)-(g.items_done||0),0);
  harvestSummaryRenderLive(rows, totalPending, overdue);
}

function harvestShowOverdue() {
  const panel = document.getElementById('harvest-overdue-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}
