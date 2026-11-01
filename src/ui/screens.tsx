import type { ReactNode } from "react";
import { CAMPAIGN, type LevelDef } from "../config/campaign";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../config/difficulty";
import { GHOST_NAMES } from "../sim/ghost";
import { FACE_COLORS } from "../gfx/faces";
import type { RunSummary } from "../engine/types";
import type { Progress, Settings } from "../engine/settings";
import { Btn, PacIcon, Seg, Slider, Stat, Toggle, fmtTime, pad } from "./primitives";

// ------------------------------------------------------------------ utilidades

function Screen({ children, variant = "dim" }: { children: ReactNode; variant?: "dim" | "solid" | "clear" }) {
  const cls = variant === "solid" ? "screen-solid" : variant === "clear" ? "screen-clear" : "";
  return <div className={`screen screen-scan ${cls}`}>{children}</div>;
}

export function LoadingScreen({ label = "GENERANDO EL LABERINTO" }: { label?: string }) {
  return (
    <Screen variant="solid">
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><PacIcon size={54} /></div>
        <div className="kicker loading-dots">{label}</div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ advertencia

export function WarningScreen({ onContinue, onReduced }: { onContinue: () => void; onReduced: () => void }) {
  return (
    <Screen variant="solid">
      <div className="panel fade-in" style={{ maxWidth: 640, textAlign: "center" }}>
        <div className="kicker red">ADVERTENCIA</div>
        <h2 className="h2" style={{ margin: "12px 0 16px", color: "#ff9684" }}>CONTENIDO DE TERROR</h2>
        <p className="p">
          Este juego contiene luces parpadeantes, sonidos fuertes, sustos repentinos y efectos de imagen intensos.
          Puede no ser adecuado para personas con fotosensibilidad o con sensibilidad al miedo.
        </p>
        <p className="p" style={{ marginTop: 10 }}>Se recomienda jugar con auriculares y un volumen moderado, en una habitación con algo de luz.</p>
        <div className="btn-row btn-row-center" style={{ marginTop: 24 }}>
          <Btn autoFocus data-start="true" onClick={onContinue}>ENTIENDO, CONTINUAR</Btn>
          <Btn tone="green" onClick={onReduced}>SUSTOS REDUCIDOS</Btn>
        </div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ menu principal

export function MainMenu({
  progress, onPlay, onLevels, onControls, onSettings,
}: { progress: Progress; onPlay: () => void; onLevels: () => void; onControls: () => void; onSettings: () => void }) {
  return (
    <Screen variant="clear">
      <div className="menu-hero fade-in">
        <div className="kicker">TERROR EN PRIMERA PERSONA</div>
        <div>
          <h1 className="h1 title-pac" style={{ margin: 0 }}>PAC·MAN</h1>
          <h2 className="h1 title-umbral" style={{ margin: "6px 0 0" }}>UMBRAL</h2>
        </div>
        <div aria-hidden="true"><PacIcon size={38} color="#f0cf3c" /></div>
        <p className="p" style={{ maxWidth: 520 }}>
          Eres Pac-Man. Algo te ha traído a un lugar que no debería existir. Devora cada nodo para abrir la salida,
          pero ellos ya saben dónde estás, y esta vez ellos son los que dan miedo.
        </p>
        <div className="menu-actions">
          <Btn menu autoFocus size="lg" data-start="true" onClick={onPlay}>JUGAR</Btn>
          <Btn menu onClick={onLevels}>NIVELES</Btn>
          <Btn menu onClick={onControls}>CONTROLES</Btn>
          <Btn menu onClick={onSettings}>AJUSTES</Btn>
        </div>
        <div className="kicker" style={{ marginTop: 4 }}>RÉCORD {pad(progress.highScore)} · NIVELES ABIERTOS {progress.unlocked + 1}/{CAMPAIGN.length}</div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ dificultad

export function DifficultyCards({ selected, onSelect }: { selected: DifficultyId; onSelect: (d: DifficultyId) => void }) {
  return (
    <div className="diff-grid">
      {DIFFICULTY_ORDER.map((id) => {
        const d = DIFFICULTIES[id];
        return (
          <button key={id} type="button" className={`card ${selected === id ? "card-sel" : ""}`} onClick={() => onSelect(id)} aria-pressed={selected === id}>
            <div className="card-title" style={{ color: id === "oneLife" || id === "nightmare" ? "#ff8f7e" : "var(--pac)" }}>{d.label}</div>
            <div className="p" style={{ marginTop: 8, fontSize: 14 }}>{d.tagline}</div>
            <div className="kicker" style={{ marginTop: 10 }}>PUNTOS ×{d.scoreMult}</div>
          </button>
        );
      })}
    </div>
  );
}

export function DifficultyScreen({
  selected, onSelect, onStart, onBack,
}: { selected: DifficultyId; onSelect: (d: DifficultyId) => void; onStart: () => void; onBack: () => void }) {
  return (
    <Screen>
      <div className="panel fade-in">
        <div className="kicker">NUEVA PARTIDA</div>
        <h2 className="h2" style={{ margin: "8px 0 16px" }}>ELIGE TU DESTINO</h2>
        <DifficultyCards selected={selected} onSelect={onSelect} />
        <div className="btn-row" style={{ marginTop: 22 }}>
          <Btn tone="red" onClick={onBack}>VOLVER</Btn>
          <Btn autoFocus size="lg" data-start="true" onClick={onStart}>DESCENDER</Btn>
        </div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ niveles

export function LevelSelectScreen({
  progress, diff, onDiff, onPick, onBack,
}: { progress: Progress; diff: DifficultyId; onDiff: (d: DifficultyId) => void; onPick: (i: number) => void; onBack: () => void }) {
  return (
    <Screen>
      <div className="panel fade-in" style={{ maxWidth: 980 }}>
        <div className="kicker">SELECCIÓN DE NIVEL</div>
        <h2 className="h2" style={{ margin: "8px 0 14px" }}>EL DESCENSO</h2>
        <Seg label="DIFICULTAD" value={diff} options={DIFFICULTY_ORDER.map((id) => ({ value: id, label: DIFFICULTIES[id].label }))} onChange={onDiff} />
        <div className="level-grid">
          {CAMPAIGN.map((lv) => {
            const locked = lv.id > progress.unlocked;
            const best = progress.bestScoreByLevel[String(lv.id)] ?? 0;
            return (
              <button key={lv.id} type="button" className="card" disabled={locked} onClick={() => onPick(lv.id)}>
                <div className="kicker">{lv.subtitle}</div>
                <div className="card-title" style={{ margin: "6px 0", color: locked ? "var(--bone-faint)" : "var(--pac)" }}>{locked ? "???" : lv.name}</div>
                <div className="p" style={{ fontSize: 14 }}>{locked ? "Supera el nivel anterior para desbloquearlo." : `${lv.ghosts} ${lv.ghosts === 1 ? "entidad" : "entidades"} · ${lv.hideSpots} escondites · ${lv.W}×${lv.H}`}</div>
                {!locked && best > 0 && <div className="kicker ok" style={{ marginTop: 8 }}>MEJOR {pad(best)}</div>}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 20 }}><Btn tone="red" onClick={onBack}>VOLVER</Btn></div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ controles

export function ControlsList() {
  const rows: [ReactNode, string][] = [
    [<><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></>, "Moverse (relativo a hacia dónde miras)"],
    [<>Ratón / Táctil</>, "Mirar alrededor · En móvil: joystick izq. y giro táctil dcho."],
    [<>Flechas</>, "Adelante / atrás / lateral (en modo teclado, izquierda y derecha giran)"],
    [<><kbd>E</kbd> / <kbd>Intro</kbd></>, "Interactuar: esconderte (armarios, conductos, mesas) o encender luces"],
    [<><kbd>Q</kbd> / <kbd>Z</kbd></>, "Q gira la vista · Mantén Z para mirar por encima del hombro"],
    [<><kbd>Shift</kbd></>, "Correr (gasta aliento; los fantasmas te oyen)"],
    [<><kbd>Espacio</kbd> / clic dcho.</>, "Ecolocalización (fuera) · Pulsar al ritmo del corazón (escondido)"],
    [<><kbd>F</kbd></>, "Resplandor: linterna (gasta energía; frena al Estático)"],
    [<><kbd>C</kbd></>, "Cambiar cámara: 1ª / 3ª persona"],
    [<><kbd>X</kbd> / clic izq.</>, "Morder: aturde al fantasma de enfrente (gasta aliento, se recarga)"],
    [<><kbd>M</kbd> · <kbd>Esc</kbd> / <kbd>P</kbd></>, "Silenciar (M) · Pausa (Esc o P)"],
    [<>Mantener <kbd>Esc</kbd> / <kbd>F11</kbd></>, "Salir o alternar pantalla completa (mantén Esc 1,5 s o pulsa F11)"],
  ];
  return (
    <div className="controls-list">
      {rows.map(([k, v], i) => (
        <div className="row row-ctrl" key={i}>
          <span className="ctrl-keys">{k}</span>
          <span className="ctrl-desc">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function ControlsScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen>
      <div className="panel fade-in">
        <div className="kicker">CÓMO SOBREVIVIR</div>
        <h2 className="h2" style={{ margin: "6px 0 10px" }}>CONTROLES</h2>
        <ControlsList />
        <div className="p" style={{ marginTop: 12, fontSize: 13 }}>
          Devora todos los nodos para abrir la salida. Los orbes grandes te dan poder: los fantasmas huyen y puedes comértelos.
          El Estático solo se congela mientras lo miras con luz.
        </div>
        <div style={{ marginTop: 14 }}><Btn tone="red" onClick={onBack}>VOLVER</Btn></div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ ajustes

export function SettingsPanel({
  settings, onChange, onBack, inGame,
}: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void; inGame?: boolean }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Screen>
      <div className="panel fade-in" style={{ maxWidth: 720 }}>
        <div className="kicker">PREFERENCIAS</div>
        <h2 className="h2" style={{ margin: "6px 0 10px" }}>AJUSTES</h2>
        <Slider label="Sensibilidad de giro" value={settings.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => set("sensitivity", v)} format={(v) => v.toFixed(2)} />
        <Toggle label="Invertir eje vertical" value={settings.invertY} onChange={(v) => set("invertY", v)} />
        <Seg label="Control" value={settings.controlMode} options={[{ value: "mouse", label: "RATÓN + TECLADO" }, { value: "keyboard", label: "SOLO TECLADO" }]} onChange={(v) => set("controlMode", v)} />
        <Slider label="Campo de visión (horizontal)" value={settings.fov} min={70} max={110} step={1} onChange={(v) => set("fov", v)} format={(v) => `${v}°`} />
        <Slider label="Volumen" value={settings.volume} min={0} max={1} step={0.05} onChange={(v) => set("volume", v)} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Brillo" value={settings.brightness} min={0.7} max={1.7} step={0.05} onChange={(v) => set("brightness", v)} format={(v) => v.toFixed(2)} />
        <Seg label="Sustos" value={settings.scares} options={[{ value: "full", label: "COMPLETOS" }, { value: "reduced", label: "REDUCIDOS" }, { value: "off", label: "SIN PANTALLA" }]} onChange={(v) => set("scares", v)} />
        <Seg label="Calidad gráfica" value={settings.quality} options={[{ value: "high", label: "ALTA" }, { value: "medium", label: "MEDIA" }, { value: "low", label: "BAJA" }]} onChange={(v) => set("quality", v)} />
        <Toggle label="Pantalla completa al primer toque" value={settings.fullscreen} onChange={(v) => set("fullscreen", v)} />
        <Toggle label="Resolución dinámica (baja sola si hay lag)" value={settings.dynamicRes} onChange={(v) => set("dynamicRes", v)} />
        <Toggle label="Balanceo de cámara" value={settings.headBob} onChange={(v) => set("headBob", v)} />
        <Toggle label="Silenciar todo" value={settings.muted} onChange={(v) => set("muted", v)} />
        {inGame && <div className="p" style={{ marginTop: 10, fontSize: 13 }}>La calidad gráfica se aplica al instante; la cantidad de luces del pasillo se actualiza al empezar el siguiente nivel.</div>}
        <div style={{ marginTop: 16 }}><Btn onClick={onBack}>LISTO</Btn></div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ ficha de nivel

export function BriefingScreen({
  level, diffId, onEnter, onBack,
}: { level: LevelDef; diffId: DifficultyId; onEnter: () => void; onBack: () => void }) {
  const d = DIFFICULTIES[diffId];
  const ghosts = Math.min(4, level.ghosts + d.extraGhosts);
  return (
    <Screen variant="clear">
      <div className="briefing-hero fade-in">
        <div className="kicker">{level.subtitle}</div>
        <h1 className="h1 briefing-title">{level.name}</h1>
        <p className="p" style={{ maxWidth: 560, fontStyle: "italic" }}>“{level.flavor}”</p>
        <div style={{ display: "flex", gap: 8, margin: "14px 0 8px", alignItems: "center", flexWrap: "wrap" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} title={GHOST_NAMES[i]} style={{
              width: 18, height: 22, borderRadius: "9px 9px 2px 2px",
              background: i < ghosts ? FACE_COLORS[i as 0 | 1 | 2 | 3].css : "rgba(255,255,255,0.1)",
              boxShadow: i < ghosts ? `0 0 10px ${FACE_COLORS[i as 0 | 1 | 2 | 3].css}` : "none",
            }} />
          ))}
          <span className="kicker" style={{ marginLeft: 8 }}>{ghosts} {ghosts === 1 ? "ENTIDAD" : "ENTIDADES"} · {level.hideSpots} ESCONDITES</span>
        </div>
        <div className="kicker" style={{ marginBottom: 16 }}>{d.label} · {d.lives} {d.lives === 1 ? "VIDA" : "VIDAS"}</div>
        <p className="p" style={{ maxWidth: 560, marginBottom: 14 }}>
          OBJETIVO: devora todos los nodos para abrir la salida. Los orbes grandes te dan poder temporal sobre los fantasmas.
        </p>
        <p className="p" style={{ maxWidth: 560, marginBottom: 20 }}>
          Las figuras inmóviles son fantasmas dormidos: despiertan con el tiempo o si te acercas. El Estático solo se queda quieto mientras lo miras con la linterna. Con X muerdes y aturdes al que tienes delante.
        </p>
        <div className="btn-row">
          <Btn autoFocus size="lg" data-start="true" onClick={onEnter}>ENTRAR</Btn>
          <Btn tone="red" onClick={onBack}>MENÚ</Btn>
        </div>
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ pausa y finales

export function PauseScreen({ onResume, onSettings, onRestart, onMenu }: { onResume: () => void; onSettings: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <Screen>
      <div className="panel fade-in" style={{ maxWidth: 560, textAlign: "center" }}>
        <div className="kicker">EL LABERINTO RESPIRA</div>
        <h2 className="h2" style={{ margin: "10px 0 22px" }}>PAUSA</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <Btn autoFocus size="lg" onClick={onResume}>REANUDAR</Btn>
          <Btn onClick={onSettings}>AJUSTES</Btn>
          <Btn onClick={onRestart}>REINICIAR NIVEL</Btn>
          <Btn tone="red" onClick={onMenu}>MENÚ PRINCIPAL</Btn>
        </div>
      </div>
    </Screen>
  );
}

const KILLERS = [
  "El Acechador no se detuvo nunca.",
  "La Emboscadora ya estaba esperándote.",
  "El Resonador oyó cada paso.",
  "El Estático se movió cuando dejaste de mirar.",
];

export function GameOverScreen({ s, onRetry, onMenu }: { s: RunSummary; onRetry: () => void; onMenu: () => void }) {
  return (
    <Screen variant="solid">
      <div className="panel fade-in" style={{ maxWidth: 560 }}>
        <div className="kicker red">SEÑAL PERDIDA</div>
        <h2 className="h1" style={{ fontSize: "clamp(28px, 6vw, 54px)", color: "var(--blood)", margin: "10px 0 12px", textShadow: "0 3px 12px #000, 0 0 36px rgba(196,39,27,0.6)" }}>FIN DE LA PARTIDA</h2>
        <p className="p">{s.caughtBy !== null ? KILLERS[s.caughtBy] : "Te alcanzaron."} El laberinto no recuerda a quienes se quedan.</p>
        <div style={{ margin: "16px 0" }}>
          <Stat label="NIVEL" value={s.levelName} />
          <Stat label="PUNTUACIÓN" value={pad(s.score)} />
          <Stat label="RÉCORD" value={pad(Math.max(s.highScore, s.score))} tone={s.newHighScore ? "ok" : undefined} />
          <Stat label="NODOS DEVORADOS" value={`${s.dotsEaten}/${s.totalDots}`} />
          <Stat label="FANTASMAS COMIDOS" value={s.ghostsEaten} />
        </div>
        {s.newHighScore && <div className="kicker ok" style={{ marginBottom: 12 }}>¡NUEVO RÉCORD!</div>}
        <div className="btn-row">
          <Btn autoFocus onClick={onRetry}>REINTENTAR NIVEL</Btn>
          <Btn tone="red" onClick={onMenu}>MENÚ</Btn>
        </div>
      </div>
    </Screen>
  );
}

export function LevelClearScreen({ s, onNext, onMenu }: { s: RunSummary; onNext: () => void; onMenu: () => void }) {
  const next = CAMPAIGN[Math.min(CAMPAIGN.length - 1, s.levelIndex + 1)];
  return (
    <Screen variant="solid">
      <div className="panel fade-in" style={{ maxWidth: 560 }}>
        <div className="kicker ok">BRECHA CRUZADA</div>
        <h2 className="h1" style={{ fontSize: "clamp(28px, 5.5vw, 50px)", color: "var(--ok)", margin: "10px 0 12px" }}>NIVEL SUPERADO</h2>
        <p className="p">Más abajo hay otra ala del laberinto. Las luces parpadean más rápido.</p>
        <div style={{ margin: "16px 0" }}>
          <Stat label="NIVEL" value={s.levelName} />
          <Stat label="PUNTUACIÓN" value={pad(s.score)} />
          <Stat label="TIEMPO" value={fmtTime(s.timeSeconds)} />
          <Stat label="FANTASMAS COMIDOS" value={s.ghostsEaten} />
          <Stat label="MUERTES" value={s.deaths} tone={s.deaths ? "red" : "ok"} />
          <Stat label="VIDAS" value={s.lives} />
        </div>
        <div className="kicker" style={{ marginBottom: 16 }}>SIGUIENTE: {next.subtitle} · {next.name}</div>
        <div className="btn-row">
          <Btn tone="green" autoFocus size="lg" onClick={onNext}>SIGUIENTE NIVEL</Btn>
          <Btn tone="red" onClick={onMenu}>MENÚ</Btn>
        </div>
      </div>
    </Screen>
  );
}

export function VictoryScreen({ s, onMenu }: { s: RunSummary; onMenu: () => void }) {
  return (
    <Screen variant="solid">
      <div className="panel fade-in" style={{ maxWidth: 620, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><PacIcon size={64} /></div>
        <div className="kicker ok" style={{ marginTop: 14 }}>EL HAMBRE CESA</div>
        <h2 className="h1" style={{ fontSize: "clamp(30px, 6vw, 58px)", color: "var(--pac)", margin: "10px 0 14px", textShadow: "0 3px 12px #000, 0 0 40px rgba(240,207,60,0.3)" }}>HAS ESCAPADO</h2>
        <p className="p">Cruzas la última puerta. Fuera, el zumbido de 60 Hz por fin se apaga. Pero Pac-Man nunca deja de tener hambre.</p>
        <div style={{ margin: "16px 0", textAlign: "left" }}>
          <Stat label="DIFICULTAD" value={DIFFICULTIES[s.difficulty].label} />
          <Stat label="PUNTUACIÓN FINAL" value={pad(s.score)} tone="ok" />
          <Stat label="RÉCORD" value={pad(Math.max(s.highScore, s.score))} tone={s.newHighScore ? "ok" : undefined} />
          <Stat label="TIEMPO DEL ÚLTIMO NIVEL" value={fmtTime(s.timeSeconds)} />
          <Stat label="VIDAS RESTANTES" value={s.lives} />
        </div>
        <Btn autoFocus onClick={onMenu}>VOLVER AL MENÚ</Btn>
      </div>
    </Screen>
  );
}
