import { OFFICIAL_CA, PLAY_URL, PUMPFUN_URL, SOCIAL_TG, SOCIAL_X } from './config.js?v=81';

const RUGGED = [
  'CAUGHT LACKING. WALLET DRAINED.',
  'YOU GOT RUGGED, BRO.',
  '5-0 ATE THE BAG.',
  'PAPER HANDS IN 4K.',
  'SHOULD HAVE JUMPED. NOW YOU ARE EXIT LIQUIDITY.',
];

export class UI {
  constructor() {
    this.els = {
      boot: document.getElementById('screen-boot'),
      select: document.getElementById('screen-select'),
      hud: document.getElementById('hud'),
      pause: document.getElementById('screen-pause'),
      catch: document.getElementById('screen-catch'),
      catchName: document.getElementById('catch-name'),
      rugged: document.getElementById('screen-rugged'),
      grid: document.getElementById('roster-grid'),
      wantedRow: document.getElementById('wanted-row'),
      bank: document.getElementById('bank-line'),
      bootMsg: document.getElementById('boot-msg'),
      dist: document.getElementById('hud-dist'),
      sol: document.getElementById('hud-sol'),
      best: document.getElementById('hud-best'),
      cop: document.getElementById('hud-cop'),
      powers: document.getElementById('power-hud'),
      announcer: document.getElementById('announcer'),
      ruggedLine: document.getElementById('rugged-line'),
      ruggedWho: document.getElementById('rugged-who'),
      ruggedStats: document.getElementById('rugged-stats'),
      newBest: document.getElementById('new-best'),
      play: document.getElementById('btn-play'),
      fps: document.getElementById('fps'),
      mute: document.getElementById('btn-mute'),
      pauseMute: document.getElementById('btn-pause-mute'),
      splash: document.getElementById('screen-splash'),
      splashBtn: document.getElementById('btn-splash'),
      selectLoad: document.getElementById('select-load'),
      wantedHud: document.getElementById('hud-wanted'),
      nameOverlay: document.getElementById('name-overlay'),
      nameForm: document.getElementById('name-form'),
      nameInput: document.getElementById('name-input'),
      nameErr: document.getElementById('name-err'),
      boardOverlay: document.getElementById('board-overlay'),
      boardList: document.getElementById('board-list'),
      boardYou: document.getElementById('board-you'),
      boardStatus: document.getElementById('board-status'),
      ruggedRank: document.getElementById('rugged-rank'),
      btnName: document.getElementById('btn-name'),
    };
    this._t = 0;
    this._fpsA = 0;
    this._fpsN = 0;
    this.paintOfficial();
  }

