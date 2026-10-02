/* =====================================================================
   Hero — Pentagon (three.js)
   Behaviour matched to the Casa Lunara "WebGL cube", re-cut for the Romai mark:
   - Background: full-screen quad, image + depth map, mouse parallax.
   - A STATIC image sits in the middle: a pentagon-masked photo, or a
     transparent product cutout (image_style = "cutout").
   - A transparent glass DODECAHEDRON (every face a pentagon) is the only thing
     that moves. Each face refracts whatever is behind it; faces that point at
     the camera barely shift anything, steep faces pull and skew their region.
   - The image change is a wipe cut by the glass: when a transition starts we
     pick the face that is rotating in from the rim and reveal the next image
     behind that face's leading edge as it sweeps across the picture, drawn in
     through a liquid band. If the face is lost the edge coasts on; never a fade.
   Self-initialises for every [data-section="hero"] on the page.
   ===================================================================== */
import * as THREE from 'three'

/* ---------------------------------------------------------------- */
/* GLSL                                                              */
/* ---------------------------------------------------------------- */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec2 coverFit(vec2 uv, float imgAspect, float boxAspect) {
  if (imgAspect > boxAspect) { uv.x = (uv.x - 0.5) * (boxAspect / imgAspect) + 0.5; }
  else { uv.y = (uv.y - 0.5) * (imgAspect / boxAspect) + 0.5; }
  return uv;
}
vec2 containFit(vec2 uv, float imgAspect, float boxAspect) {
  if (imgAspect > boxAspect) { uv.y = (uv.y - 0.5) * (imgAspect / boxAspect) + 0.5; }
  else { uv.x = (uv.x - 0.5) * (boxAspect / imgAspect) + 0.5; }
  return uv;
}
`

/* ---------- full-screen quads ---------- */
const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BG_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform vec2 uImageRes;
uniform vec2 uMouse;
uniform float uStrength;
uniform float uTime;
varying vec2 vUv;
${NOISE}
void main() {
  float screenAspect = uResolution.x / uResolution.y;
  float imgAspect = uImageRes.x / uImageRes.y;
  vec2 uv = coverFit(vUv, imgAspect, screenAspect);
  uv = (uv - 0.5) * 0.92 + 0.5;
  vec2 shift = uMouse * uStrength * vec2(1.0, screenAspect) * 0.5;
  float depth = texture2D(uDepth, uv).r;
  vec2 offset = (depth - 0.5) * shift;
  float depth2 = texture2D(uDepth, uv + offset).r;
  offset = ((depth + depth2) * 0.5 - 0.5) * shift;
  vec3 col = texture2D(uImage, uv + offset).rgb;
  col = mix(col, col * vec3(1.03, 0.98, 0.92), 0.5);
  float d = length((vUv - 0.5) * vec2(1.0, 1.25));
  col *= mix(0.42, 1.0, smoothstep(1.05, 0.3, d));
  col += (snoise(vec3(vUv * uResolution * 0.5, uTime * 4.0)) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }
`

/* ---------- static image (pentagon photo or product cutout) ---------- */
const IMAGE_VERT = /* glsl */ `
attribute float aEdge;
varying vec2 vUv;
varying float vEdge;
void main() {
  vUv = uv;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const IMAGE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec2 uBuffer;
uniform vec2 uImagePx;        /* picture size on screen, device px */
uniform vec2 uLineA;          /* leading edge of the sweeping face, screen uv */
uniform vec2 uLineB;
uniform float uLineSign;      /* which side of the edge is the wake */
uniform float uLineOn;
uniform float uBand;          /* width of the liquid band, px */
uniform float uStretch;       /* how far the band pulls, as a fraction of the band */
uniform vec2 uAspects;
uniform float uBoxAspect;
uniform float uTime;
uniform float uRim;           /* 1 = pentagon rim on */
uniform float uContain;       /* 1 = contain fit (cutouts), 0 = cover fit */
uniform vec3 uAccent;
varying vec2 vUv;
varying float vEdge;
${NOISE}
vec4 sampleImage(sampler2D tex, vec2 uv, float aspect) {
  vec2 f = uContain > 0.5 ? containFit(uv, aspect, uBoxAspect) : coverFit(uv, aspect, uBoxAspect);
  vec4 c = texture2D(tex, f);
  if (uContain > 0.5) c.a *= step(0.0, f.x) * step(f.x, 1.0) * step(0.0, f.y) * step(f.y, 1.0);
  return c;
}
void main() {
  vec2 uv = (vUv - 0.5) * (uContain > 0.5 ? 1.0 : 0.92) + 0.5;

  /* edge geometry in device px: nrm points into the wake (where the next image is) */
  vec2 a = uLineA * uBuffer;
  vec2 d = uLineB * uBuffer - a;
  float len = max(length(d), 1.0);
  vec2 nrm = uLineSign * vec2(-d.y, d.x) / len;
  vec2 rel = gl_FragCoord.xy - a;
  float along = dot(rel, d / len);
  float dist = dot(rel, nrm);
  /* the edge ripples along its length so it never reads as a straight clip */
  dist += (snoise(vec3(along * 0.011, 0.0, 3.0)) * 0.7 + snoise(vec3(along * 0.035, 0.0, 9.0)) * 0.3) * uBand * 0.28 * uLineOn;

  float band = max(uBand, 1.0);
  float tB = clamp(1.0 - dist / band, 0.0, 1.0);     /* 1 at the edge, 0 deep in the wake */
  float tA = clamp(1.0 + dist / band, 0.0, 1.0);     /* 1 at the edge, 0 far ahead */
  vec2 pull = nrm * band / uImagePx;                   /* band width in picture uv */
  float on = uLineOn;
  /* next image drawn out from the edge: near the edge it samples deeper into the wake,
     so content slides out from under the edge as it travels */
  vec2 uvB = uv + pull * tB * tB * uStretch * on;
  /* current image pushed ahead of the edge */
  vec2 uvA = uv - pull * tA * tA * uStretch * 0.5 * on;

  vec4 ca = sampleImage(uTexA, uvA, uAspects.x);
  vec4 cb = sampleImage(uTexB, uvB, uAspects.y);
  ca.rgb *= ca.a;
  cb.rgb *= cb.a;
  float wake = smoothstep(-1.5, 1.5, dist) * on;
  vec4 col = mix(ca, cb, wake);
  /* a faint warm glow right at the edge */
  float glow = exp(-abs(dist) / (band * 0.18)) * on;
  col.rgb += uAccent * glow * 0.12 * col.a;

  if (uRim > 0.5) {
    float rim = 1.0 - smoothstep(0.0, 0.026, vEdge);
    col.rgb = mix(col.rgb, uAccent, rim * 0.9);
    col.a = 1.0;
  }
  gl_FragColor = col;   /* premultiplied */
}
`

