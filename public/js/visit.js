import { net } from './net.js';
import { won, escapeHtml } from './data.js';
import { FILLINGS, BASE_FILLINGS, BUNDLE_DISCOUNT, normalizeUpgrades, itemsOf, countItems, priceOfItems, itemsLabel } from './economy.js';
import { presetPortrait } from './people.js';
import { orderText, QUICK_MESSAGES, fillingIcon } from './art.js';
import { GrillView, TrayView, FISH_IMG, MOLD_COUNT } from './stall-ui.js';

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const CYCLE = [
  ['empty', 1.2],
  ['batter', 0.8],
  ['filled', 0.5],
  ['side1', 3.5],
  ['flip', 1.0],
  ['side2', 3.5],
  ['done', 1.6],
];
const CYCLE_TOTAL = CYCLE.reduce((s, [, t]) => s + t, 0);

class BotGrill {
  constructor() {
    this.offsets = Array.from({ length: MOLD_COUNT }, (_, i) => i * 1.9 + Math.random());
    this.fillings = Array.from({ length: MOLD_COUNT }, () => (Math.random() < 0.55 ? 'red' : 'cream'));
    this.time = 0;
    this.tray = { red: 3 + Math.floor(Math.random() * 4), cream: 2 + Math.floor(Math.random() * 4) };
  }

  tick(dt) {
    this.time += dt;
    if (Math.random() < dt * 0.25) {
      const k = Math.random() < 0.5 ? 'red' : 'cream';
      this.tray[k] = Math.max(1, Math.min(10, this.tray[k] + (Math.random() < 0.5 ? -1 : 1)));
    }
    return {
      tray: this.tray,
      molds: this.offsets.map((off, i) => {
        let t = (this.time + off) % CYCLE_TOTAL;
        for (const [phase, len] of CYCLE) {
          if (t < len) {
            const k = t / len;
            const d = { side1: k * 0.35, flip: 0.35 + k * 0.05, side2: 1.0, done: 1 + k * 0.12 }[phase] ?? 0;
            return { p: phase, f: phase === 'empty' || phase === 'batter' ? null : this.fillings[i], d };
          }
          t -= len;
        }
        return { p: 'empty', f: null, d: 0 };
      }),
    };
  }
}

