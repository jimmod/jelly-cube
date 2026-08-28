export type Resolution = 'low' | 'medium' | 'high' | 'super';

export interface UIState {
  resolution: Resolution;
  cubeCount: number;
  elasticity: number; // 0.1 (soft) to 3.0 (stiff), default 1.0
  showBox: boolean;
  showVelocity: boolean;
}

export type UIChangeCallback = (state: UIState) => void;

const RESOLUTION_MAP: Record<Resolution, { label: string; segments: number }> = {
  low:    { label: 'Low (3×3×3)',    segments: 3 },
  medium: { label: 'Medium (5×5×5)', segments: 5 },
  high:   { label: 'High (8×8×8)',   segments: 8 },
  super:  { label: 'Super (12×12×12)', segments: 12 },
};

export function getSegments(res: Resolution): number {
  return RESOLUTION_MAP[res].segments;
}

export function createUI(onChange: UIChangeCallback): UIState {
  const state: UIState = {
    resolution: 'high',
    cubeCount: 1,
    elasticity: 1.0,
    showBox: false,
    showVelocity: false,
  };

  // ── Panel container ─────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'control-panel';
  panel.className = 'panel-open';

  // ── Toggle button (always visible) ──────────────────────────────
  const toggle = document.createElement('button');
  toggle.id = 'panel-toggle';
  toggle.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5"/>
    <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  toggle.addEventListener('click', () => {
    panel.classList.toggle('panel-open');
    panel.classList.toggle('panel-closed');
  });
  panel.appendChild(toggle);

  // ── Panel body (slides in/out) ──────────────────────────────────
  const body = document.createElement('div');
  body.id = 'panel-body';

  // Title
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Jelly Controls';
  body.appendChild(title);

  // ── Resolution dropdown ─────────────────────────────────────────
  const resGroup = createGroup('Resolution');
  const resSelect = document.createElement('select');
  resSelect.id = 'res-select';
  (Object.keys(RESOLUTION_MAP) as Resolution[]).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = RESOLUTION_MAP[key].label;
    if (key === state.resolution) opt.selected = true;
    resSelect.appendChild(opt);
  });
  resSelect.addEventListener('change', () => {
    state.resolution = resSelect.value as Resolution;
    onChange({ ...state });
  });
  resGroup.appendChild(resSelect);
  body.appendChild(resGroup);



  // ── Elasticity slider ───────────────────────────────────────────
  const elastGroup = createGroup('');
  const elastLabel = document.createElement('label');
  elastLabel.className = 'control-label';
  elastLabel.innerHTML = 'Elasticity <span class="slider-value" id="elast-value">1.0×</span>';
  // Replace the auto-generated label
  elastGroup.replaceChildren(elastLabel);

  const elastSlider = document.createElement('input');
  elastSlider.type = 'range';
  elastSlider.id = 'elast-slider';
  elastSlider.min = '0.1';
  elastSlider.max = '3.0';
  elastSlider.step = '0.1';
  elastSlider.value = String(state.elasticity);
  elastSlider.addEventListener('input', () => {
    const val = parseFloat(elastSlider.value);
    state.elasticity = val;
    const valueEl = document.getElementById('elast-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}×`;
    onChange({ ...state });
  });
  elastGroup.appendChild(elastSlider);
  body.appendChild(elastGroup);

  // ── Separator ───────────────────────────────────────────────────
  const sep = document.createElement('div');
  sep.className = 'panel-separator';
  body.appendChild(sep);

  // ── Debug section label ─────────────────────────────────────────
  const debugLabel = document.createElement('div');
  debugLabel.className = 'panel-section-label';
  debugLabel.textContent = 'Debug';
  body.appendChild(debugLabel);

  // ── Toggle switches ─────────────────────────────────────────────
  const boxToggle = createToggle('Wireframe', state.showBox, (val) => {
    state.showBox = val;
    onChange({ ...state });
  });
  body.appendChild(boxToggle);

  const velToggle = createToggle('Velocity', state.showVelocity, (val) => {
    state.showVelocity = val;
    onChange({ ...state });
  });
  body.appendChild(velToggle);

  panel.appendChild(body);
  document.body.appendChild(panel);

  return state;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createGroup(label: string): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'control-group';

  const lbl = document.createElement('label');
  lbl.className = 'control-label';
  lbl.textContent = label;
  group.appendChild(lbl);

  return group;
}

function createToggle(
  label: string,
  initial: boolean,
  onToggle: (val: boolean) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'toggle-row';

  const lbl = document.createElement('span');
  lbl.className = 'toggle-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  const switchEl = document.createElement('label');
  switchEl.className = 'toggle-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;
  input.addEventListener('change', () => {
    onToggle(input.checked);
  });

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  switchEl.appendChild(input);
  switchEl.appendChild(slider);
  row.appendChild(switchEl);

  return row;
}
