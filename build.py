# -*- coding: utf-8 -*-
"""Inline data.json + app.js into template.html -> a single self-contained dashboard."""
import io, os
BASE=os.path.dirname(os.path.abspath(__file__))
tpl=open(os.path.join(BASE,'template.html'),encoding='utf-8').read()
data=open(os.path.join(BASE,'data.json'),encoding='utf-8').read()
app=open(os.path.join(BASE,'app.js'),encoding='utf-8').read()
fonts=open(os.path.join(BASE,'fonts','fonts.css'),encoding='utf-8').read()
tpl=tpl.replace('/*__WC_FONTS__*/', fonts)

# guard against premature </script> termination inside the JSON island
data_safe=data.replace('</','<\\/')

out=tpl.replace('/*__WC_DATA__*/', data_safe).replace('/*__WC_APP__*/', app)
dest=os.path.join(BASE,'world-cup-2026-dashboard.html')
open(dest,'w',encoding='utf-8').write(out)
print('built', dest, '{:,} bytes'.format(os.path.getsize(dest)))