export class Visit {
  constructor({ toast, onClose }) {
    this.toast = toast;
    this.onClose = onClose;
    this.el = document.getElementById('visit');
    this.panel = document.getElementById('visit-panel');
    this.bubble = document.getElementById('owner-bubble');
    this.face = document.getElementById('owner-face');
    this.shutter = document.getElementById('visit-shutter');
    this.meBack = document.getElementById('me-back');
    this.meBubble = document.getElementById('me-bubble');
    this.grill = new GrillView(document.getElementById('visit-grill'), { mirrored: true });
    this.trayView = new TrayView(document.getElementById('visit-tray'));
    this.active = false;
    this.ownerId = null;
    this.cart = {};
    document.getElementById('visit-close').addEventListener('click', () => this.close());
    this.thumbsBtn = document.getElementById('thumbs-btn');
    this.thumbsCombo = document.getElementById('thumbs-combo');
    this.thumbsFx = document.getElementById('thumbs-fx');
    this.thumbsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.thumbsUp();
    });

    net.on('order', (o) => {
      if (!this.active || o.sellerId !== this.ownerId || o.buyerId !== net.me?.id) return;
      this.lastOrder = o;
      this.render();
    });
    net.on('player', (p) => {
      if (!this.active) return;
      if (p.id === this.ownerId) this.renderHeader();
      if (p.id === net.me?.id) document.getElementById('visit-capital').textContent = won(p.capital);
      const key = `${net.players.get(this.ownerId)?.stall?.open}`;
      if (key !== this.openKey) this.render();
    });
    net.on('grill', (g) => {
      if (this.active && g.sellerId === this.ownerId) this.renderGrill(g);
    });
  }

  open(ownerId) {
    this.ownerId = ownerId;
    this.active = true;
    this.cart = {};
    this.lastOrder = null;
    this.mode = null;
    const seller = net.players.get(ownerId);
    this.bot = seller?.bot ? new BotGrill() : null;
    this.face.src = presetPortrait(seller?.character, { size: 360, pose: 'front' });
    this.meBackSrc = presetPortrait(net.me?.character, { size: 280, pose: 'back' });
    this.meThumbsSrc = net.features?.thumbs ? presetPortrait(net.me?.character, { size: 280, pose: 'back-thumbs' }) : null;
    this.meBack.src = this.meBackSrc;
    this.resetThumbs();
    this.thumbsBtn.classList.toggle('hidden', !net.features?.thumbs);
    this.el.classList.toggle('has-thumbs', !!net.features?.thumbs);
    this.meSaid = null;
    this.meBubble.classList.add('hidden');
    this.el.classList.remove('hidden');
    this.renderHeader();
    this.render();
    this.renderGrill(net.grills.get(ownerId));
    if (!this.bot) {
      net.request('watch', { sellerId: ownerId }).then((r) => {
        if (this.active && this.ownerId === ownerId && r?.grill) this.renderGrill(r.grill);
      }).catch(() => {});
    }
    clearInterval(this.loop);
    let last = performance.now();
    this.loop = setInterval(() => {
      const now = performance.now();
      if (this.bot) this.renderGrill(this.bot.tick((now - last) / 1000));
      last = now;
    }, 100);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.loop);
    this.flushThumbs();
    this.resetThumbs();
    net.request('watch', { sellerId: null }).catch(() => {});
    this.el.classList.add('hidden');
    this.onClose?.();
  }

  /* ---------- 따봉 ---------- */

  resetThumbs() {
    clearTimeout(this.thumbsPoseTimer);
    clearTimeout(this.thumbsComboTimer);
    clearTimeout(this.thumbsFlushTimer);
    this.thumbsFlushTimer = null;
    this.thumbsPending = 0;
    this.thumbsStreak = 0;
    this.thumbsCombo.textContent = '';
    this.thumbsBtn.classList.remove('combo');
    this.meBack.classList.remove('thumbs', 'posed');
    this.thumbsFx.innerHTML = '';
  }

  thumbsUp() {
    if (!this.active || !net.features?.thumbs) return;
    // 포즈: 누르는 동안 유지, 마지막 탭 후 0.7초 뒤 원래대로
    if (this.meThumbsSrc) this.meBack.src = this.meThumbsSrc;
    this.meBack.classList.add('posed');
    restartAnim(this.meBack, 'thumbs');
    clearTimeout(this.thumbsPoseTimer);
    this.thumbsPoseTimer = setTimeout(() => {
      this.meBack.src = this.meBackSrc;
      this.meBack.classList.remove('thumbs', 'posed');
    }, 700);

    restartAnim(this.thumbsBtn, 'tap');
    this.thumbsStreak += 1;
    if (this.thumbsStreak > 1) {
      this.thumbsCombo.textContent = `×${this.thumbsStreak}`;
      restartAnim(this.thumbsBtn, 'combo');
    }
    clearTimeout(this.thumbsComboTimer);
    this.thumbsComboTimer = setTimeout(() => {
      this.thumbsStreak = 0;
      this.thumbsCombo.textContent = '';
      this.thumbsBtn.classList.remove('combo');
    }, 1200);

    this.spawnThumb();
    restartAnim(this.face, 'thanked');
    navigator.vibrate?.(12);

    // 연타는 모아서 0.4초마다 한 번만 서버로 보냄
    this.thumbsPending += 1;
    if (!this.thumbsFlushTimer) this.thumbsFlushTimer = setTimeout(() => this.flushThumbs(), 400);
  }

  flushThumbs() {
    clearTimeout(this.thumbsFlushTimer);
    this.thumbsFlushTimer = null;
    const count = this.thumbsPending;
    this.thumbsPending = 0;
    if (!count || !this.ownerId) return;
    net.request('thumbs', { sellerId: this.ownerId, count }).catch(() => {});
  }

  spawnThumb() {
    const host = this.thumbsFx.getBoundingClientRect();
    const from = this.meBack.getBoundingClientRect();
    const to = this.face.getBoundingClientRect();
    const x0 = from.left + from.width * 0.72 - host.left;
    const y0 = from.top + from.height * 0.12 - host.top;
    const x1 = to.left + to.width * (0.3 + Math.random() * 0.4) - host.left;
    const y1 = to.top + to.height * (0.15 + Math.random() * 0.25) - host.top;
    const el = document.createElement('span');
    el.className = 'thumb-fly';
    el.textContent = Math.random() < 0.15 ? '❤️' : '👍';
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    el.style.setProperty('--dx', `${x1 - x0}px`);
    el.style.setProperty('--dy', `${y1 - y0}px`);
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 50}deg`);
    el.addEventListener('animationend', () => el.remove());
    this.thumbsFx.appendChild(el);
    while (this.thumbsFx.childElementCount > 24) this.thumbsFx.firstElementChild.remove();
  }

  myWaitingOrder() {
    for (const o of net.orders.values()) {
      if (o.buyerId === net.me?.id && o.status === 'waiting' && o.sellerId === this.ownerId) return o;
    }
    return null;
  }

  renderHeader() {
    const seller = net.players.get(this.ownerId);
    if (!seller) return;
    document.getElementById('visit-name').textContent = seller.stall?.name || `${seller.nickname}네 붕어빵`;
    document.getElementById('visit-sub').textContent = `${seller.nickname} 사장님${seller.bot ? ' (NPC)' : ''} · ${seller.sold}마리 판매`;
    document.getElementById('visit-capital').textContent = won(net.me?.capital);
  }

  sellerMenu() {
    const seller = net.players.get(this.ownerId);
    return net.features?.shop && !seller?.bot ? normalizeUpgrades(seller?.upgrades).fillings : BASE_FILLINGS;
  }

  renderGrill(g) {
    const count = g?.molds?.length || MOLD_COUNT;
    this.grill.setCount(count);
    this.trayView.setKinds(this.sellerMenu());
    this.grill.render(g?.molds || Array.from({ length: count }, () => ({ p: 'empty' })));
    this.trayView.render(g?.tray || {});
  }

  say(text) {
    if (this.bubble.textContent === text) return;
    this.bubble.textContent = text;
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  sayMe(text) {
    if (!text) {
      this.meBubble.classList.add('hidden');
      this.meSaid = null;
      return;
    }
    if (this.meSaid === text) return;
    this.meSaid = text;
    this.meBubble.textContent = text;
    this.meBubble.classList.remove('hidden', 'pop');
    void this.meBubble.offsetWidth;
    this.meBubble.classList.add('pop');
  }

  render() {
    const seller = net.players.get(this.ownerId);
    if (!seller?.stall) return this.close();
    const open = !!seller.stall.open;
    this.openKey = `${open}`;
    const waiting = this.myWaitingOrder();
    const done = this.lastOrder?.status === 'done' ? this.lastOrder : null;
    this.shutter.classList.toggle('hidden', open || !!waiting);
    this.el.classList.toggle('closed', !open && !waiting);

    if (waiting) return this.renderWaiting(waiting);
    if (done) return this.renderDone(done);
    if (!open) return this.renderClosed(seller);
    return this.renderMenu();
  }

  renderClosed(seller) {
    this.panel.dataset.order = '';
    this.say('');
    this.sayMe('어… 아직 준비 중이네');
    this.bubble.classList.add('hidden');
    this.panel.innerHTML = `
      <div class="panel-center">
        <h3>지금은 준비 중이에요</h3>
        <p>${escapeHtml(seller.nickname)} 사장님이 장사를 시작하면 주문할 수 있어요</p>
        <button class="btn ghost big" data-act="leave">나가기</button>
      </div>`;
    this.panel.querySelector('[data-act=leave]').addEventListener('click', () => this.close());
  }

  renderMenu() {
    this.panel.dataset.order = '';
    this.bubble.classList.remove('hidden');
    this.say('어서 오세요! 따끈한 붕어빵 있어요');
    const menu = this.sellerMenu();
    for (const k of Object.keys(this.cart)) if (!menu.includes(k)) delete this.cart[k];
    const count = countItems(this.cart);
    this.sayMe(count ? `${orderText(this.cart)} 주세요!` : '음… 뭐 먹지?');
    const price = priceOfItems(this.cart);
    const lack = price > (net.me?.capital || 0);
    const row = (key) => `
      <div class="menu-row">
        <img src="${FISH_IMG}" alt="">
        <div class="info"><strong>${fillingIcon(key, 20)}${FILLINGS[key].name}</strong><span>1마리 ${won(FILLINGS[key].price)}</span></div>
        <div class="stepper">
          <button data-step="${key}:-1" aria-label="${FILLINGS[key].short} 빼기">−</button>
          <b>${this.cart[key] || 0}</b>
          <button data-step="${key}:1" aria-label="${FILLINGS[key].short} 더하기">+</button>
        </div>
      </div>`;
    this.panel.classList.toggle('compact-menu', menu.length > 2);
    this.panel.innerHTML = `
      <p class="menu-deal">3마리마다 ${won(BUNDLE_DISCOUNT)} 할인</p>
      <div class="menu-rows">${menu.map(row).join('')}</div>
      <input id="order-note" class="note-input" maxlength="30" placeholder="사장님께 한마디 (선택)" value="${escapeHtml(this.noteDraft || '')}">
      <button class="btn primary big" id="order-submit" ${count === 0 || lack ? 'disabled' : ''}>
        ${lack ? '자본이 부족해요' : count === 0 ? '메뉴를 골라 주세요' : `${count}마리 · ${won(price)} 주문하기`}
      </button>
      <p class="panel-note">내 자본 ${won(net.me?.capital)}${Math.floor(count / 3) ? ` · ${won(Math.floor(count / 3) * BUNDLE_DISCOUNT)} 할인 적용!` : ''}</p>`;
    this.panel.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
      const [key, delta] = btn.dataset.step.split(':');
      this.cart[key] = Math.max(0, Math.min(9, (this.cart[key] || 0) + Number(delta)));
      this.noteDraft = document.getElementById('order-note').value;
      this.renderMenu();
    }));
    document.getElementById('order-submit').addEventListener('click', () => this.submit());
  }

  async submit() {
    const items = { ...this.cart };
    const typed = document.getElementById('order-note').value.trim();
    const note = typed || `${orderText(items)} 주세요!`;
    document.getElementById('order-submit').disabled = true;
    try {
      const { order } = await net.post('/api/order', { sellerId: this.ownerId, items, red: items.red || 0, cream: items.cream || 0, note });
      net.orders.set(order.id, order);
      this.cart = {};
      this.noteDraft = '';
      this.render();
    } catch (e) {
      this.toast(e.message);
      this.renderMenu();
    }
  }

  renderWaiting(order) {
    this.bubble.classList.remove('hidden');
    const msgs = order.messages || [];
    const sellerMsgs = msgs.filter((m) => m.from === 'seller');
    const buyerMsgs = msgs.filter((m) => m.from === 'buyer');
    this.say(sellerMsgs.length ? sellerMsgs[sellerMsgs.length - 1].text : '주문 받았어요! 금방 구워드릴게요');
    this.sayMe(buyerMsgs.length ? buyerMsgs[buyerMsgs.length - 1].text : order.note);
    if (this.panel.dataset.order === order.id) return;
    this.panel.dataset.order = order.id;
    this.panel.innerHTML = `
      <div class="wait-head">
        <img src="${FISH_IMG}" alt="" class="wait-fish">
        <div><strong>사장님이 굽고 있어요…</strong><span>${itemsLabel(itemsOf(order))} · ${won(order.price)} 결제 완료</span></div>
      </div>
      <p class="say-label">말 걸기</p>
      <div class="quick-chips">${QUICK_MESSAGES.map((t) => `<button data-quick="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}<button data-act="type" class="type-chip">✏️ 직접 쓰기</button></div>
      <form class="say-form hidden" id="say-form">
        <input id="say-input" maxlength="40" placeholder="사장님께 할 말" autocomplete="off">
        <button class="btn primary small" type="submit">말하기</button>
      </form>
      <button class="link-btn" data-act="cancel">주문 취소하고 환불받기</button>`;
    const send = async (text) => {
      if (!text.trim()) return;
      this.sayMe(text.trim());
      try {
        await net.post('/api/order/message', { orderId: order.id, text });
      } catch (e) {
        this.toast(e.message);
      }
    };
    this.panel.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => send(b.dataset.quick)));
    const form = this.panel.querySelector('#say-form');
    this.panel.querySelector('[data-act=type]').addEventListener('click', () => {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) form.querySelector('input').focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      send(input.value);
      input.value = '';
      form.classList.add('hidden');
    });
    this.panel.querySelector('[data-act=cancel]').addEventListener('click', async () => {
      try {
        await net.post('/api/order/cancel', { orderId: order.id });
        this.toast(`주문을 취소하고 ${won(order.price)} 환불받았어요`);
      } catch (e) {
        this.toast(e.message);
      }
    });
  }

  renderDone(order) {
    this.panel.dataset.order = '';
    this.sayMe('와 따끈하다! 잘 먹을게요 😋');
    this.bubble.classList.remove('hidden');
    this.say('맛있게 드세요~ 또 오세요!');
    this.panel.innerHTML = `
      <div class="panel-center">
        <div class="received">${Array.from({ length: Math.min(countItems(itemsOf(order)), 6) }, (_, i) => `<img src="${FISH_IMG}" alt="" style="animation-delay:${i * 0.08}s">`).join('')}</div>
        <h3>붕어빵 받았어요!</h3>
        <p>${itemsLabel(itemsOf(order))} · 지금까지 먹은 붕어빵 ${net.me?.bought || 0}마리</p>
        <div class="row-btns">
          <button class="btn ghost" data-act="leave">나가기</button>
          <button class="btn primary" data-act="again">한 번 더 주문</button>
        </div>
      </div>`;
    this.panel.querySelector('[data-act=leave]').addEventListener('click', () => this.close());
    this.panel.querySelector('[data-act=again]').addEventListener('click', () => {
      this.lastOrder = null;
      this.render();
    });
  }
}
