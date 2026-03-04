const STORAGE_KEY = 'dark-mode';
const PRESETS_STORAGE_KEY = 'banding-presets';
const PRESETS_JSON_PATH = 'presets.json';

let _presets = [];
let _presetsReady = null;

function initPresetsStore() {
  _presetsReady = fetch(PRESETS_JSON_PATH)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      _presets = Array.isArray(data) ? data : [];
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(_presets));
    })
    .catch(() => {
      try { _presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || []; } catch { _presets = []; }
    });
  return _presetsReady;
}

function exportPresetsJSON() {
  const json = JSON.stringify(_presets, null, 2) + '\n';
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'presets.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

const EASING_FUNCTIONS = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInQuint: t => t * t * t * t * t,
  easeOutQuint: t => 1 - Math.pow(1 - t, 5),
  easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
  easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
};

const BAND_TRACK_WIDTH = 150;

function findT(easingFn, targetProgress) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (easingFn(mid) < targetProgress) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const bandAnimation = (() => {
  let frameId = null;
  let originTime = 0;

  function tick(timestamp) {
    const fill = document.getElementById('progress-fill');
    const bands = fill.querySelectorAll('.band');
    if (bands.length === 0) { frameId = requestAnimationFrame(tick); return; }

    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const rawSW = parseFloat(cs.getPropertyValue('--band-start-width'));
    const rawEW = parseFloat(cs.getPropertyValue('--band-end-width'));
    const rawSO = parseFloat(cs.getPropertyValue('--band-start-opacity'));
    const rawEO = parseFloat(cs.getPropertyValue('--band-end-opacity'));
    const startWidth = isNaN(rawSW) ? 14 : rawSW;
    const endWidth = isNaN(rawEW) ? 14 : rawEW;
    const startOpacity = isNaN(rawSO) ? 0.6 : rawSO;
    const endOpacity = isNaN(rawEO) ? 0.6 : rawEO;
    const durationMs = parseFloat(document.getElementById('animation-speed').value) * 1000;
    const curveName = document.getElementById('animation-curve').value;
    const easingFn = EASING_FUNCTIONS[curveName] || EASING_FUNCTIONS.easeInOutCubic;

    const totalTravel = BAND_TRACK_WIDTH + startWidth;

    // Clip to the range where the band has at least ~2px visible on-track,
    // so the user's duration maps only to the visible crossing — no dead time
    // spent off-screen at either end of an extreme easeIn/easeOut curve.
    const entryProgress = 2 / totalTravel;
    const exitProgress = 1 - 2 / totalTravel;
    const tEntry = findT(easingFn, entryProgress);
    const tExit = findT(easingFn, exitProgress);
    const tRange = Math.max(0.01, tExit - tEntry);

    const globalElapsed = timestamp - originTime;

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      const offset = parseFloat(band.dataset.timeOffset || '0') * 1000;
      const bandElapsed = globalElapsed + offset;
      const cycleFraction = ((bandElapsed % durationMs) + durationMs) % durationMs / durationMs;

      const t = tEntry + cycleFraction * tRange;
      const progress = easingFn(t);

      const left = -startWidth + progress * totalTravel;
      const width = startWidth + progress * (endWidth - startWidth);
      const opacity = startOpacity + progress * (endOpacity - startOpacity);

      band.style.left = `${left}px`;
      band.style.width = `${width}px`;
      band.style.opacity = opacity;
    }

    frameId = requestAnimationFrame(tick);
  }

  function start() {
    if (frameId) cancelAnimationFrame(frameId);
    originTime = performance.now();
    frameId = requestAnimationFrame(tick);
  }

  function stop() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  return { start, stop };
})();

