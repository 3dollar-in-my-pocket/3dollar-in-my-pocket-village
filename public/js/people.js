import * as THREE from 'three';

export const PRESETS = [
  { key: 'beanie', name: '털모자', skin: '#F6D7B8', hair: '#3B2A22', hat: 'beanie', hatColor: '#E8584E', coat: '#E9B949', pants: '#4A4A58', scarf: '#FFFFFF' },
  { key: 'bucket', name: '버킷햇', skin: '#EEC39A', hair: '#2B211C', hat: 'bucket', hatColor: '#8A6142', coat: '#2F3446', pants: '#3A3A46', gloves: '#E8E2C8' },
  { key: 'apron', name: '앞치마', skin: '#F9E0C7', hair: '#2B211C', hat: 'knit', hatColor: '#E7E1D8', coat: '#8C7B6C', apron: '#5B5F66', pants: '#4A4A58', mask: true, gloves: '#F2D16B' },
  { key: 'curly', name: '뽀글머리', skin: '#E0AC80', hair: '#2A1E1A', hat: 'curly', coat: '#2B2B33', sleeves: '#9C4FA0', apron: '#D64545', pants: '#3A3A46', gloves: '#FFFFFF' },
  { key: 'cap', name: '야구모자', skin: '#F6D7B8', hair: '#4A3426', hat: 'cap', hatColor: '#3E7CC9', coat: '#5FA46E', pants: '#3A3A46' },
  { key: 'earmuff', name: '귀마개', skin: '#F9E0C7', hair: '#6B4430', hat: 'earmuff', hatColor: '#FF9EAE', coat: '#FFD9DF', pants: '#6E6A80', scarf: '#FF8181' },
];

export const SHOPKEEPER = { key: 'shopkeeper', name: '상회 사장님', skin: '#EEC39A', hair: '#B8B1A8', hat: 'cap', hatColor: '#2F6E5A', coat: '#F3EEE4', sleeves: '#3D6B66', apron: '#3D6B66', pants: '#4A4A58', gloves: null, scarf: null };

export const presetOf = (key) => PRESETS.find((p) => p.key === key) || PRESETS[0];

const SKINS = ['#F6D7B8', '#EEC39A', '#E0AC80', '#F9E0C7', '#D9A273'];
const HAIRS = ['#2A1E1A', '#3B2A22', '#5A3B28', '#7A5236', '#1E1E24', '#B8B1A8'];
const COATS = ['#2F3446', '#E9B949', '#8C7B6C', '#5FA46E', '#C9504A', '#4C6FA8', '#E7D7C1', '#6B4F7A', '#A4683E', '#3D6B66'];
const HAT_COLORS = ['#E8584E', '#3E7CC9', '#E7E1D8', '#8A6142', '#2F3446', '#F2C14E', '#7FB685'];
const HATS = ['none', 'beanie', 'bucket', 'knit', 'cap', 'earmuff', 'curly', 'none'];

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPerson(seed) {
  const r = rng(seed * 9301 + 49297);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const hat = pick(HATS);
  return {
    key: `npc-${seed}`,
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hat,
    hatColor: pick(HAT_COLORS),
    coat: pick(COATS),
    pants: pick(['#3A3A46', '#4A4A58', '#5B4A3E', '#2F3446']),
    scarf: r() < 0.35 ? pick(['#FFFFFF', '#FF8181', '#F2C14E', '#7FB685']) : null,
    mask: r() < 0.12,
    gloves: r() < 0.3 ? pick(['#FFFFFF', '#E8E2C8', '#FF9EAE']) : null,
  };
}

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const matCache = new Map();
function mat(color, extra) {
  const k = `${color}|${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
  return matCache.get(k);
}
const basic = (color, extra) => {
  const k = `basic|${color}|${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ color, ...(extra || {}) }));
  return matCache.get(k);
};

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

const HEAD_Y = 1.2;
const HEAD_R = 0.36;

