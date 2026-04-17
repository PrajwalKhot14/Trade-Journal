// ============================================================
//  data.js — CSV parsing, normalisation, FIFO trade grouping
// ============================================================

const VALID_ACTIONS = new Set([
  'buy to open', 'sell to close', 'buy to close', 'sell to open',
]);

const COL_REMAP = {
  'date':                'Date',
  'action':              'Action',
  'symbol':              'Symbol',
  'expiry':              'Expiry',
  'strike':              'Strike',
  'call/put':            'Side',
  'side':                'Side',
  'quantity':            'Quantity',
  'qty':                 'Quantity',
  'price':               'Price',
  'fees & commissions':  'Fees',
  'fees & comm':         'Fees',
  'fees':                'Fees',
  'amount':              'Amount',
};

// ── CSV PARSER ───────────────────────────────────────────────
// Handles quoted fields, $-prefixed numbers, TOS export quirks.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const parseRow = line => {
    const res = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    res.push(cur.trim());
    return res;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i]);
    if (vals.every(v => !v)) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = (vals[j] || '').replace(/^"|"$/g, '').trim());
    rows.push(obj);
  }
  return rows;
}

// ── NORMALISE ────────────────────────────────────────────────
// Remap columns, filter non-trade rows, split combined symbol,
// coerce numeric and date fields.
function normalise(rawRows) {
  // Step 1: remap column names to internal keys
  const remapped = rawRows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      const mapped = COL_REMAP[k.toLowerCase().trim()];
      o[mapped || k] = v;
    }
    return o;
  });

  // Step 2: keep only recognised trade actions
  const trades = remapped.filter(r =>
    VALID_ACTIONS.has((r.Action || '').toString().trim().toLowerCase())
  );

  // Step 3: split combined TOS symbol  e.g. "MSFT 05/15/2026 440.00 C"
  const needsSplit =
    trades.length > 0 &&
    !trades[0].Expiry &&
    /\d{2}\/\d{2}\/\d{4}/.test(trades[0].Symbol || '');

  trades.forEach(r => {
    if (needsSplit && r.Symbol) {
      const parts = r.Symbol.trim().split(/\s+/);
      if (parts.length >= 4) {
        r.Symbol = parts[0];
        r.Expiry = parts[1];
        r.Strike = parts[2];
        r.Side   = parts[3];
      }
    }
    r.Action   = titleCase((r.Action || '').trim());
    r.Price    = toNum(r.Price);
    r.Quantity = Math.abs(toNum(r.Quantity) || 0);
    r.Fees     = toNum(r.Fees) || 0;
    r.Amount   = toNum(r.Amount) || 0;
    r.Strike   = toNum(r.Strike);
    r.Date     = parseDate(r.Date);
    r.Expiry   = parseDate(r.Expiry);
  });

  // Step 4: options rows only (must have a valid Strike)
  return trades.filter(r => r.Strike != null && !isNaN(r.Strike));
}

