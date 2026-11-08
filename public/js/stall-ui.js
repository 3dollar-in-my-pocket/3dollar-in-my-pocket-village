import { fishSvg, paintFish } from './art.js';
import { FILLINGS, BASE_FILLINGS } from './economy.js';

export const FISH_IMG = 'assets/cat/bungeoppang-tight.svg';
export const MOLD_COUNT = 6;

const COOKING = new Set(['side1', 'flip', 'side2', 'done', 'burnt']);

export class GrillView {
  constructor(container, { onTap, mirrored = false, count = MOLD_COUNT } = {}) {
    this.container = container;
    this.onTap = onTap;
    this.container.classList.add('grill');
    if (mirrored) this.container.classList.add('mirrored');
    this.molds = [];
    this.setCount(count);
  }

  setCount(count) {
    if (count === this.molds.length) return;
    this.container.innerHTML = '';
    this.container.classList.toggle('wide', count > 6);
    this.molds = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement(this.onTap ? 'button' : 'div');
      el.className = 'mold phase-empty';
      if (this.onTap) {
        el.setAttribute('aria-label', `붕어빵 틀 ${i + 1}`);
        el.addEventListener('click', () => this.onTap(i));
      }
      el.innerHTML = `
        <div class="cavity">${fishSvg()}</div>
        <div class="fish-wrap"><div class="fish">${fishSvg()}</div></div>
        <span class="blob"></span>
        <span class="steam"><i></i><i></i><i></i></span>
        <span class="smoke"><i></i><i></i></span>
        <span class="cta">뒤집기!</span>
        <span class="warn">곧 타요</span>
        <span class="tag"></span>`;
      this.molds.push({ el, fish: el.querySelector('.fish'), wrap: el.querySelector('.fish-wrap'), tag: el.querySelector('.tag'), blob: el.querySelector('.blob'), phase: 'empty', d: -1, filling: null });
    }
    this.molds.forEach((m) => this.container.appendChild(m.el));
  }

  render(states) {
    states.forEach((s, i) => {
      const m = this.molds[i];
      if (!m || !s) return;
      const phase = s.phase || s.p || 'empty';
      const filling = s.filling ?? s.f ?? null;
      const d = s.d ?? 0;
      if (m.phase !== phase || m.filling !== filling) {
        if ((m.phase === 'flip' || m.phase === 'side1') && phase === 'side2') this.flip(m);
        if (m.phase === 'side2' && phase === 'done') this.ding(m);
        m.el.className = `mold phase-${phase}${filling ? ` filling-${filling}` : ''}${COOKING.has(phase) ? ' cooking' : ''}`;
        m.tag.textContent = FILLINGS[filling]?.short || '';
        m.blob.className = `blob ${filling || ''}`;
        m.blob.style.setProperty('--fill', FILLINGS[filling]?.dot || '');
        m.phase = phase;
        m.filling = filling;
        m.d = -1;
      }
      const paintD = phase === 'batter' || phase === 'filled' ? 0 : phase === 'burnt' ? 1.6 : d;
      if (phase !== 'empty' && Math.abs(paintD - m.d) > 0.004) {
        paintFish(m.fish, paintD);
        m.d = paintD;
      }
      m.el.classList.toggle('hot', !!(s.hot ?? s.h) && (phase === 'flip' || phase === 'done'));
      m.el.classList.toggle('smoking', phase === 'burnt' || d > 1.42);
    });
  }

  flip(m) {
    m.wrap.classList.remove('flipping');
    void m.wrap.offsetWidth;
    m.wrap.classList.add('flipping');
  }

  ding(m) {
    const fx = document.createElement('span');
    fx.className = 'ding';
    fx.innerHTML = '<i class="rays"></i><i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><b>짠!</b>';
    m.el.appendChild(fx);
    setTimeout(() => fx.remove(), 1100);
  }

  nudge(i) {
    const el = this.molds[i].el;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  }

  rect(i) {
    return this.molds[i].el.getBoundingClientRect();
  }
}

const POSITIONS = (() => {
  const out = [];
  const rows = [0, 1, 2];
  for (const r of rows) {
    for (let c = 0; c < 4; c++) {
      out.push({ x: 4 + c * 22 + (r % 2) * 9, y: 6 + r * 26, rot: ((c * 37 + r * 13) % 15) - 7 });
    }
  }
  return out;
})();

export class TrayView {
  constructor(container, kinds = BASE_FILLINGS) {
    this.container = container;
    container.classList.add('rack');
    this.kinds = [];
    this.setKinds(kinds);
  }

  setKinds(kinds) {
    if (kinds.join() === this.kinds.join()) return;
    this.kinds = [...kinds];
    this.container.style.setProperty('--zones', kinds.length);
    this.container.classList.toggle('many', kinds.length > 2);
    this.container.innerHTML = kinds.map((k) => `
      <div class="rack-zone" data-kind="${k}"><span class="rack-sign ${k}" style="color:${FILLINGS[k].label}">${FILLINGS[k].short}</span><div class="rack-fish"></div><b class="rack-count">0</b></div>`).join('');
    this.zones = {};
    this.container.querySelectorAll('.rack-zone').forEach((z) => {
      this.zones[z.dataset.kind] = { el: z, fish: z.querySelector('.rack-fish'), count: z.querySelector('.rack-count'), n: -1 };
    });
  }

  render(tray, changed) {
    for (const kind of this.kinds) {
      const z = this.zones[kind];
      const n = Math.max(0, tray?.[kind] || 0);
      if (n !== z.n) {
        const shown = Math.min(n, POSITIONS.length);
        while (z.fish.children.length < shown) {
          const i = z.fish.children.length;
          const p = POSITIONS[i];
          const img = document.createElement('img');
          img.src = FISH_IMG;
          img.alt = '';
          img.className = 'new';
          img.style.cssText = `left:${p.x}%;top:${p.y}%;transform:rotate(${p.rot}deg);z-index:${i}`;
          img.addEventListener('animationend', () => img.classList.remove('new'), { once: true });
          z.fish.appendChild(img);
        }
        while (z.fish.children.length > shown) z.fish.lastElementChild.remove();
        z.count.textContent = n;
        z.el.classList.toggle('empty', n === 0);
        if (kind === changed && n > z.n) {
          z.el.classList.remove('pop');
          void z.el.offsetWidth;
          z.el.classList.add('pop');
        }
        z.n = n;
      }
    }
  }

  rect(kind) {
    return (this.zones[kind]?.el || this.container).getBoundingClientRect();
  }
}
