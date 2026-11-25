import * as THREE from './vendor/three.module.min.js';

/* ============================================================
   Le refuge du lac — démo 3D (Three.js, tout est généré par code)
   Terrain, rivière, forêt, rochers, herbe, fleurs, ciel, nuages,
   cabane, cycle jour/nuit, joystick tactile, compteur FPS.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(20241125);

function hash(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 5) { let a = .5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= .5; } return s; }

/* ---------------- Monde : hauteur du terrain ---------------- */
const HALF = 125;          // le terrain jouable fait 250 x 250 m
const WATER_Y = -0.6;
const CAB = { x: 38, z: 22, r: 11 };
const riverX = (z) => Math.sin(z * .032 + 1.2) * 20 - 8 + Math.sin(z * .011) * 10;

function rawH(x, z) {
  let h = 2 + fbm(x * .011 + 3, z * .011 + 7) * 9;
  const north = sm(-30, -120, z);
  const ridge = 1 - Math.abs(fbm(x * .008 + 11, z * .008 + 5) * 2 - 1);
  h += north * north * (22 + ridge * 62);
  h += sm(85, 125, Math.abs(x)) * (14 + fbm(z * .02, x * .02) * 16) + sm(95, 125, z) * (12 + fbm(x * .02, 4) * 14);
  const far = sm(125, 320, Math.max(Math.abs(x), Math.abs(z)));
  if (far > 0) h += far * (40 + (1 - Math.abs(fbm(x * .004 + 2, z * .004 + 9) * 2 - 1)) * 170);
  return h;
}
const CAB_H = rawH(CAB.x, CAB.z);
function heightAt(x, z) {
  let h = rawH(x, z);
  const d = Math.abs(x - riverX(z));
  const rv = sm(-82, -60, z);
  const w = Math.exp(-(d * d) / (2 * 5.5 * 5.5)) * rv;
  h += (-1.8 - h) * Math.min(1, w * 1.6);
  const dc = Math.hypot(x - CAB.x, z - CAB.z);
  h += (CAB_H - h) * (1 - sm(CAB.r, CAB.r + 14, dc));
  return h;
}
function slopeAt(x, z) { const e = 1.2; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); }
const riverDist = (x, z) => Math.abs(x - riverX(z));

/* ---------------- Rendu, scène, caméra ---------------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3f5, 120, 800);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);

const QUAL = {
  low:  { name: 'Bas',   dpr: 1,    shadow: 0,    grass: 3500,  flowers: 500 },
  med:  { name: 'Moyen', dpr: 1.25, shadow: 1024, grass: 9000,  flowers: 1200 },
  high: { name: 'Élevé', dpr: 2,    shadow: 2048, grass: 15000, flowers: 2000 }
};
let qKey = 'med';

/* ---------------- Textures dessinées par code ---------------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }

function noiseTex() { // grain peint pour le sol
  const c = makeCanvas(256, 256), g = c.getContext('2d'), im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const n = fbm(x / 24, y / 24, 4) * .6 + hash(x, y) * .4, v = 200 + n * 55, i = (y * 256 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); const t = tex(c, true); t.repeat.set(70, 70); return t;
}
function woodTex(base, jit) { // rondins horizontaux
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const y = i * 32, k = (rnd() - .5) * jit;
    g.fillStyle = `rgb(${base[0] + k},${base[1] + k * .8},${base[2] + k * .6})`; g.fillRect(0, y, 256, 32);
    const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = gr; g.fillRect(0, y, 256, 32);
    for (let j = 0; j < 14; j++) { g.strokeStyle = `rgba(40,22,10,${.08 + rnd() * .12})`; g.beginPath(); const yy = y + 3 + rnd() * 26, x0 = rnd() * 256; g.moveTo(x0, yy); g.lineTo(x0 + 20 + rnd() * 60, yy + (rnd() - .5) * 2); g.stroke(); }
  }
  const t = tex(c, true); return t;
}
function shingleTex() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  for (let r = 0; r < 8; r++) for (let i = -1; i < 8; i++) {
    const x = i * 32 + (r % 2) * 16, y = r * 32, k = (rnd() - .5) * 30;
    g.fillStyle = `rgb(${96 + k},${58 + k * .6},${44 + k * .5})`; g.fillRect(x, y, 31, 31);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + 27, 31, 4);
  }
  return tex(c, true);
}
function grassTex() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  for (let i = 0; i < 11; i++) {
    const x = 10 + rnd() * 108, h = 55 + rnd() * 66, lean = (rnd() - .5) * 28, w = 4 + rnd() * 3;
    const gr = g.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, '#2f5a1c'); gr.addColorStop(.6, '#6f9c34'); gr.addColorStop(1, '#b9d56a');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + lean * .3, 128 - h * .55, x + lean, 128 - h); g.quadraticCurveTo(x + lean * .5 + w * .3, 128 - h * .5, x + w, 128); g.closePath(); g.fill();
  }
  return tex(c, false);
}
function flowerTex() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  g.strokeStyle = '#4c7a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 64); g.lineTo(32, 30); g.stroke();
  g.fillStyle = '#4c7a2a'; g.beginPath(); g.ellipse(24, 50, 8, 3, -.5, 0, 7); g.ellipse(41, 46, 8, 3, .5, 0, 7); g.fill();
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.ellipse(32 + Math.cos(a) * 9, 22 + Math.sin(a) * 9, 7, 5, a, 0, 7); g.fill(); }
  g.fillStyle = '#f2b81c'; g.beginPath(); g.arc(32, 22, 5, 0, 7); g.fill();
  return tex(c, false);
}
function cloudTex() {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = 50 + rnd() * 156, y = 50 + rnd() * 34 - Math.abs(x - 128) * .12, r = 22 + rnd() * 24;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.6, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return tex(c, false);
}

/* ---------------- Lumières et ciel ---------------- */
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a2a, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.castShadow = false; scene.add(sun); scene.add(sun.target);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
const sc = sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;

