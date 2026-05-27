// ─── Selectors ─────────────────────────────────────────────────────────────
const MODEL_PILL_SELECTORS = [
  '[data-test-id="logo-pill-label-container"]',
  '[data-test-id="bard-mode-menu-button"]',
  'button.input-area-switch',
  'div.input-area-switch',
];
const SEND_BUTTON_SELECTOR = '.send-button';
const TEXT_AREA_SELECTOR = '[contenteditable="true"]';
const BADGE_ID = 'gemini-counter-badge';
const MODEL_SWITCH_MENU_SELECTOR = '.gds-mode-switch-menu';
const MODEL_OPTION_SELECTOR = 'button[data-test-id^="bard-mode-option-"]';
const MODEL_SWITCH_MENU_SELECTORS = [
  MODEL_SWITCH_MENU_SELECTOR,
  '.mat-bottom-sheet-container',
  '.mat-mdc-menu-panel',
  '.cdk-overlay-pane',
  '[role="menu"]',
  '[role="listbox"]',
];
const MODEL_OPTION_SELECTORS = [
  MODEL_OPTION_SELECTOR,
  '[data-test-id^="bard-mode-option-"]',
  '[data-test-id*="mode-option"]',
  '[data-test-id*="model-option"]',
  '[role="menuitem"]',
  '[role="option"]',
  'button',
];
const MODEL_LABEL_ALIASES_STORAGE_KEY = 'modelLabelAliases';
const ASK_SELECTION_BUTTON_ID = 'gemini-counter-ask-selection';
const ASK_CONTEXT_BAR_ID = 'gemini-counter-ask-context';
const ASK_CONTEXT_STYLE_ID = 'gemini-counter-ask-context-styles';
const ASK_CONTEXT_HIGHLIGHT_NAME = 'gemini-counter-ask-context-highlight';
const ASK_CONTEXT_MAX_CHARS = 4000;
const AUTO_DIR_TARGET_SELECTOR = '.markdown > *, .query-text > *, .ql-editor, .ql-editor > *';
const DEFAULT_AUTO_DIR_ENABLED = false;
const NEON_MATH_STYLE_ATTR = 'data-gemini-counter-neon-math-style';
const LIGHT_MATH_CLEANUP_STYLE_ATTR = 'data-gemini-counter-light-math-cleanup-style';
const DEFAULT_NEON_MATH_ENABLED = false;
const RESPONSE_FOLD_STYLE_ID = 'gemini-counter-response-fold-styles';
const RESPONSE_FOLD_CONTROL_CLASS = 'gemini-counter-response-fold-control';
const RESPONSE_FOLD_TARGET_SELECTOR = [
  '.model-response-text',
  'message-content .markdown',
  '.response-container .markdown',
  '.bard-text-block .markdown',
].join(', ');
const RESPONSE_FOLD_HOST_CLASS = 'gemini-counter-response-fold-host';
const RESPONSE_FOLD_MIN_CHARS = 120;
const RESPONSE_FOLD_MIN_HEIGHT = 80;
const RESPONSE_FOLD_COLLAPSED_HEIGHT = 28;

// ─── Default Settings ───────────────────────────────────────────────────────
const DEFAULT_LIMIT = 100;
const DEFAULT_RESET_HOURS = 24;
const USAGE_HISTORY_DAYS = 30;
const MODEL_OPTION_ORDER = ['Fast', 'Thinking', 'Pro'];

// ─── Model Name Aliases ─────────────────────────────────────────────────────
// Map stable English mode names to a single canonical model name.
// Localized labels are learned from Gemini's mode menu instead of being
// hardcoded here.
const MODEL_ALIASES = {
  'Quick': 'Fast',
  'Fast': 'Fast',
  'Flash': 'Fast',
  'Deep Think': 'Thinking',
  'Deep Research': 'Deep Research',
  'Pro': 'Pro',
};

const MODEL_NAME_MIGRATIONS = {
  'Flash': 'Fast',
  '2.5 Flash': 'Fast',
  '2.5 Pro': 'Thinking',
};

const MODEL_KEY_ALIASES = [
  { pattern: /(?:fast|flash|quick|gemini[-_\s]*2[._-]?5[-_\s]*flash)/i, model: 'Fast' },
  { pattern: /(?:thinking|deep[-_\s]*think|think|reason)/i, model: 'Thinking' },
  { pattern: /(?:deep[-_\s]*research|research)/i, model: 'Deep Research' },
  { pattern: /(?:gemini[-_\s]*2[._-]?5[-_\s]*pro|(?:^|[^a-z])pro(?:$|[^a-z]))/i, model: 'Pro' },
];

let learnedModelLabelAliases = {};

function resolveModelName(rawName) {
  if (!rawName) return 'Unknown Model';
  const trimmed = rawName.trim();
  if (!trimmed) return 'Unknown Model';

  const learnedAlias = learnedModelLabelAliases[getModelLabelAliasKey(trimmed)];
  if (learnedAlias) return MODEL_NAME_MIGRATIONS[learnedAlias] || learnedAlias;

  // Check if we have an alias mapping
  if (MODEL_ALIASES[trimmed]) {
    const alias = MODEL_ALIASES[trimmed];
    return MODEL_NAME_MIGRATIONS[alias] || alias;
  }

  if (MODEL_NAME_MIGRATIONS[trimmed]) {
    return MODEL_NAME_MIGRATIONS[trimmed];
  }

  // Return the raw name as-is (for models we don't have an alias for)
  return trimmed;
}

function getModelLabelAliasKey(label) {
  return String(label || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function withExtensionContext(action) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
    action();
    return true;
  } catch (error) {
    if (!/Extension context invalidated/i.test(String(error?.message || error))) {
      throw error;
    }
    return false;
  }
}

function storageGet(keys, callback) {
  return withExtensionContext(() => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) return;
      callback(result || {});
    });
  });
}

function storageSet(data, callback) {
  return withExtensionContext(() => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) return;
      callback?.();
    });
  });
}

function addStorageChangeListener(listener) {
  return withExtensionContext(() => {
    chrome.storage.onChanged.addListener(listener);
  });
}

function loadModelLabelAliases(callback) {
  storageGet([MODEL_LABEL_ALIASES_STORAGE_KEY], (result) => {
    learnedModelLabelAliases = result[MODEL_LABEL_ALIASES_STORAGE_KEY] || {};
    callback?.();
  });
}

function rememberModelLabelAlias(label, model) {
  const key = getModelLabelAliasKey(label);
  if (!key || !model) return;

  if (learnedModelLabelAliases[key] !== model) {
    learnedModelLabelAliases = {
      ...learnedModelLabelAliases,
      [key]: model,
    };
    storageSet({ [MODEL_LABEL_ALIASES_STORAGE_KEY]: learnedModelLabelAliases });
  }

  migrateStoredModelKey(label, model);
}

function resolveModelNameFromKey(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;

  for (const { pattern, model } of MODEL_KEY_ALIASES) {
    if (pattern.test(normalized)) return model;
  }

  return null;
}

function getElementModelKey(element) {
  if (!element?.getAttributeNames) return null;

  const attributeNames = element.getAttributeNames();
  for (const attributeName of attributeNames) {
    if (!/^(data-|aria-)|^(id|value|name|title)$/.test(attributeName)) continue;

    const model = resolveModelNameFromKey(element.getAttribute(attributeName));
    if (model) return model;
  }

  return null;
}

function getModelOptionLabelElement(option) {
  return option?.querySelector?.(
    '.mode-title, span.label, [class*="mode-title"], [class*="title"]'
  ) || option;
}

function getModelOptionText(option) {
  return getElementLabelText(getModelOptionLabelElement(option));
}

