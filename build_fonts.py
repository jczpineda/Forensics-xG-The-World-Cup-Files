# -*- coding: utf-8 -*-
"""Build a self-contained @font-face block.

Downloads the Google Fonts woff2 files, subsets each one to just the glyphs the
dashboard actually renders (player/team names + UI copy + digits/punctuation),
then inlines them as base64 data URIs so the single HTML file still works with
no network at all.
"""
import re, os, io, json, base64, subprocess
from fontTools import subset
from fontTools.ttLib import TTFont

BASE = os.path.dirname(os.path.abspath(__file__))
FDIR = os.path.join(BASE, 'fonts')
CSS  = open(os.path.join(FDIR, 'gf.css'), encoding='utf-8').read()
KEEP = {'latin', 'latin-ext'}
UA   = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# ---- the character set we actually need -----------------------------------
chars = set()
def walk(o):
    if isinstance(o, str): chars.update(o)
    elif isinstance(o, dict):
        for k, v in o.items(): walk(k); walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(json.load(open(os.path.join(BASE, 'data.json'), encoding='utf-8')))
# everything the UI itself can print, plus typographic furniture
chars.update(''.join(chr(c) for c in range(0x20, 0x7F)))
chars.update('°·—–…“”‘’→←↑↓▲▼●○■□✕✓±%′″×⁄')
chars.update('ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ')
TEXT = ''.join(sorted(chars))
print('glyph set: %d characters' % len(chars))

# ---- download + subset each latin / latin-ext face -------------------------
chunks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{.*?\})", CSS, re.S)
seen, out, raw_total, sub_total = set(), [], 0, 0
for sub_name, block in chunks:
    if sub_name not in KEEP:
        continue
    m = re.search(r"src:\s*url\((https://[^)]+\.woff2)\)", block)
    if not m:
        continue
    url = m.group(1)
    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    wgt = re.search(r"font-weight:\s*(\d+)", block).group(1)
    sty = re.search(r"font-style:\s*(\w+)", block).group(1)
    key = (fam, wgt, sty)
    if key in seen:                      # latin-ext duplicates the same face
        continue                         # -> one subset covers both ranges
    seen.add(key)

    cache = os.path.join(FDIR, url.rsplit('/', 1)[-1])
    if not os.path.exists(cache):
        subprocess.run(['curl', '-s', '--ssl-no-revoke', '--max-time', '60',
                        '-H', 'User-Agent: ' + UA, url, '-o', cache], check=True)
    raw_total += os.path.getsize(cache)

    font = TTFont(cache)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.desubroutinize = True
    opts.layout_features = ['kern', 'liga', 'calt', 'tnum', 'onum']
    opts.notdef_outline = True
    s = subset.Subsetter(options=opts)
    s.populate(text=TEXT)
    s.subset(font)
    buf = io.BytesIO()
    font.flavor = 'woff2'
    font.save(buf)
    data = buf.getvalue()
    sub_total += len(data)

    b64 = base64.b64encode(data).decode('ascii')
    out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:block;"
               "src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, sty, wgt, b64))

dest = os.path.join(FDIR, 'fonts.css')
open(dest, 'w', encoding='utf-8').write('\n'.join(out))
print('faces: %d   original woff2: %.0f KB -> subset: %.0f KB   inlined css: %.0f KB'
      % (len(out), raw_total/1024, sub_total/1024, os.path.getsize(dest)/1024))
