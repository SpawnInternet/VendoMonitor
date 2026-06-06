// ── HARVEST TAB ───────────────────────────────────────────────────
let _harvestData = null;

async function harvestTabLoad() {
  document.getElementById("harvest-tab-content").innerHTML =
    '<div style="padding:20px;color:var(--mu);font-size:13px">Loading harvest data...</div>';
  const data = await apiLoad();
  if (!data) return;
  _harvestData = data;
  harvestTabRender(data);
}

function harvestTabRender(data) {
  const { harvest_summary, overdue_vendos, areas } = data;
  const el = document.getElementById("harvest-tab-content");

  // ── Summary stat cards ────────────────────────────────────────
  const totalDone = harvest_summary.reduce((s, g) => s + (g.items_done || 0), 0);
  const totalPending = harvest_summary.reduce((s, g) => s + Math.max(0, (g.items_total || 0) - (g.items_done || 0) - (g.items_skipped || 0)), 0);
  const totalNet = harvest_summary.reduce((s, g) => s + parseFloat(g.net_total || 0), 0);
  const overdueCount = overdue_vendos ? overdue_vendos.length : 0;

  el.innerHTML = `
    <!-- Stat cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
      <div class="stat" style="border-bottom-color:#1565c0">
        <div class="sl">Total Harvested</div>
        <div class="sv blue">${fmtNum(totalDone)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#d97706">
        <div class="sl">Pending</div>
        <div class="sv" style="color:#d97706">${fmtNum(totalPending)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#16a34a">
        <div class="sl">Net Collected</div>
        <div class="sv green">${fmtPeso(totalNet)}</div>
      </div>
      <div class="stat" style="border-bottom-color:#dc2626">
        <div class="sl">Overdue Vendos</div>
        <div class="sv red">${fmtNum(overdueCount)}</div>
      </div>
    </div>

    <!-- Sub-tabs -->
    <div class="tab-row" id="harvest-subtabs" style="margin-bottom:10px">
      <button class="tab-btn active" onclick="harvestSubTab('groups',this)">📋 By Group</button>
      <button class="tab-btn" onclick="harvestSubTab('area',this)">📍 By Area</button>
      <button class="tab-btn" onclick="harvestSubTab('overdue',this)">🔴 Overdue</button>
      <button class="tab-btn" onclick="harvestSubTab('recon',this)">🔍 Reconciliation</button>
    </div>

    <!-- Sub-tab content -->
    <div id="harvest-sub-groups">${harvestGroupsHTML(harvest_summary)}</div>
    <div id="harvest-sub-area" style="display:none">${harvestAreaHTML(harvest_summary, areas)}</div>
    <div id="harvest-sub-overdue" style="display:none">${harvestOverdueHTML(overdue_vendos)}</div>
    <div id="harvest-sub-recon" style="display:none">${harvestReconHTML()}</div>
  `;
}