function normalizeModelOptionText(text) {
  return String(text || '')
    .replace(/\u200e|\u200f/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function resolveModelNameFromOption(option, index) {
  const rawName = getModelOptionText(option);
  const attributeModel = getElementModelKey(option);
  if (attributeModel) return attributeModel;

  const resolvedName = resolveModelName(rawName);
  if (rawName && resolvedName !== 'Unknown Model') return resolvedName;
  if (rawName) return rawName;

  return MODEL_OPTION_ORDER[index] || resolvedName;
}

function isLikelyModelOption(element) {
  if (!element || !isVisibleElement(element) || element.disabled) return false;
  if (element.id === BADGE_ID || element.classList?.contains('gemini-counter-dropdown-badge')) return false;

  const testId = element.getAttribute?.('data-test-id') || '';
  const isGeminiModeOption = testId.startsWith('bard-mode-option-') || element.hasAttribute?.('data-mode-id');
  const isExpandableSubmenu = element.classList?.contains('expandable') || element.getAttribute?.('aria-expanded') !== null;
  if (isExpandableSubmenu && !isGeminiModeOption) return false;

  const text = getModelOptionText(element);
  const searchText = getElementSearchText(element);
  if (!text && !searchText) return false;

  if (isGeminiModeOption) return true;
  if (getElementModelKey(element)) return true;
  if (isLikelyModelText(searchText)) return true;

  return text.length > 0 && text.length <= 80;
}

function getModelOptionsFromContainer(container, { modelRowsOnly = false } = {}) {
  if (!container) return [];

  const seen = new Set();
  const options = [];

  for (const selector of MODEL_OPTION_SELECTORS) {
    for (const element of container.querySelectorAll(selector)) {
      if (seen.has(element) || !isLikelyModelOption(element)) continue;
      if (modelRowsOnly && !isGeminiModelOptionElement(element)) continue;
      seen.add(element);
      options.push(element);
    }
  }

  return options;
}

function isGeminiModelOptionElement(element) {
  const testId = element?.getAttribute?.('data-test-id') || '';
  return testId.startsWith('bard-mode-option-') || element?.hasAttribute?.('data-mode-id');
}

function hasModelMenuSignal(container, options) {
  return options.some(isGeminiModelOptionElement);
}

function findModelDropdown() {
  const containers = [];

  for (const selector of MODEL_SWITCH_MENU_SELECTORS) {
    containers.push(...document.querySelectorAll(selector));
  }

  for (const container of containers) {
    if (!isVisibleElement(container)) continue;
    const options = getModelOptionsFromContainer(container, { modelRowsOnly: true });
    if (options.length >= 2 && hasModelMenuSignal(container, options)) return container;
  }

  return null;
}

function findThinkingLevelTrigger() {
  const dropdown = findModelDropdown();
  if (!dropdown) return null;

  const candidates = dropdown.querySelectorAll(
    'gem-menu-item[role="menuitem"], [role="menuitem"], button'
  );

  for (const candidate of candidates) {
    if (!isVisibleElement(candidate) || candidate.disabled) continue;
    if (isGeminiModelOptionElement(candidate)) continue;
    if (candidate.getAttribute?.('value') === 'thinking_level') return candidate;
    if (/thinking[_-]?level/i.test(candidate.getAttribute?.('data-test-id') || '')) return candidate;
  }

  return null;
}

function getVisibleMenuOptions(container) {
  if (!container) return [];

  const seen = new Set();
  const options = [];
  const candidates = container.querySelectorAll(
    'gem-menu-item[role="menuitem"], [role="menuitem"], [role="option"], button'
  );

  for (const candidate of candidates) {
    if (seen.has(candidate) || !isVisibleElement(candidate) || candidate.disabled) continue;
    if (candidate.id === BADGE_ID || candidate.classList?.contains('gemini-counter-dropdown-badge')) continue;
    if (isGeminiModelOptionElement(candidate)) continue;
    if (candidate.getAttribute?.('value') === 'thinking_level') continue;
    if (candidate.getAttribute?.('aria-expanded') !== null) continue;
    seen.add(candidate);
    options.push(candidate);
  }

  return options;
}

function findThinkingLevelOptionsMenu() {
  if (!findThinkingLevelTrigger()) return null;

  const containers = [];

  for (const selector of MODEL_SWITCH_MENU_SELECTORS) {
    containers.push(...document.querySelectorAll(selector));
  }

  for (const container of containers.reverse()) {
    if (!isVisibleElement(container)) continue;
    if (getModelOptionsFromContainer(container, { modelRowsOnly: true }).length > 0) continue;

    const options = getVisibleMenuOptions(container);
    if (options.length === 2) return { container, options };
  }

  return null;
}

function getSelectedDropdownModelName() {
  const dropdown = findModelDropdown();
  if (!dropdown) return null;

  const buttons = getVisibleModelOptions(dropdown);
  if (buttons.length === 0) return null;

  const selectedIndex = getSelectedModelOptionIndex(buttons);
  if (selectedIndex < 0) return null;

  const selectedButton = buttons[selectedIndex];
  const rawName = getModelOptionText(selectedButton);
  const inferredModel = resolveModelNameFromOption(selectedButton, selectedIndex);
  if (rawName) rememberModelLabelAlias(rawName, inferredModel);
  return inferredModel;
}

// ─── Model Name Detection ───────────────────────────────────────────────────

function getRawModelName() {
  const pill = getModelPill();
  if (!pill) return null;
  return getElementLabelText(pill) || null;
}

function getModelName() {
  const dropdownModel = getSelectedDropdownModelName();
  if (dropdownModel) return dropdownModel;

  const pill = getModelPill();
  const pillModel = getElementModelKey(pill);
  if (pillModel) return pillModel;

  const raw = getRawModelName();
  return resolveModelName(raw);
}

function isVisibleElement(element) {
  return !!element && (element.offsetParent !== null || element.getClientRects().length > 0);
}

function collectText(node, parts = []) {
  if (!node) return parts;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text) parts.push(text);
    return parts;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return parts;
  }

  const element = node;
  if (
    element.id === BADGE_ID
    || element.classList?.contains('gemini-counter-dropdown-badge')
    || element.classList?.contains(RESPONSE_FOLD_CONTROL_CLASS)
  ) {
    return parts;
  }

  for (const child of element.childNodes) {
    collectText(child, parts);
  }

  return parts;
}

function getElementLabelText(element) {
  return collectText(element, []).join(' ').replace(/\s+/g, ' ').trim();
}

function getElementSearchText(element) {
  if (!element) return '';

  const parts = [
    getElementLabelText(element),
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('title'),
    element.getAttribute?.('data-test-id'),
    element.getAttribute?.('id'),
    element.getAttribute?.('name'),
    element.getAttribute?.('value'),
  ];

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function isLikelyModelText(text) {
  return /(?:model|mode|gemini|flash|fast|quick|thinking|think|reason|pro|research|2[._-]?[05]|3(?:[._-]?\d)?)/i.test(text || '');
}

function getModelPill() {
  for (const selector of MODEL_PILL_SELECTORS) {
    const matches = document.querySelectorAll(selector);
    for (const match of matches) {
      if (!isVisibleElement(match)) continue;
      if (!getElementLabelText(match)) continue;
      return match;
    }
  }

  const triggerCandidates = document.querySelectorAll(
    'button[aria-haspopup="true"], [role="button"][aria-haspopup="true"], button[data-test-id*="mode"], button[data-test-id*="model"]'
  );

  for (const candidate of triggerCandidates) {
    if (!isVisibleElement(candidate)) continue;
    if (!isLikelyModelText(getElementSearchText(candidate))) continue;
    return candidate;
  }

  return null;
}

function getBadgeHost(pill) {
  if (!pill) return null;
  if (pill.matches('[data-test-id="logo-pill-label-container"]')) return pill;

  const candidates = [pill, ...pill.querySelectorAll('span, div')];
  let best = pill;
  let bestLength = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isVisibleElement(candidate)) continue;
    const text = getElementLabelText(candidate);
    if (!text || text.length > 40) continue;
    if (text.length < bestLength) {
      best = candidate;
      bestLength = text.length;
    }
  }

  return best;
}

// ─── Data Normalization ─────────────────────────────────────────────────────

function normalizeModelData(data) {
  if (data === null || data === undefined) {
    return { count: 0, firstUsage: null };
  }
  if (typeof data === 'number') {
    return { count: data, firstUsage: null };
  }
  if (typeof data === 'object') {
    return {
      count: typeof data.count === 'number' ? data.count : 0,
      firstUsage: data.firstUsage || null,
    };
  }
  return { count: 0, firstUsage: null };
}

function getLocalDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalHourKey(timestamp = Date.now()) {
  return String(new Date(timestamp).getHours()).padStart(2, '0');
}

function pruneUsageHistory(history, timestamp = Date.now()) {
  const cutoff = new Date(timestamp);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (USAGE_HISTORY_DAYS - 1));
  const cutoffKey = getLocalDateKey(cutoff.getTime());

  for (const dateKey of Object.keys(history)) {
    if (dateKey < cutoffKey) {
      delete history[dateKey];
    }
  }
}

function recordUsageStats(model, timestamp, currentWindowCountBeforeIncrement, totals, history, hourlyHistory) {
  const dateKey = getLocalDateKey(timestamp);
  const hourKey = getLocalHourKey(timestamp);
  const shouldSeedToday = Object.keys(history).length === 0;
  const shouldSeedCurrentHour = Object.keys(hourlyHistory).length === 0;

  if (typeof totals[model] !== 'number') {
    totals[model] = Math.max(0, currentWindowCountBeforeIncrement);
  }
  totals[model] += 1;

  if (!history[dateKey]) {
    history[dateKey] = {};
  }
  if (typeof history[dateKey][model] !== 'number') {
    history[dateKey][model] = shouldSeedToday ? Math.max(0, currentWindowCountBeforeIncrement) : 0;
  }
  history[dateKey][model] += 1;

  if (!hourlyHistory[dateKey]) {
    hourlyHistory[dateKey] = {};
  }
  if (!hourlyHistory[dateKey][hourKey]) {
    hourlyHistory[dateKey][hourKey] = {};
  }
  if (typeof hourlyHistory[dateKey][hourKey][model] !== 'number') {
    hourlyHistory[dateKey][hourKey][model] = shouldSeedCurrentHour ? Math.max(0, currentWindowCountBeforeIncrement) : 0;
  }
  hourlyHistory[dateKey][hourKey][model] += 1;

  pruneUsageHistory(history, timestamp);
  pruneUsageHistory(hourlyHistory, timestamp);
}

// ─── Badge injection ────────────────────────────────────────────────────────

