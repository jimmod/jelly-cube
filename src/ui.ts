export type Resolution = 'low' | 'medium' | 'high';

import { setSoundEnabled } from './audio';

export interface UIState {
  resolution: Resolution;
  cubeCount: number;
  cubeSize: number; // 0.5 to 5.0, default 3.0
  elasticity: number; // 0.0 to 3.0, default 1.5 (Classic Gelatin)
  friction: number; // 0.1 to 5.0, default 0.3
  weight: number; // 0.2 to 3.0, default 1.0
  pressure: number; // -2.0 to 3.0, default 0.8
  gravity: number; // 0 (float) to 10 (fast fall), default 5
  tiltGravity: boolean;
  textureMode: 'default' | 'rainbow' | 'color' | 'file';
  customColor: string;
  textureUrl: string | null;
  soundEnabled: boolean;
  showBox: boolean;
  showVelocity: boolean;
}

export type UIChangeCallback = (state: UIState) => void;

const RESOLUTION_MAP: Record<Resolution, { label: string; segments: number }> = {
  low:    { label: 'Low (3×3×3)',    segments: 3 },
  medium: { label: 'Medium (5×5×5)', segments: 5 },
  high:   { label: 'High (8×8×8)',   segments: 8 },
};

export function getSegments(res: Resolution): number {
  return RESOLUTION_MAP[res].segments;
}

