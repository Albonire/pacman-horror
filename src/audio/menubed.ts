// Ambiente del menu: bucle de 32 s sin costura (grabacion de ElevenLabs, ver scripts/prepare_assets.py).
// Suena en el menu y la ficha de nivel, entra con un fundido lento y sale al empezar la partida para dejar
// el sitio al ambiente procedural del nivel, que se oye con el mismo tema en cuanto se cierra el fundido.

import type { Synth } from "./synth";

/** Ganancia del bucle en el bus de musica. La grabacion es muy tranquila (unos -27 dBFS de RMS). */
const BED_GAIN = 1.6;

export class MenuBed {
  private gain: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private on = false;
  private fade = 3;

  constructor(private S: Synth, on: boolean) {
    this.on = on;
    this.gain = S.ctx.createGain();
    this.gain.gain.value = 0;
    S.out(this.gain, S.music, 0.1);
    S.whenSample("menuLoop", (buf) => this.start(buf));
  }

  private start(buf: AudioBuffer): void {
    if (this.src) return;
    const src = this.S.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.gain);
    src.start();
    this.src = src;
    this.apply();
  }

  /** `fade` en segundos: lento al entrar al menu, mas rapido al salir de el. */
  set(on: boolean, fade = on ? 3.5 : 1.8): void {
    this.on = on;
    this.fade = fade;
    this.apply();
  }

  private apply(): void {
    const t = this.S.now;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.on ? BED_GAIN : 0, t, Math.max(0.05, this.fade / 3));
  }

  dispose(): void {
    try { this.src?.stop(); } catch { /* ya parada */ }
    try { this.gain.disconnect(); } catch { /* ya desconectada */ }
    this.src = null;
  }
}