const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top,hor,sunDir,sunCol; uniform float night; varying vec3 vP;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){ vec3 d=normalize(vP); float h=d.y;
      vec3 c=mix(hor,top,pow(clamp(h,0.,1.),.55)); if(h<0.) c=mix(hor,hor*.6,clamp(-h*4.,0.,1.));
      float s=max(dot(d,normalize(sunDir)),0.);
      c+=sunCol*(pow(s,900.)*3.+pow(s,18.)*.28+pow(s,4.)*.08);
      vec2 g=floor(d.xz/(abs(d.y)+.15)*90.); float st=step(.9972,h21(g))*smoothstep(.1,.4,h)*night;
      c+=vec3(st);
      gl_FragColor=vec4(c,1.); }`
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

const clouds = [];
{
  const ct = cloudTex();
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: .9 }));
    const s = 160 + rnd() * 200; m.scale.set(s, s * .5, 1);
    m.position.set((rnd() - .5) * 900, 140 + rnd() * 90, (rnd() - .5) * 900);
    scene.add(m); clouds.push(m);
  }
}

/* heures clés : [heure, zenith, horizon, soleil, intensité soleil, ambiant, brume] */
const C = (h) => new THREE.Color(h);
const KEYS = [
  [0,   C('#050a1c'), C('#16223f'), C('#8fa6d9'), 0.35, 0.28],
  [5,   C('#0b1636'), C('#3a3f66'), C('#8fa6d9'), 0.30, 0.30],
  [6.5, C('#3b5a9a'), C('#f2a679'), C('#ffb070'), 1.3,  0.55],
  [9,   C('#3f8fe0'), C('#bfe3f5'), C('#fff4e0'), 2.7,  0.85],
  [13,  C('#2f80dd'), C('#a8d8f0'), C('#ffffff'), 3.0,  0.95],
  [17,  C('#3a82d4'), C('#cfe3e8'), C('#ffe2b0'), 2.7,  0.85],
  [19.5, C('#4a4f8f'), C('#f08a5d'), C('#ff9a55'), 1.4, 0.55],
  [21,  C('#101a3d'), C('#2c3156'), C('#8fa6d9'), 0.35, 0.30],
  [24,  C('#050a1c'), C('#16223f'), C('#8fa6d9'), 0.35, 0.28]
];
let hour = 16.0, autoTime = true;
const tmpA = new THREE.Color();
function applyTime() {
  let i = 0; while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = (hour - a[0]) / (b[0] - a[0]);
  skyU.top.value.copy(a[1]).lerp(b[1], t); skyU.hor.value.copy(a[2]).lerp(b[2], t);
  const sunCol = tmpA.copy(a[3]).lerp(b[3], t);
  const sunI = lerp(a[4], b[4], t), amb = lerp(a[5], b[5], t);
  const ang = (hour - 6) / 12 * Math.PI, el = Math.sin(ang);
  const dir = new THREE.Vector3(Math.cos(ang) * .9, el, .42).normalize();
  const night = clamp(1 - sm(-0.05, 0.25, el), 0, 1);
  skyU.night.value = night;
  const L = night > .5 ? dir.clone().multiplyScalar(-1).setY(Math.abs(dir.y) + .35).normalize() : dir;   // la lune éclaire d'en haut
  skyU.sunDir.value.copy(dir); skyU.sunCol.value.copy(sunCol);
  sun.color.copy(night > .5 ? C('#9db4ff') : sunCol); sun.intensity = night > .5 ? 0.45 : Math.max(0.2, sunI);
  sun.userData.dir = L;
  hemi.color.copy(skyU.top.value).lerp(C('#ffffff'), .35); hemi.groundColor.set(0x4a5a2a).multiplyScalar(.4 + .6 * amb); hemi.intensity = amb * 1.15 + .12;
  scene.fog.color.copy(skyU.hor.value);
  renderer.toneMappingExposure = lerp(1.1, .95, 1 - night);
  waterU.dayK.value = clamp(.25 + .75 * (1 - night) * Math.max(.35, amb), .2, 1);
  waterU.sunDir.value.copy(dir); waterU.sunCol.value.copy(sunCol); waterU.sky.value.copy(skyU.hor.value).lerp(skyU.top.value, .35);
  waterU.fogC.value.copy(skyU.hor.value);
  if (cabinLight) cabinLight.intensity = night * 14; if (winMat) winMat.emissiveIntensity = night * 1.8;
  clouds.forEach(c => { c.material.color.copy(skyU.hor.value).lerp(C('#ffffff'), .55 + .35 * (1 - night)).multiplyScalar(.35 + .65 * (1 - night)); });
}

/* ---------------- Terrain ---------------- */
const noiseMap = noiseTex();
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: noiseMap });

function terrainColor(x, z, h, ny, out) {
  const n1 = fbm(x * .06, z * .06), n2 = fbm(x * .2 + 9, z * .2);
  const grass = C('#5f9438').lerp(C('#8db04a'), n1).lerp(C('#3f7230'), clamp((n2 - .5) * 1.6, 0, .7));
  out.copy(grass);
  const forestZone = sm(8, 26, h) * (1 - sm(40, 55, h));
  out.lerp(C('#3a6a2c'), forestZone * .45 * n2);
  if (h < 0.7) out.lerp(C('#a99468'), 1 - sm(-0.8, .7, h));
  if (h < WATER_Y + .25) out.lerp(C('#6d6a52'), .85);
  const rock = Math.max(sm(.62, .85, 1 - ny) * 1.2, sm(34, 56, h) * .8);
  out.lerp(C('#857b6e').lerp(C('#a49d92'), n1), clamp(rock, 0, 1));
  out.lerp(C('#f3f6fa'), sm(68, 88, h + n2 * 12) * (.5 + .5 * ny));
  return out;
}

const terrain = (() => {
  const SEG = 180;
  const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const cols = new Float32Array(p.count * 3), n = g.attributes.normal, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { terrainColor(p.getX(i), p.getZ(i), p.getY(i), n.getY(i), c); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, terrainMat); m.receiveShadow = true; scene.add(m); return m;
})();

const farTerrain = (() => { // anneau de montagnes lointaines
  const SEG = 120, S = 1000, step = S / SEG, pos = [], idx = [], cols = [], c = new THREE.Color();
  for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
    const x = -S / 2 + i * step, z = -S / 2 + j * step, h = heightAt(x, z);
    pos.push(x, h, z); terrainColor(x, z, h, .8 - sm(40, 160, h) * .45, c); cols.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const cx = -S / 2 + (i + .5) * step, cz = -S / 2 + (j + .5) * step;
    if (Math.abs(cx) < HALF && Math.abs(cz) < HALF) continue;
    const a = j * (SEG + 1) + i, b = a + 1, d = a + SEG + 1, e = d + 1; idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m); return m;
})();

/* ---------------- Rivière turquoise ---------------- */
const waterU = {
  time: { value: 0 }, dayK: { value: 1 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
  sky: { value: new THREE.Color() }, fogC: { value: new THREE.Color() }, fogN: { value: 120 }, fogF: { value: 800 }
};
const water = (() => {
  const X0 = -75, X1 = 55, Z0 = -90, Z1 = HALF, SX = 130, SZ = 215;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, SX, SZ); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, WATER_Y, (Z0 + Z1) / 2);
  const p = g.attributes.position, dep = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) dep[i] = WATER_Y - heightAt(p.getX(i), p.getZ(i));
  g.setAttribute('depth', new THREE.BufferAttribute(dep, 1));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: waterU,
    vertexShader: `attribute float depth; varying float vD; varying vec3 vW; varying float vZ;
      void main(){ vD=depth; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vZ=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float time,dayK,fogN,fogF; uniform vec3 sunDir,sunCol,sky,fogC; varying float vD; varying vec3 vW; varying float vZ;
      float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
      float wv(vec2 p){ return vn(p*vec2(.9,.35)+vec2(0.,-time*1.1))*.6+vn(p*vec2(2.2,.9)+vec2(time*.25,-time*1.9))*.4; }
      void main(){
        if(vD<=0.) discard;
        vec2 p=vW.xz; float e=.12; float c0=wv(p);
        vec3 N=normalize(vec3((wv(p+vec2(e,0.))-c0)*-2.2,1.,(wv(p+vec2(0.,e))-c0)*-2.2));
        vec3 V=normalize(cameraPosition-vW); vec3 L=normalize(sunDir);
        float fr=pow(1.-max(dot(N,V),0.),3.);
        vec3 shallow=vec3(.10,.74,.70), deep=vec3(.0,.33,.46);
        vec3 col=mix(shallow,deep,smoothstep(.0,2.3,vD));
        col=mix(col,sky,clamp(fr*.42,0.,.6));
        float spec=pow(max(dot(reflect(-L,N),V),0.),160.);
        col*=dayK; col+=sunCol*spec*2.2*dayK;
        float foam=smoothstep(.38,.02,vD)*(.55+.45*vn(p*3.+time*.4));
        col=mix(col,vec3(1.)*dayK,foam*.5);
        float a=mix(.5,.93,smoothstep(.0,1.6,vD)); a*=smoothstep(.0,.1,vD); a=max(a,foam*.9);
        float f=clamp((vZ-fogN)/(fogF-fogN),0.,1.); col=mix(col,fogC,f);
        gl_FragColor=vec4(col,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  m.renderOrder = 2; scene.add(m); return m;
})();

/* ---------------- Fusion de formes simples ---------------- */
const M4 = THREE.Matrix4;
function mat(px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const m = new M4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)); return m;
}
function merge(parts) {
  const pos = [], nor = [], col = [];
  for (const q of parts) {
    const g = q.g.index ? q.g.toNonIndexed() : q.g.clone(); g.applyMatrix4(q.m || new M4());
    if (q.flat) g.computeVertexNormals();
    const c = new THREE.Color(q.c), pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i));
      const j = (q.jit || 0) * (hash(pa.getX(i) * 3.1, pa.getZ(i) * 2.7 + pa.getY(i)) - .5);
      col.push(c.r * (1 + j), c.g * (1 + j), c.b * (1 + j));
    }
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o;
}
function blob(r, seed) { const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + .22 * (hash(p.getX(i) * 5 + seed, p.getZ(i) * 5 + p.getY(i) * 3) - .5); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .85, p.getZ(i) * k); } return g; }