/* ---------- glass dodecahedron: refracts the backdrop behind each face ---------- */
const GLASS_VERT = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vNormalO;
void main() {
  vNormalV = normalize(normalMatrix * normal);
  vNormalO = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const GLASS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBackdrop;
uniform vec2 uBuffer;
uniform float uRefract;
uniform float uTint;
uniform vec3 uAccent;
uniform vec3 uWiperNormal;   /* object-space normal of the face carrying the next image */
uniform float uWiperOn;
varying vec3 vNormalV;
varying vec3 vNormalO;
void main() {
  vec2 suv = gl_FragCoord.xy / uBuffer;
  vec3 n = normalize(vNormalV);
  float tiltAmt = 1.0 - max(n.z, 0.0);
  float isWiper = step(0.98, dot(normalize(vNormalO), uWiperNormal)) * uWiperOn;

  /* flat face => constant shift per face. Faces that look at the camera stay clean;
     the shift ramps up steeply towards edge-on, so only the sweeping face pulls the picture.
     The carrying face keeps a visible pull even as it flattens out. */
  float steep = max(pow(tiltAmt, 1.6), isWiper * 0.45);
  vec2 offset = normalize(n.xy + vec2(1e-5)) * uRefract * steep * min(length(n.xy) * 2.5 + isWiper, 1.0);
  vec2 zoomed = (suv - 0.5) * (1.0 - steep * 0.05 * step(1e-4, uRefract)) + 0.5;
  float r = texture2D(uBackdrop, zoomed + offset * 1.04).r;
  float g = texture2D(uBackdrop, zoomed + offset).g;
  float b = texture2D(uBackdrop, zoomed + offset * 0.96).b;
  vec3 col = vec3(r, g, b);

  /* glass shading: warm tint and amber glow on steep faces, key-light glint;
     the carrying face is clearly tinted so the reveal reads as "the face draws the next image" */
  float fres = pow(tiltAmt, 2.6);
  col = mix(col, col * vec3(1.08, 0.97, 0.85), uTint * fres);
  col = col * (1.0 - fres * 0.3) + uAccent * fres * 0.26;
  col = mix(col, col * vec3(1.18, 0.98, 0.72) + uAccent * 0.10, isWiper * 0.7);
  vec3 L = normalize(vec3(0.35, 0.8, 0.65));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  col += pow(max(dot(n, H), 0.0), 90.0) * vec3(1.0, 0.9, 0.65) * 0.35;
  col += fres * 0.04;
  gl_FragColor = vec4(col, 1.0);
}
`

/* ---------------------------------------------------------------- */
/* Geometry                                                          */
/* ---------------------------------------------------------------- */
/* flat pentagon, apex up, subdivided, with distance-to-edge for the rim */
function buildPentagon(R = 1, segs = 20) {
  const pos = [], uvs = [], edge = []
  const V = []
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + k * (Math.PI * 2 / 5)
    V.push([Math.cos(a) * R, Math.sin(a) * R])
  }
  const xs = V.map((v) => v[0]), ys = V.map((v) => v[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const bw = maxX - minX, bh = maxY - minY
  const N = segs
  for (let k = 0; k < 5; k++) {
    const A = V[k], B = V[(k + 1) % 5]
    const P = (i, j) => [(A[0] * i + B[0] * j) / N, (A[1] * i + B[1] * j) / N, 1 - (i + j) / N]
    const emit = (pt) => { pos.push(pt[0], pt[1], 0); uvs.push((pt[0] - minX) / bw, (pt[1] - minY) / bh); edge.push(pt[2]) }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N - i; j++) {
        emit(P(i, j)); emit(P(i + 1, j)); emit(P(i, j + 1))
        if (j < N - i - 1) { emit(P(i + 1, j)); emit(P(i + 1, j + 1)); emit(P(i, j + 1)) }
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1))
  geo.userData.aspect = bw / bh
  geo.userData.width = bw
  geo.userData.height = bh
  return geo
}

/* square plane for cutouts, same height as the pentagon */
function buildSquare(size) {
  const geo = new THREE.PlaneGeometry(size, size)
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(1), 1))
  geo.userData.aspect = 1
  geo.userData.width = size
  geo.userData.height = size
  return geo
}

/* the 12 pentagonal faces of the dodecahedron: normal, centroid, ordered corners */
function extractFaces(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal
  const faces = []
  for (let i = 0; i < pos.count; i += 3) {
    const n = new THREE.Vector3().fromBufferAttribute(nor, i)
    let face = faces.find((f) => f.normal.dot(n) > 0.999)
    if (!face) { face = { normal: n.clone(), corners: [] }; faces.push(face) }
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i + k)
      if (!face.corners.some((w) => w.distanceToSquared(v) < 1e-8)) face.corners.push(v)
    }
  }
  for (const f of faces) {
    f.centroid = f.corners.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / f.corners.length)
    const u = new THREE.Vector3().subVectors(f.corners[0], f.centroid).normalize()
    const w = new THREE.Vector3().crossVectors(f.normal, u)
    const angle = (v) => { const d = new THREE.Vector3().subVectors(v, f.centroid); return Math.atan2(d.dot(w), d.dot(u)) }
    f.corners.sort((a, b) => angle(a) - angle(b))
    f.z = 0; f.prevZ = 0
    f.c = new THREE.Vector2(); f.prevC = new THREE.Vector2()
  }
  return faces
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const _v = new THREE.Vector3()
const _uvA = new THREE.Vector2(), _uvB = new THREE.Vector2()

const loader = new THREE.TextureLoader()
function loadTexture(src, { linear = false } = {}) {
  return new Promise((resolve, reject) => {
    loader.load(src, (tex) => {
      tex.colorSpace = THREE.NoColorSpace
      tex.wrapS = tex.wrapT = linear ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = linear ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter
      tex.generateMipmaps = !linear
      tex.anisotropy = 4
      tex.premultiplyAlpha = false
      tex.userData.aspect = tex.image.width / tex.image.height
      resolve(tex)
    }, undefined, reject)
  })
}

/* ---------------------------------------------------------------- */
/* Hero                                                              */
/* ---------------------------------------------------------------- */
class RomaiHero {
  constructor(root) {
    this.root = root
    this.canvas = root.querySelector('.hero__canvas')
    this.counterEl = root.querySelector('[data-hero-counter]')
    this.config = JSON.parse(root.querySelector('[data-hero-config]').textContent)
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.cutout = this.config.imageStyle === 'cutout'

    this.mouse = { x: 0, y: 0 }
    this.target = { x: 0, y: 0 }
    this.lastPointer = -Infinity
    this.time = 0
    this.cursor = 0
    this.transitioning = false
    this.wiper = null
    this.sweep = null
    this.lineTarget = 0
    this.wiperTarget = 0
    this.nextAt = 0
    this.running = false
    this.visible = true
    this.ready = false
    this.bgSet = null
    this.bgTextures = {}
    this.debug = { seek: null, freeze: null, mouse: null, interval: null }
    this.bufferSize = new THREE.Vector2(1, 1)

    this.onPointer = this.onPointer.bind(this)
    this.onLeave = this.onLeave.bind(this)
    this.tick = this.tick.bind(this)

    this.init().catch((err) => {
      console.warn('[hero] WebGL init failed, keeping poster.', err)
      this.root.classList.add('is-fallback', 'is-ready')
    })
  }

  async init() {
    const cfg = this.config
    const accent = new THREE.Color('#FFBF00')

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.autoClear = false
    /* low memory / weak GPU: a lost context or a shader that fails to compile leaves an empty
       canvas, so fall back to the static poster instead */
    const fallback = (why) => {
      if (this.root.classList.contains("is-fallback")) return
      console.warn("[hero] WebGL unavailable (" + why + "), keeping poster.")
      this.root.classList.add("is-fallback", "is-ready")
      this.stop?.()
    }
    this.canvas.addEventListener("webglcontextlost", () => fallback("context lost"))
    this.renderer.debug.onShaderError = () => fallback("shader error")

    /* backdrop render target: room + static image, sampled by the glass */
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true })
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter

    /* --- background (depth parallax) --- */
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.bgScene = new THREE.Scene()
    this.bgMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uImage: { value: null }, uDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) }, uImageRes: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0, 0) }, uStrength: { value: cfg.parallaxStrength ?? 0.08 }, uTime: { value: 0 },
      },
    })
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMaterial))

    /* --- copy pass (backdrop -> screen) --- */
    this.copyScene = new THREE.Scene()
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: this.rt.texture } },
    })))

    /* --- 3D camera: close + wide so faces sweep across the middle in perspective --- */
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 50)
    this.camera.position.set(0, 0, 4.2)
    this.liftY = cfg.lift ?? 0.32

    /* --- static image --- */
    this.imageScene = new THREE.Scene()
    this.R = 0.58
    this.pentagon = buildPentagon(this.R, 20)
    this.imageGeo = this.cutout ? buildSquare(this.pentagon.userData.height) : this.pentagon
    this.imageMaterial = new THREE.ShaderMaterial({
      vertexShader: IMAGE_VERT, fragmentShader: IMAGE_FRAG,
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      uniforms: {
        uTexA: { value: null }, uTexB: { value: null },
        uBuffer: { value: this.bufferSize },
        uLineA: { value: new THREE.Vector2() }, uLineB: { value: new THREE.Vector2(1, 0) },
        uLineSign: { value: 1 }, uLineOn: { value: 0 },
        uImagePx: { value: new THREE.Vector2(1, 1) }, uBand: { value: 80 }, uStretch: { value: cfg.wipeStretch ?? 0.9 },
        uAspects: { value: new THREE.Vector2(1, 1) }, uBoxAspect: { value: this.imageGeo.userData.aspect },
        uTime: { value: 0 },
        uRim: { value: this.cutout ? 0 : 1 }, uContain: { value: this.cutout ? 1 : 0 },
        uAccent: { value: accent },
      },
    })
    this.imageGroup = new THREE.Group()
    this.imageGroup.add(new THREE.Mesh(this.imageGeo, this.imageMaterial))
    this.imageScene.add(this.imageGroup)

    /* --- glass dodecahedron + edge lines --- */
    this.glassScene = new THREE.Scene()
    const dodeGeo = new THREE.DodecahedronGeometry(this.R * (cfg.glassSize ?? 1.45), 0)
    this.faces = extractFaces(dodeGeo)
    this.glassMaterial = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      uniforms: {
        uBackdrop: { value: this.rt.texture }, uBuffer: { value: this.bufferSize },
        uRefract: { value: cfg.refraction ?? 0 }, uTint: { value: 0.35 }, uAccent: { value: accent },
        uWiperNormal: { value: new THREE.Vector3(0, 0, 1) }, uWiperOn: { value: 0 },
      },
    })
    const edgesGeo = new THREE.EdgesGeometry(dodeGeo, 1)
    const edgeColor = 0xf6e9cf
    this.glassGroup = new THREE.Group()        /* tumble */
    this.glassGroup.add(
      new THREE.Mesh(dodeGeo, this.glassMaterial),
      new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.5 })),
      new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.12, depthTest: false })),
    )
    this.glassRoot = new THREE.Group()         /* scale, lift, mouse steer */
    this.glassRoot.add(this.glassGroup)
    this.glassScene.add(this.glassRoot)

    /* --- textures --- */
    const images = cfg.images.filter((i) => i.src)
    if (!images.length) throw new Error('hero: no images configured')
    const [textures] = await Promise.all([
      Promise.all(images.map((f) => loadTexture(f.src))),
      this.loadBackground(this.pickBackgroundSet()),
    ])
    this.textures = textures
    this.setSlot('A', 0)
    this.setSlot('B', 1)
    this.updateCounter(0)

    /* --- events --- */
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.root)
    window.addEventListener('pointermove', this.onPointer, { passive: true })
    document.addEventListener('mouseleave', this.onLeave)
    this.onVisibility = () => (document.hidden ? this.stop() : this.start())
    document.addEventListener('visibilitychange', this.onVisibility)
    this.onUnload = (e) => { if (!e.target || e.target.contains(this.root)) this.destroy() }
    document.addEventListener('shopify:section:unload', this.onUnload)
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      this.visible ? this.start() : this.stop()
    }, { threshold: 0.01 })
    this.io.observe(this.root)

    /* dev-only URL params for visual QA:
       ?hero-seek=12 (start at t)  ?hero-freeze=3.4 (hold the clock at t)
       ?hero-interval=300 (ms to first change)  ?hero-mouse=0.8,0  ?hero-force=1 (ignore reduced motion) */
    const q = new URLSearchParams(location.search)
    this.debug = {
      seek: q.has('hero-seek') ? Number(q.get('hero-seek')) : null,
      freeze: q.has('hero-freeze') ? Number(q.get('hero-freeze')) : null,
      mouse: q.has('hero-mouse') ? q.get('hero-mouse').split(',').map(Number) : null,
      interval: q.has('hero-interval') ? Number(q.get('hero-interval')) : null,
    }
    if (this.debug.seek) this.time = this.debug.seek
    if (this.debug.interval !== null) cfg.intervalMs = this.debug.interval
    if (q.has('hero-force')) { this.reduced = false; this.debug.log = true }

    this.ready = true
    this.nextAt = this.time + (cfg.intervalMs ?? 2600) / 1000
    /* QA: ?hero-warm=N simulates N fixed 60fps frames before the first real frame */
    if (q.has("hero-warm")) {
      const n = Number(q.get("hero-warm"))
      this.skipRender = true
      this.running = true
      let now = performance.now()
      this.lastFrame = now
      for (let i = 0; i < n; i++) { now += 1000 / 60; this.tick(now) }
      this.skipRender = false
      this.running = false
    }
    this.start()
    /* swap poster -> WebGL straight away: if a preloader is running this happens underneath it,
       so the page is already in its final state when the sheet lifts */
    requestAnimationFrame(() => this.root.classList.add('is-ready'))
  }

  /* ---------- background set (desktop / mobile) ---------- */
  pickBackgroundSet() {
    const { width, height } = this.root.getBoundingClientRect()
    return width / height < 0.9 ? 'mobile' : 'desktop'
  }

  async loadBackground(set) {
    if (this.bgWanted === set) return
    this.bgWanted = set
    if (!this.bgTextures[set]) {
      const c = this.config.background[set]
      this.bgTextures[set] = Promise.all([loadTexture(c.image), loadTexture(c.depth, { linear: true })])
    }
    const [image, depth] = await this.bgTextures[set]
    if (this.bgWanted !== set) return            /* the viewport flipped again while loading */
    this.bgSet = set
    this.bgMaterial.uniforms.uImage.value = image
    this.bgMaterial.uniforms.uDepth.value = depth
    this.bgMaterial.uniforms.uImageRes.value.set(image.image.width, image.image.height)
  }

  /* ---------- image sequencing ---------- */
  imageAt(i) {
    const n = this.textures.length
    return this.textures[((i % n) + n) % n]
  }
  setSlot(slot, i) {
    const tex = this.imageAt(i)
    const u = this.imageMaterial.uniforms
    if (slot === 'A') { u.uTexA.value = tex; u.uAspects.value.x = tex.userData.aspect }
    else { u.uTexB.value = tex; u.uAspects.value.y = tex.userData.aspect }
  }
  updateCounter(i) {
    if (!this.counterEl) return
    const n = this.textures.length
    this.counterEl.textContent = String(((i % n) + n) % n + 1).padStart(2, '0')
  }
  advance() {
    this.cursor += 1
    this.setSlot('A', this.cursor)
    this.setSlot('B', this.cursor + 1)
  }

  /* ---------- input ---------- */
  onPointer(e) {
    const r = this.root.getBoundingClientRect()
    this.target.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
    this.target.y = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1)
    this.lastPointer = this.time
  }
  onLeave() { this.lastPointer = -Infinity }

  /* ---------- sizing ---------- */
  resize() {
    const { width, height } = this.root.getBoundingClientRect()
    if (!width || !height) return
    const oldW = this.bufferSize.x, oldH = this.bufferSize.y
    this.renderer.setSize(width, height, false)
    this.renderer.getDrawingBufferSize(this.bufferSize)
    if (this.sweep && oldW > 1 && oldH > 1) {
      const sx = this.bufferSize.x / oldW, sy = this.bufferSize.y / oldH
      const sw = this.sweep
      sw.ox *= sx; sw.oy *= sy; sw.s *= sy; sw.speed *= sy
    }
    this.rt.setSize(this.bufferSize.x, this.bufferSize.y)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.bgMaterial.uniforms.uResolution.value.set(width, height)

    /* portrait viewports: shrink so the image spans ~60% of the width */
    const scale = clamp(this.camera.aspect * 1.7, 0.6, 1)
    this.imageGroup.scale.setScalar(scale)
    this.glassRoot.scale.setScalar(scale)
    this.imageGroup.position.y = this.liftY * scale
    this.glassRoot.position.y = this.liftY * scale
    this.imageGroup.updateMatrixWorld(true)

    /* projected image size + lift -> CSS vars for the corner frame */
    const visibleH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const pxPerUnit = height / visibleH
    this.root.style.setProperty('--hero-prism-h', `${Math.round(this.imageGeo.userData.height * scale * pxPerUnit)}px`)
    this.root.style.setProperty('--hero-prism-w', `${Math.round(this.imageGeo.userData.width * scale * pxPerUnit)}px`)
    this.root.style.setProperty('--hero-prism-y', `${Math.round(this.liftY * scale * pxPerUnit)}px`)
    const dpr = this.bufferSize.y / height
    const iu = this.imageMaterial.uniforms
    iu.uImagePx.value.set(this.imageGeo.userData.width * scale * pxPerUnit * dpr, this.imageGeo.userData.height * scale * pxPerUnit * dpr)
    iu.uBand.value = this.imageGeo.userData.height * scale * pxPerUnit * dpr * (this.config.wipeBand ?? 0.22)

    this.loadBackground(this.pickBackgroundSet())
  }

  /* ---------- glass spin: steady multi-axis tumble ---------- */
  applySpin(t) {
    const s = this.config.spinSpeed ?? 0.9
    this.glassGroup.rotation.set(0.6 + t * s * 0.62, 0.4 + t * s, 0.2 + t * s * 0.27)
  }

  /* ---------- face tracking for the wipe ---------- */
  projectTo(uvOut, p) {
    _v.copy(p).applyMatrix4(this.glassGroup.matrixWorld).project(this.camera)
    uvOut.set((_v.x + 1) / 2, (_v.y + 1) / 2)
    return uvOut
  }
  trackFaces() {
    this.glassRoot.updateMatrixWorld(true)
    this.camera.updateMatrixWorld(true)
    for (const f of this.faces) {
      f.prevZ = f.z
      f.prevC.copy(f.c)
      _v.copy(f.normal).transformDirection(this.glassGroup.matrixWorld).transformDirection(this.camera.matrixWorldInverse)
      f.z = _v.z
      this.projectTo(f.c, f.centroid)
    }
  }
  /* index of the face edge furthest along its direction of travel; -1 if it is not moving */
  leadingEdgeIndex(f) {
    const vx = f.c.x - f.prevC.x, vy = f.c.y - f.prevC.y
    const speed = Math.hypot(vx, vy)
    if (speed < 1e-6) return -1
    const dx = vx / speed, dy = vy / speed
    let best = -1, bestScore = -Infinity
    for (let i = 0; i < f.corners.length; i++) {
      const p = this.projectTo(_uvA, f.corners[i]), q = this.projectTo(_uvB, f.corners[(i + 1) % f.corners.length])
      const score = ((p.x + q.x) / 2 - f.c.x) * dx + ((p.y + q.y) / 2 - f.c.y) * dy
      if (score > bestScore) { bestScore = score; best = i }
    }
    return best
  }
  /* that edge in screen uv, with the wake on the centroid's side */
  edgeAt(f, i) {
    const a = this.projectTo(new THREE.Vector2(), f.corners[i])
    const b = this.projectTo(new THREE.Vector2(), f.corners[(i + 1) % f.corners.length])
    const ex = b.x - a.x, ey = b.y - a.y
    const sign = (ex * (f.c.y - a.y) - ey * (f.c.x - a.x)) >= 0 ? 1 : -1
    return { a, b, sign }
  }
  leadingEdge(f) {
    const i = this.leadingEdgeIndex(f)
    return i < 0 ? null : this.edgeAt(f, i)
  }
  /* signed pixel distance of a screen-uv point from an edge: positive = in the wake */
  edgeDistance(edge, p) {
    const W = this.bufferSize.x, H = this.bufferSize.y
    const ax = edge.a.x * W, ay = edge.a.y * H
    const dx = edge.b.x * W - ax, dy = edge.b.y * H - ay
    const len = Math.max(Math.hypot(dx, dy), 1)
    return (dx * (p.y * H - ay) - dy * (p.x * W - ax)) / len * edge.sign
  }
  /* the four corners of the picture in screen uv (scratch array, overwritten each call) */
  imageCorners(shrink = 1) {
    const w = this.imageGeo.userData.width / 2 * shrink, h = this.imageGeo.userData.height / 2 * shrink
    const out = this._corners || (this._corners = [0, 1, 2, 3].map(() => new THREE.Vector2()))
    const pts = [[-w, -h], [w, -h], [w, h], [-w, h]]
    for (let i = 0; i < 4; i++) {
      _v.set(pts[i][0], pts[i][1], 0).applyMatrix4(this.imageGroup.matrixWorld).project(this.camera)
      out[i].set((_v.x + 1) / 2, (_v.y + 1) / 2)
    }
    return out
  }
  /* a face rotating IN from the rim whose leading edge is about to enter the picture:
     front-facing, getting flatter, moving, and the whole picture still ahead of its edge */
  findCarrier() {
    const corners = this.imageCorners(0.55)        /* the picture core: where the subject sits */
    let best = null
    const stats = { front: 0, rotatingIn: 0, moving: 0, ahead: 0 }
    for (const f of this.faces) {
      if (f.z < 0.03 || f.z > 0.92) continue
      stats.front++
      if (f.z - f.prevZ <= 0) continue
      stats.rotatingIn++
      const edge = this.leadingEdge(f)
      if (!edge) continue
      stats.moving++
      const dists = corners.map((c) => this.edgeDistance(edge, c))
      const maxD = Math.max(...dists)              /* nearest picture corner to the edge */
      if (maxD > 0) continue                       /* edge already inside or past the picture */
      stats.ahead++
      if (maxD < -0.3 * this.bufferSize.y) continue   /* still far from the picture */
      const score = -maxD                          /* closest to entering wins */
      if (!best || score < best.score) best = { face: f, score }
    }
    if (this.debug.log && !best && Math.floor(this.time * 4) !== this._lastStatLog) {
      this._lastStatLog = Math.floor(this.time * 4)
      console.log(`[hero] no carrier t=${this.time.toFixed(2)} ${JSON.stringify(stats)}`)
    }
    if (this.debug.log && best) console.log(`[hero] carrier found t=${this.time.toFixed(2)} z=${best.face.z.toFixed(2)} gap=${best.score.toFixed(0)}px`)
    return best ? best.face : null
  }
  /* the locked edge of a face in device px: origin (midpoint), direction, wake normal */
  edgePx(edge) {
    const W = this.bufferSize.x, H = this.bufferSize.y
    const ax = edge.a.x * W, ay = edge.a.y * H, bx = edge.b.x * W, by = edge.b.y * H
    let dx = bx - ax, dy = by - ay
    const len = Math.max(Math.hypot(dx, dy), 1)
    dx /= len; dy /= len
    return { ox: (ax + bx) / 2, oy: (ay + by) / 2, dx, dy, nx: edge.sign * -dy, ny: edge.sign * dx, sign: edge.sign }
  }
  /* start a sweep: the wipe edge keeps this orientation and only moves forward along (nx, ny) */
  startSweep(e, face) {
    /* the edge travels opposite to its wake normal: tx, ty is the direction of travel */
    this.sweep = { ox: e.ox, oy: e.oy, dx: e.dx, dy: e.dy, nx: e.nx, ny: e.ny, tx: -e.nx, ty: -e.ny, sign: e.sign, s: 0, speed: 0, lastAdvanceT: this.time, coasting: !face }
    this.transitioning = true
    this.transitionStart = this.time
    this.counted = false
    this.wiper = face || null
    const gu = this.glassMaterial.uniforms
    this.wiperTarget = face ? 1 : 0
    if (face) gu.uWiperNormal.value.copy(face.normal)
    this.applySweepLine()
  }
  beginSweep(face) {
    this.edgeIdx = this.leadingEdgeIndex(face)
    if (this.edgeIdx < 0) return this.beginSynthetic()
    this.startSweep(this.edgePx(this.edgeAt(face, this.edgeIdx)), face)
  }
  /* no face arrived: a plain edge sweeps across from a random side at a natural pace */
  beginSynthetic() {
    const W = this.bufferSize.x, H = this.bufferSize.y
    const c = this.imageCorners()
    const cx = (c[0].x + c[2].x) / 2 * W, cy = (c[0].y + c[2].y) / 2 * H
    const ang = Math.random() * Math.PI * 2
    const tx = Math.cos(ang), ty = Math.sin(ang)                 /* direction of travel */
    const span = 0.75 * this.imageMaterial.uniforms.uImagePx.value.y
    /* starts behind the picture, wake normal = -travel; with d = (-ty, tx) the shader normal sign*(-dy, dx) = -t for sign +1 */
    this.startSweep({ ox: cx - tx * span, oy: cy - ty * span, dx: -ty, dy: tx, nx: -tx, ny: -ty, sign: 1 }, null)
    this.sweep.speed = 0.7 * H
    if (this.debug.log) console.log(`[hero] synthetic sweep t=${this.time.toFixed(2)}`)
  }
  applySweepLine() {
    const sw = this.sweep
    const W = this.bufferSize.x, H = this.bufferSize.y, L = 4000
    const px = sw.ox + sw.tx * sw.s, py = sw.oy + sw.ty * sw.s
    const u = this.imageMaterial.uniforms
    u.uLineA.value.set((px - sw.dx * L) / W, (py - sw.dy * L) / H)
    u.uLineB.value.set((px + sw.dx * L) / W, (py + sw.dy * L) / H)
    u.uLineSign.value = sw.sign
    this.lineTarget = 1
  }
  setWipeEdge(edge, on) {
    const u = this.imageMaterial.uniforms
    if (edge) { u.uLineA.value.copy(edge.a); u.uLineB.value.copy(edge.b); u.uLineSign.value = edge.sign }
    u.uLineOn.value = on ? 1 : 0
  }

  /* ---------- teardown (theme editor re-renders, SPA navigation) ---------- */
  destroy() {
    this.stop()
    window.removeEventListener('pointermove', this.onPointer)
    document.removeEventListener('mouseleave', this.onLeave)
    document.removeEventListener('visibilitychange', this.onVisibility)
    document.removeEventListener('shopify:section:unload', this.onUnload)
    this.ro?.disconnect(); this.io?.disconnect()
    this.rt?.dispose()
    this.textures?.forEach((t) => t.dispose())
    Object.values(this.bgTextures).forEach((p) => p.then((arr) => arr.forEach((t) => t.dispose())).catch(() => {}))
    this.renderer?.dispose()
    delete this.root.__hero
  }

  /* ---------- loop ---------- */
  start() {
    if (this.running || !this.visible || !this.ready) return
    this.running = true
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }
  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  tick(now) {
    if (!this.running) return
    let dt = Math.min((now - this.lastFrame) / 1000, 0.05)
    this.lastFrame = now
    if (this.debug.freeze !== null && this.time + dt > this.debug.freeze) dt = Math.max(0, this.debug.freeze - this.time)
    this.time += dt
    const t = this.time
    const cfg = this.config
    const r = this.renderer

    /* pointer: smoothed, idle drift when the mouse is still */
    const idle = t - this.lastPointer > 2.5
    let tx = idle ? Math.sin(t * 0.32) * 0.35 : this.target.x
    let ty = idle ? Math.cos(t * 0.21) * 0.22 : this.target.y
    if (this.debug.mouse) { [tx, ty] = this.debug.mouse; this.mouse.x = tx; this.mouse.y = ty }
    const k = 1 - Math.pow(0.0025, dt)
    this.mouse.x = lerp(this.mouse.x, tx, k * 0.5)
    this.mouse.y = lerp(this.mouse.y, ty, k * 0.5)
    this.bgMaterial.uniforms.uMouse.value.set(this.mouse.x, this.mouse.y)
    this.bgMaterial.uniforms.uTime.value = t

    /* glass: the only moving thing (plus a touch of mouse steering) */
    if (!this.reduced) this.applySpin(t)
    const tilt = cfg.tilt ?? 0.35
    this.glassRoot.rotation.set(-this.mouse.y * tilt * 0.5, this.mouse.x * tilt * 0.5, 0)
    if (dt > 0) this.trackFaces()

    /* transition: once the interval has passed we wait for a face rotating in from the rim to
       reach the picture; the next image is revealed in that face's wake and the change ends when
       its edge has crossed the far side. If the face is lost mid-way the edge keeps travelling on
       its own; if no face arrives for a while a plain edge sweeps instead. Never a fade. */
    const iu = this.imageMaterial.uniforms
    const gu = this.glassMaterial.uniforms
    if (!this.reduced && dt > 0) {
      if (!this.transitioning && t >= this.nextAt && this.textures.length > 1) {
        const carrier = this.findCarrier()
        if (carrier) this.beginSweep(carrier)
        else if (t - this.nextAt > 2.5) this.beginSynthetic()
      }
      if (this.transitioning) {
        const sw = this.sweep
        const f = this.wiper
        const H = this.bufferSize.y
        if (f && !sw.coasting) {
          const e = this.edgePx(this.edgeAt(f, this.edgeIdx))
          const progress = (e.ox - sw.ox) * sw.tx + (e.oy - sw.oy) * sw.ty   /* how far the real edge has travelled */
          if (progress > sw.s + 0.01) {
            sw.speed = lerp(sw.speed, (progress - sw.s) / dt, 0.3)
            sw.s = progress
            sw.lastAdvanceT = t
          }
          const lost = f.z < 0.02 || t - sw.lastAdvanceT > 0.4 || t - this.transitionStart > 3
          if (lost) {
            sw.coasting = true
            sw.speed = Math.max(sw.speed, 0.5 * H)
            this.wiper = null
            this.wiperTarget = 0
            if (this.debug.log) console.log(`[hero] carrier lost t=${t.toFixed(2)}, coasting`)
          }
        } else {
          sw.s += Math.max(sw.speed, 0.5 * H) * dt
        }
        this.applySweepLine()

        const current = { a: iu.uLineA.value, b: iu.uLineB.value, sign: iu.uLineSign.value }
        const corners = this.imageCorners()
        const dists = corners.map((c) => this.edgeDistance(current, c))
        const centre = this.edgeDistance(current, _uvA.copy(corners[0]).add(corners[2]).multiplyScalar(0.5))
        if (!this.counted && centre > 0) { this.counted = true; this.updateCounter(this.cursor + 1) }
        /* done once the band and its ripple have fully passed the far corners (no pop when the line switches off).
           A sweep that drags on is hurried along, never cut. */
        if (t - this.transitionStart > 5 && !sw.coasting) { sw.coasting = true; this.wiper = null; this.wiperTarget = 0 }
        if (t - this.transitionStart > 5) sw.speed = Math.max(sw.speed, 2.5 * H)
        const done = Math.min(...dists) > iu.uBand.value * 1.35 + 6 || t - this.transitionStart > 12
        if (done) {
          if (!this.counted) { this.counted = true; this.updateCounter(this.cursor + 1) }
          if (this.debug.log) console.log(`[hero] change done t=${t.toFixed(2)} after ${(t - this.transitionStart).toFixed(2)}s`)
          this.transitioning = false
          this.wiper = null
          this.sweep = null
          this.lineTarget = 0
          iu.uLineOn.value = 0
          this.wiperTarget = 0
          this.advance()
          this.nextAt = t + (cfg.intervalMs ?? 2600) / 1000
        }
      }
    }
    iu.uTime.value = t
    const ease = 1 - Math.pow(0.001, dt)                 /* ~0.25 s */
    iu.uLineOn.value = lerp(iu.uLineOn.value, this.lineTarget ?? 0, ease)
    gu.uWiperOn.value = lerp(gu.uWiperOn.value, this.wiperTarget ?? 0, ease)

    if (this.skipRender) return

    /* pass 1: backdrop (room + static image) into the render target */
    r.setRenderTarget(this.rt)
    r.setClearColor(0x0b0b0b, 1)
    r.clear()
    r.render(this.bgScene, this.quadCamera)
    r.clearDepth()
    r.render(this.imageScene, this.camera)

    /* pass 2: backdrop to screen, then the glass refracting it */
    r.setRenderTarget(null)
    r.clear()
    r.render(this.copyScene, this.quadCamera)
    r.clearDepth()
    r.render(this.glassScene, this.camera)

    this.raf = requestAnimationFrame(this.tick)
  }
}

/* ---------- boot ---------- */
document.querySelectorAll('[data-section="hero"]').forEach((root) => {
  if (root.__hero) return
  root.__hero = new RomaiHero(root)
})
