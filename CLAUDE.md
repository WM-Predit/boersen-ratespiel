# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Börsen-Ratespiel — ein Browser-Spiel zum Üben des Gefühls für Kursverläufe. Man sieht einen simulierten Kursverlauf und tippt, ob es als Nächstes rauf oder runter geht. Reines Vanilla HTML/CSS/JS ohne Build-Step und ohne Abhängigkeiten.

## Running

Einfach `index.html` im Browser öffnen. Kein Build, kein Package-Manager, keine Tests vorhanden.

## Architecture

Drei Dateien, jede mit klarer Verantwortung:

- `index.html` — Seitenstruktur (Stats-Leiste, Canvas, Steuerungs-Buttons)
- `style.css` — Theme via CSS-Variablen in `:root` (Farben für bg/panel/text/green/red/accent)
- `script.js` — gesamte Spiellogik

**Spielablauf in `script.js`:**

1. `generateSeries()` erzeugt einen Kursverlauf als Random Walk mit Drift + Volatilität (Gaussian-verteilte Schocks über `gaussianRandom()`, Box-Muller-Transformation). Insgesamt `HISTORY_POINTS` (90) sichtbare Vergangenheitspunkte + `FUTURE_POINTS` (25) verdeckte Zukunftspunkte.
2. `draw(visibleCount, opts)` rendert den Verlauf auf dem `<canvas>` per 2D-Context — Vergangenheit in Blau, aufgedeckte Zukunft farbig je nach Ergebnis (grün/rot), getrennt durch eine gestrichelte Linie bei `HISTORY_POINTS`.
3. Klick auf „Rauf“/„Runter“ triggert `revealAndScore()`, das den Rest der Serie per `setInterval` (40ms/Frame) animiert aufdeckt und danach `showResult()` aufruft.
4. `showResult()` wertet Treffer/Serie/Bestserie aus. Die Bestserie (`best`) wird in `localStorage` unter dem Key `boersenspiel_best` persistiert — der einzige Zustand, der über Reloads hinweg erhalten bleibt.

Es gibt keine echten Marktdaten — alle Kursverläufe sind simuliert (siehe README).