function getOrCreateBadge() {
  let badge = document.getElementById(BADGE_ID);
  const pill = getModelPill();
  if (!pill) return null;
  const badgeHost = getBadgeHost(pill);
  if (!badgeHost) return null;

  if (!badge) {
    badge = document.createElement('span');
    badge.id = BADGE_ID;
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-inline-start: 6px;
      padding: 1px 6px;
      border-radius: 10px;
      background: #1a73e8;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      vertical-align: middle;
      min-width: 18px;
      pointer-events: none;
      transition: background 0.2s;
    `;
  }

  if (badge.parentElement !== badgeHost) {
    badgeHost.appendChild(badge);
  }

  return badge;
}

function updateBadge() {
  const model = getModelName();
  if (model === 'Unknown Model') return;

  storageGet(['modelCounts', 'modelSettings'], (result) => {
    const counts = result.modelCounts || {};
    const settings = result.modelSettings || {};

    checkReset(model, counts, settings, (updatedCounts) => {
      const modelData = normalizeModelData(updatedCounts[model]);
      const count = modelData.count;
      const modelSetting = settings[model] || {};
      const limit = modelSetting.limit || DEFAULT_LIMIT;

      const badge = getOrCreateBadge();
      if (!badge) return;

      badge.textContent = `${count}/${limit}`;

      const percentage = (count / limit) * 100;
      if (percentage >= 100) {
        badge.style.background = '#d93025';
      } else if (percentage >= 80) {
        badge.style.background = '#f9ab00';
      } else {
        badge.style.background = '#1a73e8';
      }
    });
  });
}

// ─── Logic: Reset Count if Time Expired ─────────────────────────────────────

function checkReset(model, counts, settings, callback) {
  const now = Date.now();
  const modelData = normalizeModelData(counts[model]);
  const modelSetting = settings[model] || {};
  const resetPeriodMs = (modelSetting.resetHours || DEFAULT_RESET_HOURS) * 60 * 60 * 1000;

  let changed = false;

  if (modelData.count > 0 && !modelData.firstUsage) {
    modelData.firstUsage = now;
    changed = true;
  }

  if (modelData.firstUsage && (now - modelData.firstUsage > resetPeriodMs)) {
    modelData.count = 0;
    modelData.firstUsage = null;
    changed = true;
  }

  if (changed) {
    counts[model] = modelData;
    storageSet({ modelCounts: counts }, () => {
      callback(counts);
    });
  } else {
    counts[model] = modelData;
    callback(counts);
  }
}

// ─── Counting ───────────────────────────────────────────────────────────────

let lastIncrementTime = 0;
const DEBOUNCE_MS = 1000;

function incrementCount() {
  const now = Date.now();
  if (now - lastIncrementTime < DEBOUNCE_MS) {
    return;
  }
  lastIncrementTime = now;

  const model = getModelName();
  if (model === 'Unknown Model') return;

  storageGet(['modelCounts', 'modelSettings', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory'], (result) => {
    let counts = result.modelCounts || {};
    let settings = result.modelSettings || {};
    let totals = result.modelTotals || {};
    let history = result.modelUsageHistory || {};
    let hourlyHistory = result.modelUsageHourlyHistory || {};

    checkReset(model, counts, settings, (currentCounts) => {
      let modelData = normalizeModelData(currentCounts[model]);
      const currentWindowCountBeforeIncrement = modelData.count;

      if (modelData.count === 0) {
        modelData.firstUsage = now;
      }

      modelData.count += 1;
      currentCounts[model] = modelData;
      recordUsageStats(model, now, currentWindowCountBeforeIncrement, totals, history, hourlyHistory);

      storageSet({
        modelCounts: currentCounts,
        modelTotals: totals,
        modelUsageHistory: history,
        modelUsageHourlyHistory: hourlyHistory,
      }, updateBadge);
    });
  });
}

// ─── Cross-tab sync via storage.onChanged ───────────────────────────────────

addStorageChangeListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes[MODEL_LABEL_ALIASES_STORAGE_KEY]) {
    learnedModelLabelAliases = changes[MODEL_LABEL_ALIASES_STORAGE_KEY].newValue || {};
  }

  if (changes.modelCounts || changes.modelSettings) {
    updateBadge();
    // Also update dropdown badges if the dropdown is open
    injectDropdownBadges();
  }

  if (changes.autoDirEnabled) {
    setAutoDirFeatureEnabled(changes.autoDirEnabled.newValue);
  }

  if (changes.neonMathEnabled) {
    setNeonMathFeatureEnabled(changes.neonMathEnabled.newValue);
  }
});

// ─── Event listeners ────────────────────────────────────────────────────────

function hasMessageContent() {
  const textarea = document.querySelector(TEXT_AREA_SELECTOR);
  if (!textarea) return false;
  const text = textarea.textContent || textarea.innerText || '';
  return text.trim().length > 0;
}

// --- Response Folding -------------------------------------------------------

let responseFoldCounter = 0;
let responseFoldTimer = null;

function ensureResponseFoldStyles() {
  if (document.getElementById(RESPONSE_FOLD_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = RESPONSE_FOLD_STYLE_ID;
  style.textContent = `
    .${RESPONSE_FOLD_CONTROL_CLASS} {
      align-items: center;
      background: color-mix(in srgb, Canvas 70%, transparent);
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
      border-radius: 50%;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      font: 500 12px/1.25 Google Sans, Roboto, Arial, sans-serif;
      height: 26px;
      justify-content: center;
      left: -36px;
      padding: 0;
      position: absolute;
      top: 0;
      user-select: none;
      width: 26px;
      z-index: 2;
    }

    .${RESPONSE_FOLD_CONTROL_CLASS}:hover {
      background: color-mix(in srgb, CanvasText 8%, Canvas);
    }

    .${RESPONSE_FOLD_CONTROL_CLASS}:focus-visible {
      outline: 2px solid #8ab4f8;
      outline-offset: 2px;
    }

    .${RESPONSE_FOLD_CONTROL_CLASS} .gemini-counter-response-fold-arrow {
      border-bottom: 2px solid currentColor;
      border-right: 2px solid currentColor;
      display: inline-block;
      height: 7px;
      transform: rotate(45deg);
      transition: transform 0.18s ease;
      width: 7px;
    }

    .${RESPONSE_FOLD_CONTROL_CLASS}[aria-expanded="true"] .gemini-counter-response-fold-arrow {
      transform: rotate(225deg);
    }

    .gemini-counter-foldable-response {
      transition: max-height 0.33s ease, opacity 0.33s ease !important;
      position: relative !important;
    }

    .${RESPONSE_FOLD_HOST_CLASS} {
      position: relative !important;
    }

    .gemini-counter-response-collapsed {
      max-height: ${RESPONSE_FOLD_COLLAPSED_HEIGHT}px;
      overflow: hidden !important;
    }


  `;
  document.head.appendChild(style);
}

function getResponseFoldText(target) {
  return collectText(target, []).join(' ').replace(/\s+/g, ' ').trim();
}

function isResponseFoldTarget(target) {
  if (!target || !isVisibleElement(target)) return false;
  if (target.closest?.(`[contenteditable="true"], .query-text, #${ASK_CONTEXT_BAR_ID}, #${ASK_SELECTION_BUTTON_ID}`)) return false;

  const parentFoldTarget = target.parentElement?.closest?.(RESPONSE_FOLD_TARGET_SELECTOR);
  if (parentFoldTarget) return false;

  return true;
}

function getResponseFoldControl(target) {
  const targetId = target.dataset.geminiCounterResponseFoldId;
  if (!targetId) return null;

  const parent = target.parentElement;
  const control = parent?.querySelector?.(
    `.${RESPONSE_FOLD_CONTROL_CLASS}[data-response-fold-target="${CSS.escape(targetId)}"]`
  );

  return control || null;
}

function removeResponseFold(target) {
  getResponseFoldControl(target)?.remove();
  target.classList.remove(
    'gemini-counter-foldable-response',
    'gemini-counter-response-collapsed',
    'gemini-counter-response-expanded'
  );
  target.parentElement?.classList.remove(RESPONSE_FOLD_HOST_CLASS);
  delete target.dataset.geminiCounterResponseFoldState;
}

function clearResponseFoldAnimation(target) {
  if (target.dataset.geminiCounterResponseFoldTimer) {
    clearTimeout(Number(target.dataset.geminiCounterResponseFoldTimer));
    delete target.dataset.geminiCounterResponseFoldTimer;
  }
}

function finishResponseFoldAnimation(target, shouldClearMaxHeight) {
  clearResponseFoldAnimation(target);

  const timer = setTimeout(() => {
    delete target.dataset.geminiCounterResponseFoldTimer;
    if (shouldClearMaxHeight && target.dataset.geminiCounterResponseFoldState === 'expanded') {
      target.style.maxHeight = '';
    }
  }, 360);

  target.dataset.geminiCounterResponseFoldTimer = String(timer);
}

function updateResponseFoldControl(target, control, { animate = false } = {}) {
  const isExpanded = target.dataset.geminiCounterResponseFoldState === 'expanded';
  control.setAttribute('aria-expanded', String(isExpanded));
  control.setAttribute('aria-label', isExpanded ? 'Minimize response' : 'Show response');
  control.setAttribute('title', isExpanded ? 'Minimize response' : 'Show response');

  clearResponseFoldAnimation(target);

  if (!animate) {
    target.style.maxHeight = isExpanded ? '' : `${RESPONSE_FOLD_COLLAPSED_HEIGHT}px`;
    target.classList.toggle('gemini-counter-response-collapsed', !isExpanded);
    target.classList.toggle('gemini-counter-response-expanded', isExpanded);
    return;
  }

  if (isExpanded) {
    const fullHeight = target.scrollHeight;
    target.style.maxHeight = `${RESPONSE_FOLD_COLLAPSED_HEIGHT}px`;
    target.classList.remove('gemini-counter-response-collapsed');
    target.classList.add('gemini-counter-response-expanded');
    target.offsetHeight;
    requestAnimationFrame(() => {
      target.style.maxHeight = `${fullHeight}px`;
      finishResponseFoldAnimation(target, true);
    });
    return;
  }

  const fullHeight = target.scrollHeight;
  target.style.maxHeight = `${fullHeight}px`;
  target.classList.remove('gemini-counter-response-expanded');
  target.classList.add('gemini-counter-response-collapsed');
  target.offsetHeight;
  requestAnimationFrame(() => {
    target.style.maxHeight = `${RESPONSE_FOLD_COLLAPSED_HEIGHT}px`;
    finishResponseFoldAnimation(target, false);
  });
}

function createResponseFoldControl(target) {
  if (!target.dataset.geminiCounterResponseFoldId) {
    responseFoldCounter += 1;
    target.dataset.geminiCounterResponseFoldId = `response-${responseFoldCounter}`;
  }

  const control = document.createElement('button');
  control.type = 'button';
  control.className = RESPONSE_FOLD_CONTROL_CLASS;
  control.dataset.responseFoldTarget = target.dataset.geminiCounterResponseFoldId;
  control.innerHTML = `
    <span class="gemini-counter-response-fold-arrow" aria-hidden="true"></span>
  `;
  control.addEventListener('click', () => {
    target.dataset.geminiCounterResponseFoldState =
      target.dataset.geminiCounterResponseFoldState === 'expanded' ? 'collapsed' : 'expanded';
    updateResponseFoldControl(target, control, { animate: true });
  });

  const host = target.parentElement;
  host?.classList.add(RESPONSE_FOLD_HOST_CLASS);
  host?.insertBefore(control, target);
  return control;
}

function applyResponseFolding() {
  if (!document.body) return;
  ensureResponseFoldStyles();

  document.querySelectorAll(RESPONSE_FOLD_TARGET_SELECTOR).forEach((target) => {
    if (!isResponseFoldTarget(target)) return;

    const text = getResponseFoldText(target);
    const isLong = text.length >= RESPONSE_FOLD_MIN_CHARS || target.scrollHeight >= RESPONSE_FOLD_MIN_HEIGHT;

    if (!isLong) {
      removeResponseFold(target);
      return;
    }

    target.classList.add('gemini-counter-foldable-response');
    target.parentElement?.classList.add(RESPONSE_FOLD_HOST_CLASS);

    if (!target.dataset.geminiCounterResponseFoldState) {
      target.dataset.geminiCounterResponseFoldState = 'expanded';
    }

    const control = getResponseFoldControl(target) || createResponseFoldControl(target);
    updateResponseFoldControl(target, control);
  });
}

function scheduleResponseFolding() {
  clearTimeout(responseFoldTimer);
  responseFoldTimer = setTimeout(() => {
    responseFoldTimer = null;
    applyResponseFolding();
  }, 120);
}

// --- Native Auto Direction --------------------------------------------------

let autoDirEnabled = null;
let autoDirObserver = null;

function normalizeAutoDirEnabled(value) {
  return value !== false;
}

function applyAutoDirToTargets() {
  document.querySelectorAll(AUTO_DIR_TARGET_SELECTOR).forEach((x) => {
    if (x.dir !== 'auto') x.dir = 'auto';
    if (x.style?.direction) x.style.direction = '';
    if (x.style?.unicodeBidi !== 'plaintext') x.style.unicodeBidi = 'plaintext';
  });
}

function stopAutoDirObserver() {
  if (autoDirObserver) {
    autoDirObserver.disconnect();
    autoDirObserver = null;
  }
}

function syncAutoDirFeature() {
  if (autoDirEnabled === null) return;

  if (!autoDirEnabled) {
    stopAutoDirObserver();
    return;
  }

  if (!document.body) {
    stopAutoDirObserver();
    return;
  }

  applyAutoDirToTargets();

  if (autoDirObserver) return;

  autoDirObserver = new MutationObserver(() => {
    applyAutoDirToTargets();
  });
  autoDirObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'dir'],
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function setAutoDirFeatureEnabled(enabled) {
  autoDirEnabled = normalizeAutoDirEnabled(enabled);
  syncAutoDirFeature();
}

function loadAutoDirSetting() {
  storageGet(['autoDirEnabled'], (result) => {
    setAutoDirFeatureEnabled(
      result.autoDirEnabled === undefined
        ? DEFAULT_AUTO_DIR_ENABLED
        : result.autoDirEnabled
    );
  });
}

// --- Neon Math Colors -------------------------------------------------------

const NEON_MATH_CSS = `
  /* General Text (White, No Glow) */
  .model-response-text p, .model-response-text li, .model-response-text ul {
    color: #ffffff !important;
    text-shadow: none !important;
  }

  /* Bold Text & Headers (White + Glow) */
  .model-response-text strong, .model-response-text b,
  .model-response-text h1, .model-response-text h2, .model-response-text h3 {
    color: #ffffff !important;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.0.11) !important;
    font-weight: bold !important;
  }

  /* Black math fix */
  .katex *[style*="color: black"], .katex *[style*="color: #000"],
  .katex *[style*="color: #202124"], .katex *[style*="color:rgb(0, 0, 0)"] {
    color: #ffffff !important;
    text-shadow: 0 0 3px rgba(255, 255, 255, 0.45) !important;
    stroke: #ffffff !important;
    fill: #ffffff !important;
    border-color: #ffffff !important;
  }

  /* High glow colors */
  .katex *[style*="color: cyan"], .katex *[style*="color: #00ffff"], .katex *[style*="color: teal"] {
    color: #00e5ff !important;
    text-shadow: 0 0 10px !important;
    border-color: #00e5ff !important;
  }
  .katex *[style*="color: blue"], .katex *[style*="color: #00f"], .katex *[style*="color: #0000ff"], .katex *[style*="color: darkblue"] {
    color: #2979ff !important;
    text-shadow: 0 0 10px !important;
    border-color: #2979ff !important;
  }
  .katex *[style*="color: red"], .katex *[style*="color: #f00"] {
    color: #ff1a1a !important;
    text-shadow: 0 0 10px !important;
    border-color: #ff1a1a !important;
  }
  .katex *[style*="color: purple"], .katex *[style*="color: #800080"] {
    color: #d500f9 !important;
    text-shadow: 0 0 10px !important;
    border-color: #d500f9 !important;
  }
  .katex *[style*="color: indigo"], .katex *[style*="color:indigo"],
  .katex *[style*="color: #4b0082"], .katex *[style*="color:#4b0082"],
  .katex *[style*="color: rgb(75, 0, 130)"], .katex *[style*="color:rgb(75, 0, 130)"] {
    color: #8c7cff !important;
    text-shadow: 0 0 10px rgba(140, 124, 255, 0.85) !important;
    border-color: #8c7cff !important;
  }

  /* Medium glow colors */
  .katex *[style*="color: green"], .katex *[style*="color: #008000"], .katex *[style*="color: darkgreen"] {
    color: #00e676 !important;
    text-shadow: 0 0 7px !important;
    border-color: #00e676 !important;
  }
  .katex *[style*="color: orange"], .katex *[style*="color: #ffa500"] {
    color: #ff9100 !important;
    text-shadow: 0 0 7px !important;
    border-color: #ff9100 !important;
  }

  /* Low glow colors */
  .katex *[style*="color: magenta"], .katex *[style*="color: #ff00ff"] {
    color: #ff4081 !important;
    text-shadow: 0 0 5px !important;
    border-color: #ff4081 !important;
  }
  .katex *[style*="color: lime"], .katex *[style*="color: #00ff00"] {
    color: #76ff03 !important;
    text-shadow: 0 0 5px !important;
    border-color: #76ff03 !important;
  }
  .katex *[style*="color: yellow"], .katex *[style*="color: #ffff00"] {
    color: #ffea00 !important;
    text-shadow: 0 0 5px !important;
    border-color: #ffea00 !important;
  }
`;

const LIGHT_MATH_CLEANUP_CSS = `
  .model-response-text,
  .model-response-text * {
    text-shadow: none !important;
  }

  .model-response-text span,
  .katex,
  .katex * {
    color: inherit !important;
    text-shadow: none !important;
    border-color: currentColor !important;
  }

  .model-response-text a,
  .model-response-text a * {
    color: #0b57d0 !important;
  }

  .model-response-text [style*="color"],
  .model-response-text font[color],
  .katex [style*="color"] {
    color: inherit !important;
    text-shadow: none !important;
    border-color: currentColor !important;
  }

  .katex [style*="color"] svg,
  .katex [style*="color"] svg * {
    color: inherit !important;
    stroke: currentColor !important;
    fill: currentColor !important;
    text-shadow: none !important;
  }
`;

const LIGHT_MATH_COLORS_CSS = `
  .model-response-text,
  .model-response-text * {
    text-shadow: none !important;
  }

  .katex *[style*="color: black"],
  .katex *[style*="color: #000"],
  .katex *[style*="color: #202124"],
  .katex *[style*="color:rgb(0, 0, 0)"] {
    color: #202124 !important;
    stroke: #202124 !important;
    fill: #202124 !important;
    border-color: #202124 !important;
  }

  .katex *[style*="color: cyan"],
  .katex *[style*="color: #00ffff"],
  .katex *[style*="color: teal"] {
    color: #006b76 !important;
    border-color: #006b76 !important;
  }

  .katex *[style*="color: blue"],
  .katex *[style*="color: #00f"],
  .katex *[style*="color: #0000ff"],
  .katex *[style*="color: darkblue"] {
    color: #0b57d0 !important;
    border-color: #0b57d0 !important;
  }

  .katex *[style*="color: red"],
  .katex *[style*="color: #f00"] {
    color: #b3261e !important;
    border-color: #b3261e !important;
  }

  .katex *[style*="color: purple"],
  .katex *[style*="color: #800080"] {
    color: #7b1fa2 !important;
    border-color: #7b1fa2 !important;
  }

  .katex *[style*="color: indigo"],
  .katex *[style*="color:indigo"],
  .katex *[style*="color: #4b0082"],
  .katex *[style*="color:#4b0082"],
  .katex *[style*="color: rgb(75, 0, 130)"],
  .katex *[style*="color:rgb(75, 0, 130)"] {
    color: #3f51b5 !important;
    border-color: #3f51b5 !important;
  }

  .katex *[style*="color: green"],
  .katex *[style*="color: #008000"],
  .katex *[style*="color: darkgreen"] {
    color: #137333 !important;
    border-color: #137333 !important;
  }

  .katex *[style*="color: orange"],
  .katex *[style*="color: #ffa500"] {
    color: #b06000 !important;
    border-color: #b06000 !important;
  }

  .katex *[style*="color: magenta"],
  .katex *[style*="color: #ff00ff"] {
    color: #a50e5a !important;
    border-color: #a50e5a !important;
  }

  .katex *[style*="color: lime"],
  .katex *[style*="color: #00ff00"] {
    color: #188038 !important;
    border-color: #188038 !important;
  }

  .katex *[style*="color: yellow"],
  .katex *[style*="color: #ffff00"] {
    color: #8a5a00 !important;
    border-color: #8a5a00 !important;
  }
`;

let neonMathEnabled = null;
let neonMathThemeObserver = null;
let neonMathObservedBody = null;
let neonMathSyncTimer = null;
const neonMathStyleNodes = new Set();
const lightMathCleanupStyleNodes = new Set();

function getDeclaredPageTheme() {
  const themeText = [
    document.documentElement?.className,
    document.documentElement?.getAttribute?.('data-theme'),
    document.documentElement?.getAttribute?.('theme'),
    document.body?.className,
    document.body?.getAttribute?.('data-theme'),
    document.body?.getAttribute?.('theme'),
  ].join(' ');

  if (/\blight\b/i.test(themeText)) return 'light';
  if (/\bdark\b/i.test(themeText)) return 'dark';
  return null;
}

function parseCssColor(color) {
  if (!color || color === 'transparent') return null;

  const rgbMatch = color.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const [rgbPart, alphaPart = '1'] = rgbMatch[1].split('/').map((part) => part.trim());
    const [r, g, b] = rgbPart.includes(',')
      ? rgbPart.split(',').map((part) => part.trim())
      : rgbPart.split(/\s+/).map((part) => part.trim());
    const a = rgbPart.includes(',')
      ? (rgbPart.split(',')[3] || alphaPart)
      : alphaPart;
    const alpha = Number.parseFloat(a);
    if (alpha === 0) return null;
    return [Number.parseFloat(r), Number.parseFloat(g), Number.parseFloat(b)];
  }

  return null;
}

