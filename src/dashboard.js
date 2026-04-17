// ============================================================
//  dashboard.js — state, file loading, KPIs, table, UI wiring
// ============================================================

// ── CONSTANTS ────────────────────────────────────────────────
const PAGE = 20;

const TABLE_COLS = [
  { k: 'Symbol',         l: 'Symbol'    },
  { k: 'Expiry',         l: 'Expiry'    },
  { k: 'Strike',         l: 'Strike'    },
  { k: 'Side',           l: 'C/P'       },
  { k: 'Open_Date',      l: 'Open Date' },
  { k: 'Open_Qty',       l: 'Qty'       },
  { k: 'Open_AvgPrice',  l: 'Open $'    },
  { k: 'Open_Cost',      l: 'Cost'      },
  { k: 'Close_Date',     l: 'Close Date'},
  { k: 'Close_Qty',      l: 'Cl.Qty'   },
  { k: 'Close_AvgPrice', l: 'Close $'  },
  { k: 'Close_Proceeds', l: 'Proceeds' },
  { k: 'PnL',            l: 'P&L'      },
  { k: 'Cost_Basis',     l: 'Basis'    },
  { k: '_h',             l: 'Hold'     },
  { k: 'Status',         l: 'Status'   },
];

// ── STATE ────────────────────────────────────────────────────
let allRows   = [];
let dayRows   = [];
let swingRows = [];

const S = {
  main:  { f: 'all', q: '', pg: 1, sc: 'Open_Date', sd: -1, rows: [], filtered: [], dateFrom: null, dateTo: null },
  day:   { f: 'all', q: '', pg: 1, sc: 'Open_Date', sd: -1, rows: [], filtered: [] },
  swing: { f: 'all', q: '', pg: 1, sc: 'Open_Date', sd: -1, rows: [], filtered: [] },
};

// ── CLOCK ────────────────────────────────────────────────────
function tick() {
  const n = new Date();
  document.getElementById('clock').textContent =
    n.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    '  ' +
    n.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(tick, 1000);
tick();

// ── FILE LOADING ─────────────────────────────────────────────
document.getElementById('fileInput').addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

const dz = document.getElementById('dropZone');
if (dz) {
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

function setStatus(msg, isErr = false) {
  const el = document.getElementById('loadStatus');
  if (el) { el.textContent = msg; el.className = 'load-status' + (isErr ? ' err' : ''); }
}

function handleFile(file) {
  setStatus('Reading file...');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let rawRows;
      if (ext === 'csv') {
        rawRows = parseCSV(e.target.result);
      } else {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        rawRows  = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      }
      setStatus(`Parsed ${rawRows.length} raw rows. Normalising...`);
      const cleaned = normalise(rawRows);
      setStatus(`${cleaned.length} trade rows found. Grouping...`);
      allRows   = groupTrades(cleaned);
      dayRows   = allRows.filter(r => r._h !== null && r._h < 24);
      swingRows = allRows.filter(r => r._h === null || r._h >= 24);
      setStatus('');
      initDashboard();
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      console.error(err);
    }
  };
  if (file.name.endsWith('.csv')) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// ── INIT ─────────────────────────────────────────────────────
function initDashboard() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tabNav').style.display     = 'flex';

  document.getElementById('cntMain').textContent  = allRows.length;
  document.getElementById('cntDay').textContent   = dayRows.length;
  document.getElementById('cntSwing').textContent = swingRows.length;

  S.main.rows  = allRows;
  S.day.rows   = dayRows;
  S.swing.rows = swingRows;

  buildHeaders();
  renderKPIs('main',  allRows,   5);
  renderKPIs('day',   dayRows,   4);
  renderKPIs('swing', swingRows, 4);
  renderMainCharts(allRows);
  renderDayCharts(dayRows);
  renderSwingCharts(swingRows);
  renderSymbolCards('main',  allRows,   'g');
  renderSymbolCards('day',   dayRows,   'o');
  renderSymbolCards('swing', swingRows, 'p');
  applyFilter('main');
  applyFilter('day');
  applyFilter('swing');
  calInit(allRows);

  document.getElementById('footMeta').textContent =
    `${allRows.length} grouped positions — ${dayRows.length} day · ${swingRows.length} swing`;
}

