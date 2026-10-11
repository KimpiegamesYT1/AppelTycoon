# 🍎 Appel Tycoon

Een 3D low-poly tycoon-spel in de browser, speelbaar op mobiel en desktop. Bouw een appelfabriek op van een klein schuurtje tot een **Appelplaneet**.

## Spelen

Het spel is een statische website zonder build-stap. Lokaal starten:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Online zetten met GitHub Pages: **Settings → Pages → Deploy from a branch**, kies de branch en map `/ (root)`.

**Cache-buster:** draai na het aanpassen van code `node tools/bump-version.mjs` (of `npm run version`) vóór je commit. Dat zet een versie (hash van de inhoud) achter alle bestanden in `index.html`, zodat spelers na herladen meteen de nieuwe versie krijgen.

## Gameplay

Je begint met een schuurtje, een paar appelbomen en één vrachtwagen. Een korte tutorial laat je de eerste machine bouwen en legt de keten uit:

**boomgaard → appelbak → machines → magazijn → vrachtwagens → geld**

- **Boomgaard** – plukkers vullen de appelbak. Is de bak vol, dan stoppen ze met plukken.
- **8 productielijnen** – Verse Appels, Appelsap, Appelmoes, Appelchips, Appeltaart, Appelcider, Appelstroop en Karamelappels. Elke machine heeft appels nodig; te weinig appels en hij draait langzamer.
- **Geld verdien je alleen met verkochte producten**: een vrachtwagen laadt aan de deur, vertrekt (dan is de lading verkocht) en komt leeg terug. Vrachtwagens vertrekken nooit leeg.
- **Vrachtwagens** – brengen alles uit het magazijn naar de markt. Kunnen ze het niet bijhouden, dan loopt het magazijn vol en lopen je productielijnen vast. Op level 10, 20, 50, 100 en 200 krijgt het magazijn een extra laadplek met een extra vrachtwagen. Boven elke vertrekkende vrachtwagen zie je wat de lading opleverde.
- **Ketenbalans** – een paneel met staven en een grafiek van plukken, verwerken en vervoeren (alles in appels per seconde), zodat je ziet welke schakel het zwakst is.
- De banden vormen één netwerk (toevoerband → lijnen → verzamelband → magazijn). Loopt het magazijn vol, dan hopen producten zich zichtbaar op tot aan de machines.
- Je moet dus steeds de zwakste schakel upgraden. De labels boven de stations laten zien hoe vol de appelbak en het magazijn zijn, en een uitroepteken als een lijn te weinig appels krijgt (oranje) of vastloopt (rood).
- **Mijlpalen** – op level 25, 50, 100, … verdubbelt een station.
- **Uitbreidingen** – 11 fabrieksformaten, van Schuurtje tot Appelplaneet.
- **Onderzoek**, **investeerders (prestige)**, **gouden appels**, **doelen** en **offline-inkomen** (50%, max 3 uur).

Bediening: slepen om te bewegen, scrollen/knijpen om te zoomen, tikken op een station of label om te upgraden. Houd de upgradeknop ingedrukt om snel achter elkaar te kopen.

## Balans

Alle getallen staan in [`js/config.js`](js/config.js). De simulatie in [`tools/balance-sim.mjs`](tools/balance-sim.mjs) speelt het spel met een bot die steeds de beste upgrade koopt (en daarbij de keten in balans houdt):

```bash
node tools/balance-sim.mjs 120             # eerste ronde, 120 minuten
node tools/balance-sim.mjs 600 --prestige  # met investeerdersrondes
```

Richtwaarden voor de bot (een echte speler doet er langer over): Appelsap na ~4 min, Werkplaats ~7 min, Fabriek ~16 min, Grote Fabriek ~35 min, Industriehal ~70 min, eerste investeerdersronde na ruim 2 uur. Met investeerders gaat elke ronde sneller; de Gigafabriek komt na een paar rondes.

## Techniek

- [Three.js](https://threejs.org) r170 (meegeleverd in `vendor/`, MIT-licentie)
- Low-poly modellen worden uit simpele vormen opgebouwd en samengevoegd tot één mesh met vertex-kleuren; producten op de banden gebruiken `InstancedMesh`.
- Voortgang wordt in `localStorage` bewaard.
- Achtergrondmuziek: `assets/audio/factory-flow.mp3` ("Factory Flow", mono 32 kHz). Speelt via Web Audio zodat telefoons geen mediaspeler tonen; start na de eerste tik en kan uit in de instellingen.
- Iconen zijn eigen inline SVG's (`js/icons.js`).

```
index.html
css/style.css
js/config.js     balansgetallen
js/economy.js    spellogica (zonder DOM, ook gebruikt door de simulatie)
js/world.js      3D-wereld, camera en animaties
js/models.js     low-poly modellen
js/ui.js         HUD, panelen en labels
js/goals.js      doelen
js/tutorial.js   begeleide start
js/icons.js      SVG-iconen
js/main.js       game loop, opslaan, offline-inkomen
```
