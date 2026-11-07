import { DurableObject } from 'cloudflare:workers';

const START_CAPITAL = 10000;
const MAP_LIMIT = 34;
const STALL_GAP = 4.5;
const ORDER_TIMEOUT_MS = 120 * 1000;
const IDLE_KICK_MS = 10 * 60 * 1000;
const FLUSH_MS = 30 * 1000;
const STATS_MS = 2000;
const MAX_PER_ORDER = 9;
const MAX_PER_SALE = 6;
const MAX_VIEWERS = 30;
const RANKING_SIZE = 50;
const MAX_MESSAGE_BYTES = 4096;
const MSG_BURST = 40;
const MSG_PER_SEC = 15;
const MAX_THUMBS_PER_REQ = 20;

const CHARACTERS = ['beanie', 'bucket', 'apron', 'curly', 'cap', 'earmuff'];
const PHASES = new Set(['empty', 'batter', 'filled', 'side1', 'flip', 'side2', 'done', 'burnt']);
const BOT_GREETINGS = ['주문 받았어요! 금방 구워드릴게요', '어서 오세요~ 바로 구워드릴게요!', '따끈하게 구워드릴게요!'];
const BOT_REPLIES = ['고마워요~ 금방 드릴게요!', '네~ 바삭하게 구울게요!', '조금만 기다려 주세요 😊', '오늘 반죽이 아주 잘 됐어요!'];
const BOT_SEEDS = [
  { id: 'bot-1', nickname: '붕순이', character: 'curly', x: -12, z: -6, capital: 18000, sold: 24 },
  { id: 'bot-2', nickname: '팥돌이', character: 'bucket', x: 13, z: -10, capital: 14000, sold: 15 },
  { id: 'bot-3', nickname: '슈크림왕', character: 'apron', x: 4, z: -18, capital: 11000, sold: 8 },
];

const priceOf = (count) => Math.floor(count / 3) * 2000 + (count % 3) * 1000;
const toCount = (v, max = MAX_PER_ORDER) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const clampCoord = (v) => Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, Number(v) || 0));
const cleanText = (v, max) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const kstDay = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

class GameError extends Error {}

