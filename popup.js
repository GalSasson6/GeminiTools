const DEFAULT_LIMIT = 100;
const DEFAULT_RESET_HOURS = 24;
const DEFAULT_AUTO_DIR_ENABLED = false;
const DEFAULT_NEON_MATH_ENABLED = false;
const MODEL_NAME_MIGRATIONS = {
    'Flash': 'Fast',
    '2.5 Flash': 'Fast',
    '2.5 Pro': 'Thinking',
};
const MODEL_DISPLAY_ORDER = ['Fast', 'Thinking', 'Pro'];

// ─── Data Normalization ──────────────────────────────────────────────────────
function normalizeModelData(data) {
    if (data === null || data === undefined) return { count: 0, firstUsage: null };
    if (typeof data === 'number') return { count: data, firstUsage: null };
    if (typeof data === 'object') return {
        count: typeof data.count === 'number' ? data.count : 0,
        firstUsage: data.firstUsage || null,
    };
    return { count: 0, firstUsage: null };
}

function pad(n) { return n < 10 ? '0' + n : n; }

function formatLocalDateTimeInput(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

let cachedCounts = {};
let cachedSettings = {};
let cachedAutoDirEnabled = DEFAULT_AUTO_DIR_ENABLED;
let cachedNeonMathEnabled = DEFAULT_NEON_MATH_ENABLED;
let calibrationFeedback = null;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function getModelDomId(model) {
    return encodeURIComponent(model).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getCanonicalModelName(model) {
    return MODEL_NAME_MIGRATIONS[model] || model;
}

function sortModelEntries(entries) {
    return entries.sort(([modelA], [modelB]) => {
        const indexA = MODEL_DISPLAY_ORDER.indexOf(modelA);
        const indexB = MODEL_DISPLAY_ORDER.indexOf(modelB);

        if (indexA !== -1 || indexB !== -1) {
            return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA)
                - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
        }

        return modelA.localeCompare(modelB);
    });
}

function mergeModelCountData(target, source) {
    const targetData = normalizeModelData(target);
    const sourceData = normalizeModelData(source);

    return {
        count: targetData.count + sourceData.count,
        firstUsage:
            targetData.firstUsage && sourceData.firstUsage
                ? Math.min(targetData.firstUsage, sourceData.firstUsage)
                : targetData.firstUsage || sourceData.firstUsage,
    };
}

function migrateLegacyModelNames(callback) {
    chrome.storage.sync.get(['modelCounts', 'modelSettings', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory'], (result) => {
        const counts = result.modelCounts || {};
        const settings = result.modelSettings || {};
        const totals = result.modelTotals || {};
        const history = result.modelUsageHistory || {};
        const hourlyHistory = result.modelUsageHourlyHistory || {};
        let changed = false;

        for (const [model, data] of sortModelEntries(Object.entries(counts))) {
            const canonical = getCanonicalModelName(model);
            if (canonical === model) continue;

            counts[canonical] = counts[canonical]
                ? mergeModelCountData(counts[canonical], data)
                : normalizeModelData(data);
            delete counts[model];
            changed = true;
        }

        for (const [model, data] of Object.entries(settings)) {
            const canonical = getCanonicalModelName(model);
            if (canonical === model) continue;

            settings[canonical] = { ...(data || {}), ...(settings[canonical] || {}) };
            delete settings[model];
            changed = true;
        }

        for (const [model, count] of Object.entries(totals)) {
            const canonical = getCanonicalModelName(model);
            if (canonical === model) continue;

            totals[canonical] = (totals[canonical] || 0) + (typeof count === 'number' ? count : 0);
            delete totals[model];
            changed = true;
        }

        for (const dateData of Object.values(history)) {
            if (!dateData || typeof dateData !== 'object') continue;

            for (const [model, count] of Object.entries(dateData)) {
                const canonical = getCanonicalModelName(model);
                if (canonical === model) continue;

                dateData[canonical] = (dateData[canonical] || 0) + (typeof count === 'number' ? count : 0);
                delete dateData[model];
                changed = true;
            }
        }

        for (const dateData of Object.values(hourlyHistory)) {
            if (!dateData || typeof dateData !== 'object') continue;

            for (const hourData of Object.values(dateData)) {
                if (!hourData || typeof hourData !== 'object') continue;

                for (const [model, count] of Object.entries(hourData)) {
                    const canonical = getCanonicalModelName(model);
                    if (canonical === model) continue;

                    hourData[canonical] = (hourData[canonical] || 0) + (typeof count === 'number' ? count : 0);
                    delete hourData[model];
                    changed = true;
                }
            }
        }

        if (changed) {
            chrome.storage.sync.set({
                modelCounts: counts,
                modelSettings: settings,
                modelTotals: totals,
                modelUsageHistory: history,
                modelUsageHourlyHistory: hourlyHistory,
            }, callback);
            return;
        }

        callback();
    });
}

// ─── Main entry point ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    migrateLegacyModelNames(updateStats);
    initializeAutoDirControl();
    initializeNeonMathControl();

    // Update live countdown timers every second without querying storage
    setInterval(() => updateTimersOnly(cachedCounts, cachedSettings), 1000);

    // Listen for live updates from other tabs or devices
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;

        if (changes.modelCounts || changes.modelSettings) {
            updateStats();
        }

        if (changes.autoDirEnabled) {
            syncAutoDirControl(changes.autoDirEnabled.newValue);
        }

        if (changes.neonMathEnabled) {
            syncNeonMathControl(changes.neonMathEnabled.newValue);
        }
    });

    document.getElementById('open-stats-btn').addEventListener('click', () => {
        const statsUrl = chrome.runtime.getURL('stats.html');
        if (chrome.windows?.create) {
            chrome.windows.create({
                url: statsUrl,
                type: 'popup',
                width: 900,
                height: 680,
            });
            return;
        }
        window.open(statsUrl, 'gemini-counter-stats', 'width=900,height=680');
    });

    // Reset All button
    document.getElementById('reset-all-btn').addEventListener('click', () => {
        showConfirm('Reset all usage data? Settings (limits, hours) will be kept.', () => {
            chrome.storage.sync.get(['modelCounts'], (result) => {
                const counts = result.modelCounts || {};
                for (const key in counts) {
                    counts[key] = { count: 0, firstUsage: null };
                }
                chrome.storage.sync.set({
                    modelCounts: counts,
                    modelTotals: {},
                    modelUsageHistory: {},
                    modelUsageHourlyHistory: {},
                }, updateStats);
            });
        });
    });

    // ── Event delegation on stats container ──────────────────────────────────
    const container = document.getElementById('stats-container');

    container.addEventListener('click', (e) => {
        // Toggle settings panel
        if (e.target.classList.contains('toggle-settings')) {
            const panel = document.getElementById(e.target.getAttribute('data-settings-id'));
            if (panel) panel.classList.toggle('active');
        }

        if (e.target.classList.contains('calibration-toggle')) {
            const panel = document.getElementById(e.target.getAttribute('data-calibration-id'));
            if (panel) panel.classList.toggle('active');
        }

        if (e.target.classList.contains('calibration-apply')) {
            applyCalibration(e.target.getAttribute('data-model'));
        }

        // Remove model
        if (e.target.classList.contains('delete-btn')) {
            const model = e.target.getAttribute('data-model');
            showConfirm(`Remove tracking for "${model}"?`, () => removeModel(model));
        }
    });

    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('setting-input')) {
            const model = e.target.getAttribute('data-model');
            const type = e.target.getAttribute('data-type');
            saveSetting(model, type, e.target.value);
        }
    });

    document.getElementById('auto-dir-toggle').addEventListener('change', (e) => {
        saveAutoDirSetting(e.target.checked);
    });

    document.getElementById('neon-math-toggle').addEventListener('change', (e) => {
        saveNeonMathSetting(e.target.checked);
    });
});

