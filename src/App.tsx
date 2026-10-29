import { useCallback, useEffect, useRef, useState } from "react";
import { CAMPAIGN } from "./config/campaign";
import type { DifficultyId } from "./config/difficulty";
import { Game } from "./engine/game";
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

  // ---- teclas de menu ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (phase === "menu" && menuView !== "main") setMenuView("main");
      else if (phase === "paused" && pauseSettings) setPauseSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, menuView, pauseSettings]);

  // ---- acciones ----
  const game = () => gameRef.current;
  const changeSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    gameRef.current?.applySettings(s);
  }, []);

  const acceptWarning = (reduced: boolean) => {
    const p = { ...progress, warningAccepted: true };
    setProgress(p); saveProgress(p);
    if (gameRef.current) gameRef.current.progress = p; // el motor guarda su copia al terminar niveles
    if (reduced) changeSettings({ ...settings, scares: "reduced" });
    gameRef.current?.audio.resume();
  };

  const start = (level: number) => {
    setMenuView("main");
    void game()?.startRun(diff, level);
  };

  const backToMenu = () => { setPauseSettings(false); setMenuView("main"); void game()?.quitToMenu(); };

  const warningNeeded = phase === "menu" && !progress.warningAccepted;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none font-crt">
      <div ref={containerRef} className="absolute inset-0" />
      <canvas ref={scareRef} className="scare-canvas" />
      <HudView ref={hudRef} radarRef={radarRef} />
      <div className="crt-lines" />

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

