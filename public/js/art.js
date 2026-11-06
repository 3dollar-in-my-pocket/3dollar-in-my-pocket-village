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
  const base = red ? '#55191A' : '#F4C63F';
  const top = red ? '#7A2A2A' : '#FFE07A';
  const label = red ? '팥' : '슈크림';
  const labelColor = red ? '#6B2E2E' : '#B57F00';
  const texture = red
    ? '<ellipse cx="34" cy="36" rx="3.2" ry="2.2" fill="#3A0F10"/><ellipse cx="46" cy="40" rx="3" ry="2" fill="#8E3B3B"/><ellipse cx="58" cy="35" rx="3.4" ry="2.3" fill="#3A0F10"/><ellipse cx="80" cy="39" rx="3" ry="2" fill="#3A0F10"/><ellipse cx="90" cy="35" rx="2.6" ry="1.8" fill="#8E3B3B"/><ellipse cx="28" cy="41" rx="2.4" ry="1.6" fill="#8E3B3B"/><ellipse cx="52" cy="35" rx="4" ry="1.2" fill="#B86B6B" opacity=".7"/>'
    : '<path d="M24 38 C34 32 44 42 54 36 C62 31 72 40 82 35 C88 32 94 36 96 35" fill="none" stroke="#FFF6C8" stroke-width="3" stroke-linecap="round"/><path d="M30 42 C40 38 50 44 60 40" fill="none" stroke="#E2AE2C" stroke-width="2" stroke-linecap="round" opacity=".7"/>';
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
  <text x="60" y="76" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="700" font-size="${red ? 16 : 12}" fill="${labelColor}" transform="rotate(-3 60 71)">${label}</text>
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

export function orderText(red, cream) {
  const parts = [];
  if (red) parts.push(`팥 ${red}개`);
  if (cream) parts.push(`슈크림 ${cream}개`);
  if (red && cream) return `${parts[0]}랑 ${parts[1]}`;
  if (red + cream >= 3) return `${red ? '팥' : '슈크림'}으로 ${red + cream}마리`;
  return parts[0];
}

export function npcOrderMessage(red, cream) {
  const lines = ORDER_LINES.npc;
  const make = lines[Math.floor(Math.random() * lines.length)];
  return make({ text: orderText(red, cream) });
}

export const QUICK_MESSAGES = ['맛있게 부탁해요!', '천천히 하셔도 돼요', '바삭하게 해주세요', '추워요 🥶', '냄새 너무 좋아요', '단골 될게요!'];
export const SELLER_REPLIES = ['금방 드릴게요!', '감사합니다 😊', '조금만 기다려요~', '바삭하게 구울게요!'];