  paintOfficial() {
    const live = !!(OFFICIAL_CA && OFFICIAL_CA.trim());
    const addr = live ? OFFICIAL_CA.trim() : 'LAUNCHING ON PUMP.FUN';
    const label = live ? 'OFFICIAL CA' : 'CA: COMING SOON';
    const copyVal = live ? OFFICIAL_CA.trim() : '';
    const links = [
      PUMPFUN_URL ? `<a href="${esc(PUMPFUN_URL)}" target="_blank" rel="noopener">BUY ON PUMP.FUN</a>` : '',
      `<a href="${esc(xShareUrl())}" target="_blank" rel="noopener">SHARE ON X</a>`,
      SOCIAL_X ? `<a href="${esc(SOCIAL_X)}" target="_blank" rel="noopener">X</a>` : '',
      SOCIAL_TG ? `<a href="${esc(SOCIAL_TG)}" target="_blank" rel="noopener">TELEGRAM</a>` : '',
    ].filter(Boolean).join('');
    const html = `<div class="ca-line">
        <span class="ca-lab">${label}:</span>
        <span class="ca-addr">${esc(addr)}</span>
        <button type="button" class="ca-copy" ${live ? '' : 'disabled'}>COPY</button>
      </div>
      <div class="ca-warn">Only trust this contract address. Beware of fakes / copycats.</div>
      ${links ? `<div class="ca-links">${links}</div>` : ''}`;
    for (const box of document.querySelectorAll('[data-ca]')) {
      box.innerHTML = html;
      const btn = box.querySelector('.ca-copy');
      if (!btn || !live) continue;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(copyVal);
          btn.textContent = 'COPIED';
          btn.classList.add('ok');
          setTimeout(() => {
            btn.textContent = 'COPY';
            btn.classList.remove('ok');
          }, 1400);
        } catch {
          btn.textContent = 'FAIL';
        }
      });
    }
  }

  show(name) {
    for (const [k, el] of Object.entries(this.els)) {
      if (!el || !el.classList?.contains('screen')) continue;
      el.classList.toggle('visible', k === name);
    }
    this.els.hud.classList.toggle('visible', name === 'hud');
  }

  boot(msg) {
    if (this.els.splash?.classList.contains('visible')) {
      if (this.els.splashBtn) this.els.splashBtn.textContent = msg || 'LOADING…';
      return;
    }
    this.show('boot');
    if (msg) this.els.bootMsg.textContent = msg;
  }

  splashReady() {
    if (!this.els.splashBtn) return;
    this.els.splashBtn.disabled = false;
    this.els.splashBtn.textContent = 'TAP TO START';
  }

  hideSplash() {
    this.els.splash?.classList.remove('visible');
  }

  selectLoading(on, msg = 'LOADING…') {
    if (!this.els.selectLoad) return;
    this.els.selectLoad.textContent = msg;
    this.els.selectLoad.classList.toggle('show', !!on);
  }

  buildWanted(cops) {
    if (!this.els.wantedRow) return;
    this.els.wantedRow.innerHTML = cops
      .map(
        (c) => `<article class="wanted">
        <div class="w-stamp">MOST FEARED</div>
        <div class="w-name">${esc(c.name)}</div>
        <div class="w-cap">${esc(c.caption || '')}</div>
        <div class="w-from">MAY CHASE THIS RUN</div>
      </article>`,
      )
      .join('');
  }

  buildRoster(chars, { selected, unlocked, cost, costOf, onPick }) {
    this.els.grid.innerHTML = '';
    for (const c of chars) {
      const lock = !unlocked.has(c.id);
      const price = costOf ? costOf(c.id) : cost;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'char-card' + (c.id === selected ? ' selected' : '') + (lock ? ' locked' : '');
      b.dataset.id = c.id;
      b.innerHTML = `<div class="char-id">${esc(c.name)}</div>
        <div class="char-tag">${esc(c.tagline || '')}</div>
        ${lock ? `<div class="char-lock">LOCKED · $${price} BAGS</div>` : ''}`;
      b.addEventListener('click', () => onPick(c.id));
      this.els.grid.appendChild(b);
    }
  }

  mark(id) {
    for (const c of this.els.grid.querySelectorAll('.char-card')) {
      c.classList.toggle('selected', c.dataset.id === id);
    }
  }

  setBank(n) {
    if (this.els.bank) this.els.bank.textContent = `BANK $${Math.floor(n)} BAGS`;
  }

  setPlayLabel(text, hot = false) {
    if (!this.els.play) return;
    this.els.play.textContent = text;
    this.els.play.classList.toggle('btn-hot', hot);
    this.els.play.classList.toggle('btn-go', !hot);
  }

  hud({ distance, sol, best, powers, powerMax, chaser, chased, tension = 0 }) {
    if (this.els.dist) this.els.dist.innerHTML = `${Math.floor(distance)}<span>m</span>`;
    if (this.els.sol) this.els.sol.textContent = `$${Math.floor(sol)}`;
    if (this.els.best) this.els.best.textContent = `BEST ${Math.floor(best)}m`;
    if (this.els.cop) {
      this.els.cop.textContent = chased && chaser ? `CHASED BY ${chaser}` : '5-0 QUIET';
      this.els.cop.classList.toggle('hot', !!chased);
    }
    if (this.els.wantedHud) {
      let stars = 0;
      if (chased) stars = tension > 0.7 ? 5 : tension > 0.4 ? 4 : 3;
      this.els.wantedHud.dataset.stars = String(stars);
    }
    if (this.els.powers) {
      const card = (id, label, cls, ico) => {
        const t = powers?.[id] || 0;
        if (t <= 0) return '';
        const max = powerMax?.[id] || t;
        const pct = Math.max(0, Math.min(100, (t / Math.max(0.05, max)) * 100));
        const icoHtml = String(ico).includes('/')
          ? `<img class="power-ico-img" src="${ico}" alt="">`
          : `<span class="power-ico">${ico}</span>`;
        return `<div class="power-card ${cls}">
          <div class="power-head">${icoHtml}<span class="power-lab">${label}</span><span class="power-t">${t.toFixed(1)}s</span></div>
          <div class="power-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        </div>`;
      };
      this.els.powers.innerHTML = [
        card('shield', 'SHIELD', 'shield', 'assets/ui/shield_emblem.jpg'),
        card('magnet', 'MAGNET', 'magnet', '🧲'),
        card('double', '2× BAGS', 'double', '×2'),
      ].join('');
    }
  }

  setMuted(on) {
    if (this.els.mute) {
      this.els.mute.textContent = on ? 'MUTED' : 'SOUND';
      this.els.mute.classList.toggle('on', !on);
    }
    if (this.els.pauseMute) this.els.pauseMute.textContent = on ? 'SOUND ON' : 'MUTE';
  }

  bindTouch(input) {
    const pad = document.getElementById('touch-pad');
    if (!pad) return;
    const fire = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const a = btn.dataset.act;
      if (a === 'left') input.tapLane(-1);
      else if (a === 'right') input.tapLane(1);
      else if (a === 'jump') input.tapJump();
      else if (a === 'slide') input.tapSlide();
    };
    pad.addEventListener('pointerdown', fire);
    pad.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  say(text, hold = 2.6) {
    this.els.announcer.textContent = text;
    this.els.announcer.classList.add('show');
    this._t = hold;
  }

  beginCatch(name) {
    if (this.els.catchName) {
      this.els.catchName.innerHTML = `<span class="cop-name">${esc(name || 'THE 5-0')}</span><span class="caught-you">caught you.</span>`;
    }
    this.show('catch');
  }

  showName(existing = '') {
    if (!this.els.nameOverlay) return;
    this.els.nameOverlay.hidden = false;
    if (this.els.nameErr) this.els.nameErr.textContent = '';
    if (this.els.nameInput) {
      this.els.nameInput.value = existing || '';
      this.els.nameInput.focus();
      this.els.nameInput.select();
    }
  }

  hideName() {
    if (this.els.nameOverlay) this.els.nameOverlay.hidden = true;
  }

  nameError(msg) {
    if (this.els.nameErr) this.els.nameErr.textContent = msg || '';
  }

  setTagLabel(name) {
    if (this.els.btnName) this.els.btnName.textContent = name ? name.toUpperCase() : 'TAG';
  }

  hideBoard() {
    if (this.els.boardOverlay) this.els.boardOverlay.hidden = true;
  }

  showBoard({ rows = [], you = '', status = '', username = '' } = {}) {
    if (!this.els.boardOverlay) return;
    this.els.boardOverlay.hidden = false;
    if (this.els.boardYou) this.els.boardYou.textContent = you || 'NO TAG YET';
    if (this.els.boardStatus) this.els.boardStatus.textContent = status || '';
    if (!this.els.boardList) return;
    if (!rows.length) {
      this.els.boardList.innerHTML = '<li class="empty"><span class="nm">NO RUNS YET. BE FIRST.</span></li>';
      return;
    }
    this.els.boardList.innerHTML = rows
      .map((r, i) => {
        const me = username && String(r.username).toLowerCase() === String(username).toLowerCase();
        return `<li class="${me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(r.username)}</span><span class="m">${Math.floor(r.distance)}m</span><span class="b">$${Math.floor(r.bags || 0)}</span></li>`;
      })
      .join('');
  }

  setRuggedRank(text) {
    if (this.els.ruggedRank) this.els.ruggedRank.textContent = text || '';
  }

  rugged(catcher, distance, sol, best, isNewBest) {
    const line = RUGGED[(Math.random() * RUGGED.length) | 0];
    const who = catcher || 'THE 5-0';
    this.els.ruggedLine.textContent = line;
    this.els.ruggedWho.innerHTML = `<span class="cop-name">${esc(who)}</span><span class="caught-you">caught you.</span>`;
    if (this.els.ruggedStats) {
      this.els.ruggedStats.textContent = `${Math.floor(distance)}m  ·  $${sol} BAGS  ·  BEST ${Math.floor(best)}m`;
    }
    this.els.newBest?.classList.toggle('show', !!isNewBest);
    this.show('rugged');
    return line;
  }

  update(dt, fps) {
    if (this._t > 0) {
      this._t -= dt;
      if (this._t <= 0) this.els.announcer.classList.remove('show');
    }
    this._fpsA += fps;
    this._fpsN += 1;
    if (this._fpsN >= 20) {
      this.els.fps.textContent = `${Math.round(this._fpsA / this._fpsN)} fps`;
      this._fpsA = 0;
      this._fpsN = 0;
    }
  }
}