export function createUI(onChange: UIChangeCallback): UIState {
  const state: UIState = {
    resolution: 'medium',
    cubeCount: 1,
    cubeSize: 3.0,
    elasticity: 1.5, // Default to Classic Gelatin
    friction: 0.3,
    weight: 1.0,
    pressure: 0.8,
    gravity: 5,
    tiltGravity: false,
    textureMode: 'default',
    customColor: '#ff0055',
    textureUrl: null,
    soundEnabled: false,
    showBox: false,
    showVelocity: false,
  };

  // ── Panel container ─────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'control-panel';
  panel.className = 'panel-open';

  // ── Toggle button (Modern Configuration / Sliders Icon) ─────────
  const toggle = document.createElement('button');
  toggle.id = 'panel-toggle';
  toggle.setAttribute('aria-label', 'Toggle Control Panel');
  toggle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"></line>
    <line x1="4" y1="10" x2="4" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12" y2="3"></line>
    <line x1="20" y1="21" x2="20" y2="16"></line>
    <line x1="20" y1="12" x2="20" y2="3"></line>
    <line x1="1" y1="14" x2="7" y2="14"></line>
    <line x1="9" y1="8" x2="15" y2="8"></line>
    <line x1="17" y1="16" x2="23" y2="16"></line>
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
  const resGroup = createGroupWithInfo(
    'Resolution',
    'Number of internal grid particles. Higher resolution creates a smoother, more detailed jelly mesh.'
  );
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

  // ── Material Presets ────────────────────────────────────────────
  const presetsGroup = createGroupWithInfo(
    'Presets',
    'Quick material templates simulating different physical substances from springy gelatin to heavy rubber and slime.'
  );
  const presetsContainer = document.createElement('div');
  presetsContainer.style.display = 'grid';
  presetsContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
  presetsContainer.style.gap = '6px';
  presetsContainer.style.marginTop = '4px';

  // Slider references to update when a preset button is clicked
  let bounceSlider: HTMLInputElement;
  let frictionSlider: HTMLInputElement;
  let weightSlider: HTMLInputElement;
  let pressureSlider: HTMLInputElement;

  const createPresetBtn = (label: string, elasticity: number, friction: number, weight: number, pressure: number) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '6px 4px';
    btn.style.fontSize = '11px';
    btn.style.fontWeight = '500';
    btn.style.cursor = 'pointer';
    btn.style.background = 'rgba(255, 255, 255, 0.08)';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.16)';
    btn.style.color = '#fff';
    btn.style.borderRadius = '6px';
    btn.style.whiteSpace = 'nowrap';
    btn.style.overflow = 'hidden';
    btn.style.textOverflow = 'ellipsis';
    btn.style.transition = 'background 0.15s, border-color 0.15s';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.18)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.35)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255, 255, 255, 0.08)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.16)';
    });

    btn.addEventListener('click', () => {
      state.elasticity = elasticity;
      state.friction = friction;
      state.weight = weight;
      state.pressure = pressure;
      
      if (bounceSlider) bounceSlider.value = String(elasticity);
      const bounceValEl = document.getElementById('bounce-value');
      if (bounceValEl) bounceValEl.textContent = `${elasticity.toFixed(1)}×`;
      
      if (frictionSlider) frictionSlider.value = String(friction);
      const fricValEl = document.getElementById('friction-value');
      if (fricValEl) fricValEl.textContent = `${friction.toFixed(1)}×`;

      if (weightSlider) weightSlider.value = String(weight);
      const weightValEl = document.getElementById('weight-value');
      if (weightValEl) weightValEl.textContent = `${weight.toFixed(1)}×`;

      if (pressureSlider) pressureSlider.value = String(pressure);
      const pressValEl = document.getElementById('pressure-value');
      if (pressValEl) pressValEl.textContent = `${pressure.toFixed(1)}×`;
      
      onChange({ ...state });
    });
    return btn;
  };

  // 6 Material Presets conforming to physical rules (single-word labels)
  presetsContainer.appendChild(createPresetBtn('🍮 Gelatin', 1.5, 0.3, 1.0, 0.8));
  presetsContainer.appendChild(createPresetBtn('🛡️ Rubber', 2.6, 3.0, 2.2, 2.0));
  presetsContainer.appendChild(createPresetBtn('🎈 Balloon', 0.3, 0.2, 1.5, 1.8));
  presetsContainer.appendChild(createPresetBtn('🧴 Foam', 0.35, 4.2, 1.2, 0.3));
  presetsContainer.appendChild(createPresetBtn('💨 Marshmallow', 1.8, 0.7, 0.5, 0.5));
  presetsContainer.appendChild(createPresetBtn('💥 Crushed', 0.1, 5.0, 3.0, -1.5));
  
  presetsGroup.appendChild(presetsContainer);
  body.appendChild(presetsGroup);

  // ── Elasticity slider ───────────────────────────────────────────
  const elastGroup = createGroupWithInfo(
    'Elasticity',
    'Controls how fast the cube returns to its original shape (spring return force).',
    `<span class="slider-value" id="bounce-value">${state.elasticity.toFixed(1)}×</span>`
  );

  bounceSlider = document.createElement('input');
  bounceSlider.type = 'range';
  bounceSlider.id = 'bounce-slider';
  bounceSlider.min = '0.0';
  bounceSlider.max = '3.0';
  bounceSlider.step = '0.1';
  bounceSlider.value = String(state.elasticity);
  bounceSlider.addEventListener('input', () => {
    const val = parseFloat(bounceSlider.value);
    state.elasticity = val;
    const valueEl = document.getElementById('bounce-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}×`;
    onChange({ ...state });
  });
  elastGroup.appendChild(bounceSlider);
  body.appendChild(elastGroup);

  // ── Friction slider (formerly Damping) ───────────────────────────
  const fricGroup = createGroupWithInfo(
    'Friction',
    'Controls how long the cube jiggles before stopping. Low = prolonged wiggle; High = thick viscous resistance.',
    `<span class="slider-value" id="friction-value">${state.friction.toFixed(1)}×</span>`
  );

  frictionSlider = document.createElement('input');
  frictionSlider.type = 'range';
  frictionSlider.id = 'friction-slider';
  frictionSlider.min = '0.1';
  frictionSlider.max = '5.0';
  frictionSlider.step = '0.1';
  frictionSlider.value = String(state.friction);
  frictionSlider.addEventListener('input', () => {
    const val = parseFloat(frictionSlider.value);
    state.friction = val;
    const valueEl = document.getElementById('friction-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}×`;
    onChange({ ...state });
  });
  fricGroup.appendChild(frictionSlider);
  body.appendChild(fricGroup);

  // ── Weight slider (Mass & Inertia) ──────────────────────────────
  const weightGroup = createGroupWithInfo(
    'Weight',
    'Mass and inertia of the cube. Higher mass creates more momentum and heavier deformation upon impacts.',
    `<span class="slider-value" id="weight-value">${state.weight.toFixed(1)}×</span>`
  );

  weightSlider = document.createElement('input');
  weightSlider.type = 'range';
  weightSlider.id = 'weight-slider';
  weightSlider.min = '0.2';
  weightSlider.max = '3.0';
  weightSlider.step = '0.1';
  weightSlider.value = String(state.weight);
  weightSlider.addEventListener('input', () => {
    const val = parseFloat(weightSlider.value);
    state.weight = val;
    const valueEl = document.getElementById('weight-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}×`;
    onChange({ ...state });
  });
  weightGroup.appendChild(weightSlider);
  body.appendChild(weightGroup);

  // ── Pressure slider (Soft-body Internal Volume) ─────────────────
  const pressGroup = createGroupWithInfo(
    'Pressure',
    'Internal fluid/air volume. High = plump rigid ball; Low = deflated sack; Negative = vacuum implosion.',
    `<span class="slider-value" id="pressure-value">${state.pressure.toFixed(1)}×</span>`
  );

  pressureSlider = document.createElement('input');
  pressureSlider.type = 'range';
  pressureSlider.id = 'pressure-slider';
  pressureSlider.min = '-2.0';
  pressureSlider.max = '3.0';
  pressureSlider.step = '0.1';
  pressureSlider.value = String(state.pressure);
  pressureSlider.addEventListener('input', () => {
    const val = parseFloat(pressureSlider.value);
    state.pressure = val;
    const valueEl = document.getElementById('pressure-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}×`;
    onChange({ ...state });
  });
  pressGroup.appendChild(pressureSlider);
  body.appendChild(pressGroup);

  // ── Gravity slider ──────────────────────────────────────────────
  const gravGroup = createGroupWithInfo(
    'Gravity',
    'Downward gravitational force pulling the cube to the floor (0 = float, 10 = fast fall).',
    `<span class="slider-value" id="grav-value">${state.gravity}</span>`
  );

  const gravSlider = document.createElement('input');
  gravSlider.type = 'range';
  gravSlider.id = 'grav-slider';
  gravSlider.min = '0';
  gravSlider.max = '10';
  gravSlider.step = '1';
  gravSlider.value = String(state.gravity);
  gravSlider.addEventListener('input', () => {
    const val = parseFloat(gravSlider.value);
    state.gravity = val;
    const valueEl = document.getElementById('grav-value');
    if (valueEl) valueEl.textContent = `${val}`;
    onChange({ ...state });
  });
  gravGroup.appendChild(gravSlider);
  body.appendChild(gravGroup);

  // ── Tilt Gravity Toggle ─────────────────────────────────────────
  const tiltToggle = createToggle(
    '📱 Tilt Gravity',
    state.tiltGravity,
    'Uses your device orientation sensors to pull the jelly cube in the direction you tilt.',
    (val) => {
      if (val && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              state.tiltGravity = true;
              onChange({ ...state });
            } else {
              tiltToggle.querySelector('input')!.checked = false;
            }
          })
          .catch(console.error);
      } else {
        state.tiltGravity = val;
        onChange({ ...state });
      }
    }
  );
  body.appendChild(tiltToggle);

  // ── Size slider ─────────────────────────────────────────────────
  const sizeGroup = createGroupWithInfo(
    'Size',
    'Scale and physical dimensions of the cube.',
    `<span class="slider-value" id="size-value">${state.cubeSize.toFixed(1)}</span>`
  );

  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.id = 'size-slider';
  sizeSlider.min = '0.5';
  sizeSlider.max = '5.0';
  sizeSlider.step = '0.5';
  sizeSlider.value = String(state.cubeSize);
  sizeSlider.addEventListener('change', () => {
    const val = parseFloat(sizeSlider.value);
    state.cubeSize = val;
    const valueEl = document.getElementById('size-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}`;
    onChange({ ...state });
  });
  sizeSlider.addEventListener('input', () => {
    const val = parseFloat(sizeSlider.value);
    const valueEl = document.getElementById('size-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}`;
  });
  sizeGroup.appendChild(sizeSlider);
  body.appendChild(sizeGroup);

  // ── Sound Toggle ────────────────────────────────────────────────
  const soundToggle = createToggle(
    'Sound',
    state.soundEnabled,
    'Plays dynamic synthesized audio when squishing, bouncing, and impacting surfaces.',
    (val) => {
      state.soundEnabled = val;
      setSoundEnabled(val);
      onChange({ ...state });
    }
  );
  body.appendChild(soundToggle);

  // ── Texture Presets ──────────────────────────────────────────────
  const texGroup = createGroupWithInfo(
    'Texture',
    'Visual shader mode: Default surface normal gradient, rainbow faces, solid color, or custom image file.'
  );
  
  const texSelect = document.createElement('select');
  texSelect.style.width = '100%';
  texSelect.style.padding = '4px';
  texSelect.style.marginBottom = '8px';
  texSelect.style.background = 'rgba(255, 255, 255, 0.1)';
  texSelect.style.color = '#fff';
  texSelect.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  texSelect.style.borderRadius = '4px';
  
  const modes = [
    { value: 'default', label: 'Default' },
    { value: 'rainbow', label: 'Rainbow' },
    { value: 'color', label: 'Select colour' },
    { value: 'file', label: 'File' }
  ];
  
  modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    opt.style.color = '#000'; 
    texSelect.appendChild(opt);
  });
  
  texSelect.value = state.textureMode;

  const colorPickerContainer = document.createElement('div');
  colorPickerContainer.style.display = state.textureMode === 'color' ? 'block' : 'none';
  colorPickerContainer.style.marginBottom = '8px';
  
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.value = state.customColor;
  colorPicker.style.width = '100%';
  colorPicker.style.height = '30px';
  colorPicker.style.cursor = 'pointer';
  colorPickerContainer.appendChild(colorPicker);

  const fileInputContainer = document.createElement('div');
  fileInputContainer.style.display = state.textureMode === 'file' ? 'block' : 'none';
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.fontSize = '12px';
  fileInputContainer.appendChild(fileInput);

  texSelect.addEventListener('change', () => {
    state.textureMode = texSelect.value as any;
    colorPickerContainer.style.display = state.textureMode === 'color' ? 'block' : 'none';
    fileInputContainer.style.display = state.textureMode === 'file' ? 'block' : 'none';
    onChange({ ...state });
  });

  colorPicker.addEventListener('input', () => {
    state.customColor = colorPicker.value;
    onChange({ ...state });
  });

  fileInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const url = URL.createObjectURL(file);
      state.textureUrl = url;
      onChange({ ...state });
    }
  });

  texGroup.appendChild(texSelect);
  texGroup.appendChild(colorPickerContainer);
  texGroup.appendChild(fileInputContainer);
  body.appendChild(texGroup);

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
  const boxToggle = createToggle(
    'Wireframe',
    state.showBox,
    'Visualizes the 3D internal mass-spring lattice and bounding box.',
    (val) => {
      state.showBox = val;
      onChange({ ...state });
    }
  );
  body.appendChild(boxToggle);

  const velToggle = createToggle(
    'Velocity',
    state.showVelocity,
    'Draws real-time velocity vectors for all active simulation particles.',
    (val) => {
      state.showVelocity = val;
      onChange({ ...state });
    }
  );
  body.appendChild(velToggle);

  // ── Reset Button ────────────────────────────────────────────────
  const btnGroup = document.createElement('div');
  btnGroup.className = 'control-group';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.style.width = '100%';
  resetBtn.style.padding = '8px';
  resetBtn.style.marginTop = '12px';
  resetBtn.style.fontSize = '12px';
  resetBtn.style.cursor = 'pointer';
  resetBtn.style.background = '#ef4444'; // Red-500
  resetBtn.style.border = 'none';
  resetBtn.style.color = '#fff';
  resetBtn.style.borderRadius = '4px';
  resetBtn.style.fontWeight = '600';
  resetBtn.addEventListener('click', () => {
    window.location.reload();
  });
  btnGroup.appendChild(resetBtn);
  body.appendChild(btnGroup);

  panel.appendChild(body);
  document.body.appendChild(panel);

  return state;
}

