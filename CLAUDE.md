# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Börsen-Ratespiel — ein Browser-Spiel zum Üben des Gefühls für Kursverläufe. Man sieht einen simulierten Kursverlauf und tippt, ob es als Nächstes rauf oder runter geht. Reines Vanilla HTML/CSS/JS ohne Build-Step und ohne Abhängigkeiten.

## Running

Einfach `index.html` im Browser öffnen. Kein Build, kein Package-Manager, keine Tests vorhanden.

## Architecture

Drei Dateien, jede mit klarer Verantwortung:

- `index.html` — Seitenstruktur: ein Menü (`#menu`) zur Auswahl, plus je eine `<section class="view">` pro Feature (`#news-view`, `#game-view`)
- `style.css` — Theme via CSS-Variablen in `:root` (Farben für bg/panel/text/green/red/accent)
- `script.js` — Navigations-Logik + gesamte Spiellogik

**Navigation:** Die App startet auf dem Menü (`#menu`). Ein Klick auf einen `.menu-item[data-view]`-Button blendet das Menü aus und die passende `.view`-Section ein (per `hidden`-Klasse, siehe `script.js` oben). Der `.back-btn` in jeder View kehrt zum Menü zurück. Neue Features bekommen einfach eine weitere `.view`-Section plus einen Menüpunkt.

**Spielablauf in `script.js`** (Section `#game-view`):

1. `generateSeries()` erzeugt einen Kursverlauf als Random Walk mit Drift + Volatilität (Gaussian-verteilte Schocks über `gaussianRandom()`, Box-Muller-Transformation). Insgesamt `HISTORY_POINTS` (90) sichtbare Vergangenheitspunkte + `FUTURE_POINTS` (25) verdeckte Zukunftspunkte.
2. `draw(visibleCount, opts)` rendert den Verlauf auf dem `<canvas>` per 2D-Context — Vergangenheit in Blau, aufgedeckte Zukunft farbig je nach Ergebnis (grün/rot), getrennt durch eine gestrichelte Linie bei `HISTORY_POINTS`.
3. Klick auf „Rauf“/„Runter“ triggert `revealAndScore()`, das den Rest der Serie per `setInterval` (40ms/Frame) animiert aufdeckt und danach `showResult()` aufruft.
4. `showResult()` wertet Treffer/Serie/Bestserie aus. Die Bestserie (`best`) wird in `localStorage` unter dem Key `boersenspiel_best` persistiert — der einzige Zustand, der über Reloads hinweg erhalten bleibt.

**News (`#news-view`):** aktuell eine statische, handkuratierte Liste (`.news-list` in `index.html`) mit 2-3 kurzen Markt-Meldungen. Es gibt keine echten Marktdaten — weder hier noch im Spiel sind es Live-Feeds, alles ist simuliert bzw. manuell zusammengefasst (siehe README).

## Achtung: lokaler Test-Server cached script.js

`python3 -m http.server` sendet keine `Cache-Control`-Header. Chrome cached `script.js` deshalb teils ohne jede Nachfrage (kein Log-Eintrag, kein 304) über mehrere Reloads hinweg, während `index.html`/`style.css` normal revalidiert werden. Wenn Änderungen an `script.js` im Preview nicht ankommen, obwohl die Datei auf der Platte korrekt ist: harter Reload reicht oft nicht — zur Sicherheit den Server auf einem neuen Port neu starten (neue Origin = garantiert kein Cache-Treffer).
