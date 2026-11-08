export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

export const MAP_LIMIT = 34;
export const STALL_GAP = 4.5;

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