function initLooped() {
  const toggle = document.getElementById('looped-toggle');
  const progressFill = document.getElementById('progress-fill');
  const paramRow = toggle.closest('.param-row');
  const delayInput = document.getElementById('band-delay');
  const delayValue = document.getElementById('delay-value');
  const speedInput = document.getElementById('animation-speed');

  const BAND_WIDTH = 14;
  const TRACK_WIDTH = 150;
  const TOTAL_TRAVEL = TRACK_WIDTH + 40;

  function getDuration() { return parseFloat(speedInput.value); }
  function isLooped() { return toggle.getAttribute('aria-pressed') === 'true'; }

  function getMinDelay() {
    return Math.ceil((BAND_WIDTH / TOTAL_TRAVEL) * getDuration() * 10) / 10;
  }

  function getDelay() {
    return Math.max(parseFloat(delayInput.value), getMinDelay());
  }

  function updateSliderMin() {
    const min = getMinDelay();
    delayInput.min = min;
    if (parseFloat(delayInput.value) < min) delayInput.value = min;
  }

  function rebuildBands() {
    const extras = progressFill.querySelectorAll('.band-extra');
    extras.forEach(el => el.remove());

    if (!isLooped()) return;

    const duration = getDuration();
    const desiredDelay = getDelay();
    const totalBands = Math.max(2, Math.round(duration / desiredDelay));
    const actualDelay = duration / totalBands;

    for (let i = 1; i < totalBands; i++) {
      const bandEl = document.createElement('div');
      bandEl.className = 'band band-extra';
      bandEl.dataset.timeOffset = String(actualDelay * i);
      progressFill.appendChild(bandEl);
    }
  }

  function updateDelay() {
    updateSliderMin();
    delayValue.textContent = `${getDelay()}s`;
    if (isLooped()) rebuildBands();
  }

  function handleToggle() {
    const wasOn = isLooped();
    toggle.setAttribute('aria-pressed', !wasOn);
    progressFill.classList.toggle('multiple-bands', !wasOn);
    document.body.classList.toggle('looped-enabled', !wasOn);
    rebuildBands();
  }

  toggle.addEventListener('click', handleToggle);
  paramRow.addEventListener('click', (e) => {
    if (!toggle.contains(e.target)) handleToggle();
  });
  delayInput.addEventListener('input', updateDelay);
  speedInput.addEventListener('input', () => { updateSliderMin(); if (isLooped()) rebuildBands(); });
  delayValue.textContent = `${getDelay()}s`;
}

function initDarkMode() {
  const toggle = document.getElementById('dark-mode-toggle');
  const paramRow = toggle.closest('.param-row');
  const saved = localStorage.getItem(STORAGE_KEY) === 'true';

  document.body.classList.toggle('dark-mode', saved);
  toggle.setAttribute('aria-pressed', saved);

  function handleToggle() {
    const isDark = document.body.classList.toggle('dark-mode');
    toggle.setAttribute('aria-pressed', isDark);
    localStorage.setItem(STORAGE_KEY, isDark);
  }

  toggle.addEventListener('click', handleToggle);
  paramRow.addEventListener('click', (e) => {
    if (!toggle.contains(e.target)) handleToggle();
  });
}