// ── KPIs ─────────────────────────────────────────────────────
function renderKPIs(tab, rows, count) {
  const closed  = rows.filter(r => r.Status === 'Closed');
  const partial = rows.filter(r => r.Status === 'Partial');
  const open    = rows.filter(r => r.Status === 'Open');

  const realPnL  = closed.reduce((s, r) => s + (r.PnL || 0), 0);
  const partPnL  = partial.reduce((s, r) => s + (r.PnL || 0), 0);
  const totalPnL = realPnL + partPnL;
  const wins     = closed.filter(r => (r.PnL || 0) > 0).length;
  const wr       = closed.length ? wins / closed.length * 100 : 0;
  const atRisk   = [...open, ...partial].reduce((s, r) => s + Math.abs(r.Cost_Basis || 0), 0);
  const avgPnL   = closed.length ? realPnL / closed.length : 0;
  const avgHold  = rows.filter(r => r._h !== null)
    .reduce((s, r, _, a) => s + r._h / a.length, 0);

  let items;
  if (count === 5) {
    items = [
      { l: 'Total Realized P&L', v: formatMoney(totalPnL), c: totalPnL >= 0 ? 'green' : 'red', s: `${closed.length + partial.length} trades` },
      { l: 'Win Rate',           v: wr.toFixed(1) + '%',   c: wr >= 50 ? 'green' : 'red',       s: `${wins}W / ${closed.length - wins}L closed` },
      { l: 'Open Positions',     v: open.length + partial.length, c: 'blue',                     s: `${open.length} open · ${partial.length} partial` },
      { l: 'Capital at Risk',    v: formatMoney(atRisk),   c: 'warn',                            s: 'cost basis of open positions' },
      { l: 'Avg P&L / Trade',    v: formatMoney(avgPnL),   c: avgPnL >= 0 ? 'green' : 'red',    s: 'closed only' },
    ];
  } else {
    items = [
      { l: 'Realized P&L',    v: formatMoney(totalPnL), c: totalPnL >= 0 ? 'green' : 'red', s: `${closed.length} closed` },
      { l: 'Win Rate',        v: wr.toFixed(1) + '%',   c: wr >= 50 ? 'green' : 'red',       s: `${wins}W / ${closed.length - wins}L` },
      { l: 'Avg P&L / Trade', v: formatMoney(avgPnL),   c: avgPnL >= 0 ? 'green' : 'red',   s: 'closed only' },
      {
        l: tab === 'day' ? 'Avg Hold Time' : 'Avg Hold Days',
        v: tab === 'day' ? formatHoldHours(avgHold) : (avgHold ? (avgHold / 24).toFixed(1) + 'd' : '—'),
        c: tab === 'day' ? 'orange' : 'purple',
        s: `${rows.length} total`,
      },
    ];
  }

  document.getElementById('kpi' + cap(tab)).innerHTML = items.map(i => `
    <div class="kpi">
      <div class="kpi-label">${i.l}</div>
      <div class="kpi-value ${i.c}">${i.v}</div>
      <div class="kpi-sub">${i.s}</div>
    </div>
  `).join('');
}

// ── SYMBOL CARDS ─────────────────────────────────────────────
function renderSymbolCards(tab, rows, barClass) {
  const syms = [...new Set(rows.map(r => r.Symbol))].sort();
  document.getElementById('sg' + cap(tab)).innerHTML = syms.map(sym => {
    const sr   = rows.filter(r => r.Symbol === sym);
    const cl   = sr.filter(r => r.Status === 'Closed');
    const pnl  = sr.reduce((s, r) => s + (r.PnL || 0), 0);
    const wins = cl.filter(r => (r.PnL || 0) > 0).length;
    const wr   = cl.length ? wins / cl.length * 100 : 0;
    const basis = sr.reduce((s, r) => s + Math.abs(r.Cost_Basis || 0), 0);
    const avgH  = sr.filter(r => r._h !== null).reduce((s, r, _, a) => s + r._h / a.length, 0);
    const holdStr = tab === 'main' ? '' : `
      <div class="sc-row">
        <span>Avg Hold</span>
        <span>${tab === 'day' ? formatHoldHours(avgH) : (avgH ? (avgH / 24).toFixed(1) + 'd' : '—')}</span>
      </div>`;
    return `
      <div class="sc">
        <div class="sc-sym">${sym}</div>
        <div class="sc-row"><span>Trades</span><span>${sr.length}</span></div>
        <div class="sc-row"><span>Win Rate</span><span>${wr.toFixed(0)}%</span></div>
        ${holdStr}
        <div class="sc-row"><span>Basis Left</span><span>${formatMoney(basis)}</span></div>
        <div class="sc-pnl ${pnl > 0 ? 'mp' : pnl < 0 ? 'mn' : ''}">${formatMoney(pnl)}</div>
        <div class="sc-bar"><div class="sc-bar-fill ${barClass}" style="width:${wr}%"></div></div>
      </div>`;
  }).join('');
}

