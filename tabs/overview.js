// ── OVERVIEW TAB ──────────────────────────────────────────────────
let _overviewChart = null;
let _areaChart = null;

async function overviewLoad() {
  document.getElementById("dash-stats").innerHTML =
    '<div style="padding:20px;color:var(--mu);font-size:13px">Loading...</div>';
  const data = await apiLoad();
  if (!data) return;
  overviewRender(data);
}

function overviewRender(data) {
  const { stats, areas, trend, recent, suspicious } = data;

  // ── Stat cards ──────────────────────────────────────────────────
  const hackedCnt = stats.suspicious_count || 0;
  document.getElementById("dash-stats").innerHTML = `
    <div class="stat" style="border-bottom-color:#7c3aed" onclick="openVendoModal()">
      <div class="sl">Active Vendos</div>
      <div class="sv pur">${fmtNum(stats.total_vendos)}</div>
      <div style="font-size:9px;color:var(--mu);margin-top:2px">click to view all</div>
    </div>
    <div class="stat" style="border-bottom-color:#1565c0">
      <div class="sl">Total Transactions</div>
      <div class="sv blue">${fmtNum(stats.total_txns)}</div>
    </div>
    <div class="stat" style="border-bottom-color:#1565c0">
      <div class="sl">Total Sales</div>
      <div class="sv blue">${fmtPeso(stats.total_sales)}</div>
    </div>
    <div class="stat" style="border-bottom-color:#16a34a">
      <div class="sl">Today's Sales</div>
      <div class="sv green">${fmtPeso(stats.today_sales)}</div>
    </div>
    <div class="stat" style="border-bottom-color:#dc2626;border-color:rgba(220,38,38,.15)"
      onclick="showP('suspicious')">
      <div class="sl" style="color:#dc2626">Suspicious Txns</div>
      <div class="sv red">${fmtNum(hackedCnt)}</div>
    </div>`;

  // Update nav badges
  const nb = document.getElementById("nav-sus-badge");
  if (nb) { nb.textContent = hackedCnt > 0 ? hackedCnt : ""; nb.style.display = hackedCnt > 0 ? "" : "none"; }

  if (hackedCnt > 0) {
    document.getElementById("suspicious-alert").style.display = "flex";
    document.getElementById("alert-detail").textContent = `${hackedCnt} suspicious transactions detected`;
    document.getElementById("susp-count").textContent = hackedCnt;
  } else {
    document.getElementById("suspicious-alert").style.display = "none";
  }

  // ── 7-day trend chart ─────────────────────────────────────────
  const tLabels = trend.map(r => fmtDateShort(r.date));
  const tData = trend.map(r => parseFloat(r.total_sales || 0));
  const tCtx = document.getElementById("trend-chart").getContext("2d");
  if (_overviewChart) { _overviewChart.destroy(); _overviewChart = null; }
  { const ec = document.getElementById("trend-chart"); if(ec) Chart.getChart(ec)?.destroy(); }
  _overviewChart = new Chart(tCtx, {
    type: "line",
    data: {
      labels: tLabels,
      datasets: [{ data: tData, borderColor: "#1565c0", backgroundColor: "rgba(21,101,192,.08)", tension: 0.4, fill: true, pointRadius: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 } } },
        y: { ticks: { font: { size: 9 }, callback: v => "₱" + (v >= 1000 ? (v/1000).toFixed(0)+"K" : v) } }
      }
    }
  });

  // ── Area sales chart ──────────────────────────────────────────
  const aCtx = document.getElementById("area-chart").getContext("2d");
  if (_areaChart) { _areaChart.destroy(); _areaChart = null; }
  { const ec = document.getElementById("area-chart"); if(ec) Chart.getChart(ec)?.destroy(); }
  const COLORS = ["#1565c0","#16a34a","#7c3aed","#dc2626","#d97706","#0891b2","#9d174d","#374151"];
  _areaChart = new Chart(aCtx, {
    type: "bar",
    data: {
      labels: (areas||[]).map(a => a.area),
      datasets: [{ data: (areas||[]).map(a => parseFloat(a.total_sales || 0)), backgroundColor: COLORS }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 8 } } },
        y: { ticks: { font: { size: 9 }, callback: v => "₱" + (v >= 1000 ? (v/1000).toFixed(0)+"K" : v) } }
      }
    }
  });

  // ── Area grid ─────────────────────────────────────────────────
  const ICONS = { DIPOLOG:"🏙", DAPITAN:"🌊", SINDANGAN:"🏝", POLANCO:"🌿", ROXAS:"🌺", SINAMAN:"🌾", MINAOG:"⛰", "MIX AREAS":"🗂" };
  document.getElementById("area-grid").innerHTML = areas.map(a => `
    <div class="area-card" onclick="showAreaVendos('${a.area}')">
      <div style="font-size:16px">${ICONS[a.area]||"📍"}</div>
      <div style="font-size:10px;font-weight:600;color:var(--tx)">${a.area}</div>
      <div style="font-size:11px;font-weight:500;color:#1565c0">${fmtPeso(a.total_sales)}</div>
      <div style="font-size:9px;color:var(--mu)">${fmtNum(a.txn_count)} txns</div>
    </div>`).join("");

  // ── Today by area ─────────────────────────────────────────────
  document.getElementById("today-strip").innerHTML = areas.map(a => `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:3px 0;border-bottom:1px solid #f0f4ff">
      <span style="color:var(--mu)">${ICONS[a.area]||""} ${a.area}</span>
      <span style="font-weight:600;color:#16a34a">${fmtPeso(a.today_sales)}</span>
    </div>`).join("");

  // ── Recent transactions ───────────────────────────────────────
  overviewRenderRecent(recent);

  // ── Suspicious sidebar ────────────────────────────────────────
  const susp = suspicious || [];
  document.getElementById("suspicious-sidebar").innerHTML = susp.slice(0, 10).map(h => `
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid #fee2e2">
      <span style="color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${h.vendo||"—"}</span>
      <span style="color:#dc2626;font-weight:600;white-space:nowrap">${fmtNum(h.txn_count)} skip</span>
    </div>`).join("") || '<div style="font-size:11px;color:var(--mu);padding:8px">No suspicious transactions</div>';
}

function overviewRenderRecent(recent) {
  const el = document.getElementById("recent-txns");
  if (!recent || !recent.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--mu);padding:8px">No transactions today</div>';
    return;
  }
  el.innerHTML = recent.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #e8eeff;font-size:11px">
      <div style="overflow:hidden">
        <div style="font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${r.vendo||"—"}</div>
        <div style="color:var(--mu);font-size:9px">${r.area||""} · ${r.time||fmtTime(r.created_at)}</div>
      </div>
      <div style="font-weight:600;color:#1565c0;white-space:nowrap">₱${r.amount||0}</div>
    </div>`).join("");
}