// ─── Render stats ────────────────────────────────────────────────────────────
function updateStats() {
    chrome.storage.sync.get(['modelCounts', 'modelSettings'], (result) => {
        const counts = result.modelCounts || {};
        const settings = result.modelSettings || {};

        // Cache the result for the interval timers
        cachedCounts = counts;
        cachedSettings = settings;

        const container = document.getElementById('stats-container');

        // Don't re-render while a settings input is focused (would kill cursor)
        if (container.querySelector('input:focus')) {
            updateTimersOnly(counts, settings);
            return;
        }

        if (Object.keys(counts).length === 0) {
            container.innerHTML = '<div class="section-label">Usage</div><div class="empty-state">No usage recorded yet.<br>Send a message in Gemini to start tracking.</div>';
            return;
        }

        let html = '<div class="section-label">Usage</div><div class="stack">';

        for (const [model, data] of sortModelEntries(Object.entries(counts))) {
            const modelData = normalizeModelData(data);
            const count = modelData.count;
            const firstUsage = modelData.firstUsage;

            const modelSetting = settings[model] || {};
            const limit = modelSetting.limit || DEFAULT_LIMIT;
            const resetHours = modelSetting.resetHours || DEFAULT_RESET_HOURS;

            let displayCount = count;
            let displayFirstUsage = firstUsage;
            let timeRemainingStr = 'Not started';

            if (firstUsage) {
                const timeLeft = (firstUsage + resetHours * 3600000) - Date.now();
                if (timeLeft > 0) {
                    const h = Math.floor(timeLeft / 3600000);
                    const m = Math.floor((timeLeft % 3600000) / 60000);
                    const s = Math.floor((timeLeft % 60000) / 1000);
                    timeRemainingStr = `Resets in: ${h}:${pad(m)}:${pad(s)}`;
                } else {
                    // Time has expired, conceptually reset for UI
                    displayCount = 0;
                    displayFirstUsage = null;
                    timeRemainingStr = 'Not started';
                }
            }

            // Fallback if conceptually it has counts but no first usage
            if (displayCount > 0 && !displayFirstUsage) {
                timeRemainingStr = `Resets in: ${resetHours}h (starting now)`;
            }

            const percent = limit > 0 ? Math.min((displayCount / limit) * 100, 100) : 0;
            const visualPercent = displayCount > 0 ? Math.max(percent, 3) : 0;
            const meterMax = Math.max(limit, 1);
            const meterValue = Math.min(displayCount, meterMax);
            let colorClass = '', meterClass = 'safe';
            if (percent >= 100) { colorClass = 'limit-reached'; meterClass = 'danger'; }
            else if (percent >= 80) { colorClass = 'limit-warning'; meterClass = 'warning'; }

            // Preserve settings panel open state across re-renders
            const modelDomId = getModelDomId(model);
            const settingsId = `settings-${modelDomId}`;
            const calibrationId = `calibration-${modelDomId}`;
            const safeModel = escapeHtml(model);
            const isActive = document.getElementById(settingsId)?.classList.contains('active') ? 'active' : '';
            const isCalibrationActive = document.getElementById(calibrationId)?.classList.contains('active') ? 'active' : '';
            const currentWindowEnd = firstUsage ? firstUsage + resetHours * 3600000 : null;
            const availableAgainValue = formatLocalDateTimeInput(currentWindowEnd);
            const calibrationCount = Math.max(displayCount || count || limit || 1, 1);
            const feedbackText = calibrationFeedback?.model === model ? calibrationFeedback.text : '';
            const feedbackClass = feedbackText ? 'active' : '';

            html += `
        <div class="model-card" id="card-${modelDomId}">
          <div class="model-header">
            <span class="model-name">${safeModel}</span>
            <span class="count-display ${colorClass}">${displayCount} / ${limit}</span>
          </div>
          <div class="progress-bar" role="meter" aria-valuemin="0" aria-valuemax="${meterMax}" aria-valuenow="${meterValue}" aria-label="Usage quota">
            <div class="progress-fill ${meterClass}" style="width:${visualPercent}%"></div>
          </div>
          <div class="meta-info">
            <span class="timer-text" data-model-id="${modelDomId}">${timeRemainingStr}</span>
            <button class="toggle-settings" data-settings-id="${settingsId}">Limits</button>
          </div>
          <div class="settings-panel ${isActive}" id="${settingsId}">
            <div class="setting-row">
              <label>Max Limit:</label>
              <input type="number" class="setting-input" data-type="limit" data-model="${safeModel}" value="${limit}">
            </div>
            <div class="setting-row">
              <label>Reset (Hours):</label>
              <input type="number" class="setting-input" data-type="resetHours" data-model="${safeModel}" value="${resetHours}">
            </div>
            <div class="settings-divider"></div>
            <button class="calibration-toggle" data-calibration-id="${calibrationId}">Recalibrate</button>
            <div class="calibration-panel ${isCalibrationActive}" id="${calibrationId}">
              <p class="calibration-note">Use this after Gemini blocks the model and shows when it will be available again.</p>
              <div class="setting-row">
                <label>Available again:</label>
                <input type="datetime-local" class="calibration-available-input" data-model="${safeModel}" value="${availableAgainValue}">
              </div>
              <div class="setting-row">
                <label>current uses:</label>
                <input type="number" min="1" step="1" class="calibration-count-input" data-model="${safeModel}" value="${calibrationCount}">
              </div>
              <p class="calibration-warning">Calibration can be off if usage happened before installing the extension or from another device, such as mobile.</p>
              <p class="calibration-message ${feedbackClass}" data-model-id="${modelDomId}">${escapeHtml(feedbackText)}</p>
              <div class="calibration-actions">
                <button class="calibration-apply" data-model="${safeModel}">Apply Calibration</button>
              </div>
            </div>
            <button class="delete-btn" data-model="${safeModel}">Remove Model</button>
          </div>
        </div>`;
        }

        html += '</div>';
        container.innerHTML = html;
    });
}

