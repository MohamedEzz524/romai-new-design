/* =====================================================================
   Lookbook strip — a rebuild of ai-model.jp's "comparison" slider.

   How the reference works (read from their app.js, class "Slider"):
   - Three fixed SLOTS sit in a row, each a tilted portrait frame. Every slot
     has one subject, photographed once per VARIANT (3 variants).
   - Six CARDS (same size and tilt as the slots) slide horizontally over the
     slots. Each card belongs to one variant (order B, C, A, B, C, A) and
     samples its variant's photos in SCREEN space (gl_FragCoord), so the
     photos never move: a card is a moving window onto its variant.
     When a card passes over a slot, that slot shows the card's variant,
     cut along the card's edges. That is the "stage change" look.
   - The section is pinned (GSAP ScrollTrigger, pin: true) for 3 card
     pitches; 1px of scroll moves the cards 1px, eased (0.28 per frame at
     30fps). Cards wrap around, so the row is endless.
   - Scroll speed pushes the cards back in z (they shrink, max 80 units) and
     bends them with a small travelling sine wave.
   - The variant names ("TYPE 001") ride with the cards, not tilted.

   Rendered here with Canvas 2D: per card, clip to its (bent, scaled,
   rotated) outline, then draw the variant's slot photos in their fixed
   rotated slot rects.
   QA: ?strip-offset=-452 sets the scroll offset in design px (1440 grid).
   ===================================================================== */

const PC = { design: 1440, cardW: 429.9, cardH: 573.2, gap: 23, start: -400 }
const SP = { design: 360, cardW: 260.26, cardH: 347, gap: 14, start: -500 }
const CARD_VARIANTS = [1, 2, 0, 1, 2, 0]           /* B, C, A, B, C, A */
/* their scroll is already smoothed by a smooth-scroll lib, then the slider lerps 0.28/frame @30fps:
   two eases in series. Reproduced as a smoothed scroll (SCROLL_LERP) feeding the slider lerp. */
const EASE_PER_30FPS = 0.28
const SCROLL_LERP_PER_60FPS = 0.075
const SEGMENTS = 8                                /* their plane is 8 x 2 segments */

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})
const mod = (n, m) => ((n % m) + m) % m

