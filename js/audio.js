/**
 * Layered music + reactive SFX.
 * Bed loops under percussion / bass / drive that fade in with distance & speed.
 * Cop tension opens the filter and rides a sting bed. Mute still kills the master.
 */
const START_SPEED = 7.15;
const MAX_SPEED = 24.5;

const FILES = {
  coin: 'assets/audio/coin.wav',
  jump: 'assets/audio/jump.wav',
  land: 'assets/audio/land.wav',
  crash: 'assets/audio/crash.wav',
  magnet: 'assets/audio/power_magnet.wav',
  shield: 'assets/audio/power_shield.wav',
  step: 'assets/audio/step.wav',
  music: 'assets/audio/music.wav',
  perc: 'assets/audio/music_perc.wav',
  bass: 'assets/audio/music_bass.wav',
  drive: 'assets/audio/music_drive.wav',
  slide: 'assets/audio/slide.wav',
  ramp: 'assets/audio/ramp.wav',
  whoosh: 'assets/audio/whoosh.wav',
  catch: 'assets/audio/catch.wav',
  riser: 'assets/audio/riser.wav',
  register: 'assets/audio/register.wav',
  vault: 'assets/audio/vault.wav',
  stumble: 'assets/audio/stumble.wav',
};

const MILESTONE = 500;
const COMBO_WINDOW = 0.42;

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.comp = null;
    this.muted = localStorage.getItem('pumprun_mute') === '1';
    this.started = false;
    this._stepT = 0;
    this._buffers = {};
    this._ready = null;
    this._layers = null;
    this._tension = null;
    this._inRun = false;
    this._playing = false;
    this._combo = 0;
    this._lastCoin = 0;
    this._lastSpeed = START_SPEED;
    this._milestone = -1;
    this._speedBand = -1;
    this._lastWhoosh = 0;
    this._copStepT = 0;
    this._want = { perc: 0, bass: 0, drive: 0, bed: 0.55, cut: 3600, tense: 0, music: 0.38 };
  }

  unlock() {
    if (this.started) {
      this.ctx?.resume();
      return this._ready;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.16;
    this.sfxGain.gain.value = 0.74;
    this.musicGain.gain.value = 0.38;
    this.master.gain.value = this.muted ? 0 : 0.72;
    this.sfxGain.connect(this.comp);
    this.musicGain.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.started = true;
    this._ready = this._loadAll().then(() => {
      this.ctx.resume();
      this._startMusic();
    });
    return this._ready;
  }

  async _loadAll() {
    await Promise.all(
      Object.entries(FILES).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${res.status} ${url}`);
          const raw = await res.arrayBuffer();
          this._buffers[key] = await this.ctx.decodeAudioData(raw.slice(0));
        } catch (err) {
          console.warn('[audio] missing', key, url, err);
        }
      }),
    );
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('pumprun_mute', this.muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx?.currentTime || 0, 0.03);
    return this.muted;
  }

  beginRun() {
    this._inRun = true;
    this._playing = true;
    this._combo = 0;
    this._lastCoin = 0;
    this._lastSpeed = START_SPEED;
    this._milestone = -1;
    this._speedBand = -1;
    this._stepT = 0;
    this._want.music = 0.40;
  }

  setPlaying(on) {
    this._playing = !!on;
  }

  endRun() {
    this._inRun = false;
    this._playing = false;
    this._combo = 0;
  }

  _play(name, dest, { gain = 1, rate = 1, pan = 0 } = {}) {
    if (!this.ctx || !this._buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._buffers[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const bus = dest || this.sfxGain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-0.85, Math.min(0.85, pan));
      g.connect(p);
      p.connect(bus);
    } else {
      g.connect(bus);
    }
    src.start();
    return src;
  }

  jump() {
    this._play('jump', this.sfxGain, { gain: 0.62, rate: 0.97 + Math.random() * 0.07 });
  }

  slide() {
    this._play('slide', this.sfxGain, { gain: 0.58, rate: 0.96 + Math.random() * 0.08 });
  }

  land() {
    this._play('land', this.sfxGain, { gain: 0.52, rate: 0.94 + Math.random() * 0.1 });
  }

  ramp() {
    this._play('ramp', this.sfxGain, { gain: 0.6, rate: 0.97 + Math.random() * 0.06 });
  }

  nearMiss() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastWhoosh < 0.48) return;
    this._lastWhoosh = now;
    this._play('whoosh', this.sfxGain, { gain: 0.55, rate: 0.92 + Math.random() * 0.14 });
  }

  coin() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastCoin < COMBO_WINDOW) this._combo = Math.min(this._combo + 1, 10);
    else this._combo = 0;
    this._lastCoin = now;
    // Rising sparkle on a streak — soft coin, not a beep.
    const rate = 0.96 + this._combo * 0.034 + Math.random() * 0.018;
    this._play('coin', this.sfxGain, { gain: 0.34, rate });
  }

  /** Cha-ching every 100 bags, vault whoosh every 10k. `prev` is count before this grab. */
  cashMilestone(prev, next) {
    if (!this.ctx || next <= prev) return;
    if (Math.floor(prev / 10000) < Math.floor(next / 10000)) {
      this._play('vault', this.sfxGain, { gain: 0.62 });
      return;
    }
    if (Math.floor(prev / 100) < Math.floor(next / 100)) {
      this._play('register', this.sfxGain, { gain: 0.56 });
    }
  }

  power(kind) {
    if (kind === 'magnet') this._play('magnet', this.sfxGain, { gain: 0.6 });
    else this._play('shield', this.sfxGain, { gain: 0.6 });
    // short stinger on top of the pickup chime
    this._play('riser', this.sfxGain, { gain: 0.28, rate: 1.35 });
    this._play('coin', this.sfxGain, { gain: 0.22, rate: 1.55 });
  }

  crash() {
    this._play('crash', this.sfxGain, { gain: 0.7 });
    this._play('catch', this.sfxGain, { gain: 0.82 });
    this._duckMusic(0.05);
  }

  catchSting() {
    this._play('catch', this.sfxGain, { gain: 0.88 });
    this._play('crash', this.sfxGain, { gain: 0.45, rate: 0.85 });
    this._duckMusic(0.04);
  }

  riser() {
    this._play('riser', this.sfxGain, { gain: 0.42, rate: 0.98 + Math.random() * 0.05 });
  }

  footsteps(dt, running, speed = START_SPEED) {
    if (!this.ctx || !running) return;
    this._stepT -= dt;
    if (this._stepT > 0) return;
    const t = (speed - START_SPEED) / Math.max(0.01, MAX_SPEED - START_SPEED);
    this._stepT = 0.32 - t * 0.1;
    this._play('step', this.sfxGain, { gain: 0.24, rate: 0.9 + Math.random() * 0.18 + t * 0.08 });
  }

  /** Cop run loop — louder as he closes the gap. */
  copSteps(dt, cop, running = true) {
    if (!this.ctx || !running || !cop || !cop.engaged || cop.grabbing || cop.stumble > 0) return;
    const gap = Math.max(0.6, cop.chaseGap || cop.gap || 3.4);
    const prox = 1 - Math.max(0, Math.min(1, (gap - 2.05) / 3.2));
    this._copStepT -= dt;
    if (this._copStepT > 0) return;
    this._copStepT = 0.3 - prox * 0.08;
    const pan = Math.max(-0.7, Math.min(0.7, (cop.root?.position.x || 0) * 0.28));
    this._play('step', this.sfxGain, {
      gain: 0.1 + prox * 0.4,
      rate: 0.74 + Math.random() * 0.08,
      pan,
    });
  }

  copStumble() {
    this._play('stumble', this.sfxGain, { gain: 0.7, rate: 0.92 + Math.random() * 0.08 });
    this._play('crash', this.sfxGain, { gain: 0.22, rate: 1.25 });
  }

  _duckMusic(to = 0.04) {
    if (!this.musicGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(to, t, 0.05);
    this._want.music = to;
  }

  update(state = {}) {
    if (!this.ctx || !this._layers) return;
    const playing = state.playing ?? this._playing;
    const dist = Math.max(0, state.distance || 0);
    const speed = state.speed || START_SPEED;
    const tension = Math.max(0, Math.min(1, state.tension || 0));
    const close = !!state.close || tension > 0.52;

    const speedT = (speed - START_SPEED) / Math.max(0.01, MAX_SPEED - START_SPEED);
    const distT = Math.min(1, dist / 1600);
    const intensity = playing && this._inRun ? distT * 0.62 + speedT * 0.38 : 0;
    const mile = playing && this._inRun ? Math.floor(dist / MILESTONE) : 0;

    if (playing && this._inRun) this._milestone = mile;

    const band = Math.floor((speed - START_SPEED) / 2.4);
    if (playing && this._inRun && band > this._speedBand && this._speedBand >= 0) this.riser();
    if (playing && this._inRun) this._speedBand = band;
    this._lastSpeed = speed;

    let perc = Math.max(0, intensity - 0.04) * 0.18;
    let bass = Math.max(0, intensity - 0.12) * 0.16;
    let drive = Math.max(0, intensity - 0.32) * 0.14;
    if (mile >= 1) perc = Math.max(perc, 0.09);
    if (mile >= 2) bass = Math.max(bass, 0.09);
    if (mile >= 3) drive = Math.max(drive, 0.08);
    if (close) {
      perc = Math.min(0.2, perc + 0.06);
      drive = Math.min(0.16, drive + 0.055);
    }
    if (!playing || !this._inRun) {
      perc = 0;
      bass = 0;
      drive = 0;
    }

    const bed = playing && this._inRun ? 0.62 : 0.42;
    const cut = close ? 7200 : playing && this._inRun ? 4800 + intensity * 1800 : 2800;
    const tense = close && playing ? 0.05 + tension * 0.05 : 0;
    const ducked = this._inRun && this._want.music < 0.12;
    const musicOut = ducked ? this._want.music : playing && this._inRun ? 0.4 : 0.28;

    this._want.perc = perc;
    this._want.bass = bass;
    this._want.drive = drive;
    this._want.bed = bed;
    this._want.cut = cut;
    this._want.tense = tense;
    this._want.music = musicOut;

    const t = this.ctx.currentTime;
    const tau = 0.18;
    this._layers.bed.gain.setTargetAtTime(bed, t, tau);
    this._layers.perc.gain.setTargetAtTime(perc, t, tau);
    this._layers.bass.gain.setTargetAtTime(bass, t, tau);
    this._layers.drive.gain.setTargetAtTime(drive, t, tau);
    this._layers.filter.frequency.setTargetAtTime(cut, t, 0.22);
    if (this._tension) this._tension.gain.gain.setTargetAtTime(tense, t, 0.12);
    this.musicGain.gain.setTargetAtTime(musicOut, t, 0.12);
  }

  _startMusic() {
    if (!this.ctx || this._layers || !this._buffers.music) return;
    const t0 = this.ctx.currentTime + 0.03;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;
    filter.Q.value = 0.65;

    const bedGain = this.ctx.createGain();
    bedGain.gain.value = 0.45;
    const percGain = this.ctx.createGain();
    percGain.gain.value = 0;
    const bassGain = this.ctx.createGain();
    bassGain.gain.value = 0;
    const driveGain = this.ctx.createGain();
    driveGain.gain.value = 0;

    const startLoop = (name, dest) => {
      const buf = this._buffers[name];
      if (!buf) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dest);
      src.start(t0);
      return src;
    };

    startLoop('music', filter);
    filter.connect(bedGain);
    bedGain.connect(this.musicGain);
    startLoop('perc', percGain);
    percGain.connect(this.musicGain);
    startLoop('bass', bassGain);
    bassGain.connect(this.musicGain);
    startLoop('drive', driveGain);
    driveGain.connect(this.musicGain);

    this._layers = {
      filter,
      bed: bedGain,
      perc: percGain,
      bass: bassGain,
      drive: driveGain,
    };

    // high tension bed — noise through a bandpass, always running, gain 0 until close
    const n = this.ctx.createBuffer(1, 22050, this.ctx.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = n;
    noise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.1;
    const tg = this.ctx.createGain();
    tg.gain.value = 0;
    noise.connect(bp);
    bp.connect(tg);
    tg.connect(this.musicGain);
    noise.start(t0);
    this._tension = { src: noise, filter: bp, gain: tg };

    console.log('[audio] music bed looping (synthwave, 100bpm / 19.2s) under SFX');
  }
}

