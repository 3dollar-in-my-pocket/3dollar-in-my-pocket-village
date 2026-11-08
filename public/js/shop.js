import { net } from './net.js';
import { won, escapeHtml } from './data.js';
import { FILLINGS, normalizeUpgrades, moldCount, trayCap, cookScale, signBoost, itemsOf, countItems, priceOfItems } from './economy.js';
import { portrait, presetPortrait, randomPerson } from './people.js';
import { kettleSvg, containerSvg, npcOrderMessage, SELLER_REPLIES, fillingIcon } from './art.js';
import { GrillView, TrayView, FISH_IMG, MOLD_COUNT } from './stall-ui.js';

const FILL_DELAY = 0.5;
const SIDE1 = 3.5;
const FLIP_WINDOW = 4.5;
const SIDE2 = 3.5;
const DONE_WINDOW = 7;
const MAX_WALKINS = 3;
const NPC_TAGS = ['동네 손님', '학생 손님', '퇴근길 손님', '산책 손님', '단골 손님', '꼬마 손님'];

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Shop {
  constructor({ toast, onClose }) {
    this.toast = toast;
    this.onClose = onClose;
    this.el = document.getElementById('shop');
    this.customersEl = document.getElementById('customers');
    this.emptyEl = document.getElementById('customers-empty');
    this.hintEl = document.getElementById('grill-hint');
    this.capitalEl = document.getElementById('shop-capital');
    this.statsEl = document.getElementById('shop-stats');
    this.nameEl = document.getElementById('shop-name');
    this.active = false;
    this.tool = 'batter';
    this.molds = Array.from({ length: MOLD_COUNT }, () => ({ phase: 'empty', filling: null, d: 0, t: 0 }));
    this.customers = [];
    this.grill = new GrillView(document.getElementById('grill'), { onTap: (i) => this.tapMold(i) });
    this.trayView = new TrayView(document.getElementById('tray'));

    this.menu = [];
    document.getElementById('shop-close').addEventListener('click', () => this.close());

    net.on('order', (o) => this.onOrder(o));
    this.thumbsToastAt = new Map();
    this.thumbVisitors = new Map();
    net.on('thumbs', (m) => this.onThumbs(m));
    net.on('player', (p) => {
      if (this.active && p.id === net.me?.id) this.renderMoney();
    });
  }

  open() {
    const me = net.me;
    this.active = true;
    // 장비·속재료는 장사를 시작할 때 적용
    const u = normalizeUpgrades(net.features?.shop ? me.upgrades : null);
    this.cook = cookScale(u);
    this.boost = signBoost(u);
    this.trayCap = trayCap(u);
    this.buildTools(u.fillings);
    const count = moldCount(u);
    this.molds = Array.from({ length: count }, () => ({ phase: 'empty', filling: null, d: 0, t: 0 }));
    this.grill.setCount(count);
    this.trayView.setKinds(this.menu);
    this.tray = Object.fromEntries(this.menu.map((k) => [k, 0]));
    this.stats = { sold: 0, revenue: 0 };
    this.customers.forEach((c) => c.el.remove());
    this.customers = [];
    [...this.thumbVisitors.keys()].forEach((id) => this.removeThumbsVisitor(id, true));
    this.molds.forEach((m) => Object.assign(m, { phase: 'empty', filling: null, d: 0, t: 0 }));
    this.nextSpawn = 1.2;
    this.lastSync = '';
    this.setTool('batter');
    this.nameEl.textContent = me.stall?.name || `${me.nickname}네 붕어빵`;
    this.el.classList.remove('hidden');
    for (const o of net.orders.values()) {
      if (o.sellerId === me.id && o.status === 'waiting') this.addUserCustomer(o);
    }
    this.emptyEl.classList.toggle('hidden', this.customers.length > 0);
    this.renderGrill();
    this.trayView.render(this.tray);
    this.renderMoney();
    this.renderStats();
    this.last = performance.now();
    clearInterval(this.loop);
    this.loop = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.update(dt);
    }, 50);
    clearInterval(this.syncLoop);
    this.syncLoop = setInterval(() => this.syncGrill(), 500);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.loop);
    clearInterval(this.syncLoop);
    this.pourFx?.classList.remove('show');
    this.el.classList.add('hidden');
    this.onClose?.({ ...this.stats });
  }

  buildTools(menu) {
    if (menu.join() === this.menu.join()) return;
    this.menu = [...menu];
    const tools = document.getElementById('tools');
    tools.style.setProperty('--tubs', menu.length);
    tools.innerHTML = `
      <button class="tool kettle" data-tool="batter" aria-label="반죽 주전자">${kettleSvg()}<span class="tool-name">반죽</span></button>
      ${menu.map((k) => `<button class="tool tub" data-tool="${k}" aria-label="${FILLINGS[k].short} 통">${containerSvg(k)}<span class="tool-name">${FILLINGS[k].short}</span></button>`).join('')}`;
    tools.querySelectorAll('.tool').forEach((btn) => btn.addEventListener('click', () => this.setTool(btn.dataset.tool)));
  }

  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll('#tools .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  }

  tapMold(i) {
    const m = this.molds[i];
    const nudge = (msg) => {
      this.grill.nudge(i);
      if (msg) this.hint(msg, true);
    };
    switch (m.phase) {
      case 'empty':
        if (this.tool !== 'batter') return nudge('주전자로 반죽을 먼저 부어 주세요');
        this.pourEffect(i, 'batter');
        Object.assign(m, { phase: 'batter', d: 0, t: 0, hot: false });
        if (this.molds.every((x) => x.phase !== 'empty')) this.setTool(this.menu.includes(this.lastFilling) ? this.lastFilling : this.menu[0]);
        break;
      case 'batter':
        if (this.tool === 'batter') return nudge('속재료 통을 골라 넣어 주세요');
        this.pourEffect(i, this.tool);
        Object.assign(m, { phase: 'filled', filling: this.tool, t: 0, d: 0 });
        this.lastFilling = this.tool;
        break;
      case 'filled':
      case 'side1':
      case 'side2':
        return nudge('아직 굽는 중이에요');
      case 'flip':
        Object.assign(m, { phase: 'side2', t: 0, under: 0.95 + (m.t / FLIP_WINDOW) * 0.5 });
        break;
      case 'done': {
        if ((this.tray[m.filling] || 0) >= this.trayCap) return nudge('보관대가 가득 찼어요');
        this.flyToTray(i, m.filling);
        this.tray[m.filling] = (this.tray[m.filling] || 0) + 1;
        this.trayView.render(this.tray, m.filling);
        Object.assign(m, { phase: 'empty', filling: null, d: 0, t: 0, hot: false });
        this.refreshReady();
        if (this.molds.some((x) => x.phase === 'empty') && !this.molds.some((x) => x.phase === 'batter')) this.setTool('batter');
        break;
      }
      case 'burnt':
        Object.assign(m, { phase: 'empty', filling: null, d: 0, t: 0, hot: false });
        this.toast('탄 붕어빵을 버렸어요');
        break;
      default:
        break;
    }
    this.renderGrill();
  }

  update(dt) {
    let burnt = false;
    for (const m of this.molds) {
      if (m.phase === 'empty' || m.phase === 'batter' || m.phase === 'burnt') continue;
      m.t += dt;
      if (m.phase === 'filled') {
        if (m.t >= FILL_DELAY * this.cook) Object.assign(m, { phase: 'side1', t: 0, d: 0 });
      } else if (m.phase === 'side1') {
        m.d = (m.t / (SIDE1 * this.cook)) * 0.35;
        m.hot = false;
        if (m.t >= SIDE1 * this.cook) Object.assign(m, { phase: 'flip', t: 0, d: 0.35 });
      } else if (m.phase === 'flip') {
        m.d = 0.35 + (m.t / FLIP_WINDOW) * 0.15;
        m.hot = m.t > FLIP_WINDOW * 0.65;
        if (m.t >= FLIP_WINDOW) {
          Object.assign(m, { phase: 'burnt', d: 1.6, hot: false });
          burnt = true;
        }
      } else if (m.phase === 'side2') {
        m.d = m.under + Math.min(1, m.t / (SIDE2 * this.cook)) * 0.05;
        m.hot = false;
        if (m.t >= SIDE2 * this.cook) {
          Object.assign(m, { phase: 'done', t: 0, top: m.d });
          this.hint('짠! 다 익었어요. 탭해서 보관대로 옮기세요', true);
        }
      } else if (m.phase === 'done') {
        m.d = m.top + (m.t / DONE_WINDOW) * (1.6 - m.top);
        m.hot = m.d > 1.32;
        if (m.t >= DONE_WINDOW) {
          Object.assign(m, { phase: 'burnt', d: 1.6, hot: false });
          burnt = true;
        }
      }
    }
    if (burnt) this.toast('앗, 붕어빵이 탔어요!');
    this.renderGrill();

    const walkins = this.customers.filter((c) => c.kind === 'npc').length;
    if (this.customers.length < MAX_WALKINS && walkins < MAX_WALKINS) {
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0) {
        this.addNpcCustomer();
        this.nextSpawn = (2.5 + Math.random() * 4) / this.boost;
      }
    }

    for (const c of [...this.customers]) {
      if (c.kind !== 'npc' || c.leaving) continue;
      c.patience -= dt;
      const ratio = Math.max(0, c.patience / c.maxPatience);
      c.barEl.style.transform = `scaleX(${ratio})`;
      c.barWrap.classList.toggle('warn', ratio < 0.5 && ratio >= 0.25);
      c.barWrap.classList.toggle('danger', ratio < 0.25);
      c.el.classList.toggle('impatient', ratio < 0.25);
      if (c.patience <= 0) {
        this.toast(`${c.tag}이 기다리다 떠났어요`);
        this.removeCustomer(c);
      }
    }
    this.updateHint();
  }

  renderGrill() {
    this.grill.render(this.molds);
  }

  syncGrill() {
    const payload = {
      molds: this.molds.map((m) => ({ p: m.phase, f: m.filling, d: Math.round(m.d * 100) / 100, h: !!m.hot })),
      tray: this.tray,
    };
    const key = JSON.stringify(payload);
    if (key === this.lastSync) return;
    this.lastSync = key;
    net.post('/api/grill', payload).catch(() => {});
  }

  pourEffect(i, tool) {
    const r = this.grill.rect(i);
    if (!this.pourFx) {
      this.pourFx = document.createElement('div');
      this.pourFx.className = 'pour-fx';
      document.body.appendChild(this.pourFx);
    }
    const fx = this.pourFx;
    if (fx.dataset.tool !== tool) {
      fx.innerHTML = tool === 'batter' ? kettleSvg() : containerSvg(tool);
      fx.dataset.tool = tool;
    }
    const pos = `translate(${r.left + r.width * 0.55}px, ${r.top - 30}px)`;
    if (!fx.classList.contains('show')) {
      fx.style.transition = 'none';
      fx.style.transform = pos;
      void fx.offsetWidth;
      fx.style.transition = '';
    } else {
      fx.style.transform = pos;
    }
    fx.classList.add('show');
    const art = fx.firstElementChild;
    art.getAnimations().forEach((a) => a.cancel());
    art.animate(
      tool === 'batter'
        ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-38deg)' }, { transform: 'rotate(-8deg)' }]
        : [{ transform: 'translateY(-6px)' }, { transform: 'translateY(5px) rotate(-10deg)' }, { transform: 'translateY(0)' }],
      { duration: 380, easing: 'ease-in-out' },
    );
    clearTimeout(this.pourHide);
    this.pourHide = setTimeout(() => fx.classList.remove('show'), 600);
  }

  flyToTray(i, kind) {
    const from = this.grill.rect(i);
    const to = this.trayView.rect(kind);
    const fly = document.createElement('img');
    fly.src = FISH_IMG;
    fly.className = 'fly-fish';
    fly.style.left = `${from.left + from.width / 2 - 24}px`;
    fly.style.top = `${from.top + from.height / 2 - 16}px`;
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(.7)`;
      fly.style.opacity = '0.2';
    });
    setTimeout(() => fly.remove(), 450);
  }

  hint(text, urgent = false) {
    this.hintEl.textContent = text;
    this.hintHoldUntil = urgent ? performance.now() + 1500 : 0;
  }

  updateHint() {
    if (this.hintHoldUntil && performance.now() < this.hintHoldUntil) return;
    const phases = this.molds.map((m) => m.phase);
    let text;
    if (phases.includes('flip')) text = '아랫면이 익었어요! 빨리 뒤집을수록 황금빛이에요';
    else if (phases.includes('done')) text = '다 익었어요! 탭해서 보관대로 옮기기';
    else if (phases.includes('burnt')) text = '탄 붕어빵은 탭해서 버려요';
    else if (phases.includes('batter')) text = '속재료 통을 골라 반죽 위를 탭하세요';
    else if (countItems(this.tray) > 0 && this.customers.length) text = '손님을 탭해서 붕어빵을 건네세요';
    else if (phases.every((p) => p === 'empty')) text = '주전자를 골라 빈 틀을 탭해 반죽을 부어요';
    else text = '굽는 중… 노릇해지면 뒤집어요';
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  addNpcCustomer() {
    const r = Math.random();
    const count = r < 0.3 ? 1 : r < 0.6 ? 2 : r < 0.92 ? 3 : 4;
    const items = {};
    const favorite = pick(this.menu);
    for (let i = 0; i < count; i++) {
      const k = Math.random() < 0.7 ? favorite : pick(this.menu);
      items[k] = (items[k] || 0) + 1;
    }
    const maxPatience = (26 + Math.random() * 14) * this.boost;
    this.addCustomer({
      kind: 'npc',
      tag: pick(NPC_TAGS),
      face: portrait(randomPerson(Math.floor(Math.random() * 400)), { size: 180 }),
      message: npcOrderMessage(items),
      items,
      price: priceOfItems(items),
      patience: maxPatience,
      maxPatience,
    });
  }

  addUserCustomer(order) {
    if (this.customers.some((c) => c.orderId === order.id)) return;
    this.removeThumbsVisitor(order.buyerId, true);
    const c = this.addCustomer({
      kind: 'user',
      tag: `${order.buyerName} 사장님`,
      name: order.buyerName,
      face: presetPortrait(order.buyerCharacter, { size: 180 }),
      message: order.note || '붕어빵 주세요!',
      items: itemsOf(order),
      price: order.price,
      orderId: order.id,
      buyerId: order.buyerId,
      character: order.buyerCharacter,
    });
    this.updateUserMessages(c, order);
  }

  onThumbs({ fromId, fromName, fromCharacter, count }) {
    const n = Math.max(1, Math.min(20, count | 0));
    const now = Date.now();
    if (now - (this.thumbsToastAt.get(fromId) || 0) > 4000) {
      this.thumbsToastAt.set(fromId, now);
      this.toast(`${fromName}님이 따봉을 보냈어요 👍`, 'pink');
    }
    if (!this.active) return;

    // 주문한 손님이면 그 손님이, 아니면 잠깐 길가에 나타나서 따봉 포즈
    const customer = this.customers.find((c) => c.buyerId === fromId && !c.leaving);
    const actor = customer
      ? { el: customer.el, face: customer.el.querySelector('.customer-face'), normal: customer.face, character: customer.character }
      : this.thumbsVisitor(fromId, fromName, fromCharacter);
    if (!actor?.face) return;
    this.revealCustomer(actor.el);
    const posed = presetPortrait(actor.character || fromCharacter, { size: 180, pose: 'thumbs' });

    // 서버에는 0.4초 단위로 묶여 오므로 같은 간격 안에 나눠서 연타처럼 재생
    const beats = Math.min(n, 8);
    for (let i = 0; i < beats; i++) {
      setTimeout(() => {
        if (!actor.face.isConnected) return;
        actor.face.src = posed;
        actor.face.classList.add('posed');
        restartAnim(actor.face, 'thumbs-hop');
        this.thumbPop(actor.face);
      }, (i * 400) / beats);
    }
    clearTimeout(actor.revertTimer);
    actor.revertTimer = setTimeout(() => {
      if (actor.visitor) return this.removeThumbsVisitor(fromId);
      actor.face.src = actor.normal;
      actor.face.classList.remove('posed', 'thumbs-hop');
    }, actor.visitor ? 2400 : 1100);
  }

  thumbsVisitor(id, name, character) {
    let v = this.thumbVisitors.get(id);
    if (v) return v;
    const el = document.createElement('div');
    el.className = 'customer user thumb-visitor';
    el.innerHTML = `
      <p class="visitor-bubble">👍 따봉!</p>
      <img class="customer-face" alt="">
      <span class="customer-tag">${escapeHtml(name)} 사장님</span>`;
    const face = el.querySelector('.customer-face');
    face.src = presetPortrait(character, { size: 180 });
    this.customersEl.prepend(el);
    this.emptyEl.classList.add('hidden');
    v = { el, face, normal: face.src, character, visitor: true };
    this.thumbVisitors.set(id, v);
    return v;
  }

  removeThumbsVisitor(id, instant = false) {
    const v = this.thumbVisitors.get(id);
    if (!v) return;
    this.thumbVisitors.delete(id);
    clearTimeout(v.revertTimer);
    if (instant) v.el.remove();
    else {
      v.el.classList.add('leaving');
      setTimeout(() => v.el.remove(), 450);
    }
    if (!this.customers.length && !this.thumbVisitors.size) this.emptyEl.classList.remove('hidden');
  }

  // 손님 줄이 가로로 넘치면 따봉 보낸 손님이 보이도록 스크롤
  revealCustomer(el) {
    const row = this.customersEl;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left >= row.scrollLeft && right <= row.scrollLeft + row.clientWidth) return;
    row.scrollTo({ left: Math.max(0, left - (row.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' });
  }

  thumbPop(anchor) {
    const host = this.el.getBoundingClientRect();
    const src = anchor.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'thumb-pop';
    el.textContent = Math.random() < 0.15 ? '❤️' : '👍';
    el.style.left = `${src.left - host.left + src.width * (0.55 + Math.random() * 0.35)}px`;
    el.style.top = `${src.top - host.top + src.height * 0.15}px`;
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
    el.addEventListener('animationend', () => el.remove());
    this.el.appendChild(el);
  }

  addCustomer(c) {
    const el = document.createElement('div');
    el.className = `customer ${c.kind}`;
    const chips = Object.entries(c.items)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `<span class="chip-item"><img src="${FISH_IMG}" alt="">${fillingIcon(k, 14)}${FILLINGS[k]?.short} ×${n}</span>`);
    el.innerHTML = `
      <button class="order-bubble">
        <p class="order-msg">"${escapeHtml(c.message)}"</p>
        <div class="order-items">${chips.join('')}</div>
        <div class="order-foot"><span class="ready-badge"></span><span class="order-price">${won(c.price)}</span></div>
        <div class="patience"><i></i></div>
      </button>
      <img class="customer-face" src="${c.face}" alt="">
      <span class="customer-tag">${escapeHtml(c.tag)}</span>
      ${c.kind === 'user' ? `<div class="reply-chips">${SELLER_REPLIES.slice(0, 2).map((t) => `<button data-reply="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>` : ''}`;
    el.querySelector('.order-bubble').addEventListener('click', () => this.serve(c));
    el.querySelector('.customer-face').addEventListener('click', () => this.serve(c));
    el.querySelectorAll('[data-reply]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      net.post('/api/order/message', { orderId: c.orderId, text: b.dataset.reply }).then(() => this.toast('답장을 보냈어요')).catch((err) => this.toast(err.message));
    }));
    c.el = el;
    c.msgEl = el.querySelector('.order-msg');
    c.barWrap = el.querySelector('.patience');
    c.barEl = el.querySelector('.patience i');
    c.readyEl = el.querySelector('.ready-badge');
    this.customersEl.appendChild(el);
    this.customers.push(c);
    this.refreshReady();
    this.emptyEl.classList.add('hidden');
    if (c.kind === 'user') this.toast(`${c.name} 사장님이 주문했어요!`, 'pink');
    return c;
  }

  updateUserMessages(c, order) {
    const fromBuyer = (order.messages || []).filter((m) => m.from === 'buyer');
    const latest = fromBuyer[fromBuyer.length - 1];
    if (latest && latest.at !== c.lastMsgAt) {
      if (c.lastMsgAt) this.toast(`${c.name}: ${latest.text}`, 'pink');
      c.lastMsgAt = latest.at;
      c.msgEl.innerHTML = `<span class="new-msg">💬</span> "${escapeHtml(latest.text)}"`;
      c.el.classList.remove('ping');
      void c.el.offsetWidth;
      c.el.classList.add('ping');
    }
  }

  refreshReady() {
    for (const c of this.customers) {
      if (!c.readyEl || c.serving) continue;
      const lack = Object.entries(c.items).map(([k, n]) => [k, Math.max(0, n - (this.tray[k] || 0))]).filter(([, n]) => n > 0);
      const ready = !lack.length;
      c.el.classList.toggle('ready', ready);
      c.readyEl.className = `ready-badge ${ready ? 'ok' : 'lack'}`;
      c.readyEl.textContent = ready
        ? '✓ 전달 가능'
        : `${lack.map(([k, n]) => `${FILLINGS[k]?.short} ${n}`).join('·')} 부족`;
    }
  }

  removeCustomer(c) {
    c.leaving = true;
    this.customers = this.customers.filter((x) => x !== c);
    c.el.classList.add('leaving');
    setTimeout(() => c.el.remove(), 450);
    if (!this.customers.length && !this.thumbVisitors.size) this.emptyEl.classList.remove('hidden');
  }

  async serve(c) {
    if (c.leaving || c.serving) return;
    const missing = Object.entries(c.items)
      .filter(([k, n]) => (this.tray[k] || 0) < n)
      .map(([k, n]) => `${FILLINGS[k]?.short} ${n - (this.tray[k] || 0)}마리`);
    if (missing.length) {
      c.el.classList.remove('shake');
      void c.el.offsetWidth;
      c.el.classList.add('shake');
      this.hint(`${missing.join(', ')}가 더 필요해요`, true);
      return;
    }
    c.serving = true;
    for (const [k, n] of Object.entries(c.items)) this.tray[k] -= n;
    this.trayView.render(this.tray);
    c.el.classList.remove('ready');
    c.readyEl.className = 'ready-badge ok';
    c.readyEl.textContent = '전달 완료!';
    this.refreshReady();
    const rect = c.el.getBoundingClientRect();
    try {
      if (c.kind === 'npc') await net.post('/api/sale', { items: c.items });
      else await net.post('/api/order/fulfill', { orderId: c.orderId });
      this.stats.sold += countItems(c.items);
      this.stats.revenue += c.price;
      this.renderStats();
      this.moneyPop(rect, `+${won(c.price)}`);
      c.msgEl.textContent = pick(['"감사합니다~"', '"잘 먹을게요!"', '"와 따끈하다!"']);
      setTimeout(() => this.removeCustomer(c), 350);
    } catch (e) {
      for (const [k, n] of Object.entries(c.items)) this.tray[k] += n;
      this.trayView.render(this.tray);
      c.serving = false;
      this.refreshReady();
      this.toast(e.message);
    }
  }

  onOrder(o) {
    if (!this.active || o.sellerId !== net.me?.id) return;
    const c = this.customers.find((x) => x.orderId === o.id);
    if (o.status === 'waiting') {
      if (c) this.updateUserMessages(c, o);
      else this.addUserCustomer(o);
      return;
    }
    if (c && o.status === 'cancelled' && !c.serving) {
      this.toast(o.reason === 'timeout' ? `${c.name}님 주문이 시간 초과로 취소됐어요` : `${c.name}님이 주문을 취소했어요`);
      this.removeCustomer(c);
    }
  }

  moneyPop(rect, text) {
    const pop = document.createElement('div');
    pop.className = 'money-pop';
    pop.textContent = text;
    pop.style.left = `${rect.left + rect.width / 2 - 30}px`;
    pop.style.top = `${rect.top + 10}px`;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
    this.capitalEl.classList.remove('bump');
    void this.capitalEl.offsetWidth;
    this.capitalEl.classList.add('bump');
  }

  renderMoney() {
    this.capitalEl.textContent = won(net.me?.capital);
  }

  renderStats() {
    this.statsEl.textContent = `이번 장사 ${this.stats.sold}마리 · ${won(this.stats.revenue)}`;
  }
}

