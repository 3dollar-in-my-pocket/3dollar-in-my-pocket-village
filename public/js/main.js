import { net } from './net.js';
import { loadArt } from './art.js';
import { World } from './world.js';
import { Shop } from './shop.js';
import { Visit } from './visit.js';
import { PRESETS, presetOf, presetPortrait } from './people.js';
import { won, escapeHtml } from './data.js';

const $ = (sel) => document.querySelector(sel);
const PREF_KEY = 'boong-village:character';

function savedCharacter() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

const state = {
  character: presetOf(savedCharacter()).key,
  placing: false,
  pendingSpot: null,
  sheet: null,
  mode: 'gate',
  entered: false,
};

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2500);
}

await loadArt();

const world = new World($('#world'), $('#labels'), {
  onGroundTap: handleGroundTap,
  onStallTap: handleStallTap,
});

function backToMap() {
  state.mode = 'map';
  world.setPaused(false);
  $('#hud').classList.remove('hidden');
}

const shop = new Shop({
  toast,
  onClose: async (summary) => {
    backToMap();
    try {
      await net.post('/api/stall/close');
    } catch (e) {
      toast(e.message);
    }
    if (summary.sold > 0) toast(`장사 끝! ${summary.sold}마리 팔아서 ${won(summary.revenue)} 벌었어요`, 'good');
  },
});

const visit = new Visit({ toast, onClose: backToMap });

/* ---------- Gate (loading · queue · auth · kicked) ---------- */

function showGate(title, desc, extra = '') {
  state.mode = 'gate';
  $('#gate-title').textContent = title;
  $('#gate-desc').innerHTML = desc;
  $('#gate-extra').innerHTML = extra;
  $('#gate').classList.remove('hidden');
  $('#entry').classList.add('hidden');
  $('#hud').classList.add('hidden');
  $('#shop').classList.add('hidden');
  $('#visit').classList.add('hidden');
}

function hideGate() {
  $('#gate').classList.add('hidden');
}

/* ---------- Entry (first visit only) ---------- */

function renderCharacters() {
  const wrap = $('#characters');
  wrap.innerHTML = '';
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = `character${p.key === state.character ? ' selected' : ''}`;
    btn.innerHTML = `<img src="${presetPortrait(p.key, { size: 160 })}" alt=""><span>${p.name}</span>`;
    btn.addEventListener('click', () => {
      state.character = p.key;
      renderCharacters();
    });
    wrap.appendChild(btn);
  }
}

function showEntry(defaultName) {
  hideGate();
  state.mode = 'entry';
  if (!$('#nickname').value) $('#nickname').value = (defaultName || '').slice(0, 10);
  renderCharacters();
  renderLive();
  $('#entry').classList.remove('hidden');
}

function enterVillage(player, greet) {
  hideGate();
  $('#entry').classList.add('hidden');
  net.setMe(player);
  world.setMe(player.id);
  world.syncPlayer(player);
  if (!state.entered) world.teleportMe(player.x, player.z);
  state.entered = true;
  state.mode = 'map';
  world.setPaused(false);
  $('#hud').classList.remove('hidden');
  renderHud();
  if (greet) toast(`${player.nickname} 사장님, 어서 오세요!`, 'pink');
}

async function join(nickname) {
  $('#entry-error').textContent = '';
  $('#start').disabled = true;
  try {
    const { player } = await net.post('/api/join', { nickname, character: state.character });
    try {
      localStorage.setItem(PREF_KEY, player.character);
    } catch {
      /* 저장 불가 환경 */
    }
    enterVillage(player, true);
  } catch (e) {
    $('#entry-error').textContent = e.message;
  } finally {
    $('#start').disabled = false;
  }
}

$('#start').addEventListener('click', () => {
  const nickname = $('#nickname').value.trim();
  if (!nickname) {
    $('#entry-error').textContent = '사장님 이름을 입력해 주세요';
    return;
  }
  join(nickname);
});
$('#nickname').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#start').click();
});

/* ---------- Network events ---------- */

net.on('hello', (h) => {
  state.appName = h.appName;
  if (h.me) {
    state.character = presetOf(h.me.character).key;
    $('#nickname').value = h.me.nickname;
  }
});

