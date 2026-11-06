export const MENU = {
  red: { key: 'red', name: '팥붕어빵', short: '팥' },
  cream: { key: 'cream', name: '슈크림붕어빵', short: '슈크림' },
};

export const priceOf = (count) => Math.floor(count / 3) * 2000 + (count % 3) * 1000;

export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

export const MAP_LIMIT = 34;
export const STALL_GAP = 4.5;

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