// ── TABLE HEADERS ─────────────────────────────────────────────
function buildHeaders() {
  ['main', 'day', 'swing'].forEach(t => {
    document.getElementById('th' + cap(t)).innerHTML = TABLE_COLS.map(c =>
      `<th data-t="${t}" data-k="${c.k}">${c.l} <span class="sa">↕</span></th>`
    ).join('');
  });

  document.querySelectorAll('th[data-k]').forEach(th => {
    th.addEventListener('click', () => {
      const t = th.dataset.t, k = th.dataset.k;
      S[t].sd = (S[t].sc === k) ? -S[t].sd : -1;
      S[t].sc = k;
      document.querySelectorAll(`th[data-t="${t}"]`).forEach(x => x.classList.remove('sorted'));
      th.classList.add('sorted');
      th.querySelector('.sa').textContent = S[t].sd === 1 ? '↑' : '↓';
      applyFilter(t);
    });
  });
}

// ── FILTER + SORT + RENDER ────────────────────────────────────
function applyFilter(tab) {
  const s = S[tab];
  let rows = s.rows.filter(r => {
    if (s.f !== 'all' && r.Status !== s.f) return false;
    if (s.q && !(r.Symbol || '').toLowerCase().includes(s.q.toLowerCase())) return false;
    // Date filter (main tab only) — open positions always pass through
    if (tab === 'main' && (s.dateFrom || s.dateTo) && r.Close_Date) {
      if (s.dateFrom && r.Close_Date < s.dateFrom) return false;
      if (s.dateTo   && r.Close_Date > s.dateTo)   return false;
    }
    return true;
  });
  rows.sort((a, b) => {
    let va = a[s.sc], vb = b[s.sc];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va instanceof Date) return s.sd * (va - vb);
    if (typeof va === 'number') return s.sd * (va - vb);
    return s.sd * String(va).localeCompare(String(vb));
  });
  s.filtered = rows;
  s.pg = 1;

  // Re-render KPIs, charts, symbol cards with filtered data
  if (tab === 'main') {
    renderKPIs('main', rows, 5);
    renderSymbolCards('main', rows, 'g');
    renderMainCharts(rows);
  }
  renderTable(tab);
}

function renderTable(tab) {
  const s = S[tab], rows = s.filtered;
  const start = (s.pg - 1) * PAGE, end = start + PAGE;
  const C = cap(tab);

  document.getElementById('bdg' + C).textContent = `${rows.length} rows`;
  document.getElementById('pi'  + C).textContent =
    `Showing ${Math.min(start + 1, rows.length)}–${Math.min(end, rows.length)} of ${rows.length}`;

  document.getElementById('tb' + C).innerHTML = rows.slice(start, end).map(r => `
    <tr class="st-${r.Status}">
      <td class="sym">${r.Symbol || '—'}</td>
      <td>${formatDate(r.Expiry)}</td>
      <td>${r.Strike ?? '—'}</td>
      <td><span class="cp ${r.Side || ''}">${r.Side || '—'}</span></td>
      <td>${formatDate(r.Open_Date)}</td>
      <td>${r.Open_Qty ?? '—'}</td>
      <td>${formatMoney(r.Open_AvgPrice)}</td>
      <td class="${moneyClass(r.Open_Cost)}">${formatMoney(r.Open_Cost)}</td>
      <td>${formatDate(r.Close_Date)}</td>
      <td>${r.Close_Qty ?? '—'}</td>
      <td>${formatMoney(r.Close_AvgPrice)}</td>
      <td class="${moneyClass(r.Close_Proceeds)}">${formatMoney(r.Close_Proceeds)}</td>
      <td class="${moneyClass(r.PnL)}">${r.PnL != null ? formatMoney(r.PnL) : '—'}</td>
      <td class="${moneyClass(r.Cost_Basis)}">${r.Cost_Basis != null ? formatMoney(r.Cost_Basis) : '—'}</td>
      <td>${r._h != null
        ? `<span class="hp ${r._h < 24 ? 'day' : 'swg'}">${r._h < 24 ? formatHoldHours(r._h) : (r._h / 24).toFixed(1) + 'd'}</span>`
        : '—'}</td>
      <td><span class="sp ${r.Status}">${r.Status}</span></td>
    </tr>
  `).join('');

  renderPagination(tab, rows.length);
}

