export interface RadarGhost {
  x: number;
  y: number;
  frightened: boolean;
  eaten: boolean;
}
export interface RadarData {
  W: number;
  H: number;
  grid: string[];
  playerCell: [number, number];
  playerDir: [number, number];
  ghosts: RadarGhost[];
  remaining: ReadonlySet<string>;
  ping: number; // 0..1 (1 = pulso recién emitido)
  time: number;
}

const SIZE = 320;

export class Radar {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = SIZE;
    canvas.height = SIZE;
    this.ctx = canvas.getContext("2d")!;
  }

  draw(d: RadarData): void {
    const ctx = this.ctx;
    const s = SIZE;
    const cell = s / Math.max(d.W, d.H);
    const ox = (s - d.W * cell) / 2;
    const oy = (s - d.H * cell) / 2;

    // fondo
    ctx.fillStyle = "#02120a";
    ctx.fillRect(0, 0, s, s);

    // celdas del laberinto
    for (let y = 0; y < d.H; y++) {
      for (let x = 0; x < d.W; x++) {
        const ch = d.grid[y][x];
        const px = ox + x * cell;
        const py = oy + y * cell;
        if (ch === "#") {
          ctx.fillStyle = "#0a2a1a";
          ctx.fillRect(px, py, cell, cell);
        } else {
          ctx.fillStyle = "#06180f";
          ctx.fillRect(px, py, cell, cell);
        }
      }
    }

    // nodos restantes
    ctx.fillStyle = "#ffbf40";
    for (const key of d.remaining) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillRect(ox + x * cell + cell * 0.35, oy + y * cell + cell * 0.35, cell * 0.3, cell * 0.3);
    }

    // barrido sonar (linea giratoria con estela)
    const cx = s / 2, cy = s / 2;
    const ang = d.time * 1.6;
    for (let i = 0; i < 10; i++) {
      const a = ang - i * 0.06;
      ctx.strokeStyle = `rgba(80,255,160,${0.18 - i * 0.016})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      ctx.stroke();
    }

    // pulso expansivo
    if (d.ping > 0) {
      const r = (1 - d.ping) * s * 0.55;
      ctx.strokeStyle = `rgba(120,255,180,${0.7 * d.ping})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // entidades
    for (const g of d.ghosts) {
      const px = ox + (g.x + 0.5) * cell;
      const py = oy + (g.y + 0.5) * cell;
      ctx.fillStyle = g.eaten ? "#445544" : g.frightened ? "#4a6cff" : "#ff3b30";
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#eafff0";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // jugador (flecha)
    const ppx = ox + (d.playerCell[0] + 0.5) * cell;
    const ppy = oy + (d.playerCell[1] + 0.5) * cell;
    const [dx, dy] = d.playerDir;
    ctx.save();
    ctx.translate(ppx, ppy);
    ctx.rotate(Math.atan2(dx, dy));
    ctx.fillStyle = "#eafff0";
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.45);
    ctx.lineTo(cell * 0.32, cell * 0.32);
    ctx.lineTo(-cell * 0.32, cell * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // marco + scanlines + viñeta (CRT verde)
    ctx.strokeStyle = "#1f5a3a";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1.5);

    const grad = ctx.createRadialGradient(cx, cy, s * 0.2, cx, cy, s * 0.72);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // tinte verde
    ctx.fillStyle = "rgba(40,255,140,0.05)";
    ctx.fillRect(0, 0, s, s);

    // texto
    ctx.fillStyle = "#7dffb0";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("RADAR TÁCTICO // NIVEL 0", 8, 14);
    ctx.textAlign = "right";
    ctx.fillText("RETICULA BLOQUEADA", s - 8, 14);
    ctx.textAlign = "left";
    ctx.fillStyle = "#3a8a5a";
    ctx.fillText("MANTÉN ESPACIO PARA SOSTENER", 8, s - 8);
  }
}