function initBanding() {
  const bandShapeSelect = document.getElementById('band-shape');
  const colorModeSelect = document.getElementById('color-mode');
  const bandColorInput = document.getElementById('band-color');
  const bandStartOpacityInput = document.getElementById('band-start-opacity');
  const bandStartOpacityValue = document.getElementById('band-start-opacity-value');
  const bandEndOpacityInput = document.getElementById('band-end-opacity');
  const bandEndOpacityValue = document.getElementById('band-end-opacity-value');
  const bandStartWidthInput = document.getElementById('band-start-width');
  const bandEndWidthInput = document.getElementById('band-end-width');
  const speedInput = document.getElementById('animation-speed');
  const speedValue = document.getElementById('speed-value');
  const curveSelect = document.getElementById('animation-curve');
  const stopsList = document.getElementById('stops-list');
  const addStopBtn = document.getElementById('add-stop-btn');
  const presetSelect = document.getElementById('preset-select');
  const presetSaveBtn = document.getElementById('preset-save');
  const presetRenameBtn = document.getElementById('preset-rename');
  const presetUpdateBtn = document.getElementById('preset-update');
  const presetDeleteBtn = document.getElementById('preset-delete');
  const presetNameModal = document.getElementById('preset-name-modal');
  const presetNameInput = document.getElementById('preset-name-input');
  const presetNameConfirm = document.getElementById('preset-name-confirm');
  const presetNameCancel = document.getElementById('preset-name-cancel');
  const loopedToggle = document.getElementById('looped-toggle');
  const bandDelayInput = document.getElementById('band-delay');
  const root = document.documentElement;

  let stops = [
    { color: '#ffffff', opacity: 100, position: 0 },
    { color: '#ffffff', opacity: 100, position: 100 },
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function parseHex(value) {
    let hex = String(value).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    } else if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return null;
    }
    return '#' + hex.toLowerCase();
  }

  function isGradient() {
    return colorModeSelect.value === 'gradient';
  }

  function applyBackground() {
    if (isGradient()) {
      const sorted = [...stops].sort((a, b) => a.position - b.position);
      const parts = sorted.map(s => {
        const [r, g, b] = hexToRgb(s.color);
        return `rgba(${r},${g},${b},${s.opacity / 100}) ${s.position}%`;
      });
      root.style.setProperty('--band-background', `linear-gradient(to right, ${parts.join(', ')})`);
    } else {
      root.style.setProperty('--band-background', bandColorInput.value);
    }
  }

  function sortStopsByPosition() {
    stops.sort((a, b) => a.position - b.position);
  }

  function renderStops() {
    sortStopsByPosition();
    stopsList.innerHTML = '';
    const canRemove = stops.length > 2;

    stops.forEach((stop, i) => {
      const row = document.createElement('div');
      row.className = 'stop-row';
      row.dataset.index = i;

      const spacer = document.createElement('span');
      spacer.className = 'stop-drag-handle';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.textContent = '';

      const colorIn = document.createElement('input');
      colorIn.type = 'color';
      colorIn.className = 'color-input stop-color';
      colorIn.value = stop.color;
      colorIn.addEventListener('input', () => {
        stop.color = colorIn.value;
        hexIn.value = colorIn.value;
        applyBackground();
      });

      const hexIn = document.createElement('input');
      hexIn.type = 'text';
      hexIn.className = 'stop-input stop-hex-input';
      hexIn.value = stop.color;
      hexIn.placeholder = '#ffffff';
      hexIn.setAttribute('aria-label', 'Color hex value');
      hexIn.addEventListener('input', () => {
        const parsed = parseHex(hexIn.value);
        if (parsed) {
          stop.color = parsed;
          colorIn.value = parsed;
          hexIn.value = parsed;
          applyBackground();
        }
      });
      hexIn.addEventListener('blur', () => {
        const parsed = parseHex(hexIn.value);
        hexIn.value = parsed ? parsed : stop.color;
      });

      const opacityIn = document.createElement('input');
      opacityIn.type = 'number';
      opacityIn.className = 'stop-input stop-opacity-input';
      opacityIn.min = 0;
      opacityIn.max = 100;
      opacityIn.step = 5;
      opacityIn.value = stop.opacity;
      opacityIn.addEventListener('input', () => {
        stop.opacity = Math.max(0, Math.min(100, parseInt(opacityIn.value) || 0));
        applyBackground();
      });

      const opacityUnit = document.createElement('span');
      opacityUnit.className = 'stop-unit';
      opacityUnit.textContent = '%';

      const posIn = document.createElement('input');
      posIn.type = 'number';
      posIn.className = 'stop-input stop-position-input';
      posIn.min = 0;
      posIn.max = 100;
      posIn.step = 1;
      posIn.value = stop.position;
      posIn.addEventListener('input', () => {
        stop.position = Math.max(0, Math.min(100, parseInt(posIn.value) || 0));
        applyBackground();
      });
      const commitPosition = () => {
        sortStopsByPosition();
        renderStops();
        applyBackground();
      };
      posIn.addEventListener('blur', commitPosition);
      posIn.addEventListener('change', commitPosition);

      const posUnit = document.createElement('span');
      posUnit.className = 'stop-unit';
      posUnit.textContent = '%';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'stop-remove-btn';
      removeBtn.setAttribute('aria-label', 'Remove stop');
      removeBtn.textContent = '\u00d7';
      removeBtn.disabled = !canRemove;
      removeBtn.addEventListener('click', () => {
        if (stops.length <= 2) return;
        stops.splice(i, 1);
        renderStops();
        applyBackground();
      });

      row.append(spacer, colorIn, hexIn, opacityIn, opacityUnit, posIn, posUnit, removeBtn);
      stopsList.appendChild(row);
    });
  }

  function addStop() {
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const last = sorted[sorted.length - 1];
    const secondLast = sorted.length > 1 ? sorted[sorted.length - 2] : last;
    const midPos = Math.round((secondLast.position + last.position) / 2);
    stops.push({ color: last.color, opacity: 100, position: midPos });
    renderStops();
    applyBackground();
  }

  function updateColorMode() {
    document.body.classList.toggle('gradient-mode', isGradient());
    applyBackground();
    if (isGradient()) renderStops();
  }

  function updateBandOpacity() {
    const startValue = parseFloat(bandStartOpacityInput.value);
    const endValue = parseFloat(bandEndOpacityInput.value);
    root.style.setProperty('--band-start-opacity', String(startValue));
    root.style.setProperty('--band-end-opacity', String(endValue));
    bandStartOpacityValue.textContent = `${Math.round(startValue * 100)}%`;
    bandEndOpacityValue.textContent = `${Math.round(endValue * 100)}%`;
  }

  function updateBandWidths() {
    const startWidth = Math.max(1, Math.min(100, parseFloat(bandStartWidthInput.value) || 14));
    const endWidth = Math.max(1, Math.min(100, parseFloat(bandEndWidthInput.value) || 14));
    root.style.setProperty('--band-start-width', String(startWidth));
    root.style.setProperty('--band-end-width', String(endWidth));
  }

  function clampBandWidthInputs() {
    const startWidth = Math.max(1, Math.min(100, parseFloat(bandStartWidthInput.value) || 14));
    const endWidth = Math.max(1, Math.min(100, parseFloat(bandEndWidthInput.value) || 14));
    bandStartWidthInput.value = startWidth;
    bandEndWidthInput.value = endWidth;
    updateBandWidths();
  }

  function updateBandShape() {
    const shape = bandShapeSelect.value;
    if (shape === 'slanted') {
      root.style.setProperty('--band-clip-path', 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)');
      root.style.setProperty('--band-border-radius', '0');
    } else if (shape === 'rounded') {
      root.style.setProperty('--band-clip-path', 'none');
      root.style.setProperty('--band-border-radius', '1px');
    } else {
      root.style.setProperty('--band-clip-path', 'none');
      root.style.setProperty('--band-border-radius', '0');
    }
  }

  function updateSpeed() {
    speedValue.textContent = `${parseFloat(speedInput.value)}s`;
    bandAnimation.start();
  }

  function updateCurve() {
    bandAnimation.start();
  }

  bandShapeSelect.addEventListener('change', updateBandShape);
  bandColorInput.addEventListener('input', applyBackground);
  bandStartOpacityInput.addEventListener('input', updateBandOpacity);
  bandEndOpacityInput.addEventListener('input', updateBandOpacity);
  bandStartWidthInput.addEventListener('input', updateBandWidths);
  bandStartWidthInput.addEventListener('change', clampBandWidthInputs);
  bandEndWidthInput.addEventListener('input', updateBandWidths);
  bandEndWidthInput.addEventListener('change', clampBandWidthInputs);
  speedInput.addEventListener('input', updateSpeed);
  curveSelect.addEventListener('change', updateCurve);
  colorModeSelect.addEventListener('change', updateColorMode);
  addStopBtn.addEventListener('click', addStop);

  function getSettings() {
    return {
      bandShape: bandShapeSelect.value,
      colorMode: colorModeSelect.value,
      bandColor: bandColorInput.value,
      gradientStops: stops.map(s => ({ ...s })),
      bandStartOpacity: parseFloat(bandStartOpacityInput.value),
      bandEndOpacity: parseFloat(bandEndOpacityInput.value),
      bandStartWidth: parseFloat(bandStartWidthInput.value),
      bandEndWidth: parseFloat(bandEndWidthInput.value),
      animationSpeed: parseFloat(speedInput.value),
      animationCurve: curveSelect.value,
      looped: loopedToggle.getAttribute('aria-pressed') === 'true',
      bandDelay: parseFloat(bandDelayInput.value),
    };
  }

  function applySettings(s) {
    bandShapeSelect.value = s.bandShape;
    updateBandShape();

    colorModeSelect.value = s.colorMode;
    bandColorInput.value = s.bandColor;
    if (s.gradientStops) {
      stops.length = 0;
      s.gradientStops.forEach(stop => stops.push({ ...stop }));
    }
    updateColorMode();

    const fallbackOpacity = s.bandOpacity ?? 0.6;
    bandStartOpacityInput.value = s.bandStartOpacity ?? fallbackOpacity;
    bandEndOpacityInput.value = s.bandEndOpacity ?? fallbackOpacity;
    updateBandOpacity();

    bandStartWidthInput.value = s.bandStartWidth ?? 14;
    bandEndWidthInput.value = s.bandEndWidth ?? 14;
    updateBandWidths();

    if (s.animationSpeed !== undefined) {
      speedInput.value = s.animationSpeed;
      updateSpeed();
    }
    if (s.animationCurve !== undefined) {
      curveSelect.value = s.animationCurve;
      updateCurve();
    }

    const isCurrentlyLooped = loopedToggle.getAttribute('aria-pressed') === 'true';
    if (s.looped !== isCurrentlyLooped) {
      loopedToggle.click();
    }

    bandDelayInput.value = s.bandDelay;
    bandDelayInput.dispatchEvent(new Event('input'));
  }

  function loadPresets() {
    return _presets;
  }

  function persistPresets(presets) {
    _presets = presets;
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  }

  function updatePresetButtons() {
    const hasSelection = presetSelect.value !== '';
    presetRenameBtn.disabled = !hasSelection;
    presetUpdateBtn.disabled = !hasSelection;
    presetDeleteBtn.disabled = !hasSelection;
  }

  function renderPresetDropdown() {
    const selected = presetSelect.value;
    const presets = loadPresets();

    presetSelect.innerHTML = '';
    const customOpt = document.createElement('option');
    customOpt.value = '';
    customOpt.textContent = 'Custom';
    presetSelect.appendChild(customOpt);

    presets.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });

    if (selected && presetSelect.querySelector(`option[value="${selected}"]`)) {
      presetSelect.value = selected;
    } else {
      presetSelect.value = '';
    }
    updatePresetButtons();
  }

  presetSelect.addEventListener('change', () => {
    updatePresetButtons();
    if (presetSelect.value === '') return;
    const presets = loadPresets();
    const idx = parseInt(presetSelect.value, 10);
    if (presets[idx]) applySettings(presets[idx].settings);
  });

  let nameModalMode = 'save'; // 'save' | 'rename'
  let renamePresetIndex = -1;

  function showNameModal(mode = 'save', currentName = '') {
    nameModalMode = mode;
    presetNameInput.value = currentName;
    presetNameModal.classList.add('visible');
    presetNameInput.focus();
  }

  function hideNameModal() {
    presetNameModal.classList.remove('visible');
    presetNameInput.value = '';
    nameModalMode = 'save';
    renamePresetIndex = -1;
  }

  function confirmNameModal() {
    const name = presetNameInput.value.trim();
    if (!name) return;

    if (nameModalMode === 'rename') {
      const presets = loadPresets();
      if (presets[renamePresetIndex]) {
        presets[renamePresetIndex].name = name;
        persistPresets(presets);
        renderPresetDropdown();
        presetSelect.value = String(renamePresetIndex);
      }
    } else {
      const presets = loadPresets();
      presets.push({ name, settings: getSettings() });
      persistPresets(presets);
      renderPresetDropdown();
      presetSelect.value = String(presets.length - 1);
    }

    hideNameModal();
    updatePresetButtons();
  }

  presetSaveBtn.addEventListener('click', () => showNameModal('save'));
  presetRenameBtn.addEventListener('click', () => {
    if (presetSelect.value === '') return;
    const presets = loadPresets();
    const idx = parseInt(presetSelect.value, 10);
    if (!presets[idx]) return;
    renamePresetIndex = idx;
    showNameModal('rename', presets[idx].name);
  });
  presetNameConfirm.addEventListener('click', confirmNameModal);
  presetNameCancel.addEventListener('click', hideNameModal);
  presetNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmNameModal();
    if (e.key === 'Escape') hideNameModal();
  });

  presetUpdateBtn.addEventListener('click', () => {
    if (presetSelect.value === '') return;
    const presets = loadPresets();
    const idx = parseInt(presetSelect.value, 10);
    if (!presets[idx]) return;
    presets[idx].settings = getSettings();
    persistPresets(presets);
  });

  presetDeleteBtn.addEventListener('click', () => {
    if (presetSelect.value === '') return;
    const presets = loadPresets();
    const idx = parseInt(presetSelect.value, 10);
    if (!presets[idx]) return;
    presets.splice(idx, 1);
    persistPresets(presets);
    presetSelect.value = '';
    renderPresetDropdown();
  });

  updateBandShape();
  updateColorMode();
  updateBandOpacity();
  updateBandWidths();
  updateSpeed();
  updateCurve();
  renderPresetDropdown();
}

