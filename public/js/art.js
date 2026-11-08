import { FILLINGS, FILLING_KEYS } from './economy.js';
export const ICONS = {
  bungeoppang: 'assets/cat/bungeoppang.svg',
  gyeranppang: 'assets/cat/gyeranppang.svg',
  takoyaki: 'assets/cat/takoyaki.svg',
  chicken: 'assets/cat/chicken.svg',
  bread: 'assets/cat/bread.svg',
  tanghulu: 'assets/cat/tanghulu.svg',
};

const FISH_VIEWBOX = '4 22 122 84';
let fishTemplate = '';

export async function loadArt() {
  const raw = await fetch(ICONS.bungeoppang).then((r) => r.text());
  fishTemplate = raw
    .replace(/<svg[^>]*>/, `<svg class="fish-svg" viewBox="${FISH_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg">`)
    .replace(/<path id="Ellipse 173"[^>]*\/>/, '')
    .replace(/fill="#FECE62"/g, 'class="f-body" fill="#FECE62"')
    .replace(/stroke="#C59018"/g, 'class="f-line" stroke="#C59018"')
    .replace(/<circle([^>]*)fill="#C59018"/g, '<circle class="f-eye"$1fill="#C59018"');
}

export function fishSvg() {
  return fishTemplate;
}

const STOPS = [
  { d: 0, body: [243, 228, 196], line: [214, 192, 152] },
  { d: 0.5, body: [247, 214, 140], line: [205, 164, 88] },
  { d: 1.0, body: [254, 196, 82], line: [192, 132, 20] },
  { d: 1.3, body: [214, 134, 52], line: [140, 78, 18] },
  { d: 1.6, body: [58, 38, 27], line: [22, 14, 9] },
];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function donenessColors(d) {
  const x = Math.max(0, Math.min(1.6, d));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (x <= b.d) {
      const t = (x - a.d) / (b.d - a.d);
      return { body: rgb(mix(a.body, b.body, t)), line: rgb(mix(a.line, b.line, t)) };
    }
  }
  const last = STOPS[STOPS.length - 1];
  return { body: rgb(last.body), line: rgb(last.line) };
}

export function paintFish(el, d) {
  const { body, line } = donenessColors(d);
  el.querySelectorAll('.f-body').forEach((p) => p.setAttribute('fill', body));
  el.querySelectorAll('.f-line').forEach((p) => p.setAttribute('stroke', line));
  el.querySelectorAll('.f-eye').forEach((p) => p.setAttribute('fill', line));
}

let svgSeq = 0;

export function kettleSvg() {
  const k = `kt${++svgSeq}`;
  return `
<svg viewBox="0 0 120 104" xmlns="http://www.w3.org/2000/svg" class="tool-art kettle-art">
  <defs>
    <linearGradient id="${k}-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF4B0"/><stop offset=".3" stop-color="#FFD84A"/><stop offset=".65" stop-color="#EAAA10"/><stop offset="1" stop-color="#A86F05"/>
    </linearGradient>
    <linearGradient id="${k}-lid" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFE98A"/><stop offset=".6" stop-color="#F2BC22"/><stop offset="1" stop-color="#B98208"/>
    </linearGradient>
  </defs>
  <path d="M34 66 C20 62 10 50 6 34 C5 30 8 28 11 30 L15 33 C19 45 27 53 38 56 Z" fill="url(#${k}-gold)" stroke="#8A5A00" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="9" cy="31" rx="4.5" ry="3" fill="#7A4E00"/>
  <path d="M40 34 C40 6 80 6 80 34" fill="none" stroke="#2A2320" stroke-width="7" stroke-linecap="round"/>
  <path d="M43 30 C44 13 76 13 77 30" fill="none" stroke="#5B4F48" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  <path d="M24 66 C24 44 40 33 60 33 C80 33 96 44 96 66 C96 88 80 98 60 98 C40 98 24 88 24 66 Z" fill="url(#${k}-gold)" stroke="#8A5A00" stroke-width="2.2"/>
  <path d="M27 72 C44 80 76 80 93 72" fill="none" stroke="#B57E06" stroke-width="2" opacity=".55"/>
  <path d="M40 36 C42 25 78 25 80 36 Z" fill="url(#${k}-lid)" stroke="#8A5A00" stroke-width="1.8" stroke-linejoin="round"/>
  <ellipse cx="60" cy="36" rx="21" ry="4.5" fill="#F6C93A" stroke="#8A5A00" stroke-width="1.6"/>
  <ellipse cx="60" cy="21" rx="7" ry="5.5" fill="#2A2320"/>
  <ellipse cx="58" cy="19.5" rx="2.5" ry="1.6" fill="#7A6D66"/>
  <ellipse cx="42" cy="58" rx="7" ry="15" transform="rotate(-24 42 58)" fill="#FFFFFF" opacity=".6"/>
  <ellipse cx="50" cy="44" rx="3" ry="2" fill="#FFFFFF" opacity=".8"/>
  <path d="M84 52 C88 60 88 72 84 80" fill="none" stroke="#FFF3B5" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
</svg>`;
}

