/* =====================================================================
   Fitting: rebuild of ai-model.jp "customize" body. Read from their app.js
   (page method createCustomize + classes Ep "Fitting", Ap "Fit2Sub",
   Lp "Subdivide", Tp text holder). All their tweens are ease:"none", so the
   timelines are reproduced here as plain functions of progress (no GSAP).

   1. FITTING  ScrollTrigger pin on .customize__body, start "top top",
      end top + 2*innerHeight; onUpdate -> timeline.progress(p).
      Timeline: per layer i (5 layers) two tweens of duration 1, each added at
      "-=0.5", so layer i runs over [0.5i, 0.5i + 1] of a 3-unit timeline:
        image   clip-path inset(0 0 0 0) -> inset(0 0 (h+2)px 0)  (bottom edge wipes up)
        param   y 0 -> -(h+2)px  (the ivory line rides the wipe edge)
                counter text = progress.toFixed(6) as "0’  427141";
                class "off" (opacity 0) when that tween reaches 1.
   2. FIT2SUB  start/end = trigger top + 2vh / + 3vh (i.e. the 100vh right after
      the pin, while the body scrolls up). Timeline of 1:
        item  clip inset(0 0 0) -> inset(0 0 Hpx), y 0 -> H   (top edge holds still, bottom scrolls away)
        img   scale 1 -> 1.8, origin 50% -20%, from 0.1 to 0.6
   3. SUBDIVIDE  one trigger per row, start "top+=1.25vh top" (trigger sits
      inside the pinned body, so in real scroll terms: row top reaches 75% of the
      viewport). onEnter: row.on (CSS card animations), walk.on<n>; row 0 also
      drops the fit2Sub image (y -> 100%, 0.4s linear). onLeaveBack of row 0:
      image back (y 0, autoAlpha 0 -> 1, 0.2s), all rows off, walk cleared.

   Scroll: progress is read from the raw scroll position every frame (their
   non-smooth-scroll path: scroller = window, onUpdate -> progress, no scrub).
   The house-style scroll lerp is deliberately NOT used here: the pin is native
   (position:sticky), so a lagging timeline would desync from the pinned layer
   (stale fitting layers scrolling away over the fit2Sub image on fast scrolls).
   QA (dev): ?fitting-progress=0..1 scrolls to that point of the whole section
   (pin start .. section bottom at viewport bottom) (QA only; scrolling still works).
   ===================================================================== */

const LAYER_OFFSET = 0.5      /* "-=0.5" */
const ROW_START = 0.75        /* 1.25vh trigger offset minus the 2vh pin it ignores */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

