import { forwardRef } from "react";

/** Estructura estatica del HUD. El HudController actualiza los valores directamente en el DOM. */
export const HudView = forwardRef<HTMLDivElement, { radarRef: React.RefObject<HTMLCanvasElement | null> }>(function HudView({ radarRef }, ref) {
  return (
    <div ref={ref} className="hud" style={{ opacity: 0 }}>
      {/* superior */}
      <div style={{ position: "absolute", top: 14, left: 18, right: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="hud-label">PUNTUACIÓN</div>
          <div className="hud-val" data-hud="score">000000</div>
          <div className="hud-label" style={{ marginTop: 6 }}>RÉCORD</div>
          <div style={{ fontSize: 13, letterSpacing: "0.12em", color: "rgba(255,243,196,0.75)" }} data-hud="high">000000</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="hud-label" data-hud="level">NIVEL</div>
          <div style={{ fontSize: 14, letterSpacing: "0.22em", marginTop: 6 }} data-hud="nodes">NODOS 000</div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", marginTop: 5, opacity: 0, color: "#ffb76a" }} data-hud="fruit" />
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hud-label">VIDAS</div>
          <div style={{ marginTop: 4, minHeight: 24 }} data-hud="lives" />
          <div className="hud-label" style={{ marginTop: 8 }} data-hud="cam">1ª PERSONA [C]</div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#ff8f7a", opacity: 0 }} data-hud="mute">SILENCIADO [M]</div>
        </div>
      </div>

      {/* poder */}
      <div className="hud-power" data-hud="power">
        <div className="hud-label" style={{ color: "#9db0ff" }}>PODER · LOS FANTASMAS SON VULNERABLES</div>
        <div className="track"><div className="fill" data-hud="powerFill" style={{ width: "100%" }} /></div>
      </div>

      {/* inferior izquierda */}
      <div style={{ position: "absolute", left: 18, bottom: 16 }}>
        <div className="hud-label" style={{ marginBottom: 4 }} data-hud="batteryLabel">RESPLANDOR [F]</div>
        <div className="bar"><div data-hud="battery" style={{ background: "#ffd24a" }} /></div>
        <div className="hud-label" style={{ margin: "10px 0 4px" }} data-hud="staminaLabel">ALIENTO [SHIFT]</div>
        <div className="bar"><div data-hud="stamina" style={{ background: "#7dffb0" }} /></div>
      </div>

      <div className="hud-msg" data-hud="message" />
      <div className="hud-hint" data-hud="hint" />
      <div className="hud-radar" data-hud="radar"><canvas ref={radarRef} /></div>
      <div data-hud="popups" style={{ position: "absolute", inset: 0 }} />
      <div className="hud-vignette" data-hud="vignette" />
      <div className="hud-flash" data-hud="flash" />
      <div data-hud="exit" style={{ display: "none" }} />
    </div>
  );
});
