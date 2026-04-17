// ============================================================
//  calendar.js — P&L calendar rendering and interaction
// ============================================================

let calYear, calMonth;
let calDayMap = {};
let calSelected = null;

const CAL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const CAL_DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── INIT ─────────────────────────────────────────────────────
// Defaults to the most recent month containing a closed trade.
function calInit(allRows) {
  const dates = allRows.filter(r => r.Close_Date).map(r => r.Close_Date);
  if (dates.length) {
    const latest = new Date(Math.max(...dates));
    calYear  = latest.getFullYear();
    calMonth = latest.getMonth();
  } else {
    const now = new Date();
    calYear  = now.getFullYear();
    calMonth = now.getMonth();
  }
  buildDayMap(allRows);
  renderCal();
}

// ── BUILD DAY MAP ────────────────────────────────────────────
// Groups all closed trade P&L by close date.
function buildDayMap(allRows) {
  calDayMap = {};
  allRows.forEach(r => {
    if (!r.Close_Date || r.PnL == null) return;
    const d   = r.Close_Date;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!calDayMap[key]) calDayMap[key] = { pnl: 0, trades: [] };
    calDayMap[key].pnl += r.PnL;
    calDayMap[key].trades.push(r);
  });
}

// ── NAVIGATION ───────────────────────────────────────────────
function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth <  0) { calMonth = 11; calYear--; }
  calSelected = null;
  renderCal();
  document.getElementById('calDetail').innerHTML =
    '<div class="cal-hint">← Click a day with trades to see details</div>';
}

// ── RENDER GRID ──────────────────────────────────────────────
function renderCal() {
  const now = new Date();
  document.getElementById('calMonthLabel').textContent = `${CAL_MONTHS[calMonth]} ${calYear}`;

  // Monthly summary bar
  let mPnl = 0, mWins = 0, mLosses = 0, mTrades = 0;
  Object.entries(calDayMap).forEach(([key, v]) => {
    const [y, m] = key.split('-').map(Number);
    if (y === calYear && m === calMonth) {
      mPnl += v.pnl;
      mTrades += v.trades.length;
      if (v.pnl > 0) mWins++; else mLosses++;
    }
  });
  document.getElementById('calSummary').innerHTML = `
    <div class="cal-sum-item">Month P&L<span class="${mPnl >= 0 ? 'pos' : 'neg'}">${formatMoney(mPnl)}</span></div>
    <div class="cal-sum-item">Trading Days<span class="blue">${mWins + mLosses}</span></div>
    <div class="cal-sum-item">Green Days<span class="pos">${mWins}</span></div>
    <div class="cal-sum-item">Red Days<span class="neg">${mLosses}</span></div>
    <div class="cal-sum-item">Trades<span class="blue">${mTrades}</span></div>
  `;

  // Day grid
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let html = CAL_DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${calYear}-${calMonth}-${d}`;
    const data    = calDayMap[key];
    const isToday = d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
    const isSel   = calSelected === key;

    let inner = `<div class="cal-dn">${d}</div>`;
    if (data) {
      const cls  = data.pnl >= 0 ? 'pos' : 'neg';
      const disp = Math.abs(data.pnl) >= 1000
        ? (data.pnl >= 0 ? '+$' : '-$') + Math.abs(data.pnl / 1000).toFixed(1) + 'k'
        : (data.pnl >= 0 ? '+$' : '-$') + Math.abs(data.pnl).toFixed(0);
      inner += `<div class="cal-pnl ${cls}">${disp}</div><div class="cal-dot ${cls}"></div>`;
    }

    html += `
      <div
        class="cal-day${data ? ' has-trade' : ''}${isToday ? ' today' : ''}${isSel ? ' selected' : ''}"
        ${data ? `onclick="calClick('${key}')"` : ''}
        title="${data ? formatMoney(data.pnl) + ' · ' + data.trades.length + ' trade(s)' : ''}"
      >${inner}</div>`;
  }

  document.getElementById('calGrid').innerHTML = html;
}

// ── DAY CLICK ────────────────────────────────────────────────
function calClick(key) {
  calSelected = key;
  renderCal();

  const data = calDayMap[key];
  if (!data) {
    document.getElementById('calDetail').innerHTML = '<div class="cal-hint">No trades on this day</div>';
    return;
  }

  const [y, m, d] = key.split('-').map(Number);
  const dateStr   = new Date(y, m, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const tradesHtml = data.trades.map(r => `
    <div class="cal-trade-row">
      <div>
        <div class="cal-trade-sym">${r.Symbol}</div>
        <div class="cal-trade-meta">${r.Strike} ${r.Side || ''} · ${r.Close_Qty ?? r.Open_Qty} contract(s) · ${r.Status}</div>
      </div>
      <div class="cal-trade-pnl ${(r.PnL || 0) >= 0 ? 'pos' : 'neg'}">${formatMoney(r.PnL)}</div>
    </div>
  `).join('');

  document.getElementById('calDetail').innerHTML = `
    <div class="cal-detail-date">${dateStr}</div>
    <div class="cal-detail-total ${data.pnl >= 0 ? 'pos' : 'neg'}">${data.pnl >= 0 ? '+' : ''}${formatMoney(data.pnl)}</div>
    ${tradesHtml}
  `;
}