function getRelativeLuminance([r, g, b]) {
  const [sr, sg, sb] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
}

function getVisiblePageBackgroundColor() {
  const candidates = [
    document.querySelector('.model-response-text'),
    document.querySelector('.conversation-container'),
    document.querySelector('.chat-history'),
    document.querySelector('.bard-text-block'),
    document.querySelector('message-content'),
    document.querySelector('mat-sidenav-content'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body,
    document.documentElement,
  ].filter(Boolean);

  for (const element of candidates) {
    let current = element;
    while (current && current !== document) {
      const color = parseCssColor(getComputedStyle(current).backgroundColor);
      if (color) return color;
      current = current.parentElement || current.getRootNode()?.host;
    }
  }

  return null;
}

function isPageInDarkMode() {
  const visibleBackground = getVisiblePageBackgroundColor();
  if (visibleBackground) return getRelativeLuminance(visibleBackground) < 0.45;

  const declaredTheme = getDeclaredPageTheme();
  if (declaredTheme) return declaredTheme === 'dark';

  const colorScheme = getComputedStyle(document.documentElement).colorScheme;
  if (/\bdark\b/i.test(colorScheme) && !/\blight\b/i.test(colorScheme)) return true;
  if (/\blight\b/i.test(colorScheme) && !/\bdark\b/i.test(colorScheme)) return false;

  return false;
}

function scheduleNeonMathSync(startNode = document) {
  syncNeonMathFeature(startNode);

  if (neonMathSyncTimer) clearTimeout(neonMathSyncTimer);
  neonMathSyncTimer = setTimeout(() => {
    neonMathSyncTimer = null;
    syncNeonMathFeature(startNode);
  }, 120);
}

function getNeonMathStyleContainer(root) {
  if (!root) return null;
  if (root === document || root.nodeType === Node.DOCUMENT_NODE) {
    return document.head || document.documentElement;
  }
  return root;
}

function injectNeonMathStyles(root) {
  const container = getNeonMathStyleContainer(root);
  if (!container || container.querySelector?.(`style[${NEON_MATH_STYLE_ATTR}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(NEON_MATH_STYLE_ATTR, '');
  style.textContent = NEON_MATH_CSS;
  container.appendChild(style);
  neonMathStyleNodes.add(style);
}

function injectLightMathStyles(root, cssText) {
  const container = getNeonMathStyleContainer(root);
  if (!container || container.querySelector?.(`style[${LIGHT_MATH_CLEANUP_STYLE_ATTR}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(LIGHT_MATH_CLEANUP_STYLE_ATTR, '');
  style.textContent = cssText;
  container.appendChild(style);
  lightMathCleanupStyleNodes.add(style);
}

function removeNeonMathStyles() {
  neonMathStyleNodes.forEach((style) => style.remove());
  neonMathStyleNodes.clear();

  document.querySelectorAll(`style[${NEON_MATH_STYLE_ATTR}]`).forEach((style) => style.remove());
  document.querySelectorAll('*').forEach((element) => {
    element.shadowRoot?.querySelectorAll(`style[${NEON_MATH_STYLE_ATTR}]`).forEach((style) => style.remove());
  });
}

function removeLightMathCleanupStyles() {
  lightMathCleanupStyleNodes.forEach((style) => style.remove());
  lightMathCleanupStyleNodes.clear();

  document.querySelectorAll(`style[${LIGHT_MATH_CLEANUP_STYLE_ATTR}]`).forEach((style) => style.remove());
  document.querySelectorAll('*').forEach((element) => {
    element.shadowRoot?.querySelectorAll(`style[${LIGHT_MATH_CLEANUP_STYLE_ATTR}]`).forEach((style) => style.remove());
  });
}

function scanShadowRoots(startNode, injectStyles) {
  if (startNode.shadowRoot) injectStyles(startNode.shadowRoot);
  if (!startNode.querySelectorAll) return;

  startNode.querySelectorAll('*').forEach((element) => {
    if (element.shadowRoot) injectStyles(element.shadowRoot);
  });
}

function syncNeonMathFeature(startNode = document) {
  if (neonMathEnabled === null) return;

  if (!neonMathEnabled) {
    removeNeonMathStyles();
    removeLightMathCleanupStyles();
    return;
  }

  const isDarkMode = isPageInDarkMode();

  if (!isDarkMode) {
    removeNeonMathStyles();
    removeLightMathCleanupStyles();

    const injectLightStyles = (root) => injectLightMathStyles(root, LIGHT_MATH_COLORS_CSS);
    injectLightStyles(document);
    scanShadowRoots(startNode, injectLightStyles);
    return;
  }

  removeLightMathCleanupStyles();

  injectNeonMathStyles(document);
  scanShadowRoots(startNode, injectNeonMathStyles);
}

function startNeonMathThemeObserver() {
  if (!document.documentElement) return;

  if (!neonMathThemeObserver) {
    neonMathThemeObserver = new MutationObserver(() => {
      scheduleNeonMathSync();
    });

    neonMathThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'theme'],
    });
  }

  if (document.body && neonMathObservedBody !== document.body) {
    neonMathThemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'theme'],
    });
    neonMathObservedBody = document.body;
  }
}

