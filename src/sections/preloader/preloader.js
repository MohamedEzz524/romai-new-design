/* =====================================================================
   Preloader
   Sequence: letters fly in (left -> right, fade + blur + z, with a per-letter
   x offset so the left ones come from further away) -> hold -> the pentagon
   fill fades in over the lettering -> the pentagon morphs into the full
   viewport -> the sheet slides up. Fires "romai:preloader:done".
   QA: ?preloader-stage=letters|fill|morph|exit  (hold at that stage)
       ?preloader-force=1 (ignore show-once and reduced motion)
   ===================================================================== */
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const STORAGE_KEY = 'romai:preloaded'

class Preloader {
  constructor(root) {
    this.root = root
    this.cfg = JSON.parse(root.querySelector('[data-preloader-config]').textContent)
    this.logo = root.querySelector('.preloader__logo')
    this.letters = [...root.querySelectorAll('.logo-letter')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i))
    this.fill = root.querySelector('.preloader__fill')
    this.fillPath = root.querySelector('.preloader__fill-path')

    const q = new URLSearchParams(location.search)
    this.stage = q.get('preloader-stage')
    const force = q.has('preloader-force')
    const reduced = !force && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let seen = false
    try { seen = !force && this.cfg.showOnce && sessionStorage.getItem(STORAGE_KEY) === '1' } catch { /* storage blocked */ }

