import { forwardRef, useEffect, useRef } from "react";
import { triggerTapHaptics } from "../engine/haptics";
import type { Input } from "../engine/input";

interface HudProps {
  radarRef: React.RefObject<HTMLCanvasElement | null>;
  getInput?: () => Input | null;
}

/** Estructura del HUD e interfaz tactil. El HudController actualiza los valores directamente en el DOM. */
export const HudView = forwardRef<HTMLDivElement, HudProps>(function HudView({ radarRef, getInput }, ref) {
  const hudRootRef = useRef<HTMLDivElement | null>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyZoneRef = useRef<HTMLDivElement>(null);
  const lookZoneRef = useRef<HTMLDivElement>(null);

  const getInputRef = useRef(getInput);
  getInputRef.current = getInput;

  const joyState = useRef<{ touchId: number | null; pointerId: number | null }>({
    touchId: null,
    pointerId: null,
  });
  const lookState = useRef<{ touchId: number | null; pointerId: number | null; lx: number; ly: number }>({
    touchId: null,
    pointerId: null,
    lx: 0,
    ly: 0,
  });

  const setRef = (node: HTMLDivElement | null) => {
    hudRootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const markTouchMode = () => {
    const hud = hudRootRef.current;
    if (hud && hud.dataset.touchMode !== "1") hud.dataset.touchMode = "1";
  };

  const setJoyVisualActive = (active: boolean) => {
    if (joyBaseRef.current) {
      joyBaseRef.current.dataset.active = active ? "1" : "0";
    }
  };

  const updateJoyFromPoint = (cx: number, cy: number) => {
    const base = joyBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height / 2;
    const maxR = Math.max(36, rect.width * 0.42);
    const dx = cx - ox;
    const dy = cy - oy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;
    }
    const deadzone = 4;
    const normX = dist < deadzone ? 0 : kx / maxR;
    const normY = dist < deadzone ? 0 : -ky / maxR;
    const autoSprint = dist > maxR * 0.82 && normY > 0.32;
    getInputRef.current?.()?.setTouchMove(normY, normX, autoSprint);
  };

  const resetJoy = () => {
    joyState.current.touchId = null;
    joyState.current.pointerId = null;
    setJoyVisualActive(false);
    if (joyKnobRef.current) {
      joyKnobRef.current.style.transform = "translate3d(0px, 0px, 0)";
    }
    getInputRef.current?.()?.setTouchMove(0, 0, false);
  };

  // Seguimiento global en window para que el joystick y el giro nunca pierdan el dedo aunque salga de su zona
  useEffect(() => {
    const onWindowTouchMove = (e: TouchEvent) => {
      const jId = joyState.current.touchId;
      const lId = lookState.current.touchId;
      if (jId === null && lId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (jId !== null && t.identifier === jId) {
          updateJoyFromPoint(t.clientX, t.clientY);
        }
        if (lId !== null && t.identifier === lId) {
          const dx = t.clientX - lookState.current.lx;
          const dy = t.clientY - lookState.current.ly;
          lookState.current.lx = t.clientX;
          lookState.current.ly = t.clientY;
          getInputRef.current?.()?.addTouchLook(dx * 2.2, dy * 1.8);
        }
      }
    };

    const onWindowTouchEnd = (e: TouchEvent) => {
      const jId = joyState.current.touchId;
      const lId = lookState.current.touchId;
      if (jId === null && lId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (jId !== null && t.identifier === jId) {
          resetJoy();
        }
        if (lId !== null && t.identifier === lId) {
          lookState.current.touchId = null;
        }
      }
    };

    const onWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (joyState.current.pointerId === e.pointerId) {
        updateJoyFromPoint(e.clientX, e.clientY);
      }
      if (lookState.current.pointerId === e.pointerId) {
        const dx = e.clientX - lookState.current.lx;
        const dy = e.clientY - lookState.current.ly;
        lookState.current.lx = e.clientX;
        lookState.current.ly = e.clientY;
        getInputRef.current?.()?.addTouchLook(dx * 2.2, dy * 1.8);
      }
    };

    const onWindowPointerEnd = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (joyState.current.pointerId === e.pointerId) {
        resetJoy();
      }
      if (lookState.current.pointerId === e.pointerId) {
        lookState.current.pointerId = null;
      }
    };

    const onWindowBlur = () => {
      resetJoy();
      lookState.current.touchId = null;
      lookState.current.pointerId = null;
    };

    window.addEventListener("touchmove", onWindowTouchMove, { passive: true });
    window.addEventListener("touchend", onWindowTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onWindowTouchEnd, { passive: true });
    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    window.addEventListener("pointerup", onWindowPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onWindowPointerEnd, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("touchmove", onWindowTouchMove);
      window.removeEventListener("touchend", onWindowTouchEnd);
      window.removeEventListener("touchcancel", onWindowTouchEnd);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  // ---- Inicio de gesto en el joystick izquierdo ----
  const onJoyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    markTouchMode();
    if (joyState.current.touchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    joyState.current.touchId = t.identifier;
    joyState.current.pointerId = null;
    setJoyVisualActive(true);
    updateJoyFromPoint(t.clientX, t.clientY);
  };

  const onJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    markTouchMode();
    if (joyState.current.pointerId !== null || joyState.current.touchId !== null) return;
    joyState.current.pointerId = e.pointerId;
    setJoyVisualActive(true);
    updateJoyFromPoint(e.clientX, e.clientY);
  };

  // ---- Inicio de gesto en la zona derecha de giro 360 ----
  const onLookTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    markTouchMode();
    if (lookState.current.touchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    lookState.current = { touchId: t.identifier, pointerId: null, lx: t.clientX, ly: t.clientY };
  };

  const onLookPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    markTouchMode();
    if (lookState.current.pointerId !== null || lookState.current.touchId !== null) return;
    lookState.current = { touchId: null, pointerId: e.pointerId, lx: e.clientX, ly: e.clientY };
  };

  // ---- Generadores de eventos sin conflicto para botones tactiles ----
  const tapBtnProps = (action: () => void) => ({
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      markTouchMode();
      e.currentTarget.dataset.pressed = "1";
      triggerTapHaptics();
      action();
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
    },
    onTouchCancel: (e: React.TouchEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      markTouchMode();
      e.currentTarget.dataset.pressed = "1";
      triggerTapHaptics();
      action();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      e.currentTarget.dataset.pressed = "0";
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
    },
  });

  const holdBtnProps = (setHold: (active: boolean) => void) => ({
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      markTouchMode();
      e.currentTarget.dataset.pressed = "1";
      triggerTapHaptics();
      setHold(true);
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
      setHold(false);
    },
    onTouchCancel: (e: React.TouchEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
      setHold(false);
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      markTouchMode();
      e.currentTarget.dataset.pressed = "1";
      triggerTapHaptics();
      setHold(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      e.currentTarget.dataset.pressed = "0";
      setHold(false);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.pressed = "0";
      setHold(false);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      if (e.currentTarget.dataset.pressed === "1") {
        e.currentTarget.dataset.pressed = "0";
        setHold(false);
      }
    },
  });

  return (
    <div ref={setRef} className="hud" style={{ opacity: 0 }}>
      {/* superior */}
      <div className="hud-top">
        <div className="hud-col-left">
          <div className="hud-label">PUNTUACIÓN</div>
          <div className="hud-val" data-hud="score">000000</div>
          <div className="hud-label hud-sub-label">RÉCORD</div>
          <div className="hud-high" data-hud="high">000000</div>
        </div>
        <div className="hud-col-center">
          <div className="hud-label" data-hud="level">NIVEL</div>
          <div className="hud-nodes" data-hud="nodes">NODOS 000</div>
          <div className="hud-fruit" data-hud="fruit" />
        </div>
        <div className="hud-col-right">
          <div className="hud-label">VIDAS</div>
          <div className="hud-lives" data-hud="lives" />
          <div className="hud-label hud-cam-label" data-hud="cam">1ª PERSONA [C]</div>
          <div className="hud-mute" data-hud="mute">SILENCIADO [M]</div>
        </div>
      </div>

      {/* poder */}
      <div className="hud-power" data-hud="power">
        <div className="hud-label" style={{ color: "#b4c2ff" }}>PODER · ELLOS TIENEN MIEDO</div>
        <div className="track"><div className="fill" data-hud="powerFill" style={{ width: "100%" }} /></div>
      </div>

      {/* barras de estado */}
      <div className="hud-bars">
        <div className="hud-bar-group">
          <div className="hud-label" data-hud="batteryLabel">RESPLANDOR [F]</div>
          <div className="bar"><div data-hud="battery" /></div>
        </div>
        <div className="hud-bar-group">
          <div className="hud-label" data-hud="staminaLabel">ALIENTO [SHIFT]</div>
          <div className="bar bar-stamina"><div data-hud="stamina" /></div>
        </div>
        <div className="hud-bar-group">
          <div className="hud-label">MORDISCO [X]</div>
          <div className="bar bar-bite"><div data-hud="bite" /></div>
        </div>
      </div>

      <div className="hud-msg" data-hud="message" />
      <div className="hud-hint" data-hud="hint" />
      <div className="hud-exit" data-hud="exitArrow"><i /></div>
      <div className="hud-cross" data-hud="crosshair" />
      <div className="hud-hide" data-hud="hide">
        <div
          className="hud-heart"
          data-hud="heartGame"
          data-touch-ui="1"
          {...holdBtnProps((active) => getInput()?.setTouchSonar(active))}
        >
          <div className="hud-heart-head">
            <span data-hud="hideTitle">ESCONDITE</span>
            <span data-hud="heartLabel">PULSA AL RITMO EN EL CENTRO</span>
          </div>
          <div className="hud-heart-track">
            <div className="hud-heart-stress" data-hud="heartStress" />
            <div className="hud-heart-zone" data-hud="heartZone" />
            <div className="hud-heart-cursor" data-hud="heartCursor" />
          </div>
        </div>
        <span className="hud-hide-label">
          <span className="lab-idle">E / USAR: SALIR · ESPACIO / LATIDO AL RITMO DEL CORAZÓN</span>
          <span className="lab-hold">PULSO CONTROLADO · EN CALMA</span>
        </span>
      </div>
      <div className="hud-radar" data-hud="radar"><canvas ref={radarRef} /></div>
      <div data-hud="popups" style={{ position: "absolute", inset: 0 }} />
      <div className="hud-vignette" data-hud="vignette" />
      <div className="hud-flash" data-hud="flash" />
      <div data-hud="exit" style={{ display: "none" }} />

      {/* Controles tactiles para movil / tablet */}
      <div className="hud-touch" aria-label="Controles táctiles" data-touch-ui="1">
        {/* Utilidades rapidas superiores */}
        <div className="touch-utils">
          <button
            type="button"
            className="touch-btn touch-btn-util"
            aria-label="Pausar partida"
            {...tapBtnProps(() => getInput()?.triggerPause())}
          >
            <span className="touch-icon">II</span>
            <span className="touch-sub">PAUSA</span>
          </button>
          <button
            type="button"
            className="touch-btn touch-btn-util"
            aria-label="Cambiar cámara"
            {...tapBtnProps(() => getInput()?.triggerCamera())}
          >
            <span className="touch-icon">1ª/3ª</span>
            <span className="touch-sub">CÁMARA</span>
          </button>
          <button
            type="button"
            className="touch-btn touch-btn-util"
            aria-label="Mirar atrás"
            {...holdBtnProps((active) => getInput()?.setTouchLookBack(active))}
          >
            <span className="touch-icon">↺</span>
            <span className="touch-sub">ATRÁS</span>
          </button>
        </div>

        {/* Joystick analogico izquierdo: base circular semitransparente limpia (~10% mas grande) */}
        <div
          ref={joyZoneRef}
          className="touch-joy-zone"
          onTouchStart={onJoyTouchStart}
          onPointerDown={onJoyPointerDown}
        >
          <div ref={joyBaseRef} className="touch-joy-base" data-active="0">
            <div className="touch-joy-crosshair" aria-hidden="true" />
            <div ref={joyKnobRef} className="touch-joy-knob" />
          </div>
        </div>

        {/* Giro tactil derecho */}
        <div
          ref={lookZoneRef}
          className="touch-look-zone"
          onTouchStart={onLookTouchStart}
          onPointerDown={onLookPointerDown}
        />

        {/* Botones circulares claros alineados en grilla a la derecha */}
        <div className="touch-actions">
          <button
            type="button"
            className="touch-btn touch-btn-interact"
            aria-label="Interactuar o esconderse"
            {...tapBtnProps(() => getInput()?.triggerInteract())}
          >
            <span className="touch-icon">E</span>
            <span className="touch-sub" data-hud="touchInteractLabel">USAR</span>
          </button>

          <div className="touch-actions-grid">
            <button
              type="button"
              className="touch-btn touch-btn-light"
              aria-label="Alternar linterna"
              {...tapBtnProps(() => getInput()?.triggerLight())}
            >
              <span className="touch-icon">☀</span>
              <span className="touch-sub">LUZ</span>
            </button>

            <button
              type="button"
              className="touch-btn touch-btn-bite"
              aria-label="Morder"
              {...tapBtnProps(() => getInput()?.triggerBite())}
            >
              <span className="touch-icon">X</span>
              <span className="touch-sub">MORDER</span>
            </button>

            <button
              type="button"
              className="touch-btn touch-btn-sprint"
              aria-label="Correr"
              {...holdBtnProps((active) => getInput()?.setTouchSprint(active))}
            >
              <span className="touch-icon">»</span>
              <span className="touch-sub">CORRER</span>
            </button>

            <button
              type="button"
              className="touch-btn touch-btn-sonar"
              aria-label="Sonar o ritmo del corazón"
              {...holdBtnProps((active) => getInput()?.setTouchSonar(active))}
            >
              <span className="touch-icon">◎</span>
              <span className="touch-sub" data-hud="touchSonarLabel">SONAR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
