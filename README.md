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

- **Boomgaard** – plukkers vullen de appelbak. Is de bak vol, dan stoppen ze met plukken. Elk level +25% appels.
- **8 productielijnen** – Verse Appels, Appelsap, Appelmoes, Appelchips, Appeltaart, Appelcider, Appelstroop en Karamelappels.
- **Upgraden werkt zoals in Eatventure:** elk level maakt je product meer waard (prijs × level), dat merk je meteen. Op level 10, 25, 50, 75, 100, … krijgt een machine een **ster**: om en om twee keer zo snel (meer appels nodig) of twee keer zo veel waard. Zo blijven ook je oudste lijnen de moeite waard. Een balk in de kaart loopt vol naar de volgende ster, en een grote melding vertelt wat je kreeg (en of je boomgaard of vrachtwagens mee moeten).
- **De keten moet meegroeien:** een snellere machine heeft meer appels en meer vrachtwagenruimte nodig. Te weinig appels en hij draait langzamer; kunnen de vrachtwagens het niet bijhouden, dan loopt het magazijn vol en lopen je lijnen vast.
- **Geld verdien je alleen met verkochte producten**: een vrachtwagen laadt kratjes aan de deur, vertrekt (dan is de lading verkocht) en komt leeg terug. Vrachtwagens vertrekken nooit leeg.
- **Vrachtwagens** – elk level +25% lading. Op level 10, 20, 30, 40 en 50 komt er een laadplek met een extra vrachtwagen bij.
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
node tools/calibrate.mjs --write           # bouwprijzen van lijnen en hallen afstemmen op doeltijden
```

`balance-check` speelt met vier soorten spelers (slimme speler, gewone speler die elke 20 s het goedkoopste pijltje koopt, luie speler die elke 5 min kijkt, en een speler met investeerdersrondes) plus de intro, en controleert 30 criteria:

- **Tijdlijn eerste ronde (slimme speler):** Werkplaats ~6 min, Fabriek ~13, Grote Fabriek ~20, Industriehal ~33, Megafabriek ~51, Appelstroop ~56. Een gewone speler doet er hooguit 2,5x zo lang over; een luie speler haalt de Grote Fabriek in ruim een uur.
- **Alle machines verdienen mee:** geen enkele machine levert meer dan 60% van het inkomen, de helft van de machines elk minstens 5%. Elk nieuw product levert op hetzelfde level ongeveer 2x zoveel op als het vorige. Bij appeltekort krijgt elke machine naar verhouding minder.
- **Upgrades lonen:** mediane terugverdientijd van een lijn-upgrade onder 1 minuut in het eerste uur; tot het moment voor investeerders nooit langer dan 12 minuten niets te kopen.
- **Boomgaard en vrachtwagens** kosten meestal 5–30 seconden inkomen per upgrade (per uitbreiding duurder, maar ook 50% productiever), en lopen nooit vast.
- **Taken** geven 4–12 seconden inkomen; er zijn er steeds nieuwe haalbaar.
- **Investeerders:** eerste +10 rond een uur, als de ronde vlak wordt; daarna rondes van ~50–60 minuten die het inkomen steeds ongeveer verdubbelen, zonder ontsporing.

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
