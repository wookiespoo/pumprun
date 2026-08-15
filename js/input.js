export class Input {
  constructor(target = window) {
    this.enabled = true;
    this._down = new Set();
    this._pressed = new Set();
    this.swipe = { lane: 0, jump: false, slide: false };
    this._touch = null;
    this._tap = false;

    this._onDown = (e) => {
      if (!this.enabled) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this._down.has(e.code)) this._pressed.add(e.code);
      this._down.add(e.code);
    };
    this._onUp = (e) => this._down.delete(e.code);

    this._onStart = (e) => {
      const t = e.changedTouches[0];
      this._touch = { x: t.clientX, y: t.clientY };
    };
    this._onEnd = (e) => {
      if (!this._touch) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this._touch.x;
      const dy = t.clientY - this._touch.y;
      this._touch = null;
      if (Math.hypot(dx, dy) < 28) {
        this._tap = true;
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) this.swipe.lane += dx < 0 ? -1 : 1;
      else if (dy < 0) this.swipe.jump = true;
      else this.swipe.slide = true;
    };
    this._onClick = () => {
      this._tap = true;
    };

    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('touchstart', this._onStart, { passive: true });
    target.addEventListener('touchend', this._onEnd, { passive: true });
    target.addEventListener('pointerdown', this._onClick);
    this._target = target;
  }

  any() {
    return this._pressed.size > 0 || this._tap;
  }

  laneDelta() {
    let d = this.swipe.lane;
    this.swipe.lane = 0;
    if (this._pressed.has('KeyA') || this._pressed.has('ArrowLeft')) d -= 1;
    if (this._pressed.has('KeyD') || this._pressed.has('ArrowRight')) d += 1;
    return d;
  }

  tapLane(dir) {
    this.swipe.lane += dir;
  }

  tapJump() {
    this.swipe.jump = true;
  }

  tapSlide() {
    this.swipe.slide = true;
  }

  jump() {
    const t = this.swipe.jump;
    this.swipe.jump = false;
    return t || this._pressed.has('Space') || this._pressed.has('ArrowUp') || this._pressed.has('KeyW');
  }

  slide() {
    const t = this.swipe.slide;
    this.swipe.slide = false;
    return t || this._pressed.has('ArrowDown') || this._pressed.has('KeyS');
  }

  endFrame() {
    this._pressed.clear();
    this._tap = false;
  }
}