const circles = []; // collisions : arbres, rochers

/* ---------------- Arbres ---------------- */
function makePine() {
  const parts = [{ g: new THREE.CylinderGeometry(.16, .26, 2.2, 6), c: '#5a3d25', m: mat(0, 1.1, 0), jit: .3 }];
  const L = [[1.9, 1.6, 2.4, '#2f5d2a'], [1.5, 1.4, 3.7, '#3a6b30'], [1.1, 1.3, 4.8, '#467a36'], [.7, 1.1, 5.7, '#548a3e']];
  L.forEach(([r, h, y, c]) => parts.push({ g: new THREE.ConeGeometry(r, h * 1.5, 8), c, m: mat(0, y, 0), jit: .35 }));
  return merge(parts);
}
function makeBroad() {
  const parts = [{ g: new THREE.CylinderGeometry(.2, .34, 2.6, 6), c: '#6a4a2c', m: mat(0, 1.3, 0), jit: .3 },
    { g: new THREE.CylinderGeometry(.08, .14, 1.2, 5), c: '#6a4a2c', m: mat(.5, 2.9, 0, 1, 1, 1, 0, 0, -.8), jit: .2 }];
  [[0, 4.2, 0, 2, '#4f8a35'], [1.3, 3.6, .3, 1.5, '#5d9a3c'], [-1.2, 3.7, -.4, 1.6, '#467c30'], [.2, 5.1, .2, 1.4, '#6aa845']].forEach(([x, y, z, r, c], i) => parts.push({ g: blob(r, i * 7), c, m: mat(x, y, z), jit: .3, flat: true }));
  return merge(parts);
}
const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const pines = new THREE.InstancedMesh(makePine(), treeMat, 300), broads = new THREE.InstancedMesh(makeBroad(), treeMat, 170);
for (const m of [pines, broads]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
{
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let np = 0, nb = 0, tries = 0;
  while ((np < 300 || nb < 170) && tries++ < 40000) {
    const x = (rnd() * 2 - 1) * (HALF - 6), z = (rnd() * 2 - 1) * (HALF - 6), h = heightAt(x, z);
    if (h < 0.9 || h > 34 || riverDist(x, z) < 9 && z > -75) continue;
    if (Math.hypot(x - CAB.x, z - CAB.z) < 14 || Math.hypot(x + 14, z - 62) < 6) continue;
    if (slopeAt(x, z) > .75) continue;
    const dens = fbm(x * .03 + 20, z * .03 + 5); if (rnd() > .25 + dens * 1.1) continue;
    const pine = h > 14 ? rnd() < .85 : rnd() < .45, s = .8 + rnd() * .7;
    if (pine ? np >= 300 : nb >= 170) continue;
    dummy.position.set(x, h - .15, z); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.set(s * (.9 + rnd() * .2), s * (.9 + rnd() * .3), s * (.9 + rnd() * .2)); dummy.updateMatrix();
    col.setScalar(.82 + rnd() * .3); col.r *= .95 + rnd() * .15; col.g *= .95 + rnd() * .1;
    if (pine) { pines.setMatrixAt(np, dummy.matrix); pines.setColorAt(np, col); np++; } else { broads.setMatrixAt(nb, dummy.matrix); broads.setColorAt(nb, col); nb++; }
    circles.push({ x, z, r: .45 * s });
  }
  pines.count = np; broads.count = nb;
}

/* ---------------- Rochers ---------------- */
const rockGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + .35 * (hash(p.getX(i) * 4, p.getY(i) * 4 + p.getZ(i) * 3) - .5); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .75, p.getZ(i) * k); } const n = g.toNonIndexed(); n.computeVertexNormals(); return n; })();
const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true }), 150);
rocks.castShadow = true; rocks.receiveShadow = false; rocks.frustumCulled = false; scene.add(rocks);
{
  const dummy = new THREE.Object3D(), col = new THREE.Color(); let n = 0, tries = 0;
  while (n < 150 && tries++ < 20000) {
    const x = (rnd() * 2 - 1) * (HALF - 5), z = (rnd() * 2 - 1) * (HALF - 5), h = heightAt(x, z), rd = riverDist(x, z), s0 = slopeAt(x, z);
    const bank = z > -75 && rd > 5.5 && rd < 10, mount = h > 24 && s0 > .4, rare = rnd() < .04 && h > 1;
    if (!(bank && rnd() < .5 || mount && rnd() < .12 || rare)) continue;
    if (Math.hypot(x - CAB.x, z - CAB.z) < 12 || Math.hypot(x + 14, z - 62) < 5) continue;
    const s = bank ? .5 + rnd() * 1.1 : .7 + rnd() * 2.2;
    dummy.position.set(x, h + s * .12, z); dummy.rotation.set((rnd() - .5) * .4, rnd() * 6.28, (rnd() - .5) * .4); dummy.scale.set(s * (1 + rnd() * .5), s * (.7 + rnd() * .5), s * (1 + rnd() * .5)); dummy.updateMatrix();
    rocks.setMatrixAt(n, dummy.matrix); col.set('#8a847a').lerp(new THREE.Color('#b0a79a'), rnd()).lerp(new THREE.Color('#6d7a55'), rnd() < .3 ? .4 : 0); rocks.setColorAt(n, col);
    circles.push({ x, z, r: s * .95 }); n++;
  }
  rocks.count = n;
}