// ── GROUP TRADES (FIFO) ──────────────────────────────────────
// Aggregates opens by position key (Symbol+Expiry+Strike+Side).
// Aggregates closes by position key + close date.
// Matches each open to its closes and allocates cost proportionally.
// Multiple close dates → multiple rows.
function groupTrades(rows) {
  const opens  = rows.filter(r => r.Action === 'Buy To Open');
  const closes = rows.filter(r => r.Action === 'Sell To Close');

  // Aggregate opens — one entry per position key
  const openMap = new Map();
  opens.forEach(r => {
    const k = posKey(r);
    if (!openMap.has(k)) {
      openMap.set(k, {
        Symbol: r.Symbol, Expiry: r.Expiry, Strike: r.Strike, Side: r.Side,
        dates: [], qty: 0, amount: 0, fees: 0, prices: [], qtys: [],
      });
    }
    const o = openMap.get(k);
    o.dates.push(r.Date);
    o.qty    += r.Quantity;
    o.amount += r.Amount;
    o.fees   += r.Fees;
    o.prices.push(r.Price);
    o.qtys.push(r.Quantity);
  });
  openMap.forEach(o => {
    const totalQ = o.qtys.reduce((a, b) => a + b, 0);
    o.avgPrice  = totalQ > 0 ? o.prices.reduce((s, p, i) => s + p * o.qtys[i], 0) / totalQ : 0;
    o.firstDate = o.dates.reduce((a, b) => a < b ? a : b);
  });

  // Aggregate closes — one entry per position key + close day
  const closeMap = new Map();
  closes.forEach(r => {
    const k = posKey(r) + '|' + dayKey(r.Date);
    if (!closeMap.has(k)) {
      closeMap.set(k, {
        Symbol: r.Symbol, Expiry: r.Expiry, Strike: r.Strike, Side: r.Side,
        date: r.Date, qty: 0, amount: 0, fees: 0, prices: [], qtys: [],
      });
    }
    const c = closeMap.get(k);
    c.qty    += r.Quantity;
    c.amount += r.Amount;
    c.fees   += r.Fees;
    c.prices.push(r.Price);
    c.qtys.push(r.Quantity);
  });
  closeMap.forEach(c => {
    const totalQ = c.qtys.reduce((a, b) => a + b, 0);
    c.avgPrice = totalQ > 0 ? c.prices.reduce((s, p, i) => s + p * c.qtys[i], 0) / totalQ : 0;
  });

  // FIFO match — for each open, find its close rows and allocate cost
  const result = [];
  openMap.forEach((o, ok) => {
    const matched = [];
    closeMap.forEach((c, ck) => { if (ck.startsWith(ok + '|')) matched.push(c); });
    matched.sort((a, b) => a.date - b.date);

    const costPer     = o.qty > 0 ? o.amount / o.qty : 0;
    const totalClosed = matched.reduce((s, c) => s + c.qty, 0);

    if (matched.length === 0) {
      // No closes yet — fully open
      result.push(buildRow(o, null, o.amount, 'Open'));
    } else {
      matched.forEach(c => {
        const allocCost = costPer * c.qty;
        const pnl       = allocCost + c.amount;
        const status    = totalClosed >= o.qty ? 'Closed' : 'Partial';
        result.push(buildRow(o, c, null, status, pnl));
      });
      // Remainder row for partially closed positions
      if (totalClosed < o.qty) {
        const remainingCost = costPer * (o.qty - totalClosed);
        result.push(buildRow(o, null, remainingCost, 'Open'));
      }
    }
  });

  // Attach hold time in hours
  result.forEach(r => {
    r._h = (r.Open_Date && r.Close_Date)
      ? (r.Close_Date - r.Open_Date) / 3_600_000
      : null;
  });

  return result;
}

function buildRow(o, c, costBasis, status, pnl = null) {
  return {
    Symbol:         o.Symbol,
    Expiry:         o.Expiry,
    Strike:         o.Strike,
    Side:           o.Side,
    Open_Date:      o.firstDate,
    Open_Qty:       o.qty,
    Open_AvgPrice:  o.avgPrice,
    Open_Cost:      o.amount,
    Close_Date:     c ? c.date    : null,
    Close_Qty:      c ? c.qty     : null,
    Close_AvgPrice: c ? c.avgPrice : null,
    Close_Proceeds: c ? c.amount   : null,
    PnL:            pnl,
    Cost_Basis:     status === 'Open' ? costBasis : null,
    Status:         status,
  };
}

// ── KEY HELPERS ──────────────────────────────────────────────
function posKey(r) {
  const exp = r.Expiry instanceof Date ? r.Expiry.getTime() : r.Expiry;
  return `${r.Symbol}|${exp}|${r.Strike}|${r.Side}`;
}

function dayKey(d) {
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'null';
}

// ── UTILITY HELPERS ──────────────────────────────────────────
function toNum(v) {
  if (v == null) return null;
  return parseFloat(String(v).replace(/[$,\s]/g, '')) || null;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function titleCase(s) {
  return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}