class Fitting {
  constructor(root) {
    this.root = root
    this.pin = root.querySelector('[data-fitting-pin]')
    this.body = root.querySelector('[data-fitting-body]')
    this.space = root.querySelector('[data-fitting-space]')
    this.items = [...root.querySelectorAll('[data-fitting-item]')]
    this.params = [...root.querySelectorAll('[data-fitting-param]')]
    this.nums = this.params.map((p) => p.querySelector('[data-fitting-num]'))
    this.f2sItem = root.querySelector('[data-fit2sub-item]')
    this.f2sImg = root.querySelector('[data-fit2sub-img]')
    this.rows = [...root.querySelectorAll('[data-subdivide-row]')]
    this.walk = root.querySelector('[data-subdivide-walk]')

    const q = new URLSearchParams(location.search)
    this.qa = q.has('fitting-progress') ? clamp01(Number(q.get('fitting-progress'))) : null
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (this.reduced && this.qa === null) { root.classList.add('is-static'); return }

    this.rowState = this.rows.map(() => false)
    this.lastText = []
    this.sync = { y: 0, alpha: 1, anim: null }
    this.tick = this.tick.bind(this)

    this.resize()
    window.addEventListener('resize', () => { if (window.innerWidth !== this.vw || Math.abs(window.innerHeight - this.vh) > 120) this.resize() })
    window.addEventListener('scroll', () => this.wake(), { passive: true })
    /* sizes are not final at init (images still loading, sections above still sizing):
       re-measure whenever the frame or the fit2Sub box changes size, and once on load */
    this.measure = () => {
      this.itemH = this.items[0] ? this.items[0].clientHeight : 0
      this.f2sH = this.f2sItem.getBoundingClientRect().height
      this.render(true)
    }
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => this.measure())
      if (this.items[0]) ro.observe(this.items[0])
      ro.observe(this.f2sItem)
    }
    if (document.readyState !== 'complete') window.addEventListener('load', () => this.measure(), { once: true })
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.wake() }, { rootMargin: '50% 0px' }).observe(root)

    if (this.qa !== null) {
      const go = () => {
        this.resize()
        const y = this.pinTop + this.qa * (this.pin.offsetHeight - this.vh)
        window.scrollTo({ top: y, behavior: 'instant' })
        this.wake()
      }
      go()                                   /* now, and again once images/fonts have settled */
      if (document.readyState !== 'complete') window.addEventListener('load', go)
      if (document.fonts?.ready) document.fonts.ready.then(go)
    }
  }

  resize() {
    this.vw = window.innerWidth
    this.vh = window.innerHeight
    this.space.style.height = `${2 * this.vh}px`        /* pin length: 2 x innerHeight */
    this.pinTop = this.pin.getBoundingClientRect().top + window.scrollY
    this.itemH = this.items[0] ? this.items[0].clientHeight : 0
    this.f2sH = this.f2sItem.getBoundingClientRect().height
    this.lastText = []
    this.render(true)
  }

  wake() {
    if (this.running) return
    this.running = true
    requestAnimationFrame(this.tick)
  }

  tick(now) {
    const busy = this.render(false, now)
    if (busy || window.scrollY !== this.lastY) { this.lastY = window.scrollY; requestAnimationFrame(this.tick) }
    else this.running = false
  }

  /* ---------- 1. fitting ---------- */
  renderFitting(p) {
    const n = this.items.length
    const T = p * (LAYER_OFFSET * (n - 1) + 1)
    const d = this.itemH + 2
    for (let i = 0; i < n; i++) {
      const t = clamp01(T - LAYER_OFFSET * i)
      this.items[i].style.clipPath = `inset(0px 0px ${t * d}px 0px)`
      const prm = this.params[i]
      if (!prm) continue
      prm.style.transform = `translateY(${-t * d}px)`
      prm.classList.toggle('off', t === 1)
      const parts = t.toFixed(6).split('.')
      const text = `${parts[0]}’  ${parts[1]}`
      if (this.lastText[i] !== text && this.nums[i]) { this.nums[i].textContent = text; this.lastText[i] = text }
    }
  }

  /* ---------- 2. fit2Sub ---------- */
  renderFit2Sub(q, now) {
    const H = this.f2sH
    this.f2sItem.style.clipPath = `inset(0px 0px ${q * H}px)`
    this.f2sItem.style.transform = `translateY(${q * H}px)`
    const s = 1 + 0.8 * clamp01((q - 0.1) / 0.5)
    let busy = false
    const a = this.sync.anim
    if (a) {
      const k = clamp01((now - a.t0) / a.dur)
      this.sync[a.prop] = a.from + (a.to - a.from) * k
      if (k >= 1) this.sync.anim = null
      else busy = true
    }
    this.f2sImg.style.transform = `translate(0px, ${this.sync.y}%) scale(${s})`
    this.f2sImg.style.opacity = this.sync.alpha
    this.f2sImg.style.visibility = this.sync.alpha === 0 ? 'hidden' : 'inherit'
    return busy
  }

  syncOut(now) {                 /* their Ap.sync: to y 100%, 0.4s, linear */
    this.sync.alpha = 1
    this.sync.anim = { prop: 'y', from: this.sync.y, to: 100, t0: now, dur: 400 }
  }
  syncIn(now) {                  /* their Ap.unsync: y 0, autoAlpha 0 -> 1, 0.2s */
    this.sync.y = 0
    this.sync.alpha = 0
    this.sync.anim = { prop: 'alpha', from: 0, to: 1, t0: now, dur: 200 }
  }

  /* ---------- 3. subdivide rows + walk ---------- */
  renderRows(now, first) {
    const line = this.vh * ROW_START
    this.rows.forEach((row, n) => {
      const on = row.getBoundingClientRect().top <= line
      if (on === this.rowState[n]) return
      this.rowState[n] = on
      if (on) {
        if (n === 0) { if (first) { this.sync.y = 100; this.sync.anim = null } else this.syncOut(now) }
        row.classList.add('on')
        this.walk.classList.add(`on${n}`)
      } else if (n === 0) {
        this.syncIn(now)
        this.rows.forEach((r) => r.classList.remove('on'))
        this.walk.classList.remove('on0', 'on1', 'on2')
      }
    })
  }

  render(first, now = performance.now()) {
    if (!this.vh) return false
    const y = -this.pin.getBoundingClientRect().top   /* scroll past the pin start (re-read each frame: content above may change height) */
    const pinLen = 2 * this.vh
    this.renderFitting(clamp01(y / pinLen))
    const busy = this.renderFit2Sub(clamp01((y - pinLen) / this.vh), now)
    this.renderRows(now, first)
    return busy || !!this.sync.anim
  }
}

document.querySelectorAll('[data-section="fitting"]').forEach((el) => { if (!el.__fitting) el.__fitting = new Fitting(el) })
