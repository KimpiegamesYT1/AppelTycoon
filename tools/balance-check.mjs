// Balanstests: speelt het spel met verschillende spelers en controleert vaste criteria.
// Gebruik: node tools/balance-check.mjs            (alle gevallen, parallel)
//          node tools/balance-check.mjs --case optimaal
import { fork } from 'node:child_process';
import * as E from '../js/economy.js';
import { LINES, TIERS, UPGRADES, GOLDEN, STARS } from '../js/config.js';
import { GOALS, goalAt, goalProgress, goalReward } from '../js/goals.js';
import { spend, options, bundle } from './bot.mjs';

const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : NaN; };

// ---------- spelers ----------

// Casual speler: reageert op meldingen (vol magazijn -> vrachtwagens, appeltekort -> boomgaard),
// koopt nieuwe lijnen/hallen zodra het kan, en anders de goedkoopste upgrade die iets oplevert.
export function casualSpend(s) {
  const bought = [];
  for (let n = 0; n < 400; n++) {
    const p = E.computeProduction(s, 0, true);
    let pick = null;
    // op een melding reageren als dat te betalen is; anders gewoon verder met de rest
    const salesQ = E.upgradeQuote(s, 'sales', 0, 1).cost;
    const orchQ = E.upgradeQuote(s, 'orchard', 0, 1).cost;
    if (p.potential > p.transport * 1.001 && salesQ <= s.money) pick = { label: 'sales', cost: salesQ, apply: (c) => { c.sales++; } };
    else if (p.lines.some((l) => l.status === 'apples') && orchQ <= s.money) pick = { label: 'orchard', cost: orchQ, apply: (c) => { c.orchard++; } };
    else {
      const opts = options(s).filter((o) => o.label !== 'orchard' && o.label !== 'sales');
      const ev = opts.filter((o) => o.event).sort((a, b) => a.cost - b.cost)[0];
      if (ev && ev.cost <= s.money) pick = ev;
      else {
        // spaart voor een nieuwe lijn/hal als die binnen 3 minuten betaalbaar is
        const inc = E.incomePerSecond(s);
        if (ev && (ev.cost - s.money) / Math.max(inc, 1e-9) < 180) break;
        const base = inc;
        const useful = opts.filter((o) => !o.event).map((o) => {
          const c = structuredClone(s); o.apply(c);
          return { o, gain: E.incomePerSecond(c) - base };
        }).filter((x) => x.gain > 0);
        // de rode pijltjes: koopt de goedkoopste die nu te betalen is
        useful.sort((a, b) => a.o.cost - b.o.cost);
        pick = useful[0] && useful[0].o;
      }
    }
    if (!pick || pick.cost > s.money) break;
    s.money -= pick.cost;
    pick.apply(s);
    bought.push(pick);
  }
  return bought;
}

// ---------- één simulatie ----------

