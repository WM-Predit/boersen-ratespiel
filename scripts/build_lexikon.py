#!/usr/bin/env python3
"""Erzeugt aus den Lexikon-Einträgen in index.html eigene Seiten unter lexikon/ und die sitemap.xml.

Die Einträge werden nur an EINER Stelle gepflegt (index.html, <article class="lex-entry">). Dieses Skript macht daraus
je Begriff eine eigene, von Suchmaschinen gut auffindbare Seite (lexikon/<id>.html) plus eine Übersicht
(lexikon/index.html) und schreibt die sitemap.xml neu. Es läuft automatisch in .github/workflows/deploy-pages.yml vor
dem Veröffentlichen; der Ordner lexikon/ ist deshalb nicht eingecheckt (.gitignore).

Lokal testen: python3 scripts/build_lexikon.py  (danach z. B. python3 -m http.server und /lexikon/ öffnen)
Nur Python-Standardbibliothek.
"""

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://boersen-ratespiel.github.io/'
OUT_DIR = ROOT / 'lexikon'
DESC_MAX_CHARS = 155

ENTRY_RE = re.compile(
    r'<article class="lex-entry" id="lex-(?P<id>[a-z0-9-]+)"[^>]*>\s*<h3>(?P<title>.*?)</h3>\s*<p>(?P<body>.*?)</p>\s*</article>',
    re.S,
)
LEX_LINK_RE = re.compile(r'<a class="link-btn" href="#lexikon" data-lex="([a-z0-9-]+)">(.*?)</a>', re.S)
GOTO_LINK_RE = re.compile(r'<a class="link-btn" href="#([a-z]+)" data-goto="[a-z-]+">(.*?)</a>', re.S)
TAG_RE = re.compile(r'<[^>]+>')

# Seiten, die zusätzlich zu den Lexikon-Seiten in die Sitemap gehören (Pfad, Priorität).
STATIC_PAGES = [('', '1.0'), ('lexikon/', '0.8'), ('impressum.html', '0.2'), ('datenschutz.html', '0.2')]


def parse_entries(index_html):
    entries = []
    for m in ENTRY_RE.finditer(index_html):
        entries.append({'id': m.group('id'), 'title': m.group('title').strip(), 'body': m.group('body').strip()})
    if not entries:
        sys.exit('Keine Lexikon-Einträge in index.html gefunden — hat sich das Markup geändert?')
    if any(e['id'] == 'index' for e in entries):
        sys.exit('Die Lexikon-ID "index" ist reserviert (würde lexikon/index.html überschreiben).')
    return entries


def body_for_page(body, known_ids):
    def lex(m):
        target, text = m.group(1), m.group(2)
        if target not in known_ids:
            sys.exit(f'Lexikon-Verweis auf unbekannten Eintrag: {target}')
        return f'<a href="{target}.html">{text}</a>'

    body = LEX_LINK_RE.sub(lex, body)
    body = GOTO_LINK_RE.sub(lambda m: f'<a href="../#{m.group(1)}">{m.group(2)}</a>', body)
    if 'data-lex' in body or 'data-goto' in body:
        sys.exit('Unbekanntes Link-Format im Lexikon — build_lexikon.py anpassen.')
    return body


def plain_text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(TAG_RE.sub('', fragment))).strip()


def short_description(text):
    if len(text) <= DESC_MAX_CHARS:
        return text
    cut = text[:DESC_MAX_CHARS - 1]
    return cut[:cut.rfind(' ')].rstrip(',;:—-') + ' …'


def page_shell(title, description, canonical, body, extra_head=''):
    return f'''<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<meta name="theme-color" content="#06070d">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:locale" content="de_DE">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:image" content="{SITE}og-image.jpg">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../favicon.png">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="stylesheet" href="../style.css">
{extra_head}<script data-goatcounter="https://boersen-ratespiel.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head>
<body>
  <div class="bg-grid" aria-hidden="true"></div>
  <div class="bg-glow" aria-hidden="true"></div>
  <div class="app lexpage">
{body}
    <footer class="app-footer">
      <a href="../">Zur App</a>
      <a href="../impressum.html">Impressum</a>
      <a href="../datenschutz.html">Datenschutz</a>
    </footer>
  </div>
</body>
</html>
'''


