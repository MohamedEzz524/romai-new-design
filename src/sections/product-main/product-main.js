/* =====================================================================
   Product main behaviour (becaneparis.com product page):
   - TextShuffle: on hover / label change every char is replaced by a random char of
     the same class (a-z, A-Z, 0-9; spaces kept) 2 times, 50 ms apart, width locked.
   - Gallery: the current image is the one crossing the viewport's centre line
     (their IntersectionObserver margin -49.99% 0 -50%); Img counter + thumbs follow,
     thumbs scroll to their image (Lenis when present).
   - Sizes (desktop) switch the add-to-cart label (Add to cart / Out of stock).
   - Panels: one open at a time, label -> Close, blurred overlay, Esc / overlay closes.
   - Zoom (desktop): fixed sheet, horizontal snap slider, thumbs + counter, Esc closes.
   - Phones: "Details +" opens the panels sheet; add to cart opens the size sheet.
   - Entrance: headings slide in, bar items appear one by one (100 ms stagger).
   Cart: window.Romai.cart?.add(handle, { size }) (mock cart in header.js).
   ===================================================================== */
const rand = (c) => {
  if (c === ' ' || c === '\n') return c
  if (c.toLowerCase() === c && isNaN(Number(c))) return String.fromCharCode(97 + Math.floor(Math.random() * 26))
  if (isNaN(Number(c))) return String.fromCharCode(65 + Math.floor(Math.random() * 26))
  return String.fromCharCode(48 + Math.floor(Math.random() * 10))
}
const scramble = (t) => t.split('').map((c) => (c === ' ' || c === '\n' ? c : rand(c))).join('')

const SHUFFLE = false   /* classic look: labels change without the random-character scramble */
function shuffle(el, text, { iterations = 2, interval = 50 } = {}) {
  if (!el) return
  if (!SHUFFLE) { if (text !== undefined) el.textContent = text; return }
  const final = text ?? el.dataset.text ?? el.textContent
  el.dataset.text = final
  clearTimeout(el._shuffleT)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = final; return }
  el.style.width = el.getBoundingClientRect().width + 'px'
  el.classList.add('is-shuffling')
  let i = 0
  const step = () => {
    if (i < iterations) { el.textContent = scramble(final); i++; el._shuffleT = setTimeout(step, interval) }
    else { el.textContent = final; el.style.width = ''; el.classList.remove('is-shuffling') }
  }
  step()
}
/* set a label: shuffles into the new text (width follows the final text) */
function setLabel(el, text) {
  if (!el || el.dataset.text === text) return
  el.dataset.text = text
  el.textContent = text
  shuffle(el, text)
}
const pad = (n) => String(n).padStart(2, '0')
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches
const phone = () => matchMedia('(max-width: 900px)').matches

class ProductMain {
  constructor(root) {
    this.root = root
    this.d = root.dataset
    this.images = [...root.querySelectorAll('[data-pm-image]')]
    this.thumbs = [...root.querySelectorAll('[data-pm-thumb]')]
    this.count = root.querySelector('[data-pm-count]')
    this.addBtn = root.querySelector('[data-pm-add]')
    this.addLabel = root.querySelector('[data-pm-add-label]')
    this.options = [...root.querySelectorAll('[data-pm-option]')]
    this.panels = [...root.querySelectorAll('[data-pm-panel]')]
    this.detailsBtn = root.querySelector('[data-pm-details]')
    this.current = 0
    this.total = this.images.length
    root.querySelectorAll('[data-shuffle]').forEach((el) => { el.dataset.text = el.textContent })

    this.sizeVars()
    this.registerProduct()
    this.makePortal()
    this.bindHoverShuffle()
    this.bindGallery()
    this.bindOptions()
    this.bindPanels()
    this.bindAdd()
    this.bindZoom()
    this.bindSheet()
    this.enter()
  }

  sizeVars() {
    const set = () => {
      this.root.style.setProperty('--pm-vw', document.documentElement.clientWidth + 'px')
      this.root.style.setProperty('--pm-ivh', window.innerHeight + 'px')
    }
    set()
    window.addEventListener('resize', set)
    const bg = this.root.querySelector('[data-pm-mform-bg]')
    const top = this.root.querySelector('.pm-info__wrapper')
    if (bg && top) {
      const measure = () => {
        const y = top.getBoundingClientRect().top
        this.root.style.setProperty('--pm-form-top', Math.max(0, Math.round(y - 16)) + 'px')
      }
      measure()
      window.addEventListener('resize', measure)
      window.addEventListener('load', measure)
      if ('ResizeObserver' in window) new ResizeObserver(measure).observe(top)
    }
  }