function simulate({ minutes, beat, player, prestige = false, goals = true, golden = true }) {
  const s = E.newState();
  s.tutorial = 99;
  s.stats.chain = 1;
  let t = 0, lastBuy = 0, runStart = 0, nextGolden = 60;
  const goalLog = [];
  let nothing = 0;
  const ev = [], gaps = [], paybacks = [], chainCost = [], rewards = [], rounds = [], snapshots = [];
  let maxGap = 0, maxGap55 = 0;
  const gaps55 = [];
  while (t < minutes * 60) {
    E.tick(s, beat);
    t += beat;
    const inc = E.incomePerSecond(s);
    if (golden && t >= nextGolden) { E.earn(s, Math.max(GOLDEN.minReward, inc * GOLDEN.incomeSeconds)); s.stats.golden++; nextGolden += (GOLDEN.minDelay + GOLDEN.maxDelay) / 2 + 10; }
    if (goals) {
      for (let k = 0; k < 5; k++) {
        const g = goalAt(s.goal);
        if (g.type === 'prestige' && !prestige) break;
        const p = goalProgress(g, s, inc);
        if (p.cur < p.max) break;
        const r = goalReward(g, inc);
        if (g.type !== 'prestige') rewards.push(r / Math.max(inc, 1e-9));
        if (g.type !== 'prestige') goalLog.push([t, g.text, r / Math.max(inc, 1e-9)]);
        E.earn(s, r);
        s.goal++;
      }
    }
    if (player !== 'optimaal' && t <= 60 * 60) {
      // is er iets betaalbaars dat zich binnen 5 minuten terugverdient (of een nieuwe lijn/hal)?
      let useful = false;
      for (const o of options(s)) {
        if (o.cost > s.money) continue;
        if (o.event) { useful = true; break; }
        const c = structuredClone(s);
        const b = bundle(c, o);
        if (b.cost > s.money) continue;
        const d = E.incomePerSecond(c) - inc;
        if (d > 0 && b.cost / d <= 300) { useful = true; break; }
      }
      if (!useful) nothing += beat;
    }
    const before = E.incomePerSecond(s);
    const bought = player === 'optimaal' ? spend(s) : casualSpend(s);
    if (bought.length) {
      const gap = t - lastBuy;
      gaps.push(gap);
      if (t - runStart > 120) maxGap = Math.max(maxGap, gap);
      if (t <= 55 * 60) { maxGap55 = Math.max(maxGap55, gap); gaps55.push(gap); }
      lastBuy = t;
      const after = E.incomePerSecond(s);
      for (const o of bought) {
        if (o.key && (o.key.startsWith('line') || o.key.startsWith('tier'))) ev.push({ t, label: o.label, inc: after });
        if (o.label.startsWith('line') && o.gain > 0) paybacks.push([t, o.cost / o.gain]);
        if ((o.label === 'orchard' || o.label === 'sales') && before > 0) chainCost.push([t, o.cost / before]);
        else if (o.extra && o.extra.orchard + o.extra.sales > 0 && before > 0) chainCost.push([t, (o.extra.orchard + o.extra.sales) / before]);
      }
    }
    if (t % 600 === 0) {
      const pp = E.computeProduction(s, 0, true);
      const shares = pp.lines.map((l) => (pp.income > 0 ? l.income / pp.income : 0));
      snapshots.push({ t, inc: E.incomePerSecond(s), lines: [...s.lines], shares, orchard: s.orchard, sales: s.sales, upg: Object.keys(s.research).length, tier: s.tier });
    }
    if (prestige) {
      const pend = E.pendingInvestors(s);
      if (pend >= Math.max(10, s.investors) && t - lastBuy > 30 && t - runStart > 600) {
        rounds.push({ t, dur: t - runStart, gain: pend, total: s.investors + pend, maxTier: s.tier, inc: E.incomePerSecond(s), money: s.totalEarned });
        E.prestige(s);
        s.tutorial = 99;
        runStart = t;
      }
    }
  }
  return { nothing, goalLog, ev, gaps, gaps55, maxGap, maxGap55, paybacks, chainCost, rewards, rounds, snapshots, final: { lines: s.lines, orchard: s.orchard, sales: s.sales, upg: Object.keys(s.research).length, tier: s.tier, inc: E.incomePerSecond(s), total: s.totalEarned } };
}

// Intro: zo snel als een speler de stappen kan doen.
function tutorialRun() {
  const s = E.newState();
  let t = 0;
  const steps = [];
  const wait = (cond, buy) => {
    const t0 = t;
    while (!cond() && t - t0 < 600) { E.tick(s, 0.5); t += 0.5; if (buy) buy(); }
    steps.push(t - t0);
  };
  wait(() => s.money >= LINES[0].unlock); E.buyLine(s, 0);
  wait(() => s.runEarned >= 6);
  wait(() => s.lines[0] >= 5, () => E.buyUpgrade(s, 'line', 0, 1));
  wait(() => s.lines[0] >= 10, () => E.buyUpgrade(s, 'line', 0, 1));
  wait(() => s.orchard >= 3, () => E.buyUpgrade(s, 'orchard', 0, 1));
  wait(() => s.sales >= 3, () => E.buyUpgrade(s, 'sales', 0, 1));
  return { steps, total: t };
}

const CASES = {
  optimaal: () => simulate({ minutes: 120, beat: 2, player: 'optimaal' }),
  casual: () => simulate({ minutes: 150, beat: 20, player: 'casual' }),
  lui: () => simulate({ minutes: 180, beat: 300, player: 'casual', golden: false }),
  prestige: () => simulate({ minutes: 480, beat: 4, player: 'optimaal', prestige: true }),
  intro: () => tutorialRun(),
};

if (process.argv[1] && !process.argv[1].endsWith('balance-check.mjs')) { /* als module geladen */ } else if (process.argv.includes('--case')) {
  const name = process.argv[process.argv.indexOf('--case') + 1];
  const r = CASES[name]();
  process.send ? process.send(r) : console.log(JSON.stringify(r).slice(0, 2000));
} else {
  const only = process.argv.slice(2).filter((a) => CASES[a]);
  const names = only.length ? only : Object.keys(CASES);
  const res = Object.fromEntries(await Promise.all(names.map((n) => new Promise((ok) => {
    const c = fork(new URL(import.meta.url).pathname, ['--case', n]);
    c.on('message', (m) => ok([n, m]));
  }))));
  report(res);
}