CTA = '''    <div class="panel lexpage-cta">
      <h2>🎯 Jetzt ausprobieren — kostenlos und ohne Risiko</h2>
      <div class="lexpage-cta-links">
        <a class="broker-cta-btn" href="../#challenge">🗓️ Tages-Challenge</a>
        <a class="broker-cta-btn" href="../#lernen">📚 Quiz</a>
        <a class="broker-cta-btn" href="../#lernpfad">🧭 Lernpfad</a>
        <a class="broker-cta-btn" href="../#sparplan">🌱 Sparplan-Rechner</a>
      </div>
    </div>
'''


def entry_page(entry, prev_entry, next_entry, known_ids):
    body_html = body_for_page(entry['body'], known_ids)
    text = plain_text(entry['body'])
    title_plain = plain_text(entry['title'])
    canonical = f"{SITE}lexikon/{entry['id']}.html"
    json_ld = {
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        'name': title_plain,
        'description': text,
        'url': canonical,
        'inDefinedTermSet': {'@type': 'DefinedTermSet', 'name': 'Börsen-Lexikon', 'url': f'{SITE}lexikon/'},
    }
    extra_head = '<script type="application/ld+json">' + json.dumps(json_ld, ensure_ascii=False) + '</script>\n'
    pager = '    <nav class="lexpage-pager">\n'
    pager += f'      <a href="{prev_entry["id"]}.html">← {prev_entry["title"]}</a>\n' if prev_entry else '      <span></span>\n'
    pager += f'      <a href="{next_entry["id"]}.html">{next_entry["title"]} →</a>\n' if next_entry else '      <span></span>\n'
    pager += '    </nav>\n'
    body = f'''    <nav class="lexpage-crumbs"><a href="../">📈 Börsen-Ratespiel</a> › <a href="./">Lexikon</a></nav>
    <article class="panel lexpage-entry">
      <h1 class="lexpage-title">{entry['title']}</h1>
      <p>{body_html}</p>
      <p class="panel-note">Vereinfachte Erklärung zum Lernen — keine Anlage- oder Steuerberatung.</p>
    </article>
{CTA}{pager}'''
    return page_shell(f'{title_plain} einfach erklärt | Börsen-Lexikon', short_description(text), canonical, body, extra_head)


def index_page(entries):
    items = '\n'.join(
        f'        <li><a href="{e["id"]}.html"><strong>{e["title"]}</strong><span>{html.escape(short_description(plain_text(e["body"])))}</span></a></li>'
        for e in entries
    )
    body = f'''    <nav class="lexpage-crumbs"><a href="../">📈 Börsen-Ratespiel</a> › Lexikon</nav>
    <div class="panel">
      <h1 class="lexpage-title">📖 Börsen-Lexikon</h1>
      <p class="lexpage-intro">{len(entries)} Begriffe rund um Aktien, ETFs und Wirtschaft — kurz und verständlich erklärt.</p>
      <ul class="lexpage-index">
{items}
      </ul>
    </div>
{CTA}'''
    return page_shell('Börsen-Lexikon: Begriffe einfach erklärt | Börsen-Ratespiel',
                      f'{len(entries)} Börsenbegriffe von Aktie bis Zinseszins einfach erklärt — mit Quiz, Tages-Challenge und Sparplan-Rechner zum Ausprobieren.',
                      f'{SITE}lexikon/', body)


def sitemap(entries):
    urls = [(SITE + path, prio) for path, prio in STATIC_PAGES]
    urls += [(f"{SITE}lexikon/{e['id']}.html", '0.6') for e in entries]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, prio in urls:
        lines += ['  <url>', f'    <loc>{loc}</loc>', f'    <priority>{prio}</priority>', '  </url>']
    lines.append('</urlset>')
    return '\n'.join(lines) + '\n'


def main():
    entries = parse_entries((ROOT / 'index.html').read_text(encoding='utf-8'))
    ids = {e['id'] for e in entries}
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.glob('*.html'):
        old.unlink()
    for i, entry in enumerate(entries):
        prev_entry = entries[i - 1] if i > 0 else None
        next_entry = entries[i + 1] if i + 1 < len(entries) else None
        (OUT_DIR / f"{entry['id']}.html").write_text(entry_page(entry, prev_entry, next_entry, ids), encoding='utf-8')
    (OUT_DIR / 'index.html').write_text(index_page(entries), encoding='utf-8')
    (ROOT / 'sitemap.xml').write_text(sitemap(entries), encoding='utf-8')
    print(f'{len(entries)} Lexikon-Seiten + Übersicht geschrieben, sitemap.xml aktualisiert.')


if __name__ == '__main__':
    main()
