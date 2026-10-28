import { useId, type ReactNode } from "react";

export function Btn({
  children, onClick, tone = "amber", size = "md", autoFocus, disabled, className = "", menu,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "amber" | "red" | "green";
  size?: "md" | "lg";
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  menu?: boolean;
}) {
  const t = tone === "red" ? "btn-red" : tone === "green" ? "btn-green" : "";
  return (
    <button
      type="button"
      className={`btn ${t} ${size === "lg" ? "btn-lg" : ""} ${menu ? "btn-menu" : ""} ${className}`}
      onClick={onClick}
      autoFocus={autoFocus}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Pac-Man animado (SVG) con la boca abriendose y cerrandose. */
export function PacIcon({ size = 28, color = "#ffd21a", glow = true }: { size?: number; color?: string; glow?: boolean }) {
  const open = "M50 50 L93.3 22 A50 50 0 1 0 93.3 78 Z";
  const closed = "M50 50 L99.8 47 A50 50 0 1 0 99.8 53 Z";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={glow ? { filter: `drop-shadow(0 0 ${size / 6}px ${color})` } : undefined}>
      <path fill={color} d={open}>
        <animate attributeName="d" dur="0.55s" repeatCount="indefinite" values={`${open};${closed};${open}`} />
      </path>
      <circle cx="58" cy="25" r="5.5" fill="#06040a" />
      <circle cx="59.5" cy="23.5" r="1.8" fill="#fff" />
    </svg>
  );
}

export function Slider({
  label, value, min, max, step, onChange, format,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ width: 54, textAlign: "right" }}>{format ? format(value) : value}</span>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <button id={id} type="button" className="toggle" aria-pressed={value} onClick={() => onChange(!value)} aria-label={label} />
    </div>
  );
}

export function Seg<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="row">
      <span style={{ flex: 1, color: "var(--dim)" }}>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "red" }) {
  return (
    <div className="stat">
      <span className="dim">{label}</span>
      <span className={tone === "ok" ? "ok" : tone === "red" ? "red" : ""}>{value}</span>
    </div>
  );
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function pad(n: number, w = 6): string {
  return String(Math.max(0, Math.floor(n))).padStart(w, "0");
}
