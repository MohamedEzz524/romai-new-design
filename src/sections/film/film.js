/* =====================================================================
   Film: while the track is pinned, progress p (0..1) drives
   - the pentagon mask width: 30% -> 440% desktop, 60 -> 500 tablet, 90 -> 1000 phones
     (the pentagon starts a little narrower so its height matches the original lips mask)
   - the video zoom: 1.2 -> 1 over the first 30%
   The video only plays while the section is near the viewport.
   ===================================================================== */
const SIZES = { mobile: [90, 1000], tablet: [60, 500], desktop: [30, 440] }
const RATIO = 0.951                               /* pentagon height / width */
const FROM_SCALE = Math.min(1, (254 / 343) / RATIO)

class Film {
  constructor(root) {
    this.root = root
    this.track = root.querySelector('[data-film-track]')
    this.stage = root.querySelector('[data-film-stage]')
    this.video = root.querySelector('[data-film-video]')
    this.cursor = root.querySelector('[data-film-cursor]')
    if (!this.track || !this.stage) return
    this.maskW = 30
    this.update = this.update.bind(this)
    this.queued = false
    const queue = () => { if (!this.queued) { this.queued = true; requestAnimationFrame(this.update) } }
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    this.update()
    requestAnimationFrame(() => root.classList.add('is-ready'))

    if (this.video) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { this.video.muted = true; this.video.play()?.catch(() => {}) }
        else this.video.pause()
      }, { rootMargin: '10% 0px' }).observe(this.track)
    }
    if (this.cursor) this.initCursor()
  }

  range() {
    const w = window.innerWidth
    return w < 768 ? SIZES.mobile : w < 1024 ? SIZES.tablet : SIZES.desktop
  }

  update() {
    this.queued = false
    const r = this.track.getBoundingClientRect()
    const travel = Math.max(1, r.height - window.innerHeight)
    const p = Math.min(1, Math.max(0, -r.top / travel))
    const [a, b] = this.range()
    const from = a * FROM_SCALE
    this.maskW = from + (b - from) * p
    this.stage.style.setProperty('--maskW', this.maskW + '%')
    const q = Math.min(1, p / 0.3)
    this.video?.style.setProperty('--film-zoom', (1.2 - 0.2 * q).toFixed(4))
  }

  initCursor() {
    let cw = 0, ch = 0
    const measure = () => { const r = this.cursor.getBoundingClientRect(); cw = r.width / 2; ch = r.height / 2 }
    const inMask = (x, y) => {
      const r = this.stage.getBoundingClientRect()
      const w = r.width * (this.maskW / 100), h = w * RATIO
      const l = (r.width - w) / 2, t = (r.height - h) / 2
      const dx = x - r.left, dy = y - r.top
      return dx >= l && dx <= l + w && dy >= t && dy <= t + h
    }
    const move = (e) => {
      const r = this.stage.getBoundingClientRect()
      this.cursor.style.transform = `translate3d(${e.clientX - r.left - cw}px, ${e.clientY - r.top - ch}px, 0)`
      const on = inMask(e.clientX, e.clientY)
      this.cursor.classList.toggle('is-visible', on)
      this.stage.style.cursor = on ? 'none' : ''
    }
    this.stage.addEventListener('mouseenter', (e) => { measure(); move(e) })
    this.stage.addEventListener('mousemove', move)
    this.stage.addEventListener('mouseleave', () => { this.cursor.classList.remove('is-visible'); this.stage.style.cursor = '' })
    window.addEventListener('resize', measure)
  }
}

document.querySelectorAll('[data-section="film"]').forEach((root) => {
  if (root.__film) return
  root.__film = new Film(root)
})
