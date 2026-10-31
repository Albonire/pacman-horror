import { forwardRef } from "react";

/** Estructura estatica del HUD. El HudController actualiza los valores directamente en el DOM. */
export const HudView = forwardRef<HTMLDivElement, { radarRef: React.RefObject<HTMLCanvasElement | null> }>(function HudView({ radarRef }, ref) {
  return (
    <div ref={ref} className="hud" style={{ opacity: 0 }}>
      {/* superior */}
      <div style={{ position: "absolute", top: 18, left: 26, right: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="hud-label">PUNTUACIÓN</div>
          <div className="hud-val" data-hud="score">000000</div>
          <div className="hud-label" style={{ marginTop: 6 }}>RÉCORD</div>
          <div style={{ fontSize: 16, letterSpacing: "0.14em", color: "var(--bone-dim)" }} data-hud="high">000000</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="hud-label" data-hud="level">NIVEL</div>
          <div style={{ fontSize: 22, letterSpacing: "0.2em", marginTop: 4 }} data-hud="nodes">NODOS 000</div>
          <div style={{ fontSize: 14, letterSpacing: "0.2em", marginTop: 5, opacity: 0, color: "#ffc98a" }} data-hud="fruit" />
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hud-label">VIDAS</div>
          <div style={{ marginTop: 4, minHeight: 24 }} data-hud="lives" />
          <div className="hud-label" style={{ marginTop: 8 }} data-hud="cam">1ª PERSONA [C]</div>
          <div style={{ fontSize: 13, letterSpacing: "0.2em", color: "#ff9684", opacity: 0 }} data-hud="mute">SILENCIADO [M]</div>
        </div>
      </div>

      {/* poder */}
      <div className="hud-power" data-hud="power">
        <div className="hud-label" style={{ color: "#b4c2ff" }}>PODER · ELLOS TIENEN MIEDO</div>
        <div className="track"><div className="fill" data-hud="powerFill" style={{ width: "100%" }} /></div>
      </div>

      {/* inferior izquierda */}
      <div style={{ position: "absolute", left: 26, bottom: 22 }}>
        <div className="hud-label" style={{ marginBottom: 4 }} data-hud="batteryLabel">RESPLANDOR [F]</div>
        <div className="bar"><div data-hud="battery" /></div>
        <div className="hud-label" style={{ margin: "10px 0 4px" }} data-hud="staminaLabel">ALIENTO [SHIFT]</div>
        <div className="bar bar-stamina"><div data-hud="stamina" /></div>
        <div className="hud-label" style={{ margin: "10px 0 4px" }}>MORDISCO [X]</div>
        <div className="bar bar-bite"><div data-hud="bite" /></div>
      </div>

      <div className="hud-msg" data-hud="message" />
      <div className="hud-hint" data-hud="hint" />
      <div className="hud-exit" data-hud="exitArrow"><i /></div>
      <div className="hud-cross" data-hud="crosshair" />
      <div className="hud-hide" data-hud="hide">
        <div className="hud-heart" data-hud="heartGame">
          <div className="hud-heart-head">
            <span data-hud="hideTitle">ESCONDITE</span>
            <span data-hud="heartLabel">PULSA [ESPACIO] EN EL CENTRO</span>
          </div>
          <div className="hud-heart-track">
            <div className="hud-heart-stress" data-hud="heartStress" />
            <div className="hud-heart-zone" data-hud="heartZone" />
            <div className="hud-heart-cursor" data-hud="heartCursor" />
          </div>
        </div>
        <span className="hud-hide-label">
          <span className="lab-idle">E: SALIR · ESPACIO AL RITMO DEL CORAZÓN</span>
          <span className="lab-hold">PULSO CONTROLADO · EN CALMA</span>
        </span>
      </div>
      <div className="hud-radar" data-hud="radar"><canvas ref={radarRef} /></div>
      <div data-hud="popups" style={{ position: "absolute", inset: 0 }} />
      <div className="hud-vignette" data-hud="vignette" />
      <div className="hud-flash" data-hud="flash" />
      <div data-hud="exit" style={{ display: "none" }} />
    </div>
  );
});
