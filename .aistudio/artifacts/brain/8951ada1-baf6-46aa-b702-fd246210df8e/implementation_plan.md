# Audio Posicional 3D HRTF, Ecos de Voz y Esfuerzo Físico en PAC-MAN UMBRAL

Esta actualización profundiza la inmersión sensorial de **PAC-MAN UMBRAL** mediante tres sistemas integrados: **Audio Posicional 3D HRTF con oclusión tras muros y escucha agudizada al esconderse** para pasos y jadeos de los fantasmas, **Ecos de Voz y Susurros Sintéticos Procedurales** espacializados por formantes que pronuncian sílabas distorsionadas y pistas crípticas, y **Esfuerzo Físico de Pac-Man** con desenfoque radial en el shader, visión de túnel intensa, amortiguación del entorno sonoro y resonancia interna de latidos y respiración fatigada dentro de la mandíbula cuando se agota el aliento.

## User Review & Critical Decisions

> [!IMPORTANT]
> Se han incorporado las tres decisiones confirmadas para garantizar que la acústica espacial y el agotamiento físico aporten información táctica real y tensión orgánica sin saturar la interfaz.

- **Decisión Confirmada 1 (Susurros y Ecos de Voz de los Fantasmas)**: Susurros sintéticos 100 % procedurales sin texto en pantalla. Los fantasmas emiten secuencias de sílabas articuladas mediante bancos de formantes vocales y fricativas de ruido filtrado a través de sus nodos espaciales 3D, variando su timbre según la personalidad de cada entidad (*Acechador*, *Emboscadora*, *Resonador*, *Estático*) y su estado (patrulla, búsqueda cercana o inspección de escondites).
- **Decisión Confirmada 2 (Audio Posicional 3D de Pasos y Jadeos)**: Espacialización binaural **HRTF** con filtro de **oclusión acústica dinámica tras muros** (cálculo de línea de visión entre cada fantasma y el jugador) y **escucha agudizada al esconderse**, permitiendo localizar con precisión la dirección, distancia y movimiento de los fantasmas desde el interior de armarios, conductos o bajo mesas.
- **Decisión Confirmada 3 (Respiración y Agotamiento Físico de Pac-Man)**: Al agotarse la resistencia (`exhausted`) o llevar el esfuerzo al límite, la vista sufre **desenfoque radial progresivo (`uBlur`)** y **visión de túnel (`uVignette` + estrechamiento de campo)** en el post-procesado WebGL, mientras un filtro paso bajo amortigua los sonidos externos para que dominen el latido ensordecedor y la respiración húmeda resonando dentro de la cavidad mandibular.

---

## 1. Overview & Core Concept

- **Qué Hace**:
  1. **Audio Posicional 3D HRTF de Fantasmas con Oclusión y Escucha en Escondites**:
     - Cada fantasma cuenta con una cadena espacial dedicada (`Filtro de Oclusión Biquad Low-Pass -> PannerNode HRTF -> Bus SFX + Envío de Reverberación`).
     - Sus pasos arrastrados, jadeos húmedos y gruñidos se aceleran y cambian de timbre según su velocidad real, modo (`scatter`, `chase`, `frightened`) y distancia.
     - Si hay muros entre el fantasma y Pac-Man (`occluded`), el filtro paso bajo atenúa los agudos (`~650 Hz`) y refuerza la reverberación de pasillo lejano; cuando el fantasma dobla la esquina con línea de visión directa, el sonido se abre de golpe (`~14000 Hz`).
     - Cuando el jugador está escondido (`hidden`), sus sentidos se agudizan: el alcance auditivo aumenta de `16 u` a `22 u` y la curva de atenuación permite distinguir claramente por qué lado del escondite se acerca o se aleja el fantasma.
  2. **Ecos de Voz y Susurros Sintéticos Procedurales 3D**:
     - Síntesis articulatoria por sílabas mediante transiciones de formantes (`F1, F2, F3`), consonantes plosivas/fricativas (`s`, `sh`, `k`, `t`) y modulación en anillo/vibrato espectral, sin mostrar subtítulos en pantalla.
     - Los fantasmas murmuran patrones fonéticos distorsionados (*"pa-k-man"*, *"te-ve-o"*, *"a-qui"*, *"no-res-pi-res"*, *"tras-de-ti"*, *"sa-le"*) desde su posición 3D real en el laberinto, especialmente al buscar al jugador tras perderlo de vista o al rondar cerca de su escondite.
  3. **Respiración Mandibular, Desenfoque Radial y Visión de Túnel por Esfuerzo**:
     - Nuevo uniforme `uBlur` en el shader de post-procesado que aplica desenfoque radial de múltiples muestras desde el centro de la mirada hacia la periferia cuando el aliento cae al mínimo o Pac-Man queda agotado (`exhausted`).
     - Amortiguación dinámica del mundo exterior (`sfx` y `amb` filtrados en frecuencias altas durante el agotamiento) combinada con respiración fatigada con resonancia de cavidad bucal/mandibular y latidos intracraneales graves.
