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

    // Fetch today's harvests live — include spawn_share and sheet_name for breakdown
    const r = await fetch(
      `${SB_URL}/rest/v1/harvests?harvest_date=eq.${today}&select=collector,net_collectible,spawn_share,coins_total,sheet_name,tg_name,area&order=collector.asc`,
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

// Store rows per collector for popup
let _collectorRows = {};

function harvestSummaryRenderLive(rows, totalPending, overdue) {
  const el = document.getElementById('harvest-collector-summary');
  if (!el) return;

  // Group by collector — use spawn_share as the displayed amount
  const byCollector = {};
  _collectorRows = {};
  rows.forEach(r => {
    const c = r.collector || 'Unknown';
    if (!byCollector[c]) byCollector[c] = { done: 0, spawn: 0 };
    byCollector[c].done  += 1;
    byCollector[c].spawn += parseFloat(r.spawn_share || 0);
    if (!_collectorRows[c]) _collectorRows[c] = [];
    _collectorRows[c].push(r);
  });

  const totalDone  = rows.length;
  const totalSpawn = rows.reduce((s, r) => s + parseFloat(r.spawn_share || 0), 0);
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
      <div onclick="showCollectorBreakdown('${name}')"
        style="background:var(--cs);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;cursor:pointer;transition:box-shadow .15s"
        onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'" onmouseout="this.style.boxShadow=''">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-weight:600;font-size:13px;color:${color}">${name}</div>
          <div style="font-size:11px;font-weight:600;color:#16a34a">${fmtPeso(s.spawn)}</div>
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
        <div class="sl">Spawn Share</div>
        <div class="sv green" style="font-size:18px">${fmtPeso(totalSpawn)}</div>
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

    <!-- Collector breakdown popup -->
    <div id="col-breakdown-bg" onclick="closeCollectorBreakdown()"
      style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center">
      <div onclick="event.stopPropagation()"
        style="background:#fff;border-radius:14px;padding:20px;width:min(480px,92vw);max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <div id="col-bd-name" style="font-size:16px;font-weight:700;color:#1e293b"></div>
            <div id="col-bd-sub" style="font-size:11px;color:var(--mu);margin-top:2px"></div>
          </div>
          <button onclick="closeCollectorBreakdown()" style="border:none;background:none;cursor:pointer;font-size:20px;color:#9ca3af">✕</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f0f4ff">
              <th style="padding:6px 10px;text-align:left;color:#1565c0;font-size:10px;font-weight:700;border-bottom:1px solid #e0e7ff">#</th>
              <th style="padding:6px 10px;text-align:left;color:#1565c0;font-size:10px;font-weight:700;border-bottom:1px solid #e0e7ff">Vendo</th>
              <th style="padding:6px 10px;text-align:left;color:#1565c0;font-size:10px;font-weight:700;border-bottom:1px solid #e0e7ff">Area</th>
              <th style="padding:6px 10px;text-align:right;color:#1565c0;font-size:10px;font-weight:700;border-bottom:1px solid #e0e7ff">Coins</th>
              <th style="padding:6px 10px;text-align:right;color:#1565c0;font-size:10px;font-weight:700;border-bottom:1px solid #e0e7ff">Spawn Share</th>
            </tr>
          </thead>
          <tbody id="col-bd-rows"></tbody>
        </table>
        <div id="col-bd-total" style="margin-top:10px;padding:8px 10px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;font-size:13px;font-weight:700">
          <span style="color:#1e293b">Total</span>
          <span style="color:#15803d"></span>
        </div>
      </div>
    </div>
  `;
}

function showCollectorBreakdown(name) {
  const rows = _collectorRows[name] || [];
  const popup = document.getElementById('col-breakdown-bg');
  if (!popup) return;

  const COLLECTOR_COLORS = {
    'Gilbert': '#1565c0', 'Tandoy': '#7c3aed', 'Ailyn': '#be185d',
    'Axcel': '#0891b2', 'Carlona': '#0369a1',
  };
  const color = COLLECTOR_COLORS[name] || '#374151';
  const totalSpawn = rows.reduce((s, r) => s + parseFloat(r.spawn_share || 0), 0);
  const totalCoins = rows.reduce((s, r) => s + parseFloat(r.coins_total || 0), 0);

  document.getElementById('col-bd-name').innerHTML = `<span style="color:${color}">${name}</span>`;
  document.getElementById('col-bd-sub').textContent = `${rows.length} vendo${rows.length!==1?'s':''} harvested today`;
  document.getElementById('col-bd-rows').innerHTML = rows.map((r, i) => {
    const vendoName = r.sheet_name || `<span style="color:#9ca3af;font-style:italic">unmatched</span>`;
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 10px;color:#9ca3af">${i+1}</td>
      <td style="padding:6px 10px;font-weight:500">${vendoName}</td>
      <td style="padding:6px 10px;color:#6b7280">${r.area||'—'}</td>
      <td style="padding:6px 10px;text-align:right;color:#374151">${fmtPeso(r.coins_total)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:#15803d">${fmtPeso(r.spawn_share)}</td>
    </tr>`;
  }).join('');
  const tot = document.querySelector('#col-bd-total span:last-child');
  if (tot) tot.textContent = fmtPeso(totalSpawn);

  popup.style.display = 'flex';
}

function closeCollectorBreakdown() {
  const popup = document.getElementById('col-breakdown-bg');
  if (popup) popup.style.display = 'none';
}

function harvestSummaryRender(groups, overdue) {
  // Legacy — kept for fallback compatibility
  const el = document.getElementById('harvest-collector-summary');
  if (!el || !groups || !groups.length) { if(el) el.innerHTML=''; return; }
  const rows = [];
  groups.forEach(g => {
    for (let i = 0; i < (g.items_done||0); i++) rows.push({ collector: g.collector, net_collectible: (parseFloat(g.net_total||0)/(g.items_done||1)).toFixed(2), spawn_share: null });
  });
  const totalPending = groups.reduce((s,g)=>s+(g.items_total||0)-(g.items_done||0),0);
  harvestSummaryRenderLive(rows, totalPending, overdue);
}

function harvestShowOverdue() {
  const panel = document.getElementById('harvest-overdue-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}