    document.documentElement.classList.add('is-preloading')
    if (seen) { this.finish(true); return }
    this.loaded = new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })))
    this.run(reduced).catch((err) => { console.warn('[preloader]', err); this.finish(true) })
  }

  async run(reduced) {
    if (reduced) {
      /* reduced motion: show the finished mark briefly, then fade */
      this.letters.forEach((el) => (el.style.opacity = '1'))
      await Promise.all([wait(900), this.loaded])
      this.finish()
      return
    }
    await this.flyInLetters()
    if (this.stage === 'letters') return
    /* hold the finished mark; wait for the page load too, but never longer than 2.5 s */
    await Promise.all([wait(this.cfg.holdAfterLogo), Promise.race([this.loaded, wait(2500)])])
    await this.fadeFill()
    if (this.stage === 'fill') return
    await this.morphToScreen()
    if (this.stage === 'morph') return
    this.finish()
  }

  /* ---------- 1. letters ---------- */
  /* give every flat letter real depth: a stack of darker copies behind it (extrusion) */
  buildExtrusion() {
    if (this.extruded) return
    this.extruded = true
    const layers = 26, step = 0.55                         /* ~14px deep at 220px logo width, no visible banding */
    this.letterGroups = this.letters.map((svg) => {
      const group = document.createElement('div')
      group.className = 'logo-letter-3d'
      svg.parentNode.insertBefore(group, svg)
      const parts = []
      for (let k = layers; k >= 1; k--) {
        const c = svg.cloneNode(true)
        c.classList.remove('logo-letter')
        c.classList.add('logo-letter-depth')
        const shade = 0.38 + 0.37 * (1 - k / layers)           /* darker towards the back */
        c.style.transform = `translateZ(${-k * step}px)`
        c.style.filter = `brightness(${shade.toFixed(2)})`
        group.appendChild(c)
        parts.push(c)
      }
      svg.style.transform = 'translateZ(0.5px)'
      group.appendChild(svg)
      parts.push(svg)
      return { group, parts }
    })
  }

  /* as briefed: left to right, each letter fades in, un-blurs and travels along the z axis
     (from in front of the camera back into place, like the reference video). Letters left of the
     centre also carry an x offset that grows the further left they sit; right-side letters a smaller
     one. A slight turn on the way in lets the extruded depth show, so each letter lands as a 3D piece. */
  flyInLetters() {
    this.buildExtrusion()
    const n = this.letterGroups.length
    const mid = (n - 1) / 2
    const dur = this.cfg.letterDuration
    const stagger = this.cfg.letterStagger
    const anims = []
    this.letterGroups.forEach(({ group, parts }, i) => {
      const spread = i - mid                                    /* -2.5 (left) .. 2.5 (right) */
      const x = 0                                               /* no sideways offset */
      const z = 420                                             /* starts in front, toward the viewer, and settles back */
      const rotX = -14                                           /* every letter: same small negative tip on X */
      const delay = i * stagger
      anims.push(group.animate(
        [
          { transform: `translate3d(${x}px, 0, ${z}px) rotateX(${rotX}deg)` },
          { transform: "translate3d(0, 0, 0) rotateX(0deg)" },
        ],
        { duration: dur, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
      ).finished)
      /* depth layers only fade; only the front face blurs, so the letter stays a crisp solid */
      parts.forEach((el, k) => {
        const front = k === parts.length - 1
        const base = el.style.filter || ""
        /* front face fades in slowly; the stacked depth layers would add up to solid at once,
           so they stay hidden until the face is mostly visible, then come in together */
        const frames = front
          ? [{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)", offset: 0.75 }, { opacity: 1, filter: "blur(0px)" }]
          : [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }]
        anims.push(el.animate(frames, { duration: dur, delay, easing: "linear", fill: "both" }).finished)
        if (!front && base) el.style.filter = base
      })
    })
    const total = dur + (n - 1) * stagger
    return Promise.race([Promise.all(anims), wait(total + 60)])
  }

  /* ---------- 2. pentagon fill in the logo's colour ---------- */
  pentagonPx() {
    const r = this.logo.getBoundingClientRect()
    const [vw, vh] = this.cfg.viewBox
    const s = Math.min(r.width / vw, r.height / vh)           /* preserveAspectRatio: meet */
    const ox = r.left + (r.width - vw * s) / 2
    const oy = r.top + (r.height - vh * s) / 2
    return this.cfg.pentagon.map(([x, y]) => [ox + x * s, oy + y * s])
  }
  pathFrom(points) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ' Z'
  }
  sizeFill() {
    const W = window.innerWidth, H = window.innerHeight
    this.fill.setAttribute('viewBox', `0 0 ${W} ${H}`)
    return [W, H]
  }
  async fadeFill() {
    this.sizeFill()
    this.fillPath.setAttribute('d', this.pathFrom(this.pentagonPx()))
    const anim = this.fill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.cfg.fillDuration, easing: 'ease-out', fill: 'forwards' })
    await Promise.race([anim.finished, wait(this.cfg.fillDuration + 60)])
    /* pin the end state inline and drop the animation: if the timer won the race the effect may still be
       mid-fade, and a live WAAPI effect overrides inline style, leaving the fill (and the morph) translucent */
    this.fill.style.opacity = '1'
    anim.cancel()
  }

  /* ---------- 3. morph the pentagon into the viewport ---------- */
  /* the pentagon keeps its shape and scales up from its centre until it covers the viewport */
  morphToScreen() {
    const [W, H] = this.sizeFill()
    const pts = this.pentagonPx()
    const cx = pts.reduce((n, q) => n + q[0], 0) / pts.length
    const cy = pts.reduce((n, q) => n + q[1], 0) / pts.length
    /* inner radius: smallest distance from the centre to any edge */
    let inner = Infinity
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      const len = Math.hypot(bx - ax, by - ay)
      inner = Math.min(inner, Math.abs((bx - ax) * (ay - cy) - (ax - cx) * (by - ay)) / len)
    }
    /* scale so the inner circle reaches the farthest screen corner, plus a small margin */
    const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy)))
    const S = (far / inner) * 1.04
    this.fillPath.setAttribute('d', this.pathFrom(pts))
    this.fillPath.style.transformBox = 'view-box'
    this.fillPath.style.transformOrigin = cx + 'px ' + cy + 'px'
    const dur = this.cfg.morphDuration
    if (this.stage === 'morph') { this.fillPath.style.transform = 'scale(' + (1 + (S - 1) * 0.15) + ')'; return new Promise(() => {}) }
    const anim = this.fillPath.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + S + ')' }], { duration: dur, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' })
    return Promise.race([anim.finished, wait(dur + 60)]).then(() => { this.fillPath.style.transform = 'scale(' + S + ')' })
  }

  /* ---------- 4. slide the sheet up and release the page ---------- */
  finish(immediate = false) {
    try { if (this.cfg.showOnce) sessionStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    const release = () => {
      this.root.classList.add('is-done')
      document.documentElement.classList.remove('is-preloading')
      document.dispatchEvent(new CustomEvent('romai:preloader:done'))
    }
    if (immediate) { release(); return }
    this.root.style.setProperty('--preloader-exit', `${this.cfg.exitDuration}ms`)
    this.root.classList.add('is-exiting')
    document.documentElement.classList.remove('is-preloading')     /* lets <main> settle in sync with the sheet */
    document.documentElement.classList.add('is-preloader-exiting')
    const done = () => {
      document.documentElement.classList.remove('is-preloader-exiting')
      release()
    }
    if (this.stage === 'exit') return
    this.root.addEventListener('transitionend', done, { once: true })
    setTimeout(done, this.cfg.exitDuration + 200)                   /* safety if transitionend never fires */
  }
}

document.querySelectorAll('[data-preloader]').forEach((root) => {
  if (root.__preloader) return
  root.__preloader = new Preloader(root)
})
