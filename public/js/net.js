const OPS = {
  '/api/join': 'join',
  '/api/move': 'move',
  '/api/stall': 'stall',
  '/api/stall/open': 'stallOpen',
  '/api/stall/close': 'stallClose',
  '/api/sale': 'sale',
  '/api/order': 'order',
  '/api/order/fulfill': 'fulfill',
  '/api/order/cancel': 'cancel',
  '/api/order/message': 'message',
  '/api/grill': 'grill',
};

class Net {
  constructor() {
    this.me = null;
    this.uid = null;
    this.players = new Map();
    this.orders = new Map();
    this.grills = new Map();
    this.rankingList = [];
    this.stats = { active: 0, queued: 0, capacity: 50, openStalls: 0, totalSold: 0, totalCapital: 0 };
    this.listeners = {};
    this.pending = new Map();
    this.seq = 0;
    this.ws = null;
    this.stopped = false;
    this.options = {};
  }

  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type, data) {
    (this.listeners[type] || []).forEach((fn) => fn(data));
  }

  connect(options = {}) {
    this.options = options;
    this.stopped = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws${options.viewer ? '?viewer=1' : ''}`);
    this.ws = ws;
    ws.onopen = () => this.emit('connection', true);
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.pending.forEach(({ reject }) => reject(new Error('연결이 끊겼어요')));
      this.pending.clear();
      this.emit('connection', false);
      if ([4001, 4002, 4003, 4004].includes(e.code)) this.stopped = true;
      if (!this.stopped) setTimeout(() => this.connect(this.options), 2000);
    };
    clearInterval(this.pinger);
    this.pinger = setInterval(() => {
      if (this.ws?.readyState === 1) this.ws.send('{"t":"ping"}');
    }, 25000);
  }

  disconnect() {
    this.stopped = true;
    this.ws?.close();
  }

  request(op, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('연결 중이에요. 잠시 후 다시 시도해 주세요'));
        return;
      }
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('응답이 없어요'));
      }, 10000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ t: 'req', id, op, data }));
    });
  }

  post(path, body = {}) {
    const op = OPS[path];
    if (!op) return Promise.reject(new Error(`unknown api ${path}`));
    return this.request(op, body);
  }

  setMe(player) {
    this.me = player;
    this.players.set(player.id, player);
  }

  handle(msg) {
    switch (msg.t) {
      case 'res': {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error || '요청에 실패했어요'));
        return;
      }
      case 'hello':
        this.uid = msg.uid;
        if (msg.me) this.me = msg.me;
        this.emit('hello', msg);
        return;
      case 'snapshot':
        this.players.clear();
        msg.players.forEach((p) => this.players.set(p.id, p));
        this.orders.clear();
        msg.orders.forEach((o) => this.orders.set(o.id, o));
        this.rankingList = msg.ranking || [];
        if (msg.stats) this.stats = msg.stats;
        if (this.me && this.players.has(this.me.id)) this.me = this.players.get(this.me.id);
        this.emit('snapshot', msg);
        return;
      case 'player': {
        const p = msg.player;
        if (p.online || p.bot || p.id === this.uid) this.players.set(p.id, p);
        else this.players.delete(p.id);
        if (p.id === this.uid) this.me = p;
        this.emit('player', p);
        return;
      }
      case 'move': {
        const p = this.players.get(msg.id);
        if (p) {
          p.x = msg.x;
          p.z = msg.z;
        }
        this.emit('move', msg);
        return;
      }
      case 'order':
        this.orders.set(msg.order.id, msg.order);
        this.emit('order', msg.order);
        return;
      case 'grill':
        if (msg.molds) this.grills.set(msg.sellerId, msg);
        else this.grills.delete(msg.sellerId);
        this.emit('grill', msg);
        return;
      case 'ranking':
        this.rankingList = msg.list || [];
        this.emit('ranking', this.rankingList);
        return;
      case 'stats':
        this.stats = msg;
        this.emit('stats', msg);
        return;
      default:
        this.emit(msg.t, msg);
    }
  }

  ranking() {
    return this.rankingList;
  }

  onlineCount() {
    return this.stats.active;
  }

  openStallCount() {
    return this.stats.openStalls;
  }
}

export const net = new Net();