function initZoom() {
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomValue = document.getElementById('zoom-value');
  const root = document.documentElement;

  function updateZoom() {
    const value = parseFloat(zoomSlider.value);
    root.style.setProperty('--progress-zoom', String(value));
    zoomValue.textContent = `${value}×`;
  }

  zoomSlider.addEventListener('input', updateZoom);
  updateZoom();
}

const galleryAnimation = (() => {
  let frameId = null;
  let originTime = 0;
  let cards = [];

  function tick(timestamp) {
    const elapsed = timestamp - originTime;

    for (const entry of cards) {
      const { fill, settings: s } = entry;
      const bands = fill.querySelectorAll('.gallery-card-band');
      if (bands.length === 0) continue;

      const startWidth = s.bandStartWidth ?? 14;
      const endWidth = s.bandEndWidth ?? 14;
      const startOpacity = s.bandStartOpacity ?? 0.6;
      const endOpacity = s.bandEndOpacity ?? 0.6;
      const durationMs = (s.animationSpeed ?? 2) * 1000;
      const easingFn = EASING_FUNCTIONS[s.animationCurve] || EASING_FUNCTIONS.easeInOutCubic;

      const totalTravel = BAND_TRACK_WIDTH + startWidth;
      const entryProgress = 2 / totalTravel;
      const exitProgress = 1 - 2 / totalTravel;
      const tEntry = findT(easingFn, entryProgress);
      const tExit = findT(easingFn, exitProgress);
      const tRange = Math.max(0.01, tExit - tEntry);

      for (let i = 0; i < bands.length; i++) {
        const band = bands[i];
        const offset = parseFloat(band.dataset.timeOffset || '0') * 1000;
        const bandElapsed = elapsed + offset;
        const cycleFraction = ((bandElapsed % durationMs) + durationMs) % durationMs / durationMs;

        const t = tEntry + cycleFraction * tRange;
        const progress = easingFn(t);

        const left = -startWidth + progress * totalTravel;
        const width = startWidth + progress * (endWidth - startWidth);
        const opacity = startOpacity + progress * (endOpacity - startOpacity);

        band.style.left = `${left}px`;
        band.style.width = `${width}px`;
        band.style.opacity = opacity;
      }
    }

    frameId = requestAnimationFrame(tick);
  }

  function start(cardEntries) {
    cards = cardEntries;
    if (frameId) cancelAnimationFrame(frameId);
    originTime = performance.now();
    frameId = requestAnimationFrame(tick);
  }

  function stop() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    cards = [];
  }

  return { start, stop };
})();

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = {
    gallery: document.getElementById('panel-gallery'),
    create: document.getElementById('panel-create'),
  };

  function switchTab(tabName) {
    tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    Object.entries(panels).forEach(([name, panel]) => {
      panel.classList.toggle('active', name === tabName);
      panel.hidden = name !== tabName;
    });
    if (tabName === 'gallery') {
      renderGallery();
    } else {
      galleryAnimation.stop();
    }
  }

  tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  renderGallery();
}

