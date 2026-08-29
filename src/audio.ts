let audioCtx: AudioContext | null = null;
export let soundEnabled = false;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (enabled && !audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
}

export function playPressSound() {
  if (!soundEnabled || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  
  // A quick "pop" sound
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

  osc.start(now);
  osc.stop(now + 0.1);
}

// Throttle bounce sounds so they don't overlap too much
let lastBounceTime = 0;

export function playBounceSound(intensity: number) {
  if (!soundEnabled || !audioCtx) return;
  
  const now = audioCtx.currentTime;
  if (now - lastBounceTime < 0.1) return; // debounce
  lastBounceTime = now;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  // Clamp intensity to reasonable bounds
  const clampedIntensity = Math.min(Math.max(intensity, 5), 40) / 40;
  
  // A "boing" / thud sound depending on intensity
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(100 + clampedIntensity * 100, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
  
  const volume = clampedIntensity * 0.5;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  osc.start(now);
  osc.stop(now + 0.15);
}
