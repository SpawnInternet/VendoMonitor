// ── SPAWN INTERNET — API LAYER ────────────────────────────────────
// Calls the dashboard-summary Edge Function
// Falls back to direct DB queries if Edge Function not deployed yet
// Cache: 5 minutes in memory

const EDGE_URL = `${SB_URL}/functions/v1/dashboard-summary`;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache = null;
let _cacheTs = 0;
let _fetching = false;
let _fetchCallbacks = [];

// ── Main API call ─────────────────────────────────────────────────
async function apiLoad(force=false) {
  // Return cache if fresh
  if (!force && _cache && (Date.now() - _cacheTs < CACHE_TTL)) {
    return _cache;
  }

  // Deduplicate concurrent calls
  if (_fetching) {
    return new Promise(resolve => _fetchCallbacks.push(resolve));
  }
  _fetching = true;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);

    const r = await fetch(EDGE_URL, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: ctrl.signal
    });
    clearTimeout(tid);

    if (r.ok) {
      const data = await r.json();
      _cache = data;
      _cacheTs = Date.now();
      hideConnError();
      _fetching = false;
      _fetchCallbacks.forEach(cb => cb(data));
      _fetchCallbacks = [];
      return data;
    } else {
      throw new Error(`Edge Function HTTP ${r.status}`);
    }
  } catch(e) {
    // Edge Function not deployed or failed — fall back to direct DB
    console.warn("Edge Function unavailable, falling back to direct DB:", e.message);
    const data = await apiFallback();
    _cache = data;
    _cacheTs = Date.now();
    _fetching = false;
    _fetchCallbacks.forEach(cb => cb(data));
    _fetchCallbacks = [];
    return data;
  }
}

// ── Fallback: direct DB queries (current approach) ─────────────────
async function apiFallback() {
  const today = todayPHT();
  const [totals, areas, trend, recent, suspicious, harvests] = await Promise.all([
    sb("summary_totals", "order=updated_at.desc", 1),
    sb("summary_by_area", "order=total_sales.desc"),
    sb("trend_7day_mat", "order=date.asc", 7).catch(() => sb("trend_7day", "order=date.asc", 7)),
    sb("transactions", `date=eq.${today}&is_skipped=eq.false&order=created_at.desc`, 30),
    sb("hacked_summary_mat", "order=total_skipped.desc", 50),
    sb("harvest_groups", "order=started_at.desc", 20)
  ]);

  // Get harvest group items summary
  let harvestItems = [];
  if (harvests.length) {
    const ids = harvests.map(h => h.id).join(",");
    harvestItems = await sb("harvest_group_items", `group_run_id=in.(${ids})&select=group_run_id,status,net_collectible,harvested_at`);
  }

  // Build harvest summary per group
  const harvestSummary = harvests.map(hg => {
    const items = harvestItems.filter(i => i.group_run_id === hg.id);
    const done = items.filter(i => i.status === "harvested").length;
    const skipped = items.filter(i => i.status === "skipped").length;
    const total = items.length;
    const net = items.reduce((s, i) => s + (parseFloat(i.net_collectible) || 0), 0);
    return { ...hg, items_total: total, items_done: done, items_skipped: skipped, net_total: net };
  });

  // Get overdue vendos (last_harvest_date > 30 days ago or null)
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);
  const overdueStr = overdueDate.toISOString().slice(0, 10);
  const overdue = await sb("vendos",
    `last_harvest_date=lt.${overdueStr}&select=id,sheet_name,tg_name,area,vlan,last_harvest_date&order=last_harvest_date.asc.nullsfirst`,
    100
  );

  const totalRow = totals[0] || {};

  return {
    stats: {
      total_vendos: totalRow.total_vendos || 0,
      total_txns: totalRow.total_txns || 0,
      total_sales: totalRow.total_sales || 0,
      today_sales: areas.reduce((s, a) => s + parseFloat(a.today_sales || 0), 0),
      today_txns: areas.reduce((s, a) => s + parseInt(a.today_txns || 0), 0),
      suspicious_count: suspicious.length
    },
    trend: trend,
    areas: areas,
    recent: recent,
    suspicious: suspicious,
    harvest_summary: harvestSummary,
    overdue_vendos: overdue,
    _source: "fallback",
    _ts: Date.now()
  };
}

// ── Cache control ─────────────────────────────────────────────────
function apiInvalidate() {
  _cache = null;
  _cacheTs = 0;
}

function apiCacheAge() {
  if (!_cacheTs) return null;
  return Math.round((Date.now() - _cacheTs) / 1000);
}
