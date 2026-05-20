const MODEL_NAME_MIGRATIONS = {
  'Flash': 'Fast',
  '2.5 Flash': 'Fast',
  '2.5 Pro': 'Thinking',
};
const MODEL_DISPLAY_ORDER = ['Fast', 'Thinking', 'Pro'];
const MODEL_COLORS = [
  '#1a73e8',
  '#34a853',
  '#fbbc04',
  '#a142f4',
  '#f97316',
  '#00acc1',
  '#d93025',
  '#5f6368',
];
const RANGE_OPTIONS = {
  '1d': {
    days: 1,
    summaryLabel: 'Today',
    title: 'Today by Model',
    subtitle: 'Hourly buckets from 00:00 to 00:00 in your local time.',
    ariaLabel: '1 day model usage graph',
  },
  '7d': {
    days: 7,
    summaryLabel: 'Last 7 days',
    title: '7-Day Usage by Model',
    subtitle: 'One line per model across the last 7 days.',
    ariaLabel: '7 day model usage line graph',
  },
  '1m': {
    days: 30,
    summaryLabel: 'Last 30 days',
    title: '30-Day Usage by Model',
    subtitle: 'One line per model across the last 30 days.',
    ariaLabel: '30 day model usage line graph',
  },
  all: {
    days: null,
    summaryLabel: 'All tracked days',
    title: 'All-Time Usage by Model',
    subtitle: 'One line per model from the first tracked day through today.',
    ariaLabel: 'all time model usage line graph',
  },
};

let latestStats = null;
let latestRawStats = null;
let currentRange = '7d';

function normalizeModelData(data) {
  if (data === null || data === undefined) return { count: 0, firstUsage: null };
  if (typeof data === 'number') return { count: data, firstUsage: null };
  if (typeof data === 'object') {
    return {
      count: typeof data.count === 'number' ? data.count : 0,
      firstUsage: data.firstUsage || null,
    };
  }
  return { count: 0, firstUsage: null };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function getCanonicalModelName(model) {
  return MODEL_NAME_MIGRATIONS[model] || model;
}

function sortModels(models) {
  return [...models].sort((modelA, modelB) => {
    const indexA = MODEL_DISPLAY_ORDER.indexOf(modelA);
    const indexB = MODEL_DISPLAY_ORDER.indexOf(modelB);

    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA)
        - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    }

    return modelA.localeCompare(modelB);
  });
}

function getLocalDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastDateKeys(days) {
  const keys = [];
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const item = new Date(date);
    item.setDate(date.getDate() - offset);
    keys.push(getLocalDateKey(item.getTime()));
  }

  return keys;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getDateRangeKeys(startKey, endKey) {
  const keys = [];
  const current = parseDateKey(startKey);
  const end = parseDateKey(endKey);

  while (current <= end) {
    keys.push(getLocalDateKey(current.getTime()));
    current.setDate(current.getDate() + 1);
  }

  return keys;
}

function getDayHourKeys() {
  const keys = [];
  for (let hour = 0; hour <= 24; hour += 1) {
    keys.push(String(hour).padStart(2, '0'));
  }
  return keys;
}

function getDateKeysForRange(history, rangeKey) {
  const range = RANGE_OPTIONS[rangeKey] || RANGE_OPTIONS['7d'];

  if (range.days) {
    return getLastDateKeys(range.days);
  }

  const todayKey = getLocalDateKey();
  const historyKeys = Object.keys(history || {})
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort();
  const firstKey = historyKeys[0] || todayKey;

  return getDateRangeKeys(firstKey, todayKey);
}

