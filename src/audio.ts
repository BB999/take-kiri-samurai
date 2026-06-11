/** WebAudioで効果音を合成する（外部アセット不要） */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** ユーザー操作起点（XRセッション開始時など）で呼ぶ */
  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private noise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  /** 刀の風切り音 */
  whoosh(intensity: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.noise();
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.exponentialRampToValueAtTime(900 + 1100 * intensity, t + 0.1);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.27);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + 0.2 * intensity, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.32);
  }

  /** 竹を斬る音（スパッ＋カンッ） */
  slice() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;

    // スパッ（高域ノイズの鋭いバースト）
    const s1 = this.noise();
    if (s1) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2600;
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.5, t);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      s1.connect(hp).connect(g1).connect(this.master);
      s1.start(t);
      s1.stop(t + 0.1);
    }
    // 竹の繊維が裂ける中域
    const s2 = this.noise();
    if (s2) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 950;
      bp.Q.value = 2.5;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.3, t + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      s2.connect(bp).connect(g2).connect(this.master);
      s2.start(t + 0.01);
      s2.stop(t + 0.18);
    }
    // 竹の胴鳴り（カンッ）
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const g3 = this.ctx.createGain();
    g3.gain.setValueAtTime(0.28, t);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g3).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** 竹が地面に落ちる音（コンッ） */
  clack() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const s = this.noise();
    if (s) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 620;
      bp.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      s.connect(bp).connect(g).connect(this.master);
      s.start(t);
      s.stop(t + 0.1);
    }
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g2).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}