function setNeonMathFeatureEnabled(enabled) {
  neonMathEnabled = enabled !== false;
  startNeonMathThemeObserver();
  scheduleNeonMathSync();
}

function loadNeonMathSetting() {
  storageGet(['neonMathEnabled'], (result) => {
    setNeonMathFeatureEnabled(
      result.neonMathEnabled === undefined
        ? DEFAULT_NEON_MATH_ENABLED
        : result.neonMathEnabled
    );
  });
}

let selectedAskText = '';
let selectedAskRange = null;
let activeAskContextText = '';

function normalizeSelectedText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function ensureAskContextStyles() {
  if (document.getElementById(ASK_CONTEXT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ASK_CONTEXT_STYLE_ID;
  style.textContent = `
    #${ASK_SELECTION_BUTTON_ID} {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background: #303134;
      color: #f1f3f4;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      font: 600 14px/18px Google Sans, Roboto, Arial, sans-serif;
      cursor: pointer;
      user-select: none;
    }

    #${ASK_SELECTION_BUTTON_ID}:hover {
      background: #3c4043;
    }

    #${ASK_SELECTION_BUTTON_ID} .gemini-counter-quote-mark {
      font-size: 20px;
      line-height: 14px;
    }

    ::highlight(${ASK_CONTEXT_HIGHLIGHT_NAME}) {
      background: rgba(138, 180, 248, 0.42);
      color: #fff;
    }

    #${ASK_CONTEXT_BAR_ID} {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 10px;
      direction: ltr;
      box-sizing: border-box;
      width: 100%;
      margin: 0 0 8px 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.09);
      color: #e8eaed;
      font: 500 13px/18px Google Sans, Roboto, Arial, sans-serif;
    }

    #${ASK_CONTEXT_BAR_ID} .gemini-counter-context-icon {
      flex: 0 0 auto;
      font-size: 20px;
      color: #e8eaed;
      line-height: 1;
    }

    #${ASK_CONTEXT_BAR_ID} .gemini-counter-context-text {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      direction: auto;
      unicode-bidi: plaintext;
    }

    #${ASK_CONTEXT_BAR_ID} .gemini-counter-context-close {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #bdc1c6;
      font: 20px/1 Arial, sans-serif;
      cursor: pointer;
      line-height: 1;
      touch-action: manipulation;
    }

    #${ASK_CONTEXT_BAR_ID} .gemini-counter-context-close:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

function getOrCreateAskSelectionButton() {
  ensureAskContextStyles();

  let button = document.getElementById(ASK_SELECTION_BUTTON_ID);
  if (button) return button;

  button = document.createElement('button');
  button.id = ASK_SELECTION_BUTTON_ID;
  button.type = 'button';
  button.innerHTML = '<span class="gemini-counter-quote-mark"></span><span>Ask Gemini</span>';
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyAskContext(selectedAskText);
  });

  document.body.appendChild(button);
  return button;
}

function hideAskSelectionButton() {
  const button = document.getElementById(ASK_SELECTION_BUTTON_ID);
  if (button) button.style.display = 'none';
}

function clearAskContextHighlight() {
  CSS.highlights?.delete?.(ASK_CONTEXT_HIGHLIGHT_NAME);
}

function markAskContextRange(range) {
  clearAskContextHighlight();
  if (!range || !CSS.highlights || typeof Highlight !== 'function') return;

  CSS.highlights.set(ASK_CONTEXT_HIGHLIGHT_NAME, new Highlight(range));
}

function getSelectionRect(selection) {
  if (!selection?.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height) return rect;

  return [...range.getClientRects()].find(clientRect => clientRect.width || clientRect.height) || null;
}

function selectionIsInsideAskUi(selection) {
  if (!selection?.rangeCount) return false;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  return !!element?.closest?.(`#${ASK_SELECTION_BUTTON_ID}, #${ASK_CONTEXT_BAR_ID}`);
}

function selectionIsInsideComposer(selection) {
  if (!selection?.rangeCount) return false;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  return !!element?.closest?.(TEXT_AREA_SELECTOR);
}

function updateAskSelectionButton() {
  const selection = window.getSelection();
  const text = normalizeSelectedText(selection?.toString());

  if (!text || selectionIsInsideComposer(selection) || selectionIsInsideAskUi(selection)) {
    selectedAskText = '';
    selectedAskRange = null;
    hideAskSelectionButton();
    return;
  }

  const rect = getSelectionRect(selection);
  if (!rect) {
    selectedAskText = '';
    selectedAskRange = null;
    hideAskSelectionButton();
    return;
  }

  selectedAskText = text.slice(0, ASK_CONTEXT_MAX_CHARS);
  selectedAskRange = selection.getRangeAt(0).cloneRange();

  const button = getOrCreateAskSelectionButton();
  button.style.display = 'inline-flex';

  const buttonWidth = button.offsetWidth || 146;
  const left = Math.min(
    Math.max(8, rect.left + (rect.width / 2) - (buttonWidth / 2)),
    window.innerWidth - buttonWidth - 8
  );
  const top = Math.max(8, rect.top - 52);

  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
}

function getComposerElement() {
  const active = document.activeElement;
  if (active?.matches?.(TEXT_AREA_SELECTOR)) return active;

  const composers = [...document.querySelectorAll(TEXT_AREA_SELECTOR)]
    .filter(isVisibleElement)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);

  return composers[0] || null;
}

function getComposerContextHost(composer) {
  if (!composer) return null;

  const host = composer.closest('.input-area-container, rich-textarea, form, [data-test-id*="input"], [class*="input"]');
  if (host && host !== composer) return host;

  return composer.parentElement;
}

function removeAskContext() {
  activeAskContextText = '';
  selectedAskRange = null;
  clearAskContextHighlight();
  document.getElementById(ASK_CONTEXT_BAR_ID)?.remove();
}

function renderAskContextBar() {
  ensureAskContextStyles();

  const composer = getComposerElement();
  if (!composer || !activeAskContextText) return;

  const host = getComposerContextHost(composer);
  if (!host) return;

  let bar = document.getElementById(ASK_CONTEXT_BAR_ID);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = ASK_CONTEXT_BAR_ID;
    bar.innerHTML = `
      <button class="gemini-counter-context-close" type="button" aria-label="Remove selected context">&times;</button>
      <span class="gemini-counter-context-text"></span>
      <span class="gemini-counter-context-icon" aria-hidden="true">↩</span>
    `;
    const closeButton = bar.querySelector('.gemini-counter-context-close');
    const closeAskContext = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      removeAskContext();
      getComposerElement()?.focus({ preventScroll: true });
    };
    closeButton.addEventListener('pointerdown', closeAskContext, true);
    closeButton.addEventListener('mousedown', closeAskContext, true);
    closeButton.addEventListener('click', closeAskContext, true);
  }

  bar.querySelector('.gemini-counter-context-text').textContent = `"${activeAskContextText}"`;

  if (bar.parentElement !== host) {
    host.insertBefore(bar, host.firstChild);
  }
}

