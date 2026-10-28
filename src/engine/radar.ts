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
    const cell = Math.floor(s / Math.max(maze.W, maze.H));
    const ox = (s - maze.W * cell) / 2, oy = (s - maze.H * cell) / 2;
    if (this.pingAnim > 0) this.pingAnim = Math.max(0, this.pingAnim - dt * 0.9);

    ctx.fillStyle = "#020e08";
    ctx.fillRect(0, 0, s, s);

    // muros y pasillos
    for (let y = 0; y < maze.H; y++) for (let x = 0; x < maze.W; x++) {
      const ch = maze.rows[y][x];
      const px = ox + x * cell, py = oy + y * cell;
      if (ch === "#") { ctx.fillStyle = "#0c3322"; ctx.fillRect(px, py, cell, cell); }
      else { ctx.fillStyle = "#04170e"; ctx.fillRect(px, py, cell, cell); }
    }
    // puntos pendientes
    ctx.fillStyle = "#ffcf5a";
    for (let y = 0; y < maze.H; y++) for (let x = 0; x < maze.W; x++) {
      if (!sim.dotGrid[y * maze.W + x]) continue;
      ctx.fillRect(ox + x * cell + cell * 0.38, oy + y * cell + cell * 0.38, cell * 0.24, cell * 0.24);
    }
    // pellets
    for (const p of sim.pellets) {
      if (p.eaten) continue;
      ctx.fillStyle = "#ffb02e";
      ctx.beginPath();
      ctx.arc(ox + (p.cell[0] + 0.5) * cell, oy + (p.cell[1] + 0.5) * cell, cell * (0.34 + 0.08 * Math.sin(time * 6)), 0, Math.PI * 2);
      ctx.fill();
    }
    // salida
    const ex = ox + (maze.exit[0] + 0.5) * cell, ey = oy + (maze.exit[1] + 0.5) * cell;
    ctx.strokeStyle = sim.exitUnlocked ? "#39ff6a" : "#7a2a2a";
    ctx.lineWidth = 2;
    ctx.strokeRect(ex - cell * 0.5, ey - cell * 0.5, cell, cell);

    // pulso
    const [pcx, pcy] = [sim.player.x, sim.player.z];
    const ppx = ox + ((pcx / (maze.worldWidth)) + 0.5) * maze.W * cell;
    const ppy = oy + ((pcy / (maze.worldDepth)) + 0.5) * maze.H * cell;
    if (this.pingAnim > 0) {
      ctx.strokeStyle = `rgba(120,255,180,${0.7 * this.pingAnim})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ppx, ppy, (1 - this.pingAnim) * s * 0.7, 0, Math.PI * 2); ctx.stroke();
    }

    // fantasmas
    for (const g of sim.ghosts) {
      const gx = ox + ((g.x / maze.worldWidth) + 0.5) * maze.W * cell;
      const gy = oy + ((g.z / maze.worldDepth) + 0.5) * maze.H * cell;
      const col = FACE_COLORS[g.kind as FaceKind].css;
      ctx.save();
      ctx.translate(gx, gy);
      if (g.mode === "eaten") { ctx.fillStyle = "#ddd"; ctx.fillRect(-cell * 0.3, -cell * 0.1, cell * 0.6, cell * 0.2); }
      else {
        ctx.fillStyle = g.mode === "frightened" ? "#4a6cff" : g.mode === "dormant" ? "#665" : col;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.42, Math.PI, 0);
        ctx.lineTo(cell * 0.42, cell * 0.4);
        for (let i = 3; i >= 0; i--) ctx.lineTo(-cell * 0.42 + (cell * 0.84 * i) / 3, cell * (i % 2 ? 0.28 : 0.42));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // jugador: Pac-Man con cono de vision. yaw 0 mira hacia arriba (-Z).
    const yaw = sim.player.yaw;
    const ang = -yaw - Math.PI / 2; // angulo de lienzo (0 = derecha)
    ctx.save();
    ctx.translate(ppx, ppy);
    ctx.fillStyle = "rgba(255,255,160,0.12)";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, cell * 7, ang - 0.65, ang + 0.65); ctx.closePath(); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = "#ffe21a";
    const mo = 0.25 + 0.2 * Math.abs(Math.sin(time * 8));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, cell * 0.55, mo, Math.PI * 2 - mo); ctx.closePath(); ctx.fill();
    ctx.restore();

    // barrido y efectos CRT
    const sweep = time * 1.4;
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(80,255,160,${0.16 - i * 0.015})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.lineTo(s / 2 + Math.cos(sweep - i * 0.06) * s, s / 2 + Math.sin(sweep - i * 0.06) * s); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1.5);
    const grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#1f6a46"; ctx.lineWidth = 3; ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.fillStyle = "#7dffb0"; ctx.font = "11px 'Courier New', monospace"; ctx.textAlign = "left";
    ctx.fillText("ECOLOCALIZACIÓN", 10, 16);
    ctx.textAlign = "right";
    ctx.fillText(`NODOS ${sim.remainingDots}`, s - 10, 16);
  }
}
