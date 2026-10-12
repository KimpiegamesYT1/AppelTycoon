// Alle HTML-interface: HUD, panelen, labels boven stations, meldingen.
import * as E from './economy.js';
import { LINES, TIERS, UPGRADES, ORCHARD, SALES, DOCK_LEVELS, PICKER_LEVELS, STARS, INVESTOR_BONUS, STAFF } from './config.js';
import { fmt, money, duration, rate } from './format.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { sfx } from './audio.js';
import { TUTORIAL, tutorialDone } from './tutorial.js';
import { icon, glyph, stationGlyph, avatar } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const clock = (sec) => { const t = Math.max(0, Math.ceil(sec)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const mul = (n) => 'x' + String(n).replace('.', ',');
// vaardigheden van een werknemer als kleine labels
const skillTags = (e) => (e.speed ? `<span class="sk sk-speed">${icon('bolt')}Snelheid ${mul(e.speed)}</span>` : '')
  + (e.price ? `<span class="sk sk-price">€ Prijs ${mul(e.price)}</span>` : '');
const stationName = (at) => (at.kind === 'line' ? LINES[at.i].name : at.kind === 'orchard' ? 'Boomgaard' : 'Vervoer');

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
      case 'quality': g.setQuality(d.v || 'auto'); break;
      case 'save': g.save(); this.toast('Spel opgeslagen', 'save'); break;
      case 'update': this.updateButton(); break;
      case 'reset-confirm': this.confirmReset(); break;
      case 'reset': g.hardReset(); break;
      case 'offline-claim': this.closeModal(); g.claimOffline(); break;
      case 'hire': if (g.hireStaff(d.id)) this.panel.data = { pick: d.id }; break;
      case 'staff-place': sfx.click(); this.panel.data = { pick: d.id }; this.lastHtml = ''; break;
      case 'staff-back': sfx.click(); this.panel.data = {}; this.lastHtml = ''; break;
      case 'staff-to': if (g.placeStaff(d.id, JSON.parse(d.st))) { this.panel.data = {}; this.lastHtml = ''; } break;
      case 'staff-off': g.unplaceStaff(d.id); break;
      case 'staff-start': g.activateStaff(d.id); break;
      case 'office-intro': this.closeModal(); this.open('office'); g.world.focus({ kind: 'office' }); break;
      case 'staff-for': sfx.click(); this.open('office', { for: JSON.parse(d.st) }); break;
      case 'staff-pick': {
        const at = this.panel.data.for;
        if (g.placeStaff(d.id, at)) this.openStation(at);
        break;
      }
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
      research: () => this.researchPanel(),
      expand: () => this.expandPanel(),
      investors: () => this.investorsPanel(),
      settings: () => this.settingsPanel(),
      station: () => this.stationPanel(data),
      chain: () => this.chainPanel(),
      office: () => this.officePanel(),
    };
    this.panel = { id, data: data || {}, ...builders[id]() };
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
    this.updateTimers(body);
  }

  // Aftellers en balkjes van werknemers: elke keer bijwerken zonder het hele paneel opnieuw te tekenen
  // (anders mis je soms een tik op een knop).
  updateTimers(root) {
    const now = Date.now();
    root.querySelectorAll('[data-until]').forEach((el) => {
      const t = clock((+el.dataset.until - now) / 1000);
      if (el.textContent !== t) el.textContent = t;
    });
    root.querySelectorAll('[data-from]').forEach((el) => {
      const a = +el.dataset.from, b = +el.dataset.to;
      const w = `${Math.max(0, Math.min(100, ((b - now) / (b - a)) * 100)).toFixed(1)}%`;
      if (el.style.width !== w) el.style.width = w;
    });
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

  // Lijnen: sterren (snelheid x2). Boomgaard: extra plukkers. Vervoer: extra (en grotere) voertuigen.
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
        const goTo = (st, label) => `<button class="btn small" data-action="station" data-st='${JSON.stringify(typeof st === 'string' ? { kind: st } : st)}'>${label}</button>`;
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
          // als percentage: grote getallen (45,6K/50,0K) passen niet in het vakje
          chips.push(chip('Appelbak', `${Math.min(100, Math.round((s.apples / prod.binCap) * 100))}%`, prod.binFull ? 'vol' : '', prod.binFull ? 'bad' : ''));
          if (prod.binFull) extra = warn('Appelbak vol!', goTo(this.cheapestLine(), 'Machines'));
          else if (demand > E.orchardRate(s) * 1.02) extra = warn('Niet genoeg appels!');
        } else if (st.kind === 'sales') {
          title = SALES.name;
          const trucks = E.truckCount(level);
          const tNext = E.truckCount(level + q.count);
          chips.push(chip('Vervoer', rate(E.transportRate(s)) + '/s', '→ ' + rate(E.transportRate(after)) + '/s'));
          chips.push(chip('Fabriek maakt', rate(ss.potential) + '/s', '', ss.potential > ss.transport * 1.001 ? 'bad' : ''));
          const veh = E.vehicle(level), vNext = E.vehicle(level + q.count);
          chips.push(chip(veh.plural[0].toUpperCase() + veh.plural.slice(1), `${trucks}`, vNext !== veh ? `→ ${vNext.name}` : tNext > trucks ? `→ ${tNext}` : ''));
          chips.push(chip('Magazijn', `${Math.min(100, Math.round((s.goods / prod.storeCap) * 100))}%`, prod.storeFull ? 'vol' : '', prod.storeFull ? 'bad' : ''));
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
          if (lp.status === 'full') extra = warn('Magazijn vol!', goTo('sales', 'Vervoer'), true);
          else if (lp.status === 'apples') extra = warn('Niet genoeg appels!', goTo('orchard', 'Boomgaard'));
          else if (spNext > sp && nl.status === 'apples') extra = warn('Ster: meer appels nodig!', goTo('orchard', 'Boomgaard'));
          else if (spNext > sp && nl.status === 'full') extra = warn('Ster: meer vervoer nodig!', goTo('sales', 'Vervoer'));
        }
        const html = `
          <div class="lv-head">${this.starBar(st.kind, level)}</div>
          <div class="chips n${chips.length}">${chips.join('')}</div>
          ${extra}${this.staffStrip(st)}
          <div class="buy-row">${this.amountToggle()}${this.buyButton(st.kind, st.i || 0)}</div>`;
        // sterren rechts in de kop, naast het kruisje
        const nStars = this.marks(st.kind).filter((x) => level >= x).length;
        const sub = `Level <b>${level}</b>${nStars >= 5 ? ` · <span class="sub-stars">${icon('star')}${nStars}</span>` : ''}`;
        return { title, sub, html, badge: this.starRow(st.kind, level, false) };
      },
    };
  }

  // Superwerknemer bij dit station: één smalle regel. Staat er niemand, dan tonen we niets
  // (plaatsen gaat via het Kantoor), zodat de kaart compact blijft.
  staffStrip(st) {
    const s = this.state;
    const id = E.staffAt(s, st.kind, st.i || 0);
    if (!id) return '';
    const e = E.staffDef(id);
    const r = s.staff.hired[id];
    const status = E.staffStatus(r);
    const right = status === 'ready' ? `<span class="btn small gold pulse">${icon('bolt')} Start</span>`
      : status === 'active' ? `<span class="ss ss-active">${icon('bolt')}<b data-until="${r.until}"></b></span>`
        : `<span class="ss ss-rest">${icon('zzz')}<b data-until="${r.rest}"></b></span>`;
    return `<button class="staff-strip st-${status}" data-action="${status === 'ready' ? 'staff-start' : 'staff-for'}" data-id="${id}" data-st='${JSON.stringify(st)}'>
      <span class="sc-ava">${avatar(e)}</span><b>${e.name}</b>${skillTags(e)}<span class="ss-right">${right}</span></button>`;
  }

  // De machine die nu het goedkoopst een level omhoog kan (voor 'Machines'-knoppen).
  cheapestLine() {
    const s = this.state;
    let best = 0, cost = Infinity;
    LINES.forEach((l, i) => {
      if (s.lines[i] <= 0) return;
      const c = E.upgradeQuote(s, 'line', i, 1).cost;
      if (c < cost) { cost = c; best = i; }
    });
    return { kind: 'line', i: best };
  }

  chainPanel() {
    this.state.stats.chain = 1;
    const series = [
      ['pick', 'Boomgaard plukt', '#3fae4d', 'orchard', { kind: 'orchard' }],
      ['machines', 'Machines verwerken', '#f08a24', 'fresh', null],
      ['transport', 'Vervoer', '#3d8bef', 'sales', { kind: 'sales' }],
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
          const open = ` data-action="station" data-st='${JSON.stringify(st || this.cheapestLine())}'`;
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
    if (u.target === 'transport') return `Vervoer ${m}`;
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
            html += `<div class="newline-card"><div class="nl-ic">${glyph(l.id)}</div><div class="card-text"><small class="kicker">Nieuwe productielijn</small><b>${l.name}</b>
              <small>${money(cp.income * 60)} per minuut · ${l.apples} ${l.apples === 1 ? 'appel' : 'appels'} per stuk</small></div>
              <button class="btn orange ${can ? '' : 'disabled'}" data-action="unlock" data-i="${i}">Bouwen<br><small>${money(l.unlock)}</small></button></div>`;
          }
        });
        if (next) {
          const k = s.tier + 1;
          const perks = [];
          if (next.slots > cur.slots) perks.push([glyph(LINES[next.slots - 1].id), LINES[next.slots - 1].name, 'Nieuwe lijn']);
          perks.push([`<span class="pk-coin">€</span>`, mul(next.mult), 'Inkomen']);
          if (next.orchard > 1) perks.push([glyph('orchard'), mul(next.orchard), 'Appels']);
          if (next.plots > cur.plots) perks.push([glyph('orchard'), '+1', 'Perceel']);
          const can = s.money >= next.cost;
          const pct = Math.min(100, (s.money / next.cost) * 100);
          html += `<div class="tier-hero ${can ? 'can' : ''}">
            <div class="th-top">
              <div class="th-art">${this.tierArt(k)}</div>
              <div class="th-name"><small class="kicker">Volgende uitbreiding · ${k + 1}/${TIERS.length}</small><h3>${next.name}</h3></div>
            </div>
            <div class="th-perks n${perks.length}">${perks.map(([ic, v, t]) => `<div class="perk"><span class="pk-ic">${ic}</span><b>${v}</b><small>${t}</small></div>`).join('')}</div>
            <div class="th-progress"><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
              <span>${can ? `${icon('check')} Genoeg geld!` : `${money(s.money)} van ${money(next.cost)}`}</span></div>
            <button class="btn orange wide ${can ? '' : 'disabled'}" data-action="tier">${icon('expand')} Uitbreiden · ${money(next.cost)}</button>
            ${can ? '' : `<small class="eta">${icon('clock')} nog ${duration((next.cost - s.money) / Math.max(1e-9, this.game.prod.income))} sparen</small>`}
          </div>`;
        } else {
          html += `<div class="tier-hero can"><div class="th-top"><div class="th-art">${this.tierArt(s.tier)}</div>
            <div class="th-name"><small class="kicker">Klaar!</small><h3>${cur.name}</h3></div></div>
            <div class="tip">Je hebt de grootste fabriek die er bestaat! Haal investeerders binnen om nog sneller te groeien.</div></div>`;
        }
        // de route: alle uitbreidingen onder elkaar, met wat ze opleveren
        html += `<div class="route-head">Jouw route</div><ol class="route">${TIERS.map((t, k) => {
          const cls = k < s.tier ? 'done' : k === s.tier ? 'cur' : k === s.tier + 1 ? 'next' : 'lock';
          const prev = TIERS[k - 1];
          const bits = [];
          if (k === 0) bits.push('Begin');
          else {
            if (t.slots > prev.slots) bits.push(`${glyph(LINES[t.slots - 1].id)}${LINES[t.slots - 1].name}`);
            bits.push(`€ ${mul(t.mult)}`);
            if (t.plots > prev.plots) bits.push('+perceel');
          }
          const dot = k <= s.tier ? icon('check') : k === s.tier + 1 ? k + 1 : icon('lock');
          return `<li class="${cls}"><span class="r-dot">${dot}</span><span class="r-name">${t.name}${k === s.tier ? '<em>nu</em>' : ''}</span><span class="r-perks">${bits.join(' · ')}</span></li>`;
        }).join('')}</ol>`;
        return { title: 'Uitbreiden', sub: `Nu: <b>${cur.name}</b>`, html };
      },
    };
  }

  // Tekeningetje van een uitbreiding: het gebouw groeit mee (hout, baksteen, beton, modern) en
  // krijgt er silo's, torens en uiteindelijk een raket bij.
  tierArt(k) {
    const style = k === 0 ? 'wood' : k === 1 ? 'brick' : k < 5 ? 'concrete' : 'modern';
    const wall = { wood: '#c68e57', brick: '#c0634a', concrete: '#e9e4da', modern: '#f7f7f7' }[style];
    const trim = { wood: '#8a5a33', brick: '#8e3f2d', concrete: '#3d7bd9', modern: '#ffc43d' }[style];
    const w = 34 + Math.min(k, 6) * 7;
    const h = 18 + Math.min(k, 6) * 2.5;
    const x0 = 60 - w / 2;
    const base = 58;
    let svg = `<rect x="2" y="${base}" width="116" height="8" rx="4" fill="#8fd16a"/>`;
    if (k >= 6) svg += `<rect x="${x0 - 14}" y="${base - 26}" width="10" height="26" rx="5" fill="#e53935"/><rect x="${x0 - 14}" y="${base - 26}" width="10" height="5" rx="2.5" fill="#c62828"/>`;
    if (k >= 8) svg += `<rect x="${x0 + w + 4}" y="${base - 40}" width="12" height="40" fill="#d5e6f5"/>${[0, 1, 2, 3, 4].map((r) => `<rect x="${x0 + w + 6}" y="${base - 36 + r * 7}" width="8" height="3" fill="#8fd3ff"/>`).join('')}`;
    if (k >= 10) svg += `<path d="M${x0 + w + 24} ${base - 44} l5 10 v26 h-10 v-26z" fill="#f4f1ea" stroke="#d9473b" stroke-width="1.5"/><rect x="${x0 + w + 21}" y="${base - 8}" width="6" height="8" fill="#d9473b"/>`;
    svg += `<rect x="${x0}" y="${base - h}" width="${w}" height="${h}" fill="${wall}"/>`;
    if (style === 'wood' || style === 'brick') svg += `<path d="M${x0 - 3} ${base - h} L60 ${base - h - 12} L${x0 + w + 3} ${base - h}z" fill="${trim}"/>`;
    else {
      svg += `<rect x="${x0 - 1.5}" y="${base - h - 3}" width="${w + 3}" height="4" fill="${trim}"/>`;
      for (let t = 0; t < Math.min(5, 1 + Math.floor(k / 2)); t++) svg += `<path d="M${x0 + 4 + t * 9} ${base - h - 3} l7 -7 v7z" fill="#cfd3d8"/>`;
    }
    if (k >= 1) svg += `<rect x="${x0 + w - 9}" y="${base - h - 14}" width="5" height="12" fill="#8a8f99"/>`;
    const cols = Math.max(2, Math.floor((w - 10) / 9));
    for (let c = 0; c < cols; c++) svg += `<rect x="${x0 + 5 + c * ((w - 10) / cols) + 1}" y="${base - h + 5}" width="${(w - 10) / cols - 3}" height="6" rx="1" fill="#8fd3ff"/>`;
    svg += `<rect x="${60 - 5}" y="${base - 11}" width="10" height="11" fill="${trim}"/>`;
    svg += `<circle cx="60" cy="${base - h - (style === 'wood' || style === 'brick' ? 4 : 9)}" r="3.4" fill="#e53935"/>`;
    return `<svg viewBox="0 0 120 66" aria-hidden="true">${svg}</svg>`;
  }

  // ---------- Kantoor ----------

  // Status van een werknemer als rij: wat hij doet en hoe lang nog.
  staffState(r, withWhere = true) {
    const st = E.staffStatus(r);
    if (!r.at) return { st: 'free', html: `<span class="ss ss-free">In het kantoor</span>` };
    const where = withWhere ? `<span class="ss-where">${stationGlyph(r.at, LINES)}${stationName(r.at)}</span>` : '';
    if (st === 'active') return { st, html: `${where}<span class="ss ss-active">${icon('bolt')}Aan het werk <b data-until="${r.until}"></b></span><span class="tbar"><i data-from="${r.until - STAFF.active * 1000}" data-to="${r.until}"></i></span>` };
    if (st === 'rest') return { st, html: `${where}<span class="ss ss-rest">${icon('zzz')}Pauze <b data-until="${r.rest}"></b></span><span class="tbar rest"><i data-from="${r.until}" data-to="${r.rest}"></i></span>` };
    return { st, html: `${where}<span class="ss ss-ready">${icon('sparkle')}Uitgerust!</span>` };
  }

  officePanel() {
    return {
      icon: icon('briefcase'),
      render: () => {
        const s = this.state;
        const staff = E.ensureStaff(s);
        const d = this.panel.data || {};
        const pts = staff.points;
        const sub = `<span class="pts-pill">${icon('star')}${pts} ${pts === 1 ? 'punt' : 'punten'}</span>`;

        // kies een plek voor een werknemer
        if (d.pick && staff.hired[d.pick]) {
          const e = E.staffDef(d.pick);
          const spots = [{ kind: 'orchard' }, ...LINES.map((l, i) => ({ kind: 'line', i })).filter((st) => s.lines[st.i] > 0), { kind: 'sales' }];
          let html = `<div class="staff-card big"><div class="sc-ava">${avatar(e)}</div><div class="sc-main"><b>${e.name}</b><small>${e.role}</small><div class="sc-skill">${skillTags(e)}</div></div></div>
            <div class="route-head">Waar gaat ${e.name} werken?</div>`;
          for (const st of spots) {
            const ok = E.staffCanWork(e, st);
            const other = E.staffAt(s, st.kind, st.i || 0);
            const here = other === d.pick;
            const lv = E.stationLevel(s, st.kind, st.i);
            const note = !ok ? 'Alleen bij machines' : here ? `${e.name} werkt hier al` : other ? `${E.staffDef(other).name} werkt hier · wisselen` : 'Vrij';
            html += `<div class="spot ${ok ? '' : 'dim'}"><span class="sp-ic">${stationGlyph(st, LINES)}</span>
              <span class="li-text"><b>${stationName(st)} <span class="lv">Lv ${lv}</span></b><small>${note}</small></span>
              ${other && !here ? `<span class="sp-other">${avatar(E.staffDef(other))}</span>` : ''}
              <button class="btn small green ${ok && !here ? '' : 'disabled'}" data-action="staff-to" data-id="${d.pick}" data-st='${JSON.stringify(st)}'>Hier</button></div>`;
          }
          html += `<button class="btn wide ghost" data-action="staff-back">Terug</button>`;
          return { title: 'Werknemer plaatsen', sub, html };
        }

        // kies een werknemer voor een station
        if (d.for) {
          const at = d.for;
          const list = Object.keys(staff.hired).map(E.staffDef).filter((e) => e && E.staffCanWork(e, at));
          let html = `<div class="route-head">Wie gaat bij ${stationName(at)} werken?</div>`;
          if (!list.length) html += `<div class="tip">Je hebt nog niemand die hier kan werken. Huur een superwerknemer met je punten.</div>`;
          for (const e of list) {
            const r = staff.hired[e.id];
            const here = r.at && r.at.kind === at.kind && (at.kind !== 'line' || r.at.i === at.i);
            html += `<div class="staff-card"><div class="sc-ava">${avatar(e)}</div><div class="sc-main"><b>${e.name} <small>${e.role}</small></b><div class="sc-skill">${skillTags(e)}</div><div class="sc-status">${this.staffState(r).html}</div></div>
              <div class="sc-btns"><button class="btn small green ${here ? 'disabled' : ''}" data-action="staff-pick" data-id="${e.id}">${here ? 'Werkt hier' : 'Kies'}</button></div></div>`;
          }
          html += `<button class="btn wide ghost" data-action="open" data-v="office">Naar het kantoor</button>`;
          return { title: 'Kies een werknemer', sub, html };
        }

        const hired = STAFF.list.filter((e) => staff.hired[e.id]);
        const forHire = STAFF.list.filter((e) => !staff.hired[e.id] && E.staffUnlocked(s, e));
        const locked = STAFF.list.filter((e) => !staff.hired[e.id] && !E.staffUnlocked(s, e));
        let html = `<div class="office-hero"><div class="oh-pts">${icon('star')}<b>${pts}</b></div>
          <div><b>${pts === 1 ? 'Kantoorpunt' : 'Kantoorpunten'}</b><small>Elke productielijn die je opent levert 1 punt op, ook na het verkopen van je fabriek.</small></div></div>`;
        if (hired.length) {
          html += `<div class="route-head">Jouw team</div>`;
          for (const e of hired) {
            const r = staff.hired[e.id];
            const info = this.staffState(r);
            let btns = '';
            if (!r.at) btns = `<button class="btn small green" data-action="staff-place" data-id="${e.id}">Plaatsen</button>`;
            else {
              if (info.st === 'ready') btns += `<button class="btn small gold pulse" data-action="staff-start" data-id="${e.id}">${icon('bolt')} Start</button>`;
              btns += `<button class="btn small ghost" data-action="staff-place" data-id="${e.id}">Verplaats</button>`;
            }
            html += `<div class="staff-card st-${info.st}"><div class="sc-ava">${avatar(e)}</div>
              <div class="sc-main"><b>${e.name} <small>${e.role}</small></b><div class="sc-skill">${skillTags(e)}</div><div class="sc-status">${info.html}</div></div>
              <div class="sc-btns">${btns}</div></div>`;
          }
        }
        if (forHire.length) {
          html += `<div class="route-head">Te huur</div>`;
          for (const e of forHire) {
            const can = pts >= e.cost;
            html += `<div class="staff-card hire"><div class="sc-ava">${avatar(e)}</div>
              <div class="sc-main"><b>${e.name} <small>${e.role}</small></b><div class="sc-skill">${skillTags(e)}</div></div>
              <div class="sc-btns"><button class="btn small orange ${can ? '' : 'disabled'}" data-action="hire" data-id="${e.id}">Huur<br><small>${icon('star')} ${e.cost}</small></button></div></div>`;
          }
        }
        if (locked.length) {
          html += `<div class="route-head">Binnenkort</div>`;
          for (const e of locked) {
            html += `<div class="staff-card locked"><div class="sc-ava">${avatar(e, true)}</div>
              <div class="sc-main"><b>${e.name} <small>${e.role}</small></b><div class="sc-skill">${skillTags(e)}</div></div>
              <div class="sc-lock">${icon('lock')}<small>${TIERS[e.tier].name}</small></div></div>`;
          }
        }
        html += `<div class="tip small">Een werknemer werkt ${STAFF.active / 60} minuten en neemt daarna ${STAFF.rest / 60} minuten pauze. Daarna tik je op hem (of op Start) om hem weer aan het werk te zetten. Eén werknemer per plek.</div>`;
        return { title: 'Kantoor', sub, html };
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
          <div class="list-row"><span class="li-text"><b>Graphics</b><small>${{ auto: 'Past zich aan', high: 'Altijd scherp', low: 'Spaart batterij' }[s.settings.quality] || ''}</small></span>
            <div class="amounts">${[['low', 'Zuinig'], ['auto', 'Auto'], ['high', 'Hoog']].map(([v, t]) => `<button class="amt ${s.settings.quality === v ? 'on' : ''}" data-action="quality" data-v="${v}">${t}</button>`).join('')}</div></div>
          ${this.updateRow()}
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

  // Rij in de instellingen: zoekt naar een update, of laadt hem als er al een klaarstaat.
  updateRow() {
    const st = this.updateState || 'idle';
    const ver = (window.APP_VERSION || 'lokaal').slice(0, 7);
    const sub = { idle: `Versie ${ver}`, checking: 'Zoeken...', latest: `Nieuwste versie ${icon('check')}`, ready: 'Nieuwe versie gevonden!', offline: 'Geen verbinding' }[st];
    const btn = st === 'ready' ? 'Update laden' : st === 'checking' ? 'Zoeken...' : 'Zoek update';
    return `<div class="list-row ${st === 'ready' ? 'update-ready' : ''}"><span class="li-text"><b>Updates</b><small>${sub}</small></span>
      <button class="btn small ${st === 'ready' ? 'green' : 'blue'} ${st === 'checking' ? 'disabled' : ''}" data-action="update">${btn}</button></div>`;
  }

  async updateButton() {
    if (this.updateState === 'checking') return;
    if (this.updateState === 'ready') { this.toast('Nieuwste versie laden...', 'sparkle'); this.game.hardRefresh(); return; }
    const found = await this.checkUpdate(true);
    if (found) { this.toast('Nieuwe versie gevonden, laden...', 'sparkle'); this.game.hardRefresh(); }
    else if (this.updateState === 'latest') this.toast('Je hebt al de nieuwste versie', 'check');
  }

  // Kijkt of er op de server een nieuwere versie staat (zonder cache). Zo ja: een rood stipje op
  // het tandwiel en een groene knop "Update laden" in de instellingen. Geeft true als er een update is.
  async checkUpdate(manual = false) {
    if (this.updateState === 'ready') return true;
    if (!window.APP_VERSION) { if (manual) this.updateState = 'latest'; this.refresh(); return false; }
    if (manual) { this.updateState = 'checking'; this.refresh(); }
    try {
      const res = await fetch(`index.html?check=${Date.now()}`, { cache: 'no-store' });
      const m = (await res.text()).match(/APP_VERSION = '([0-9a-f]+)'/);
      if (m && m[1] !== window.APP_VERSION) {
        this.updateState = 'ready';
        document.querySelector('#btn-settings').classList.add('has-update');
        this.refresh();
        return true;
      }
      this.updateState = 'latest';
    } catch (e) {
      if (manual) this.updateState = 'offline';
    }
    this.refresh();
    return false;
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
    this.modal(`<img class="modal-logo" src="icon.svg" alt=""><h2>Appel Tycoon</h2>
      <p>Je begint met een klein schuurtje en een paar appelbomen. Maak er appelproducten van, verkoop ze en groei uit tot een enorme fabriek.</p>
      <p>Bovenin helpen we je stap voor stap op weg.</p>
      <button class="btn green wide" data-action="modal-close">Starten!</button>`, true);
  }

  // Eenmalige uitleg na een balans-update (versie 6/7): levels zijn omgerekend, je ronde loopt gewoon door.
  balanceNews(transport, lines) {
    const items = [];
    if (lines) items.push('<b>Nieuwe machines beginnen nu op level 1</b> en groeien geleidelijk mee. Oudere machines staan hoger, en elke machine levert iets anders op.');
    if (transport) items.push('<b>Het vervoer groeit in kleinere stappen</b>, dus je koopt het vaker bij. Een pijltje laat zien wanneer dat nodig is.');
    // staat er al een venster open (bv. offline-inkomen), dan alleen een korte melding
    if (!this.el.modal.classList.contains('hidden')) { this.toast('Balans vernieuwd: je levels zijn omgerekend', 'up'); return; }
    this.modal(`<div class="modal-icon">${icon('star', 'gold-ic')}</div><h2>Balans vernieuwd!</h2>
      ${items.map((t) => `<p>${t}</p>`).join('')}
      <p>Je levels zijn omgerekend zodat je ongeveer hetzelfde blijft verdienen. Je ronde loopt gewoon door.</p>
      <button class="btn green wide" data-action="modal-close">Verder spelen</button>`, true);
  }

  // Eenmalige uitleg zodra het kantoor er is.
  officeIntro() {
    const s = this.state;
    s.stats.officeIntro = 1;
    const kees = STAFF.list[0];
    this.modal(`<div class="modal-icon office-intro">${avatar(kees)}</div><h2>Nieuw: het Kantoor!</h2>
      <p>Huur <b>superwerknemers</b> en zet ze bij een machine. Ze maken hem <b>sneller</b> of je producten <b>meer waard</b>.</p>
      <p>Ze werken ${STAFF.active / 60} minuten en rusten dan ${STAFF.rest / 60} minuten. Daarna <b>tik je op ze</b> om ze weer aan het werk te zetten.</p>
      <p>Elke productielijn die je opent geeft <b>1 kantoorpunt</b>. Je hebt er nu <b>${s.staff.points}</b>.</p>
      <button class="btn green wide" data-action="office-intro">Naar het kantoor</button>`, true);
  }

  newVersion(from) {
    const what = from === 2
      ? 'Elke upgrade maakt je producten nu meer waard. Bij een <b>ster</b> wordt een machine sneller of meer waard, en in het menu <b>Upgrades</b> vind je flinke bonussen.'
      : 'De balans is vernieuwd: <b>al je machines verdienen mee</b> en er is <b>steeds iets te upgraden</b>, ook als je net een nieuwe lijn hebt. Elke 25 levels krijgt een machine een ster.';
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
      else if (p.potential > p.transport * 1.001) hint = 'Vervoer moet mee!';
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
    else if (g.type === 'income') this.openStation(this.cheapestLine());
  }

  // ---------- Per frame ----------

  update(now) {
    const s = this.state;
    const prod = this.game.prod;
    const m = money(s.money);
    if (m !== this.shownMoney) { this.shownMoney = m; this.el.money.textContent = m; }
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
      if (tutorialDone(s) && !s.stats.officeIntro && this.el.modal.classList.contains('hidden') && !this.panel && now > 8000) this.officeIntro();
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
    show('[data-open="office"]', tut);
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

  // Iets te doen in het kantoor: uitgeruste werknemers, iemand zonder plek, of genoeg punten om te huren.
  officeAlerts() {
    const s = this.state;
    const staff = E.ensureStaff(s);
    const now = Date.now();
    let n = 0;
    for (const id in staff.hired) {
      const r = staff.hired[id];
      if (!r.at || E.staffStatus(r, now) === 'ready') n++;
    }
    if (n) return n;
    return STAFF.list.some((e) => !staff.hired[e.id] && E.staffUnlocked(s, e) && staff.points >= e.cost) ? '!' : 0;
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
    const ob = document.querySelector('[data-open="office"] .badge');
    const oa = this.officeAlerts();
    ob.classList.toggle('hidden', !oa);
    ob.textContent = oa;
    // rood randje om de ketenbalkjes als het magazijn vol zit (alles loopt dan vast)
    this.el.chainMini.classList.toggle('alert', this.game.prod.storeFull);
    const ib = document.querySelector('#btn-investors');
    ib.classList.toggle('glow', E.pendingInvestors(s) >= Math.max(5, s.investors * 0.5));
  }

  // ---------- Labels boven stations ----------

  updateLabels(now = 0) {
    const w = this.game.world;
    const anchors = w.anchors(this.state);
    const keys = new Set();
    const zoomedOut = w.viewSize > 75;
    const items = [];
    let changed = false;
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
        changed = true;
      }
      const stJson = JSON.stringify(a.st);
      if (el.dataset.st !== stJson) { el.dataset.st = stJson; el._st = a.st; this.fillLabel(el); changed = true; }
      const p = w.toScreen(a.pos);
      if (a.st.kind === 'golden') {
        const m = 44;
        const out = p.x < m || p.x > window.innerWidth - m || p.y < 130 || p.y > window.innerHeight - 100;
        const ax = p.x, ay = p.y;
        p.x = Math.min(window.innerWidth - m, Math.max(m, p.x));
        p.y = Math.min(window.innerHeight - 100, Math.max(130, p.y));
        p.visible = out;
        el.classList.toggle('edge', out);
        // pijltje wijst naar waar de gouden appel echt zit (het label zelf staat aan de rand)
        if (out) el.style.setProperty('--a', `${Math.atan2(ay - (p.y - 21), ax - p.x).toFixed(2)}rad`);
      }
      const hide = !p.visible || (zoomedOut && a.st.kind === 'line')
        || (a.st.kind === 'staff' && w.viewSize > 46 && !el.classList.contains('staff-ready'));
      // alleen de DOM aanraken als er echt iets verandert (scheelt veel werk als de camera stilstaat)
      if (el._hide !== hide) { el._hide = hide; el.style.display = hide ? 'none' : ''; changed = true; }
      if (hide) continue;
      items.push({ el, st: a.st, x: p.x, y: p.y });
      const tf = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
      if (el._tf !== tf) { el._tf = tf; el.style.transform = tf; }
    }
    for (const [k, el] of this.labels) {
      if (!keys.has(k)) { el.remove(); this.labels.delete(k); changed = true; }
    }
    // bordjes uit elkaar houden: opnieuw als je zoomt, als er iets bijkomt, en anders twee keer per seconde
    if (changed || w.viewSize !== this.declutterZoom || now - (this.declutterAt || 0) > 500) {
      this.declutterZoom = w.viewSize;
      this.declutterAt = now;
      this.declutter(items, w.viewSize);
    }
  }

  // Bordjes die over elkaar vallen: het belangrijkste blijft heel, de rest wordt een klein rondje
  // (icoon met pijltje) en als zelfs dat niet past verdwijnt hij tot je inzoomt.
  // Verder uitgezoomd zijn de gewone bordjes altijd klein.
  declutter(items, zoom) {
    const tut = this.tutTarget;
    const prio = (it) => {
      const k = it.st.kind;
      if (it.el.dataset.st === tut) return 100;
      if (k === 'staff') return it.el.classList.contains('staff-ready') ? 80 : -1;
      return { golden: -1, tier: 70, unlock: 65, orchard: 60, sales: 60, office: 55, dock: 40 }[k] ?? (it.el.classList.contains('can') ? 52 : 50);
    };
    const compactZoom = zoom > 46;
    // eerst alles op ware grootte meten (in één keer, dan rekent de browser maar één keer)
    for (const it of items) {
      it.p = prio(it);
      if (it.p < 0) continue;
      it.el.classList.remove('compact', 'slim');
    }
    for (const it of items) if (it.p >= 0) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
    // machinebordjes ook in de smalle vorm meten
    const lineItems = items.filter((it) => it.p >= 0 && it.st.kind === 'line');
    for (const it of lineItems) it.el.classList.add('slim');
    for (const it of lineItems) { it.sw = it.el.offsetWidth; it.sh = it.el.offsetHeight; }
    const placed = [];
    const hits = (r) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
    const rect = (it, w, h, pad = 2) => ({ x0: it.x - w / 2 - pad, x1: it.x + w / 2 + pad, y0: it.y - h - pad, y1: it.y + pad });
    // een rondje mag een klein beetje over een ander heen vallen (het pijltje steekt eruit)
    const small = 24;
    const live = items.filter((it) => it.p >= 0);
    // De machinebordjes doen alles samen: allemaal volledig, of allemaal een rondje. Om en om groot
    // en klein ziet er rommelig uit. Een kleine marge voorkomt heen en weer springen tijdens het zoomen.
    const lines = live.filter((it) => it.st.kind === 'line' && it.p < 70);
    const others = live.filter((it) => !(it.st.kind === 'line' && it.p < 70));
    // drie standen voor alle machinebordjes samen: 0 = volledig, 1 = smal, 2 = rondje
    const prev = this.linesMode || 0;
    const fits = (mode) => {
      const margin = mode < prev ? 6 : 0;
      const size = (it) => (lines.includes(it) ? (mode === 1 ? [it.sw, it.sh] : [it.w, it.h]) : [it.w, it.h]);
      const overlap = (a, b) => {
        const [aw, ah] = size(a), [bw, bh] = size(b);
        const ra = rect(a, aw, ah, margin / 2), rb = rect(b, bw, bh, margin / 2);
        return Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0) > 2 && Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0) > 2;
      };
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) if (overlap(lines[i], lines[j])) return false;
        // ook als een machinebord een belangrijker bord (boomgaard, vervoer, kantoor, uitbreiding) zou raken
        for (const o of others) if (o.p >= 55 && overlap(lines[i], o)) return false;
      }
      return true;
    };
    const mode = compactZoom ? 2 : fits(0) ? 0 : fits(1) ? 1 : 2;
    this.linesMode = mode;
    const crowded = mode === 2;
    // eerst de belangrijke bordjes, dan de machines (van boven naar beneden)
    const order = [...others.filter((it) => it.p >= 55), ...lines, ...others.filter((it) => it.p < 55)];
    order.sort((a, b) => (b.p >= 55) - (a.p >= 55) || b.p - a.p || a.y - b.y);
    for (const it of order) {
      const isLine = lines.includes(it);
      const canShrink = it.p < 70;
      let compact = canShrink && (isLine ? crowded : compactZoom);
      const slim = isLine && mode === 1;
      let r = compact ? rect(it, small, small, 0) : slim ? rect(it, it.sw, it.sh) : rect(it, it.w, it.h);
      if (!isLine && hits(r) && canShrink && !compact) { compact = true; r = rect(it, small, small, 0); }
      const hide = hits(r) && it.p < 70;
      it.el.classList.toggle('compact', compact);
      it.el.classList.toggle('slim', slim);
      it.el.classList.toggle('crowded', hide);
      if (!hide) placed.push(r);
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
      // boomgaard en vervoer alleen een pijltje als ze (bijna) tekortschieten
      can = E.upgradeQuote(s, st.kind, st.i || 0, 1).cost <= s.money && (!tutorialDone(s) || E.chainNeed(s, st.kind));
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
      html = `<span class="lb-icon">${glyph(l.id)}</span><span class="lb-txt">${l.name}<br><b>${money(l.unlock)}</b></span>`;
    } else if (st.kind === 'tier') {
      const t = E.nextTier(s);
      if (!t) return;
      can = s.money >= t.cost;
      html = `<span class="lb-icon tier-ic">${icon('expand')}</span><span class="lb-txt">${t.name}<br><b>${money(t.cost)}</b></span>`;
    } else if (st.kind === 'dock') {
      html = `<span class="lb-icon">${glyph('sales')}</span><span class="lb-txt">Nieuwe laadplek<br><b>level ${st.level}</b></span>`;
    } else if (st.kind === 'golden') {
      html = `<i class="gold-arrow"></i><span class="lb-icon">${glyph('gold')}</span>`;
    } else if (st.kind === 'office') {
      const n = this.officeAlerts();
      html = `<span class="lb-icon office-ic">${icon('briefcase')}</span><span class="lb-txt">Kantoor</span>${n ? `<span class="up">${n}</span>` : ''}`;
    } else if (st.kind === 'staff') {
      const r = s.staff.hired[st.id];
      const e = E.staffDef(st.id);
      if (!r || !e) return;
      const now = Date.now();
      const status = E.staffStatus(r, now);
      el.classList.toggle('staff-ready', status === 'ready');
      el.classList.toggle('staff-rest', status === 'rest');
      if (status === 'ready') html = `<span class="lb-ava">${avatar(e)}</span><span>${e.name}<br><b>Tik!</b></span>`;
      // aan het werk of in de pauze: alleen een klein rondje (de tijd staat in het kantoor en bij de machine)
      else html = `<span class="lb-ava">${avatar(e)}</span><span class="${status === 'active' ? 'lb-bolt' : 'lb-zzz'}">${icon(status === 'active' ? 'bolt' : 'zzz')}</span>`;
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.classList.toggle('can', can);
    el.classList.toggle('tut', this.tutTarget === el.dataset.st);
  }
}
