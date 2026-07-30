
function fmtPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) { if (!n) return "0"; return Number(n).toLocaleString("en-PH"); }
function fmtDateShort(d) { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
function fmtTime(ts) { if (!ts) return "—"; return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }); }

// Moved here from dash.1.harvest.js so harvest can be lazy-loaded.
// Used by dash.4 (39x), dash.6 (18x), dash.9 (2x) and harvest itself.
const _php = v => v==null?'—':'₱'+Math.round(Number(v)).toLocaleString();