function applyAskContext(text) {
  const normalizedText = normalizeSelectedText(text).slice(0, ASK_CONTEXT_MAX_CHARS);
  if (!normalizedText) return;

  activeAskContextText = normalizedText;
  markAskContextRange(selectedAskRange);
  hideAskSelectionButton();
  renderAskContextBar();

  const composer = getComposerElement();
  if (composer) composer.focus({ preventScroll: true });
}

function createTextFragment(text) {
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createElement('br'));
    fragment.appendChild(document.createTextNode(line));
  });

  return fragment;
}

function setComposerText(composer, text) {
  composer.replaceChildren(createTextFragment(text));
  composer.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: text,
  }));
}

function prependAskContextToComposer() {
  if (!activeAskContextText) return false;

  const composer = getComposerElement();
  if (!composer) return false;

  const currentText = (composer.innerText || composer.textContent || '').trim();
  const quotedContext = `Use this selected text as context:\n"${activeAskContextText}"`;
  const nextText = currentText
    ? `${quotedContext}\n\n${currentText}`
    : quotedContext;

  setComposerText(composer, nextText);
  removeAskContext();
  composer.focus({ preventScroll: true });
  return true;
}

let lastKeyboardCycleIndex = -1;

function getComposerFocusState() {
  const active = document.activeElement;
  if (!active || !active.matches(TEXT_AREA_SELECTOR)) return null;

  const selection = window.getSelection();
  let range = null;

  if (selection?.rangeCount) {
    const currentRange = selection.getRangeAt(0);
    if (active.contains(currentRange.startContainer) && active.contains(currentRange.endContainer)) {
      range = currentRange.cloneRange();
    }
  }

  return { element: active, range };
}

function restoreComposerFocus(focusState) {
  if (!focusState) return;

  const composer = document.contains(focusState.element)
    ? focusState.element
    : document.querySelector(TEXT_AREA_SELECTOR);

  if (!composer) return;

  composer.focus({ preventScroll: true });

  if (!focusState.range) return;

  try {
    if (!document.contains(focusState.range.startContainer) || !document.contains(focusState.range.endContainer)) {
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(focusState.range);
  } catch (error) {
    // Gemini can replace the composer between model-switch focus restore attempts.
  }
}

function scheduleComposerFocusRestore(focusState) {
  if (!focusState) return;

  [0, 100, 250].forEach((delay) => {
    setTimeout(() => restoreComposerFocus(focusState), delay);
  });
}

function getVisibleModelOptions(dropdown) {
  const modelRows = getModelOptionsFromContainer(dropdown, { modelRowsOnly: true });
  return modelRows.length > 0 ? modelRows : getModelOptionsFromContainer(dropdown);
}

function hasSelectedState(element) {
  const stateAttributes = ['aria-selected', 'aria-checked', 'aria-current', 'data-selected'];
  if (stateAttributes.some(attribute => element.getAttribute(attribute) === 'true')) return true;

  return [...element.classList].some((className) => (
    /selected|checked/i.test(className)
  ));
}

function hasVisibleSelectionMarker(button) {
  const candidates = button.querySelectorAll(
    '[aria-selected="true"], [aria-checked="true"], [aria-current="true"], [data-selected="true"], .selected, .checked, mat-icon[data-mat-icon-name="check"], mat-icon[fonticon="check"]'
  );

  return [...candidates].some((candidate) => (
    isVisibleElement(candidate) && candidate.id !== BADGE_ID && !candidate.classList?.contains('gemini-counter-dropdown-badge')
  ));
}

function getCurrentModelOptionIndex(buttons) {
  const rawModel = normalizeModelOptionText(getRawModelName());
  if (!rawModel) return -1;

  return buttons.findIndex((button) => (
    normalizeModelOptionText(getModelOptionText(button)) === rawModel
  ));
}

function getSelectedModelOptionIndex(buttons) {
  const stateIndex = buttons.findIndex(button => hasSelectedState(button));
  if (stateIndex !== -1) return stateIndex;

  const markerIndex = buttons.findIndex(button => hasVisibleSelectionMarker(button));
  if (markerIndex !== -1) return markerIndex;

  const currentModelIndex = getCurrentModelOptionIndex(buttons);
  if (currentModelIndex !== -1) return currentModelIndex;

  return buttons[lastKeyboardCycleIndex] ? lastKeyboardCycleIndex : -1;
}

function dispatchUserLikeMouseEvent(element, type, coords) {
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: coords.x,
    clientY: coords.y,
  };

  const event = type.startsWith('pointer') && typeof PointerEvent === 'function'
    ? new PointerEvent(type, {
      ...eventOptions,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: type === 'pointerdown' ? 1 : 0,
    })
    : new MouseEvent(type.replace('pointer', 'mouse'), {
      ...eventOptions,
      button: 0,
      buttons: type.endsWith('down') ? 1 : 0,
    });

  element.dispatchEvent(event);
}

