import { Village } from './village.js';
import {
  GUEST_TTL_SEC,
  SESSION_COOKIE,
  AuthServiceError,
  readCookie,
  rememberAppUser,
  sessionCookie,
  signSession,
  verifyAppToken,
  verifySession,
} from './auth.js';

export { Village };

const VILLAGE_NAME = 'main';

async function serveIndex(request, env, setCookie) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/', request.url), { method: 'GET' }));
  const res = new Response(asset.body, asset);
  res.headers.set('Cache-Control', 'no-store');
  if (setCookie) res.headers.append('Set-Cookie', setCookie);
  return res;
}

const isGuestMode = (env) => env.AUTH_MODE === 'guest';

async function handleIndex(request, env, url) {
  const appToken = request.headers.get('Authorization');
  if (appToken && !isGuestMode(env)) {
    try {
      const user = await verifyAppToken(env, appToken);
      if (user) {
        await rememberAppUser(env, user);
        const token = await signSession(env.SESSION_SECRET, user);
        return serveIndex(request, env, sessionCookie(token, url.protocol === 'https:'));
      }
      return serveIndex(request, env, `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
    } catch (e) {
      if (e instanceof AuthServiceError) console.error('auth service error', e.message);
      else console.error(e);
    }
  }
  return serveIndex(request, env, null);
}

async function handleDevLogin(request, env, url) {
  if (env.DEV_AUTH !== '1') return new Response('Not found', { status: 404 });
  const name = (url.searchParams.get('name') || '').trim().slice(0, 10);
  if (!name) return new Response('name is required', { status: 400 });
  const user = { uid: `dev:${name}`, name, social: 'DEV' };
  await rememberAppUser(env, user);
  const token = await signSession(env.SESSION_SECRET, user);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': sessionCookie(token, url.protocol === 'https:') },
  });
}

async function handleGuestLogin(request, env, url) {
  if (!isGuestMode(env)) return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await request.json().catch(() => ({}));
  if (env.INVITE_CODE && String(body.code || '').trim() !== env.INVITE_CODE) {
    return Response.json({ ok: false, error: '입장 코드가 맞지 않아요' }, { status: 403 });
  }
  const existing = await verifySession(env.SESSION_SECRET, readCookie(request, SESSION_COOKIE));
  const user = existing || { uid: `guest:${crypto.randomUUID()}`, name: '', social: 'GUEST' };
  await rememberAppUser(env, { uid: user.uid, name: user.name || '', social: 'GUEST' });
  const token = await signSession(env.SESSION_SECRET, user, GUEST_TTL_SEC);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token, url.protocol === 'https:', GUEST_TTL_SEC) } });
}

function rejectSocket(payload, code) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify(payload));
  server.close(code, payload.t);
  return new Response(null, { status: 101, webSocket: client });
}

async function handleSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
  const stub = env.VILLAGE.get(env.VILLAGE.idFromName(VILLAGE_NAME));
  const headers = new Headers(request.headers);
  headers.delete('X-User-Id');
  headers.delete('X-App-Name');
  headers.delete('X-Viewer');

  if (url.searchParams.get('viewer') === '1') {
    headers.set('X-Viewer', '1');
    return stub.fetch(new Request(request, { headers }));
  }

  const session = await verifySession(env.SESSION_SECRET, readCookie(request, SESSION_COOKIE));
  if (!session) {
    return rejectSocket({ t: 'unauthorized', dev: env.DEV_AUTH === '1', guest: isGuestMode(env), inviteRequired: isGuestMode(env) && !!env.INVITE_CODE }, 4001);
  }
  headers.set('X-User-Id', session.uid);
  headers.set('X-App-Name', encodeURIComponent(session.name || ''));
  return stub.fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/':
      case '/index.html':
        return handleIndex(request, env, url);
      case '/ws':
        return handleSocket(request, env, url);
      case '/dev-login':
        return handleDevLogin(request, env, url);
      case '/guest-login':
        return handleGuestLogin(request, env, url);
      default:
        return env.ASSETS.fetch(request);
    }
  },
};