// ── Helpers ─────────────────────────────────────────────────────────

function createGroupWithInfo(label: string, infoText: string, extraHtml: string = ''): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'control-group';

  const header = document.createElement('div');
  header.className = 'control-header';

  const lbl = document.createElement('label');
  lbl.className = 'control-label';
  lbl.innerHTML = `${label} ${extraHtml}`;
  header.appendChild(lbl);

  // Info Icon & Popup
  const infoWrapper = document.createElement('div');
  infoWrapper.className = 'info-wrapper';

  const infoBtn = document.createElement('button');
  infoBtn.className = 'info-btn';
  infoBtn.setAttribute('type', 'button');
  infoBtn.setAttribute('aria-label', `Information about ${label}`);
  infoBtn.textContent = 'ⓘ';

  const popup = document.createElement('div');
  popup.className = 'info-popup';
  popup.textContent = infoText;

  // Touch support for mobile
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('show');
  });

  // Close popup when tapping elsewhere
  document.addEventListener('click', () => {
    popup.classList.remove('show');
  });

  infoWrapper.appendChild(infoBtn);
  infoWrapper.appendChild(popup);
  header.appendChild(infoWrapper);

  group.appendChild(header);
  return group;
}

function createToggle(
  label: string,
  initial: boolean,
  infoText: string,
  onToggle: (val: boolean) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'toggle-row';
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.justifyContent = 'space-between';
  row.style.marginBottom = '8px';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '6px';

  const lbl = document.createElement('span');
  lbl.className = 'toggle-label';
  lbl.textContent = label;
  lbl.style.fontSize = '12px';
  lbl.style.fontWeight = '500';
  lbl.style.color = 'rgba(255, 255, 255, 0.8)';
  left.appendChild(lbl);

  // Info Popup
  const infoWrapper = document.createElement('div');
  infoWrapper.className = 'info-wrapper';

  const infoBtn = document.createElement('button');
  infoBtn.className = 'info-btn';
  infoBtn.setAttribute('type', 'button');
  infoBtn.textContent = 'ⓘ';

  const popup = document.createElement('div');
  popup.className = 'info-popup';
  popup.textContent = infoText;

  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    popup.classList.remove('show');
  });

  infoWrapper.appendChild(infoBtn);
  infoWrapper.appendChild(popup);
  left.appendChild(infoWrapper);

  row.appendChild(left);

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
