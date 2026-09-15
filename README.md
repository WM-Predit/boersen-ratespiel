# 📈 Börsen-Ratespiel

Ein kleines Browser-Spiel zum Üben des Gefühls für Kursverläufe: Du siehst einen simulierten Kursverlauf und tippst, ob es als Nächstes **rauf** oder **runter** geht.

## Spielen

Einfach [`index.html`](index.html) im Browser öffnen — kein Build-Step, keine Abhängigkeiten.

## Installieren (PWA)

Die App ist eine Progressive Web App: über "Zum Home-Bildschirm hinzufügen" (iOS Safari) bzw. "App installieren" (Android Chrome, Desktop-Browser) lässt sie sich wie eine echte App installieren — mit eigenem Icon und ohne Browser-Leiste. Ein Service Worker (`sw.js`) cached die App-Shell, sodass sie danach auch offline startet. Das ist (noch) keine Veröffentlichung im Apple App Store oder Google Play Store, aber der einfachste Weg zu einem "App-Gefühl" ganz ohne Store-Anmeldung oder Review-Prozess.

## Wie es funktioniert

- Ein zufälliger Kursverlauf wird über `generateSeries()` simuliert (Random Walk mit Drift und Volatilität, kein echtes Marktdaten-Feed).
- Nach deinem Tipp wird der weitere Verlauf aufgedeckt und ausgewertet.
- Punkte, aktuelle Serie und Bestserie werden angezeigt; die Bestserie bleibt über `localStorage` auch nach einem Reload erhalten.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Struktur der Seite |
| `style.css` | Darstellung/Theme |
| `script.js` | Spiellogik, Kursgenerierung, Canvas-Rendering |

## Hinweis

Die Kursverläufe sind rein zufällig simuliert und stellen **keine echten Marktdaten** dar — das Spiel dient nur zum Üben des eigenen Gespürs für Trends, Volatilität und Rauschen.
