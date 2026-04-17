// ============================================================
//  calendar.js — P&L calendar rendering and interaction
// ============================================================

let calYear, calMonth;
let calDayMap = {};

const CAL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const CAL_DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth <  0) { calMonth = 11; calYear--; }
  renderCal();
}

function renderCal() {
  const now         = new Date();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  document.getElementById('calMonthLabel').textContent = `${CAL_MONTHS[calMonth]} ${calYear}`;

  // Monthly summary
  let mPnl = 0, mWins = 0, mLosses = 0, mTrades = 0;
  Object.entries(calDayMap).forEach(([key, v]) => {
    const [y, m] = key.split('-').map(Number);
    if (y === calYear && m === calMonth) {
      mPnl    += v.pnl;
      mTrades += v.trades.length;
      if (v.pnl > 0) mWins++; else mLosses++;
    }
  });
  document.getElementById('calSummary').innerHTML = `
    <div class="cal-sum-item">Month P&L <span class="${mPnl >= 0 ? 'pos' : 'neg'}">${formatMoney(mPnl)}</span></div>
    <div class="cal-sum-item">Green Days <span class="pos">${mWins}</span></div>
    <div class="cal-sum-item">Red Days <span class="neg">${mLosses}</span></div>
    <div class="cal-sum-item">Trades <span class="blue">${mTrades}</span></div>
  `;

  // Day-of-week headers
  let html = CAL_DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Empty cells
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell cal-cell-empty"></div>`;

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${calYear}-${calMonth}-${d}`;
    const data    = calDayMap[key];
    const isToday = d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();

    let cellClass = 'cal-cell';
    let content   = `<div class="cal-cell-day${isToday ? ' cal-today' : ''}">${d}</div>`;

    if (data) {
      const isGreen = data.pnl > 0;
      cellClass += isGreen ? ' cal-cell-green' : ' cal-cell-red';

      const pnlStr = (data.pnl >= 0 ? '+' : '') +
        (Math.abs(data.pnl) >= 1000
          ? (data.pnl >= 0 ? '$' : '-$') + Math.abs(data.pnl / 1000).toFixed(1) + 'k'
          : formatMoney(data.pnl));

      content += `
        <div class="cal-cell-pnl">${pnlStr}</div>
        <div class="cal-cell-count">${data.trades.length} Trade${data.trades.length !== 1 ? 's' : ''}</div>
      `;
    }

    html += `<div class="${cellClass}" ${data ? `onclick="calDayClick('${key}')"` : ''}>${content}</div>`;
  }

  document.getElementById('calGrid').innerHTML = html;
  renderDetailDefault();
}

function renderDetailDefault() {
  // Show monthly summary in detail panel by default
  let mPnl = 0, wins = 0, losses = 0, trades = 0;
  Object.entries(calDayMap).forEach(([key, v]) => {
    const [y, m] = key.split('-').map(Number);
    if (y === calYear && m === calMonth) {
      mPnl += v.pnl; trades += v.trades.length;
      if (v.pnl > 0) wins++; else losses++;
    }
  });
  document.getElementById('calDetail').innerHTML = `
    <div class="cal-detail-month">${CAL_MONTHS[calMonth]} ${calYear}</div>
    <div class="cal-detail-total ${mPnl >= 0 ? 'pos' : 'neg'}">${mPnl >= 0 ? '+' : ''}${formatMoney(mPnl)}</div>
    <div class="cal-detail-stats">
      <div class="cal-stat"><div class="cal-stat-val pos">${wins}</div><div class="cal-stat-lbl">Green Days</div></div>
      <div class="cal-stat"><div class="cal-stat-val neg">${losses}</div><div class="cal-stat-lbl">Red Days</div></div>
      <div class="cal-stat"><div class="cal-stat-val blue">${trades}</div><div class="cal-stat-lbl">Trades</div></div>
    </div>
    <div class="cal-hint" style="margin-top:16px">Click a day to see trades</div>
  `;
}

function calDayClick(key) {
  // Highlight selected
  document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('cal-cell-selected'));
  event.currentTarget.classList.add('cal-cell-selected');

  const data = calDayMap[key];
  if (!data) return;

  const [y, m, d] = key.split('-').map(Number);
  const dateStr   = new Date(y, m, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const tradesHtml = data.trades.map(r => `
    <div class="cal-trade-row">
      <div>
        <div class="cal-trade-sym">${r.Symbol}</div>
        <div class="cal-trade-meta">${r.Strike} ${r.Side || ''} · ${r.Close_Qty ?? r.Open_Qty} contract(s)</div>
      </div>
      <div class="cal-trade-pnl ${(r.PnL || 0) > 0 ? 'pos' : (r.PnL || 0) < 0 ? 'neg' : ''}">${formatMoney(r.PnL)}</div>
    </div>
  `).join('');

  document.getElementById('calDetail').innerHTML = `
    <div class="cal-detail-month">${dateStr}</div>
    <div class="cal-detail-total ${data.pnl >= 0 ? 'pos' : 'neg'}">${data.pnl >= 0 ? '+' : ''}${formatMoney(data.pnl)}</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px">${data.trades.length} trade${data.trades.length !== 1 ? 's' : ''}</div>
    ${tradesHtml}
  `;
}