function formatDateLabel(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function formatChartLabel(key, data) {
  if (data.rangeKey === '1d') {
    return `${key}:00`;
  }

  return formatDateLabel(key);
}

function canonicalizeHistory(history) {
  const canonical = {};

  for (const [dateKey, dateData] of Object.entries(history || {})) {
    if (!dateData || typeof dateData !== 'object') continue;

    canonical[dateKey] = {};
    for (const [model, value] of Object.entries(dateData)) {
      const canonicalModel = getCanonicalModelName(model);
      const count = typeof value === 'number' ? value : 0;
      canonical[dateKey][canonicalModel] = (canonical[dateKey][canonicalModel] || 0) + count;
    }
  }

  return canonical;
}

function canonicalizeHourlyHistory(hourlyHistory) {
  const canonical = {};

  for (const [dateKey, dateData] of Object.entries(hourlyHistory || {})) {
    if (!dateData || typeof dateData !== 'object') continue;

    canonical[dateKey] = {};
    for (const [hourKey, hourData] of Object.entries(dateData)) {
      if (!hourData || typeof hourData !== 'object') continue;

      const normalizedHour = String(parseInt(hourKey, 10)).padStart(2, '0');
      if (!/^\d{2}$/.test(normalizedHour)) continue;

      canonical[dateKey][normalizedHour] = {};
      for (const [model, value] of Object.entries(hourData)) {
        const canonicalModel = getCanonicalModelName(model);
        const count = typeof value === 'number' ? value : 0;
        canonical[dateKey][normalizedHour][canonicalModel] = (
          canonical[dateKey][normalizedHour][canonicalModel] || 0
        ) + count;
      }
    }
  }

  return canonical;
}

function canonicalizeNumberMap(data) {
  const canonical = {};

  for (const [model, value] of Object.entries(data || {})) {
    const canonicalModel = getCanonicalModelName(model);
    const count = typeof value === 'number' ? value : 0;
    canonical[canonicalModel] = (canonical[canonicalModel] || 0) + count;
  }

  return canonical;
}

function canonicalizeCounts(counts) {
  const canonical = {};

  for (const [model, value] of Object.entries(counts || {})) {
    const canonicalModel = getCanonicalModelName(model);
    const existing = normalizeModelData(canonical[canonicalModel]);
    const current = normalizeModelData(value);
    canonical[canonicalModel] = {
      count: existing.count + current.count,
      firstUsage:
        existing.firstUsage && current.firstUsage
          ? Math.min(existing.firstUsage, current.firstUsage)
          : existing.firstUsage || current.firstUsage,
    };
  }

  return canonical;
}

function buildStatsData(result, rangeKey = currentRange) {
  const history = canonicalizeHistory(result.modelUsageHistory || {});
  const hourlyHistory = canonicalizeHourlyHistory(result.modelUsageHourlyHistory || {});
  const totals = canonicalizeNumberMap(result.modelTotals || {});
  const counts = canonicalizeCounts(result.modelCounts || {});
  const dateKeys = getDateKeysForRange(history, rangeKey);
  const chartKeys = rangeKey === '1d' ? getDayHourKeys() : dateKeys;
  const sevenDayKeys = getLastDateKeys(7);
  const range = RANGE_OPTIONS[rangeKey] || RANGE_OPTIONS['7d'];
  const modelNames = new Set();

  for (const model of Object.keys(totals)) modelNames.add(model);
  for (const model of Object.keys(counts)) modelNames.add(model);
  for (const dateData of Object.values(history)) {
    for (const model of Object.keys(dateData)) modelNames.add(model);
  }
  for (const dateData of Object.values(hourlyHistory)) {
    for (const hourData of Object.values(dateData || {})) {
      for (const model of Object.keys(hourData || {})) modelNames.add(model);
    }
  }

  const models = sortModels(modelNames);
  const sevenDayByModel = {};
  const rangeByModel = {};
  const todayKey = getLocalDateKey();
  const chartValues = {};

  for (const model of models) {
    sevenDayByModel[model] = 0;
    rangeByModel[model] = 0;
    chartValues[model] = {};
  }

  for (const dateKey of sevenDayKeys) {
    const dateData = history[dateKey] || {};
    for (const model of models) {
      sevenDayByModel[model] += dateData[model] || 0;
    }
  }

  for (const dateKey of dateKeys) {
    const dateData = history[dateKey] || {};
    for (const model of models) {
      rangeByModel[model] += dateData[model] || 0;
    }
  }

  if (rangeKey === '1d') {
    const todayHours = hourlyHistory[todayKey] || {};
    for (const hourKey of chartKeys) {
      for (const model of models) {
        chartValues[model][hourKey] = hourKey === '24'
          ? 0
          : ((todayHours[hourKey] || {})[model] || 0);
      }
    }
  } else {
    for (const dateKey of chartKeys) {
      const dateData = history[dateKey] || {};
      for (const model of models) {
        chartValues[model][dateKey] = dateData[model] || 0;
      }
    }
  }

  const effectiveTotals = {};
  for (const model of models) {
    const historyTotal = Object.values(history).reduce((sum, dateData) => sum + (dateData[model] || 0), 0);
    const currentCount = normalizeModelData(counts[model]).count;
    effectiveTotals[model] = Math.max(totals[model] || 0, historyTotal, currentCount);
  }

  return {
    dateKeys,
    chartKeys,
    chartValues,
    range,
    rangeByModel,
    rangeKey,
    history,
    models,
    sevenDayByModel,
    todayKey,
    effectiveTotals,
  };
}

function getModelColor(model, index) {
  return MODEL_COLORS[index % MODEL_COLORS.length];
}

function renderSummary(data) {
  const rangeTotal = Object.values(data.rangeByModel).reduce((sum, count) => sum + count, 0);
  const allTimeTotal = Object.values(data.effectiveTotals).reduce((sum, count) => sum + count, 0);
  const topEntry = data.models
    .map((model) => [model, data.effectiveTotals[model] || 0])
    .sort((a, b) => b[1] - a[1])[0];

  document.getElementById('summary-range-label').textContent = data.range.summaryLabel;
  document.getElementById('summary-range-total').textContent = rangeTotal;
  document.getElementById('summary-all-time').textContent = allTimeTotal;
  document.getElementById('summary-top-model').textContent = topEntry && topEntry[1] > 0 ? topEntry[0] : '-';
  document.getElementById('summary-top-model-count').textContent = topEntry && topEntry[1] > 0
    ? `${topEntry[1]} tracked sends`
    : '';
}

function renderLegend(data) {
  const legend = document.getElementById('chart-legend');

  if (data.models.length === 0) {
    legend.innerHTML = '';
    return;
  }

  legend.innerHTML = data.models.map((model, index) => `
    <span class="legend-item">
      <span class="legend-swatch" style="background: ${getModelColor(model, index)}"></span>
      <span>${escapeHtml(model)}</span>
    </span>
  `).join('');
}

function renderRangeControls(data) {
  document.getElementById('chart-title').textContent = data.range.title;
  document.getElementById('chart-subtitle').textContent = data.range.subtitle;
  document.getElementById('usage-chart').setAttribute('aria-label', data.range.ariaLabel);

  document.querySelectorAll('.range-btn').forEach((button) => {
    const isActive = button.dataset.range === data.rangeKey;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function drawLineGraph(data) {
  const canvas = document.getElementById('usage-chart');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 22, right: 22, bottom: 42, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const chartKeys = data.chartKeys || data.dateKeys;
  const getX = (index) => chartKeys.length === 1
    ? padding.left + (plotWidth / 2)
    : padding.left + (plotWidth * index / (chartKeys.length - 1));
  const allValues = data.models.flatMap((model) => (
    chartKeys.map((key) => (data.chartValues[model] || {})[key] || 0)
  ));
  const hasUsage = allValues.some((value) => value > 0);
  const yMax = Math.max(1, Math.ceil(Math.max(1, ...allValues) * 1.15));
  const gridLines = 4;

  ctx.font = '12px Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= gridLines; i += 1) {
    const value = Math.round((yMax / gridLines) * i);
    const y = padding.top + plotHeight - (plotHeight * i / gridLines);

    ctx.strokeStyle = '#e8eaed';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#5f6368';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), padding.left - 8, y);
  }

  chartKeys.forEach((key, index) => {
    const x = getX(index);
    const shouldShowLabel = chartKeys.length <= 12
      || index === 0
      || index === chartKeys.length - 1
      || index % Math.ceil(chartKeys.length / 8) === 0;

    if (!shouldShowLabel) return;

    ctx.fillStyle = '#5f6368';
    ctx.textAlign = 'center';
    ctx.fillText(formatChartLabel(key, data), x, height - 18);
  });

  if (data.models.length === 0 || !hasUsage) {
    ctx.fillStyle = '#5f6368';
    ctx.textAlign = 'center';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText('No usage history yet. Send a message in Gemini to start the graph.', width / 2, height / 2);
    return;
  }

  data.models.forEach((model, modelIndex) => {
    const color = getModelColor(model, modelIndex);
    const points = chartKeys.map((key, index) => {
      const value = (data.chartValues[model] || {})[key] || 0;
      return {
        value,
        x: getX(index),
        y: padding.top + plotHeight - (plotHeight * value / yMax),
      };
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    points.forEach((point) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (point.value > 0) {
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.font = '11px Segoe UI, sans-serif';
        ctx.fillText(String(point.value), point.x, Math.max(10, point.y - 12));
      }
    });
  });
}

function renderTotalsTable(data) {
  const wrap = document.getElementById('totals-table-wrap');

  if (data.models.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No statistics recorded yet.</div>';
    return;
  }

  const rows = data.models
    .map((model) => ({
      model,
      allTime: data.effectiveTotals[model] || 0,
      sevenDay: data.sevenDayByModel[model] || 0,
      today: (data.history[data.todayKey] || {})[model] || 0,
    }))
    .sort((a, b) => b.allTime - a.allTime || a.model.localeCompare(b.model));

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th class="numeric">Today</th>
          <th class="numeric">7 Days</th>
          <th class="numeric">All Time</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>
              <span class="model-cell">
                <span class="legend-swatch" style="background: ${getModelColor(row.model, data.models.indexOf(row.model))}"></span>
                <span>${escapeHtml(row.model)}</span>
              </span>
            </td>
            <td class="numeric">${row.today}</td>
            <td class="numeric">${row.sevenDay}</td>
            <td class="numeric">${row.allTime}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderStats(result) {
  latestRawStats = result;
  latestStats = buildStatsData(result, currentRange);
  renderSummary(latestStats);
  renderRangeControls(latestStats);
  renderLegend(latestStats);
  drawLineGraph(latestStats);
  renderTotalsTable(latestStats);
}

function setGraphRange(rangeKey) {
  if (!RANGE_OPTIONS[rangeKey] || rangeKey === currentRange) return;

  currentRange = rangeKey;
  if (latestRawStats) {
    renderStats(latestRawStats);
  }
}

function loadStats() {
  chrome.storage.sync.get(['modelCounts', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory'], renderStats);
}

document.addEventListener('DOMContentLoaded', () => {
  loadStats();

  document.querySelectorAll('.range-btn').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.range === currentRange));
    button.addEventListener('click', () => {
      setGraphRange(button.dataset.range);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.modelCounts || changes.modelTotals || changes.modelUsageHistory || changes.modelUsageHourlyHistory) {
      loadStats();
    }
  });

  window.addEventListener('resize', () => {
    if (latestStats) drawLineGraph(latestStats);
  });
});