  /* the zoom + size sheet must cover our header, but <main> is its own stacking context
     (z-index 1, footer reveal): move them into a body-level twin of the section root.
     While zoomed the add-to-cart bar is moved there too (theirs stays above the zoom). */
  makePortal() {
    const layers = this.root.querySelectorAll('[data-pm-zoom-overlay], [data-pm-zoom], [data-pm-sheet-overlay], [data-pm-sheet]')
    if (!layers.length) return
    this.portal = document.createElement('div')
    this.portal.className = 'pm pm--portal is-in'
    this.portal.dataset.pmPortal = ''
    layers.forEach((el) => this.portal.appendChild(el))
    document.body.appendChild(this.portal)
    this.bottomBar = this.root.querySelector('.pm-bar--bottomLeft')
    this.bottomHome = this.bottomBar?.parentElement
    this.syncVars = () => ['--pm-vw', '--pm-ivh'].forEach((v) => this.portal.style.setProperty(v, this.root.style.getPropertyValue(v)))
    this.syncVars()
    window.addEventListener('resize', this.syncVars)
  }
  state(cls, on) {
    this.root.classList.toggle(cls, on)
    this.portal?.classList.toggle(cls, on)
  }
  q(sel) { return this.root.querySelector(sel) || this.portal?.querySelector(sel) }

  registerProduct() {
    /* make the mock cart know this product (it only knows src/data/products.json) */
    window.Romai?.cart?.register?.({
      id: this.d.handle, handle: this.d.handle, title: this.d.title, price: Number(this.d.price),
      compare_at_price: null, available: true, featured_image: this.d.image, images: [this.d.image],
      type: '', tags: [],
    })
  }

  /* hover shuffle on clickable bar items and panel buttons (fine pointers only, as theirs) */
  bindHoverShuffle() {
    const targets = [this.addBtn, ...this.panels, this.detailsBtn, ...(this.portal || this.root).querySelectorAll('.pm-zoom__close')].filter(Boolean)
    targets.forEach((t) => t.addEventListener('mouseenter', () => {
      if (!fine()) return
      t.querySelectorAll('[data-shuffle]').forEach((el) => shuffle(el))
    }))
  }

