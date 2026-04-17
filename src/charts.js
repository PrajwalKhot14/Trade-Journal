// ============================================================
//  charts.js — Chart.js wrappers for all dashboard charts
// ============================================================

const CH = {}; // active Chart instances keyed by id

// ── DESTROY ──────────────────────────────────────────────────
function destroyCharts(...ids) {
  ids.forEach(id => {
    if (CH[id]) { CH[id].destroy(); delete CH[id]; }
  });
}

// ── RENDER PER TAB ───────────────────────────────────────────
function renderMainCharts(allRows) {
  destroyCharts('pM', 'wM', 'sM');
  CH.pM = barChart('cPnlMain', pnlBySymbol(allRows.filter(r => r.Status !== 'Open')), true, '#3b82f6');
  CH.wM = dailyPnlChart('cWrMain', allRows);
}

function renderDayCharts(dayRows) {
  destroyCharts('pD', 'wD');
  CH.pD = barChart('cPnlDay', pnlBySymbol(dayRows.filter(r => r.Status !== 'Open')), true,  '#ff6b35');
  CH.wD = barChart('cWrDay',  winRateBySymbol(dayRows),                               false, '#ff6b35', 100);
}

function renderSwingCharts(swingRows) {
  destroyCharts('pS', 'hS');
  CH.pS = barChart('cPnlSwing', pnlBySymbol(swingRows.filter(r => r.Status !== 'Open')), true, '#c084fc');

  // Avg hold time by symbol (days)
  const holdSum = {}, holdCount = {};
  swingRows.filter(r => r._h !== null).forEach(r => {
    holdSum[r.Symbol]   = (holdSum[r.Symbol]   || 0) + r._h / 24;
    holdCount[r.Symbol] = (holdCount[r.Symbol] || 0) + 1;
  });
  const syms = Object.keys(holdSum).sort();
  CH.hS = new Chart(document.getElementById('cHoldSwing'), {
    type: 'bar',
    data: {
      labels: syms,
      datasets: [{
        data: syms.map(s => (holdSum[s] / holdCount[s]).toFixed(1)),
        backgroundColor: 'rgba(192,132,252,0.5)',
        borderColor: '#c084fc',
        borderWidth: 1,
      }],
    },
    options: chartOptions('d', false, null),
  });
}

// ── DATA AGGREGATORS ─────────────────────────────────────────
function pnlBySymbol(rows) {
  const m = {};
  rows.forEach(r => { m[r.Symbol] = (m[r.Symbol] || 0) + (r.PnL || 0); });
  const syms = Object.keys(m).sort((a, b) => m[b] - m[a]);
  return { labels: syms, values: syms.map(k => m[k]) };
}

function dailyPnlChart(id, rows) {
  // Group P&L by close date, sort chronologically, compute cumulative
  const dayMap = {};
  rows.forEach(r => {
    if (!r.Close_Date || r.PnL == null) return;
    const d   = r.Close_Date;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dayMap[key] = (dayMap[key] || 0) + r.PnL;
  });

  const sorted = Object.keys(dayMap).sort();
  const labels = sorted.map(k => {
    const [y,m,d] = k.split('-');
    return new Date(+y, +m-1, +d).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  });

  // Cumulative sum
  let running = 0;
  const values = sorted.map(k => { running += dayMap[k]; return +running.toFixed(2); });

  const isProfit = running >= 0;
  const lineColor = isProfit ? '#22c55e' : '#ef4444';
  const grid  = cssVar('--grid-line');
  const tick  = cssVar('--tick-color');
  const bg2   = cssVar('--bg2');
  const bord  = cssVar('--border');
  const text2 = cssVar('--text2');
  const text  = cssVar('--text');

  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: lineColor,
        tension: 0.3,
        fill: true,
        backgroundColor: isProfit
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(239,68,68,0.08)',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${formatMoney(ctx.parsed.y)}` },
          backgroundColor: bg2,
          borderColor: bord,
          borderWidth: 1,
          titleColor: text2,
          bodyColor: text,
          titleFont: { family: 'JetBrains Mono' },
          bodyFont:  { family: 'JetBrains Mono' },
          mode: 'index',
          intersect: false,
        },
      },
      scales: {
        x: {
          ticks: { color: tick, font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45, maxTicksLimit: 12 },
          grid:  { color: grid },
        },
        y: {
          ticks: { color: tick, font: { family: 'JetBrains Mono', size: 10 }, callback: v => formatMoney(v) },
          grid:  { color: grid },
        },
      },
    },
  });
}

function winRateBySymbol(rows) {
  const wins = {}, total = {};
  rows.filter(r => r.Status === 'Closed').forEach(r => {
    total[r.Symbol] = (total[r.Symbol] || 0) + 1;
    if ((r.PnL || 0) > 0) wins[r.Symbol] = (wins[r.Symbol] || 0) + 1;
  });
  const syms = Object.keys(total);
  return { labels: syms, values: syms.map(k => (wins[k] || 0) / total[k] * 100) };
}

// ── CHART FACTORIES ──────────────────────────────────────────
function barChart(id, data, isMoney, accentColor, maxY = null) {
  return new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        backgroundColor: data.values.map(v =>
          isMoney ? (v >= 0 ? 'rgba(0,230,118,0.65)' : 'rgba(255,61,90,0.65)') : accentColor + '99'
        ),
        borderColor: data.values.map(v =>
          isMoney ? (v >= 0 ? '#00e676' : '#ff3d5a') : accentColor
        ),
        borderWidth: 1,
      }],
    },
    options: chartOptions(isMoney ? '$' : '%', isMoney, maxY),
  });
}

function donutChart(id, labels, data, backgroundColors, borderColors) {
  return new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: backgroundColors, borderColor: borderColors, borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          labels: { color: cssVar('--text2'), font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 12 },
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
      },
    },
  });
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartOptions(suffix, isMoney, maxY) {
  const grid   = cssVar('--grid-line');
  const tick   = cssVar('--tick-color');
  const bg2    = cssVar('--bg2');
  const border = cssVar('--border');
  const text2  = cssVar('--text2');
  const text   = cssVar('--text');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => isMoney
            ? ` ${formatMoney(ctx.parsed.y)}`
            : ` ${parseFloat(ctx.parsed.y).toFixed(1)}${suffix}`,
        },
        backgroundColor: bg2,
        borderColor:      border,
        borderWidth:      1,
        titleColor:       text2,
        bodyColor:        text,
        titleFont: { family: 'JetBrains Mono' },
        bodyFont:  { family: 'JetBrains Mono' },
      },
    },
    scales: {
      x: {
        ticks: { color: tick, font: { family: 'JetBrains Mono', size: 10 } },
        grid:  { color: grid },
      },
      y: {
        ticks: {
          color: tick,
          font:  { family: 'JetBrains Mono', size: 10 },
          callback: v => isMoney ? formatMoney(v) : v + suffix,
        },
        grid: { color: grid },
        ...(maxY ? { max: maxY } : {}),
      },
    },
  };
}