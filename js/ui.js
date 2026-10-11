// Alle HTML-interface: HUD, panelen, labels boven stations, meldingen.
import * as E from './economy.js';
import { LINES, TIERS, RESEARCH, ORCHARD, SALES, BOOST, INVESTOR_BONUS, INVESTOR_BASE } from './config.js';
import { fmt, money, duration, percent } from './format.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor(game) {
    this.game = game;
    this.buyAmount = 1;
    this.panel = null;
    this.labels = new Map();
    this.lastSlow = 0;
    this.lastPop = 0;
    this.hold = null;

    this.el = {
      money: $('#money'), income: $('#income'), inv: $('#inv-count'),
      goalText: $('#goal-text'), goalBar: $('#goal-bar'), goalClaim: $('#goal-claim'), goal: $('#goal'),
      sheet: $('#sheet'), modal: $('#modal'), modalCard: $('#modal-card'), labels: $('#labels'), fx: $('#fx'),
      toasts: $('#toasts'), boostBtn: $('#btn-boost'), boostLabel: $('#boost-label'),
      boostBanner: $('#boost-banner'), boostTime: $('#boost-time'),
    };

    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      sfx.click();
      const what = b.dataset.open;
      if (this.panel && this.panel.id === what) this.close();
      else this.open(what);
    }));
    $('#btn-investors').addEventListener('click', () => { sfx.click(); this.open('investors'); });
    $('#btn-settings').addEventListener('click', () => { sfx.click(); this.open('settings'); });
    this.el.boostBtn.addEventListener('click', () => this.game.boost());
    this.el.goalClaim.addEventListener('click', () => this.game.claimGoal());
    this.el.goal.addEventListener('click', (e) => { if (e.target !== this.el.goalClaim) this.goalHint(); });

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

    // ingedrukt houden = herhaald kopen
    const startHold = (e) => {
      const b = e.target.closest('[data-hold]');
      if (!b || b.classList.contains('disabled')) return;
      const ds = { ...b.dataset };
      this.doAction(ds);
      let delay = 380;
      const step = () => {
        this.doAction(ds);
        delay = Math.max(60, delay * 0.8);
        this.hold = setTimeout(step, delay);
      };
      this.hold = setTimeout(step, delay);
    };
    const stopHold = () => { clearTimeout(this.hold); this.hold = null; };
    this.el.sheet.addEventListener('pointerdown', startHold);
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('pointercancel', stopHold);
    window.addEventListener('blur', stopHold);

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
      case 'quality': g.setQuality(this.state.settings.quality === 'high' ? 'low' : 'high'); break;
      case 'save': g.save(); this.toast('Spel opgeslagen', '💾'); break;
      case 'reset-confirm': this.confirmReset(); break;
      case 'reset': g.hardReset(); break;
      case 'offline-claim': this.closeModal(); g.claimOffline(); break;
      default: break;
    }
    this.refresh();
  }

  stopHoldNow() { clearTimeout(this.hold); this.hold = null; }

  // ---------- Panelen ----------

  open(id, data) {
    const builders = {
      stations: () => this.stationsPanel(),
      research: () => this.researchPanel(),
      expand: () => this.expandPanel(),
      investors: () => this.investorsPanel(),
      settings: () => this.settingsPanel(),
      station: () => this.stationPanel(data),
    };
    this.panel = { id, data, ...builders[id]() };
    this.el.sheet.innerHTML = `
      <div class="sheet-head">
        <div class="sheet-icon">${this.panel.icon}</div>
        <div class="sheet-title"><h2></h2><div class="sheet-sub"></div></div>
        <button class="round close" data-action="close" aria-label="Sluiten">✕</button>
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
    if (r.html !== this.lastHtml) {
      body.innerHTML = r.html;
      this.lastHtml = r.html;
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

  milestoneBar(level) {
    const next = E.nextMilestone(level);
    if (!next) return '';
    const prev = E.prevMilestone(level);
    const pct = Math.round(((level - prev) / (next - prev)) * 100);
    return `<div class="milestone"><div class="ms-text">Mijlpaal level ${next}: <b>productie x2</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }

  stationPanel(st) {
    return {
      icon: st.kind === 'orchard' ? ORCHARD.icon : st.kind === 'sales' ? SALES.icon : LINES[st.i].icon,
      render: () => {
        const s = this.state;
        const now = Date.now();
        const prod = this.game.prod;
        const q = E.upgradeQuote(s, st.kind, st.i || 0, this.buyAmount);
        let title, rows = [], extra = '';
        const level = E.stationLevel(s, st.kind, st.i);
        const after = structuredClone(s);
        if (st.kind === 'orchard') after.orchard += q.count;
        else if (st.kind === 'sales') after.sales += q.count;
        else after.lines[st.i] += q.count;
        const incNow = E.incomePerSecond(s, now);
        const incNext = E.incomePerSecond(after, now);
        if (st.kind === 'orchard') {
          title = ORCHARD.name;
          rows.push(['🍎 Appels per seconde', fmt(E.orchardRate(s)), fmt(E.orchardRate(s, level + q.count))]);
          rows.push(['🏭 Gebruikt door lijnen', fmt(prod.demand) + '/s']);
          rows.push(['🧺 Overschot (los verkocht)', fmt(prod.spare) + '/s']);
          if (prod.spare < 0.01 * prod.supply || prod.lines.some((l) => l.max > 0 && l.efficiency < 0.98)) {
            extra = `<div class="tip warn">⚠️ Je lijnen hebben meer appels nodig dan de boomgaard levert. Upgraden loont!</div>`;
          } else {
            extra = `<div class="tip">💡 Elke lijn heeft appels nodig. Houd de boomgaard groot genoeg voor al je productielijnen.</div>`;
          }
        } else if (st.kind === 'sales') {
          title = SALES.name;
          rows.push(['💶 Verkoopbonus', 'x' + fmt(E.salesMult(s)), 'x' + fmt(E.salesMult(s, level + q.count))]);
          rows.push(['🔬 Onderzoek', 'x' + fmt(E.researchMult(s, 'all'))]);
          rows.push(['🏗️ Uitbreidingen', 'x' + fmt(E.tierIncomeMult(s))]);
          rows.push(['⭐ Investeerders', 'x' + fmt(E.investorMult(s))]);
          extra = `<div class="tip">💡 Verkoop & Marketing verhoogt de prijs van <b>alle</b> producten.</div>`;
        } else {
          const l = LINES[st.i];
          const lp = prod.lines[st.i];
          title = l.name;
          rows.push([`${l.icon} Productie`, fmt(lp.rate) + '/s', fmt(E.lineRate(after, st.i)) + '/s max']);
          rows.push(['💶 Prijs per stuk', money(l.value * E.priceMult(s) / (E.isBoosted(s, now) ? BOOST.mult : 1))]);
          rows.push(['🍎 Appels per stuk', String(l.apples)]);
          rows.push(['📈 Efficiëntie', percent(lp.efficiency || 0)]);
          if (lp.efficiency < 0.98) {
            extra = `<div class="tip warn">⚠️ Te weinig appels! Deze lijn kan ${fmt(lp.max)}/s maken maar krijgt maar genoeg voor ${fmt(lp.rate)}/s.
              <button class="btn small" data-action="station" data-st='{"kind":"orchard"}'>🌳 Naar boomgaard</button></div>`;
          }
        }
        rows.push(['💰 Totaal inkomen', money(incNow) + '/s', money(incNext) + '/s']);
        const html = `
          ${this.milestoneBar(level)}
          <div class="stats">${rows.map((r) => `<div class="row"><span>${r[0]}</span><b>${r[1]}</b>${r[2] ? `<em>→ ${r[2]}</em>` : ''}</div>`).join('')}</div>
          ${extra}
          <div class="buy-row">${this.amountToggle()}${this.buyButton(st.kind, st.i || 0)}</div>`;
        return { title, sub: `Level <b>${level}</b>${st.kind === 'line' ? ' · ' + LINES[st.i].machine : ''}`, html };
      },
    };
  }

  stationsPanel() {
    return {
      icon: '🏭',
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
        let html = this.amountToggle();
        html += row({ kind: 'orchard' }, ORCHARD.icon, `Boomgaard <span class="lv">Lv ${s.orchard}</span>`, `${fmt(prod.supply)} appels/s · ${fmt(prod.spare)} over`);
        LINES.forEach((l, i) => {
          if (s.lines[i] > 0) {
            const lp = prod.lines[i];
            const warn = lp.efficiency < 0.98 ? ' ⚠️' : '';
            html += row({ kind: 'line', i }, l.icon, `${l.name} <span class="lv">Lv ${s.lines[i]}</span>`, `${fmt(lp.rate)}/s · ${money(lp.income)}/s${warn}`);
          } else if (E.lineUnlockable(s, i)) {
            const can = s.money >= l.unlock;
            html += `<div class="list-row locked"><span class="li-icon">${l.icon}</span><span class="li-text"><b>${l.name}</b><small>Nieuwe productielijn</small></span>
              <button class="btn orange small ${can ? '' : 'disabled'}" data-action="unlock" data-i="${i}">Open<br><small>${money(l.unlock)}</small></button></div>`;
          } else if (s.lines[i] === 0 && (i === 0 || s.lines[i - 1] > 0)) {
            const need = TIERS.findIndex((t) => t.slots > i);
            html += `<div class="list-row locked dim"><span class="li-icon">🔒</span><span class="li-text"><b>${l.name}</b><small>Vereist uitbreiding: ${TIERS[need].name}</small></span>
              <button class="btn small" data-action="open" data-v="expand">🏗️</button></div>`;
          }
        });
        html += row({ kind: 'sales' }, SALES.icon, `Verkoop & Marketing <span class="lv">Lv ${s.sales}</span>`, `prijs x${fmt(E.salesMult(s))}`);
        return { title: 'Je fabriek', sub: `${TIERS[s.tier].name} · ${money(prod.income)}/s`, html };
      },
    };
  }

  researchPanel() {
    return {
      icon: '🔬',
      render: () => {
        const s = this.state;
        const avail = RESEARCH.filter((r) => E.researchAvailable(s, r)).sort((a, b) => a.cost - b.cost);
        const locked = RESEARCH.filter((r) => !s.research[r.id] && !E.researchAvailable(s, r));
        const owned = RESEARCH.filter((r) => s.research[r.id]);
        let html = '';
        if (avail.length === 0 && locked.length === 0) html += `<div class="tip">🎉 Alles onderzocht!</div>`;
        html += avail.map((r) => {
          const can = s.money >= r.cost;
          return `<div class="card research">
            <div class="card-text"><b>${r.name}</b><small>${r.desc}</small></div>
            <button class="btn blue small ${can ? '' : 'disabled'}" data-action="research" data-id="${r.id}">${money(r.cost)}</button></div>`;
        }).join('');
        html += locked.slice(0, 3).map((r) => {
          const line = LINES.find((l) => l.id === r.req);
          return `<div class="card research dim"><div class="card-text"><b>🔒 ${r.name}</b><small>${r.desc} · vereist ${line.name}</small></div><span class="price">${money(r.cost)}</span></div>`;
        }).join('');
        if (owned.length) html += `<div class="owned">${owned.map((r) => `<span class="tag">✓ ${r.name}</span>`).join('')}</div>`;
        return { title: 'Onderzoek', sub: `${owned.length}/${RESEARCH.length} voltooid`, html };
      },
    };
  }

  expandPanel() {
    return {
      icon: '🏗️',
      render: () => {
        const s = this.state;
        const next = E.nextTier(s);
        const cur = TIERS[s.tier];
        let html = '';
        // eerst eventueel een lijn die al geopend kan worden
        LINES.forEach((l, i) => {
          if (E.lineUnlockable(s, i)) {
            const can = s.money >= l.unlock;
            html += `<div class="card highlight"><div class="big-icon">${l.icon}</div><div class="card-text"><b>Nieuwe lijn: ${l.name}</b>
              <small>${l.machine} · ${l.apples} appels per product · ${money(l.value)} per stuk</small></div>
              <button class="btn orange ${can ? '' : 'disabled'}" data-action="unlock" data-i="${i}">${money(l.unlock)}</button></div>`;
          }
        });
        if (next) {
          const perks = [];
          if (next.slots > cur.slots) perks.push(`🏭 Ruimte voor productielijn ${next.slots}: <b>${LINES[next.slots - 1].name}</b>`);
          perks.push(`💶 Alle inkomsten <b>x${String(next.mult).replace('.', ',')}</b>`);
          if (next.orchard > 1) perks.push(`🌳 Boomgaard <b>x${String(next.orchard).replace('.', ',')}</b> appels`);
          if (next.plots > cur.plots) perks.push(`🌱 Extra boomgaardperceel (${next.plots} totaal)`);
          perks.push(`📐 Een veel groter terrein`);
          const can = s.money >= next.cost;
          html += `<div class="card tier-next">
            <div class="tier-name">Volgende: <b>${next.name}</b></div>
            <ul class="perks">${perks.map((p) => `<li>${p}</li>`).join('')}</ul>
            <button class="btn orange wide ${can ? '' : 'disabled'}" data-action="tier">Uitbreiden · ${money(next.cost)}</button>
            ${can ? '' : `<small class="eta">Nog ${duration((next.cost - s.money) / Math.max(1e-9, this.game.prod.income))} sparen bij huidig inkomen</small>`}
          </div>`;
        } else {
          html += `<div class="tip">🏆 Je hebt de grootste fabriek die er bestaat! Haal investeerders binnen om nog sneller te groeien.</div>`;
        }
        html += `<div class="tier-path">${TIERS.map((t, k) => `<div class="tp ${k < s.tier ? 'done' : k === s.tier ? 'cur' : ''}"><span>${k <= s.tier ? '✓' : k + 1}</span>${t.name}</div>`).join('')}</div>`;
        return { title: 'Uitbreiden', sub: `Nu: <b>${cur.name}</b>`, html };
      },
    };
  }

  investorsPanel() {
    return {
      icon: '⭐',
      render: () => {
        const s = this.state;
        const pend = E.pendingInvestors(s);
        const nextAt = (E.investorsFor(s.totalEarned) + 1) ** 2 * INVESTOR_BASE;
        const needed = nextAt - s.totalEarned;
        const bonusNow = s.investors * INVESTOR_BONUS;
        const bonusAfter = (s.investors + pend) * INVESTOR_BONUS;
        const html = `
          <div class="inv-hero"><div class="star">⭐</div><div><b>${fmt(s.investors)}</b> investeerders<br><small>+${fmt(bonusNow * 100)}% inkomen</small></div></div>
          <div class="tip">Verkoop je fabriek aan investeerders en begin opnieuw met een bonus. Elke investeerder geeft <b>+${INVESTOR_BONUS * 100}%</b> inkomen, voor altijd.</div>
          <div class="stats">
            <div class="row"><span>Verdiend deze ronde</span><b>${money(s.runEarned)}</b></div>
            <div class="row"><span>Totaal verdiend</span><b>${money(s.totalEarned)}</b></div>
            <div class="row"><span>Volgende investeerder over</span><b>${money(needed)}</b></div>
            <div class="row"><span>Nieuwe investeerders nu</span><b class="gold">+${fmt(pend)}</b></div>
            <div class="row"><span>Bonus na verkoop</span><b>+${fmt(bonusNow * 100)}%</b><em>→ +${fmt(bonusAfter * 100)}%</em></div>
          </div>
          <div class="tip small">Je houdt: investeerders, doelen en statistieken. Je verliest: geld, levels, onderzoek en uitbreidingen.</div>
          <button class="btn gold wide ${pend > 0 ? '' : 'disabled'}" data-action="prestige-confirm">Verkoop fabriek · +${fmt(pend)} ⭐</button>`;
        return { title: 'Investeerders', sub: `Ronde ${s.prestiges + 1}`, html };
      },
    };
  }

  settingsPanel() {
    return {
      icon: '⚙️',
      render: () => {
        const s = this.state;
        const html = `
          <div class="list-row"><span class="li-text"><b>🔊 Geluid</b></span><button class="btn small ${s.settings.sound ? 'green' : ''}" data-action="sound">${s.settings.sound ? 'Aan' : 'Uit'}</button></div>
          <div class="list-row"><span class="li-text"><b>🎨 Graphics</b><small>Laag is sneller op oudere telefoons</small></span><button class="btn small" data-action="quality">${s.settings.quality === 'high' ? 'Hoog' : 'Laag'}</button></div>
          <div class="stats">
            <div class="row"><span>Speeltijd</span><b>${duration(s.playTime)}</b></div>
            <div class="row"><span>Totaal verdiend</span><b>${money(s.totalEarned)}</b></div>
            <div class="row"><span>Fabrieken verkocht</span><b>${s.prestiges}</b></div>
            <div class="row"><span>Gouden appels gevangen</span><b>${s.stats.golden}</b></div>
          </div>
          <div class="btn-row"><button class="btn blue" data-action="save">💾 Opslaan</button><button class="btn red" data-action="reset-confirm">🗑️ Reset spel</button></div>
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
    this.modal(`<div class="modal-icon">⭐</div><h2>Fabriek verkopen?</h2>
      <p>Je krijgt <b>+${fmt(pend)}</b> investeerders (totaal ${fmt(this.state.investors + pend)}, +${fmt((this.state.investors + pend) * INVESTOR_BONUS * 100)}% inkomen) en begint opnieuw met een schuurtje.</p>
      <div class="btn-row"><button class="btn" data-action="modal-close">Annuleren</button><button class="btn gold" data-action="prestige">Verkopen!</button></div>`);
  }

  confirmReset() {
    this.modal(`<div class="modal-icon">🗑️</div><h2>Alles wissen?</h2><p>Al je voortgang, ook investeerders, wordt verwijderd. Dit kan niet ongedaan worden.</p>
      <div class="btn-row"><button class="btn" data-action="modal-close">Annuleren</button><button class="btn red" data-action="reset">Wissen</button></div>`);
  }

  offline(amount, seconds) {
    this.modal(`<div class="modal-icon">🍎</div><h2>Welkom terug!</h2>
      <p>Terwijl je ${duration(seconds)} weg was, heeft je fabriek doorgewerkt.</p>
      <div class="offline-amount">${money(amount)}</div>
      <button class="btn green wide" data-action="offline-claim">Ophalen</button>`, false);
  }

  welcome() {
    this.modal(`<div class="modal-icon">🍎</div><h2>Appel Tycoon</h2>
      <p>Bouw je eigen appelfabriek! Pluk appels in de boomgaard, maak er sap, taart en nog veel meer van, en verkoop alles met je vrachtwagens.</p>
      <ul class="perks"><li>👆 Tik op stations om ze te upgraden</li><li>🎯 Volg de doelen bovenaan voor beloningen</li><li>🏗️ Breid uit tot een gigantische fabriek</li></ul>
      <button class="btn green wide" data-action="modal-close">Starten!</button>`, true);
  }

  // ---------- Meldingen & effecten ----------

  toast(text, icon = '✨') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${icon}</span>${text}`;
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
      this.el.income.textContent = `+${money(prod.income)}/s`;
      this.el.inv.textContent = fmt(s.investors);
      this.updateGoal(prod.income);
      this.updateBoost();
      this.updateBadges();
      this.refresh();
      this.updateLabelContent();
    }
    // geld-popup boven het depot
    if (now - this.lastPop > 1300 && prod.income > 0) {
      this.lastPop = now;
      const p = this.game.world.toScreen(this.game.world.stationPos({ kind: 'sales' }).setY(8.5));
      if (p.visible && p.x > 0 && p.x < window.innerWidth && p.y > 60 && p.y < window.innerHeight) this.float(p.x, p.y, '+' + money(prod.income * 1.3), 'cash');
    }
  }

  updateGoal(income) {
    const g = goalAt(this.state.goal);
    const p = goalProgress(g, this.state, income);
    const done = p.cur >= p.max;
    this.el.goalText.innerHTML = `${g.text} <small>${g.type === 'income' ? '' : `(${fmt(p.cur)}/${fmt(p.max)})`}</small>`;
    this.el.goalBar.style.width = Math.round((p.cur / p.max) * 100) + '%';
    this.el.goalClaim.classList.toggle('hidden', !done);
    this.el.goalClaim.textContent = `🎁 ${money(goalReward(g, income))}`;
    this.el.goal.classList.toggle('done', done);
  }

  updateBoost() {
    const s = this.state;
    const now = Date.now();
    const b = this.el.boostBtn;
    if (now < s.boostUntil) {
      this.el.boostLabel.textContent = duration((s.boostUntil - now) / 1000);
      b.className = 'boost-on';
      this.el.boostBanner.classList.remove('hidden');
      this.el.boostTime.textContent = duration((s.boostUntil - now) / 1000);
    } else if (now < s.boostReadyAt) {
      this.el.boostLabel.textContent = '⏳ ' + duration((s.boostReadyAt - now) / 1000);
      b.className = 'boost-cd';
      this.el.boostBanner.classList.add('hidden');
    } else {
      this.el.boostLabel.textContent = 'Turbo';
      b.className = 'boost-ready';
      this.el.boostBanner.classList.add('hidden');
    }
  }

  updateBadges() {
    const s = this.state;
    const r = RESEARCH.filter((x) => E.researchAvailable(s, x) && s.money >= x.cost).length;
    const rb = document.querySelector('[data-open="research"] .badge');
    rb.classList.toggle('hidden', r === 0);
    rb.textContent = r;
    const t = E.nextTier(s);
    const canTier = (t && s.money >= t.cost) || LINES.some((l, i) => E.lineUnlockable(s, i) && s.money >= l.unlock);
    const eb = document.querySelector('[data-open="expand"] .badge');
    eb.classList.toggle('hidden', !canTier);
    eb.textContent = '!';
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
      const p = w.toScreen(a.pos);
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
      const icon = st.kind === 'orchard' ? ORCHARD.icon : st.kind === 'sales' ? SALES.icon : LINES[st.i].icon;
      const warn = st.kind === 'line' && this.game.prod.lines[st.i].efficiency < 0.98 ? '<span class="warn-dot">!</span>' : '';
      html = `<span class="lb-icon">${icon}</span><span class="lb-lv">Lv ${lv}</span>${can ? '<span class="up">▲</span>' : ''}${warn}`;
    } else if (st.kind === 'unlock') {
      const l = LINES[st.i];
      can = s.money >= l.unlock;
      html = `<span class="lb-icon">${l.icon}</span><span>${l.name}<br><b>${money(l.unlock)}</b></span>`;
    } else if (st.kind === 'tier') {
      const t = E.nextTier(s);
      if (!t) return;
      can = s.money >= t.cost;
      html = `<span class="lb-icon">🏗️</span><span>${t.name}<br><b>${money(t.cost)}</b></span>`;
    } else if (st.kind === 'golden') {
      html = '<span class="lb-icon">✨</span>';
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.classList.toggle('can', can);
  }
}
