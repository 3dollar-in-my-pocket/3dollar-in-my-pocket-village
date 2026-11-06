import * as THREE from 'three';
import { MAP_LIMIT, STALL_GAP } from './data.js';
import { buildPerson, animatePerson, presetOf, randomPerson } from './people.js';
import { ICONS } from './art.js';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROAD_HALF = 3.2;
const PLAZA_R = 7;
const WALK_SPEED = 5;
const PERSON_H = 1.65;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  draw(c.getContext('2d'), w, h, () => {
    tex.needsUpdate = true;
  });
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export class World {
  constructor(canvas, labelsEl, handlers) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.handlers = handlers;
    this.meId = null;
    this.avatars = new Map();
    this.stalls = new Map();
    this.npcs = [];
    this.obstacles = [];
    this.paused = false;
    this.zoom = 1;
    this.focus = new THREE.Vector3(0, 0, 6);
    this.clock = new THREE.Clock();
    this.arrival = null;

    this.setupRenderer();
    this.setupScene();
    this.buildTown();
    this.buildSnow();
    this.setupInput();
    this.spawnNpcs();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  setupRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
  }

  setupScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#DCEAF2');
    scene.fog = new THREE.Fog('#DCEAF2', 38, 80);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 16, 21);
    this.camera.lookAt(0, 0, 6);

    scene.add(new THREE.HemisphereLight('#FFFFFF', '#C8B6A2', 1.0));
    const sun = new THREE.DirectionalLight('#FFF2E0', 1.5);
    sun.position.set(18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 90 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);
  }

  buildTown() {
    const rand = mulberry32(3);
    const scene = this.scene;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), lambert('#E9EFE2'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const roadMat = lambert('#EBDCC4');
    const roadA = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, MAP_LIMIT * 2 + 10), roadMat);
    roadA.rotation.x = -Math.PI / 2;
    roadA.position.y = 0.01;
    roadA.receiveShadow = true;
    const roadB = roadA.clone();
    roadB.rotation.z = Math.PI / 2;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 40), lambert('#E4D2B6'));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    scene.add(roadA, roadB, plaza);

    const tileMat = lambert('#D9C4A4');
    for (let i = -MAP_LIMIT; i <= MAP_LIMIT; i += 2.2) {
      if (Math.abs(i) < PLAZA_R) continue;
      for (const [x, z, w, d] of [[-ROAD_HALF + 0.15, i, 0.12, 1.4], [ROAD_HALF - 0.15, i, 0.12, 1.4], [i, -ROAD_HALF + 0.15, 1.4, 0.12], [i, ROAD_HALF - 0.15, 1.4, 0.12]]) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tileMat);
        t.rotation.x = -Math.PI / 2;
        t.position.set(x, 0.015, z);
        scene.add(t);
      }
    }

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.9, 24), lambert('#F3E6D2'));
    pedestal.position.y = 0.45;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    scene.add(pedestal);
    const statueTex = canvasTexture(512, 360, (ctx, w, h, done) => {
      loadImage(ICONS.bungeoppang).then((img) => {
        if (!img) return;
        ctx.drawImage(img, 4, 22, 122, 84, 0, 0, w, h);
        done();
      });
    });
    const statue = new THREE.Sprite(new THREE.SpriteMaterial({ map: statueTex, alphaTest: 0.1 }));
    statue.scale.set(3.6, 2.5, 1);
    statue.position.set(0, 2.2, 0);
    scene.add(statue);
    this.obstacles.push({ x: 0, z: 0, r: 2.6 });

    const houseColors = ['#FFD9C4', '#F8E4B8', '#D8E7F4', '#F6D0D4', '#E0ECD2', '#EEE0F2'];
    const roofColors = ['#7B4B3A', '#4F5E70', '#8C5A3C', '#5C4A64'];
    const spots = [];
    for (let i = -MAP_LIMIT + 2; i <= MAP_LIMIT - 2; i += 7.5) {
      spots.push([i, -MAP_LIMIT - 1.5], [i, MAP_LIMIT + 1.5], [-MAP_LIMIT - 1.5, i], [MAP_LIMIT + 1.5, i]);
    }
    for (const [x, z] of [[-14, -14], [15, 14], [-17, 16], [16, -17], [-26, 6], [26, -5], [6, 26], [-6, -27]]) spots.push([x, z]);
    for (const [x, z] of spots) {
      if (Math.abs(x) < ROAD_HALF + 3 || Math.abs(z) < ROAD_HALF + 3) continue;
      this.addHouse(x, z, houseColors[Math.floor(rand() * houseColors.length)], roofColors[Math.floor(rand() * roofColors.length)], rand);
    }

    let placed = 0;
    let tries = 0;
    while (placed < 46 && tries < 900) {
      tries++;
      const x = (rand() * 2 - 1) * (MAP_LIMIT + 4);
      const z = (rand() * 2 - 1) * (MAP_LIMIT + 4);
      if (Math.abs(x) < ROAD_HALF + 1.5 || Math.abs(z) < ROAD_HALF + 1.5) continue;
      if (Math.hypot(x, z) < PLAZA_R + 2) continue;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.6)) continue;
      this.addTree(x, z, 0.8 + rand() * 0.6);
      placed++;
    }

    for (let i = -MAP_LIMIT + 6; i <= MAP_LIMIT - 6; i += 10) {
      if (Math.abs(i) < PLAZA_R + 1) continue;
      this.addLamp(ROAD_HALF + 0.6, i);
      this.addLamp(i, -ROAD_HALF - 0.6);
    }
    for (const a of [0.4, 2.0, 3.6, 5.2]) this.addLamp(Math.cos(a) * (PLAZA_R + 0.5), Math.sin(a) * (PLAZA_R + 0.5));
  }

  addHouse(x, z, wall, roof, rand) {
    const g = new THREE.Group();
    const w = 4 + rand() * 2;
    const d = 3.6 + rand() * 1.4;
    const h = 2.6 + rand() * 1.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(wall));
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.9, 4), lambert(roof));
    r.position.y = h + 0.95;
    r.rotation.y = Math.PI / 4;
    r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    r.castShadow = true;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.4, 0.95, 4), lambert('#FFFFFF'));
    snow.position.y = h + 1.45;
    snow.rotation.y = Math.PI / 4;
    snow.scale.copy(r.scale);
    const winMat = new THREE.MeshBasicMaterial({ color: '#FFD68A' });
    const facing = Math.sign(-z) || 1;
    for (const dx of [-w / 4, w / 4]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), winMat);
      win.position.set(dx, h * 0.55, (facing * d) / 2 + facing * 0.01);
      if (facing < 0) win.rotation.y = Math.PI;
      g.add(win);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), lambert('#8A5A3C'));
    door.position.set(0, 0.7, (facing * d) / 2 + facing * 0.012);
    if (facing < 0) door.rotation.y = Math.PI;
    g.add(body, r, snow, door);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.obstacles.push({ x, z, r: Math.max(w, d) * 0.65 });
  }

  addTree(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 6), lambert('#7A553B'));
    trunk.position.y = 0.35;
    trunk.castShadow = true;
    g.add(trunk);
    const green = lambert('#4E8C66');
    [[1.15, 1.3, 1.05], [0.9, 1.1, 1.75], [0.6, 0.9, 2.35]].forEach(([r, h, y]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), green);
      c.position.y = y;
      c.castShadow = true;
      g.add(c);
    });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 7), lambert('#FFFFFF'));
    cap.position.y = 2.68;
    g.add(cap);
    g.scale.setScalar(s);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.obstacles.push({ x, z, r: 1.1 * s });
  }

  addLamp(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), lambert('#4A4040'));
    pole.position.set(x, 1.2, z);
    pole.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: '#FFD27A' }));
    bulb.position.set(x, 2.5, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: '#FFC46B', transparent: true, opacity: 0.55, depthWrite: false }));
    glow.scale.set(1.6, 1.6, 1);
    glow.position.copy(bulb.position);
    this.scene.add(pole, bulb, glow);
    this.obstacles.push({ x, z, r: 0.5 });
  }

  glowTexture() {
    if (!this._glow) {
      this._glow = canvasTexture(64, 64, (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
    }
    return this._glow;
  }

  buildSnow() {
    const count = 650;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#FFFFFF', size: 0.16, transparent: true, opacity: 0.9, map: this.glowTexture(), depthWrite: false });
    this.snow = new THREE.Points(geo, mat);
    this.scene.add(this.snow);
  }

  makeLabel(className) {
    const el = document.createElement('div');
    el.className = `label ${className}`;
    this.labelsEl.appendChild(el);
    return el;
  }

  makeWalker(cfg, scale = 1) {
    const person = buildPerson(cfg);
    person.scale.setScalar(scale);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    shadow.scale.setScalar(scale);
    const group = new THREE.Group();
    group.add(person, shadow);
    return { group, person, shadow, scale, angle: 0 };
  }

  syncPlayer(p) {
    let a = this.avatars.get(p.id);
    const isMe = p.id === this.meId;
    if (a && a.character !== p.character) {
      a.group.remove(a.person);
      a.person = buildPerson(presetOf(p.character));
      a.person.scale.setScalar(a.scale);
      a.group.add(a.person);
      a.character = p.character;
    }
    if (!a) {
      a = this.makeWalker(presetOf(p.character), 1.3);
      a.id = p.id;
      a.character = p.character;
      a.pos = new THREE.Vector3(p.x, 0, p.z);
      a.target = a.pos.clone();
      a.label = this.makeLabel(isMe ? 'me' : p.bot ? 'bot' : '');
      a.group.position.copy(a.pos);
      this.scene.add(a.group);
      this.avatars.set(p.id, a);
    }
    a.label.textContent = p.nickname;
    a.visible = p.online || isMe;
    a.group.visible = a.visible;
    a.label.style.display = a.visible ? '' : 'none';
    if (!isMe && a.visible) a.target.set(p.x, 0, p.z);
    this.syncStall(p);
  }

  removePlayer(id) {
    const a = this.avatars.get(id);
    if (a) {
      this.scene.remove(a.group);
      a.label.remove();
      this.avatars.delete(id);
    }
    const s = this.stalls.get(id);
    if (s) {
      this.scene.remove(s.group);
      s.label.remove();
      this.stalls.delete(id);
    }
  }

  moveAvatar(id, x, z) {
    const a = this.avatars.get(id);
    if (a && id !== this.meId) a.target.set(x, 0, z);
  }

  walkMeTo(x, z) {
    const a = this.avatars.get(this.meId);
    if (!a) return Promise.resolve();
    const p = this.clampPoint(x, z);
    a.target.set(p.x, 0, p.z);
    return new Promise((resolve) => {
      this.arrival?.resolve(false);
      this.arrival = { resolve };
    });
  }

  teleportMe(x, z) {
    const a = this.avatars.get(this.meId);
    if (!a) return;
    a.pos.set(x, 0, z);
    a.target.set(x, 0, z);
    this.focus.set(x, 0, z);
  }

  myPosition() {
    const a = this.avatars.get(this.meId);
    return a ? { x: a.pos.x, z: a.pos.z } : { x: 0, z: 0 };
  }

  clampPoint(x, z) {
    let px = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, x));
    let pz = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, z));
    for (const o of this.obstacles) {
      const d = Math.hypot(px - o.x, pz - o.z);
      if (d < o.r) {
        const k = (o.r + 0.2) / (d || 1);
        px = o.x + (px - o.x) * k;
        pz = o.z + (pz - o.z) * k;
      }
    }
    return { x: px, z: pz };
  }

  buildStallMesh() {
    const g = new THREE.Group();
    const wood = lambert('#C98A4B');
    const darkWood = lambert('#8A5130');
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), wood);
    body.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.1, 1.3), darkWood);
    top.position.y = 1.3;
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.75), lambert('#2D2826'));
    grill.position.set(0, 1.45, -0.05);
    const wheelMat = lambert('#4A3B33');
    for (const x of [-0.75, 0.75]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.34, 0.58);
      wheel.castShadow = true;
      g.add(wheel);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62), new THREE.MeshBasicMaterial({ map: this.signTexture() }));
    sign.position.set(0, 0.82, 0.556);
    const poleMat = lambert('#6B4A35');
    for (const [x, z] of [[-1.12, -0.55], [1.12, -0.55], [-1.12, 0.55], [1.12, 0.55]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), poleMat);
      pole.position.set(x, 2.05, z);
      g.add(pole);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 1.7), new THREE.MeshLambertMaterial({ map: this.stripeTexture() }));
    awning.position.set(0, 2.85, 0.05);
    awning.rotation.x = 0.16;
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.3), new THREE.MeshLambertMaterial({ map: this.stripeTexture(), side: THREE.DoubleSide }));
    valance.position.set(0, 2.6, 0.92);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshBasicMaterial({ color: '#A08A70' }));
    lantern.position.set(1.0, 2.35, 0.75);
    [body, top, grill, awning].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    g.add(body, top, grill, sign, awning, valance, lantern);

    const steam = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }));
      s.userData.t = i / 4;
      s.position.set(0, 1.6, 0);
      g.add(s);
      steam.push(s);
    }
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 2.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.position.y = 1.6;
    g.add(hitbox);
    return { group: g, lantern, steam, hitbox };
  }

  signTexture() {
    if (!this._sign) {
      this._sign = canvasTexture(380, 124, (ctx, w, h, done) => {
        const paint = (img) => {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#FFF4E6';
          roundRect(ctx, 0, 0, w, h, 22);
          ctx.fill();
          ctx.fillStyle = '#FF8181';
          roundRect(ctx, 8, 8, w - 16, h - 16, 18);
          ctx.fill();
          const textX = img ? w / 2 + 40 : w / 2;
          if (img) ctx.drawImage(img, 4, 22, 122, 84, 20, 22, 108, 74);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 44px Pretendard, sans-serif';
          ctx.fillText('붕어빵', textX, h / 2 - 12);
          ctx.font = '600 20px Pretendard, sans-serif';
          ctx.fillText('1마리 천원 · 3마리 2천원', textX, h / 2 + 28);
          done();
        };
        paint(null);
        loadImage(ICONS.bungeoppang).then((img) => img && paint(img));
      });
    }
    return this._sign;
  }

  stripeTexture() {
    if (!this._stripe) {
      this._stripe = canvasTexture(256, 64, (ctx, w, h) => {
        const n = 8;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? '#FFFFFF' : '#FF8181';
          ctx.fillRect((w / n) * i, 0, w / n, h);
        }
      });
    }
    return this._stripe;
  }

  syncStall(p) {
    let s = this.stalls.get(p.id);
    if (!p.stall) {
      if (s) {
        this.scene.remove(s.group);
        s.label.remove();
        this.stalls.delete(p.id);
      }
      return;
    }
    if (!s) {
      s = this.buildStallMesh();
      s.ownerId = p.id;
      s.hitbox.userData.ownerId = p.id;
      s.label = this.makeLabel('stall');
      this.scene.add(s.group);
      this.stalls.set(p.id, s);
    }
    s.group.position.set(p.stall.x, 0, p.stall.z);
    s.open = !!p.stall.open;
    s.lantern.material.color.set(s.open ? '#FFB050' : '#A08A70');
    s.label.className = `label stall${s.open ? ' open' : ''}${p.id === this.meId ? ' mine' : ''}`;
    s.label.innerHTML = '';
    const name = document.createElement('span');
    name.textContent = p.stall.name || `${p.nickname}네 붕어빵`;
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = s.open ? '영업중' : '준비중';
    s.label.append(name, status);
  }

  stallSpotFor(ownerId) {
    const s = this.stalls.get(ownerId);
    return s ? { x: s.group.position.x, z: s.group.position.z } : null;
  }

  checkStallSpot(x, z) {
    if (Math.abs(x) > MAP_LIMIT - 1 || Math.abs(z) > MAP_LIMIT - 1) return { ok: false, reason: '마을 밖이에요' };
    if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.4)) return { ok: false, reason: '집이나 나무와 겹쳐요' };
    for (const [ownerId, s] of this.stalls) {
      if (ownerId === this.meId) continue;
      if (Math.hypot(s.group.position.x - x, s.group.position.z - z) < STALL_GAP) return { ok: false, reason: '다른 가게와 너무 가까워요' };
    }
    return { ok: true };
  }

  showGhost(x, z, ok) {
    if (!this.ghost) {
      const mesh = this.buildStallMesh();
      mesh.group.traverse((o) => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = Math.min(o.material.opacity, 0.55);
          o.castShadow = false;
        }
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.0, 40), new THREE.MeshBasicMaterial({ color: '#00C667', transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      mesh.group.add(ring);
      this.ghost = { group: mesh.group, ring };
      this.scene.add(mesh.group);
    }
    this.ghost.group.visible = true;
    this.ghost.group.position.set(x, 0, z);
    this.ghost.ring.material.color.set(ok ? '#00C667' : '#FF5C43');
  }

  hideGhost() {
    if (this.ghost) this.ghost.group.visible = false;
  }

  spawnNpcs() {
    const rand = mulberry32(11);
    for (let i = 0; i < 9; i++) {
      const n = this.makeWalker(randomPerson(100 + i), 1.1);
      n.pos = new THREE.Vector3((rand() - 0.5) * 30, 0, (rand() - 0.5) * 30);
      n.target = n.pos.clone();
      n.wait = rand() * 3;
      n.group.position.copy(n.pos);
      this.scene.add(n.group);
      this.npcs.push(n);
    }
  }

  pickNpcTarget(n) {
    const open = [...this.stalls.values()].filter((s) => s.open);
    if (open.length && Math.random() < 0.55) {
      const s = open[Math.floor(Math.random() * open.length)];
      n.target.set(s.group.position.x + (Math.random() - 0.5) * 2.4, 0, s.group.position.z + 1.9 + Math.random() * 1.2);
    } else {
      const p = this.clampPoint((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
      n.target.set(p.x, 0, p.z);
    }
  }

  setupInput() {
    const pointers = new Map();
    let down = null;
    let pinchStart = null;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, this.camera);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, point) ? point : null;
    };
    let dragFrame = 0;
    const placeAt = (e) => {
      const p = groundPoint(e);
      if (p) this.handlers.onGroundTap?.(p.x, p.z);
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.placing && pointers.size === 1 && !this.paused) {
        this.canvas.setPointerCapture?.(e.pointerId);
        placeAt(e);
      }
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        down = null;
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.placing && pointers.size === 1 && !this.paused) {
        const now = performance.now();
        if (now - dragFrame > 16) {
          dragFrame = now;
          placeAt(e);
        }
        return;
      }
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        this.setZoom(pinchStart.zoom * (pinchStart.d / Math.hypot(a.x - b.x, a.y - b.y)));
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (this.placing) {
        if (down && e.type === 'pointerup' && !this.paused) placeAt(e);
        down = null;
        return;
      }
      if (!down || this.paused) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved > 10 || !quick || e.type === 'pointercancel') return;

      const rect = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, this.camera);
      const hits = raycaster.intersectObjects([...this.stalls.values()].map((s) => s.hitbox), false);
      if (hits.length && !this.placing) {
        this.handlers.onStallTap?.(hits[0].object.userData.ownerId);
        return;
      }
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, point)) this.handlers.onGroundTap?.(point.x, point.z);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom * (1 + e.deltaY * 0.0012));
    }, { passive: false });
  }

  setZoom(z) {
    this.zoom = Math.max(0.55, Math.min(1.7, z));
  }

  setMe(id) {
    this.meId = id;
  }

  setPaused(paused) {
    this.paused = paused;
    this.labelsEl.style.display = paused ? 'none' : '';
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 46 : 36;
    this.camera.updateProjectionMatrix();
  }

  restAngle(a) {
    let best = null;
    for (const s of this.stalls.values()) {
      const d = Math.hypot(s.group.position.x - a.pos.x, s.group.position.z - a.pos.z);
      if (d < 3.2 && (!best || d < best.d)) best = { s, d };
    }
    if (!best) return null;
    if (best.s.ownerId === a.id) return 0;
    return Math.atan2(best.s.group.position.x - a.pos.x, best.s.group.position.z - a.pos.z);
  }

  stepWalker(a, dt, speed, t) {
    const dx = a.target.x - a.pos.x;
    const dz = a.target.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.05;
    let want = a.angle;
    if (moving) {
      const step = Math.min(dist, speed * dt);
      a.pos.x += (dx / dist) * step;
      a.pos.z += (dz / dist) * step;
      want = Math.atan2(dx, dz);
    } else {
      const rest = this.restAngle(a);
      if (rest !== null) want = rest;
    }
    let diff = want - a.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.angle += diff * Math.min(1, dt * 10);
    a.person.rotation.y = a.angle;
    a.group.position.set(a.pos.x, 0, a.pos.z);
    animatePerson(a.person, dt, moving, t);
    return moving;
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.paused) return;
    const t = performance.now() / 1000;

    for (const a of this.avatars.values()) {
      if (!a.visible) continue;
      const moving = this.stepWalker(a, dt, WALK_SPEED, t);
      if (a.id === this.meId && !moving && this.arrival) {
        const { resolve } = this.arrival;
        this.arrival = null;
        resolve(true);
      }
    }

    for (const n of this.npcs) {
      const moving = this.stepWalker(n, dt, 2, t);
      if (!moving) {
        n.wait -= dt;
        if (n.wait <= 0) {
          this.pickNpcTarget(n);
          n.wait = 2 + Math.random() * 4;
        }
      }
    }

    for (const s of this.stalls.values()) {
      for (const st of s.steam) {
        if (!s.open) {
          st.material.opacity = 0;
          continue;
        }
        st.userData.t = (st.userData.t + dt * 0.45) % 1;
        const k = st.userData.t;
        st.position.set(Math.sin(k * 6 + st.id) * 0.25, 1.6 + k * 1.1, -0.05);
        st.scale.setScalar(0.35 + k * 0.6);
        st.material.opacity = 0.55 * Math.sin(k * Math.PI);
      }
    }

    const snowPos = this.snow.geometry.attributes.position;
    for (let i = 0; i < snowPos.count; i++) {
      let y = snowPos.getY(i) - dt * (0.9 + (i % 5) * 0.12);
      if (y < 0) y = 22;
      snowPos.setY(i, y);
      snowPos.setX(i, snowPos.getX(i) + Math.sin(t + i) * dt * 0.15);
    }
    snowPos.needsUpdate = true;

    const me = this.avatars.get(this.meId);
    if (me) this.focus.lerp(new THREE.Vector3(me.pos.x, 0, me.pos.z), 1 - Math.exp(-dt * 4));
    this.snow.position.set(this.focus.x, 0, this.focus.z);
    const dist = (this.camera.aspect < 1 ? 1.45 : 1) * this.zoom;
    this.camera.position.lerp(new THREE.Vector3(this.focus.x, 15 * dist, this.focus.z + 15 * dist), 1 - Math.exp(-dt * 6));
    this.camera.lookAt(this.focus.x, 0.8, this.focus.z);

    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  updateLabels() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    const place = (el, x, y, z, visible) => {
      if (!visible) {
        el.style.visibility = 'hidden';
        return;
      }
      v.set(x, y, z).project(this.camera);
      if (v.z > 1 || v.x < -1.3 || v.x > 1.3 || v.y < -1.3 || v.y > 1.3) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    };
    for (const a of this.avatars.values()) place(a.label, a.pos.x, PERSON_H * a.scale + 0.3, a.pos.z, a.visible);
    for (const s of this.stalls.values()) place(s.label, s.group.position.x, 3.55, s.group.position.z, true);
  }
}
