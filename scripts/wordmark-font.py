"""The wordmark's face, cut down to what it draws.

Fraunces is only ever "PaperWing" at weight 600, soft and wonky (styles.css, .wordmark), but the
full variable font is 121 KB. This pins those axes, keeps optical size (it follows the type size),
keeps only the wordmark's letters, and writes src/assets/fraunces-wordmark.woff2 (a few KB).

Run after changing the wordmark or upgrading @fontsource-variable/fraunces:
  pip install fonttools brotli && python3 scripts/wordmark-font.py
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"
OUT = ROOT / "src/assets/fraunces-wordmark.woff2"
WORD = "PaperWing"

font = instantiateVariableFont(TTFont(SOURCE), {"wght": 600, "SOFT": 100, "WONK": 1})
options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["*"]
options.name_IDs = ["*"]
subsetter = subset.Subsetter(options)
subsetter.populate(text=WORD)
subsetter.subset(font)
OUT.parent.mkdir(exist_ok=True)
font.flavor = "woff2"
font.save(OUT)
print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes")
