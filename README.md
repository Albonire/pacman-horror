# PAC-MAN UMBRAL

Terror en primera persona. Eres Pac-Man, atrapado en un laberinto que no debería existir: devora todos los nodos para abrir la salida, pero los fantasmas ya saben dónde estás.

Todo es procedural: texturas, modelos, música, voces, respiraciones y sustos se generan en el navegador (three.js + Web Audio). No hay ficheros de audio ni de imágenes. La compilación es un único `index.html`.

> Aviso: contiene luces parpadeantes, sonidos fuertes, sustos repentinos y efectos de imagen intensos. Al abrir el juego se ofrece una advertencia y la opción "Sustos reducidos"; en Ajustes se puede elegir entre sustos completos, reducidos o sin pantalla completa.

## Cómo jugar

| Acción | Control |
| --- | --- |
| Moverse (relativo a donde miras) | `W` `A` `S` `D` o flechas |
| Mirar | Ratón (clic para capturarlo) |
| Girar con teclado | `Q` `E` (en modo "solo teclado" también `←` `→`, y `R` `V` para inclinar) |
| Correr | `Shift` (gasta aliento; los fantasmas oyen los pasos rápidos) |
| Ecolocalización (mapa y entidades) | `Espacio` o clic derecho, mantener; frena el paso |
| Linterna "Resplandor" | `F` (gasta batería; congela al Estático) |
| Cámara 1ª / 3ª persona | `C` |
| Morder (aturde al fantasma de enfrente, gasta aliento) | `X` o clic izquierdo |
| Silenciar | `M` |
| Pausa | `Esc` o `P` |

Si el navegador no concede el control del ratón, el juego cambia solo al modo teclado. Está pensado para ordenador (teclado y ratón); no hay controles táctiles.

El campo de visión de Ajustes es horizontal (por defecto 90 grados).

Si el equipo no sostiene unos 26 fps durante unos segundos de partida, el juego baja un escalón la calidad gráfica y lo avisa en pantalla.

### Reglas

- Devora todos los nodos para abrir la salida y llega a ella.
- Los 6 orbes grandes (pellets) asustan a los fantasmas: huyen, puedes comértelos y el combo suma 200, 400, 800 y 1600.
- La fruta aparece al 33 % y al 66 % de los nodos y restaura aliento y batería.
- Vida extra a los 10 000 puntos base.
- El mordisco (`X`) aturde unos 1,7 s al fantasma que tienes delante (a menos de ~2 u, con línea de visión): no se mueve ni mata. Cuesta aliento y tarda 4,5 s en recargarse. Si el fantasma está asustado, se lo come.
- Los fantasmas cercanos con línea de visión se abalanzan en línea recta: pegarse a una esquina de la celda no sirve de escondite.
- Si te atrapan, reapareces con unos segundos de protección y los fantasmas vuelven a dormir. Los nodos comidos no se reponen.
- Hay un túnel continuo en la fila central que conecta ambos bordes del mapa.

### Los fantasmas

| Fantasma | Comportamiento |
| --- | --- |
| El Acechador | Persigue directamente; se acelera cuando quedan pocos nodos |
| La Emboscada | Apunta unas celdas por delante de ti |
| El Resonador | Flanquea usando la posición del Acechador y oye tus pasos rápidos |
| El Estático | Se congela mientras lo miras con la linterna encendida; al apartar la vista se lanza |

Los fantasmas empiezan dormidos como estatuas. Despiertan por tiempo, por nodos devorados o si te acercas demasiado con línea de visión. Alternan fases de dispersión y persecución.

### Niveles

1. Oficinas amarillas
2. Las piscinas
3. Salón recreativo
4. El subsuelo
5. El sanatorio
6. El hambre (nivel final)

Cada nivel tiene su laberinto generado (semilla fija), su textura, iluminación, decoración, props con colisión y su ritmo de fantasmas.

### Dificultades

| Modo | Vidas | Notas |
| --- | --- | --- |
| Aprendiz | 6 | 6 | 5 | 4 | 5 | 5 |
| Normal | 6 | 4 | 2 | 0 | 3 | 0 |
| Pesadilla | 3 | 0 | 0 | 0 | 0 | 0 |
| Muerte súbita | 0 | 0 | 0 | 0 | 0 | 0 |

### Arquitectura

```
src/sim      simulación pura y determinista (laberinto, jugador, fantasmas, reglas, bot)
src/engine   motor three.js: juego, vistas de nivel/fantasmas/Pac-Man, sustos, postproceso, entrada
src/gfx      generación procedural de texturas, caras y temas visuales
src/audio    síntesis Web Audio: ambiente, respiración, voces, latido, gritos, mezcla
src/config   constantes, dificultades y campaña
src/ui       pantallas y HUD en React
```

## Límites conocidos de la verificación

- El render se ha comprobado con capturas en Chromium sin GPU (SwiftShader). No se ha medido el rendimiento en una GPU real; la opción "Calidad gráfica" (alta, media, baja) reduce sombras, bloom y resolución.
- El audio se verificó con renderizado offline y análisis espectral (niveles y posición estéreo), no escuchándolo en altavoces.
- La calibración de dificultad usa un bot, no jugadores humanos: los números de la tabla son una referencia relativa, no una promesa de lo que sentirá cada persona.