net.on('queue', (q) => {
  showGate(
    '입장 대기 중이에요',
    `마을이 꽉 찼어요 (${q.active}/${q.capacity}명)<br>자리가 나면 자동으로 들어가요`,
    `<div class="queue-badge"><span>내 앞에</span><b>${q.position - 1}</b><span>명</span></div><p class="gate-note">대기 중 ${q.total}명 · 화면을 닫으면 순서가 사라져요</p>`,
  );
});

net.on('admitted', () => {
  if (net.me) enterVillage(net.me, !state.entered);
  else showEntry(state.appName);
});

net.on('unauthorized', (u) => {
  if (u.guest) {
    showGate(
      '붕어빌리지에 어서 오세요',
      '지금은 가슴속 3천원 로그인 없이 열려 있어요.<br>들어가서 사장님 이름을 정하면 시작해요.',
      `<form class="dev-login guest-login" id="guest-login">
        ${u.inviteRequired ? '<input id="invite-code" maxlength="20" placeholder="입장 코드" autocomplete="off">' : ''}
        <button class="btn primary ${u.inviteRequired ? 'small' : 'big'}">입장하기</button>
      </form>
      <p class="gate-note" id="guest-error"></p>`,
    );
    $('#guest-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/guest-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: $('#invite-code')?.value || '' }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: '연결에 실패했어요' }));
      if (!res.ok) {
        $('#guest-error').textContent = res.error || '입장에 실패했어요';
        return;
      }
      showGate('마을에 들어가는 중…', '잠시만 기다려 주세요');
      net.connect();
    });
    return;
  }
  const devForm = u.dev
    ? `<form class="dev-login" id="dev-login"><input id="dev-name" maxlength="10" placeholder="테스트 이름" autocomplete="off"><button class="btn primary small">개발용 입장</button></form>
       <p class="gate-note">로컬 개발 모드에서만 보여요</p>`
    : '';
  showGate('가슴속 3천원 앱에서 열어 주세요', '로그인 정보가 없거나 만료됐어요.<br>앱에서 다시 들어와 주세요.', devForm);
  $('#dev-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#dev-name').value.trim();
    if (name) location.href = `/dev-login?name=${encodeURIComponent(name)}`;
  });
});

net.on('kicked', (k) => {
  const text = {
    replaced: ['다른 화면에서 접속했어요', '같은 계정으로 다른 곳에서 입장해서 여기 연결은 끊겼어요.'],
    idle: ['오래 쉬어서 자리를 양보했어요', '10분 동안 활동이 없어서 기다리던 사장님께 자리를 넘겼어요.'],
    flood: ['요청이 너무 많아요', '짧은 시간에 너무 많은 요청이 와서 연결을 잠시 끊었어요. 잠시 후 다시 들어와 주세요.'],
  }[k.reason] || ['연결이 끊겼어요', ''];
  showGate(text[0], text[1], '<button class="btn primary big" id="rejoin">다시 들어가기</button>');
  $('#rejoin').addEventListener('click', () => {
    showGate('마을에 들어가는 중…', '잠시만 기다려 주세요');
    net.connect();
  });
});

net.on('stats', () => renderLive());

net.on('ranking', () => {
  if (state.sheet?.type === 'rank') {
    clearTimeout(state.rankTimer);
    state.rankTimer = setTimeout(renderRankSheet, 150);
  }
});

net.on('snapshot', (data) => {
  const ids = new Set(data.players.map((p) => p.id));
  for (const id of [...world.avatars.keys()]) if (!ids.has(id) && id !== net.uid) world.removePlayer(id);
  data.players.forEach((p) => world.syncPlayer(p));
  renderLive();
  renderHud();
});

net.on('player', (p) => {
  if (!p.online && !p.bot && p.id !== net.uid) world.removePlayer(p.id);
  else world.syncPlayer(p);
  if (p.id === net.uid) renderHud();
});

net.on('move', (m) => world.moveAvatar(m.id, m.x, m.z));

