const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = 'bv_session';
const SESSION_TTL_SEC = 12 * 60 * 60;
export const GUEST_TTL_SEC = 30 * 24 * 60 * 60;
export const ACCOUNT_TTL_SEC = 30 * 24 * 60 * 60;

function toB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(secret, { uid, name, social }, ttl = SESSION_TTL_SEC) {
  const payload = { uid, name, social, exp: Math.floor(Date.now() / 1000) + ttl };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifySession(secret, token) {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(await hmac(secret, body), sig)) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64url(body)));
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function sessionCookie(token, secure, ttl = SESSION_TTL_SEC) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure ? '; Secure' : ''}`;
}

export class AuthServiceError extends Error {}

export async function verifyAppToken(env, token) {
  const res = await fetch(`${env.THREEDOLLARS_API}/api/v4/my/user`, {
    headers: {
      Authorization: token,
      Accept: 'application/json',
      'User-Agent': env.THREEDOLLARS_UA,
    },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new AuthServiceError(`threedollars api ${res.status}`);
  const body = await res.json();
  const user = body && body.data;
  if (!user || user.userId == null) return null;
  return { uid: String(user.userId), name: user.name || '', social: user.socialType || null };
}

export async function rememberAppUser(env, user) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO app_users (user_id, app_name, social_type, first_seen_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(user_id) DO UPDATE SET app_name = excluded.app_name, social_type = excluded.social_type, last_seen_at = excluded.last_seen_at`,
  ).bind(user.uid, user.name, user.social, now).run();
}

export async function linkAccount(env, user, current) {
  const now = Date.now();
  const find = () => env.DB.prepare('SELECT player_key FROM accounts WHERE threedollars_user_id = ?1').bind(user.uid).first();
  let row = await find();
  if (!row) {
    let playerKey = null;
    let fromGuest = 0;
    const guestUid = current?.uid?.startsWith('guest:') ? current.uid : null;
    if (guestUid) {
      const taken = await env.DB.prepare('SELECT 1 AS taken FROM accounts WHERE player_key = ?1').bind(guestUid).first();
      if (!taken) {
        playerKey = guestUid;
        fromGuest = 1;
      }
    }
    playerKey ||= `p:${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO accounts (threedollars_user_id, player_key, app_name, social_type, linked_from_guest, first_seen_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(threedollars_user_id) DO NOTHING`,
    ).bind(user.uid, playerKey, user.name, user.social, fromGuest, now).run();
    row = await find();
  } else {
    await env.DB.prepare('UPDATE accounts SET app_name = ?2, social_type = ?3, last_seen_at = ?4 WHERE threedollars_user_id = ?1')
      .bind(user.uid, user.name, user.social, now).run();
  }
  const session = { uid: row.player_key, name: user.name, social: user.social };
  await rememberAppUser(env, session);
  return session;
}
