// 서버(src/village.js)와 클라이언트가 같이 쓰는 경제 규칙. DOM을 쓰지 말 것.

export const START_CAPITAL = 10000;

// 마을 상점(붕어상회) 위치. 가게는 이 근처에 차릴 수 없음
export const STORE_POS = { x: 8, z: 15 };
export const STORE_GAP = 6;
export const BUNDLE_SIZE = 3;
export const BUNDLE_DISCOUNT = 1000; // 3마리마다 1천원 할인 (팥·슈크림 3마리 = 2천원)

export const FILLINGS = {
  red: { key: 'red', name: '팥붕어빵', short: '팥', price: 1000, unlock: 0, base: '#55191A', top: '#7A2A2A', label: '#6B2E2E', dot: '#6B2E2E' },
  cream: { key: 'cream', name: '슈크림붕어빵', short: '슈크림', price: 1000, unlock: 0, base: '#F4C63F', top: '#FFE07A', label: '#B57F00', dot: '#F6CF5E' },
  sweetpotato: { key: 'sweetpotato', name: '고구마붕어빵', short: '고구마', price: 1200, unlock: 30000, base: '#E08A2E', top: '#F6B562', label: '#A65A14', dot: '#E08A2E' },
  choco: { key: 'choco', name: '초코붕어빵', short: '초코', price: 1300, unlock: 80000, base: '#4A2A1A', top: '#6E4430', label: '#4A2A1A', dot: '#5A3422' },
  pizza: { key: 'pizza', name: '피자붕어빵', short: '피자', price: 1500, unlock: 200000, base: '#D9412A', top: '#F5C543', label: '#B4301C', dot: '#E0502F' },
};
export const FILLING_KEYS = Object.keys(FILLINGS);
export const BASE_FILLINGS = ['red', 'cream'];

export const EQUIPMENT = {
  fire: { key: 'fire', name: '화력', icon: '🔥', desc: '붕어빵이 더 빨리 익어요', max: 5, base: 8000, growth: 1.8 },
  molds: { key: 'molds', name: '붕어빵 틀', icon: '🐟', desc: '한 번에 더 많이 구워요', max: 2, base: 30000, growth: 2.5 },
  tray: { key: 'tray', name: '보관대', icon: '🧺', desc: '구운 붕어빵을 더 많이 쌓아 둬요', max: 4, base: 5000, growth: 1.7 },
  sign: { key: 'sign', name: '간판', icon: '🪧', desc: '손님이 더 자주 오고 더 오래 기다려요', max: 5, base: 6000, growth: 1.8 },
};
export const EQUIPMENT_KEYS = Object.keys(EQUIPMENT);

// 단계가 오를수록 비싸짐: base × growth^단계, 500원 단위
export function equipCost(key, level) {
  const e = EQUIPMENT[key];
  if (!e || level >= e.max) return null;
  return Math.round((e.base * e.growth ** level) / 500) * 500;
}

export function equipEffect(key, level) {
  switch (key) {
    case 'fire': return level ? `굽는 시간 -${level * 8}%` : '기본 화력';
    case 'molds': return `틀 ${moldCount({ molds: level })}칸`;
    case 'tray': return `종류별 ${trayCap({ tray: level })}마리`;
    case 'sign': return level ? `손님 +${level * 12}%` : '기본 간판';
    default: return '';
  }
}

export function normalizeUpgrades(u) {
  const out = { fillings: [...BASE_FILLINGS] };
  for (const k of EQUIPMENT_KEYS) out[k] = Math.max(0, Math.min(EQUIPMENT[k].max, Math.floor(Number(u?.[k]) || 0)));
  for (const f of Array.isArray(u?.fillings) ? u.fillings : []) {
    if (FILLINGS[f] && !out.fillings.includes(f)) out.fillings.push(f);
  }
  out.fillings.sort((a, b) => FILLING_KEYS.indexOf(a) - FILLING_KEYS.indexOf(b));
  return out;
}

export const moldCount = (u) => 6 + (u?.molds || 0);
export const trayCap = (u) => 12 + 4 * (u?.tray || 0);
export const cookScale = (u) => 1 - 0.08 * (u?.fire || 0);
export const signBoost = (u) => 1 + 0.12 * (u?.sign || 0);

// 주문/판매 품목: { red: 2, sweetpotato: 1 }
export function itemsOf(o) {
  if (o?.items) return o.items;
  return { red: o?.red || 0, cream: o?.cream || 0 };
}

export function countItems(items) {
  let n = 0;
  for (const k of FILLING_KEYS) n += Math.max(0, items?.[k] | 0);
  return n;
}

export function priceOfItems(items) {
  let count = 0;
  let sum = 0;
  for (const k of FILLING_KEYS) {
    const n = Math.max(0, items?.[k] | 0);
    count += n;
    sum += n * FILLINGS[k].price;
  }
  return sum - Math.floor(count / BUNDLE_SIZE) * BUNDLE_DISCOUNT;
}

export function itemsLabel(items) {
  return FILLING_KEYS.filter((k) => items?.[k] > 0).map((k) => `${FILLINGS[k].short} ${items[k]}`).join(' · ');
}

// 알바생: 시간권을 사면 그 시간 동안 사장님이 없을 때 대신 굽고 팔아요.
// 직접 장사보다 확실히 느리게 (분당 약 0.5마리 · 간판 효과는 절반만)
export const PARTTIMER = {
  name: '알바생 붕돌이',
  passes: [
    { id: 'h1', hours: 1, price: 5000 },
    { id: 'h3', hours: 3, price: 13000 },
  ],
  dailyMaxHours: 4, // 하루(KST)에 살 수 있는 근무 시간
  fishPerMin: 0.5,
};
export const parttimerRate = (u) => PARTTIMER.fishPerMin * (1 + (signBoost(u) - 1) / 2); // 분당 마리
