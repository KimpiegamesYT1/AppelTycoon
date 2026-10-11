// Geluid via één Web Audio-context: kleine synthesizer voor effecten en de achtergrondmuziek.
// Alles loopt via een limiter, zodat effecten en muziek samen nooit gaan kraken of pieken.
let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let enabled = true;

export function setSound(on) { enabled = on; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    // 'balanced' geeft een iets grotere buffer: minder haperingen op drukke telefoons
    try { ctx = new AC({ latencyHint: 'balanced' }); } catch { ctx = new AC(); }
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -10;
    master.knee.value = 6;
    master.ratio.value = 12;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.12, slide = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01 + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}

export const sfx = {
  click() { if (enabled) tone(660, 0, 0.06, 'triangle', 0.07); },
  buy() { if (enabled) { tone(520, 0, 0.08, 'triangle', 0.09); tone(780, 0.05, 0.1, 'triangle', 0.09); } },
  milestone() { if (enabled) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, 'triangle', 0.08)); },
  unlock() { if (enabled) [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.2, 'triangle', 0.1)); },
  coin() { if (enabled) { tone(988, 0, 0.08, 'sine', 0.06); tone(1319, 0.06, 0.18, 'sine', 0.06); } },
  sale() { if (enabled) tone(1175, 0, 0.12, 'sine', 0.035); },
  error() { if (enabled) tone(200, 0, 0.15, 'triangle', 0.07, 0.7); },
  prestige() { if (enabled) [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.08)); },
};

// ---------- Achtergrondmuziek ----------
// Via Web Audio in plaats van een <audio>-element: zo toont een telefoon geen mediaspeler-melding.
// Browsers staan pas geluid toe na een tik of toets, dus we starten bij de eerste interactie.
const MUSIC_VOLUME = 0.3;
let mbuffer = null;
let msource = null;
let musicOn = false;
let unlocked = false;
let loading = null;
let musicUrl = '';
let loopStart = 0;
let loopEnd = 0;

// mp3's hebben een klein stukje stilte aan begin en eind; dat slaan we over voor een naadloze herhaling
function findLoop(buf) {
  const d = buf.getChannelData(0);
  let a = 0;
  let b = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < 0.002) a++;
  while (b > a && Math.abs(d[b]) < 0.002) b--;
  loopStart = a / buf.sampleRate;
  loopEnd = (b + 1) / buf.sampleRate;
}

function startMusic() {
  if (!musicOn || !unlocked || document.hidden) return;
  const c = ac();
  if (!c || msource) return;
  if (!mbuffer) {
    if (!loading) {
      loading = fetch(musicUrl)
        .then((r) => r.arrayBuffer())
        .then((data) => new Promise((ok, fail) => c.decodeAudioData(data, ok, fail)))
        .then((buf) => { mbuffer = buf; findLoop(buf); startMusic(); })
        .catch((e) => { console.warn('Muziek laden mislukt', e); });
    }
    return;
  }
  msource = c.createBufferSource();
  msource.buffer = mbuffer;
  msource.loop = true;
  msource.loopStart = loopStart;
  msource.loopEnd = loopEnd;
  msource.connect(musicGain);
  const t = c.currentTime + 0.05;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(0, t);
  musicGain.gain.linearRampToValueAtTime(MUSIC_VOLUME, t + 1.5);
  msource.start(t, loopStart);
}

function stopMusic() {
  if (!msource) return;
  const c = ac();
  const src = msource;
  msource = null;
  const t = c.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.linearRampToValueAtTime(0, t + 0.3);
  src.stop(t + 0.35);
  src.onended = () => src.disconnect();
}

export function initMusic(url, on) {
  musicOn = on;
  musicUrl = url;
  const unlock = () => {
    unlocked = true;
    ac();
    startMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (unlocked) { ctx.resume(); startMusic(); }
  });
}

export function setMusic(on) {
  musicOn = on;
  if (on) startMusic();
  else stopMusic();
}
