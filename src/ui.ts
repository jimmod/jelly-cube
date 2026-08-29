export type Resolution = 'low' | 'medium' | 'high' | 'super';

import { setSoundEnabled } from './audio';

export interface UIState {
  resolution: Resolution;
  cubeCount: number;
  cubeSize: number; // 0.5 to 5.0, default 3.0
  elasticity: number; // 0.1 (soft) to 3.0 (stiff), default 1.0
  damping: number; // 0.1 to 5.0, default 1.0
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
  super:  { label: 'Super (12×12×12)', segments: 12 },
};

export function getSegments(res: Resolution): number {
  return RESOLUTION_MAP[res].segments;
}

export function createUI(onChange: UIChangeCallback): UIState {
  const state: UIState = {
    resolution: 'medium',
    cubeCount: 1,
    cubeSize: 3.0,
    elasticity: 1.0,
    damping: 1.0,
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
  elastLabel.innerHTML = 'Elasticity <span class="slider-value" id="bounce-value">1.0×</span>';
  // Replace the auto-generated label
  elastGroup.replaceChildren(elastLabel);

  const bounceSlider = document.createElement('input');
  bounceSlider.type = 'range';
  bounceSlider.id = 'bounce-slider';
  bounceSlider.min = '0.1';
  bounceSlider.max = '3.0';
  bounceSlider.step = '0.1';
  bounceSlider.value = String(state.elasticity);
  bounceSlider.addEventListener('input', () => {
    const val = parseFloat(bounceSlider.value);
    state.elasticity = val;
    const valueEl = document.getElementById('bounce-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}`;
    onChange({ ...state });
  });
  elastGroup.appendChild(bounceSlider);
  body.appendChild(elastGroup);

  // ── Material Presets ────────────────────────────────────────────
  const presetsGroup = createGroup('Presets');
  const presetsContainer = document.createElement('div');
  presetsContainer.style.display = 'flex';
  presetsContainer.style.gap = '8px';
  presetsContainer.style.marginTop = '4px';

  const createPresetBtn = (label: string, elasticity: number, damping: number) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.flex = '1';
    btn.style.padding = '4px';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';
    btn.style.background = 'rgba(255, 255, 255, 0.1)';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    btn.style.color = '#fff';
    btn.style.borderRadius = '4px';
    btn.addEventListener('click', () => {
      state.elasticity = elasticity;
      state.damping = damping;
      bounceSlider.value = String(elasticity);
      const bounceValEl = document.getElementById('bounce-value');
      if (bounceValEl) bounceValEl.textContent = elasticity.toFixed(1);
      onChange({ ...state });
    });
    return btn;
  };

  presetsContainer.appendChild(createPresetBtn('💧 Water', 0.5, 0.5));
  presetsContainer.appendChild(createPresetBtn('🍯 Slime', 0.3, 1.0)); // Soft, stretches a lot, but can still move
  presetsContainer.appendChild(createPresetBtn('🍮 Jello', 2.0, 1.0));
  presetsContainer.appendChild(createPresetBtn('💥 Crushed', 0.2, 3.0)); // High damping makes it feel heavy/unmovable
  
  presetsGroup.appendChild(presetsContainer);
  body.appendChild(presetsGroup);

  // ── Gravity slider ──────────────────────────────────────────────
  const gravGroup = createGroup('');
  const gravLabel = document.createElement('label');
  gravLabel.className = 'control-label';
  gravLabel.innerHTML = 'Gravity <span class="slider-value" id="grav-value">5</span>';
  gravGroup.replaceChildren(gravLabel);

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
  const tiltToggle = createToggle('📱 Tilt Gravity', state.tiltGravity, (val) => {
    // Request permission on iOS
    if (val && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
            state.tiltGravity = true;
            onChange({ ...state });
          } else {
            // Revert UI if denied
            tiltToggle.querySelector('input')!.checked = false;
          }
        })
        .catch(console.error);
    } else {
      state.tiltGravity = val;
      onChange({ ...state });
    }
  });
  body.appendChild(tiltToggle);

  // ── Size slider ─────────────────────────────────────────────────
  const sizeGroup = createGroup('');
  const sizeLabel = document.createElement('label');
  sizeLabel.className = 'control-label';
  sizeLabel.innerHTML = 'Size <span class="slider-value" id="size-value">3.0</span>';
  sizeGroup.replaceChildren(sizeLabel);

  const sizeSlider = document.createElement('input');
  sizeSlider.type = 'range';
  sizeSlider.id = 'size-slider';
  sizeSlider.min = '0.5';
  sizeSlider.max = '5.0';
  sizeSlider.step = '0.5';
  sizeSlider.value = String(state.cubeSize);
  // Rebuilding the cube is expensive, so we only want to do it on change, not input
  sizeSlider.addEventListener('change', () => {
    const val = parseFloat(sizeSlider.value);
    state.cubeSize = val;
    const valueEl = document.getElementById('size-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}`;
    onChange({ ...state });
  });
  // Update the label instantly while dragging
  sizeSlider.addEventListener('input', () => {
    const val = parseFloat(sizeSlider.value);
    const valueEl = document.getElementById('size-value');
    if (valueEl) valueEl.textContent = `${val.toFixed(1)}`;
  });
  sizeGroup.appendChild(sizeSlider);
  body.appendChild(sizeGroup);

  // ── Sound Toggle ────────────────────────────────────────────────
  const soundToggle = createToggle('Sound', state.soundEnabled, (val) => {
    state.soundEnabled = val;
    setSoundEnabled(val);
    onChange({ ...state });
  });
  body.appendChild(soundToggle);

  // ── Texture Presets ──────────────────────────────────────────────
  const texGroup = createGroup('Texture');
  
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
    // ensure text color is readable on dropdowns (some browsers use white bg for options)
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