export function containerSvg(kind) {
  const uid = `${kind}${++svgSeq}`;
  const red = kind === 'red';
  const f = FILLINGS[kind] || FILLINGS.cream;
  const { base, top } = f;
  const label = f.short;
  const labelColor = f.label;
  const textures = {
    red: '<ellipse cx="34" cy="36" rx="3.2" ry="2.2" fill="#3A0F10"/><ellipse cx="46" cy="40" rx="3" ry="2" fill="#8E3B3B"/><ellipse cx="58" cy="35" rx="3.4" ry="2.3" fill="#3A0F10"/><ellipse cx="80" cy="39" rx="3" ry="2" fill="#3A0F10"/><ellipse cx="90" cy="35" rx="2.6" ry="1.8" fill="#8E3B3B"/><ellipse cx="28" cy="41" rx="2.4" ry="1.6" fill="#8E3B3B"/><ellipse cx="52" cy="35" rx="4" ry="1.2" fill="#B86B6B" opacity=".7"/>',
    cream: '<path d="M24 38 C34 32 44 42 54 36 C62 31 72 40 82 35 C88 32 94 36 96 35" fill="none" stroke="#FFF6C8" stroke-width="3" stroke-linecap="round"/><path d="M30 42 C40 38 50 44 60 40" fill="none" stroke="#E2AE2C" stroke-width="2" stroke-linecap="round" opacity=".7"/>',
    sweetpotato: '<ellipse cx="32" cy="37" rx="5" ry="2.6" fill="#F8C77E"/><ellipse cx="52" cy="40" rx="4" ry="2.2" fill="#B8601C"/><ellipse cx="66" cy="35" rx="5" ry="2.4" fill="#F8C77E"/><ellipse cx="88" cy="38" rx="4" ry="2.2" fill="#B8601C"/>',
    choco: '<path d="M24 37 C36 32 46 41 58 36 C68 32 80 40 96 35" fill="none" stroke="#8A5A3C" stroke-width="3" stroke-linecap="round"/><ellipse cx="40" cy="40" rx="2.6" ry="1.6" fill="#2A160C"/><ellipse cx="80" cy="36" rx="2.6" ry="1.6" fill="#2A160C"/>',
    pizza: '<circle cx="32" cy="37" r="3.6" fill="#B0251A"/><circle cx="56" cy="39" r="3.4" fill="#B0251A"/><circle cx="84" cy="36" r="3.6" fill="#B0251A"/><path d="M40 35 l6 2 M64 34 l6 3 M72 40 l5 -1" stroke="#3E8E3A" stroke-width="2" stroke-linecap="round"/>',
  };
  const texture = textures[kind] || textures.cream;
  return `
<svg viewBox="0 0 120 104" xmlns="http://www.w3.org/2000/svg" class="tool-art tub-art">
  <defs>
    <linearGradient id="tub-front-${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F2F5F7"/><stop offset="1" stop-color="#D5DDE3"/>
    </linearGradient>
    <linearGradient id="tub-spoon-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#C9D1D8"/><stop offset="1" stop-color="#8C969F"/>
    </linearGradient>
  </defs>
  <path d="M12 38 L108 38 L100 96 Q99 101 93 101 L27 101 Q21 101 20 96 Z" fill="url(#tub-front-${uid})" stroke="#AEB9C2" stroke-width="2" stroke-linejoin="round"/>
  <rect x="8" y="26" width="104" height="22" rx="9" fill="#F7F9FA" stroke="#AEB9C2" stroke-width="2"/>
  <rect x="14" y="29.5" width="92" height="15" rx="6.5" fill="${base}"/>
  <path d="M14 36 C30 31 90 31 106 36 L106 34 C90 28 30 28 14 34 Z" fill="${top}" opacity=".9"/>
  ${texture}
  <ellipse cx="70" cy="37" rx="10" ry="4" fill="url(#tub-spoon-${uid})" stroke="#7E8892" stroke-width="1.2"/>
  <ellipse cx="70" cy="37.5" rx="6.5" ry="2.2" fill="${base}"/>
  <path d="M76 35 L108 6" stroke="#7E8892" stroke-width="8" stroke-linecap="round"/>
  <path d="M76 35 L108 6" stroke="url(#tub-spoon-${uid})" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M84 26 L104 8" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity=".9"/>
  <rect x="34" y="58" width="52" height="26" rx="5" fill="#FFF7DC" stroke="#E2CF9E" stroke-width="1.5" transform="rotate(-3 60 71)"/>
  <text x="60" y="76" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="700" font-size="${label.length <= 1 ? 16 : label.length === 2 ? 14 : 12}" fill="${labelColor}" transform="rotate(-3 60 71)">${label}</text>
  <path d="M24 46 L28 92" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".8"/>
</svg>`;
}

