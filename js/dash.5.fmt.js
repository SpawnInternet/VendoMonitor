
function fmtPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) { if (!n) return "0"; return Number(n).toLocaleString("en-PH"); }
function fmtDateShort(d) { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
function fmtTime(ts) { if (!ts) return "—"; return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }); }