export function buildPerson(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const pants = mat(cfg.pants || '#3A3A46');
  const coat = mat(cfg.coat);
  const skin = mat(cfg.skin);

  const legGeo = geo('leg', () => new THREE.CapsuleGeometry(0.1, 0.2, 4, 8));
  const shoeGeo = geo('shoe', () => new THREE.SphereGeometry(0.11, 10, 8));
  const legs = [-0.13, 0.13].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, 0);
    pivot.add(mesh(legGeo, pants, 0, -0.18, 0));
    const shoe = mesh(shoeGeo, mat('#3B302A'), 0, -0.36, 0.03);
    shoe.scale.set(1, 0.6, 1.3);
    pivot.add(shoe);
    body.add(pivot);
    return pivot;
  });

  const torso = mesh(geo('torso', () => new THREE.CylinderGeometry(0.27, 0.36, 0.58, 16)), coat, 0, 0.66, 0);
  body.add(torso);
  const puff = mesh(geo('puff', () => new THREE.TorusGeometry(0.31, 0.045, 8, 20)), coat, 0, 0.62, 0);
  puff.rotation.x = Math.PI / 2;
  body.add(puff);

  if (cfg.apron) {
    const apron = mesh(geo('apron', () => new THREE.CylinderGeometry(0.285, 0.375, 0.5, 16, 1, true, -0.9, 1.8)), mat(cfg.apron, { side: THREE.DoubleSide }), 0, 0.6, 0);
    apron.scale.set(1.04, 1, 1.04);
    body.add(apron);
    const pocket = mesh(geo('pocket', () => new THREE.BoxGeometry(0.22, 0.1, 0.02)), mat(shade(cfg.apron, -0.18)), 0, 0.52, 0.375);
    body.add(pocket);
  }

  const armGeo = geo('arm', () => new THREE.CapsuleGeometry(0.085, 0.26, 4, 8));
  const handGeo = geo('hand', () => new THREE.SphereGeometry(0.085, 10, 8));
  const sleeve = mat(cfg.sleeves || cfg.coat);
  const hand = cfg.gloves ? mat(cfg.gloves) : skin;
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.31, 0.88, 0);
    pivot.rotation.z = side * 0.18;
    pivot.add(mesh(armGeo, sleeve, side * 0.03, -0.2, 0));
    pivot.add(mesh(handGeo, hand, side * 0.04, -0.41, 0.02));
    body.add(pivot);
    return pivot;
  });

  if (cfg.scarf) {
    const scarf = mesh(geo('scarf', () => new THREE.TorusGeometry(0.2, 0.075, 8, 18)), mat(cfg.scarf), 0, 0.93, 0);
    scarf.rotation.x = Math.PI / 2;
    body.add(scarf);
    const tail = mesh(geo('scarfTail', () => new THREE.BoxGeometry(0.1, 0.24, 0.05)), mat(cfg.scarf), 0.1, 0.8, 0.24);
    tail.rotation.z = 0.15;
    body.add(tail);
  }

  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  body.add(head);
  head.add(mesh(geo('head', () => new THREE.SphereGeometry(HEAD_R, 24, 18)), skin));

  const eyeGeo = geo('eye', () => new THREE.SphereGeometry(0.04, 10, 8));
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(eyeGeo, basic('#2A211C'));
    eye.position.set(x, 0.02, HEAD_R - 0.025);
    eye.scale.set(1, 1.25, 0.6);
    head.add(eye);
    const shine = new THREE.Mesh(geo('shine', () => new THREE.SphereGeometry(0.012, 6, 6)), basic('#FFFFFF'));
    shine.position.set(x + 0.012, 0.04, HEAD_R + 0.008);
    head.add(shine);
  }
  for (const x of [-0.2, 0.2]) {
    const cheek = new THREE.Mesh(geo('cheek', () => new THREE.CircleGeometry(0.055, 14)), basic('#FF9C9C', { transparent: true, opacity: 0.55 }));
    cheek.position.set(x, -0.07, HEAD_R - 0.04);
    cheek.rotation.y = x * 1.6;
    head.add(cheek);
  }
  if (cfg.mask) {
    const mask = mesh(geo('mask', () => new THREE.SphereGeometry(HEAD_R + 0.012, 18, 10, Math.PI / 2 - 0.75, 1.5, 1.72, 0.55)), mat('#FFFFFF', { side: THREE.DoubleSide }));
    head.add(mask);
  } else {
    const mouth = new THREE.Mesh(geo('mouth', () => new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI)), basic('#7A3B32'));
    mouth.position.set(0, -0.09, HEAD_R - 0.01);
    mouth.rotation.z = Math.PI;
    head.add(mouth);
  }

  addHair(head, cfg);

  root.userData = { body, legs, arms, head, walk: 0 };
  return root;
}