export const ORDER_LINES = {
  npc: [
    (o) => `${o.text} 주세요!`,
    (o) => `${o.text}요~`,
    (o) => `${o.text} 포장해 주세요`,
    (o) => `안녕하세요! ${o.text} 부탁해요`,
    (o) => `${o.text}… 따끈한 걸로요!`,
    (o) => `사장님~ ${o.text}!`,
  ],
};

// 받침 있으면 '으로', 없으면 '로'
const ro = (word) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 ? '으로' : '로';
};

export function orderText(items) {
  const keys = FILLING_KEYS.filter((k) => items?.[k] > 0);
  if (!keys.length) return '';
  const total = keys.reduce((s, k) => s + items[k], 0);
  if (keys.length === 1) {
    const name = FILLINGS[keys[0]].short;
    return total >= 3 ? `${name}${ro(name)} ${total}마리` : `${name} ${total}개`;
  }
  const parts = keys.map((k) => `${FILLINGS[k].short} ${items[k]}개`);
  return parts.length === 2 ? `${parts[0]}랑 ${parts[1]}` : parts.join(', ');
}

export function npcOrderMessage(items) {
  const lines = ORDER_LINES.npc;
  const make = lines[Math.floor(Math.random() * lines.length)];
  return make({ text: orderText(items) });
}

export const QUICK_MESSAGES = ['맛있게 부탁해요!', '천천히 하셔도 돼요', '바삭하게 해주세요', '추워요 🥶', '냄새 너무 좋아요', '단골 될게요!'];
export const SELLER_REPLIES = ['금방 드릴게요!', '감사합니다 😊', '조금만 기다려요~', '바삭하게 구울게요!'];

