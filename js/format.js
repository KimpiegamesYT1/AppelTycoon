const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function suffix(i) {
  if (i < SUFFIX.length) return SUFFIX[i];
  const k = i - SUFFIX.length;
  return String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + (k % 26));
}

// Korte notatie met Nederlandse komma: 1,23M
export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (n < 10 && n % 1 > 0.05) return n.toFixed(1).replace('.', ',');
    return String(Math.floor(n));
  }
  let i = Math.floor(Math.log10(n) / 3);
  let v = n / 10 ** (i * 3);
  if (v >= 999.5) { i++; v /= 1000; }
  const d = v < 10 ? 2 : v < 100 ? 1 : 0;
  return v.toFixed(d).replace('.', ',') + suffix(i);
}

export const money = (n) => '€' + fmt(n);

// Snelheden (per seconde): onder de 100 met één decimaal, zodat kleine verbeteringen zichtbaar zijn.
export function rate(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 100 || n === 0) return fmt(n);
  const dec = n < 1 ? 100 : 10;
  const r = Math.round(n * dec) / dec;
  return String(r).replace('.', ',');
}

export function duration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}u ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function percent(x) {
  return Math.round(x * 100) + '%';
}