- **Valor Principal**: Convierte el oído en una herramienta de supervivencia de alta precisión —especialmente al ocultarse sin línea de visión— y hace que agotar el aliento tenga un peso físico y sensorial inmediato.

---

## 2. User Experience & Visual Design

- **Flujos de Experiencia Sensorial**:
  1. **Escucha Táctica en Pasillos y Escondites**:
     - Al escuchar pasos apagados y graves a la izquierda, el jugador sabe que un fantasma camina por el pasillo paralelo detrás de un muro. Cuando el sonido gana brillo metálico y respiración húmeda, el fantasma acaba de asomarse al mismo corredor.
     - Dentro de un armario, conducto o bajo una mesa, el jugador cierra el ruido propio al mantener el pulso y percibe con nitidez binaural HRTF los pasos, jadeos y susurros articulados del fantasma cruzando de izquierda a derecha frente al escondite.
  2. **Ecos de Voz en la Oscuridad**:
     - Cuando un fantasma pierde de vista al jugador o inspecciona un sector cercano, emite un susurro espectral articulado por formantes que rebota en la reverberación del nivel, delatando su dirección en 3D.
  3. **Colapso por Agotamiento Físico (`Sin Aliento`)**:
     - A medida que la barra de aliento baja del 25 % y especialmente al agotarse por completo (`exhausted`), los bordes de la pantalla se cierran en una visión de túnel oscura y pulsante, la periferia se desenfoca radialmente (`uBlur`), el sonido del laberinto se vuelve sordo como bajo el agua y el jugador escucha su propio jadeo resonando dentro de las fauces de Pac-Man junto con un latido grave ensordecedor hasta recuperar el aliento.
- **Identidad Visual y Estética**:
  - Se preserva intacta la estética de horror analógico de *UMBRAL* (`#050203`, hueso `#ecdfc6`, sangre `#c4271b`), sin añadir textos flotantes ni indicadores artificiales para los susurros. Todo el impacto visual del agotamiento ocurre orgánicamente en el shader de cámara y el balanceo mandibular.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Espacialización HRTF con Filtro de Oclusión por Fantasma**
  - *Enfoque Elegido*: Usar `panningModel = "HRTF"` en las voces posicionales de los fantasmas activas (las 3 más cercanas al jugador) precedido por un `BiquadFilterNode` paso bajo controlado por la línea de visión real en la rejilla (`occluded`).
  - *Por Qué*: A diferencia de `equalpower` (que solo reparte volumen izquierda/derecha), `HRTF` aplica filtrado interaural de fase y frecuencia que permite distinguir delante/detrás y cambios sutiles de ángulo cuando el jugador está inmóvil dentro de un escondite. Limitar los nodos activos a los fantasmas cercanos mantiene el presupuesto de CPU de audio ligero y estable.
- **Decisión 2: Síntesis Vocal Articulatoria por Formantes (100 % Procedural)**
  - *Enfoque Elegido*: Construir un generador de sílabas espectrales que encadena vocales por formantes (`F1/F2/F3`), ataques consonánticos fricativos y susurro aspirado (`noiseMix` alto + modulación de tono), reproduciéndolo a través del `PannerNode` 3D del fantasma.
  - *Por Qué*: Evita depender de voces TTS robóticas del sistema operativo, funciona de forma idéntica en cualquier navegador y permite fundir la voz con el gruñido y el jadeo orgánico de cada fantasma.
- **Decisión 3: Desenfoque Radial en Shader + Amortiguación Auditiva Interna**
  - *Enfoque Elegido*: Añadir muestreo radial ponderado (`uBlur`) en el pase final de post-procesado junto con una caída suave del filtro maestro (`muffle` / atenuación de agudos externos) mientras `exhausted` está activo, realzando los formantes de cavidad mandibular en `BreathEngine`.
  - *Por Qué*: Transmite la sensación física de asfixia y visión borrosa sin impedir por completo que el jugador vea el pasillo central hacia donde intenta huir.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Diagrama de Arquitectura Acústica y Sensorial

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        NÚCLEO DE SIMULACIÓN & MOTOR                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Datos Espaciales por Frame (AudioFrame)                              │  │
│  │ • Posición/orientación del oyente (cámara Pac-Man)                   │  │
│  │ • Fantasmas: { x, y, z, dist, speed, occluded, searching, nearHide } │  │
│  │ • Estado físico: { exertion, exhausted, stamina, hidden, holding }   │  │
│  └──────────────────┬───────────────────────────────────┬───────────────┘  │
└─────────────────────┼───────────────────────────────────┼──────────────────┘
                      │                                   │
                      ▼                                   ▼
