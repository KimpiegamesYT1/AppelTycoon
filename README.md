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

Je begint met een schuurtje, een paar appelbomen en één bezorgscooter. Een korte tutorial laat je de eerste machine bouwen en legt de keten uit:

**boomgaard → appelbak → machines → magazijn → vrachtwagens → geld**

- **Boomgaard** – plukkers vullen de appelbak. Is de bak vol, dan stoppen ze met plukken. Elk level +25% appels.
- **8 productielijnen** – Verse Appels, Appelsap, Appelmoes, Appelchips, Appeltaart, Appelcider, Appelstroop en Karamelappels.
- **Upgraden werkt zoals in Eatventure:** elk level maakt je product meer waard (prijs × level), dat merk je meteen. Op level 10 en daarna elke 25 levels krijgt een machine een **ster**: om en om twee keer zo snel (meer appels nodig) of twee keer zo veel waard. Een level wordt maar 5,5% duurder, dus door de sterren blijft upgraden steeds lonen. **Een nieuwe machine begint op level 1** en groeit geleidelijk: de levelprijs hangt af van wat de machine kostte, dus je koopt er meteen een paar levels bij, maar niet honderden. Oudere machines staan daardoor hoger dan nieuwe. Een balk in de kaart loopt vol naar de volgende ster, en een grote melding vertelt wat je kreeg (en of je boomgaard of vrachtwagens mee moeten).
- **De keten moet meegroeien:** een snellere machine heeft meer appels en meer vrachtwagenruimte nodig. Te weinig appels en hij draait langzamer; kunnen de vrachtwagens het niet bijhouden, dan loopt het magazijn vol en lopen je lijnen vast.
- **Geld verdien je alleen met verkochte producten**: een vrachtwagen laadt kratjes aan de deur, vertrekt (dan is de lading verkocht) en is na ~10 seconden terug. Vrachtwagens vertrekken nooit leeg en wachten hooguit 4 seconden op lading.
- **Vervoer** – elk level +8% lading: kleine stappen, dus het vervoer moet regelmatig mee als je fabriek groeit (een pijltje verschijnt alleen als het nodig is). Op level 10, 25, 50, 75 en 100 komt er een laadplek met een extra voertuig bij, en het vervoer groeit mee: scooter → pickup → bestelbus → vrachtwagen → grote truck. Het magazijn groeit mee met medewerkers, heftrucks en een wikkelmachine.
- **Lopende banden** – de toevoerband is een bufferband die vol staat met appels; elke machine pakt wat hij nodig heeft. Bij een appeltekort wordt hij zichtbaar leger en krijgt elke lijn zijn eerlijke deel. Af en toe rolt er een **gouden appel** mee: het product dat ervan gemaakt wordt levert 5× zoveel op.
- **Upgrades-menu** – 38 eenmalige upgrades (prijs x2/x3, snelheid x2, boomgaard, vrachtwagens, alle prijzen), goedkoopste eerst, zoals het upgrade-menu van Eatventure. Rode pijltjes boven stations en een rood getal op de knop laten zien wat je kunt kopen.
- **Ketenbalans** – staven en een grafiek van plukken, verwerken en vervoeren (alles in appels per seconde).
- De banden vormen één netwerk (toevoerband → lijnen → verzamelband → magazijn). Loopt het magazijn vol, dan hopen producten zich zichtbaar op tot aan de machines.
- **Uitbreidingen** – 11 fabrieksformaten, van Schuurtje tot Appelplaneet.
- **Investeerders (prestige)**, **gouden appels**, **doelen** en **offline-inkomen** (50%, max 4 uur).

Bediening: slepen om te bewegen, scrollen/knijpen om te zoomen, tikken op een station of label om te upgraden. Houd de upgradeknop ingedrukt om snel achter elkaar te kopen.

## Balans

Alle getallen staan in [`js/config.js`](js/config.js). Een bot ([`tools/bot.mjs`](tools/bot.mjs)) speelt het spel en doet steeds de beste aankoop, waarbij hij de keten in balans houdt.

```bash
node tools/balance-check.mjs               # alle balanstests (± 1 min)
node tools/balance-sim.mjs 120             # eerste ronde, 120 minuten, met tijdlijn
node tools/balance-sim.mjs 480 --prestige  # met investeerdersrondes
node tools/calibrate-lines.mjs --write     # per lijn waarde en levelprijs (nieuwe lijn begint laag, ~25% van het inkomen na 10 min)
node tools/calibrate.mjs --write           # bouwprijzen van lijnen en hallen afstemmen op doeltijden
```

`balance-check` speelt met vier soorten spelers (slimme speler, gewone speler die elke 20 s het goedkoopste pijltje koopt, luie speler die elke 5 min kijkt, en een speler met investeerdersrondes) plus de intro, en controleert 31 criteria:

- **Begin:** de intro is in ~40 seconden te doen; in de eerste 10 minuten kun je ongeveer elke 10 seconden iets kopen.
- **Tijdlijn eerste ronde (slimme speler):** Werkplaats ~6 min, Fabriek ~12, Grote Fabriek ~20, Industriehal ~34, Megafabriek ~55, Appelstroop ~62. Een gewone speler doet er hooguit 2,5x zo lang over; een luie speler haalt de Grote Fabriek in ruim een uur.
- **Altijd iets te doen:** een gewone speler heeft in het eerste uur maar ~10% van de tijd niets betaalbaars dat zich binnen 5 minuten terugverdient.
- **Alle machines verdienen mee:** geen enkele machine levert meer dan 60% van het inkomen, de helft van de machines elk minstens 5%. Een nieuwe machine levert ~10 minuten na het bouwen zo'n kwart van het inkomen. Bij appeltekort krijgt elke machine naar verhouding minder.
- **Nieuwe machines beginnen laag:** een minuut na het bouwen staat een nieuwe lijn hooguit op level 30 (meestal 1–10).
- **Upgrades lonen:** mediane terugverdientijd van een lijn-upgrade ~4 minuten in het eerste halfuur, ~9 minuten daarna.
- **Boomgaard en vervoer** kosten meestal enkele seconden tot een halve minuut inkomen per upgrade en lopen nooit vast. Per uitbreiding worden ze duurder; de boomgaard wordt dan ook 50% productiever, het vervoer niet (dat groeit alleen met levels en voertuigen).
- **Taken** geven 4–12 seconden inkomen; er zijn er steeds nieuwe haalbaar.
- **Investeerders:** eerste +10 rond 55–60 minuten; daarna rondes van ~45–80 minuten, zonder ontsporing (getallen blijven onder 10^30 na 8 uur).

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
