import { useCallback, useEffect, useRef, useState } from "react";
import { CAMPAIGN } from "./config/campaign";
import type { DifficultyId } from "./config/difficulty";
import { Game } from "./engine/game";
import { unlockHaptics } from "./engine/haptics";
import { loadProgress, loadSettings, saveProgress, saveSettings, type Progress, type Settings } from "./engine/settings";
import type { Phase, RunSummary } from "./engine/types";
import { HudController } from "./ui/hudController";
import { HudView } from "./ui/Hud";
import {
  BriefingScreen, ControlsScreen, DifficultyScreen, GameOverScreen, LevelClearScreen, LevelSelectScreen,
  LoadingScreen, MainMenu, PauseScreen, SettingsPanel, VictoryScreen, WarningScreen,
} from "./ui/screens";

type MenuView = "main" | "difficulty" | "levels" | "controls" | "settings";

const EMPTY_SUMMARY: RunSummary = {
  difficulty: "normal", levelIndex: 0, levelName: "", score: 0, highScore: 0, newHighScore: false, lives: 0,
  timeSeconds: 0, ghostsEaten: 0, deaths: 0, dotsEaten: 0, totalDots: 0, isFinalLevel: false, caughtBy: null,
};

const ESC_HOLD_MS = 1500;
const ESC_SHOW_DELAY_MS = 160;

type NavWithKeyboard = Navigator & {
  keyboard?: {
    lock?: (keys: string[]) => Promise<void>;
    unlock?: () => void;
  };
};

function lockEscapeKey(): void {
  const kb = (navigator as unknown as NavWithKeyboard).keyboard;
  void kb?.lock?.(["Escape"]).catch(() => { /* navegador sin soporte de Keyboard Lock */ });
}

