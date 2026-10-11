# 🍎 Appel Tycoon

Een 3D low-poly tycoon-spel in de browser, speelbaar op mobiel en desktop. Bouw een appelfabriek op van een klein schuurtje tot een **Appelplaneet**.

## Spelen

Het spel is een statische website zonder build-stap. Lokaal starten:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Online zetten met GitHub Pages: **Settings → Pages → Deploy from a branch**, kies de branch en map `/ (root)`.

## Gameplay

- **Boomgaard** – levert appels. Elke productielijn heeft appels nodig; te weinig appels en je lijnen staan stil (⚠️). Overtollige appels worden los verkocht.
- **8 productielijnen** – Verse Appels, Appelsap, Appelmoes, Appelchips, Appeltaart, Appelcider, Appelstroop en Karamelappels. Duurdere producten leveren meer op per appel en krijgen voorrang.
- **Verkoop & Marketing** – verhoogt de prijs van alle producten; vrachtwagens rijden af en aan.
- **Mijlpalen** – op level 25, 50, 100, 150, … verdubbelt de productie van een station.
- **Uitbreidingen** – 11 fabrieksformaten (Schuurtje → Werkplaats → … → Gigafabriek → Appelcomplex → Appelstad → Appelimperium → Appelplaneet). Elke uitbreiding geeft ruimte voor nieuwe lijnen, extra boomgaard en een inkomensbonus.
- **Onderzoek** – eenmalige vermenigvuldigers.
- **Investeerders (prestige)** – verkoop je fabriek en begin opnieuw met +5% inkomen per investeerder.
- **Turbo**, **gouden appels**, **doelen met beloningen** en **offline-inkomen** (50%, max 3 uur).

Bediening: slepen om te bewegen, scrollen/knijpen om te zoomen, tikken op een station of label om te upgraden. Houd de upgradeknop ingedrukt om snel achter elkaar te kopen.

## Balans

Alle getallen staan in [`js/config.js`](js/config.js). De simulatie in [`tools/balance-sim.mjs`](tools/balance-sim.mjs) speelt het spel met een slimme bot en print wanneer lijnen en uitbreidingen gekocht worden:

```bash
node tools/balance-sim.mjs 60             # eerste ronde, 60 minuten
node tools/balance-sim.mjs 240 --prestige # met investeerdersrondes
```

Richtwaarden voor een eerste ronde: Appelsap na ~45 s, Werkplaats na ~2,5 min, Fabriek na ~4 min, Megafabriek na ~16 min en de eerste investeerders rond 25–30 minuten. Met investeerders gaat elke volgende ronde sneller.

## Techniek

- [Three.js](https://threejs.org) r170 (meegeleverd in `vendor/`, MIT-licentie)
- Low-poly modellen worden uit simpele vormen opgebouwd en samengevoegd tot één mesh met vertex-kleuren; producten op de banden gebruiken `InstancedMesh`.
- Voortgang wordt in `localStorage` bewaard.

```
index.html
css/style.css
js/config.js     balansgetallen
js/economy.js    spellogica (zonder DOM, ook gebruikt door de simulatie)
js/world.js      3D-wereld, camera en animaties
js/models.js     low-poly modellen
js/ui.js         HUD, panelen en labels
js/goals.js      doelen
js/main.js       game loop, opslaan, offline-inkomen
```
