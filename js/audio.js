// Kleine synthesizer voor geluidseffecten; geen audiobestanden nodig.
let ctx = null;
let enabled = true;

export function setSound(on) { enabled = on; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.15, slide = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click() { if (enabled) tone(660, 0, 0.06, 'triangle', 0.08); },
  buy() { if (enabled) { tone(520, 0, 0.08, 'triangle', 0.1); tone(780, 0.05, 0.1, 'triangle', 0.1); } },
  milestone() { if (enabled) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, 'square', 0.06)); },
  unlock() { if (enabled) [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.2, 'triangle', 0.12)); },
  coin() { if (enabled) { tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.2, 'square', 0.05); } },
  error() { if (enabled) tone(180, 0, 0.15, 'sawtooth', 0.06, 0.7); },
  prestige() { if (enabled) [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.1)); },
};

// ---------- Achtergrondmuziek ----------
// Browsers staan pas geluid toe na een tik of toets, dus we starten bij de eerste interactie.
let music = null;
let musicOn = false;
let unlocked = false;

export function initMusic(url, on) {
  musicOn = on;
  music = new Audio(url);
  music.loop = true;
  music.volume = 0.35;
  music.preload = 'auto';
  const unlock = () => {
    unlocked = true;
    if (musicOn && !document.hidden) music.play().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause();
    else if (musicOn && unlocked) music.play().catch(() => {});
  });
}

export function setMusic(on) {
  musicOn = on;
  if (!music) return;
  if (on && unlocked) music.play().catch(() => {});
  else music.pause();
}
