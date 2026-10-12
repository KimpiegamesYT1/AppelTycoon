// Alle HTML-interface: HUD, panelen, labels boven stations, meldingen.
import * as E from './economy.js';
import { LINES, TIERS, UPGRADES, ORCHARD, SALES, DOCK_LEVELS, PICKER_LEVELS, STARS, INVESTOR_BONUS } from './config.js';
import { fmt, money, duration, rate } from './format.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { sfx } from './audio.js';
import { TUTORIAL, tutorialDone } from './tutorial.js';
import { icon, glyph, stationGlyph } from './icons.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor(game) {
    this.game = game;
    this.buyAmount = 1;
    this.panel = null;
    this.labels = new Map();
    this.lastSlow = 0;
    this.history = [];
    this.lastSample = 0;
    this.hold = null;

    this.el = {
      money: $('#money'), income: $('#income'), inv: $('#inv-count'),
      goalText: $('#goal-text'), goalBar: $('#goal-bar'), goalClaim: $('#goal-claim'), goal: $('#goal'),
      sheet: $('#sheet'), modal: $('#modal'), modalCard: $('#modal-card'), labels: $('#labels'), fx: $('#fx'),
      toasts: $('#toasts'), moneyCard: $('.money-card'),
    };

    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      sfx.click();
      const what = b.dataset.open;
      if (this.panel && this.panel.id === what) this.close();
      else this.open(what);
    }));
    $('#btn-investors').addEventListener('click', () => { sfx.click(); this.open('investors'); });
    $('#btn-settings').addEventListener('click', () => { sfx.click(); this.open('settings'); });
    this.el.chainMini = $('#chain-mini');
    this.el.chainMini.addEventListener('click', () => { sfx.click(); this.open('chain'); });
    this.el.goalClaim.addEventListener('click', () => this.game.claimGoal());
    this.el.tut = $('#tutorial');
    this.el.tutText = $('#tut-text');
    this.el.tutStep = $('#tut-step');
    this.el.tutBtn = $('#tut-btn');
    this.el.tutBtn.addEventListener('click', () => this.advanceTutorial());
    this.tutShown = -1;
    this.el.goal.addEventListener('click', (e) => {
      if (this.el.goalClaim.contains(e.target)) { this.el.goal.classList.remove('open'); return; }
      // op mobiel is het doel een knopje; eerste tik klapt het open
      if (window.matchMedia('(max-width: 760px)').matches && !this.el.goal.classList.contains('open')) {
        this.el.goal.classList.add('open');
        return;
      }
      this.el.goal.classList.remove('open');
      this.goalHint();
    });
    document.addEventListener('pointerdown', (e) => { if (!this.el.goal.contains(e.target)) this.el.goal.classList.remove('open'); });

    // klikken in panelen via data-action
    const onAction = (e) => {
      const b = e.target.closest('[data-action]');
      if (!b || b.classList.contains('disabled')) return;
      if (b.dataset.hold !== undefined && e.detail !== 0) return; // afgehandeld door hold
      this.doAction(b.dataset);
    };
    this.el.sheet.addEventListener('click', onAction);
    this.el.modal.addEventListener('click', (e) => {
      if (e.target === this.el.modal && this.modalDismiss) this.closeModal();
      else onAction(e);
    });
    this.el.labels.addEventListener('click', (e) => {
      const l = e.target.closest('[data-st]');
      if (l) this.game.tapStation(JSON.parse(l.dataset.st));
    });

    // ingedrukt houden = herhaald kopen, steeds sneller.
    // Op een touchscreen via touch-events (met preventDefault), zodat lang drukken geen
    // browsermenu of tekstselectie opent en het kopen niet onderbreekt.
    const startHold = (b) => {
      if (!b || b.classList.contains('disabled')) return;
      this.stopHoldNow();
      const ds = { ...b.dataset };
      this.heldBtn = b;
      b.classList.add('held');
      this.doAction(ds);
      let delay = 380;
      const step = () => {
        if (!this.heldBtn) return;
        this.doAction(ds);
        delay = Math.max(55, delay * 0.8);
        this.hold = setTimeout(step, delay);
      };
      this.hold = setTimeout(step, delay);
    };
    const stopHold = () => this.stopHoldNow();
    this.el.sheet.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      startHold(e.target.closest('[data-hold]'));
    });
    this.el.sheet.addEventListener('touchstart', (e) => {
      const b = e.target.closest('[data-hold]');
      if (!b) return;
      e.preventDefault();
      startHold(b);
    }, { passive: false });
    this.el.sheet.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
    for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'blur']) window.addEventListener(ev, stopHold);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!this.el.modal.classList.contains('hidden')) this.closeModal(); else this.close(); }
    });
  }

  get state() { return this.game.state; }

  doAction(d) {
    const g = this.game;
    switch (d.action) {
      case 'upgrade': {
        const ok = g.upgrade(d.kind, Number(d.i || 0), this.buyAmount);
        if (!ok) this.stopHoldNow();
        break;
      }
      case 'amount': this.buyAmount = d.v === 'max' ? 'max' : Number(d.v); sfx.click(); break;
      case 'unlock': g.unlockLine(Number(d.i)); break;
      case 'tier': g.buyTier(); break;
      case 'research': g.buyResearch(d.id); break;
      case 'station': this.openStation(JSON.parse(d.st)); g.world.focus(JSON.parse(d.st)); break;
      case 'open': this.open(d.v); break;
      case 'close': this.close(); break;
      case 'prestige-confirm': this.confirmPrestige(); break;
      case 'prestige': this.closeModal(); g.doPrestige(); break;
      case 'modal-close': this.closeModal(); break;
      case 'sound': g.setSound(!this.state.settings.sound); break;
      case 'music': g.setMusic(!this.state.settings.music); break;
      case 'quality': g.setQuality(d.v || (this.state.settings.quality === 'high' ? 'low' : 'high')); break;
      case 'save': g.save(); this.toast('Spel opgeslagen', 'save'); break;
      case 'reset-confirm': this.confirmReset(); break;
      case 'reset': g.hardReset(); break;
      case 'offline-claim': this.closeModal(); g.claimOffline(); break;
      default: break;
    }
    this.refresh();
  }

  stopHoldNow() {
    clearTimeout(this.hold);
    this.hold = null;
    if (this.heldBtn) this.heldBtn.classList.remove('held');
    this.heldBtn = null;
  }

  // ---------- Panelen ----------

  open(id, data) {
    const builders = {
      stations: () => this.stationsPanel(),
      research: () => this.researchPanel(),
      expand: () => this.expandPanel(),
      investors: () => this.investorsPanel(),
      settings: () => this.settingsPanel(),
      station: () => this.stationPanel(data),
      chain: () => this.chainPanel(),
    };
    this.panel = { id, data, ...builders[id]() };
    this.el.sheet.innerHTML = `
      <div class="sheet-head">
        <div class="sheet-icon">${this.panel.icon}</div>
        <div class="sheet-title"><h2></h2><div class="sheet-sub"></div></div>
        <div class="sheet-badge hidden"></div>
        <button class="round close" data-action="close" aria-label="Sluiten">${icon('close')}</button>
      </div>
      <div class="sheet-body"></div>`;
    this.el.sheet.classList.remove('hidden');
    requestAnimationFrame(() => this.el.sheet.classList.add('open'));
    this.lastHtml = '';
    this.refresh();
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.toggle('active', b.dataset.open === id));
  }

  openStation(st) {
    if (st.kind === 'unlock' || st.kind === 'tier') { this.open('expand'); return; }
    this.open('station', st);
  }

  close() {
    this.panel = null;
    this.el.sheet.classList.remove('open');
    this.el.sheet.classList.add('hidden');
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.remove('active'));
  }

  refresh() {
    if (!this.panel) return;
    const head = this.el.sheet.querySelector('.sheet-title h2');
    const sub = this.el.sheet.querySelector('.sheet-sub');
    const body = this.el.sheet.querySelector('.sheet-body');
    if (!body) return;
    const r = this.panel.render();
    if (head.textContent !== r.title) head.textContent = r.title;
    if (sub.innerHTML !== (r.sub || '')) sub.innerHTML = r.sub || '';
    const badge = this.el.sheet.querySelector('.sheet-badge');
    if (badge.innerHTML !== (r.badge || '')) badge.innerHTML = r.badge || '';
    badge.classList.toggle('hidden', !r.badge);
    if (r.html !== this.lastHtml) {
      body.innerHTML = r.html;
      this.lastHtml = r.html;
      // de knop die je ingedrukt houdt blijft hetzelfde element (anders mist hij het loslaten)
      const held = this.heldBtn;
      if (held) {
        const fresh = [...body.querySelectorAll('[data-hold]')].find((x) => x.dataset.kind === held.dataset.kind && x.dataset.i === held.dataset.i);
        if (fresh) {
          held.className = fresh.className + ' held';
          held.innerHTML = fresh.innerHTML;
          fresh.replaceWith(held);
        } else this.stopHoldNow();
      }
    }
  }

  amountToggle() {
    const a = this.buyAmount;
    return `<div class="amounts">${[1, 10, 'max'].map((v) => `<button class="amt ${a === v ? 'on' : ''}" data-action="amount" data-v="${v}">${v === 'max' ? 'MAX' : 'x' + v}</button>`).join('')}</div>`;
  }

  buyButton(kind, i, label = 'Upgrade') {
    const q = E.upgradeQuote(this.state, kind, i, this.buyAmount);
    const can = q.cost <= this.state.money;
    return `<button class="btn green buy ${can ? '' : 'disabled'}" data-action="upgrade" data-hold data-kind="${kind}" data-i="${i}">
      <span class="buy-l">${label} <b>+${q.count}</b></span><span class="buy-c">${money(q.cost)}</span></button>`;
  }

  // ---------- Sterren ----------

  // Lijnen: sterren (snelheid x2). Boomgaard: extra plukkers. Vrachtwagens: extra laadplekken.
  marks(kind) { return kind === 'line' ? STARS : kind === 'orchard' ? PICKER_LEVELS : DOCK_LEVELS; }

  starProgress(kind, level) {
    const m = this.marks(kind);
    const next = m.find((x) => level < x);
    if (!next) return 1;
    const prev = [1, ...m].filter((x) => x <= level).pop();
    return (level - prev) / (next - prev);
  }

  // vijf sterren per rij; na vijf begint een nieuwe rij in een andere kleur
  starRow(kind, level, count = true) {
    const n = this.marks(kind).filter((x) => level >= x).length;
    const row = Math.floor(n / 5);
    const inRow = n - row * 5;
    let html = '';
    for (let k = 0; k < 5; k++) html += `<span class="st ${k < inRow ? 'on' : ''}">${icon('star')}</span>`;
    return `<div class="stars row-${Math.min(row, 3)}">${html}${row > 0 && count ? `<span class="st-count">${n}</span>` : ''}</div>`;
  }

  starBar(kind, level) {
    const m = this.marks(kind);
    const next = m.find((x) => level < x);
    if (!next) return '';
    const pct = Math.round(this.starProgress(kind, level) * 100);
    return `<div class="star-bar"><div class="bar"><i style="width:${pct}%"></i></div>
      <span class="sb-goal">${icon('star')}<b>Lv ${next}</b>${E.starReward(kind, next).text}</span></div>`;
  }

  // Kaart van één station, zoals in Eatventure: level, sterren, balk naar de volgende ster,
  // een paar grote cijfers en één grote knop. Een waarschuwing alleen als de keten vastloopt.
  stationPanel(st) {
    return {
      icon: stationGlyph(st, LINES),
      render: () => {
        const s = this.state;
        const prod = this.game.prod;
        const ss = E.computeProduction(s, 0, true);
        const pm = E.priceMult(s);
        const q = E.upgradeQuote(s, st.kind, st.i || 0, this.buyAmount);
        const level = E.stationLevel(s, st.kind, st.i);
        const after = structuredClone(s);
        if (st.kind === 'orchard') after.orchard += q.count;
        else if (st.kind === 'sales') after.sales += q.count;
        else after.lines[st.i] += q.count;
        const ssNext = E.computeProduction(after, 0, true);
        const goTo = (kind, label) => `<button class="btn small" data-action="station" data-st='{"kind":"${kind}"}'>${label}</button>`;
        // korte, strakke melding met een knop naar de oplossing
        const warn = (text, btn = '', bad = false) => `<div class="alert-pill ${bad ? 'bad' : ''}">${icon('alert')}<b>${text}</b>${btn}</div>`;
        const chip = (label, value, up = '', cls = '') => `<div class="chip-stat ${cls}"><small>${label}</small><b>${value}</b>${up ? `<em>${up}</em>` : ''}</div>`;
        const demand = LINES.reduce((t, l, i) => t + E.lineRate(s, i) * l.apples, 0);
        let title;
        const chips = [];
        let extra = '';
        if (st.kind === 'orchard') {
          title = ORCHARD.name;
          chips.push(chip('Plukken', rate(E.orchardRate(s)) + '/s', '→ ' + rate(E.orchardRate(after)) + '/s'));
          chips.push(chip('Machines willen', rate(demand) + '/s', '', demand > E.orchardRate(s) * 1.02 ? 'bad' : ''));
          chips.push(chip('Appelbak', `${fmt(s.apples)}/${fmt(prod.binCap)}`, '', prod.binFull ? 'bad' : ''));
          if (prod.binFull && demand <= 0) extra = warn('Appelbak vol!', goTo('stations', 'Machines'));
          else if (prod.binFull) extra = warn('Appelbak vol!', goTo('stations', 'Machines'));
          else if (demand > E.orchardRate(s) * 1.02) extra = warn('Niet genoeg appels!');
        } else if (st.kind === 'sales') {
          title = SALES.name;
          const trucks = E.truckCount(level);
          const tNext = E.truckCount(level + q.count);
          chips.push(chip('Vervoer', rate(E.transportRate(s)) + '/s', '→ ' + rate(E.transportRate(after)) + '/s'));
          chips.push(chip('Fabriek maakt', rate(ss.potential) + '/s', '', ss.potential > ss.transport * 1.001 ? 'bad' : ''));
          chips.push(chip('Vrachtwagens', `${trucks}`, tNext > trucks ? `→ ${tNext}` : ''));
          chips.push(chip('Magazijn', `${fmt(s.goods)}/${fmt(prod.storeCap)}`, '', prod.storeFull ? 'bad' : ''));
          if (prod.storeFull) extra = warn('Magazijn vol!', '', true);
        } else {
          const l = LINES[st.i];
          const lp = prod.lines[st.i];
          title = l.name;
          const price = E.lineValue(s, st.i) * pm;
          const priceNext = E.lineValue(after, st.i) * pm;
          const sp = E.lineRate(s, st.i);
          const spNext = E.lineRate(after, st.i);
          const limited = lp.status !== 'ok';
          chips.push(chip('Per stuk', money(price), '+' + money(priceNext - price)));
          chips.push(chip('Snelheid', rate(sp) + '/s', spNext > sp ? `x${fmt(spNext / sp)}!` : limited ? `draait ${rate(lp.rate)}/s` : '', limited ? 'bad' : ''));
          // wat de upgrade echt extra oplevert voor je hele fabriek (appels en vrachtwagens meegerekend)
          chips.push(chip('Per minuut', money(ss.lines[st.i].income * 60), '+' + money(Math.max(0, ssNext.income - ss.income) * 60)));
          const nl = ssNext.lines[st.i];
          if (lp.status === 'full') extra = warn('Magazijn vol!', goTo('sales', 'Vrachtwagens'), true);
          else if (lp.status === 'apples') extra = warn('Niet genoeg appels!', goTo('orchard', 'Boomgaard'));
          else if (spNext > sp && nl.status === 'apples') extra = warn('Ster: meer appels nodig!', goTo('orchard', 'Boomgaard'));
          else if (spNext > sp && nl.status === 'full') extra = warn('Ster: meer vervoer nodig!', goTo('sales', 'Vrachtwagens'));
        }
        const html = `
          <div class="lv-head">${this.starBar(st.kind, level)}</div>
          <div class="chips n${chips.length}">${chips.join('')}</div>
          ${extra}
          <div class="buy-row">${this.amountToggle()}${this.buyButton(st.kind, st.i || 0)}</div>`;
        // sterren rechts in de kop, naast het kruisje
        const nStars = this.marks(st.kind).filter((x) => level >= x).length;
        const sub = `Level <b>${level}</b>${nStars >= 5 ? ` · <span class="sub-stars">${icon('star')}${nStars}</span>` : ''}`;
        return { title, sub, html, badge: this.starRow(st.kind, level, false) };
      },
    };
  }

  stationsPanel() {
    return {
      icon: icon('factory'),
      render: () => {
        const s = this.state;
        const prod = this.game.prod;
        const row = (st, icon, name, sub) => {
          const q = E.upgradeQuote(s, st.kind, st.i || 0, this.buyAmount);
          const can = q.cost <= s.money;
          return `<div class="list-row">
            <button class="list-main" data-action="station" data-st='${JSON.stringify(st)}'>
              <span class="li-icon">${icon}</span>
              <span class="li-text"><b>${name}</b><small>${sub}</small></span>
            </button>
            <button class="btn green small ${can ? '' : 'disabled'}" data-action="upgrade" data-hold data-kind="${st.kind}" data-i="${st.i || 0}">+${q.count}<br><small>${money(q.cost)}</small></button>
          </div>`;
        };
        const ssl = E.computeProduction(s, 0, true);
        let html = this.weakBox() + this.amountToggle();
        const fill = (x) => `<span class="mini-bar ${x > 0.97 ? 'full' : ''}"><i style="width:${Math.round(Math.min(1, x) * 100)}%"></i></span>`;
        html += row({ kind: 'orchard' }, glyph('orchard'), `Boomgaard <span class="lv">Lv ${s.orchard}</span>`, `${fmt(prod.supply)} appels/s · bak ${fill(s.apples / prod.binCap)}${prod.binFull ? ' <span class="warn-text">vol</span>' : ''}`);
        LINES.forEach((l, i) => {
          if (s.lines[i] > 0) {
            const lp = prod.lines[i];
            const warn = lp.status === 'full' ? ' · <span class="bad-text">vastgelopen</span>' : lp.status === 'apples' ? ' · <span class="warn-text">te weinig appels</span>' : '';
            html += row({ kind: 'line', i }, glyph(l.id), `${l.name} <span class="lv">Lv ${s.lines[i]}</span>`, `${money(ssl.lines[i].price)} per stuk · ${money(ssl.lines[i].income * 60)}/min${warn}`);
          } else if (E.lineUnlockable(s, i)) {
            const can = s.money >= l.unlock;
            html += `<div class="list-row locked"><span class="li-icon">${glyph(l.id)}</span><span class="li-text"><b>${l.name}</b><small>Nieuwe productielijn</small></span>
              <button class="btn orange small ${can ? '' : 'disabled'}" data-action="unlock" data-i="${i}">Open<br><small>${money(l.unlock)}</small></button></div>`;
          } else if (s.lines[i] === 0 && (i === 0 || s.lines[i - 1] > 0)) {
            const need = TIERS.findIndex((t) => t.slots > i);
            html += `<div class="list-row locked dim"><span class="li-icon muted">${icon('lock')}</span><span class="li-text"><b>${l.name}</b><small>Vereist uitbreiding: ${TIERS[need].name}</small></span>
              <button class="btn small" data-action="open" data-v="expand">Bekijk</button></div>`;
          }
        });
        const use = ssl.transport > 0 ? Math.round(Math.min(1, ssl.potential / ssl.transport) * 100) : 0;
        html += row({ kind: 'sales' }, glyph('sales'), `Vrachtwagens <span class="lv">Lv ${s.sales}</span>`, `${rate(prod.transport)} kratten/s · bezet ${use}% · magazijn ${fill(s.goods / prod.storeCap)}${prod.storeFull ? ' <span class="bad-text">vol</span>' : ''}`);
        return { title: 'Je fabriek', sub: `${TIERS[s.tier].name} · ≈ ${money(E.incomePerSecond(s) * 60)}/min`, html };
      },
    };
  }

  weakBox() {
    const s = this.state;
    if (!s.lines.some((x) => x > 0)) return '';
    const c = E.chainBalance(s);
    const info = {
      pick: ['orchard', 'Niet genoeg appels', { kind: 'orchard' }],
      machines: ['fresh', 'Machines te traag', null],
      transport: ['sales', 'Te weinig vervoer', { kind: 'sales' }],
    }[c.weakest];
    const btn = info[2] ? `<button class="btn small" data-action="station" data-st='${JSON.stringify(info[2])}'>Bekijk</button>` : '';
    return `<div class="weak-box">${glyph(info[0])}<div><b>Zwakste schakel</b><br><small>${info[1]}</small></div>${btn}</div>`;
  }

  chainPanel() {
    this.state.stats.chain = 1;
    const series = [
      ['pick', 'Boomgaard plukt', '#3fae4d', 'orchard', { kind: 'orchard' }],
      ['machines', 'Machines verwerken', '#f08a24', 'fresh', null],
      ['transport', 'Vrachtwagens vervoeren', '#3d8bef', 'sales', { kind: 'sales' }],
    ];
    return {
      icon: icon('chart'),
      render: () => {
        const s = this.state;
        const c = E.chainBalance(s);
        const max = Math.max(c.pick, c.machines, c.transport, 1e-9);
        const bars = series.map(([k, label, color, gl, st]) => {
          const weak = k === c.weakest;
          const pct = Math.max(2, Math.round((c[k] / max) * 100));
          const open = st ? ` data-action="station" data-st='${JSON.stringify(st)}'` : ' data-action="open" data-v="stations"';
          return `<button class="cb-row ${weak ? 'cb-weak' : ''}"${open}>${glyph(gl)}<span>
            <span class="cb-top"><span>${label}${weak ? '<span class="tag-weak">zwakste schakel</span>' : ''}</span><b>${fmt(c[k])} appels/s</b></span>
            <span class="cb-track"><i style="width:${pct}%;background:${color}"></i></span></span></button>`;
        }).join('');
        const h = this.history;
        let chart = '<div class="tip small">De grafiek vult zich terwijl je speelt.</div>';
        if (h.length >= 2) {
          const W = 300, H = 120;
          const top = Math.max(...h.flatMap((p) => [p.pick, p.machines, p.transport]), 1e-9) * 1.1;
          const path = (k) => h.map((p, j) => `${j ? 'L' : 'M'}${((j / (h.length - 1)) * W).toFixed(1)},${(H - (p[k] / top) * H).toFixed(1)}`).join('');
          const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="#eee4d3" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('');
          const mins = Math.max(1, Math.round(((h.length - 1) * 2) / 60));
          chart = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}
            ${series.map(([k, , color]) => `<path d="${path(k)}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`).join('')}</svg>
            <div class="legend">${series.map(([, label, color]) => `<span><i style="background:${color}"></i>${label}</span>`).join('')}<span>laatste ${mins} min</span></div></div>`;
        }
        const html = `<div class="chain-bars">${bars}</div>${chart}`;
        return { title: 'Ketenbalans', sub: 'Alles in appels per seconde', html };
      },
    };
  }

  upgradeDesc(u) {
    const m = 'x' + String(u.mult).replace('.', ',');
    if (u.target === 'orchard') return `Boomgaard ${m}`;
    if (u.target === 'transport') return `Vrachtwagens ${m}`;
    if (u.target === 'all') return `Alle prijzen ${m}`;
    const l = LINES.find((x) => x.id === u.target);
    return `${l.name} ${u.type === 'price' ? 'prijs' : 'snelheid'} ${m}`;
  }

  upgradeIcon(u) {
    if (u.target === 'orchard') return glyph('orchard');
    if (u.target === 'transport') return glyph('sales');
    if (u.target === 'all') return icon('star', 'gold-ic');
    return glyph(u.target);
  }

  // Upgrades zoals het upgrade-menu van Eatventure: goedkoopste eerst, één knop per upgrade.
  researchPanel() {
    return {
      icon: icon('up'),
      render: () => {
        const s = this.state;
        const avail = UPGRADES.filter((u) => E.upgradeAvailable(s, u)).sort((a, b) => a.cost - b.cost);
        const locked = UPGRADES.filter((u) => !s.research[u.id] && !E.upgradeAvailable(s, u)).sort((a, b) => a.cost - b.cost);
        const owned = UPGRADES.filter((u) => s.research[u.id]).length;
        let html = '';
        if (avail.length === 0 && locked.length === 0) html += '<div class="tip">Alle upgrades gekocht!</div>';
        else if (avail.length === 0) html += '<div class="tip">Nieuwe upgrades komen met je volgende productielijn.</div>';
        // simpel: wat het doet (groot), de naam (klein) en de prijs op de knop
        html += avail.slice(0, 6).map((u) => {
          const can = s.money >= u.cost;
          const type = u.type === 'speed' ? `<i class="upg-type speed">${icon('bolt')}</i>` : `<i class="upg-type price">€</i>`;
          return `<div class="card upg ${can ? 'can' : ''}"><span class="upg-ic">${this.upgradeIcon(u)}${type}</span>
            <div class="card-text"><b>${this.upgradeDesc(u)}</b><small>${u.name}</small></div>
            <button class="btn blue ${can ? '' : 'disabled'}" data-action="research" data-id="${u.id}">${money(u.cost)}</button></div>`;
        }).join('');
        return { title: 'Upgrades', sub: `${owned} van ${UPGRADES.length} gekocht`, html };
      },
    };
  }

  expandPanel() {
    return {
      icon: icon('expand'),
      render: () => {
        const s = this.state;
        const next = E.nextTier(s);
        const cur = TIERS[s.tier];
        let html = '';
        // eerst eventueel een lijn die al geopend kan worden
        LINES.forEach((l, i) => {
          if (E.lineUnlockable(s, i)) {
            const can = s.money >= l.unlock;
            const c = structuredClone(s);
            c.lines[i] = 1;
            const cp = E.computeProduction(c, 0, true).lines[i];
            html += `<div class="card highlight"><div class="big-icon">${glyph(l.id)}</div><div class="card-text"><b>Nieuwe lijn: ${l.name}</b>
              <small>${money(l.value * E.priceMult(s))} per stuk · ${l.apples} ${l.apples === 1 ? 'appel' : 'appels'} per stuk</small>
              <small>Op level 1: ${fmt(E.lineRate(c, i))}/s, levert ${money(cp.income * 60)} per minuut</small></div>
              <button class="btn orange ${can ? '' : 'disabled'}" data-action="unlock" data-i="${i}">${money(l.unlock)}</button></div>`;
          }
        });
        if (next) {
          const perks = [];
          if (next.slots > cur.slots) perks.push(`Ruimte voor productielijn ${next.slots}: <b>${LINES[next.slots - 1].name}</b>`);
          perks.push(`Alle inkomsten <b>x${String(next.mult).replace('.', ',')}</b>`);
          if (next.orchard > 1) perks.push(`Boomgaard <b>x${String(next.orchard).replace('.', ',')}</b> appels`);
          if (next.plots > cur.plots) perks.push(`Extra boomgaardperceel (${next.plots} totaal)`);
          const can = s.money >= next.cost;
          html += `<div class="card tier-next">
            <div class="tier-name">Volgende: <b>${next.name}</b></div>
            <ul class="perks">${perks.map((p) => `<li>${p}</li>`).join('')}</ul>
            <button class="btn orange wide ${can ? '' : 'disabled'}" data-action="tier">Uitbreiden · ${money(next.cost)}</button>
            ${can ? '' : `<small class="eta">Nog ${duration((next.cost - s.money) / Math.max(1e-9, this.game.prod.income))} sparen bij huidig inkomen</small>`}
          </div>`;
        } else {
          html += `<div class="tip">Je hebt de grootste fabriek die er bestaat! Haal investeerders binnen om nog sneller te groeien.</div>`;
        }
        html += `<div class="tier-path">${TIERS.map((t, k) => `<div class="tp ${k < s.tier ? 'done' : k === s.tier ? 'cur' : ''}"><span>${k <= s.tier ? icon('check') : k + 1}</span>${t.name}</div>`).join('')}</div>`;
        return { title: 'Uitbreiden', sub: `Nu: <b>${cur.name}</b>`, html };
      },
    };
  }

  investorsPanel() {
    return {
      icon: icon('star', 'gold-ic'),
      render: () => {
        const s = this.state;
        const pend = E.pendingInvestors(s);
        const nextAt = E.earningsForInvestors(E.investorsFor(s.totalEarned) + 1);
        const needed = nextAt - s.totalEarned;
        const bonusNow = s.investors * INVESTOR_BONUS;
        const bonusAfter = (s.investors + pend) * INVESTOR_BONUS;
        const html = `
          <div class="inv-hero"><div class="star">${icon('star', 'gold-ic')}</div><div><b>${fmt(s.investors)}</b> investeerders<br><small>+${fmt(bonusNow * 100)}% inkomen</small></div></div>
          <div class="tip">Verkoop je fabriek aan investeerders en begin opnieuw met een bonus. Elke investeerder geeft <b>+${INVESTOR_BONUS * 100}%</b> inkomen, voor altijd.</div>
          <div class="stats">
            <div class="row"><span>Verdiend deze ronde</span><b>${money(s.runEarned)}</b></div>
            <div class="row"><span>Totaal verdiend</span><b>${money(s.totalEarned)}</b></div>
            <div class="row"><span>Volgende investeerder over</span><b>${money(needed)}</b></div>
            <div class="row"><span>Nieuwe investeerders nu</span><b class="gold">+${fmt(pend)}</b></div>
            <div class="row"><span>Bonus na verkoop</span><b>+${fmt(bonusNow * 100)}%</b><em>→ +${fmt(bonusAfter * 100)}%</em></div>
          </div>
          <div class="tip small">Je houdt: investeerders, doelen en statistieken. Je verliest: geld, levels, upgrades en uitbreidingen.</div>
          <button class="btn gold wide ${pend > 0 ? '' : 'disabled'}" data-action="prestige-confirm">Verkoop fabriek · +${fmt(pend)} investeerders</button>`;
        return { title: 'Investeerders', sub: `Ronde ${s.prestiges + 1}`, html };
      },
    };
  }

  settingsPanel() {
    return {
      icon: icon('gear'),
      render: () => {
        const s = this.state;
        const html = `
          <div class="list-row"><span class="li-text"><b>Muziek</b><small>Factory Flow</small></span><button class="btn small ${s.settings.music ? 'green' : ''}" data-action="music">${s.settings.music ? 'Aan' : 'Uit'}</button></div>
          <div class="list-row"><span class="li-text"><b>Geluidseffecten</b></span><button class="btn small ${s.settings.sound ? 'green' : ''}" data-action="sound">${s.settings.sound ? 'Aan' : 'Uit'}</button></div>
          <div class="list-row"><span class="li-text"><b>Graphics</b><small>Zuinig: geen schaduwen, 30 fps</small></span>
            <div class="amounts"><button class="amt ${s.settings.quality === 'high' ? 'on' : ''}" data-action="quality" data-v="high">Hoog</button><button class="amt ${s.settings.quality !== 'high' ? 'on' : ''}" data-action="quality" data-v="low">Zuinig</button></div></div>
          <div class="stats">
            <div class="row"><span>Speeltijd</span><b>${duration(s.playTime)}</b></div>
            <div class="row"><span>Totaal verdiend</span><b>${money(s.totalEarned)}</b></div>
            <div class="row"><span>Fabrieken verkocht</span><b>${s.prestiges}</b></div>
            <div class="row"><span>Gouden appels gevangen</span><b>${s.stats.golden}</b></div>
          </div>
          <div class="btn-row"><button class="btn blue" data-action="save">Opslaan</button><button class="btn red" data-action="reset-confirm">Reset spel</button></div>
          <div class="tip small">Je voortgang wordt automatisch in deze browser bewaard. Bediening: sleep om te bewegen, scroll of knijp om te zoomen, tik op een station om te upgraden.</div>`;
        return { title: 'Instellingen', sub: 'Appel Tycoon', html };
      },
    };
  }

  // ---------- Modals ----------

  modal(html, dismiss = true) {
    this.modalDismiss = dismiss;
    this.el.modalCard.innerHTML = html;
    this.el.modal.classList.remove('hidden');
  }

  closeModal() { this.el.modal.classList.add('hidden'); }

  confirmPrestige() {
    const pend = E.pendingInvestors(this.state);
    this.modal(`<div class="modal-icon">${icon('star', 'gold-ic')}</div><h2>Fabriek verkopen?</h2>
      <p>Je krijgt <b>+${fmt(pend)}</b> investeerders (totaal ${fmt(this.state.investors + pend)}, +${fmt((this.state.investors + pend) * INVESTOR_BONUS * 100)}% inkomen) en begint opnieuw met een schuurtje.</p>
      <div class="btn-row"><button class="btn" data-action="modal-close">Annuleren</button><button class="btn gold" data-action="prestige">Verkopen!</button></div>`);
  }

  confirmReset() {
    this.modal(`<div class="modal-icon red-ic">${icon('trash')}</div><h2>Alles wissen?</h2><p>Al je voortgang, ook investeerders, wordt verwijderd. Dit kan niet ongedaan worden.</p>
      <div class="btn-row"><button class="btn" data-action="modal-close">Annuleren</button><button class="btn red" data-action="reset">Wissen</button></div>`);
  }

  offline(amount, seconds, capped) {
    const text = capped
      ? `Je was ${duration(seconds)} weg. Je fabriek heeft maximaal ${Math.round(capped / 3600)} uur doorgewerkt.`
      : `Terwijl je ${duration(seconds)} weg was, heeft je fabriek doorgewerkt.`;
    this.modal(`<div class="modal-icon">${glyph('fresh')}</div><h2>Welkom terug!</h2>
      <p>${text}</p>
      <div class="offline-amount">${money(amount)}</div>
      <button class="btn green wide" data-action="offline-claim">Ophalen</button>`, false);
  }

  welcome() {
    this.modal(`<div class="modal-icon">${glyph('fresh')}</div><h2>Appel Tycoon</h2>
      <p>Je begint met een klein schuurtje en een paar appelbomen. Maak er appelproducten van, verkoop ze en groei uit tot een enorme fabriek.</p>
      <p>Bovenin helpen we je stap voor stap op weg.</p>
      <button class="btn green wide" data-action="modal-close">Starten!</button>`, true);
  }

  newVersion(from) {
    const what = from === 2
      ? 'Elke upgrade maakt je producten nu meer waard. Bij een <b>ster</b> wordt een machine sneller of meer waard, en in het menu <b>Upgrades</b> vind je flinke bonussen.'
      : 'De balans is vernieuwd: <b>al je machines verdienen nu mee</b>, niet alleen de nieuwste. Ook de taken, boomgaard en vrachtwagens zijn opnieuw afgesteld.';
    this.modal(`<div class="modal-icon">${icon('star', 'gold-ic')}</div><h2>Nieuwe versie!</h2>
      <p>${what}</p>
      <p>Je begint een nieuwe ronde. Je <b>${fmt(this.state.investors)} investeerders</b> blijven.</p>
      <button class="btn green wide" data-action="modal-close">Starten!</button>`, true);
  }

  // ---------- Meldingen & effecten ----------

  // Grote melding bij een nieuwe ster.
  starBanner(name, text, n, kind) {
    document.querySelectorAll('.star-toast').forEach((x) => x.remove());
    let hint = '';
    if (kind === 'line') {
      const p = E.computeProduction(this.state, 0, true);
      if (p.lines.some((l) => l.status === 'apples')) hint = 'Boomgaard moet mee!';
      else if (p.potential > p.transport * 1.001) hint = 'Vrachtwagens moeten mee!';
    }
    const b = document.createElement('div');
    b.className = 'toast star-toast';
    b.innerHTML = `<span class="stt-star">${icon('star')}<i>${n}</i></span><span class="stt-text"><b>${text}</b> <span>${name}</span>${hint ? `<em>${hint}</em>` : ''}</span>`;
    this.el.toasts.prepend(b);
    setTimeout(() => b.classList.add('out'), 2600);
    setTimeout(() => b.remove(), 3000);
  }

  floatAtStation(st, text) {
    const w = this.game.world;
    const p = w.toScreen(w.stationPos(st).setY(4.5));
    if (!p.visible) return;
    this.float(p.x + (Math.random() - 0.5) * 30, p.y, text, 'price');
  }


  toast(text, ic = '') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${ic.startsWith('<') ? ic : ic ? icon(ic) : ''}<span>${text}</span>`;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
  }

  float(x, y, text, cls = '') {
    const f = document.createElement('div');
    f.className = 'float ' + cls;
    f.textContent = text;
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    this.el.fx.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  goalHint() {
    const g = goalAt(this.state.goal);
    const map = { level: () => (g.kind === 'line' ? { kind: 'line', i: g.i } : { kind: g.kind }), unlock: () => ({ kind: 'unlock', i: g.i }), tier: () => ({ kind: 'tier' }) };
    if (map[g.type]) {
      const st = map[g.type]();
      this.game.world.focus(st);
      if (st.kind === 'unlock' || st.kind === 'tier') this.open('expand'); else this.openStation(st);
    } else if (g.type === 'research') this.open('research');
    else if (g.type === 'prestige') this.open('investors');
    else if (g.type === 'income') this.open('stations');
  }

  // ---------- Per frame ----------

  update(now) {
    const s = this.state;
    const prod = this.game.prod;
    this.el.money.textContent = money(s.money);
    this.updateLabels(now);

    if (now - this.lastSlow > 250) {
      this.lastSlow = now;
      // geld komt binnen per vertrekkende vrachtwagen; we tonen het gemiddelde per minuut
      this.el.income.textContent = `≈ ${money(E.incomePerSecond(s) * 60)}/min`;
      this.el.inv.textContent = fmt(s.investors);
      this.updateTutorial();
      if (tutorialDone(s)) this.updateGoal(E.incomePerSecond(s));
      this.updateBadges();
      this.updateVisibility();
      this.updateChainMini();
      // meldingen komen net onder de HUD (die is hoger tijdens de intro of met de ketenbalkjes)
      const hb = Math.round(document.querySelector('#hud').getBoundingClientRect().bottom);
      if (hb !== this.hudBottom) { this.hudBottom = hb; document.body.style.setProperty('--hud-bottom', `${hb}px`); }
      this.refresh();
      this.updateLabelContent();
    }
    // geschiedenis voor de ketengrafiek (elke 2 seconden, 3 minuten lang)
    if (now - this.lastSample > 2000 && s.lines.some((x) => x > 0)) {
      this.lastSample = now;
      const c = E.chainBalance(s);
      this.history.push({ pick: c.pick, machines: c.machines, transport: c.transport });
      if (this.history.length > 91) this.history.shift();
    }
  }

  // ---------- Tutorial ----------

  // De tutorial loopt rustig: elke stap blijft minstens even staan (zodat je hem kunt lezen),
  // een gehaalde stap krijgt eerst een vinkje, en dan schuift de volgende er soepel in.
  advanceTutorial() {
    const s = this.state;
    if (tutorialDone(s) || this.tutPhase === 'done' || this.tutPhase === 'out') return;
    this.finishTutStep(false);
  }

  finishTutStep(praise = true) {
    const s = this.state;
    const el = this.el.tut;
    this.tutPhase = 'done';
    this.tutTarget = null;
    if (praise) {
      el.classList.add('tut-done');
      this.el.tutStep.innerHTML = `${icon('check')} Goed zo!`;
      this.el.tutBtn.classList.add('hidden');
      sfx.coin();
    } else sfx.click();
    clearTimeout(this.tutTimer);
    this.tutTimer = setTimeout(() => {
      this.tutPhase = 'out';
      el.classList.add('tut-out');
      this.tutTimer = setTimeout(() => {
        s.tutorial++;
        el.classList.remove('tut-done', 'tut-out');
        this.tutPhase = null;
        this.tutShown = -1;
        this.updateTutorial();
      }, 320);
    }, praise ? 1300 : 0);
  }

  showTutStep() {
    const s = this.state;
    const step = TUTORIAL[s.tutorial];
    const el = this.el.tut;
    this.tutShown = s.tutorial;
    this.tutPhase = 'show';
    this.tutSince = performance.now();
    // leestijd: ongeveer 4 woorden per seconde, minstens 2,5 en hooguit 6 seconden
    this.tutMin = Math.min(6000, Math.max(2500, step.text.split(/\s+/).length * 250));
    const dots = TUTORIAL.map((_, k) => `<i class="${k < s.tutorial ? 'past' : k === s.tutorial ? 'cur' : ''}"></i>`).join('');
    this.el.tutStep.innerHTML = `<span class="tut-dots">${dots}</span>`;
    this.el.tutText.textContent = step.text;
    this.el.tutBtn.textContent = step.button || '';
    this.el.tutBtn.classList.toggle('hidden', !step.button);
    // opnieuw laten inschuiven
    el.classList.remove('tut-in');
    void el.offsetWidth;
    el.classList.add('tut-in');
    this.tutTarget = step.target ? JSON.stringify(step.target) : null;
    if (step.target) this.game.world.focus(step.target);
  }

  updateTutorial() {
    const s = this.state;
    if (this.tutPhase === 'done' || this.tutPhase === 'out') return;
    // stappen die je al gedaan hebt slaan we over zonder ze te tonen
    while (!tutorialDone(s) && this.tutShown !== s.tutorial && TUTORIAL[s.tutorial].done && TUTORIAL[s.tutorial].done(s)) s.tutorial++;
    const done = tutorialDone(s);
    this.el.tut.classList.toggle('hidden', done);
    this.el.goal.classList.toggle('hidden', !done);
    if (done) { this.tutTarget = null; return; }
    if (this.tutShown !== s.tutorial) { this.showTutStep(); return; }
    const step = TUTORIAL[s.tutorial];
    if (step.done && step.done(s) && performance.now() - this.tutSince >= this.tutMin) this.finishTutStep(true);
  }

  // Drie balkjes onder het geld: plukken (groen), verwerken (oranje) en vervoeren (blauw).
  updateChainMini() {
    const s = this.state;
    const on = s.lines.some((x) => x > 0) && tutorialDone(s);
    this.el.chainMini.classList.toggle('hidden', !on);
    if (!on) return;
    const c = E.chainBalance(s);
    const max = Math.max(c.pick, c.machines, c.transport, 1e-9);
    const bars = this.el.chainMini.querySelectorAll('b');
    [c.pick, c.machines, c.transport].forEach((v, k) => { bars[k].style.width = `${Math.max(4, Math.round((v / max) * 100))}%`; });
  }

  // Knoppen pas tonen als ze nodig zijn, zodat het begin overzichtelijk blijft.
  updateVisibility() {
    const s = this.state;
    const show = (sel, on) => document.querySelector(sel).classList.toggle('hidden', !on);
    const tut = tutorialDone(s);
    show('[data-open="stations"]', s.lines[0] > 0);
    show('[data-open="research"]', tut || Object.keys(s.research).length > 0);
    show('[data-open="expand"]', s.lines[1] > 0 || s.tier > 0);
    show('#btn-investors', s.investors > 0 || s.prestiges > 0 || E.pendingInvestors(s) > 0);
  }

  updateGoal(income) {
    const g = goalAt(this.state.goal);
    const p = goalProgress(g, this.state, income);
    const done = p.cur >= p.max;
    this.el.goalText.innerHTML = `${g.text} <small>${g.type === 'income' ? '' : `(${fmt(p.cur)}/${fmt(p.max)})`}</small>`;
    this.el.goalBar.style.width = Math.round((p.cur / p.max) * 100) + '%';
    this.el.goal.style.setProperty('--p', Math.round((p.cur / p.max) * 100));
    this.el.goalClaim.classList.toggle('hidden', !done);
    const label = `${icon('gift')} ${money(goalReward(g, income))}`;
    if (this.el.goalClaim.innerHTML !== label) this.el.goalClaim.innerHTML = label;
    this.el.goal.classList.toggle('done', done);
  }

  // Een vrachtwagen vertrekt met zijn lading: daar verdien je je geld.
  truckSale(world, k, amount) {
    const p = world.toScreen(world.truckPosition(k).setY(3.2));
    if (!p.visible || p.x < 0 || p.x > window.innerWidth || p.y < 60 || p.y > window.innerHeight) return;
    this.float(p.x, p.y, '+' + money(amount), 'cash');
  }

  updateBadges() {
    const s = this.state;
    const r = UPGRADES.filter((x) => E.upgradeAvailable(s, x) && s.money >= x.cost).length;
    const rb = document.querySelector('[data-open="research"] .badge');
    rb.classList.toggle('hidden', r === 0);
    rb.textContent = r;
    const t = E.nextTier(s);
    const canTier = (t && s.money >= t.cost) || LINES.some((l, i) => E.lineUnlockable(s, i) && s.money >= l.unlock);
    const eb = document.querySelector('[data-open="expand"] .badge');
    eb.classList.toggle('hidden', !canTier);
    eb.textContent = '!';
    // rood randje om de ketenbalkjes als het magazijn vol zit (alles loopt dan vast)
    this.el.chainMini.classList.toggle('alert', this.game.prod.storeFull);
    const ib = document.querySelector('#btn-investors');
    ib.classList.toggle('glow', E.pendingInvestors(s) >= Math.max(5, s.investors * 0.5));
  }

  // ---------- Labels boven stations ----------

  updateLabels() {
    const w = this.game.world;
    const anchors = w.anchors(this.state);
    const keys = new Set();
    const zoomedOut = w.viewSize > 75;
    for (const a of anchors) {
      keys.add(a.key);
      let el = this.labels.get(a.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'label label-' + a.st.kind;
        el.dataset.st = JSON.stringify(a.st);
        this.el.labels.appendChild(el);
        this.labels.set(a.key, el);
        el._st = a.st;
        this.fillLabel(el);
      }
      const stJson = JSON.stringify(a.st);
      if (el.dataset.st !== stJson) { el.dataset.st = stJson; el._st = a.st; this.fillLabel(el); }
      const p = w.toScreen(a.pos);
      if (a.st.kind === 'golden') {
        const m = 44;
        const out = p.x < m || p.x > window.innerWidth - m || p.y < 130 || p.y > window.innerHeight - 100;
        p.x = Math.min(window.innerWidth - m, Math.max(m, p.x));
        p.y = Math.min(window.innerHeight - 100, Math.max(130, p.y));
        p.visible = out;
        el.classList.toggle('edge', out);
      }
      const hide = !p.visible || (zoomedOut && a.st.kind === 'line');
      el.style.display = hide ? 'none' : '';
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [k, el] of this.labels) {
      if (!keys.has(k)) { el.remove(); this.labels.delete(k); }
    }
  }

  updateLabelContent() {
    for (const el of this.labels.values()) this.fillLabel(el);
  }

  fillLabel(el) {
    const s = this.state;
    const st = el._st;
    let html = '';
    let can = false;
    if (st.kind === 'orchard' || st.kind === 'sales' || st.kind === 'line') {
      const lv = E.stationLevel(s, st.kind, st.i);
      can = E.upgradeQuote(s, st.kind, st.i || 0, 1).cost <= s.money;
      const prod = this.game.prod;
      let warn = '';
      let bar = '';
      if (st.kind === 'line') {
        const status = prod.lines[st.i].status;
        if (status === 'full') warn = '<span class="warn-dot bad">!</span>';
        else if (status === 'apples') warn = '<span class="warn-dot">!</span>';
      } else {
        const f = st.kind === 'orchard' ? s.apples / prod.binCap : s.goods / prod.storeCap;
        const pct = Math.round(Math.min(1, f) * 20) * 5;
        const full = st.kind === 'orchard' ? prod.binFull : prod.storeFull;
        bar = `<span class="lb-bar ${full ? 'full' : ''}"><i style="width:${pct}%"></i></span>${full ? '<span class="lb-full">VOL</span>' : ''}`;
      }
      html = `<span class="lb-icon">${stationGlyph(st, LINES)}</span><span class="lb-lv">Lv ${lv}</span>${bar}${warn}${can ? `<span class="up">${icon('up')}</span>` : ''}`;
    } else if (st.kind === 'unlock') {
      const l = LINES[st.i];
      can = s.money >= l.unlock;
      html = `<span class="lb-icon">${glyph(l.id)}</span><span>${l.name}<br><b>${money(l.unlock)}</b></span>`;
    } else if (st.kind === 'tier') {
      const t = E.nextTier(s);
      if (!t) return;
      can = s.money >= t.cost;
      html = `<span class="lb-icon tier-ic">${icon('expand')}</span><span>${t.name}<br><b>${money(t.cost)}</b></span>`;
    } else if (st.kind === 'dock') {
      html = `<span class="lb-icon">${glyph('sales')}</span><span>Nieuwe laadplek<br><b>level ${st.level}</b></span>`;
    } else if (st.kind === 'golden') {
      html = `<span class="lb-icon">${glyph('gold')}</span>`;
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.classList.toggle('can', can);
    el.classList.toggle('tut', this.tutTarget === el.dataset.st);
  }
}