net.on('order', (o) => {
  if (o.buyerId !== net.me?.id) return;
  const watching = visit.active && visit.ownerId === o.sellerId;
  if (o.status === 'done') {
    toast(`${o.sellerName} 사장님께 붕어빵 ${o.red + o.cream}마리를 받았어요!`, 'good');
  } else if (o.status === 'cancelled' && o.reason !== 'buyer') {
    const why = { closed: '가게가 문을 닫아서', timeout: '시간이 너무 지나서', seller: '사장님이' }[o.reason] || '';
    toast(`${why} 주문이 취소되고 ${won(o.price)} 환불됐어요`);
  } else if (o.status === 'waiting' && !watching) {
    const last = (o.messages || []).slice(-1)[0];
    if (last?.from === 'seller' && last.at > (state.lastSellerMsg || 0)) {
      state.lastSellerMsg = last.at;
      toast(`${o.sellerName}: ${last.text}`, 'pink');
    }
  }
});

let wasConnected = true;
net.on('connection', (ok) => {
  if (!ok && wasConnected && state.entered && !net.stopped) toast('연결이 끊겼어요. 다시 연결하는 중…');
  wasConnected = ok;
});

/* ---------- HUD ---------- */

function renderLive() {
  const { active, capacity, queued, openStalls } = net.stats;
  $('#entry-live-text').textContent = `지금 ${active}/${capacity}명 · 가게 ${openStalls}곳 영업 중${queued ? ` · 대기 ${queued}명` : ''}`;
  $('#live-count').textContent = `${active}/${capacity}명 · 영업 ${openStalls}곳`;
}

function renderHud() {
  const me = net.me;
  if (!me) return;
  $('#my-capital').textContent = won(me.capital);
  const hasStall = !!me.stall;
  $('#btn-main').textContent = hasStall ? '내 가게에서 장사하기' : '가게 차리기';
  $('#btn-move').classList.toggle('hidden', !hasStall || state.placing);
}

$('#btn-main').addEventListener('click', () => {
  if (net.me?.stall) startSelling();
  else enterPlacement();
});
$('#btn-move').addEventListener('click', () => enterPlacement());
$('#btn-rank').addEventListener('click', () => openRankSheet());

/* ---------- Walking & placement ---------- */

function handleGroundTap(x, z) {
  if (!net.me || state.mode !== 'map') return;
  if (state.placing) {
    const check = world.checkStallSpot(x, z);
    world.showGhost(x, z, check.ok);
    state.pendingSpot = check.ok ? { x, z } : null;
    $('#place-text').textContent = check.ok ? '여기에 차릴까요? 끌어서 옮길 수 있어요' : check.reason;
    $('#place-confirm').disabled = !check.ok;
    return;
  }
  const target = world.clampPoint(x, z);
  world.walkMeTo(target.x, target.z);
  net.post('/api/move', target).catch(() => {});
}

function enterPlacement() {
  state.placing = true;
  world.placing = true;
  state.pendingSpot = null;
  $('#place-banner').classList.remove('hidden');
  $('.hud-bottom').classList.add('hidden');
  $('#hud-tip').classList.add('hidden');
  $('#place-text').textContent = net.me?.stall ? '가게를 옮길 자리로 끌어다 놓으세요' : '가게를 차릴 자리로 끌어다 놓으세요';
  $('#place-confirm').disabled = true;
  const here = world.myPosition();
  handleGroundTap(here.x, here.z - 1.5);
}

function exitPlacement() {
  state.placing = false;
  world.placing = false;
  world.hideGhost();
  $('#place-banner').classList.add('hidden');
  $('.hud-bottom').classList.remove('hidden');
  $('#hud-tip').classList.remove('hidden');
  renderHud();
}

$('#place-cancel').addEventListener('click', exitPlacement);
$('#place-confirm').addEventListener('click', async () => {
  if (!state.pendingSpot) return;
  $('#place-confirm').disabled = true;
  try {
    const { player } = await net.post('/api/stall', state.pendingSpot);
    net.setMe(player);
    world.syncPlayer(player);
    exitPlacement();
    toast('가게를 차렸어요! 장사를 시작해 볼까요?', 'pink');
    startSelling();
  } catch (e) {
    $('#place-text').textContent = e.message;
  }
});

/* ---------- Selling (owner) ---------- */