export function xShareUrl({ distance, bags, name } = {}) {
  const bits = [
    Number(distance) > 0
      ? `Got rugged on PumpRun — ${Math.floor(distance)}m · $${Math.floor(bags || 0)} BAGS.`
      : 'PumpRun — Get Rich or Get Rugged.',
    name ? `Tag: ${name}` : '',
    PLAY_URL ? `Play: ${PLAY_URL}` : '',
    OFFICIAL_CA ? `OFFICIAL CA: ${OFFICIAL_CA}` : '',
    PUMPFUN_URL || '',
  ].filter(Boolean);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(bits.join('\n'))}`;
}

export async function saveShareCard({ renderer, who, distance, sol, line, catcher, best }) {
  const w = 1280;
  const h = 720;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#08060e';
  ctx.fillRect(0, 0, w, h);
  try {
    const src = renderer.domElement;
    const sc = Math.max(w / src.width, h / src.height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(src, (w - src.width * sc) / 2, (h - src.height * sc) / 2, src.width * sc, src.height * sc);
    ctx.globalAlpha = 1;
  } catch {
    /* no frame */
  }
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(153,69,255,0.4)');
  g.addColorStop(1, 'rgba(20,241,149,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const gta = '"Pricedown", "Pricedown Bl", Impact, sans-serif';
  try { await document.fonts.load(`80px ${gta}`); } catch { /* local/cdn */ }
  ctx.fillStyle = '#ff2d55';
  ctx.font = `900 84px ${gta}`;
  ctx.fillText('GET RUGGED', 70, 180);
  ctx.fillStyle = '#f4f0ff';
  ctx.font = `400 32px ${gta}`;
  ctx.fillText(who || 'DEGEN', 76, 260);
  ctx.fillStyle = '#14F195';
  ctx.font = `400 26px ${gta}`;
  ctx.fillText(`${Math.floor(distance)}m  ·  $${sol}  ·  BEST ${Math.floor(best || 0)}m`, 76, 310);
  ctx.fillStyle = '#ff4d6d';
  ctx.font = `400 26px ${gta}`;
  ctx.fillText(catcher ? `${catcher} caught you.` : '', 76, 354);
  ctx.fillStyle = '#c8b4ff';
  ctx.font = `400 22px ${gta}`;
  ctx.fillText(line || '', 76, 400);
  ctx.fillStyle = '#f5c542';
  ctx.font = `400 18px ${gta}`;
  ctx.fillText(OFFICIAL_CA ? `OFFICIAL CA: ${OFFICIAL_CA}` : 'OFFICIAL CA: LAUNCHING ON PUMP.FUN', 76, 620);
  ctx.fillStyle = '#14F195';
  ctx.font = `400 20px ${gta}`;
  ctx.fillText('PUMPRUN: GET RICH OR GET RUGGED', 76, 660);
  return new Promise((resolve) => {
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pumprun-${Math.floor(distance)}m.png`;
      a.click();
      resolve();
    });
  });
}

function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}