// Update only the timer spans without re-rendering the whole UI
function updateTimersOnly(counts, settings) {
    for (const [model, data] of Object.entries(counts)) {
        const timerEl = document.querySelector(`.timer-text[data-model-id="${getModelDomId(model)}"]`);
        if (!timerEl) continue;

        const modelData = normalizeModelData(data);
        const resetHours = (settings[model] || {}).resetHours || DEFAULT_RESET_HOURS;

        if (modelData.firstUsage) {
            const timeLeft = (modelData.firstUsage + resetHours * 3600000) - Date.now();
            if (timeLeft > 0) {
                const h = Math.floor(timeLeft / 3600000);
                const m = Math.floor((timeLeft % 3600000) / 60000);
                const s = Math.floor((timeLeft % 60000) / 1000);
                timerEl.textContent = `Resets in: ${h}:${pad(m)}:${pad(s)}`;
            } else {
                timerEl.textContent = 'Not started';
                // Note: we can't easily trigger a full UI re-render here without blinking focus,
                // but this case only happens if the timer elapses while the settings popup is open.
            }
        } else if (modelData.count > 0) {
            timerEl.textContent = `Resets in: ${resetHours}h (starting now)`;
        } else {
            timerEl.textContent = 'Not started';
        }
    }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
function initializeAutoDirControl() {
    chrome.storage.sync.get(['autoDirEnabled'], (result) => {
        syncAutoDirControl(
            result.autoDirEnabled === undefined
                ? DEFAULT_AUTO_DIR_ENABLED
                : result.autoDirEnabled
        );
    });
}

function syncAutoDirControl(enabled) {
    cachedAutoDirEnabled = enabled !== false;

    const toggle = document.getElementById('auto-dir-toggle');
    if (!toggle) return;

    toggle.checked = cachedAutoDirEnabled;
}

function saveAutoDirSetting(enabled) {
    cachedAutoDirEnabled = enabled !== false;
    syncAutoDirControl(cachedAutoDirEnabled);
    chrome.storage.sync.set({ autoDirEnabled: cachedAutoDirEnabled });
}

function initializeNeonMathControl() {
    chrome.storage.sync.get(['neonMathEnabled'], (result) => {
        syncNeonMathControl(
            result.neonMathEnabled === undefined
                ? DEFAULT_NEON_MATH_ENABLED
                : result.neonMathEnabled
        );
    });
}

function syncNeonMathControl(enabled) {
    cachedNeonMathEnabled = enabled !== false;

    const toggle = document.getElementById('neon-math-toggle');
    if (!toggle) return;

    toggle.checked = cachedNeonMathEnabled;
}

function saveNeonMathSetting(enabled) {
    cachedNeonMathEnabled = enabled !== false;
    syncNeonMathControl(cachedNeonMathEnabled);
    chrome.storage.sync.set({ neonMathEnabled: cachedNeonMathEnabled });
}

function removeModel(model) {
    chrome.storage.sync.get(['modelCounts', 'modelSettings', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory'], (result) => {
        const counts = result.modelCounts || {};
        const settings = result.modelSettings || {};
        const totals = result.modelTotals || {};
        const history = result.modelUsageHistory || {};
        const hourlyHistory = result.modelUsageHourlyHistory || {};
        delete counts[model];
        delete settings[model];
        delete totals[model];

        for (const dateData of Object.values(history)) {
            if (dateData && typeof dateData === 'object') {
                delete dateData[model];
            }
        }

        for (const dateData of Object.values(hourlyHistory)) {
            if (!dateData || typeof dateData !== 'object') continue;

            for (const hourData of Object.values(dateData)) {
                if (hourData && typeof hourData === 'object') {
                    delete hourData[model];
                }
            }
        }

        chrome.storage.sync.set({
            modelCounts: counts,
            modelSettings: settings,
            modelTotals: totals,
            modelUsageHistory: history,
            modelUsageHourlyHistory: hourlyHistory,
        }, updateStats);
    });
}

function saveSetting(model, key, value) {
    chrome.storage.sync.get(['modelSettings'], (result) => {
        const settings = result.modelSettings || {};
        if (!settings[model]) settings[model] = {};
        settings[model][key] = parseFloat(value);
        chrome.storage.sync.set({ modelSettings: settings });
    });
}

// ─── Inline confirm (no window.confirm — blocked in extensions) ───────────────
function applyCalibration(model) {
    const modelDomId = getModelDomId(model);
    const card = document.getElementById(`card-${modelDomId}`);
    if (!card) return;

    const availableInput = card.querySelector('.calibration-available-input');
    const countInput = card.querySelector('.calibration-count-input');
    const message = card.querySelector('.calibration-message');
    const availableAt = availableInput ? new Date(availableInput.value).getTime() : NaN;
    const reachedCount = countInput ? parseInt(countInput.value, 10) : NaN;

    showCalibrationMessage(message, '', false);

    if (!Number.isFinite(availableAt)) {
        showCalibrationMessage(message, 'Enter the time Gemini says this model is available again.', true);
        return;
    }

    if (!Number.isInteger(reachedCount) || reachedCount < 1) {
        showCalibrationMessage(message, 'Reached-after count must be at least 1.', true);
        return;
    }

    chrome.storage.sync.get(['modelCounts', 'modelSettings'], (result) => {
        const counts = result.modelCounts || {};
        const settings = result.modelSettings || {};
        const modelData = normalizeModelData(counts[model]);

        if (!modelData.firstUsage) {
            showCalibrationMessage(message, 'This model has no first counted use yet. Send one fresh message after reset, then calibrate at the next limit.', true);
            return;
        }

        const windowMs = availableAt - modelData.firstUsage;
        if (windowMs <= 0) {
            showCalibrationMessage(message, 'Available-again time must be after the first counted use.', true);
            return;
        }

        const resetHours = Math.max(Math.round((windowMs / 3600000) * 100) / 100, 0.01);
        if (!settings[model]) settings[model] = {};
        settings[model].limit = reachedCount;
        settings[model].resetHours = resetHours;

        chrome.storage.sync.set({ modelSettings: settings }, () => {
            calibrationFeedback = {
                model,
                text: `Calibrated to ${reachedCount} uses every ${resetHours} hours.`,
            };
            cachedSettings = settings;
            updateStats();
        });
    });
}

function showCalibrationMessage(message, text, isError) {
    if (!message) return;

    message.textContent = text;
    message.classList.toggle('active', Boolean(text));
    message.classList.toggle('error', Boolean(isError));
}

function showConfirm(message, onConfirm) {
    // Remove any existing confirm dialog
    document.getElementById('gc-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gc-confirm-overlay';
    overlay.className = 'confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-dialog" role="dialog" aria-modal="true">
            <p>${escapeHtml(message)}</p>
            <div class="confirm-actions">
                <button id="gc-confirm-cancel">Cancel</button>
                <button id="gc-confirm-ok" class="danger-action">Confirm</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('gc-confirm-ok').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
    document.getElementById('gc-confirm-cancel').addEventListener('click', () => {
        overlay.remove();
    });
}
