/* =====================================================================
   Bold statement
   - the "BOLD FASHION" overlay wipes in from the left when the section enters
   - desktop: "[ WHO WE ARE ]" follows the pointer, and the overlay drifts
     towards it (22% follow, capped at 22% of its size, very soft easing)
   ===================================================================== */
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const FOLLOW = 0.22, LIMIT = 0.22, SMOOTH = 0.028, CURSOR_EASE = 0.25

class Bold {
  constructor(root) {
    this.root = root
    this.cursor = root.querySelector('[data-bold-cursor]')
    this.overlay = root.querySelector('[data-bold-overlay]')

    const start = () => new IntersectionObserver(([e], io) => {
      if (e.isIntersecting) { root.classList.add('is-in'); io.disconnect() }
    }, { threshold: 0.15 }).observe(root)
    if (document.documentElement.classList.contains('is-preloading')) document.addEventListener('romai:preloader:done', start, { once: true })
    else start()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover) and (min-width: 1024px)').matches || !this.cursor) return
    this.initPointer()
  }

  initPointer() {
    const root = this.root, cursor = this.cursor, overlay = this.overlay
    let inside = false, px = 0, py = 0, cx = 0, cy = 0, hw = 0, hh = 0
    let ox = 0, oy = 0, tx = 0, ty = 0, hasPointer = false, raf = 0
    const measure = () => { const r = cursor.getBoundingClientRect(); hw = r.width / 2; hh = r.height / 2 }

    const loop = () => {
      raf = 0
      let moving = false
      if (inside) {
        const r = root.getBoundingClientRect()
        const gx = px - r.left - hw, gy = py - r.top - hh
        cx = lerp(cx, gx, CURSOR_EASE); cy = lerp(cy, gy, CURSOR_EASE)
        cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
        moving = Math.abs(gx - cx) + Math.abs(gy - cy) > 0.2
      }
      if (overlay && hasPointer) {
        const r = overlay.getBoundingClientRect()
        const mx = r.left + r.width / 2 - ox, my = r.top + r.height / 2 - oy   /* centre without the drift */
        tx = clamp((px - mx) * FOLLOW, -r.width * LIMIT, r.width * LIMIT)
        ty = clamp((py - my) * FOLLOW, -r.height * LIMIT, r.height * LIMIT)
        ox = lerp(ox, tx, SMOOTH); oy = lerp(oy, ty, SMOOTH)
        overlay.style.transform = `translate3d(${ox}px, ${oy}px, 0)`
        moving = moving || Math.abs(tx - ox) + Math.abs(ty - oy) > 0.2
      }
      if (moving) raf = requestAnimationFrame(loop)
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop) }

    root.addEventListener('mouseenter', (e) => {
      inside = true; hasPointer = true; px = e.clientX; py = e.clientY; measure()
      const r = root.getBoundingClientRect(); cx = px - r.left - hw; cy = py - r.top - hh
      cursor.classList.add('is-visible'); kick()
    })
    root.addEventListener('mouseleave', () => { inside = false; cursor.classList.remove('is-visible') })
    window.addEventListener('mousemove', (e) => { px = e.clientX; py = e.clientY; hasPointer = true; if (inside || this.isNear()) kick() }, { passive: true })
    window.addEventListener('scroll', () => { if (inside) kick() }, { passive: true })
    window.addEventListener('resize', measure)
  }

  isNear() {
    const r = this.root.getBoundingClientRect()
    return r.bottom > 0 && r.top < window.innerHeight
  }
}

document.querySelectorAll('[data-section="bold"]').forEach((root) => {
  if (root.__bold) return
  root.__bold = new Bold(root)
})