function buildGalleryCard(preset, cardEntries) {
  const s = preset.settings;

  const card = document.createElement('div');
  card.className = 'gallery-card';

  const preview = document.createElement('div');
  preview.className = 'gallery-card-preview';

  const bar = document.createElement('div');
  bar.className = 'gallery-card-bar';

  bar.innerHTML = `
    <button type="button" class="icon-btn" aria-hidden="true" tabindex="-1"><img src="icons/search.svg" alt="" width="24" height="24"></button>
    <div class="text-frame"><span class="placeholder">Search</span></div>
    <button type="button" class="icon-btn" aria-hidden="true" tabindex="-1"><img src="icons/mic.svg" alt="" width="24" height="24"></button>
    <div class="divider"><img src="icons/cursor.svg" alt="" width="1" height="20"></div>
    <button type="button" class="icon-btn" aria-hidden="true" tabindex="-1"><img src="icons/ai.svg" alt="" width="24" height="24"></button>
  `;

  const track = document.createElement('div');
  track.className = 'gallery-card-track';

  const fill = document.createElement('div');
  fill.className = 'gallery-card-fill';

  const bandBg = buildBandBackground(s);
  const clipPath = getBandClipPath(s.bandShape);
  const borderRadius = s.bandShape === 'rounded' ? '1px' : '0';
  const duration = s.animationSpeed || 2;
  const delay = s.bandDelay || 0.5;
  const bandCount = s.looped ? Math.max(2, Math.round(duration / delay)) : 1;
  const actualDelay = s.looped ? duration / bandCount : 0;

  for (let i = 0; i < bandCount; i++) {
    const band = document.createElement('div');
    band.className = 'gallery-card-band';
    band.dataset.timeOffset = String(actualDelay * i);
    band.style.background = bandBg;
    band.style.clipPath = clipPath;
    band.style.borderRadius = borderRadius;
    fill.appendChild(band);
  }

  track.appendChild(fill);
  bar.appendChild(track);
  preview.appendChild(bar);

  const info = document.createElement('div');
  info.className = 'gallery-card-info';

  const name = document.createElement('span');
  name.className = 'gallery-card-name';
  name.textContent = preset.name;

  const meta = document.createElement('div');
  meta.className = 'gallery-card-meta';

  const shapeTag = document.createElement('span');
  shapeTag.className = 'gallery-card-tag';
  shapeTag.textContent = s.bandShape;

  const curveTag = document.createElement('span');
  curveTag.className = 'gallery-card-tag';
  curveTag.textContent = `${s.animationSpeed ?? 2}s`;

  meta.append(shapeTag, curveTag);
  info.append(name, meta);
  card.append(preview, info);

  cardEntries.push({ fill, settings: s });
  return card;
}