  /* ---------- gallery ---------- */
  bindGallery() {
    if (!this.total) return
    let raf = 0
    const update = () => {
      raf = 0
      const mid = window.innerHeight / 2
      let idx = -1
      for (let i = 0; i < this.images.length; i++) {
        const r = this.images[i].getBoundingClientRect()
        if (r.top <= mid && r.bottom > mid) { idx = i; break }
      }
      if (idx !== -1 && idx !== this.current) this.setCurrent(idx)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    this.thumbs.forEach((b) => b.addEventListener('click', () => this.scrollToImage(Number(b.dataset.pmThumb))))
    this.dots = [...this.root.querySelectorAll('[data-pm-dot]')]
    this.dots.forEach((b) => b.addEventListener('click', () => this.scrollToImage(Number(b.dataset.pmDot))))
    const dotsNav = this.root.querySelector('[data-pm-dots]')
    const gallery = this.root.querySelector('[data-pm-gallery]')
    if (dotsNav && gallery && 'IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => dotsNav.classList.toggle('is-visible', e.isIntersecting), { rootMargin: '-45% 0px -45% 0px' }).observe(gallery)
    }
    this.images.forEach((img, i) => {
      img.addEventListener('click', () => this.openZoom(i))
      img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openZoom(i) } })
    })
  }
  setCurrent(i) {
    this.current = i
    this.thumbs.forEach((t, k) => t.classList.toggle('is-current', k === i))
    this.dots?.forEach((d, k) => { d.classList.toggle('is-current', k === i); if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current') })
    setLabel(this.count, `${pad(i + 1)} / ${pad(this.total)}`)
  }
  scrollToImage(i) {
    const el = this.images[i]
    if (!el) return
    const lenis = window.Romai?.lenis
    if (lenis) lenis.scrollTo(el, { duration: 1.1 })
    else el.scrollIntoView({ behavior: 'smooth' })
  }

  /* ---------- options ---------- */
  bindOptions() {
    this.options.forEach((o) => o.addEventListener('click', () => this.selectSize(o.dataset.pmOption)))
    this.colors = [...this.root.querySelectorAll('[data-pm-color]')]
    this.colorName = this.root.querySelector('[data-pm-color-name]')
    this.color = this.colors.find((c) => c.classList.contains('is-active'))?.dataset.pmColor
    this.colors.forEach((c) => c.addEventListener('click', () => {
      this.color = c.dataset.pmColor
      this.colors.forEach((x) => { const on = x.dataset.pmColor === this.color; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', on ? 'true' : 'false') })
      this.root.querySelectorAll('[data-pm-color-name]').forEach((n) => { n.textContent = this.color })
    }))
    const active = this.options.find((o) => o.classList.contains('is-active'))
    this.size = active?.dataset.pmOption
    this.available = active ? active.dataset.available === 'true' : true
  }
  selectSize(value) {
    this.options.forEach((o) => {
      const on = o.dataset.pmOption === value
      o.classList.toggle('is-active', on)
      o.setAttribute('aria-checked', String(on))
      if (on) this.available = o.dataset.available === 'true'
    })
    this.size = value
    setLabel(this.addLabel, this.available ? this.d.labelAdd : this.d.labelOos)
  }

  /* ---------- panels ---------- */
  bindPanels() {
    this.overlay = this.root.querySelector('[data-pm-overlay]')
    this.openIndex = null
    this.panels.forEach((p, i) => p.addEventListener('click', () => this.togglePanel(this.openIndex === i ? null : i)))
    this.overlay?.addEventListener('click', () => this.closeAll())
    this.detailsBtn?.addEventListener('click', () => this.toggleSheetPanels())
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeAll() })
    window.addEventListener('resize', () => { if (this.root.classList.contains('is-panel-open')) this.closeAll() })
  }
  togglePanel(i) {
    this.openIndex = i
    this.panels.forEach((p, k) => {
      const on = k === i
      p.classList.toggle('is-opened', on)
      p.setAttribute('aria-expanded', String(on))
      const lbl = p.querySelector('[data-shuffle]')
      const want = on ? this.d.labelClose : p.dataset.label
      if (lbl.dataset.text !== want) setLabel(lbl, want)
    })
    this.root.classList.toggle('is-panel-open', i !== null)
  }
  toggleSheetPanels() {
    const open = !this.root.classList.contains('is-panel-open')
    this.root.classList.toggle('is-panel-open', open)
    this.detailsBtn.setAttribute('aria-expanded', String(open))
    const lbl = this.detailsBtn.querySelector('[data-shuffle]')
    const base = this.panels[0]?.dataset.label || 'Details'
    setLabel(lbl, open ? `${this.d.labelClose} -` : `${base} +`)
    if (open) this.root.querySelector('[data-pm-inner]').scrollTop = 0
  }
  closeAll() {
    if (this.root.classList.contains('is-zoomed')) { this.closeZoom(); return }
    if (this.root.classList.contains('is-sheet-open')) { this.closeSheet(); return }
    if (!this.root.classList.contains('is-panel-open')) return
    if (phone() && this.detailsBtn && this.detailsBtn.getAttribute('aria-expanded') === 'true') this.toggleSheetPanels()
    else this.togglePanel(null)
    this.root.classList.remove('is-panel-open')
  }

  /* ---------- add to cart ---------- */
  bindAdd() {
    this.addBtn?.addEventListener('click', () => {
      if (!this.available) { shuffle(this.addLabel); return }
      this.add(this.size)
    })
  }
  add(size) {
    window.Romai?.cart?.add?.(this.d.handle, { size, color: this.color })
    const added = (this.d.labelAdded || 'Size {size} added').replace('{size}', size || '')
    this.addBtn.classList.add('is-added')
    setLabel(this.addLabel, added)
    clearTimeout(this.addedT)
    this.addedT = setTimeout(() => {
      this.addBtn.classList.remove('is-added')
      setLabel(this.addLabel, this.available ? this.d.labelAdd : this.d.labelOos)
    }, 2500)
  }

  /* ---------- zoom ---------- */
  bindZoom() {
    this.zoom = this.q('[data-pm-zoom]')
    if (!this.zoom) return
    this.zoomOverlay = this.q('[data-pm-zoom-overlay]')
    this.slider = this.zoom.querySelector('[data-pm-zoom-slider]')
    this.zoomThumbs = [...this.zoom.querySelectorAll('[data-pm-zoom-thumb]')]
    this.zoomCount = this.zoom.querySelector('[data-pm-zoom-count]')
    this.zoom.querySelector('[data-pm-zoom-close]').addEventListener('click', () => this.closeZoom())
    this.zoomOverlay.addEventListener('click', () => this.closeZoom())
    this.zoomThumbs.forEach((b) => b.addEventListener('click', () => this.slideTo(Number(b.dataset.pmZoomThumb))))
    let raf = 0
    this.slider.addEventListener('scroll', () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const max = this.slider.scrollWidth - this.slider.clientWidth
        const p = max > 0 ? this.slider.scrollLeft / max : 0
        this.setZoomCurrent(Math.round(p * (this.total - 1)))
      })
    }, { passive: true })
    /* vertical wheel scrolls the slider horizontally */
    this.slider.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); this.slider.scrollLeft += e.deltaY }
    }, { passive: false })
  }
  setZoomCurrent(i) {
    if (i === this.zoomCurrent) return
    this.zoomCurrent = i
    this.zoomThumbs.forEach((t, k) => t.classList.toggle('is-current', k === i))
    setLabel(this.zoomCount, `${pad(i + 1)} / ${pad(this.total)}`)
  }
  slideTo(i, instant = false) {
    const img = this.slider.children[i]
    if (!img) return
    const to = Math.min(img.offsetLeft - this.slider.offsetLeft, this.slider.scrollWidth - this.slider.clientWidth)
    if (instant) { this.slider.scrollLeft = to; this.setZoomCurrent(i); return }
    /* their move(): 0.5 s quadEaseOut tween with snapping off */
    const from = this.slider.scrollLeft, t0 = performance.now()
    this.slider.classList.add('is-animating')
    cancelAnimationFrame(this.slideRaf)
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 500), e = 1 - (1 - k) * (1 - k)
      this.slider.scrollLeft = from + (to - from) * e
      if (k < 1) this.slideRaf = requestAnimationFrame(tick)
      else this.slider.classList.remove('is-animating')
    }
    this.slideRaf = requestAnimationFrame(tick)
  }
  openZoom(i) {
    if (!this.zoom || phone() || this.total < 2) return
    this.lastFocus = document.activeElement
    this.zoom.hidden = false
    this.zoomCurrent = -1
    this.slideTo(i, true)
    document.documentElement.classList.add('is-locked')
    if (this.bottomBar && this.portal) { this.portal.appendChild(this.bottomBar); this.bottomBar.classList.add('is-floating') }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.state('is-zoomed', true)
      this.slideTo(i, true)
      this.zoom.querySelector('[data-pm-zoom-close]').focus({ preventScroll: true })
    }))
  }
  closeZoom() {
    this.state('is-zoomed', false)
    document.documentElement.classList.remove('is-locked')
    clearTimeout(this.zoomT)
    this.zoomT = setTimeout(() => {
      if (this.root.classList.contains('is-zoomed')) return
      this.zoom.hidden = true
      if (this.bottomBar && this.bottomHome) { this.bottomBar.classList.remove('is-floating'); this.bottomHome.appendChild(this.bottomBar) }
    }, 700)
    this.lastFocus?.focus?.({ preventScroll: true })
  }

  /* ---------- size sheet (phones) ---------- */
  bindSheet() {
    this.sheet = this.q('[data-pm-sheet]')
    if (!this.sheet) return
    this.sheetOverlay = this.q('[data-pm-sheet-overlay]')
    this.sheetOverlay.addEventListener('click', () => this.closeSheet())
    this.sheet.querySelectorAll('[data-pm-sheet-value]').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.pmSheetValue
      this.selectSize(v)
      this.closeSheet()
      setTimeout(() => this.add(v), 1)
    }))
  }
  openSheet() {
    const rows = [...this.sheet.querySelectorAll('.pm-sheet__row')]
    this.sheet.hidden = false
    this.sheet.style.height = '0px'
    rows.forEach((r) => r.classList.remove('is-in'))
    this.state('is-sheet-open', true)
    const h = this.sheet.firstElementChild.offsetHeight
    requestAnimationFrame(() => { this.sheet.style.height = h + 'px' })
    /* rows appear bottom-up, 100 ms apart after 200 ms (their Ik(.1,.2,true)) */
    rows.slice().reverse().forEach((r, k) => setTimeout(() => r.classList.add('is-in'), 200 + k * 100))
  }
  closeSheet() {
    this.state('is-sheet-open', false)
    this.sheet.style.height = '0px'
    setTimeout(() => { if (!this.root.classList.contains('is-sheet-open')) this.sheet.hidden = true }, 500)
  }

  /* ---------- entrance ---------- */
  enter() {
    const groups = [...this.root.querySelectorAll('[data-pm-stagger], .pm-line, .pm-panels')]
    const items = [...this.root.querySelectorAll('[data-pm-in]')]
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.root.classList.add('is-in'); return }
    items.forEach((el) => el.classList.add('is-pending'))
    requestAnimationFrame(() => {
      this.root.classList.add('is-in')
      groups.forEach((g) => {
        const kids = [...g.querySelectorAll('[data-pm-in]')]
        kids.forEach((el, k) => setTimeout(() => el.classList.remove('is-pending'), 100 + k * 100))
      })
      /* anything not inside a group */
      items.forEach((el) => { if (!groups.some((g) => g.contains(el))) el.classList.remove('is-pending') })
    })
  }
}

document.querySelectorAll('[data-section="product-main"]').forEach((el) => {
  if (!el._pm) el._pm = new ProductMain(el)
})
