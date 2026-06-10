// ── HARVEST TAB — COLLECTOR SUMMARY ──────────────────────────────
// Injects a live collector progress bar at the top of the harvest panel.
// The main harvest table/live feed/reconciliation tabs below are handled
// by the existing htLoad() / lfLoadToday() / rcRun() functions.

async function harvestTabLoad() {
  const el = document.getElementById('harvest-collector-summary');
  if (!el) return;

  el.innerHTML = '<div style="font-size:12px;color:var(--mu);padding:4px 0 8px">Loading collector summary...</div>';

  // Fetch harvest_groups LIVE — bypasses cache so counts reflect submissions instantly
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/harvest_groups?select=id,group_id,group_label,collector,area,total_vendos,harvested_count,skipped_count,total_net,status&status=eq.active&order=group_id.asc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const groups = await r.json();

    // Also fetch overdue from cached data (non-critical)
    const cached = await apiLoad();
    const overdue = (cached && cached.overdue_vendos) || [];

    // Normalize to match harvestSummaryRender expected shape
    const normalized = groups.map(g => ({
      ...g,
      items_total:   g.total_vendos    || 0,
      items_done:    g.harvested_count || 0,
      items_skipped: g.skipped_count   || 0,
      net_total:     g.total_net       || 0,
    }));

    harvestSummaryRender(normalized, overdue);
  } catch(e) {
    console.warn('[harvestTabLoad] live fetch failed, falling back to cache:', e.message);
    const data = await apiLoad();
    if (data && data.harvest_summary) {
      harvestSummaryRender(data.harvest_summary, data.overdue_vendos || []);
    } else {
      el.innerHTML = '';
    }
  }

  // Also trigger the existing harvest table load
  if (typeof htLoad === 'function') htLoad();
}

function harvestSummaryRender(groups, overdue) {
  const el = document.getElementById('harvest-collector-summary');
  if (!el) return;

  if (!groups || !groups.length) {
    el.innerHTML = '';
    return;
  }

  // ── Collector stat cards ────────────────────────────────────────
  const totalDone    = groups.reduce((s, g) => s + (g.items_done || 0), 0);
  const totalVendos  = groups.reduce((s, g) => s + (g.items_total || 0), 0);
  const totalNet     = groups.reduce((s, g) => s + parseFloat(g.net_total || 0), 0);
  const overdueCount = overdue.length;

  // ── Group by collector ──────────────────────────────────────────
  const byCollector = {};
  groups.forEach(g => {
    const c = g.collector || 'Unknown';
    if (!byCollector[c]) byCollector[c] = { done: 0, total: 0, net: 0, skipped: 0, groups: [] };
    byCollector[c].done    += g.items_done || 0;
    byCollector[c].total   += g.items_total || 0;
    byCollector[c].net     += parseFloat(g.net_total || 0);
    byCollector[c].skipped += g.items_skipped || 0;
    byCollector[c].groups.push(g.group_label || g.group_id);
  });

  const COLLECTOR_COLORS = {
    'Gilbert': '#1565c0',
    'Tandoy':  '#7c3aed',
    'Ailyn':   '#be185d',
    'Axcel':   '#0891b2',
  };

  el.innerHTML = `
    <!-- Summary stat row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
      <div class="stat" style="border-bottom-color:#1565c0;padding:8px 10px">
        <div class="sl">Harvested</div>
        <div class="sv blue" style="font-size:18px">${fmtNum(totalDone)}</div>
        <div style="font-size:9px;color:var(--mu)">${totalVendos ? Math.round(totalDone/totalVendos*100) : 0}% of ${fmtNum(totalVendos)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#16a34a;padding:8px 10px">
        <div class="sl">Net Collected</div>
        <div class="sv green" style="font-size:18px">${fmtPeso(totalNet)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#d97706;padding:8px 10px">
        <div class="sl">Pending</div>
        <div class="sv" style="font-size:18px;color:#d97706">${fmtNum(totalVendos - totalDone)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#dc2626;padding:8px 10px;cursor:pointer" onclick="harvestShowOverdue()">
        <div class="sl">Overdue 30d+</div>
        <div class="sv red" style="font-size:18px">${fmtNum(overdueCount)}</div>
      </div>
    </div>

    <!-- Per-collector progress bars -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:12px">
      ${Object.entries(byCollector).map(([name, s]) => {
        const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
        const color = COLLECTOR_COLORS[name] || '#374151';
        const pending = Math.max(0, s.total - s.done - s.skipped);
        return `
          <div style="background:var(--cs);border:1px solid var(--bd);border-radius:10px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="font-weight:600;font-size:13px;color:${color}">${name}</div>
              <div style="font-size:11px;font-weight:600;color:#16a34a">${fmtPeso(s.net)}</div>
            </div>
            <div style="background:var(--bd);border-radius:6px;height:7px;overflow:hidden;margin-bottom:5px">
              <div style="width:${pct}%;height:100%;border-radius:6px;background:${color};transition:width .4s"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mu)">
              <span>${s.done} done · ${s.skipped} skipped · ${pending} pending</span>
              <span style="font-weight:600;color:${pct===100?'#16a34a':color}">${pct}%</span>
            </div>
          </div>`;
      }).join('')}
    </div>

    <!-- Overdue panel (hidden by default) -->
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

function harvestShowOverdue() {
  const panel = document.getElementById('harvest-overdue-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}
