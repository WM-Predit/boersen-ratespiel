#!/usr/bin/env python3
"""Meldet alle Adressen aus sitemap.xml per IndexNow an Bing, Yandex, Seznam, Naver und Yep.

IndexNow (https://www.indexnow.org) ist ein offenes Protokoll: Die Seite meldet neue oder geänderte Adressen selbst,
statt zu warten, bis ein Crawler vorbeikommt. Ein Konto braucht es nicht — als Nachweis dient eine Schlüsseldatei
<schlüssel>.txt im Hauptverzeichnis der Seite, die genau den Schlüssel enthält. Google nimmt an IndexNow NICHT teil.

Läuft automatisch in .github/workflows/deploy-pages.yml NACH dem Veröffentlichen (die Schlüsseldatei und neue Seiten
müssen dann schon erreichbar sein) und nur bei Pushes/manuellen Läufen, nicht bei den stündlichen News-Deploys —
dort ändern sich keine Seiten-Adressen, und ständiges Wiedermelden unveränderter Adressen ist unerwünscht.

Lokal testen ohne zu senden: python3 scripts/indexnow.py --dry-run
Nur Python-Standardbibliothek.
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = 'boersen-ratespiel.github.io'
ENDPOINT = 'https://api.indexnow.org/indexnow'
KEY_RE = re.compile(r'^[0-9a-f]{32}$')


def find_key():
    keys = [p for p in ROOT.glob('*.txt') if KEY_RE.match(p.stem) and p.read_text(encoding='utf-8').strip() == p.stem]
    if len(keys) != 1:
        sys.exit(f'Genau eine IndexNow-Schlüsseldatei (<32 Hex-Zeichen>.txt) im Hauptverzeichnis erwartet, gefunden: {len(keys)}')
    return keys[0].stem


def sitemap_urls():
    text = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    urls = re.findall(r'<loc>(.*?)</loc>', text)
    urls = [u for u in urls if u.startswith(f'https://{HOST}/')]
    if not urls:
        sys.exit('Keine Adressen in sitemap.xml gefunden.')
    return urls


def main():
    key = find_key()
    urls = sitemap_urls()
    payload = {'host': HOST, 'key': key, 'keyLocation': f'https://{HOST}/{key}.txt', 'urlList': urls}
    if '--dry-run' in sys.argv:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json; charset=utf-8'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            # 200 = angenommen, 202 = angenommen, Schlüssel wird noch geprüft
            print(f'IndexNow: {len(urls)} Adressen gemeldet (HTTP {response.status}).')
    except urllib.error.HTTPError as err:
        sys.exit(f'IndexNow hat die Meldung abgelehnt: HTTP {err.code} {err.reason}')
    except urllib.error.URLError as err:
        sys.exit(f'IndexNow nicht erreichbar: {err.reason}')


if __name__ == '__main__':
    main()