function activateElement(element) {
  if (!element) return false;

  const target = element.querySelector?.('gem-menu-item-content, .label-container, span.label') || element;
  const rect = target.getBoundingClientRect();
  const coords = {
    x: rect.left + Math.max(1, rect.width / 2),
    y: rect.top + Math.max(1, rect.height / 2),
  };

  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  target.focus?.({ preventScroll: true });

  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
    dispatchUserLikeMouseEvent(target, type, coords);
  });

  if (target !== element) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
      dispatchUserLikeMouseEvent(element, type, coords);
    });
  }

  return true;
}

function clickNextModelOption(focusState) {
  const dropdown = findModelDropdown();
  if (!dropdown) return false;

  const buttons = getVisibleModelOptions(dropdown);
  if (buttons.length < 2) return false;

  const selectedIndex = getSelectedModelOptionIndex(buttons);
  const nextIndex = ((selectedIndex === -1 ? 0 : selectedIndex) + 1) % buttons.length;
  lastKeyboardCycleIndex = nextIndex;

  activateElement(buttons[nextIndex]);
  scheduleComposerFocusRestore(focusState);
  return true;
}

function cycleModelByOrder(focusState) {
  if (clickNextModelOption(focusState)) return;

  const pill = getModelPill();
  if (!pill) {
    return;
  }

  activateElement(pill);

  let attempts = 0;
  const tryCycleModel = () => {
    attempts += 1;
    if (clickNextModelOption(focusState)) return;

    if (attempts < 20) {
      setTimeout(tryCycleModel, 75);
      return;
    }

  };

  setTimeout(tryCycleModel, 75);
}

function clickNextThinkingLevelOption(focusState) {
  const optionsMenu = findThinkingLevelOptionsMenu();
  if (!optionsMenu) return false;

  const selectedIndex = getSelectedModelOptionIndex(optionsMenu.options);
  const nextIndex = ((selectedIndex === -1 ? 0 : selectedIndex) + 1) % optionsMenu.options.length;

  activateElement(optionsMenu.options[nextIndex]);
  scheduleComposerFocusRestore(focusState);
  return true;
}

function cycleThinkingLevel(focusState) {
  if (clickNextThinkingLevelOption(focusState)) return;

  const trigger = findThinkingLevelTrigger();
  if (!trigger) {
    const pill = getModelPill();
    if (!pill) return;
    activateElement(pill);
  } else {
    activateElement(trigger);
  }

  let attempts = 0;
  const tryCycleThinkingLevel = () => {
    attempts += 1;

    if (!findThinkingLevelOptionsMenu()) {
      const retryTrigger = findThinkingLevelTrigger();
      if (retryTrigger) activateElement(retryTrigger);
    }

    if (clickNextThinkingLevelOption(focusState)) return;

    if (attempts < 20) {
      setTimeout(tryCycleThinkingLevel, 75);
    }
  };

  setTimeout(tryCycleThinkingLevel, 75);
}

const DOUBLE_CONTROL_MAX_GAP_MS = 350;
const CONTROL_TAP_MAX_HOLD_MS = 120;
const CONTROL_CHORD_GRACE_MS = 120;
let lastControlKeyTapAt = 0;
let controlKeyDownAt = 0;
let isStandaloneControlTap = false;
let pendingControlTapTimer = null;

function isPlainControlKey(event) {
  return event.key === 'Control'
    && !event.repeat
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey;
}

function resetControlTapState() {
  clearTimeout(pendingControlTapTimer);
  pendingControlTapTimer = null;
  lastControlKeyTapAt = 0;
  controlKeyDownAt = 0;
  isStandaloneControlTap = false;
}

function cancelPendingControlTap() {
  clearTimeout(pendingControlTapTimer);
  pendingControlTapTimer = null;
}

function scheduleDoubleControlAction(focusState) {
  cancelPendingControlTap();
  pendingControlTapTimer = setTimeout(() => {
    pendingControlTapTimer = null;
    resetControlTapState();
    cycleThinkingLevel(focusState);
  }, CONTROL_CHORD_GRACE_MS);
}

document.addEventListener('click', (event) => {
  const sendBtn = event.target.closest(SEND_BUTTON_SELECTOR);
  if (sendBtn && !sendBtn.classList.contains('stop') && !sendBtn.disabled) {
    prependAskContextToComposer();

    if (hasMessageContent()) {
      incrementCount();
    }
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (isPlainControlKey(event)) {
    cancelPendingControlTap();
    controlKeyDownAt = Date.now();
    isStandaloneControlTap = true;
    return;
  }

  if (event.ctrlKey || lastControlKeyTapAt || isStandaloneControlTap || pendingControlTapTimer) {
    resetControlTapState();
  }

  if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const focusState = getComposerFocusState();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cycleModelByOrder(focusState);
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    const active = document.activeElement;
    if (active && active.matches(TEXT_AREA_SELECTOR)) {
      prependAskContextToComposer();

      if (hasMessageContent()) {
        incrementCount();
      }
    }
  }
}, true);

let askSelectionUpdateTimer = null;

function scheduleAskSelectionUpdate() {
  clearTimeout(askSelectionUpdateTimer);
  askSelectionUpdateTimer = setTimeout(() => {
    updateAskSelectionButton();
  }, 40);
}

document.addEventListener('selectionchange', scheduleAskSelectionUpdate);
document.addEventListener('mouseup', scheduleAskSelectionUpdate, true);
document.addEventListener('keyup', (event) => {
  if (event.key === 'Control') {
    const now = Date.now();
    const controlHoldMs = controlKeyDownAt ? now - controlKeyDownAt : Infinity;
    const isCleanTap = isStandaloneControlTap
      && controlHoldMs <= CONTROL_TAP_MAX_HOLD_MS
      && !event.shiftKey
      && !event.altKey
      && !event.metaKey;

    if (!isCleanTap) {
      resetControlTapState();
    } else if (now - lastControlKeyTapAt <= DOUBLE_CONTROL_MAX_GAP_MS) {
      const focusState = getComposerFocusState();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      scheduleDoubleControlAction(focusState);
      return;
    } else {
      lastControlKeyTapAt = now;
      controlKeyDownAt = 0;
      isStandaloneControlTap = false;
    }

  } else if (lastControlKeyTapAt || isStandaloneControlTap || pendingControlTapTimer) {
    resetControlTapState();
  }

  if (event.key.startsWith('Arrow') || event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta') {
    scheduleAskSelectionUpdate();
  }
}, true);
window.addEventListener('blur', resetControlTapState);

window.addEventListener('scroll', hideAskSelectionButton, true);

// ─── MutationObserver: watch the model pill for text changes ─────────────────

let pillObserver = null;
let bodyObserver = null;
let lastSeenRawModel = '';

