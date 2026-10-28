import { useEffect, useRef, useState } from "react";
import { Game, GameState, HudRefs } from "./game/Game";

type Screen = "menu" | "playing" | "paused" | "gameover" | "victory";

function Btn({ children, onClick, tone = "amber" }: { children: React.ReactNode; onClick: () => void; tone?: "amber" | "red" | "green" }) {
  const color =
    tone === "red" ? "border-red-400/70 text-red-300 hover:bg-red-400 hover:text-black" :
    tone === "green" ? "border-green-400/70 text-green-300 hover:bg-green-400 hover:text-black" :
    "border-amber-200/60 text-amber-200 hover:bg-amber-200 hover:text-black";
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2 border ${color} tracking-widest text-xs font-crt transition-colors bg-black/40`}
    >
      {children}
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/88 font-crt text-center pointer-events-auto p-6">
      <div className="crt-scanlines absolute inset-0 opacity-30" />
      <div className="relative z-10 flex flex-col items-center gap-5">{children}</div>
    </div>
  );
}

const LEGEND = [
  ["WASD / FLECHAS", "Desplazarse por el laberinto"],
  ["SHIFT", "Correr (gasta estamina; hace ruido)"],
  ["ESPACIO (mantener)", "Radar táctico de mano (ralentiza)"],
  ["E (cerca de disyuntor)", "Sobrecargar — entidades vulnerables 10s"],
  ["F", "Linterna (gasta batería)"],
  ["C", "Cambiar cámara: 1ª persona / isométrica"],
  ["M / ESC", "Silenciar / Pausa"],
];

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);

  const hudRootRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const staminaFillRef = useRef<HTMLDivElement>(null);
  const batteryFillRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const frightRef = useRef<HTMLDivElement>(null);
  const frightFillRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const radarWrapRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");

  useEffect(() => {
    if (!containerRef.current || !radarCanvasRef.current) return;
    const hud: HudRefs = {
      root: hudRootRef.current!,
      dots: dotsRef.current!,
      lives: livesRef.current!,
      level: levelRef.current!,
      staminaFill: staminaFillRef.current!,
      batteryFill: batteryFillRef.current!,
      msg: msgRef.current!,
      fright: frightRef.current!,
      frightFill: frightFillRef.current!,
      crosshair: crosshairRef.current!,
      radarWrap: radarWrapRef.current!,
      flash: flashRef.current!,
      vignette: vignetteRef.current!,
      hint: hintRef.current!,
    };
    const game = new Game(containerRef.current, radarCanvasRef.current, hud, {
      onStateChange: (s: GameState) => setScreen(s.toLowerCase() as Screen),
    });
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const g = gameRef.current;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      {/* Contenedor del canvas 3D */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD (el motor lo actualiza directamente) */}
      <div ref={hudRootRef} className="absolute inset-0 pointer-events-none opacity-0 font-crt z-10">
        {/* barra superior */}
        <div className="absolute top-0 left-0 right-0 flex justify-between p-3 text-xs tracking-widest">
          <div className="space-y-0.5">
            <div ref={dotsRef} className="text-amber-300">NODOS 000 / 000</div>
            <div ref={levelRef} className="text-amber-500/80">NIVEL 1 // 1ª PERSONA</div>
          </div>
          <div ref={livesRef} className="text-red-400 text-right">VIDAS ●●●</div>
        </div>

        {/* barra de sobrecarga (power pellet) */}
        <div ref={frightRef} className="absolute top-3 left-1/2 -translate-x-1/2 w-64 opacity-0">
          <div className="text-[10px] text-blue-300 tracking-widest mb-0.5 text-center">SOBRECARGA — ENTIDADES VULNERABLES</div>
          <div className="h-1.5 bg-blue-900/60 border border-blue-700/50">
            <div ref={frightFillRef} className="h-full hud-fill bg-blue-400" />
          </div>
        </div>

        {/* inferior izquierdo: batería + estamina */}
        <div className="absolute bottom-3 left-3 space-y-1.5 text-[10px] tracking-widest">
          <div className="text-amber-500/80">BATERÍA LINTERNA [F]</div>
          <div className="h-1.5 w-44 bg-neutral-800 border border-neutral-700">
            <div ref={batteryFillRef} className="h-full hud-fill bg-green-400" />
          </div>
          <div className="text-amber-500/80">ESTAMINA [SHIFT]</div>
          <div className="h-1.5 w-44 bg-neutral-800 border border-neutral-700">
            <div ref={staminaFillRef} className="h-full hud-fill bg-amber-300" />
          </div>
        </div>

        {/* mensaje central */}
        <div
          ref={msgRef}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 text-center text-xs tracking-widest text-amber-200 opacity-0 whitespace-nowrap"
        />

        {/* punto de mira */}
        <div ref={crosshairRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0">
          <div className="relative w-6 h-6">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-amber-200/80 -translate-y-1/2" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-200/80 -translate-x-1/2" />
          </div>
        </div>

        {/* radar táctico */}
        <div
          ref={radarWrapRef}
          className="absolute bottom-3 right-3 w-52 h-52 opacity-0 bg-black border border-green-700/70 shadow-[0_0_24px_rgba(40,255,140,0.18)]"
        >
          <canvas ref={radarCanvasRef} className="w-full h-full block" style={{ imageRendering: "pixelated" }} />
        </div>

        {/* viñeta de daño / batería */}
        <div ref={vignetteRef} className="vignette-red absolute inset-0 opacity-0 pointer-events-none" />
        {/* flash (túnel / daño) */}
        <div ref={flashRef} className="absolute inset-0 opacity-0 pointer-events-none bg-white" />
        {/* pista */}
        <div
          ref={hintRef}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] tracking-widest text-amber-200/70 opacity-0 whitespace-nowrap"
        >
          CLICK PARA MIRAR · C: CÁMARA · F: LINTERNA · M: MUDO · ESC: PAUSA
        </div>
      </div>

      {/* líneas de barrido CRT globales */}
      <div className="crt-scanlines absolute inset-0 pointer-events-none opacity-35 z-10" />

      {/* MENÚ PRINCIPAL */}
      {screen === "menu" && (
        <Overlay>
          <div className="text-amber-200/60 text-[10px] tracking-[0.4em]">NIVEL 0 // BACKROOMS</div>
          <h1 className="text-4xl md:text-5xl font-bold text-amber-200 tracking-widest">PROTOCOLO UMBRAL</h1>
          <p className="max-w-md text-amber-200/70 text-xs leading-relaxed tracking-wide">
            Has despertado en un laberinto de oficinas amarillas que no deberían existir.
            Recoge todas las <span className="text-amber-300">señales</span> para abrir la brecha de salida,
            pero cuatro entidades calculan tu ruta. La música se desafina cuando se acercan.
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-left text-[11px] tracking-wider text-amber-200/80 max-w-lg">
            {LEGEND.map(([k, v]) => (
              <div key={k} className="flex gap-2"><span className="text-amber-400 shrink-0">{k}</span><span className="text-amber-200/55">— {v}</span></div>
            ))}
          </div>
          <Btn onClick={() => gameRef.current?.start()}>INICIAR PROTOCOLO</Btn>
        </Overlay>
      )}

      {/* PAUSA */}
      {screen === "paused" && (
        <Overlay>
          <h2 className="text-2xl font-bold text-amber-200 tracking-widest">PAUSA</h2>
          <p className="text-amber-200/60 text-xs tracking-wider">El laberinto sigue respirando a tu alrededor.</p>
          <div className="flex gap-3">
            <Btn onClick={() => gameRef.current?.resume()}>REANUDAR</Btn>
            <Btn onClick={() => gameRef.current?.restart()}>REINICIAR</Btn>
            <Btn tone="red" onClick={() => gameRef.current?.quit()}>MENÚ</Btn>
          </div>
        </Overlay>
      )}

      {/* GAME OVER */}
      {screen === "gameover" && (
        <Overlay>
          <div className="text-red-500/70 text-[10px] tracking-[0.4em]">SEÑAL PERDIDA</div>
          <h2 className="text-3xl font-bold text-red-400 tracking-widest">PROTOCOLO FALLIDO</h2>
          <p className="text-amber-200/60 text-xs tracking-wider max-w-sm">
            Las entidades te han reclamado. El Nivel 0 no tiene memoria de los que se quedan.
          </p>
          <div className="flex gap-3">
            <Btn onClick={() => gameRef.current?.restart()}>REINICIAR</Btn>
            <Btn tone="red" onClick={() => gameRef.current?.quit()}>MENÚ</Btn>
          </div>
        </Overlay>
      )}

      {/* VICTORIA */}
      {screen === "victory" && (
        <Overlay>
          <div className="text-green-400/70 text-[10px] tracking-[0.4em]">BRECHA CRUZADA</div>
          <h2 className="text-3xl font-bold text-green-400 tracking-widest">
            {g?.isFinalLevel() ? "HAS ESCAPADO" : "NIVEL SUPERADO"}
          </h2>
          <p className="text-amber-200/60 text-xs tracking-wider max-w-sm">
            {g?.isFinalLevel()
              ? "Cruza la última puerta. Fuera, el zumbido de 60 Hz finalmente cesa."
              : "Otra ala del laberinto te espera. Las luces parpadean más rápido."}
          </p>
          <div className="flex gap-3">
            {!g?.isFinalLevel() && <Btn tone="green" onClick={() => gameRef.current?.nextLevel()}>SIGUIENTE NIVEL</Btn>}
            <Btn onClick={() => gameRef.current?.restart()}>REINICIAR</Btn>
            <Btn tone="red" onClick={() => gameRef.current?.quit()}>MENÚ</Btn>
          </div>
        </Overlay>
      )}
    </div>
  );
}