/* ---------------- Herbe et fleurs ---------------- */
const time = { value: 0 };
function windMat(map, extra) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: .45, side: THREE.DoubleSide, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
      float sw = sin(uTime*1.8 + ip.x*.45 + ip.z*.3) * .12 + sin(uTime*3.1 + ip.x*1.3) * .035;
      transformed.x += sw * uv.y; transformed.z += sw * .6 * uv.y;`);
  };
  return m;
}
function crossQuad(w, h) { // deux plans croisés, normales vers le haut pour un éclairage doux
  const pos = [], uv = [], nor = [], idx = [];
  for (let q = 0; q < 2; q++) {
    const a = q ? Math.PI / 2 : 0, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, -cx, h, -cz, cx, h, cz); uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
const grassMesh = new THREE.InstancedMesh(crossQuad(1.5, 1.0), windMat(grassTex()), QUAL.high.grass);
const flowerMesh = new THREE.InstancedMesh(crossQuad(.4, .5), windMat(flowerTex()), QUAL.high.flowers);
for (const m of [grassMesh, flowerMesh]) { m.frustumCulled = false; scene.add(m); }
{
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const PAL = ['#ffffff', '#fff2a0', '#f4a8d6', '#b59cf2', '#8fc2ff', '#ffb75c'];
  let n = 0, tries = 0;
  while (n < QUAL.high.grass && tries++ < 120000) {
    const x = (rnd() * 2 - 1) * (HALF - 3), z = (rnd() * 2 - 1) * (HALF - 3), h = heightAt(x, z);
    if (h < .55 || h > 30 || slopeAt(x, z) > .55 || Math.hypot(x - CAB.x, z - CAB.z) < 4.5) continue;
    dummy.position.set(x, h - .05, z); dummy.rotation.set(0, rnd() * 3.14, 0); const s = .7 + rnd() * .8; dummy.scale.set(s, s * (.8 + rnd() * .6), s); dummy.updateMatrix();
    grassMesh.setMatrixAt(n, dummy.matrix); col.set('#ffffff').lerp(new THREE.Color('#b8c870'), rnd() * .5).multiplyScalar(.75 + rnd() * .35); grassMesh.setColorAt(n, col); n++;
  }
  n = 0; tries = 0;
  while (n < QUAL.high.flowers && tries++ < 120000) {
    const x = (rnd() * 2 - 1) * (HALF - 3), z = (rnd() * 2 - 1) * (HALF - 3), h = heightAt(x, z);
    if (h < .6 || h > 24 || slopeAt(x, z) > .45 || Math.hypot(x - CAB.x, z - CAB.z) < 5) continue;
    if (fbm(x * .08 + 40, z * .08) < .52 && rnd() < .85) continue;   // les fleurs poussent par massifs
    dummy.position.set(x, h - .02, z); dummy.rotation.set(0, rnd() * 3.14, 0); const s = .8 + rnd() * .7; dummy.scale.set(s, s, s); dummy.updateMatrix();
    flowerMesh.setMatrixAt(n, dummy.matrix); col.set(PAL[Math.floor(fbm(x * .05, z * .05) * 9 + rnd() * 2) % PAL.length]); flowerMesh.setColorAt(n, col); n++;
  }
  flowerMesh.userData.max = n; grassMesh.userData.max = QUAL.high.grass;
}

/* ---------------- Cabane ---------------- */
let cabinLight = null, winMat = null;
const cabin = (() => {
  const g = new THREE.Group(); g.position.set(CAB.x, CAB_H, CAB.z);
  const wood = new THREE.MeshLambertMaterial({ map: woodTex([150, 100, 62], 40) }); wood.map.repeat.set(2, 1.6);
  const wood2 = new THREE.MeshLambertMaterial({ map: woodTex([150, 100, 62], 40) }); wood2.map.repeat.set(1.7, 1.6);
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a3020 }), stone = new THREE.MeshLambertMaterial({ color: 0x8a857c, flatShading: true });
  const roofM = new THREE.MeshLambertMaterial({ map: shingleTex() }); roofM.map.repeat.set(3, 1.6);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(6, .5, 5), stone, 0, .05, 0);                                   // fondation
  add(new THREE.BoxGeometry(5.9, 2.6, 4.9), wood, 0, 1.85, 0);                              // murs
  for (const [x, z] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) add(new THREE.CylinderGeometry(.22, .22, 2.9, 8), new THREE.MeshLambertMaterial({ color: 0x6b4a2c }), x, 1.8, z); // poteaux d'angle
  const th = 28 * Math.PI / 180, pw = 2.95 / Math.cos(th);
  add(new THREE.BoxGeometry(6.9, .2, pw), roofM, 0, 3.15 + 2.95 * Math.tan(th) / 2 + .1, 1.475, th, 0, 0);
  add(new THREE.BoxGeometry(6.9, .2, pw), roofM, 0, 3.15 + 2.95 * Math.tan(th) / 2 + .1, -1.475, -th, 0, 0);
  add(new THREE.BoxGeometry(7, .22, .3), dark, 0, 3.15 + 2.5 * Math.tan(th) + .25, 0);
  for (const sx of [-1, 1]) { const sh = new THREE.Shape(); sh.moveTo(-2.45, 0); sh.lineTo(2.45, 0); sh.lineTo(0, 2.45 * Math.tan(th)); sh.closePath(); const o = new THREE.Mesh(new THREE.ShapeGeometry(sh), wood2); o.position.set(sx * 2.96, 3.15, 0); o.rotation.y = sx * Math.PI / 2; g.add(o); }
  add(new THREE.BoxGeometry(.8, 2.2, .8), stone, 2, 4.2, -.9);                               // cheminée
  add(new THREE.BoxGeometry(1, .2, 1), dark, 2, 5.3, -.9);
  add(new THREE.BoxGeometry(1.05, 1.95, .14), dark, -1.2, 1.3, 2.5);                         // porte
  add(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc9a24a }), -.8, 1.25, 2.6);
  winMat = new THREE.MeshLambertMaterial({ color: 0x6f95a8, emissive: 0xffb45c, emissiveIntensity: 0 });
  for (const wx of [1.4]) { add(new THREE.BoxGeometry(1.15, 1, .1), winMat, wx, 1.9, 2.47); add(new THREE.BoxGeometry(1.35, .12, .16), dark, wx, 1.35, 2.5); add(new THREE.BoxGeometry(1.35, .12, .16), dark, wx, 2.45, 2.5); add(new THREE.BoxGeometry(.12, 1.25, .16), dark, wx - .62, 1.9, 2.5); add(new THREE.BoxGeometry(.12, 1.25, .16), dark, wx + .62, 1.9, 2.5); add(new THREE.BoxGeometry(.08, 1, .16), dark, wx, 1.9, 2.5); }
  add(new THREE.BoxGeometry(1.0, 1, .1), winMat, 3.0, 1.9, .3, 0, Math.PI / 2, 0);
  add(new THREE.BoxGeometry(6, .25, 1.5), new THREE.MeshLambertMaterial({ color: 0x7a5a38 }), 0, .45, 3.25);   // terrasse
  add(new THREE.BoxGeometry(2, .15, .5), new THREE.MeshLambertMaterial({ color: 0x7a5a38 }), -1.2, .22, 4.25);
  for (const px of [-2.8, 2.8]) add(new THREE.CylinderGeometry(.09, .09, 2, 6), dark, px, 1.5, 3.85);
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(.16, .16, 1.4, 7), new THREE.MeshLambertMaterial({ color: 0x8a5e36 }), -3.7 + (i % 3) * .34, .3 + Math.floor(i / 3) * .3, 0.3 + 0, Math.PI / 2, 0, 0); // tas de bûches
  cabinLight = new THREE.PointLight(0xffb45c, 0, 18, 1.6); cabinLight.position.set(1.4, 2.2, 4.6); g.add(cabinLight);
  scene.add(g); return g;
})();
const cabBox = { x0: CAB.x - 3.2, x1: CAB.x + 3.2, z0: CAB.z - 2.7, z1: CAB.z + 2.7 };

/* ---------------- Personnage ---------------- */
const hero = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .62, 4, 10), new THREE.MeshLambertMaterial({ color: 0xc2553b })); body.position.y = 1.0; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe0b08a })); head.position.y = 1.68; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.215, 12, 8, 0, 6.3, 0, 1.2), new THREE.MeshLambertMaterial({ color: 0x2c4a6e })); cap.position.y = 1.7; cap.castShadow = true;
  const legM = new THREE.MeshLambertMaterial({ color: 0x3a3f52 });
  const l1 = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .5, 3, 6), legM), l2 = l1.clone(); l1.position.set(-.13, .38, 0); l2.position.set(.13, .38, 0); l1.castShadow = l2.castShadow = true;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.34, .44, .2), new THREE.MeshLambertMaterial({ color: 0x6b5236 })); pack.position.set(0, 1.1, -.28); pack.castShadow = true;
  g.add(body, head, cap, l1, l2, pack); g.userData = { l1, l2 }; scene.add(g); return g;
})();

/* ---------------- Entrées : joystick, regard, clavier ---------------- */
const P = { x: -14, z: 62, y: 0, yaw: -0.55, pitch: .32, dist: 5.2, fp: false, vx: 0, vz: 0, walk: 0 };
P.y = heightAt(P.x, P.z);
const stick = { id: null, x: 0, y: 0 }, look = { id: null, lx: 0, ly: 0 }, keys = {};
const stickEl = $('stick'), knob = $('knob');
function stickSet(e) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 6;
  let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
  stick.x = dx / R; stick.y = -dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
}
stickEl.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); stickSet(e); e.preventDefault(); });
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) stickSet(e); });
const stickEnd = (e) => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);
canvas.addEventListener('pointerdown', (e) => { if (look.id === null) { look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== look.id) return; P.yaw -= (e.clientX - look.lx) * .0055; P.pitch = clamp(P.pitch + (e.clientY - look.ly) * .0045, -.5, 1.25); look.lx = e.clientX; look.ly = e.clientY; });
const lookEnd = (e) => { if (e.pointerId === look.id) look.id = null; };
canvas.addEventListener('pointerup', lookEnd); canvas.addEventListener('pointercancel', lookEnd);
canvas.addEventListener('wheel', (e) => { P.dist = clamp(P.dist + e.deltaY * .004, 2.5, 12); }, { passive: true });
addEventListener('keydown', (e) => { keys[e.code] = true; }); addEventListener('keyup', (e) => { keys[e.code] = false; });

let toastT = 0; function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3500); }

/* ---------------- Qualité ---------------- */
function applyQuality(k) {
  qKey = k; const q = QUAL[k];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr)); resize();
  grassMesh.count = q.grass; flowerMesh.count = Math.min(q.flowers, flowerMesh.userData.max || q.flowers);
  sun.castShadow = q.shadow > 0; renderer.shadowMap.enabled = q.shadow > 0;
  if (q.shadow > 0) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  $('bQ').textContent = 'Qualité : ' + q.name;
}
$('bQ').onclick = () => applyQuality(qKey === 'low' ? 'med' : qKey === 'med' ? 'high' : 'low');
$('bV').onclick = () => { P.fp = !P.fp; $('bV').textContent = 'Vue : ' + (P.fp ? '1re personne' : '3e personne'); };
$('bT').onclick = () => { hour = (hour + 3) % 24; applyTime(); };

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------------- Boucle ---------------- */
const grid = new Map(); const CELL = 8;
for (const c of circles) { const k = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
function collide(x, z) {
  const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((gx + i) + ',' + (gz + j)); if (!a) continue;
    for (const c of a) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + .35; if (d < m && d > 1e-4) { x = c.x + dx / d * m; z = c.z + dz / d * m; } } }
  const nx = clamp(x, cabBox.x0, cabBox.x1), nz = clamp(z, cabBox.z0, cabBox.z1);
  let dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz);
  if (d < .38) { if (d < 1e-4) { x = cabBox.x1 + .4; } else { x = nx + dx / d * .38; z = nz + dz / d * .38; } }
  return [x, z];
}

let last = performance.now(), fpsAcc = 0, fpsN = 0, lowT = 0, shown = 0;
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  time.value += dt; waterU.time.value = time.value;
  if (autoTime) { hour = (hour + dt / 25) % 24; if (Math.floor(time.value * 10) % 3 === 0) applyTime(); $('bT').textContent = 'Heure : ' + String(Math.floor(hour)).padStart(2, '0') + ' h'; }

  // déplacement
  let sx = stick.x, sy = stick.y;
  if (keys.KeyW || keys.KeyZ || keys.ArrowUp) sy += 1; if (keys.KeyS || keys.ArrowDown) sy -= 1;
  if (keys.KeyD || keys.ArrowRight) sx += 1; if (keys.KeyA || keys.KeyQ || keys.ArrowLeft) sx -= 1;
  const len = Math.hypot(sx, sy), mag = Math.min(1, len); if (len > 1) { sx /= len; sy /= len; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const inW = heightAt(P.x, P.z) < WATER_Y - .15;
  let speed = (2.4 + 3.4 * mag) * (keys.ShiftLeft ? 1.5 : 1) * (inW ? .55 : 1) * (mag > 0 ? 1 : 0);
  const sl = slopeAt(P.x, P.z); speed *= 1 - clamp(sl - .5, 0, .5);
  const tvx = (fx * sy + rx * sx) * speed, tvz = (fz * sy + rz * sx) * speed;
  P.vx = lerp(P.vx, tvx, Math.min(1, dt * 10)); P.vz = lerp(P.vz, tvz, Math.min(1, dt * 10));
  let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  [nx, nz] = collide(nx, nz); nx = clamp(nx, -HALF + 6, HALF - 6); nz = clamp(nz, -HALF + 6, HALF - 6);
  P.x = nx; P.z = nz;
  const gh = heightAt(P.x, P.z); P.y = lerp(P.y, gh, Math.min(1, dt * 14));
  const sp = Math.hypot(P.vx, P.vz); P.walk += sp * dt * 2.2;
  hero.position.set(P.x, P.y, P.z); hero.visible = !P.fp;
  if (sp > .15) hero.rotation.y = Math.atan2(P.vx, P.vz);
  hero.userData.l1.rotation.x = Math.sin(P.walk * 2) * Math.min(1, sp / 3) * .7; hero.userData.l2.rotation.x = -hero.userData.l1.rotation.x;
  hero.children[0].position.y = 1.0 + Math.abs(Math.sin(P.walk * 2)) * .04 * Math.min(1, sp / 3);

  // caméra
  const cp = Math.cos(P.pitch), dir = new THREE.Vector3(fx * cp, -Math.sin(P.pitch), fz * cp);
  if (P.fp) { camPos.set(P.x, P.y + 1.68, P.z); camera.position.copy(camPos); camera.lookAt(camPos.x + dir.x, camPos.y + dir.y, camPos.z + dir.z); }
  else {
    camTarget.set(P.x, P.y + 1.35, P.z); camPos.copy(camTarget).addScaledVector(dir, -P.dist);
    const gy = heightAt(camPos.x, camPos.z) + .6; if (camPos.y < gy) camPos.y = gy;
    camera.position.copy(camPos); camera.lookAt(camTarget);
  }
  sky.position.copy(camera.position);

  // lumière + ombres qui suivent le joueur
  const L = sun.userData.dir || new THREE.Vector3(0, 1, 0);
  sun.position.set(P.x + L.x * 120, P.y + L.y * 120, P.z + L.z * 120); sun.target.position.set(P.x, P.y, P.z);
  if (sun.castShadow) { const snap = 2; sun.position.x = Math.round(sun.position.x / snap) * snap; sun.position.z = Math.round(sun.position.z / snap) * snap; sun.target.position.x = Math.round(P.x / snap) * snap; sun.target.position.z = Math.round(P.z / snap) * snap; }
  sun.castShadow = QUAL[qKey].shadow > 0 && L.y > .08;
  clouds.forEach((c, i) => { c.position.x += dt * (1.2 + (i % 3) * .5); if (c.position.x > 480) c.position.x = -480; });

  renderer.render(scene, camera);

  // FPS
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= .5) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    const inf = renderer.info.render;
    $('stats').textContent = `FPS ${fps.toFixed(0)}  ·  ${QUAL[qKey].name}\n△ ${(inf.triangles / 1000).toFixed(0)} k  ·  ${inf.calls} appels`;
    if (fps < 22 && now - shown > 1500) { lowT += .5; if (lowT >= 3 && qKey !== 'low') { applyQuality(qKey === 'high' ? 'med' : 'low'); toast('Qualité baissée automatiquement (FPS trop bas)'); lowT = 0; shown = now; } } else lowT = Math.max(0, lowT - .5);
  }
}

/* ---------------- Démarrage ---------------- */
applyQuality('med'); applyTime();
const isSmall = Math.min(innerWidth, innerHeight) < 500 && (devicePixelRatio || 1) > 2.5;
if (isSmall) applyQuality('low');
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => { const l = $('load'); l.style.opacity = 0; setTimeout(() => l.remove(), 600); }, 400);
toast('Joystick à gauche pour marcher · glisse à droite pour regarder');
window.__demo = { P, renderer, scene, camera, setHour: (h) => { hour = h; autoTime = false; applyTime(); }, applyQuality };