┌─────────────────────────────────────────┐ ┌────────────────────────────────┐
│       MOTOR DE AUDIO 3D (Web Audio)     │ │   POST-PROCESADO VISUAL (GLSL) │
│                                         │ │                                │
│  ┌───────────────────────────────────┐  │ │  ┌──────────────────────────┐  │
│  │ GhostVoice (por fantasma cercano) │  │ │  │ FinalShader (postfx.ts)  │  │
│  │  ├─ Pasos 3D (ritmo = velocidad)  │  │ │  │  ├─ Desenfoque Radial    │  │
│  │  ├─ Jadeo estéreo / estertor      │  │ │  │  │  (uBlur 5-tap radial) │  │
│  │  └─ Susurros fonéticos formantes  │  │ │  │  ├─ Visión de Túnel      │  │
│  │         │                         │  │ │  │  │  (uVignette + uPulse) │  │
│  │         ▼                         │  │ │  │  └─ Desaturación de      │  │
│  │  [Biquad LowPass: Oclusión Muros] │  │ │  │     fatiga y aberración  │  │
│  │   • Vista limpia: 14 kHz          │  │ │  └──────────────────────────┘  │
│  │   • Tras muro:    650 Hz + Reverb │  │ └────────────────────────────────┘
│  │         │                         │  │
│  │         ▼                         │  │
│  │  [PannerNode HRTF 3D]             │  │
│  │   • Alcance normal: 16 u          │  │
│  │   • Alcance escondido: 22 u       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ BreathEngine & Fatiga Interna     │  │
│  │  ├─ Resonancia mandibular hueca   │  │
│  │  ├─ Latido intracraneal grave     │  │
│  │  └─ Atenuación de sonido externo  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Modelo de Datos y Mapeo de Estado

1. **Datos Espaciales de Fantasmas (`AudioGhost` y `AudioFrame`)**:
   - Se amplía `AudioGhost` con:
     - `occluded?: boolean`: `true` cuando `maze.rayClear(player.x, player.z, ghost.x, ghost.z)` es falso (hay al menos un muro entre el fantasma y Pac-Man).
     - `speed?: number`: velocidad actual del fantasma para sincronizar la cadencia de sus pasos y su jadeo con su movimiento real (`0` si está detenido inspeccionando un escondite, más rápido en `chase` o `elroy`).
     - `searching?: boolean`: `true` cuando el fantasma busca un rastro reciente (`lastSeen !== null && !sawPlayer`) o revisa un escondite cercano (`checkSpot >= 0`), disparando con mayor probabilidad susurros articulados.
2. **Cadena Posicional 3D y Susurros (`GhostVoice` y `Synth`)**:
   - Cada `GhostVoice` emplea un `PannerNode` en modo `HRTF` precedido por un filtro `BiquadFilterNode` (`type = "lowpass"`).
   - **Oclusión**: la frecuencia de corte se interpola suavemente (`S.ramp`) entre `14000 Hz` (línea de visión directa) y `620 Hz` (detrás de un muro), aumentando el envío a reverberación cuando está ocluido.
   - **Escucha en escondite**: cuando `hidden === true`, el radio de escucha sube a `22 u`, el volumen relativo de pasos y jadeos de los fantasmas se realza (`×1.35`) y cuando un fantasma se detiene frente al escondite (`speed === 0` a `< 2.8 u`), deja de dar pasos y emite respiración pesada + susurros pegados a la puerta.
   - **Síntesis de Susurros Articulatorios (`ghostWhisperPhrase`)**: secuencia de 3 a 5 sílabas sintetizadas combinando consonantes fricativas (`noise` en bandas de `2.2–5.5 kHz`) y núcleos vocálicos susurrados (`formantVoice` con `noiseMix: 0.65`, formantes de vocales españolas `/a/`, `/e/`, `/i/`, `/o/`, `/u/` y timbre personalizado por `kind`).
3. **Agotamiento Físico, Respiración Mandibular y Visión de Túnel (`FxState`, `FinalShader`, `BreathEngine`)**:
   - `FxState` incorpora `blur: number` (`0..1`), conectado al uniforme `uBlur` en `FinalShader`.
   - En el fragment shader, cuando `uBlur > 0.001`, se realiza un muestreo radial de 5 puntos a lo largo del vector desde el centro (`cc = vUv - 0.5`), manteniendo el centro nítido y desenfocando progresivamente hacia los bordes junto con un refuerzo de `uVignette` (visión de túnel).
   - En `BreathEngine` y `HorrorAudio`, cuando `exhausted` es `true` (o `exertion > 0.82`), se añade una capa de resonancia de cavidad mandibular (filtro paso banda con formantes huecos `380 Hz` y `920 Hz` + sibilancia de fatiga), el latido cardíaco sube a primer plano con sub-grave intracraneal (`46 Hz -> 31 Hz`) y el filtro maestro atenúa temporalmente las frecuencias altas del exterior (`~1100 Hz`) hasta que Pac-Man recupera el aliento.
