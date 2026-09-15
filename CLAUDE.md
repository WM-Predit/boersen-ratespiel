# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Börsen-Ratespiel — ein Browser-Spiel zum Üben des Gefühls für Kursverläufe. Man sieht einen simulierten Kursverlauf und tippt, ob es als Nächstes rauf oder runter geht. Reines Vanilla HTML/CSS/JS ohne Build-Step und ohne Abhängigkeiten.

## Running

Einfach `index.html` im Browser öffnen. Kein Build, kein Package-Manager, keine Tests vorhanden.

## Architecture

Drei Dateien, jede mit klarer Verantwortung:

- `index.html` — Seitenstruktur: ein Menü (`#menu`) zur Auswahl, plus je eine `<section class="view">` pro Feature (`#news-view`, `#learn-view`, `#game-view`, `#depot-view`)
- `style.css` — Theme via CSS-Variablen in `:root` (Farben für bg/panel/text/green/red/accent), Glassmorphism-Look (Blur, halbtransparente Panels), Google Font "Outfit"
- `script.js` — Navigations-Logik + gesamte Spiellogik

**Navigation:** Die App startet auf dem Menü (`#menu`). Ein Klick auf einen `.menu-item[data-view]`-Button blendet das Menü aus und die passende `.view`-Section ein (per `hidden`-Klasse, siehe `script.js` oben). Der `.back-btn` in jeder View kehrt zum Menü zurück. Neue Features bekommen einfach eine weitere `.view`-Section plus einen Menüpunkt.

**Spielablauf in `script.js`** (Section `#game-view`):

1. `generateSeries()` erzeugt einen Kursverlauf als Random Walk mit Drift + Volatilität (Gaussian-verteilte Schocks über `gaussianRandom()`, Box-Muller-Transformation). Insgesamt `HISTORY_POINTS` (90) sichtbare Vergangenheitspunkte + `FUTURE_POINTS` (25) verdeckte Zukunftspunkte.
2. `draw(visibleCount, opts)` rendert den Verlauf auf dem `<canvas>` per 2D-Context — Gradient-Fläche + Glow unter/um die Linie, Vergangenheit in Blau, aufgedeckte Zukunft farbig je nach Ergebnis (grün/rot), getrennt durch eine gestrichelte Linie bei `HISTORY_POINTS`.
3. `newRound()` startet zusätzlich `startRoundTimer()` — ein `ROUND_TIME_MS` (6s) Countdown mit visueller Leiste (`#roundTimerBar`). Läuft die Zeit ab, wird die Runde automatisch als falsch gewertet (`revealAndScore(null, true)` — `null` kann nie `=== true/false` sein, daher immer `correct === false`).
4. Klick auf „Rauf“/„Runter“ triggert `revealAndScore()`, das den Timer stoppt und den Rest der Serie per `setInterval` (40ms/Frame) animiert aufdeckt, dann `showResult()` aufruft.
5. `showResult()` wertet Treffer/Serie/Bestserie aus. Punkte pro Treffer = `BASE_POINTS` (10) × Multiplikator aus `getMultiplier(streak)` (1× / 1.5× ab Serie 3 / 2× ab Serie 5 / 3× ab Serie 10, angezeigt als Badge). Bei Erreichen einer Serie aus `STREAK_MILESTONES` erscheint ein kurzer Toast (`showStreakToast()`). Bei Treffer zusätzlich `burstConfetti()`. Die Bestserie (`best`) wird in `localStorage` unter dem Key `boersenspiel_best` persistiert.

Wichtig: `newRound()`/der Rundentimer werden NICHT beim Laden der Seite gestartet, sondern erst wenn `#game-view` über das Menü geöffnet wird (`if (btn.dataset.view === 'game-view') newRound();` im Menü-Click-Handler oben in der Datei) — sonst würde der 6s-Timer schon unsichtbar im Hintergrund laufen, bevor der Nutzer das Spiel überhaupt sieht, und beim ersten Blick wäre die Runde eventuell schon durch Zeitablauf verloren. Verlassen der Ansicht über `.back-btn` stoppt den Timer über `clearRoundTimer()`.

**News (`#news-view`):** statische, handkuratierte Liste (`.info-list` in `index.html`, gemeinsames `.panel`-Layout). Es gibt keine echten Marktdaten — nirgendwo in der App sind es Live-Feeds, alles ist simuliert bzw. manuell zusammengefasst (siehe README).

**Lernen (`#learn-view`):** Multiple-Choice-Quiz mit drei Schwierigkeitsgraden (`LEVELS` in `script.js`: leicht/mittel/schwer, je 5 Fragen in `QUIZ_DATA`). Ablauf: Level-Auswahl (`#learnLevels`) → Quiz (`#learnQuiz`, 3 Leben, Punkte je nach Level, Fortschrittsbalken) → Ergebnis (`#learnResult`, mit Konfetti bei perfektem Lauf). `resetLearnView()` setzt die Ansicht beim erneuten Öffnen über das Menü immer auf die Level-Auswahl zurück, egal in welchem Quiz-Zustand man vorher war. Highscores pro Level werden unter `localStorage`-Key `boersenspiel_learn_best` persistiert.

Achtung: `.result-panel` hat eine EIGENE Animation (`resultPopIn`) statt der `popIn`-Keyframe vom `.banner` — `popIn` enthält `translate(-50%,-50%)`, was nur für das absolut-positionierte, zentrierte Banner Sinn ergibt. Eine geteilte Animation zwischen beiden hatte das Ergebnis-Panel in die obere linke Ecke verschoben.

**Musterdepot (`#depot-view`):** einfache Paper-Trading-Simulation. Startkapital `DEPOT_START_CASH` (10.000 €) plus vier fiktive Aktien (`DEPOT_STOCKS_DEFAULT`). „Kaufen“ investiert einen festen Betrag (`DEPOT_BUY_AMOUNT`, 500 €) zum aktuellen Kurs, „Verkaufen“ löst die komplette Position auf. Der komplette Depot-Zustand (Cash, Kurse, Positionen) wird als JSON unter `localStorage`-Key `boersenspiel_depot` persistiert, siehe `loadDepot()`/`saveDepot()`.

**Live-Modus im Depot:** „▶️ Simulation starten“ (`depotToggle`) startet `setInterval(tickDepotPrices, DEPOT_TICK_MS)` (1800ms) — Kurse bewegen sich automatisch per Random Walk, Kaufen/Verkaufen bleibt währenddessen über die normale Event-Delegation auf `#depotStocks` möglich (kein Re-Render blockiert Interaktion). `depotTrends` merkt sich pro Aktie die letzte Richtung (`up`/`down`) für die kurze Flash-Animation im Preis. „⏸ Pausieren“ oder Verlassen der Ansicht über `.back-btn` ruft `stopDepotLive()` auf, das den Timer beendet — sonst würde er unsichtbar im Hintergrund weiterlaufen. Beim Zurücksetzen des Depots wird der Timer ebenfalls gestoppt.

## Achtung: lokaler Test-Server cached script.js

`python3 -m http.server` sendet keine `Cache-Control`-Header. Chrome cached `script.js` deshalb teils ohne jede Nachfrage (kein Log-Eintrag, kein 304) über mehrere Reloads hinweg, während `index.html`/`style.css` normal revalidiert werden. Wenn Änderungen an `script.js` im Preview nicht ankommen, obwohl die Datei auf der Platte korrekt ist: harter Reload reicht oft nicht — zur Sicherheit den Server auf einem neuen Port neu starten (neue Origin = garantiert kein Cache-Treffer).
