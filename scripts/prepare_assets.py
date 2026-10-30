#!/usr/bin/env python3
"""Prepara los recursos de `assets/` para la compilacion de archivo unico.

Entradas (originales, no se tocan):
  assets/audio/scream.mp3          grito de ElevenLabs (10 s, 4,5 s de contenido y cola de silencio)
  assets/audio/menu_ambience.mp3   ambiente del menu de ElevenLabs (61 s)
  assets/screams/{blinky,pinky,inky,clyde}.*   imagenes de los fantasmas (2 a 3 MP)

Salidas (se incrustan con `?inline` de Vite, ver src/assets.d.ts):
  src/assets/scream.mp3            corte del grito sin la cola muda, con fundido final
  src/assets/menu_loop.mp3         bucle de 32 s sin costura (fundido cruzado de 4 s)
  src/assets/screams/{0..3}.jpg    caras 16:9 de 1600x900 (0 Blinky, 1 Pinky, 2 Inky, 3 Clyde)

Requisitos: ffmpeg, Pillow y numpy. Uso: python3 scripts/prepare_assets.py
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
OUT = A("src", "assets")
os.makedirs(os.path.join(OUT, "screams"), exist_ok=True)


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw)


# ---------------------------------------------------------------- grito
# El original dura 10 s pero el contenido acaba hacia los 4,5 s; el resto es una cola de -40 a -90 dB.
# No se comprime ni se limita: el limitador del bus maestro del juego se encarga de los picos.
run([
    "ffmpeg", "-y", "-v", "error", "-i", A("assets", "audio", "scream.mp3"),
    "-t", "4.7", "-af", "afade=t=out:st=4.0:d=0.7", "-ac", "2", "-b:a", "128k",
    os.path.join(OUT, "scream.mp3"),
])

# ---------------------------------------------------------------- bucle del menu
menu_src = A("assets", "audio", "menu_ambience.mp3")
if os.path.exists(menu_src):
    SR = 44100
    raw = run(["ffmpeg", "-v", "error", "-i", menu_src, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2)
    start, loop_len, xf = 8 * SR, 32 * SR, 4 * SR
    seg = x[start : start + loop_len + xf].copy()
    # el principio del bucle mezcla la continuacion del final (que se apaga) con el inicio (que entra):
    # al volver a empezar suena exactamente lo que seguia al ultimo muestreo.
    t = np.linspace(0, np.pi / 2, xf)[:, None]
    loop = seg[:loop_len].copy()
    loop[:xf] = seg[:xf] * np.sin(t) + seg[loop_len : loop_len + xf] * np.cos(t)
    peak = float(np.abs(loop).max())
    loop *= min(1.4, 0.7 / max(peak, 1e-6))  # sube hasta unos -3 dB sin pasar de +3 dB de ganancia
    enc = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-b:a", "88k",
         os.path.join(OUT, "menu_loop.mp3")],
        input=loop.astype(np.float32).tobytes(), capture_output=True,
    )
    if enc.returncode:
        sys.exit(enc.stderr.decode())
else:
    print("aviso: falta assets/audio/menu_ambience.mp3, se omite el bucle del menu")

# ---------------------------------------------------------------- caras
FILES = {0: "blinky.jpeg", 1: "pinky.jpeg", 2: "inky.jpeg", 3: "clyde.png"}
for kind, name in FILES.items():
    im = Image.open(A("assets", "screams", name)).convert("RGB")
    w, h = im.size
    if w / h > 16 / 9:
        nw = int(h * 16 / 9)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w * 9 / 16)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize((1600, 900), Image.LANCZOS)
    im.save(os.path.join(OUT, "screams", f"{kind}.jpg"), quality=80, optimize=True, progressive=True)

for root, _, files in os.walk(OUT):
    for f in sorted(files):
        p = os.path.join(root, f)
        print(f"{os.path.relpath(p, ROOT)}: {os.path.getsize(p) // 1024} KB")