function unlockEscapeKey(): void {
  const kb = (navigator as unknown as NavWithKeyboard).keyboard;
  try { kb?.unlock?.(); } catch { /* ignorar */ }
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const scareRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [menuView, setMenuView] = useState<MenuView>("main");
  const [pauseSettings, setPauseSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [diff, setDiff] = useState<DifficultyId>("normal");
  const [summary, setSummary] = useState<RunSummary>(EMPTY_SUMMARY);
  const [briefLevel, setBriefLevel] = useState(0);
  const [outroDone, setOutroDone] = useState(false);
  const [escHold, setEscHold] = useState(0);
  const [fsNotice, setFsNotice] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const manualFsExit = useRef(false);
  const escHoldRaf = useRef<number | null>(null);
  const escDownAt = useRef<number | null>(null);
  const fsNoticeTimer = useRef<number | null>(null);

  const showFsNotice = useCallback((msg: string) => {
    setFsNotice(msg);
    if (fsNoticeTimer.current !== null) window.clearTimeout(fsNoticeTimer.current);
    fsNoticeTimer.current = window.setTimeout(() => setFsNotice(null), 1800);
  }, []);

  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement || typeof el.requestFullscreen !== "function") {
      lockEscapeKey();
      return;
    }
    void el.requestFullscreen({ navigationUI: "hide" }).then(() => {
      lockEscapeKey();
    }).catch(() => { /* el navegador o iframe lo rechazo: se sigue en ventana */ });
  }, []);

  const exitFullscreenExplicit = useCallback(() => {
    manualFsExit.current = true;
    unlockEscapeKey();
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      void document.exitFullscreen().catch(() => { /* ignorar */ });
    }
    showFsNotice("PANTALLA COMPLETA DESACTIVADA · F11 PARA ALTERNAR");
  }, [showFsNotice]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      exitFullscreenExplicit();
    } else {
      manualFsExit.current = false;
      enterFullscreen();
      showFsNotice("PANTALLA COMPLETA ACTIVADA · MANTÉN ESC 1,5 S O F11 PARA SALIR");
    }
  }, [enterFullscreen, exitFullscreenExplicit, showFsNotice]);

  // ---- ciclo de vida del motor ----
  useEffect(() => {
    if (!containerRef.current || !radarRef.current || !scareRef.current || !hudRef.current) return;
    const hud = new HudController(hudRef.current);
    const game = new Game({
      container: containerRef.current,
      radarCanvas: radarRef.current,
      scareCanvas: scareRef.current,
      hud,
      settings: loadSettings(),
      progress: loadProgress(),
      callbacks: {
        onPhase: (p) => {
          setPhase(p);
          setSummary(game.summary());
          if (p === "briefing") setBriefLevel(game.sim?.level.id ?? 0);
          setOutroDone(false);
          if (p === "levelclear" || p === "victory") {
            game.input.releaseLock();
            window.setTimeout(() => setOutroDone(true), 2600);
          }
          if (p === "gameover") game.input.releaseLock();
          setProgress(game.progress);
        },
        onSettings: (s) => setSettings(s),
      },
    });
    gameRef.current = game;
    void game.boot();
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const uiStateRef = useRef({ phase, menuView, pauseSettings });
  uiStateRef.current = { phase, menuView, pauseSettings };

  // ---- teclas de menu, F11 y mantener Esc 1.5s para salir de pantalla completa ----
  useEffect(() => {
    const stopEscHold = () => {
      if (escHoldRaf.current !== null) {
        cancelAnimationFrame(escHoldRaf.current);
        escHoldRaf.current = null;
      }
      escDownAt.current = null;
      setEscHold(0);
    };

    const tickEscHold = (now: number) => {
      if (escDownAt.current === null) return;
      const elapsed = now - escDownAt.current;
      if (elapsed >= ESC_HOLD_MS) {
        stopEscHold();
        exitFullscreenExplicit();
        return;
      }
      if (elapsed >= ESC_SHOW_DELAY_MS) {
        const pct = Math.min(1, (elapsed - ESC_SHOW_DELAY_MS) / (ESC_HOLD_MS - ESC_SHOW_DELAY_MS));
        setEscHold(pct);
      }
      escHoldRaf.current = requestAnimationFrame(tickEscHold);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "F11") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.code !== "Escape") return;
      if (!e.repeat) {
        const st = uiStateRef.current;
        if (st.phase === "menu" && st.menuView !== "main") setMenuView("main");
        else if (st.phase === "paused" && st.pauseSettings) setPauseSettings(false);
        if (escDownAt.current === null) {
          escDownAt.current = performance.now();
          escHoldRaf.current = requestAnimationFrame(tickEscHold);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Escape") stopEscHold();
    };

    const onFsChange = () => {
      if (document.fullscreenElement) {
        lockEscapeKey();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopEscHold);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      stopEscHold();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopEscHold);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [exitFullscreenExplicit, toggleFullscreen]);

  // ---- acciones ----
  const game = () => gameRef.current;

  /** Al primer toque o clic: activa audio, vibracion haptica y pantalla completa persistente. */
  const ensureAudio = useCallback(() => {
    unlockHaptics();
    gameRef.current?.audio.resume();
    if (!settingsRef.current.fullscreen || manualFsExit.current) return;
    if (!document.fullscreenElement) {
      enterFullscreen();
    } else {
      lockEscapeKey();
    }
  }, [enterFullscreen]);

  const changeSettings = useCallback((s: Settings) => {
    const prevFs = settingsRef.current.fullscreen;
    setSettings(s);
    saveSettings(s);
    gameRef.current?.applySettings(s);
    if (s.fullscreen && !prevFs) {
      manualFsExit.current = false;
      enterFullscreen();
    } else if (!s.fullscreen && prevFs && document.fullscreenElement) {
      exitFullscreenExplicit();
    }
  }, [enterFullscreen, exitFullscreenExplicit]);

  const acceptWarning = (reduced: boolean) => {
    unlockHaptics();
    const p = { ...progress, warningAccepted: true };
    setProgress(p); saveProgress(p);
    if (gameRef.current) gameRef.current.progress = p;
    if (reduced) changeSettings({ ...settings, scares: "reduced" });
    gameRef.current?.audio.resume();
  };

  const start = (level: number) => {
    setMenuView("main");
    void game()?.startRun(diff, level);
  };

  const backToMenu = () => { setPauseSettings(false); setMenuView("main"); void game()?.quitToMenu(); };

  const warningNeeded = phase === "menu" && !progress.warningAccepted;
  const getInput = useCallback(() => gameRef.current?.input ?? null, []);
  const showBanner = escHold > 0.01 || fsNotice !== null;

  return (
    <div className="app-root font-crt" onPointerDownCapture={ensureAudio} onTouchStartCapture={ensureAudio}>
      <div ref={containerRef} className="absolute inset-0" />
      <canvas ref={scareRef} className="scare-canvas" />
      <HudView ref={hudRef} radarRef={radarRef} getInput={getInput} />
      <div className="crt-lines" />

      {/* Indicador sutil al mantener Esc para salir de pantalla completa */}
      <div
        className="fs-hold-indicator"
        data-active={showBanner ? "1" : "0"}
        aria-hidden={!showBanner}
      >
        <div className="fs-hold-label">
          {escHold > 0.01 ? "MANTÉN ESC PARA SALIR DE PANTALLA COMPLETA · O PULSA F11" : fsNotice}
        </div>
        <div className="fs-hold-track" style={{ opacity: escHold > 0.01 ? 1 : 0 }}>
          <div className="fs-hold-fill" style={{ width: `${Math.round(escHold * 100)}%` }} />
        </div>
      </div>

      {phase === "loading" && <LoadingScreen />}

      {warningNeeded && <WarningScreen onContinue={() => acceptWarning(false)} onReduced={() => acceptWarning(true)} />}

      {phase === "menu" && !warningNeeded && menuView === "main" && (
        <MainMenu
          progress={progress}
          onPlay={() => setMenuView("difficulty")}
          onLevels={() => setMenuView("levels")}
          onControls={() => setMenuView("controls")}
          onSettings={() => setMenuView("settings")}
        />
      )}
      {phase === "menu" && !warningNeeded && menuView === "difficulty" && (
        <DifficultyScreen selected={diff} onSelect={setDiff} onStart={() => start(0)} onBack={() => setMenuView("main")} />
      )}
      {phase === "menu" && !warningNeeded && menuView === "levels" && (
        <LevelSelectScreen progress={progress} diff={diff} onDiff={setDiff} onPick={start} onBack={() => setMenuView("main")} />
      )}
      {phase === "menu" && !warningNeeded && menuView === "controls" && <ControlsScreen onBack={() => setMenuView("main")} />}
      {phase === "menu" && !warningNeeded && menuView === "settings" && (
        <SettingsPanel settings={settings} onChange={changeSettings} onBack={() => setMenuView("main")} />
      )}

      {phase === "briefing" && (
        <BriefingScreen
          level={CAMPAIGN[briefLevel]}
          diffId={summary.difficulty}
          onEnter={() => game()?.enterLevel()}
          onBack={backToMenu}
        />
      )}

      {phase === "paused" && !pauseSettings && (
        <PauseScreen
          onResume={() => game()?.resume()}
          onSettings={() => setPauseSettings(true)}
          onRestart={() => { void game()?.restartLevel(); }}
          onMenu={backToMenu}
        />
      )}
      {phase === "paused" && pauseSettings && (
        <SettingsPanel inGame settings={settings} onChange={changeSettings} onBack={() => setPauseSettings(false)} />
      )}

      {phase === "gameover" && (
        <GameOverScreen s={summary} onRetry={() => { void game()?.restartLevel(); }} onMenu={backToMenu} />
      )}
      {phase === "levelclear" && outroDone && (
        <LevelClearScreen s={summary} onNext={() => { void game()?.nextLevel(); }} onMenu={backToMenu} />
      )}
      {phase === "victory" && outroDone && <VictoryScreen s={summary} onMenu={backToMenu} />}
    </div>
  );
}
