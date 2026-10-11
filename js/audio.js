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
// Via Web Audio in plaats van een <audio>-element: zo toont een telefoon geen mediaspeler-melding.
// Browsers staan pas geluid toe na een tik of toets, dus we starten bij de eerste interactie.
// Het bestand is mono 32 kHz; een eigen AudioContext op 32 kHz houdt het geheugen klein (~25 MB).
let mctx = null;
let mgain = null;
let mbuffer = null;
let msource = null;
let musicOn = false;
let unlocked = false;
let loading = null;
let musicUrl = '';

function startMusic() {
  if (!musicOn || !unlocked || document.hidden) return;
  if (!mctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { mctx = new AC({ sampleRate: 32000 }); } catch { mctx = new AC(); }
    mgain = mctx.createGain();
    mgain.gain.value = 0.35;
    mgain.connect(mctx.destination);
  }
  if (mctx.state === 'suspended') mctx.resume();
  if (msource) return;
  if (!mbuffer) {
    if (!loading) {
      loading = fetch(musicUrl)
        .then((r) => r.arrayBuffer())
        .then((data) => new Promise((ok, fail) => mctx.decodeAudioData(data, ok, fail)))
        .then((buf) => { mbuffer = buf; startMusic(); })
        .catch((e) => { console.warn('Muziek laden mislukt', e); });
    }
    return;
  }
  msource = mctx.createBufferSource();
  msource.buffer = mbuffer;
  msource.loop = true;
  msource.connect(mgain);
  msource.start();
}

function stopMusic() {
  if (msource) { try { msource.stop(); } catch { /* al gestopt */ } msource.disconnect(); msource = null; }
  if (mctx && mctx.state === 'running') mctx.suspend();
}

export function initMusic(url, on) {
  musicOn = on;
  musicUrl = url;
  const unlock = () => {
    unlocked = true;
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (mctx && mctx.state === 'running') mctx.suspend(); }
    else if (musicOn && unlocked) { if (mctx) mctx.resume(); startMusic(); }
  });
}

export function setMusic(on) {
  musicOn = on;
  if (on) startMusic();
  else stopMusic();
}
