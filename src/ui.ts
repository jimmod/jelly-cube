export type Resolution = 'low' | 'medium' | 'high' | 'super';

export interface UIState {
  resolution: Resolution;
  showBox: boolean;
  showVelocity: boolean;
}

export type UIChangeCallback = (state: UIState) => void;

const RESOLUTION_MAP: Record<Resolution, { label: string; segments: number }> = {
  low:    { label: 'Low',    segments: 3 },
  medium: { label: 'Medium', segments: 5 },
  high:   { label: 'High',   segments: 8 },
  super:  { label: 'Super',  segments: 12 },
};

export function getSegments(res: Resolution): number {
  return RESOLUTION_MAP[res].segments;
}

export function createUI(onChange: UIChangeCallback): UIState {
  const state: UIState = {
    resolution: 'high',
    showBox: false,
    showVelocity: false,
  };

  const menu = document.createElement('div');
  menu.id = 'menu';

  // Resolution row
  const resRow = document.createElement('div');
  resRow.className = 'menu-row';

  (Object.keys(RESOLUTION_MAP) as Resolution[]).forEach((key) => {
    const item = document.createElement('label');
    item.className = 'menu-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'resolution';
    radio.value = key;
    radio.checked = key === state.resolution;
    radio.addEventListener('change', () => {
      state.resolution = key;
      onChange({ ...state });
    });

    const span = document.createElement('span');
    span.textContent = RESOLUTION_MAP[key].label;

    item.appendChild(radio);
    item.appendChild(span);
    resRow.appendChild(item);
  });

  menu.appendChild(resRow);

  // Debug toggles row
  const debugRow = document.createElement('div');
  debugRow.className = 'menu-row';

  const createCheckbox = (label: string, prop: 'showBox' | 'showVelocity') => {
    const item = document.createElement('label');
    item.className = 'menu-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state[prop];
    cb.addEventListener('change', () => {
      state[prop] = cb.checked;
      onChange({ ...state });
    });

    const span = document.createElement('span');
    span.textContent = label;

    item.appendChild(cb);
    item.appendChild(span);
    debugRow.appendChild(item);
  };

  createCheckbox('Box', 'showBox');
  createCheckbox('Velocity', 'showVelocity');

  menu.appendChild(debugRow);

  document.body.appendChild(menu);

  return state;
}
