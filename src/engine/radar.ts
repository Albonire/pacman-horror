// Sonar tactico de mano: mapa del laberinto con puntos, entidades y el cono de vision del jugador.

import { FACE_COLORS, type FaceKind } from "../gfx/faces";
import type { Simulation } from "../sim/simulation";

const SIZE = 340;

export class Radar {
  private ctx: CanvasRenderingContext2D;
  private pingAnim = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = SIZE;
    canvas.height = SIZE;
    this.ctx = canvas.getContext("2d")!;
  }

  ping(): void { this.pingAnim = 1; }

  draw(sim: Simulation, time: number, dt: number): void {
    const ctx = this.ctx;
    const { maze } = sim;
    const s = SIZE;
    const topBar = 24;
    const pad = 14;
    const availW = s - pad * 2;
    const availH = s - topBar - pad;
    const cell = Math.max(4, Math.floor(Math.min(availW / maze.W, availH / maze.H)));
    const mapW = maze.W * cell;
    const mapH = maze.H * cell;
    const ox = Math.floor((s - mapW) / 2);
    const oy = topBar + Math.floor((availH - mapH) / 2);
    const cx = ox + mapW / 2;
    const cy = oy + mapH / 2;
    if (this.pingAnim > 0) this.pingAnim = Math.max(0, this.pingAnim - dt * 0.9);

    ctx.fillStyle = "#020c07";
    ctx.fillRect(0, 0, s, s);

    // muros y pasillos (las 4 esquinas quedan integramente dentro del area util)
    for (let y = 0; y < maze.H; y++) for (let x = 0; x < maze.W; x++) {
      const ch = maze.rows[y][x];
      const px = ox + x * cell, py = oy + y * cell;
      if (ch === "#") { ctx.fillStyle = "#0e3b27"; ctx.fillRect(px, py, cell, cell); }
      else { ctx.fillStyle = "#04180f"; ctx.fillRect(px, py, cell, cell); }
    }
    // marco tactico sutil alrededor del mapa completo
    ctx.strokeStyle = "rgba(45, 165, 108, 0.38)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - 1.5, oy - 1.5, mapW + 3, mapH + 3);

    // puntos pendientes
    ctx.fillStyle = "#ffcf5a";
    for (let y = 0; y < maze.H; y++) for (let x = 0; x < maze.W; x++) {
      if (!sim.dotGrid[y * maze.W + x]) continue;
      ctx.fillRect(ox + x * cell + cell * 0.36, oy + y * cell + cell * 0.36, Math.max(1.5, cell * 0.28), Math.max(1.5, cell * 0.28));
    }
    // pellets (orbes de poder en las esquinas)
    for (const p of sim.pellets) {
      if (p.eaten) continue;
      ctx.fillStyle = "#ffb838";
      ctx.beginPath();
      ctx.arc(ox + (p.cell[0] + 0.5) * cell, oy + (p.cell[1] + 0.5) * cell, cell * (0.38 + 0.08 * Math.sin(time * 6)), 0, Math.PI * 2);
      ctx.fill();
    }
    // salida
    const ex = ox + (maze.exit[0] + 0.5) * cell, ey = oy + (maze.exit[1] + 0.5) * cell;
    ctx.strokeStyle = sim.exitUnlocked ? "#39ff6a" : "#963232";
    ctx.lineWidth = 2;
    ctx.strokeRect(ex - cell * 0.5, ey - cell * 0.5, cell, cell);

    // pulso
    const [pcx, pcy] = [sim.player.x, sim.player.z];
    const ppx = ox + ((pcx / maze.worldWidth) + 0.5) * mapW;
    const ppy = oy + ((pcy / maze.worldDepth) + 0.5) * mapH;
    if (this.pingAnim > 0) {
      ctx.strokeStyle = `rgba(120,255,180,${0.7 * this.pingAnim})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ppx, ppy, (1 - this.pingAnim) * s * 0.65, 0, Math.PI * 2); ctx.stroke();
    }

    // fantasmas
    for (const g of sim.ghosts) {
      const gx = ox + ((g.x / maze.worldWidth) + 0.5) * mapW;
      const gy = oy + ((g.z / maze.worldDepth) + 0.5) * mapH;
      const col = FACE_COLORS[g.kind as FaceKind].css;
      ctx.save();
      ctx.translate(gx, gy);
      if (g.mode === "eaten") { ctx.fillStyle = "#ddd"; ctx.fillRect(-cell * 0.3, -cell * 0.1, cell * 0.6, cell * 0.2); }
      else {
        ctx.fillStyle = g.mode === "frightened" ? "#4a6cff" : g.mode === "dormant" ? "#665" : col;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.44, Math.PI, 0);
        ctx.lineTo(cell * 0.44, cell * 0.42);
        for (let i = 3; i >= 0; i--) ctx.lineTo(-cell * 0.44 + (cell * 0.88 * i) / 3, cell * (i % 2 ? 0.28 : 0.44));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // jugador: Pac-Man con cono de vision. yaw 0 mira hacia arriba (-Z).
    const yaw = sim.player.viewYaw;
    const ang = -yaw - Math.PI / 2; // angulo de lienzo (0 = derecha)
    ctx.save();
    ctx.translate(ppx, ppy);
    ctx.fillStyle = "rgba(255,255,160,0.13)";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, cell * 6.5, ang - 0.65, ang + 0.65); ctx.closePath(); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = "#ffe21a";
    const mo = 0.25 + 0.2 * Math.abs(Math.sin(time * 8));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, cell * 0.58, mo, Math.PI * 2 - mo); ctx.closePath(); ctx.fill();
    ctx.restore();

    // barrido y efectos CRT centrados en el mapa
    const sweep = time * 1.4;
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(80,255,160,${0.14 - i * 0.013})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep - i * 0.06) * s * 0.72, cy + Math.sin(sweep - i * 0.06) * s * 0.72); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1.5);

    // cabecera limpia sin pisar las esquinas superiores del laberinto
    ctx.fillStyle = "#82ffba";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText("SONAR", ox, 17);
    ctx.textAlign = "right";
    ctx.fillText(`NODOS ${sim.remainingDots}`, ox + mapW, 17);
  }
}