function addHair(head, cfg) {
  const hair = mat(cfg.hair);
  const hatMat = mat(cfg.hatColor || cfg.hair);
  const cap = (r, len, m) => mesh(geo(`cap${r}${len}`, () => new THREE.SphereGeometry(r, 22, 14, 0, Math.PI * 2, 0, len)), m);
  const back = mesh(geo('hairBack', () => new THREE.SphereGeometry(HEAD_R + 0.02, 20, 12, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0.9, 1.15)), hair);

  switch (cfg.hat) {
    case 'beanie': {
      head.add(back, cap(HEAD_R + 0.04, 1.25, hatMat));
      const rim = mesh(geo('beanieRim', () => new THREE.TorusGeometry(HEAD_R + 0.02, 0.06, 8, 24)), mat(shade(cfg.hatColor, -0.12)), 0, 0.12, 0);
      rim.rotation.x = Math.PI / 2 - 0.12;
      head.add(rim, mesh(geo('pom', () => new THREE.SphereGeometry(0.1, 12, 10)), mat('#FFFFFF'), 0, HEAD_R + 0.08, -0.02));
      break;
    }
    case 'knit': {
      head.add(back, cap(HEAD_R + 0.045, 1.35, hatMat));
      const rim = mesh(geo('knitRim', () => new THREE.TorusGeometry(HEAD_R + 0.025, 0.055, 8, 24)), hatMat, 0, 0.09, 0);
      rim.rotation.x = Math.PI / 2 - 0.1;
      head.add(rim);
      break;
    }
    case 'bucket': {
      head.add(back, cap(HEAD_R + 0.02, 1.1, hair));
      const top = mesh(geo('bucketTop', () => new THREE.CylinderGeometry(0.28, 0.36, 0.26, 18)), hatMat, 0, 0.26, 0);
      const brim = mesh(geo('bucketBrim', () => new THREE.CylinderGeometry(0.5, 0.52, 0.035, 22)), hatMat, 0, 0.14, 0.02);
      brim.rotation.x = 0.12;
      const crown = mesh(geo('bucketCrown', () => new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hatMat, 0, 0.38, 0);
      crown.scale.y = 0.35;
      head.add(top, brim, crown);
      break;
    }
    case 'cap': {
      head.add(back, cap(HEAD_R + 0.035, 1.3, hatMat));
      const visor = mesh(geo('visor', () => new THREE.CylinderGeometry(0.24, 0.24, 0.03, 18, 1, false, -Math.PI / 2, Math.PI)), hatMat, 0, 0.13, HEAD_R - 0.02);
      visor.rotation.x = 0.18;
      head.add(visor, mesh(geo('capBtn', () => new THREE.SphereGeometry(0.035, 8, 6)), hatMat, 0, HEAD_R + 0.03, 0));
      break;
    }
    case 'earmuff': {
      head.add(back, cap(HEAD_R + 0.025, 1.2, hair));
      const band = mesh(geo('band', () => new THREE.TorusGeometry(HEAD_R + 0.05, 0.025, 6, 24, Math.PI)), hatMat, 0, 0.02, 0);
      head.add(band);
      for (const x of [-1, 1]) {
        const muff = mesh(geo('muff', () => new THREE.SphereGeometry(0.12, 12, 10)), hatMat, x * (HEAD_R + 0.04), 0, 0);
        muff.scale.x = 0.7;
        head.add(muff);
      }
      break;
    }
    case 'curly': {
      head.add(back);
      const curlGeo = geo('curl', () => new THREE.SphereGeometry(0.1, 10, 8));
      for (let i = 0; i < 26; i++) {
        const t = (i / 26) * Math.PI * 2 * 2.3;
        const lat = 0.15 + (i / 26) * 1.15;
        const r = HEAD_R + 0.03;
        head.add(mesh(curlGeo, hair, Math.sin(lat) * Math.cos(t) * r, Math.cos(lat) * r + 0.02, Math.sin(lat) * Math.sin(t) * r * (Math.sin(t) > 0.6 ? 0.55 : 1)));
      }
      break;
    }
    default:
      head.add(back, cap(HEAD_R + 0.025, 1.2, hair));
      head.add(mesh(geo('bang', () => new THREE.SphereGeometry(0.12, 10, 8)), hair, 0.1, 0.24, 0.26));
  }
}

export function animatePerson(person, dt, moving, t) {
  const u = person.userData;
  if (moving) u.walk += dt * 11;
  else u.walk *= 0.85;
  const swing = moving ? Math.sin(u.walk) : 0;
  u.legs[0].rotation.x = swing * 0.7;
  u.legs[1].rotation.x = -swing * 0.7;
  u.arms[0].rotation.x = -swing * 0.6;
  u.arms[1].rotation.x = swing * 0.6;
  u.body.position.y = moving ? Math.abs(Math.cos(u.walk)) * 0.06 : Math.sin(t * 2 + person.id) * 0.012;
  u.head.rotation.z = moving ? Math.sin(u.walk) * 0.05 : Math.sin(t * 0.9 + person.id) * 0.04;
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

let studio = null;
function getStudio() {
  if (studio) return studio;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#C8B6A2', 1.15));
  const key = new THREE.DirectionalLight('#FFF4E6', 1.35);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  studio = { renderer, scene, camera };
  return studio;
}

const portraitCache = new Map();

export function portrait(cfg, { size = 200, pose = 'bust' } = {}) {
  const cacheKey = `${JSON.stringify(cfg)}|${size}|${pose}`;
  if (portraitCache.has(cacheKey)) return portraitCache.get(cacheKey);
  const { renderer, scene, camera } = getStudio();
  const w = size;
  const h = pose === 'full' ? Math.round(size * 1.35) : size;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const person = buildPerson(cfg);
  const back = pose === 'back' || pose === 'back-thumbs';
  person.rotation.y = pose === 'front' ? 0 : back ? Math.PI - 0.35 : -0.32;
  if (pose === 'wave') {
    person.userData.arms[1].rotation.z = 2.4;
    person.userData.arms[1].rotation.x = -0.2;
  }
  scene.add(person);
  let thumb = null;
  if (pose === 'back-thumbs') thumb = raiseThumb(scene, person);
  else if (pose === 'thumbs') thumb = raiseThumb(scene, person, true);
  if (back) {
    const shift = thumb ? 0.2 : 0; // 든 팔이 잘리지 않게 살짝 오른쪽을 비춤
    camera.fov = 24;
    camera.position.set(shift, 1.5, 3.1);
    camera.lookAt(shift, 1.02, 0);
  } else if (pose === 'full') {
    camera.fov = 30;
    camera.position.set(0, 0.95, 4.2);
    camera.lookAt(0, 0.82, 0);
  } else {
    const shift = thumb ? 0.15 : 0;
    camera.fov = 26;
    camera.position.set(shift, 1.12, 3.2);
    camera.lookAt(shift, 0.98, 0);
  }
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(person);
  if (thumb) scene.remove(thumb);
  portraitCache.set(cacheKey, url);
  return url;
}

// 뒷모습에서 카메라 쪽(화면 오른쪽) 팔을 들어 사장님 쪽으로 따봉
// 앞모습(front=true)은 화면 오른쪽에 오는 왼팔을 듦
function raiseThumb(scene, person, front = false) {
  const { arms } = person.userData;
  const arm = front ? arms[1] : arms[0];
  arm.rotation.z = front ? 2.15 : -2.15;
  arm.rotation.x = front ? -0.15 : 0.2;
  const hand = arm.children[1];
  hand.scale.set(1.55, 1.35, 1.45);
  person.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  hand.getWorldPosition(pos);
  const thumb = new THREE.Mesh(geo('thumb', () => new THREE.CapsuleGeometry(0.058, 0.1, 4, 10)), hand.material);
  thumb.position.set(pos.x - 0.03, pos.y + 0.16, pos.z);
  thumb.rotation.z = 0.35;
  scene.add(thumb);
  return thumb;
}

export const presetPortrait = (key, opts) => portrait(presetOf(key), opts);