function renderGallery() {
  const gridLight = document.getElementById('gallery-grid-light');
  const gridDark = document.getElementById('gallery-grid-dark');
  const emptyState = document.getElementById('gallery-empty');
  const sections = document.querySelectorAll('#panel-gallery .gallery-section');
  const presets = _presets;

  galleryAnimation.stop();
  gridLight.innerHTML = '';
  gridDark.innerHTML = '';

  if (presets.length === 0) {
    sections.forEach(s => s.style.display = 'none');
    emptyState.classList.add('visible');
    return;
  }

  sections.forEach(s => s.style.display = '');
  emptyState.classList.remove('visible');
  const cardEntries = [];

  presets.forEach((preset) => {
    gridLight.appendChild(buildGalleryCard(preset, cardEntries));
    gridDark.appendChild(buildGalleryCard(preset, cardEntries));
  });

  galleryAnimation.start(cardEntries);
}

function buildBandBackground(s) {
  if (s.colorMode === 'gradient' && s.gradientStops && s.gradientStops.length >= 2) {
    const sorted = [...s.gradientStops].sort((a, b) => a.position - b.position);
    const parts = sorted.map(stop => {
      const n = parseInt(stop.color.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${g},${b},${stop.opacity / 100}) ${stop.position}%`;
    });
    return `linear-gradient(to right, ${parts.join(', ')})`;
  }
  return s.bandColor || '#ffffff';
}

function getBandClipPath(shape) {
  if (shape === 'slanted') return 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)';
  return 'none';
}

initPresetsStore().then(() => {
  initTabs();
  initDarkMode();
  initBanding();
  initLooped();
  initZoom();

  const exportBtn = document.getElementById('preset-export');
  if (exportBtn) exportBtn.addEventListener('click', exportPresetsJSON);
});
