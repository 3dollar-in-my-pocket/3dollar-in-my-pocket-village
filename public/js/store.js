import { net } from './net.js';
import { won } from './data.js';
import { portrait, SHOPKEEPER } from './people.js';
import { fillingIcon } from './art.js';
import { FILLINGS, FILLING_KEYS, BASE_FILLINGS, EQUIPMENT, EQUIPMENT_KEYS, equipCost, equipEffect, normalizeUpgrades, moldCount, trayCap } from './economy.js';

const GREETINGS = ['어서 와요! 오늘은 뭐 보러 왔어요?', '장사는 잘 돼요? 좋은 물건 많아요~', '오, 사장님! 필요한 거 있으면 말해요'];
const THANKS = ['고마워요! 장사 대박 나요~', '좋은 선택이에요! 손님들이 좋아할 거예요', '잘 쓰세요! 또 와요~'];
// '굽는 시간 -16%' → '굽는 시간 -24%' 이면 바뀌는 부분('-24%')만
function nextOnly(cur, next) {
  const a = cur.split(' ');
  const b = next.split(' ');
  let i = 0;
  while (i < b.length - 1 && a[i] === b[i]) i++;
  return b.slice(i).join(' ');
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 마을 상점(붕어상회): 상회 사장님에게 장비·속재료를 사는 화면
export class Store {
  constructor({ toast, onClose }) {
    this.toast = toast;
    this.onClose = onClose;
    this.el = document.getElementById('store');
    this.panel = document.getElementById('store-panel');
    this.bubble = document.getElementById('store-bubble');
    this.face = document.getElementById('store-face');
    this.capitalEl = document.getElementById('store-capital');
    this.active = false;
    this.tab = 'equip';
    document.getElementById('store-close').addEventListener('click', () => this.close());
    net.on('player', (p) => {
      if (this.active && p.id === net.me?.id) this.render();
    });
  }

  open() {
    this.active = true;
    this.face.src = portrait(SHOPKEEPER, { size: 360, pose: 'front' });
    this.say(pick(GREETINGS));
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    this.onClose?.();
  }

  say(text) {
    this.bubble.textContent = text;
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  render() {
    const me = net.me;
    if (!me) return;
    const u = normalizeUpgrades(me.upgrades);
    this.capitalEl.textContent = won(me.capital);
    const scroll = this.panel.querySelector('.store-list')?.scrollTop || 0;

    const mine = `
      <div class="store-mine">
        <p class="store-mine-title">내 가게 장비</p>
        <div class="store-mine-chips">
          <span>${EQUIPMENT.fire.icon} 화력 Lv.${u.fire}</span>
          <span>${EQUIPMENT.molds.icon} 틀 ${moldCount(u)}칸</span>
          <span>${EQUIPMENT.tray.icon} 보관 ${trayCap(u)}마리</span>
          <span>${EQUIPMENT.sign.icon} 간판 Lv.${u.sign}</span>
        </div>
        <div class="store-mine-fillings">${u.fillings.map((k) => `<span title="${FILLINGS[k].short}">${fillingIcon(k, 22)}<em>${FILLINGS[k].short}</em></span>`).join('')}</div>
      </div>`;

    const buyBtn = (kind, id, cost) => {
      if (cost == null) return '<span class="store-max">최고 단계</span>';
      return `<button class="btn primary small store-buy${cost > me.capital ? ' lack' : ''}" data-kind="${kind}" data-id="${id}">${won(cost)}</button>`;
    };
    const equipRows = EQUIPMENT_KEYS.map((k) => {
      const e = EQUIPMENT[k];
      const lv = u[k];
      const cost = equipCost(k, lv);
      const pips = Array.from({ length: e.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `
        <div class="store-row">
          <span class="store-icon">${e.icon}</span>
          <div class="store-info">
            <strong>${e.name} <span class="store-lv">Lv.${lv}/${e.max}</span></strong>
            <span class="store-pips">${pips}</span>
            <span class="store-effect">${equipEffect(k, lv)}${cost != null ? ` → <b>${nextOnly(equipEffect(k, lv), equipEffect(k, lv + 1))}</b>` : ''}</span>
          </div>
          ${buyBtn('equip', k, cost)}
        </div>`;
    }).join('');
    const fillingRows = FILLING_KEYS.map((k) => {
      const f = FILLINGS[k];
      const owned = u.fillings.includes(k);
      return `
        <div class="store-row${owned ? ' owned' : ''}">
          <span class="store-icon filling">${fillingIcon(k, 34)}</span>
          <div class="store-info">
            <strong>${f.name}</strong>
            <span class="store-effect">1마리 ${won(f.price)}에 팔아요${BASE_FILLINGS.includes(k) ? ' · 기본 메뉴' : ''}</span>
          </div>
          ${owned ? '<span class="store-max">보유 중</span>' : buyBtn('filling', k, f.unlock)}
        </div>`;
    }).join('');

    this.panel.innerHTML = `
      ${mine}
      <div class="store-tabs">
        <button data-tab="equip" class="${this.tab === 'equip' ? 'on' : ''}">장비</button>
        <button data-tab="filling" class="${this.tab === 'filling' ? 'on' : ''}">속재료</button>
      </div>
      <div class="store-list">${this.tab === 'equip' ? equipRows : fillingRows}</div>
      <p class="store-note">${this.tab === 'equip' ? '단계가 오를수록 가격도 올라요 · 다음 장사부터 적용돼요' : '산 속재료는 다음 장사부터 메뉴에 올라가요'}</p>`;
    const list = this.panel.querySelector('.store-list');
    list.scrollTop = scroll;
    this.panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      this.render();
      this.panel.querySelector('.store-list').scrollTop = 0;
    }));
    this.panel.querySelectorAll('.store-buy').forEach((b) => b.addEventListener('click', () => this.buy(b)));
  }

  async buy(btn) {
    const { kind, id } = btn.dataset;
    if (btn.classList.contains('lack')) {
      this.say('어이쿠, 돈이 조금 모자라네요. 장사하고 다시 와요!');
      return;
    }
    btn.disabled = true;
    try {
      const { player } = await net.post('/api/buy', { kind, id });
      net.setMe(player);
      const u = normalizeUpgrades(player.upgrades);
      const name = kind === 'equip' ? `${EQUIPMENT[id].name} Lv.${u[id]}` : FILLINGS[id].name;
      this.toast(`${name} 구매 완료!`, 'good');
      this.say(pick(THANKS));
      this.render();
    } catch (e) {
      this.toast(e.message);
      this.render();
    }
  }
}
