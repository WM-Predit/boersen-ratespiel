# 📈 Börsen-Ratespiel

News, Wissen, Spiel & Musterdepot — ein kleiner, spielerischer Einstieg in die Börse, ganz ohne Risiko und ohne echtes Geld.

## Bereiche

- **📰 News** — kurz zusammengefasste, fiktive Markt-Meldungen mit Kategorie, Stimmung und Marktrelevanz, plus laufendem Live-Ticker.
- **📚 Lernen** — Multiple-Choice-Quiz zu Investment-Grundlagen in drei Schwierigkeitsgraden (Leicht/Mittel/Schwer), mit Leben, Punkten und Highscores.
- **📈📉 Rauf oder Runter** — du siehst einen simulierten Kursverlauf und tippst, ob es als Nächstes rauf oder runter geht. Mit Countdown, Streak-Multiplikator und Konfetti bei einer heißen Serie.
- **💼 Musterdepot** — virtuelles Startkapital, fiktive Aktien kaufen/verkaufen, optional live mitverfolgen, wie sich die Kurse bewegen.

## Spielen

Einfach [`index.html`](index.html) im Browser öffnen — kein Build-Step, keine Abhängigkeiten.

## Installieren (PWA)

Die App ist eine Progressive Web App: über "Zum Home-Bildschirm hinzufügen" (iOS Safari) bzw. "App installieren" (Android Chrome, Desktop-Browser) lässt sie sich wie eine echte App installieren — mit eigenem Icon und ohne Browser-Leiste. Ein Service Worker (`sw.js`) cached die App-Shell, sodass sie danach auch offline startet. Das ist (noch) keine Veröffentlichung im Apple App Store oder Google Play Store, aber der einfachste Weg zu einem "App-Gefühl" ganz ohne Store-Anmeldung oder Review-Prozess.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Seitenstruktur, alle vier Bereiche als eigene Views |
| `style.css` | Theme, Glassmorphism-Look, Animationen |
| `script.js` | Navigation + Logik aller vier Bereiche |
| `manifest.json`, `sw.js` | PWA-Manifest und Service Worker |
| `icons/`, `apple-touch-icon.png`, `favicon.png` | App-Icons |
| `fonts/` | Lokal gehostete Schriftart (kein Google-Fonts-Aufruf) |
| `impressum.html`, `datenschutz.html` | Rechtliche Pflichtseiten |

Mehr Details zur Architektur stehen in [`CLAUDE.md`](CLAUDE.md).

## Hinweis

Alle Kursverläufe, Aktien und Marktmeldungen sind rein zufällig simuliert bzw. frei erfunden und stellen **keine echten Marktdaten** dar. Die App dient nur zum Üben des eigenen Gespürs für Trends, Volatilität und Grundlagenwissen — sie ist **keine Anlageberatung**.