function renderPagination(tab, total) {
  const s = S[tab], C = cap(tab);
  const tp = Math.ceil(total / PAGE) || 1;
  let h = `<button class="page-btn" onclick="gp('${tab}',${s.pg - 1})" ${s.pg === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= tp; i++) {
    if (tp > 7 && i > 2 && i < tp - 1 && Math.abs(i - s.pg) > 1) {
      if (i === 3 || i === tp - 2) h += `<button class="page-btn" disabled>…</button>`;
      continue;
    }
    h += `<button class="page-btn ${i === s.pg ? 'active' : ''}" onclick="gp('${tab}',${i})">${i}</button>`;
  }
  h += `<button class="page-btn" onclick="gp('${tab}',${s.pg + 1})" ${s.pg === tp ? 'disabled' : ''}>›</button>`;
  document.getElementById('pb' + C).innerHTML = h;
}

function gp(tab, p) {
  const tp = Math.ceil((S[tab].filtered || []).length / PAGE) || 1;
  S[tab].pg = Math.max(1, Math.min(p, tp));
  renderTable(tab);
}

// ── TAB SWITCHING ────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ── FILTER BUTTONS ───────────────────────────────────────────
document.querySelectorAll('.filter-btn[data-tf]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.tf;
    document.querySelectorAll(`.filter-btn[data-tf="${t}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S[t].f = btn.dataset.f;
    applyFilter(t);
  });
});

['main', 'day', 'swing'].forEach(t => {
  document.getElementById('srch' + cap(t)).addEventListener('input', e => {
    S[t].q = e.target.value;
    applyFilter(t);
  });
});

// ── FORMAT HELPERS ───────────────────────────────────────────
function formatMoney(v) {
  if (v == null || (typeof v === 'number' && isNaN(v))) return '—';
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function formatDate(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

function formatHoldHours(h) {
  if (!h && h !== 0) return '—';
  if (h < 1) return Math.round(h * 60) + 'm';
  return h.toFixed(1) + 'h';
}

function moneyClass(v) {
  if (v == null) return 'mz';
  return v > 0 ? 'mp' : v < 0 ? 'mn' : 'mz';
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── THEME TOGGLE ─────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const savedTheme  = localStorage.getItem('theme');
if (savedTheme === 'light') {
  document.body.classList.add('light');
  themeToggle.textContent = '🌙';
}
themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  themeToggle.textContent = isLight ? '🌙' : '☀';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  // Re-render charts so they pick up new CSS variable colors
  if (allRows.length) {
    renderMainCharts(S.main.filtered.length ? S.main.filtered : allRows);
    renderDayCharts(S.day.filtered.length   ? S.day.filtered   : dayRows);
    renderSwingCharts(S.swing.filtered.length ? S.swing.filtered : swingRows);
  }
});

// ── DATE FILTER (main tab only) ───────────────────────────────
function onDateChange() {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  S.main.dateFrom = from ? new Date(from + 'T00:00:00') : null;
  S.main.dateTo   = to   ? new Date(to   + 'T23:59:59') : null;
  // deactivate presets when typing manually
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  applyFilter('main');
}

function applyPreset(preset) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = null, to = null;

  if (preset === 'week') {
    from = new Date(today); from.setDate(today.getDate() - today.getDay());
    to   = new Date(from);  to.setDate(from.getDate() + 6);
  } else if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (preset === 'lastmonth') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === 'ytd') {
    from = new Date(now.getFullYear(), 0, 1);
    to   = today;
  }

  S.main.dateFrom = from;
  S.main.dateTo   = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59) : null;
  document.getElementById('dateFrom').value = from ? from.toISOString().slice(0,10) : '';
  document.getElementById('dateTo').value   = to   ? to.toISOString().slice(0,10)   : '';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  applyFilter('main');
}

function clearDate() {
  S.main.dateFrom = S.main.dateTo = null;
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value   = '';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === 'all'));
  applyFilter('main');
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});