function harvestSubTab(id, btn) {
  ["groups","area","overdue","recon"].forEach(t => {
    const el = document.getElementById("harvest-sub-"+t);
    if (el) el.style.display = t === id ? "" : "none";
  });
  document.querySelectorAll("#harvest-subtabs .tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (id === "recon") harvestReconInit();
}

// ── Groups view ───────────────────────────────────────────────────
function harvestGroupsHTML(groups) {
  if (!groups || !groups.length) return '<div style="color:var(--mu);padding:16px;font-size:13px">No harvest runs found</div>';

  const header = `
    <div style="display:grid;grid-template-columns:130px 1fr 70px 70px 90px 90px;gap:6px;padding:4px 12px;font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em">
      <div>Collector</div><div>Progress</div><div>Done</div><div>Pending</div><div>Net</div><div>Status</div>
    </div>`;

  const rows = groups.map(g => {
    const total = g.items_total || 0;
    const done = g.items_done || 0;
    const skipped = g.items_skipped || 0;
    const pending = Math.max(0, total - done - skipped);
    const pct = total ? Math.round(done / total * 100) : 0;
    const net = parseFloat(g.net_total || 0);
    const statusPill = pct === 100
      ? '<span class="pill green">✓ Done</span>'
      : g.status === "active"
        ? '<span class="pill blue">Active</span>'
        : '<span class="pill gray">Idle</span>';

    return `
      <div style="display:grid;grid-template-columns:130px 1fr 70px 70px 90px 90px;gap:6px;align-items:center;background:var(--cs);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px">
        <div>
          <div style="font-weight:500;color:var(--tx)">${g.collector||"—"}</div>
          <div style="font-size:10px;color:var(--mu)">${g.group_label||g.group_id||"—"}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--mu);margin-bottom:3px">${g.area||""} · ${done}/${total}</div>
          <div style="background:var(--bd);border-radius:4px;height:6px;overflow:hidden">
            <div style="width:${pct}%;height:100%;border-radius:4px;background:${pct===100?'#16a34a':'#1565c0'}"></div>
          </div>
        </div>
        <div style="font-weight:500">${fmtNum(done)}</div>
        <div style="color:${pending>0?'#d97706':'var(--mu)'}">${fmtNum(pending)}</div>
        <div style="font-weight:500;color:#16a34a">${fmtPeso(net)}</div>
        <div>${statusPill}</div>
      </div>`;
  }).join("");

  return header + rows;
}

// ── Area view ─────────────────────────────────────────────────────
function harvestAreaHTML(groups, areas) {
  const areaMap = {};
  groups.forEach(g => {
    const a = g.area || "UNKNOWN";
    if (!areaMap[a]) areaMap[a] = { done: 0, total: 0, net: 0, skipped: 0 };
    areaMap[a].done += g.items_done || 0;
    areaMap[a].total += g.items_total || 0;
    areaMap[a].net += parseFloat(g.net_total || 0);
    areaMap[a].skipped += g.items_skipped || 0;
  });

  const ICONS = { DIPOLOG:"🏙", DAPITAN:"🌊", SINDANGAN:"🏝", POLANCO:"🌿", ROXAS:"🌺", SINAMAN:"🌾", MINAOG:"⛰", "MIX AREAS":"🗂" };

  return Object.entries(areaMap).map(([area, s]) => {
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    return `
      <div style="background:var(--cs);border:1px solid var(--bd);border-radius:10px;padding:12px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:500">${ICONS[area]||"📍"} ${area}</div>
          <div style="font-size:13px;font-weight:500;color:#16a34a">${fmtPeso(s.net)}</div>
        </div>
        <div style="background:var(--bd);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px">
          <div style="width:${pct}%;height:100%;border-radius:6px;background:${pct===100?'#16a34a':'#1565c0'};transition:width .3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mu)">
          <span>${s.done} harvested · ${s.skipped} skipped · ${Math.max(0,s.total-s.done-s.skipped)} pending</span>
          <span style="font-weight:500;color:${pct===100?'#16a34a':'#1565c0'}">${pct}%</span>
        </div>
      </div>`;
  }).join("") || '<div style="color:var(--mu);padding:16px;font-size:13px">No area data</div>';
}

// ── Overdue view ──────────────────────────────────────────────────
function harvestOverdueHTML(vendos) {
  if (!vendos || !vendos.length) return '<div style="color:var(--mu);padding:16px;font-size:13px">No overdue vendos</div>';

  const header = `
    <div style="margin-bottom:8px;font-size:12px;color:var(--mu)">${vendos.length} vendos not harvested in 30+ days</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em">
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)">Vendo</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)">Area</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)">VLAN</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)">Last Harvest</th>
          <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)">Days</th>
        </tr>
      </thead>
      <tbody>`;

  const rows = vendos.map(v => {
    const days = daysSince(v.last_harvest_date);
    const color = days > 60 ? "#dc2626" : days > 45 ? "#d97706" : "#92400e";
    return `
      <tr style="border-bottom:1px solid var(--bd)">
        <td style="padding:6px 8px">
          <div style="font-weight:500">${v.sheet_name||v.tg_name||"—"}</div>
          <div style="font-size:10px;color:var(--mu)">${v.tg_name||""}</div>
        </td>
        <td style="padding:6px 8px;color:var(--mu)">${v.area||"—"}</td>
        <td style="padding:6px 8px;color:var(--mu)">${v.vlan||"—"}</td>
        <td style="padding:6px 8px">${v.last_harvest_date ? fmtDate(v.last_harvest_date) : '<span style="color:#dc2626">Never</span>'}</td>
        <td style="padding:6px 8px;font-weight:600;color:${color}">${days === 999 ? "∞" : days+"d"}</td>
      </tr>`;
  }).join("");

  return header + rows + "</tbody></table>";
}

// ── Reconciliation placeholder ────────────────────────────────────
function harvestReconHTML() {
  return `<div id="recon-container" style="padding:8px">
    <div style="font-size:13px;color:var(--mu);margin-bottom:12px">Select date range to compare harvest coins vs Telegram income</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <label style="font-size:12px;color:var(--mu)">From</label>
      <input type="date" id="recon-from" style="padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:12px">
      <label style="font-size:12px;color:var(--mu)">To</label>
      <input type="date" id="recon-to" style="padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:12px">
      <button onclick="harvestReconRun()" style="padding:6px 14px;background:#1565c0;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">Run</button>
    </div>
    <div id="recon-results"></div>
  </div>`;
}

function harvestReconInit() {
  const today = todayPHT();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromStr = from.toISOString().slice(0, 10);
  const fromEl = document.getElementById("recon-from");
  const toEl = document.getElementById("recon-to");
  if (fromEl && !fromEl.value) fromEl.value = fromStr;
  if (toEl && !toEl.value) toEl.value = today;
}

async function harvestReconRun() {
  const from = document.getElementById("recon-from")?.value;
  const to = document.getElementById("recon-to")?.value;
  const el = document.getElementById("recon-results");
  if (!from || !to) { toast("Select date range"); return; }
  el.innerHTML = '<div style="color:var(--mu);font-size:13px;padding:8px">Running reconciliation...</div>';

  // Fetch harvest data and TG income in parallel
  const [harvests, txns] = await Promise.all([
    sb("harvest_group_items",
      `harvested_at=gte.${from}T00:00:00&harvested_at=lte.${to}T23:59:59&status=eq.harvested&select=sheet_name,tg_name,coins_total,net_collectible,harvested_at,area`,
      2000),
    sb("transactions",
      `date=gte.${from}&date=lte.${to}&is_skipped=eq.false&select=vendo,amount,date`,
      5000)
  ]);

  // Build TG income map by vendo name
  const tgMap = {};
  txns.forEach(t => {
    if (!tgMap[t.vendo]) tgMap[t.vendo] = 0;
    tgMap[t.vendo] += parseFloat(t.amount || 0);
  });

  // Build reconciliation rows
  const rows = harvests.map(h => {
    const name = h.sheet_name || h.tg_name || "—";
    const coins = parseFloat(h.coins_total || 0);
    const net = parseFloat(h.net_collectible || 0);
    const tgIncome = tgMap[h.tg_name] || tgMap[h.sheet_name] || 0;
    const gap = coins - tgIncome;
    const gapPct = tgIncome > 0 ? Math.abs(gap / tgIncome * 100) : 0;
    const flag = gap > 500 && gapPct > 20 ? "ALERT" : gap > 200 || gapPct > 15 ? "WARN" : "OK";
    return { name, coins, net, tgIncome, gap, gapPct, flag, area: h.area };
  }).sort((a, b) => b.gap - a.gap);

  const alerts = rows.filter(r => r.flag === "ALERT");
  const warns = rows.filter(r => r.flag === "WARN");

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="background:#fee2e2;border:1px solid #fecaca;border-radius:6px;padding:6px 12px;font-size:12px">🚨 ${alerts.length} alerts</div>
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 12px;font-size:12px">⚠️ ${warns.length} warnings</div>
      <div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:6px;padding:6px 12px;font-size:12px">✅ ${rows.length - alerts.length - warns.length} OK</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase">
          <th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--bd)">Vendo</th>
          <th style="text-align:right;padding:5px 8px;border-bottom:1px solid var(--bd)">Coins</th>
          <th style="text-align:right;padding:5px 8px;border-bottom:1px solid var(--bd)">TG Income</th>
          <th style="text-align:right;padding:5px 8px;border-bottom:1px solid var(--bd)">Gap</th>
          <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--bd)">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.slice(0, 100).map(r => `
          <tr style="border-bottom:1px solid var(--bd);${r.flag==='ALERT'?'background:#fff8f8':r.flag==='WARN'?'background:#fffbeb':''}">
            <td style="padding:5px 8px"><div style="font-weight:500">${r.name}</div><div style="font-size:9px;color:var(--mu)">${r.area||""}</div></td>
            <td style="padding:5px 8px;text-align:right">${fmtPeso(r.coins)}</td>
            <td style="padding:5px 8px;text-align:right">${fmtPeso(r.tgIncome)}</td>
            <td style="padding:5px 8px;text-align:right;font-weight:500;color:${r.gap>0?'#dc2626':'#16a34a'}">${r.gap>0?'+':''}${fmtPeso(r.gap)}</td>
            <td style="padding:5px 8px;text-align:center">
              <span style="padding:2px 7px;border-radius:8px;font-size:10px;font-weight:500;background:${r.flag==='ALERT'?'#fee2e2':r.flag==='WARN'?'#fef3c7':'#dcfce7'};color:${r.flag==='ALERT'?'#991b1b':r.flag==='WARN'?'#92400e':'#15803d'}">
                ${r.flag==='ALERT'?'🚨':r.flag==='WARN'?'⚠️':'✅'} ${r.flag}
              </span>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