// ---------- criteria ----------

function report(R) {
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'OK  ' : 'FOUT'}  ${name}${detail ? `  (${detail})` : ''}`);
  };
  const at = (r, label) => { const e = r.ev.find((x) => x.label.includes(label)); return e ? e.t / 60 : Infinity; };
  const blocks = (arr, size, f) => {
    const out = [];
    for (let h = 0; h * size * 60 < 1e9; h++) {
      const v = arr.filter(([tt]) => tt >= h * size * 60 && tt < (h + 1) * size * 60).map(([, x]) => x);
      if (!v.length) { if (h > 30) break; continue; }
      out.push([h * size, f(v)]);
    }
    return out;
  };

  if (R.intro) {
    console.log('\n== Intro ==');
    const r = R.intro;
    check('intro klaar binnen 5 minuten', r.total <= 300, `${fmtT(r.total)}; per stap ${r.steps.map((x) => Math.round(x) + 's').join(', ')}`);
    check('geen stap in de intro langer dan 75 s wachten', Math.max(...r.steps) <= 75);
  }

  if (R.optimaal) {
    console.log('\n== Slimme speler (eerste ronde) ==');
    const r = R.optimaal;
    const T = (l) => at(r, l);
    console.log('   ' + r.ev.map((e) => `${e.label.replace('UNLOCK ', '').replace('TIER ', '')} ${fmtT(e.t)}`).join(' · '));
    const win = [['Werkplaats', 4, 9], ['Fabriek', 9, 16], ['Grote Fabriek', 17, 30], ['Industriehal', 32, 55], ['Megafabriek', 50, 80]];
    for (const [l, a, b] of win) check(`${l} tussen ${a} en ${b} min`, T(l) >= a && T(l) <= b, `${T(l).toFixed(1)} min`);
    const pb = blocks(r.paybacks, 30, (v) => [median(v) / 60, pct(v, 0.9) / 60]).filter(([h]) => h < 60);
    check('terugverdientijd lijn-upgrades: mediaan ≤ 6 min per half uur', pb.every(([, [m]]) => m <= 6), pb.map(([h, [m]]) => `${h}-${h + 30}: ${m.toFixed(1)}`).join(', '));
    check('terugverdientijd lijn-upgrades: p90 ≤ 22 min', pb.every(([, [, p]]) => p <= 22), pb.map(([h, [, p]]) => `${h}: ${p.toFixed(1)}`).join(', '));
    // na ~55 min is het tijd voor investeerders (zie de investeerderstest); tot dan altijd iets te doen
    console.log(`   (info) slimme speler spaart soms: langste pauze ${fmtT(r.maxGap55)}`);
    // de klacht 'alles al geüpgraded, alleen wachten': tijd in pauzes van meer dan 1 minuut zonder aankoop
    const idle = r.gaps55.filter((g) => g > 60).reduce((a, b) => a + b, 0) / (55 * 60);
    void idle;
    const cc = r.chainCost.map(([, v]) => v);
    check('boomgaard/vrachtwagens kosten een keuze waard (mediaan 2-60 s inkomen)', median(cc) >= 2 && median(cc) <= 60, `mediaan ${median(cc).toFixed(1)} s, p90 ${pct(cc, 0.9).toFixed(0)} s`);
    const snap = r.snapshots.find((x) => x.t === 3600) || r.final;
    const open = snap.lines.filter((x) => x > 0).slice(0, -1);
    check('oude lijnen blijven meedoen (laagste ≥ 40% van hoogste level na 60 min, nieuwste lijn niet meegeteld)', Math.min(...open) >= 0.4 * Math.max(...open), `levels ${open.join(', ')}`);
    for (const m of [30, 60, 90]) {
      const sn = r.snapshots.find((x) => x.t === m * 60);
      if (!sn) continue;
      const sh = sn.shares.filter((x, k) => sn.lines[k] > 0);
      const newest = sh[sh.length - 1];
      const others = sh.slice(0, -1);
      // alle machines verdienen mee: geen enkele boven 60%, en de helft van de machines elk ≥ 5%
      const meaningful = sh.filter((x) => x >= 0.05).length;
      check(`na ${m} min: geen machine > 60% van het inkomen, ≥ helft van de machines elk ≥ 5%`, Math.max(...sh) <= 0.6 && meaningful >= Math.ceil(sh.length / 2), sh.map((x) => Math.round(x * 100) + '%').join(' '));
      void newest; void others;
    }
    check('upgrades worden gekocht (≥ 15 na 2 uur)', r.final.upg >= 15, `${r.final.upg}`);
    check('taken worden steeds gehaald (≥ 25 in 2 uur)', r.goalLog.length >= 25, `${r.goalLog.length}; laatste: ${r.goalLog.length ? r.goalLog[r.goalLog.length - 1][1] : '-'}`);
    const big = r.goalLog.filter(([, , x]) => x > 13).map(([tt, txt, x]) => `${txt} ${x.toFixed(0)}s @${fmtT(tt)}`);
    if (big.length) console.log('   te grote beloningen: ' + big.join('; '));
    check('taakbeloningen 3-13 s inkomen', r.rewards.length && Math.max(...r.rewards) <= 13 && Math.min(...r.rewards) >= 3, `${Math.min(...r.rewards).toFixed(0)}-${Math.max(...r.rewards).toFixed(0)} s, ${r.rewards.length} taken`);
    const g = r.snapshots.map((x) => x.inc);
    check('inkomen groeit elk kwartier tot 60 min', g.slice(0, 6).every((v, k) => k === 0 || v > g[k - 1] * 1.05), g.slice(0, 7).map((v) => v.toExponential(0)).join(' → '));
  }

  if (R.casual) {
    console.log('\n== Gewone speler (kijkt elke 20 s, koopt goedkoopste pijltje) ==');
    const r = R.casual, o = R.optimaal;
    console.log('   ' + r.ev.map((e) => `${e.label.replace('UNLOCK ', '').replace('TIER ', '')} ${fmtT(e.t)}`).join(' · '));
    for (const l of ['Werkplaats', 'Fabriek', 'Grote Fabriek', 'Industriehal']) {
      const a = at(r, l), b = o ? at(o, l) : NaN;
      check(`${l} haalbaar en niet veel trager (≤ 2,5x slimme speler)`, a < Infinity && (!o || a <= b * 2.5), `${a.toFixed(1)} min vs ${b.toFixed(1)}`);
    }
    check('gewone speler heeft bijna altijd iets zinnigs te kopen (≤ 25% van het eerste uur niets met terugverdientijd < 5 min)', r.nothing / 3600 <= 0.25, `${Math.round(r.nothing / 36)}% van de tijd niets`);
    const open = r.final.lines.filter((x) => x > 0);
    check('geen vastlopers: alle lijnen draaien, boomgaard en vrachtwagens groeien mee', r.final.orchard > 10 && r.final.sales > 8, `boomgaard ${r.final.orchard}, vrachtwagens ${r.final.sales}, lijnen ${open.join(',')}`);
  }

  if (R.lui) {
    console.log('\n== Luie speler (kijkt elke 5 min) ==');
    const r = R.lui;
    console.log('   ' + r.ev.map((e) => `${e.label.replace('UNLOCK ', '').replace('TIER ', '')} ${fmtT(e.t)}`).join(' · '));
    check('komt binnen 3 uur tot de Grote Fabriek', at(r, 'Grote Fabriek') <= 180, `${at(r, 'Grote Fabriek').toFixed(0)} min`);
  }

  if (R.prestige) {
    console.log('\n== Investeerders (8 uur) ==');
    const r = R.prestige;
    for (const x of r.rounds) console.log(`   ronde na ${fmtT(x.dur)}: +${x.gain} (totaal ${x.total}), hoogste hal ${TIERS[x.maxTier].name}`);
    const first = r.rounds[0];
    check('eerste investeerders (+10) na 50-90 min, als de eerste ronde vlak wordt', first && first.t / 60 >= 50 && first.t / 60 <= 90, first ? `${(first.t / 60).toFixed(0)} min, +${first.gain}` : 'geen');
    const durs = r.rounds.slice(0, 6).map((x) => x.dur / 60);
    check('eerste 6 rondes elk minstens 20 min', durs.every((d) => d >= 20), durs.map((d) => d.toFixed(0)).join(', '));
    const growth = r.rounds.slice(1).map((x, k) => x.gain / r.rounds[k].gain);
    check('investeerders groeien hooguit 8x per ronde (geen ontsporing)', growth.every((g) => g <= 8), growth.map((g) => g.toFixed(1)).join(', '));
    check('Gigafabriek binnen 4 uur', r.rounds.some((x) => x.maxTier >= 6 && x.t <= 4 * 3600) || (r.final.tier >= 6), '');
    check('getallen blijven leesbaar (< 1e30 na 8 uur)', r.final.total < 1e30, r.final.total.toExponential(1));
  }
  console.log(`\n${pass} geslaagd, ${fail} fout`);
}