class LookbookStrip {
  constructor(root) {
    this.root = root
    this.canvas = root.querySelector('[data-strip-canvas]')
    this.ctx = this.canvas.getContext('2d')
    this.cfg = JSON.parse(root.querySelector('[data-strip-config]').textContent)
    this.variants = this.cfg.variants
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (this.reduced || !this.ctx || this.variants.length < 1) { root.classList.add('is-static'); return }

    const q = new URLSearchParams(location.search)
    this.qaOffset = q.has('strip-offset') ? Number(q.get('strip-offset')) : null

    this.current = 0
    this.target = 0
    this.speed = 0
    this.time = 0
    this.images = this.variants.map(() => [null, null, null])
    this.colors = {}
    this.tick = this.tick.bind(this)

    this.resize()
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('scroll', () => this.wake(), { passive: true })
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.wake() }, { rootMargin: '25% 0px' }).observe(root)
    this.canvas.addEventListener('pointermove', (e) => this.hover(e))
    this.canvas.addEventListener('click', (e) => { const v = this.variantAt(e); if (v && v.url) location.href = v.url })

    this.variants.forEach((v, vi) => v.images.forEach((src, si) => {
      if (!src) return
      loadImage(src).then((img) => { this.images[vi][si] = img; this.draw() })
    }))
    if (document.fonts?.ready) document.fonts.ready.then(() => this.draw())
  }

  /* ---------- layout (their rem grid: 1440 design px on PC, 360 on phones) ---------- */
  resize() {
    const vw = window.innerWidth
    const vh = this.root.querySelector('.strip__pin').clientHeight || window.innerHeight
    const pc = vw >= 600
    const g = pc ? PC : SP
    let rem = vw / g.design
    if (pc && vh > vw) rem *= 1.5                    /* their portrait-tablet scale */
    this.g = g
    this.rem = rem
    this.vw = vw
    this.vh = vh
    this.cardW = g.cardW * rem
    this.cardH = g.cardH * rem
    this.pitch = (g.cardW + g.gap) * rem
    this.startX = g.start * rem
    this.period = CARD_VARIANTS.length * this.pitch
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.canvas.width = Math.round(vw * this.dpr)
    this.canvas.height = Math.round(vh * this.dpr)
    /* pin length = three card pitches, scrolled 1:1 */
    this.travel = 3 * this.pitch
    this.root.style.height = `${vh + this.travel}px`
    const cs = getComputedStyle(this.root)
    this.colors.bg = cs.getPropertyValue('--strip-bg').trim() || '#0B0B0B'
    this.colors.fg = cs.getPropertyValue('--strip-fg').trim() || '#F7F5EF'
    this.colors.ph = cs.getPropertyValue('--strip-ph').trim() || 'rgba(217,209,198,.08)'
    this.font = getComputedStyle(document.documentElement).getPropertyValue('--ff-heading').trim() || 'Georgia, serif'
    this.draw()
  }

  scrollTarget() {
    if (this.qaOffset !== null) return this.qaOffset * this.rem
    const top = this.root.getBoundingClientRect().top
    return -Math.min(Math.max(-top, 0), this.travel)
  }

  wake() {
    if (this.running || !this.g) return
    this.running = true
    this.last = performance.now()
    requestAnimationFrame(this.tick)
  }

  tick(now) {
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    this.time += dt
    const raw = this.scrollTarget()
    if (this.smooth === undefined) this.smooth = raw
    /* with Lenis the scroll is already smoothed; otherwise smooth it here */
    const k0 = window.Romai?.lenis ? 1 : 1 - Math.pow(1 - SCROLL_LERP_PER_60FPS, dt * 60)
    this.smooth += (raw - this.smooth) * k0
    this.target = this.smooth
    this.speed = this.target - this.current
    const k = 1 - Math.pow(1 - EASE_PER_30FPS, dt * 30)
    this.current += (this.target - this.current) * k
    if (this.qaOffset !== null) { this.smooth = this.target = this.current = raw; this.speed = 0 }
    this.draw()
    const settled = Math.abs(raw - this.current) < 0.05
    if (!settled || (this.visible && Math.abs(this.speed) > 0.05)) requestAnimationFrame(this.tick)
    else { this.running = false; this.speed = 0; this.draw() }
  }

  /* ---------- geometry ---------- */
  cardLeft(i) {
    /* wrap like their calcEdge so the row is endless */
    const x = this.startX + i * this.pitch + this.current
    return mod(x + this.pitch * 1.5, this.period) - this.pitch * 1.5
  }
  slotLeft(k) { return this.startX + k * this.pitch }

  /* outline of a card in screen space: bent by speed, scaled back by speed, rotated */
  cardOutline(cx, cy) {
    const w = this.cardW, h = this.cardH
    const ang = (this.cfg.tilt ?? 10) * Math.PI / 180
    const v = this.speed
    const depth = Math.min(Math.abs(v * 0.8), 80)                 /* their pos.z push */
    /* their camera is pixel-perfect (1 unit = 1 css px); an 80-unit push is a few percent */
    const camZ = (this.vh / 2) / Math.tan((25 * Math.PI) / 180)
    const s = camZ / (camZ + depth * this.rem)
    const wave = (u) => Math.sin((u + this.time * 2) * Math.PI * 2) * v * 0.00008 * h
    const pts = []
    for (let j = 0; j <= SEGMENTS; j++) { const u = j / SEGMENTS; pts.push([(u - 0.5) * w, -h / 2 + wave(u)]) }
    for (let j = SEGMENTS; j >= 0; j--) { const u = j / SEGMENTS; pts.push([(u - 0.5) * w, h / 2 + wave(u)]) }
    const c = Math.cos(ang), sn = Math.sin(ang)
    return pts.map(([x, y]) => [cx + (x * c - y * sn) * s, cy + (x * sn + y * c) * s])
  }

  /* ---------- drawing ---------- */
  draw() {
    const ctx = this.ctx
    if (!ctx || !this.g) return
    const { vw, vh, cardW, cardH, pitch } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = this.colors.bg
    ctx.fillRect(0, 0, vw, vh)
    const cy = vh / 2
    const ang = (this.cfg.tilt ?? 10) * Math.PI / 180

    for (let i = 0; i < CARD_VARIANTS.length; i++) {
      const left = this.cardLeft(i)
      if (left > vw + cardW || left + cardW < -cardW) continue
      const vi = CARD_VARIANTS[i] % this.variants.length
      const outline = this.cardOutline(left + cardW / 2, cy)
      ctx.save()
      ctx.beginPath()
      outline.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.clip()
      /* the slots this card overlaps (a card spans at most two, plus the gap) */
      const k0 = Math.floor((left - this.startX) / pitch) - 1
      for (let k = k0; k <= k0 + 3; k++) {
        const sl = this.slotLeft(k)
        if (sl > left + cardW * 1.3 || sl + cardW < left - cardW * 0.3) continue
        const img = this.images[vi][mod(k, 3)]
        ctx.save()
        ctx.translate(sl + cardW / 2, cy)
        ctx.rotate(ang)
        if (img) this.drawCover(img, -cardW / 2, -cardH / 2, cardW, cardH)
        else { ctx.fillStyle = this.colors.ph; ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH) }
        ctx.restore()
      }
      ctx.restore()
    }

    /* names ride with the cards, upright, in front */
    ctx.fillStyle = this.colors.fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const size = cardH * 0.16
    ctx.font = `400 ${size}px ${this.font}`
    for (let i = 0; i < CARD_VARIANTS.length; i++) {
      const left = this.cardLeft(i)
      if (left > vw + cardW || left + cardW < -cardW) continue
      const name = (this.variants[CARD_VARIANTS[i] % this.variants.length].name || '').toUpperCase()
      const measured = ctx.measureText(name).width
      const fit = Math.min(1, (cardW * 0.86) / Math.max(measured, 1))
      ctx.save()
      ctx.translate(left + cardW / 2, cy)
      ctx.scale(fit, 1)                                /* condense to the card width, like their name art */
      ctx.globalAlpha = 0.92
      ctx.fillText(name, 0, 0)
      ctx.restore()
    }
  }

  drawCover(img, x, y, w, h) {
    const ir = img.width / img.height, r = w / h
    let sw = img.width, sh = img.height, sx = 0, sy = 0
    if (ir > r) { sw = img.height * r; sx = (img.width - sw) / 2 } else { sh = img.width / r; sy = (img.height - sh) / 2 }
    this.ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  }

  /* ---------- pointer: which variant is under the cursor ---------- */
  variantAt(e) {
    const r = this.canvas.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    const ang = -(this.cfg.tilt ?? 10) * Math.PI / 180
    for (let i = 0; i < CARD_VARIANTS.length; i++) {
      const left = this.cardLeft(i)
      const cx = left + this.cardW / 2, cy = this.vh / 2
      const dx = px - cx, dy = py - cy
      const lx = dx * Math.cos(ang) - dy * Math.sin(ang)
      const ly = dx * Math.sin(ang) + dy * Math.cos(ang)
      if (Math.abs(lx) <= this.cardW / 2 && Math.abs(ly) <= this.cardH / 2) return this.variants[CARD_VARIANTS[i] % this.variants.length]
    }
    return null
  }
  hover(e) { this.canvas.classList.toggle('is-link', !!this.variantAt(e)) }
}

document.querySelectorAll('[data-section="lookbook-strip"]').forEach((root) => {
  if (root.__strip) return
  root.__strip = new LookbookStrip(root)
})