async function startSelling() {
  const stall = net.me?.stall;
  if (!stall || state.mode !== 'map') return;
  state.mode = 'selling';
  closeSheet();
  const spot = { x: stall.x + 1.8, z: stall.z + 0.2 };
  const here = world.myPosition();
  if (Math.hypot(here.x - spot.x, here.z - spot.z) > 14) world.teleportMe(spot.x, spot.z + 5);
  net.post('/api/move', spot).catch(() => {});
  await Promise.race([world.walkMeTo(spot.x, spot.z), new Promise((r) => setTimeout(r, 4000))]);
  try {
    const { player } = await net.post('/api/stall/open');
    net.setMe(player);
    world.syncPlayer(player);
  } catch (e) {
    state.mode = 'map';
    toast(e.message);
    return;
  }
  $('#hud').classList.add('hidden');
  world.setPaused(true);
  shop.open();
}

/* ---------- Visiting (customer) ---------- */

async function handleStallTap(ownerId) {
  if (!net.me || state.placing || state.mode !== 'map') return;
  if (ownerId === net.me.id) {
    startSelling();
    return;
  }
  state.mode = 'visiting';
  const spot = world.stallSpotFor(ownerId);
  if (spot) {
    const front = world.clampPoint(spot.x + (Math.random() - 0.5) * 1.2, spot.z + 2.1);
    const here = world.myPosition();
    if (Math.hypot(here.x - front.x, here.z - front.z) > 14) world.teleportMe(front.x, front.z + 5);
    net.post('/api/move', front).catch(() => {});
    await Promise.race([world.walkMeTo(front.x, front.z), new Promise((r) => setTimeout(r, 2500))]);
  }
  $('#hud').classList.add('hidden');
  world.setPaused(true);
  visit.open(ownerId);
}

/* ---------- Ranking ---------- */

function openRankSheet() {
  state.sheet = { type: 'rank' };
  $('#sheet').classList.remove('hidden');
  $('#sheet-backdrop').classList.remove('hidden');
  renderRankSheet();
}

function renderRankSheet() {
  if (state.sheet?.type !== 'rank') return;
  const ranking = net.ranking();
  const meId = net.me?.id;
  const top = ranking.slice(0, 3);
  const podium = [top[1], top[0], top[2]]
    .map((p, i) => {
      if (!p) return '<div></div>';
      const rank = [2, 1, 3][i];
      return `<div class="podium-item r${rank}">
        <img src="${presetPortrait(p.character, { size: 160 })}" alt="">
        <span class="name">${escapeHtml(p.nickname)}</span>
        <span class="money">${won(p.capital)}</span>
        <div class="block">${rank}</div>
      </div>`;
    })
    .join('');
  const rows = ranking
    .slice(0, 50)
    .map((p, i) => `
      <div class="rank-row${p.id === meId ? ' me' : ''}">
        <span class="no">${i + 1}</span>
        <img src="${presetPortrait(p.character, { size: 120 })}" alt="">
        <div class="who">
          <strong>${p.online ? '<i class="online-dot"></i>' : ''}${escapeHtml(p.nickname)}${p.id === meId ? ' (나)' : ''}${p.bot ? ' · NPC' : ''}</strong>
          <span>${p.sold}마리 판매${p.stall?.open ? ' · 영업중' : ''}</span>
        </div>
        <div class="cap">${won(p.capital)}<small>자본</small></div>
      </div>`)
    .join('');
  const myRank = ranking.findIndex((p) => p.id === meId) + 1;
  $('#sheet-body').innerHTML = `
    <div class="rank-head">
      <div><h2>사장님 랭킹</h2><p class="sub" style="margin:4px 0 0">자본이 많은 순서 · 실시간${myRank ? ` · 나는 ${myRank}위` : ''}</p></div>
      <a href="/dashboard" target="_blank" rel="noopener">대시보드 ↗</a>
    </div>
    <div class="podium">${podium}</div>
    <div class="rank-list">${rows}</div>`;
}

function closeSheet() {
  state.sheet = null;
  $('#sheet').classList.add('hidden');
  $('#sheet-backdrop').classList.add('hidden');
}
$('#sheet-backdrop').addEventListener('click', closeSheet);

/* ---------- Boot ---------- */

showGate('마을에 들어가는 중…', '잠시만 기다려 주세요');
net.connect();
