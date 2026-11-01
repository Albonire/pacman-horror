# Plan de Implementación: Audio Continuo en Móvil, Sonar Completo de 4 Esquinas, Háptica Híbrida y Controles Táctiles (~10% Más Grandes)

## 1. Diagnóstico y Solución Definitiva al Corte de Audio en Brave / Chromium Móvil
El corte total de sonido después de unos minutos en Brave (Chromium móvil) se debe a tres factores combinados que corregiremos de raíz:

1. **Fuga de nodos en `Synth.formantVoice` (`src/audio/synth.ts`)**:
   - Actualmente, `this.dist` es un único `WaveShaperNode` compartido en `Synth`. Cada vez que un fantasma gruñe o susurra con `dist: true` (cada pocos segundos), `formantVoice` conecta `this.dist` a 3 nuevos filtros `BiquadFilterNode` (`pre.connect(bp)`) y **nunca los desconecta al terminar**. Tras unos minutos se acumulan cientos de ramas muertas conectadas a `this.dist`, ahogando el hilo de Web Audio en el celular hasta generar `NaN` o bloquear el renderizador de audio.
   - **Solución**: Reutilizar únicamente la curva precalculada (`this.distCurve`) creando un `WaveShaperNode` efímero por voz y desconectando explícitamente toda la cadena (`osc`, `noise`, `filters`, `env`, `send`) dentro de `src.onended` tanto en `tone()`, `noise()` como en `formantVoice()`.
2. **Destrucción del `AudioContext` desde `setInterval` (`src/audio/engine.ts`)**:
   - Cuando el jugador camina en silencio o está en zonas oscuras, `meter()` detectaba `quietFor > 6` desde un `setInterval` y llamaba a `rebuild("silencio sostenido")`, cerrando el `AudioContext` ya desbloqueado por el usuario y creando un `new AudioContext()` fuera de un gesto táctil. En Brave/Chromium móvil, un `AudioContext` creado desde un `setInterval` nace bloqueado en `suspended` y el navegador rechaza `resume()`, dejando el juego mudo para siempre.
   - **Solución**: Eliminar el cierre/recreación del `AudioContext` por silencio en `meter()` (usar únicamente `heal(S)` para restaurar ganancias si alguna cayó) y mantener los escuchadores en fase de captura (`capture: true`) para `touchstart`, `touchend`, `pointerdown` y `keydown` durante toda la partida, de modo que cada toque en pantalla garantice `ctx.state === "running"`.
3. **Desconexión de Panners Efímeros (`src/audio/sfx.ts` y `src/audio/dread.ts`)**:
   - Desconectar automáticamente los nodos `PannerNode` y envíos de reverberación temporales tras finalizar cada efecto posicional (`bang`, `whisper`, `footsteps`, `steamBurst`, `breakerTrip`, `mazeShift`, `dread`).

---

## 2. Sonar Móvil Cuadrado con Bordes Difuminados (4 Esquinas 100% Visibles)
- **Contenedor `.hud-radar` (`src/index.css`)**:
  - Cambiar de círculo (`border-radius: 50%` y máscara radial estrecha que recortaba un ~30% diagonal en las esquinas) a un **formato cuadrado táctico con bordes suaves difuminados** mediante máscara bidimensional (`mask-image: linear-gradient(90deg, ...) , linear-gradient(180deg, ...)` con composición `intersect`) y halo sombreado sin bordes duros.
- **Renderizado `Radar.draw` (`src/engine/radar.ts`)**:
  - Añadir un margen interno limpio (`PAD = 18px`) alrededor del laberinto dentro del lienzo `340×340` y colocar las etiquetas `ECOLOCALIZACIÓN` y `NODOS` en la franja superior sin pisar las celdas de las esquinas, garantizando que las **4 esquinas del laberinto** y sus orbes de poder se vean completos en cualquier móvil.

---

## 3. Vibración Háptica Nativa + Refuerzo Físico Sub-Grave y Sacudida Visual
- **Desbloqueo en Gesto Directo (`src/engine/haptics.ts` y `src/App.tsx`)**:
  - En Chromium/Android, `navigator.vibrate` requiere activación directa en un evento de usuario y que ningún `stopPropagation()` interrumpa la activación. Añadiremos `unlockHaptics()` en el primer toque (`touchstart` / `pointerdown`) y pulsos hápticos sutiles (`12ms`) al tocar los botones de acción para confirmar respuesta táctil inmediata.
- **Refuerzo Físico para Navegadores que Bloquean `navigator.vibrate` (como Brave)**:
  - **Pulso Sub-Grave Táctil (38–58 Hz)**: En cada screamer, mordisco o captura, generaremos un pulso sub-grave de fase coherente que hace vibrar físicamente el altavoz/chasis del teléfono en las manos del jugador.
  - **Sacudida Física de Pantalla (`triggerScreenShake`)**: Al dispararse un screamer o captura, aplicaremos una sacudida de alta frecuencia amortiguada sobre el contenedor visual (`.app-root` / lienzo) sincronizada al milisegundo con el grito y el patrón háptico.

---

## 4. Reescritura de la Interfaz Táctil: Joystick ~10% Más Grande y Grilla 2×2 sin Conflictos
- **Eliminación de Conflictos de Eventos (`src/ui/Hud.tsx` y `src/engine/input.ts`)**:
  - Unificar el manejo táctil usando eventos `TouchEvent` puros con seguimiento por `Touch.identifier` a nivel del contenedor `.hud-touch` (y respaldo limpio de ratón sólo cuando `e.pointerType === "mouse"`), eliminando la duplicación `onTouchStart` + `onPointerDown` en cada botón y eliminando `e.stopPropagation()` para no bloquear los escuchadores globales de audio, pantalla completa y vibración.
  - Marcar los controles táctiles con `data-touch-ui="1"` para que `Input` ignore cualquier evento de ratón sintetizado tras un toque.
- **Joystick ~10% Más Grande y Base Circular Semitransparente (`src/index.css`)**:
  - Aumentar el tamaño del aro base circular en ~10% (`clamp(116px, 30vw, 138px)` y zona táctil `clamp(142px, 37vw, 172px)`) con pomo circular claro (`clamp(46px, 12vw, 55px)`), base circular semitransparente limpia y respuesta inmediata al arrastrar el pulgar incluso si sale fuera del aro.
- **Botones Circulares Claros en Grilla 2×2**:
  - Mantener la grilla `2×2` alineada a la derecha (`LUZ`, `MORDER`, `CORRER`, `SONAR/LATIDO`) junto al botón contextual `USAR` y los botones superiores (`PAUSA`, `CÁMARA`, `ATRÁS`), con bases circulares semitransparentes limpias, estado activo iluminado (`data-pressed="1"`) y cero solapamientos en vertical y horizontal.

---

## 5. Verificación y Pruebas
- Ejecutar pruebas unitarias con Vitest (`npx vitest run`) incluyendo pruebas para la desconexión de nodos en `Synth`, la estabilidad de `HorrorAudio` ante silencios prolongados, `haptics.test.ts` y `input.test.ts`.
- Verificar compilación (`compile_applet`) e inspeccionar visual y funcionalmente con Playwright en resoluciones móviles (`390×844` vertical y `844×390` horizontal) comprobando que las 4 esquinas del sonar son visibles, el joystick ~10% más grande mueve a Pac-Man con fluidez y no existen fugas de nodos de audio.