export class Village extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.capacity = Math.max(1, Number(env.VILLAGE_CAPACITY || 50));
    this.features = { thumbs: env.FEATURE_THUMBS === '1' };
    this.players = new Map();
    this.orders = new Map();
    this.grills = new Map();
    this.dirty = new Set();
    this.online = new Set();
    this.lastAction = new Map();
    this.rateMarks = new Map();
    this.rateWindows = new Map();
    this.buckets = new Map();
    this.lastFlush = Date.now();
    this.lastStats = 0;
    this.rankingDirty = true;
    this.timer = null;
    ctx.blockConcurrencyWhile(() => this.restore());
  }

  /* ---------- lifecycle ---------- */

  async restore() {
    const { results } = await this.env.DB.prepare('SELECT * FROM players').all();
    for (const r of results || []) {
      this.players.set(r.user_id, {
        id: r.user_id,
        nickname: r.nickname,
        character: r.avatar,
        capital: r.capital,
        sold: r.sold,
        bought: r.bought,
        x: r.pos_x ?? 0,
        z: r.pos_z ?? 6,
        stall: r.stall_x == null ? null : { x: r.stall_x, z: r.stall_z, open: false, name: `${r.nickname}네 붕어빵` },
      });
    }
    if (this.env.BOTS !== '0') this.seedBots();

    const saved = (await this.ctx.storage.get('orders')) || [];
    for (const o of saved) {
      if (o.status !== 'waiting') continue;
      const buyer = this.players.get(o.buyerId);
      if (buyer) {
        buyer.capital += o.price;
        this.dirty.add(buyer.id);
      }
    }
    await this.ctx.storage.put('orders', []);

    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() || {};
      if (att.role === 'player' && att.state === 'active') {
        this.online.add(att.uid);
        this.lastAction.set(att.uid, Date.now());
      }
    }
    if (this.dirty.size) await this.flush();
    this.ensureTicking();
  }

  seedBots() {
    for (const s of BOT_SEEDS) {
      this.players.set(s.id, {
        id: s.id,
        nickname: s.nickname,
        character: s.character,
        capital: s.capital,
        sold: s.sold,
        bought: 0,
        x: s.x,
        z: s.z,
        bot: true,
        nextSaleAt: Date.now() + 5000 + Math.random() * 10000,
        stall: { x: s.x - 1.8, z: s.z, open: true, name: `${s.nickname}네 붕어빵` },
      });
    }
  }

  ensureTicking() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => console.error('tick', e)), 1000);
  }

  async tick() {
    const now = Date.now();
    for (const o of this.orders.values()) {
      if (o.status !== 'waiting') continue;
      if (o.botReadyAt && now >= o.botReadyAt) this.fulfillOrder(o);
      else if (now - o.createdAt > ORDER_TIMEOUT_MS) this.cancelOrder(o, 'timeout');
    }
    for (const [id, o] of this.orders) {
      if (o.status !== 'waiting' && now - o.createdAt > 5 * 60 * 1000) this.orders.delete(id);
    }
    for (const p of this.players.values()) {
      if (!p.bot || now < p.nextSaleAt) continue;
      const count = 1 + Math.floor(Math.random() * 4);
      p.capital += priceOf(count);
      p.sold += count;
      p.nextSaleAt = now + 12000 + Math.random() * 25000;
      this.pushPlayer(p);
    }

    if (this.queued().length) {
      for (const ws of this.activeSockets()) {
        const uid = this.att(ws).uid;
        if (now - (this.lastAction.get(uid) || now) > IDLE_KICK_MS) this.kick(ws, 'idle', 4003);
      }
    }

    if (now - this.lastFlush > FLUSH_MS) await this.flush();
    if (now - this.lastStats > STATS_MS) this.broadcastStats();

    if (this.ctx.getWebSockets().length === 0) {
      await this.flush();
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush() {
    this.lastFlush = Date.now();
    if (!this.dirty.size) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    const now = Date.now();
    const stmts = [];
    for (const id of ids) {
      const p = this.players.get(id);
      if (!p || p.bot) continue;
      stmts.push(this.env.DB.prepare(
        `INSERT INTO players (user_id, nickname, avatar, capital, sold, bought, stall_x, stall_z, pos_x, pos_z, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
         ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, avatar = excluded.avatar, capital = excluded.capital,
           sold = excluded.sold, bought = excluded.bought, stall_x = excluded.stall_x, stall_z = excluded.stall_z,
           pos_x = excluded.pos_x, pos_z = excluded.pos_z, updated_at = excluded.updated_at`,
      ).bind(p.id, p.nickname, p.character, p.capital, p.sold, p.bought, p.stall?.x ?? null, p.stall?.z ?? null, p.x, p.z, now));
    }
    if (!stmts.length) return;
    try {
      await this.env.DB.batch(stmts);
    } catch (e) {
      ids.forEach((id) => this.dirty.add(id));
      console.error('flush failed', e);
    }
  }

  allowRate(key, limit, windowMs) {
    const now = Date.now();
    const hits = (this.rateWindows.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      this.rateWindows.set(key, hits);
      return false;
    }
    hits.push(now);
    this.rateWindows.set(key, hits);
    if (this.rateWindows.size > 5000) {
      for (const [k, v] of this.rateWindows) {
        if (!v.length || now - v[v.length - 1] > 10 * 60 * 1000) this.rateWindows.delete(k);
      }
    }
    return true;
  }

  takeMessageToken(uid) {
    const now = Date.now();
    const b = this.buckets.get(uid) || { tokens: MSG_BURST, at: now };
    b.tokens = Math.min(MSG_BURST, b.tokens + ((now - b.at) / 1000) * MSG_PER_SEC);
    b.at = now;
    this.buckets.set(uid, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /* ---------- sockets ---------- */

  att(ws) {
    return ws.deserializeAttachment() || {};
  }

  setAtt(ws, patch) {
    ws.serializeAttachment({ ...this.att(ws), ...patch });
  }

  playerSockets() {
    return this.ctx.getWebSockets('player');
  }

  activeSockets() {
    return this.playerSockets().filter((ws) => {
      const a = this.att(ws);
      return a.state === 'active' && !a.left;
    });
  }

  queued() {
    return this.playerSockets()
      .filter((ws) => {
        const a = this.att(ws);
        return a.state === 'queued' && !a.left;
      })
      .sort((a, b) => this.att(a).queuedAt - this.att(b).queuedAt);
  }

  socketsOf(uid) {
    return this.activeSockets().filter((ws) => this.att(ws).uid === uid);
  }

  send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* 이미 닫힌 소켓 */
    }
  }

  sendTo(uid, msg) {
    this.socketsOf(uid).forEach((ws) => this.send(ws, msg));
  }

  broadcast(msg, { viewers = false, queued = false } = {}) {
    const data = JSON.stringify(msg);
    const targets = this.ctx.getWebSockets().filter((ws) => {
      const a = this.att(ws);
      if (a.role === 'viewer') return viewers;
      if (a.left) return false;
      if (a.state === 'queued') return queued;
      return a.state === 'active';
    });
    for (const ws of targets) {
      try {
        ws.send(data);
      } catch {
        /* 이미 닫힌 소켓 */
      }
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ensureTicking();

    if (request.headers.get('X-Viewer') === '1') {
      this.ctx.acceptWebSocket(server, ['viewer']);
      server.serializeAttachment({ role: 'viewer' });
      if (this.ctx.getWebSockets('viewer').length > MAX_VIEWERS) {
        server.close(4004, 'too many viewers');
      } else {
        this.send(server, { t: 'ranking', list: this.ranking() });
        this.send(server, { t: 'stats', ...this.stats() });
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    const uid = request.headers.get('X-User-Id');
    const appName = decodeURIComponent(request.headers.get('X-App-Name') || '');
    if (!uid) return new Response('Unauthorized', { status: 401 });

    let tookSlot = false;
    for (const ws of this.playerSockets()) {
      const a = this.att(ws);
      if (a.uid !== uid) continue;
      if (a.state === 'active') tookSlot = true;
      this.setAtt(ws, { state: 'replaced', left: true });
      this.send(ws, { t: 'kicked', reason: 'replaced' });
      try {
        ws.close(4002, 'replaced');
      } catch {
        /* 이미 닫힘 */
      }
    }

    this.ctx.acceptWebSocket(server, ['player']);
    const canEnter = tookSlot || this.activeSockets().length < this.capacity;
    server.serializeAttachment({ role: 'player', uid, appName, state: canEnter ? 'active' : 'queued', queuedAt: Date.now() });

    const me = this.players.get(uid);
    this.send(server, { t: 'hello', uid, appName, me: me ? this.publicPlayer(me) : null, capacity: this.capacity, features: this.features });
    if (canEnter) this.admit(server);
    else this.updateQueue();
    this.broadcastStats(true);
    return new Response(null, { status: 101, webSocket: client });
  }

  recordVisit(uid) {
    const day = kstDay();
    if (this.visitDay !== day) {
      this.visitDay = day;
      this.visitedToday = new Set();
      this.peakToday = 0;
    }
    const now = Date.now();
    if (!this.visitedToday.has(uid)) {
      this.visitedToday.add(uid);
      this.env.DB.prepare('INSERT OR IGNORE INTO daily_visits (day, user_id, first_at) VALUES (?1, ?2, ?3)')
        .bind(day, uid, now).run().catch((e) => console.error('visit log', e));
    }
    const active = this.activeSockets().length;
    if (active > this.peakToday) {
      this.peakToday = active;
      this.env.DB.prepare(
        `INSERT INTO daily_stats (day, peak_active, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(day) DO UPDATE SET peak_active = MAX(peak_active, excluded.peak_active), updated_at = excluded.updated_at`,
      ).bind(day, active, now).run().catch((e) => console.error('peak log', e));
    }
  }

  admit(ws) {
    const a = this.att(ws);
    this.setAtt(ws, { state: 'active' });
    this.online.add(a.uid);
    this.recordVisit(a.uid);
    this.lastAction.set(a.uid, Date.now());
    const me = this.players.get(a.uid);
    this.send(ws, { t: 'admitted' });
    this.send(ws, {
      t: 'snapshot',
      players: this.visiblePlayers().map((p) => this.publicPlayer(p)),
      orders: [...this.orders.values()].filter((o) => o.status === 'waiting' && (o.buyerId === a.uid || o.sellerId === a.uid)),
      ranking: this.ranking(),
      stats: this.stats(),
    });
    if (me) {
      this.closeStall(me);
      this.pushPlayer(me);
    }
  }

  admitNext() {
    const waiting = this.queued();
    let free = this.capacity - this.activeSockets().length;
    while (free > 0 && waiting.length) {
      this.admit(waiting.shift());
      free--;
    }
    this.updateQueue();
  }

  updateQueue() {
    const waiting = this.queued();
    waiting.forEach((ws, i) => this.send(ws, { t: 'queue', position: i + 1, total: waiting.length, active: this.activeSockets().length, capacity: this.capacity }));
  }

  kick(ws, reason, code) {
    this.send(ws, { t: 'kicked', reason });
    this.leave(ws);
    try {
      ws.close(code, reason);
    } catch {
      /* 이미 닫힘 */
    }
  }

  leave(ws) {
    const a = this.att(ws);
    if (a.role !== 'player' || a.left) return;
    this.setAtt(ws, { left: true });
    if (a.state === 'active') {
      const stillHere = this.activeSockets().some((s) => s !== ws && this.att(s).uid === a.uid);
      if (!stillHere) {
        this.online.delete(a.uid);
        const p = this.players.get(a.uid);
        if (p) {
          this.closeStall(p);
          for (const o of this.orders.values()) {
            if (o.buyerId === a.uid && o.status === 'waiting') this.cancelOrder(o, 'buyer-left');
          }
          this.dirty.add(p.id);
          this.pushPlayer(p);
        }
      }
      this.admitNext();
    } else if (a.state === 'queued') {
      this.updateQueue();
    }
    this.broadcastStats(true);
  }

  async webSocketClose(ws, code) {
    this.leave(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      /* 이미 닫힘 */
    }
  }

  async webSocketError(ws) {
    this.leave(ws);
  }

  async webSocketMessage(ws, raw) {
    this.ensureTicking();
    const a = this.att(ws);
    if (a.role !== 'player' || a.left) return;
    const size = typeof raw === 'string' ? raw.length : raw.byteLength;
    if (size > MAX_MESSAGE_BYTES || !this.takeMessageToken(a.uid)) {
      this.kick(ws, 'flood', 4005);
      return;
    }
    if (a.state !== 'active') return;
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
    if (msg.t !== 'req') return;
    this.lastAction.set(a.uid, Date.now());
    try {
      const data = await this.handle(ws, a, msg.op, msg.data || {});
      this.send(ws, { t: 'res', id: msg.id, ok: true, data: data ?? {} });
    } catch (e) {
      const error = e instanceof GameError ? e.message : '서버 오류';
      if (!(e instanceof GameError)) console.error(e);
      this.send(ws, { t: 'res', id: msg.id, ok: false, error });
    }
  }

  /* ---------- game ---------- */

  publicPlayer(p) {
    return {
      id: p.id,
      nickname: p.nickname,
      character: p.character,
      capital: p.capital,
      sold: p.sold,
      bought: p.bought,
      x: p.x,
      z: p.z,
      stall: p.stall,
      online: !!p.bot || this.online.has(p.id),
      bot: !!p.bot,
    };
  }

  visiblePlayers() {
    return [...this.players.values()].filter((p) => p.bot || this.online.has(p.id));
  }

  ranking() {
    return [...this.players.values()]
      .sort((x, y) => y.capital - x.capital || y.sold - x.sold)
      .slice(0, RANKING_SIZE)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        character: p.character,
        capital: p.capital,
        sold: p.sold,
        bot: !!p.bot,
        online: !!p.bot || this.online.has(p.id),
        stall: { open: !!p.stall?.open },
      }));
  }

  stats() {
    let totalSold = 0;
    let totalCapital = 0;
    let openStalls = 0;
    for (const p of this.players.values()) {
      totalSold += p.sold;
      totalCapital += p.capital;
      if (p.stall?.open) openStalls++;
    }
    return {
      active: this.activeSockets().length,
      queued: this.queued().length,
      capacity: this.capacity,
      openStalls,
      totalSold,
      totalCapital,
      players: [...this.players.values()].filter((p) => !p.bot).length,
    };
  }

  broadcastStats(force = false) {
    const now = Date.now();
    if (!force && now - this.lastStats < STATS_MS) return;
    this.lastStats = now;
    this.broadcast({ t: 'stats', ...this.stats() }, { viewers: true, queued: true });
    if (this.rankingDirty) {
      this.rankingDirty = false;
      this.broadcast({ t: 'ranking', list: this.ranking() }, { viewers: true });
    }
  }

  pushPlayer(p) {
    this.rankingDirty = true;
    this.broadcast({ t: 'player', player: this.publicPlayer(p) });
  }

  pushOrder(o) {
    this.sendTo(o.buyerId, { t: 'order', order: o });
    if (o.sellerId !== o.buyerId) this.sendTo(o.sellerId, { t: 'order', order: o });
    this.persistOrders();
  }

  persistOrders() {
    const waiting = [...this.orders.values()].filter((o) => o.status === 'waiting');
    this.ctx.storage.put('orders', waiting).catch((e) => console.error('persist orders', e));
  }

  rateLimit(uid, key, ms) {
    const mark = `${uid}:${key}`;
    const now = Date.now();
    if (now - (this.rateMarks.get(mark) || 0) < ms) throw new GameError('조금 천천히 해 주세요');
    this.rateMarks.set(mark, now);
  }

  requireMe(uid) {
    const p = this.players.get(uid);
    if (!p) throw new GameError('먼저 입장해 주세요');
    return p;
  }

  clearGrill(id) {
    if (!this.grills.has(id)) return;
    this.grills.delete(id);
    this.sendToWatchers(id, { t: 'grill', sellerId: id, molds: null });
  }

  sendToWatchers(sellerId, msg) {
    for (const ws of this.activeSockets()) {
      if (this.att(ws).watch === sellerId) this.send(ws, msg);
    }
  }

  closeStall(p) {
    this.clearGrill(p.id);
    if (!p.stall || !p.stall.open || p.bot) return;
    p.stall.open = false;
    for (const o of this.orders.values()) {
      if (o.sellerId === p.id && o.status === 'waiting') this.cancelOrder(o, 'closed');
    }
    this.pushPlayer(p);
  }

  addMessage(o, from, text) {
    o.messages = o.messages || [];
    o.messages.push({ from, text, at: Date.now() });
    if (o.messages.length > 20) o.messages.shift();
    this.pushOrder(o);
  }

  cancelOrder(o, reason) {
    o.status = 'cancelled';
    o.reason = reason;
    const buyer = this.players.get(o.buyerId);
    if (buyer) {
      buyer.capital += o.price;
      this.dirty.add(buyer.id);
      this.pushPlayer(buyer);
    }
    this.pushOrder(o);
  }

  fulfillOrder(o) {
    const seller = this.players.get(o.sellerId);
    const buyer = this.players.get(o.buyerId);
    o.status = 'done';
    o.doneAt = Date.now();
    if (seller) {
      seller.capital += o.price;
      seller.sold += o.red + o.cream;
      this.dirty.add(seller.id);
      this.pushPlayer(seller);
    }
    if (buyer) {
      buyer.bought += o.red + o.cream;
      this.dirty.add(buyer.id);
      this.pushPlayer(buyer);
    }
    this.pushOrder(o);
  }

  async handle(ws, a, op, d) {
    const uid = a.uid;
    switch (op) {
      case 'join': {
        const nickname = cleanText(d.nickname, 10);
        if (!nickname) throw new GameError('닉네임을 입력해 주세요');
        const character = CHARACTERS.includes(d.character) ? d.character : CHARACTERS[0];
        let p = this.players.get(uid);
        if (!p) {
          p = { id: uid, nickname, character, capital: START_CAPITAL, sold: 0, bought: 0, x: (Math.random() - 0.5) * 6, z: 6 + Math.random() * 3, stall: null };
          this.players.set(uid, p);
        } else {
          p.nickname = nickname;
          p.character = character;
          if (p.stall) p.stall.name = `${nickname}네 붕어빵`;
        }
        this.dirty.add(uid);
        await this.flush();
        this.pushPlayer(p);
        return { player: this.publicPlayer(p) };
      }

      case 'move': {
        const p = this.requireMe(uid);
        p.x = clampCoord(d.x);
        p.z = clampCoord(d.z);
        this.dirty.add(uid);
        this.broadcast({ t: 'move', id: uid, x: p.x, z: p.z });
        return null;
      }

      case 'stall': {
        const p = this.requireMe(uid);
        if (p.stall?.open) throw new GameError('장사 중에는 가게를 옮길 수 없어요');
        const x = clampCoord(d.x);
        const z = clampCoord(d.z);
        for (const other of this.visiblePlayers()) {
          if (other.id === uid || !other.stall) continue;
          if (Math.hypot(other.stall.x - x, other.stall.z - z) < STALL_GAP) throw new GameError(`${other.nickname}님 가게와 너무 가까워요`);
        }
        p.stall = { x, z, open: false, name: `${p.nickname}네 붕어빵` };
        this.dirty.add(uid);
        this.pushPlayer(p);
        return { player: this.publicPlayer(p) };
      }

      case 'stallOpen': {
        const p = this.requireMe(uid);
        if (!p.stall) throw new GameError('먼저 가게를 차려 주세요');
        p.stall.open = true;
        p.stall.name = `${p.nickname}네 붕어빵`;
        this.pushPlayer(p);
        return { player: this.publicPlayer(p) };
      }

      case 'stallClose': {
        const p = this.requireMe(uid);
        this.closeStall(p);
        return { player: this.publicPlayer(p) };
      }

      case 'sale': {
        const p = this.requireMe(uid);
        if (!p.stall?.open) throw new GameError('영업 중이 아니에요');
        const red = toCount(d.red);
        const cream = toCount(d.cream);
        const count = red + cream;
        if (count < 1 || count > MAX_PER_SALE) throw new GameError('잘못된 주문이에요');
        this.rateLimit(uid, 'sale', 1200);
        const price = priceOf(count);
        p.capital += price;
        p.sold += count;
        this.dirty.add(uid);
        this.pushPlayer(p);
        return { price, capital: p.capital };
      }

      case 'order': {
        const p = this.requireMe(uid);
        const seller = this.players.get(d.sellerId);
        if (!seller?.stall?.open) throw new GameError('지금은 영업 중이 아니에요');
        if (seller.id === uid) throw new GameError('내 가게에서는 주문할 수 없어요');
        const red = toCount(d.red);
        const cream = toCount(d.cream);
        const count = red + cream;
        if (count < 1) throw new GameError('메뉴를 골라 주세요');
        for (const o of this.orders.values()) {
          if (o.buyerId === uid && o.status === 'waiting') throw new GameError('이미 기다리는 주문이 있어요');
        }
        const price = priceOf(count);
        if (p.capital < price) throw new GameError('자본이 부족해요');
        p.capital -= price;
        const order = {
          id: crypto.randomUUID(),
          buyerId: uid,
          buyerName: p.nickname,
          buyerCharacter: p.character,
          sellerId: seller.id,
          sellerName: seller.nickname,
          note: cleanText(d.note, 30),
          messages: [],
          red,
          cream,
          price,
          status: 'waiting',
          createdAt: Date.now(),
        };
        if (seller.bot) order.botReadyAt = Date.now() + 9000 + Math.random() * 6000;
        this.orders.set(order.id, order);
        this.dirty.add(uid);
        this.pushPlayer(p);
        this.pushOrder(order);
        if (seller.bot) setTimeout(() => order.status === 'waiting' && this.addMessage(order, 'seller', pick(BOT_GREETINGS)), 900);
        return { order };
      }

      case 'fulfill': {
        const o = this.orders.get(d.orderId);
        if (!o || o.sellerId !== uid || o.status !== 'waiting') throw new GameError('처리할 수 없는 주문이에요');
        this.fulfillOrder(o);
        return { order: o, capital: this.players.get(uid)?.capital };
      }

      case 'cancel': {
        const o = this.orders.get(d.orderId);
        if (!o || o.status !== 'waiting' || (o.buyerId !== uid && o.sellerId !== uid)) throw new GameError('취소할 수 없는 주문이에요');
        this.cancelOrder(o, o.buyerId === uid ? 'buyer' : 'seller');
        return { order: o };
      }

      case 'message': {
        const o = this.orders.get(d.orderId);
        if (!o || o.status !== 'waiting' || (o.buyerId !== uid && o.sellerId !== uid)) throw new GameError('메시지를 보낼 수 없어요');
        const text = cleanText(d.text, 40);
        if (!text) throw new GameError('메시지를 입력해 주세요');
        this.rateLimit(uid, 'msg', 700);
        const from = o.buyerId === uid ? 'buyer' : 'seller';
        this.addMessage(o, from, text);
        const seller = this.players.get(o.sellerId);
        if (from === 'buyer' && seller?.bot) setTimeout(() => o.status === 'waiting' && this.addMessage(o, 'seller', pick(BOT_REPLIES)), 1400);
        return { order: o };
      }

      case 'grill': {
        const p = this.requireMe(uid);
        if (!p.stall?.open) throw new GameError('영업 중이 아니에요');
        const molds = (Array.isArray(d.molds) ? d.molds.slice(0, 6) : []).map((m) => ({
          p: PHASES.has(m?.p) ? m.p : 'empty',
          f: m?.f === 'red' || m?.f === 'cream' ? m.f : null,
          d: Math.max(0, Math.min(1.6, Number(m?.d) || 0)),
          h: !!m?.h,
        }));
        const tray = { red: toCount(d.tray?.red, 12), cream: toCount(d.tray?.cream, 12) };
        this.grills.set(uid, { molds, tray });
        this.sendToWatchers(uid, { t: 'grill', sellerId: uid, molds, tray });
        return null;
      }

      case 'watch': {
        const sellerId = typeof d.sellerId === 'string' ? d.sellerId : null;
        this.setAtt(ws, { watch: sellerId });
        const g = sellerId && this.grills.get(sellerId);
        return { grill: g ? { sellerId, ...g } : null };
      }

      case 'thumbs': {
        if (!this.features.thumbs) throw new GameError('알 수 없는 요청이에요');
        const p = this.requireMe(uid);
        const seller = this.players.get(d.sellerId);
        if (!seller?.stall || seller.id === uid) throw new GameError('따봉을 보낼 수 없어요');
        const count = Math.max(1, Math.min(MAX_THUMBS_PER_REQ, Math.floor(Number(d.count) || 1)));
        this.rateLimit(uid, 'thumbs', 250);
        if (!seller.bot) this.sendTo(seller.id, { t: 'thumbs', fromId: uid, fromName: p.nickname, fromCharacter: p.character, count });
        return null;
      }

      default:
        throw new GameError('알 수 없는 요청이에요');
    }
  }
}