function watchPillForChanges() {
  const pill = getModelPill();
  if (!pill) return false;

  // If we already have a pill observer, we're good
  if (pillObserver) return true;

  // Watch the pill element specifically for text changes (model switch)
  pillObserver = new MutationObserver(() => {
    const rawModel = getRawModelName();
    if (rawModel && rawModel !== lastSeenRawModel) {
      lastSeenRawModel = rawModel;
      updateBadge();
    }
  });

  pillObserver.observe(pill, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Set initial model name
  lastSeenRawModel = getRawModelName() || '';
  return true;
}

function startObserver() {
  startNeonMathThemeObserver();
  scheduleResponseFolding();

  // Try to attach pill-specific observer
  if (watchPillForChanges()) {
    updateBadge();
  }

  // Body observer: wait for the pill to appear, handle re-renders & dropdown
  bodyObserver = new MutationObserver((mutations) => {
    const pill = getModelPill();
    const badge = document.getElementById(BADGE_ID);

    // If pill exists but we don't have a pill observer yet, attach one
    if (pill && !pillObserver) {
      watchPillForChanges();
      updateBadge();
    }

    // If pill exists but badge was removed (Angular re-render), recreate badge
    if (pill && !badge) {
      if (pillObserver) {
        pillObserver.disconnect();
        pillObserver = null;
      }
      watchPillForChanges();
      updateBadge();
    }

    // Check if model selector dropdown just appeared
    const dropdown = findModelDropdown();
    if (dropdown && !dropdown.dataset.geminiCounterInjected) {
      // Delay to let Angular finish rendering the menu items
      setTimeout(() => injectDropdownBadges(), 100);
    }

    if (activeAskContextText && !document.getElementById(ASK_CONTEXT_BAR_ID)) {
      renderAskContextBar();
    }

    if (mutations.some((mutation) => (
      mutation.type === 'childList'
      || mutation.type === 'characterData'
      || [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
    ))) {
      scheduleResponseFolding();
    }

    syncAutoDirFeature();
    if (mutations.some((mutation) => (
      mutation.type === 'attributes'
      || [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
    ))) {
      scheduleNeonMathSync();
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'theme'],
  });
}

// ─── Dropdown Badge Injection ────────────────────────────────────────────────
// Shows usage count next to each model option in the model selector dropdown.

function ensureDropdownStyles() {
  if (document.getElementById('gemini-counter-dropdown-styles')) return;
  const style = document.createElement('style');
  style.id = 'gemini-counter-dropdown-styles';
  style.textContent = `
    .gemini-counter-dropdown-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      min-width: 20px;
      white-space: nowrap;
      pointer-events: none;
      transition: background 0.2s;
    }
    .gemini-counter-dropdown-badge.safe {
      background: rgba(26, 115, 232, 0.15);
      color: #8ab4f8;
    }
    .gemini-counter-dropdown-badge.warning {
      background: rgba(249, 171, 0, 0.15);
      color: #fdd663;
    }
    .gemini-counter-dropdown-badge.danger {
      background: rgba(217, 48, 37, 0.15);
      color: #f28b82;
    }
  `;
  document.head.appendChild(style);
}

// Extract raw text from a title span, ignoring any injected badge elements
function getTitleText(titleSpan) {
  return getElementLabelText(titleSpan);
}

// Look up count for a model, trying both the resolved alias and the raw name
function getCountForModel(rawName, counts) {
  const resolvedName = resolveModelName(rawName);

  // Try resolved name first (e.g., "Fast")
  if (counts[resolvedName] !== undefined) {
    return { name: resolvedName, data: normalizeModelData(counts[resolvedName]) };
  }

  // Fallback: try the raw localized name for legacy data
  if (rawName !== resolvedName && counts[rawName] !== undefined) {
    return { name: rawName, data: normalizeModelData(counts[rawName]) };
  }

  // No data found
  return { name: resolvedName, data: { count: 0, firstUsage: null } };
}

function injectDropdownBadges() {
  const dropdown = findModelDropdown();
  if (!dropdown) return;

  // Find all model option buttons in the dropdown
  const buttons = getVisibleModelOptions(dropdown);
  if (buttons.length === 0) {
    // Buttons not rendered yet — don't set the flag, so we retry on next mutation
    return;
  }

  // Mark as injected only AFTER we confirmed buttons exist
  dropdown.dataset.geminiCounterInjected = 'true';

  ensureDropdownStyles();

  storageGet(['modelCounts', 'modelSettings'], (result) => {
    const counts = result.modelCounts || {};
    const settings = result.modelSettings || {};

    buttons.forEach((button, index) => {
      const titleSpan = getModelOptionLabelElement(button);
      if (!titleSpan) return;

      // Remove any previously injected badge first
      const existingBadge = titleSpan.querySelector('.gemini-counter-dropdown-badge');
      if (existingBadge) existingBadge.remove();

      // Read only the raw text (ignoring our badge elements)
      const rawName = getTitleText(titleSpan);
      if (!rawName) return;

      const inferredModel = resolveModelNameFromOption(button, index);
      rememberModelLabelAlias(rawName, inferredModel);

      const legacyLookup = getCountForModel(rawName, counts);
      const modelKey = counts[inferredModel] !== undefined ? inferredModel : legacyLookup.name;
      const modelData = counts[inferredModel] !== undefined
        ? normalizeModelData(counts[inferredModel])
        : legacyLookup.data;
      let count = modelData.count;
      const modelSetting = settings[modelKey] || {};
      const limit = modelSetting.limit || DEFAULT_LIMIT;

      // Lazy evaluation: conceptually reset the count if time has elapsed
      if (modelData.firstUsage) {
        const resetPeriodMs = (modelSetting.resetHours || DEFAULT_RESET_HOURS) * 60 * 60 * 1000;
        if (Date.now() - modelData.firstUsage > resetPeriodMs) {
          count = 0; // conceptually reset for UI
        }
      }

      const percentage = (count / limit) * 100;

      // Determine color class
      let colorClass = 'safe';
      if (percentage >= 100) colorClass = 'danger';
      else if (percentage >= 80) colorClass = 'warning';

      // Create badge element
      const badge = document.createElement('span');
      badge.className = `gemini-counter-dropdown-badge ${colorClass}`;
      badge.textContent = `${count}/${limit}`;

      titleSpan.appendChild(badge);
    });
  });
}

startObserver();
loadModelLabelAliases(updateBadge);

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

// ─── Migrate legacy data keys ────────────────────────────────────────────────
function migrateStoredModelKey(rawKey, resolved) {
  if (!rawKey || !resolved || rawKey === resolved) return;

  storageGet(['modelCounts', 'modelSettings', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory'], (result) => {
    const counts = result.modelCounts || {};
    const settings = result.modelSettings || {};
    const totals = result.modelTotals || {};
    const history = result.modelUsageHistory || {};
    const hourlyHistory = result.modelUsageHourlyHistory || {};
    let changed = false;

    if (counts[rawKey] !== undefined) {
      counts[resolved] = counts[resolved]
        ? mergeModelCountData(counts[resolved], counts[rawKey])
        : normalizeModelData(counts[rawKey]);
      delete counts[rawKey];
      changed = true;
    }

    if (settings[rawKey] !== undefined) {
      settings[resolved] = { ...(settings[rawKey] || {}), ...(settings[resolved] || {}) };
      delete settings[rawKey];
      changed = true;
    }

    if (totals[rawKey] !== undefined) {
      totals[resolved] = (totals[resolved] || 0) + (typeof totals[rawKey] === 'number' ? totals[rawKey] : 0);
      delete totals[rawKey];
      changed = true;
    }

    for (const dateData of Object.values(history)) {
      if (!dateData || typeof dateData !== 'object' || dateData[rawKey] === undefined) continue;
      dateData[resolved] = (dateData[resolved] || 0) + (typeof dateData[rawKey] === 'number' ? dateData[rawKey] : 0);
      delete dateData[rawKey];
      changed = true;
    }

    for (const dateData of Object.values(hourlyHistory)) {
      if (!dateData || typeof dateData !== 'object') continue;

      for (const hourData of Object.values(dateData)) {
        if (!hourData || typeof hourData !== 'object' || hourData[rawKey] === undefined) continue;
        hourData[resolved] = (hourData[resolved] || 0) + (typeof hourData[rawKey] === 'number' ? hourData[rawKey] : 0);
        delete hourData[rawKey];
        changed = true;
      }
    }

    if (!changed) return;

    storageSet({
      modelCounts: counts,
      modelSettings: settings,
      modelTotals: totals,
      modelUsageHistory: history,
      modelUsageHourlyHistory: hourlyHistory,
    });
  });
}

// If counts were stored under raw localized names, copy them to resolved names.
storageGet(['modelCounts', 'modelSettings', 'modelTotals', 'modelUsageHistory', 'modelUsageHourlyHistory', MODEL_LABEL_ALIASES_STORAGE_KEY], (result) => {
  learnedModelLabelAliases = result[MODEL_LABEL_ALIASES_STORAGE_KEY] || learnedModelLabelAliases;
  const counts = result.modelCounts || {};
  const settings = result.modelSettings || {};
  const totals = result.modelTotals || {};
  const history = result.modelUsageHistory || {};
  const hourlyHistory = result.modelUsageHourlyHistory || {};
  let changed = false;

  for (const [rawKey, data] of Object.entries(counts)) {
    const resolved = resolveModelName(rawKey);
    if (resolved !== rawKey) {
      counts[resolved] = counts[resolved]
        ? mergeModelCountData(counts[resolved], data)
        : normalizeModelData(data);
      delete counts[rawKey]; // Delete old key to avoid duplicate model cards in popup
      changed = true;
    }
  }

  for (const [rawKey, data] of Object.entries(settings)) {
    const resolved = resolveModelName(rawKey);
    if (resolved !== rawKey) {
      settings[resolved] = { ...(data || {}), ...(settings[resolved] || {}) };
      delete settings[rawKey];
      changed = true;
    }
  }

  for (const [rawKey, count] of Object.entries(totals)) {
    const resolved = resolveModelName(rawKey);
    if (resolved !== rawKey) {
      totals[resolved] = (totals[resolved] || 0) + (typeof count === 'number' ? count : 0);
      delete totals[rawKey];
      changed = true;
    }
  }

  for (const dateData of Object.values(history)) {
    if (!dateData || typeof dateData !== 'object') continue;

    for (const [rawKey, count] of Object.entries(dateData)) {
      const resolved = resolveModelName(rawKey);
      if (resolved !== rawKey) {
        dateData[resolved] = (dateData[resolved] || 0) + (typeof count === 'number' ? count : 0);
        delete dateData[rawKey];
        changed = true;
      }
    }
  }

  for (const dateData of Object.values(hourlyHistory)) {
    if (!dateData || typeof dateData !== 'object') continue;

    for (const hourData of Object.values(dateData)) {
      if (!hourData || typeof hourData !== 'object') continue;

      for (const [rawKey, count] of Object.entries(hourData)) {
        const resolved = resolveModelName(rawKey);
        if (resolved !== rawKey) {
          hourData[resolved] = (hourData[resolved] || 0) + (typeof count === 'number' ? count : 0);
          delete hourData[rawKey];
          changed = true;
        }
      }
    }
  }

  if (changed) {
    storageSet({
      modelCounts: counts,
      modelSettings: settings,
      modelTotals: totals,
      modelUsageHistory: history,
      modelUsageHourlyHistory: hourlyHistory,
    });
  }
});

loadAutoDirSetting();
loadNeonMathSetting();