// 속재료 아이콘 (실제 재료 모양). size는 px
export function fillingIcon(key, size = 24) {
  const id = `fi${++svgSeq}`;
  const art = {
    red: `
      <ellipse cx="24" cy="38" rx="18" ry="5" fill="#000" opacity=".12"/>
      <ellipse cx="17" cy="30" rx="7" ry="5.2" transform="rotate(-20 17 30)" fill="#6B1F22"/>
      <ellipse cx="30" cy="31" rx="7" ry="5.2" transform="rotate(15 30 31)" fill="#5A181B"/>
      <ellipse cx="23" cy="22" rx="7" ry="5.2" transform="rotate(5 23 22)" fill="#7A2A2D"/>
      <ellipse cx="34" cy="21" rx="6" ry="4.6" transform="rotate(-30 34 21)" fill="#651C1F"/>
      <ellipse cx="13" cy="20" rx="6" ry="4.6" transform="rotate(25 13 20)" fill="#5A181B"/>
      <path d="M14 29 q3 -2 6 0 M27 30 q3 -2 6 0 M20 21 q3 -2 6 0 M31 20 q2 -2 5 -1 M10 19 q2 -2 5 0" stroke="#F3D3D3" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>`,
    cream: `
      <ellipse cx="24" cy="40" rx="17" ry="4.5" fill="#000" opacity=".12"/>
      <path d="M8 36 C8 29 14 28 16 28 C14 22 19 18 24 19 C24 13 30 11 31 7 C35 12 34 17 31 20 C36 20 39 25 36 29 C40 30 41 36 38 38 Z" fill="url(#${id}c)" stroke="#D99A1A" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M14 33 C20 31 28 31 34 33 M18 26 C22 24.5 27 24.5 30 26" stroke="#FFF3C4" stroke-width="2" fill="none" stroke-linecap="round"/>
      <defs><linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A0"/><stop offset="1" stop-color="#F4C63F"/></linearGradient></defs>`,
    sweetpotato: `
      <ellipse cx="24" cy="40" rx="18" ry="4" fill="#000" opacity=".12"/>
      <path d="M6 28 C6 18 18 12 30 14 C40 16 44 24 42 30 C40 37 28 40 18 38 C10 37 6 33 6 28 Z" fill="#9C3D5C" stroke="#6E2440" stroke-width="1.6"/>
      <ellipse cx="38" cy="25" rx="5.5" ry="8.5" transform="rotate(20 38 25)" fill="#F8C35C" stroke="#E09A2A" stroke-width="1.4"/>
      <ellipse cx="38" cy="25" rx="2.4" ry="4.2" transform="rotate(20 38 25)" fill="#FBD98A"/>
      <path d="M12 24 q4 -2 8 -1 M15 32 q5 1 9 0 M22 19 q3 -1 6 0" stroke="#C26583" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M6 28 q-3 1 -4 4" stroke="#6E2440" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    choco: `
      <ellipse cx="24" cy="41" rx="16" ry="3.5" fill="#000" opacity=".12"/>
      <g transform="rotate(-12 24 24)">
        <rect x="9" y="8" width="30" height="32" rx="3" fill="#5A3422" stroke="#3A1E12" stroke-width="1.6"/>
        <path d="M19 8 V40 M29 8 V40 M9 18.7 H39 M9 29.3 H39" stroke="#3A1E12" stroke-width="1.6"/>
        <path d="M11 10 h6 M21 10 h6 M31 10 h6 M11 20.5 h6 M21 20.5 h6 M31 20.5 h6" stroke="#8A5A3C" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M9 30 H39 V38 Q39 40 37 40 H11 Q9 40 9 38 Z" fill="#C9302C"/>
        <path d="M9 30 L14 33 L19 30 L24 33 L29 30 L34 33 L39 30" fill="none" stroke="#E8E2D8" stroke-width="1.6"/>
      </g>`,
    pizza: `
      <ellipse cx="24" cy="41" rx="15" ry="3.5" fill="#000" opacity=".12"/>
      <path d="M24 42 L7 12 Q24 4 41 12 Z" fill="#F7C948" stroke="#D99A1A" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M7 12 Q24 4 41 12 L39 16 Q24 9 9 16 Z" fill="#D9893A" stroke="#B5682A" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="19" cy="21" r="3.6" fill="#C0392B"/><circle cx="29" cy="22" r="3.4" fill="#C0392B"/><circle cx="24" cy="31" r="3.2" fill="#C0392B"/>
      <path d="M15 27 l3 1 M31 29 l2 -2 M22 17 l3 0" stroke="#3E8E3A" stroke-width="2" stroke-linecap="round"/>`,
  }[key];
  if (!art) return '';
  return `<svg class="filling-icon" viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${art}</svg>`;
}
