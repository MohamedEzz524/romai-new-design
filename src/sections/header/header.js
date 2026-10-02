/* =====================================================================
   Header behaviour: transparent/solid state, mega menu, search dropdown
   with live product results, mobile menu, and a mock cart drawer.
   Cart API (mock, localStorage; swap for Shopify /cart.js later):
     window.Romai.cart.add(handle, { size, qty })   .open()   .items   .register(product)
   QA: ?cart=demo seeds two items; ?open=search|cart|mega opens a panel.
   ===================================================================== */
const STORE = 'romai:cart'
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

class SiteHeader {
  constructor(root) {
    this.root = root
    this.bar = root.querySelector('.site-header__bar')
    this.scrim = root.querySelector('[data-scrim]')
    this.drawer = document.querySelector('[data-cart-drawer]')
    this.catalog = JSON.parse(document.querySelector('[data-catalog]')?.textContent || '[]')
    this.transparent = root.dataset.transparent === 'true'
    this.openPanel = null
    this.closeTimer = null

    this.bindScroll()
    this.bindPanels()
    this.bindMega()
    this.bindSearch()
    if (this.drawer) this.initCart()
    this.bindKeys()

    const q = new URLSearchParams(location.search)
    const open = q.get('open')
    if (open === 'cart' && this.drawer) requestAnimationFrame(() => this.openCart())
    else if (open === 'search') requestAnimationFrame(() => this.open('search'))
    else if (open === 'mega') requestAnimationFrame(() => this.open('mega', root.querySelector('[data-open="mega"]')))
  }

  /* ---------- transparent -> solid ---------- */
  bindScroll() {
    /* transparent while the first section (the hero) is under the bar; solid once it has scrolled past */
    const first = () => document.querySelector('main')?.firstElementChild
    const update = () => {
      const hero = first()
      const barH = this.bar.offsetHeight
      const past = hero ? hero.getBoundingClientRect().bottom <= barH : window.scrollY > 8
      this.root.classList.toggle('is-scrolled', past)
      this.syncSolid()
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
  }
  syncSolid() {
    /* solid only past the hero, or while a dropdown / search / cart is open (no hover state) */
    const solid = !this.transparent || this.root.classList.contains('is-scrolled') || !!this.openPanel || !!this.cartOpen
    this.root.classList.toggle('is-solid', solid)
  }

  /* ---------- generic panels (mega / search / mobile) ---------- */
  panelEl(name, trigger) {
    if (name === 'mega') return this.root.querySelector('#' + trigger.dataset.mega)
    return this.root.querySelector(`[data-panel="${name}"]`)
  }
  bindPanels() {
    this.root.querySelectorAll('[data-open]').forEach((btn) => {
      const name = btn.dataset.open
      if (name === 'cart') { if (this.drawer) btn.addEventListener('click', () => this.openCart()); return }
      btn.addEventListener('click', () => (this.openPanel?.btn === btn ? this.close() : this.open(name, btn)))
    })
    this.root.querySelectorAll('[data-panel] [data-close]').forEach((b) => b.addEventListener('click', () => this.close()))
    this.scrim.addEventListener('click', () => this.close())
  }
  open(name, btn = this.root.querySelector(`[data-open="${name}"]`)) {
    if (!btn) return
    const panel = this.panelEl(name, btn)
    if (this.openPanel && this.openPanel.panel !== panel) this.close(true)
    clearTimeout(this.closeTimer)
    const wasOpen = panel.classList.contains('is-open')
    panel.hidden = false
    this.scrim.hidden = false
    if (!wasOpen) {
      /* commit the closed state first, otherwise the browser skips the transition and the panel pops open */
      void panel.offsetHeight
      void this.scrim.offsetHeight
    }
    panel.classList.add('is-open')
    this.scrim.classList.add('is-open')
    btn.setAttribute('aria-expanded', 'true')
    this.openPanel = { name, panel, btn }
    this.syncSolid()
    if (name === 'search') setTimeout(() => panel.querySelector('[data-search-input]')?.focus({ preventScroll: true }), 300)
    if (name === 'mobile') document.documentElement.classList.add('is-locked')
  }
  close(instant = false) {
    const cur = this.openPanel
    if (!cur) return
    cur.btn.setAttribute('aria-expanded', 'false')
    cur.panel.classList.remove('is-open')
    this.openPanel = null
    document.documentElement.classList.remove('is-locked')
    const hide = () => { cur.panel.hidden = true; if (!this.openPanel) this.scrim.hidden = true }
    if (!this.openPanel) this.scrim.classList.remove('is-open')
    if (instant) hide()
    else this.closeTimer = setTimeout(hide, 650)
    this.syncSolid()
  }

  /* ---------- mega menu: hover to open, links swap copy + image ---------- */
  bindMega() {
    this.root.querySelectorAll('[data-open="mega"]').forEach((btn) => {
      const panel = this.panelEl('mega', btn)
      let leaveTimer
      const enter = () => { clearTimeout(leaveTimer); if (this.openPanel?.btn !== btn) this.open('mega', btn) }
      const leave = () => { leaveTimer = setTimeout(() => { if (this.openPanel?.btn === btn) this.close() }, 220) }
      if (window.matchMedia('(hover: hover)').matches) {
        btn.addEventListener('mouseenter', enter)
        btn.addEventListener('mouseleave', leave)
        panel.addEventListener('mouseenter', () => clearTimeout(leaveTimer))
        panel.addEventListener('mouseleave', leave)
      }
      const title = panel.querySelector('[data-mega-title]')
      const text = panel.querySelector('[data-mega-text]')
      const img = panel.querySelector('[data-mega-img]')
      const defaults = { title: title.textContent, text: text.dataset.default, img: img?.getAttribute('src') }
      const show = (t, d, src) => {
        title.textContent = t
        text.textContent = d
        if (img && src && img.getAttribute('src') !== src) {
          img.classList.add('is-swapping')
          setTimeout(() => { img.src = src; img.onload = () => img.classList.remove('is-swapping') }, 180)
        }
      }
      panel.querySelectorAll('.mega__link').forEach((a) => {
        a.addEventListener('mouseenter', () => show(a.dataset.title, a.dataset.text, a.dataset.image))
        a.addEventListener('focus', () => show(a.dataset.title, a.dataset.text, a.dataset.image))
      })
      panel.querySelector('.mega__list').addEventListener('mouseleave', () => show(defaults.title, defaults.text, defaults.img))
    })
  }

  /* ---------- search: pills + live results from the catalog ---------- */
  bindSearch() {
    const panel = this.root.querySelector('[data-panel="search"]')
    if (!panel) return
    const input = panel.querySelector('[data-search-input]')
    const results = panel.querySelector('[data-search-results]')
    const pills = [...panel.querySelectorAll('[data-pill]')]
    const run = (q) => {
      const term = q.trim().toLowerCase()
      pills.forEach((p) => p.classList.toggle('is-active', p.dataset.pill.toLowerCase() === term))
      if (!term) { results.innerHTML = ''; return }
      const hits = this.catalog.filter((p) => [p.title, p.type, ...(p.tags || [])].join(' ').toLowerCase().includes(term.replace(/s$/, '')))
      results.innerHTML = hits.length
        ? `<div class="search-panel__grid">${hits.slice(0, 8).map((p, i) => `
            <a class="search-card" style="--i:${i}" href="/product.html?p=${esc(p.handle)}">
              <div class="search-card__img"><img src="${esc(p.featured_image)}" alt="${esc(p.title)}" loading="lazy"></div>
              <div class="search-card__meta"><span>${esc(p.title)}</span><span class="search-card__price">${money(p.price)}</span></div>
            </a>`).join('')}</div>`
        : `<p class="search-panel__empty">No results for “${esc(q)}”.</p>`
    }
    let t
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value), 120) })
    pills.forEach((p) => p.addEventListener('click', () => { input.value = p.dataset.pill; run(p.dataset.pill); input.focus() }))
    const preset = new URLSearchParams(location.search).get('q')   /* QA: ?open=search&q=jacket */
    if (preset) { input.value = preset; run(preset) }
  }

  /* ---------- cart (mock) ---------- */
  initCart() {
    const q = new URLSearchParams(location.search)
    let items = []
    try { items = JSON.parse(localStorage.getItem(STORE) || '[]') } catch { /* storage blocked */ }
    if (!Array.isArray(items)) items = []
    if (q.get('cart') === 'demo' && !items.length) {
      const first = this.catalog[0]
      const sale = this.catalog.find((p) => p.handle === 'echoes-bomber') || this.catalog.find((p) => p.compare_at_price)
      items = [
        first && { handle: first.handle, color: first.colors?.[0], size: 'M', qty: 1 },
        sale && sale !== first && { handle: sale.handle, color: sale.colors?.[1] || sale.colors?.[0], size: 'L', qty: 2 },
      ].filter(Boolean)
    }
    this.items = items
    this.bagBtn = this.root.querySelector('[data-open="cart"]')
    this.cartPanel = this.drawer.querySelector('.cart-drawer__panel')
    this.listEl = this.drawer.querySelector('[data-cart-items]')
    this.drawer.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', (e) => {
      if (el.tagName === 'A' && el.getAttribute('href')) e.preventDefault()
      this.closeCart()
    }))

    /* line item actions: stepper + remove */
    this.listEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-index]')
      if (!row || row.classList.contains('is-leaving')) return
      const i = Number(row.dataset.index)
      const it = this.items[i]
      if (e.target.closest('[data-remove]')) { this.removeLine(row, i); return }
      const inc = e.target.closest('[data-inc]')
      const dec = e.target.closest('[data-dec]')
      if (!inc && !dec) return
      if (inc) it.qty = Math.min(99, it.qty + 1)
      else if (it.qty > 1) it.qty--
      this.saveCart(); this.renderCart(false)
      this.listEl.querySelector(`[data-index="${i}"] ${inc ? '[data-inc]' : '[data-dec]'}`)?.focus()
    })

    /* discount accordion (mock: codes are validated at checkout) */
    const dToggle = this.drawer.querySelector('[data-discount-toggle]')
    const dWrap = this.drawer.querySelector('[data-discount]')
    const dForm = this.drawer.querySelector('[data-discount-form]')
    const dInput = this.drawer.querySelector('[data-discount-input]')
    const dMsg = this.drawer.querySelector('[data-discount-msg]')
    dToggle?.addEventListener('click', () => {
      const open = dToggle.getAttribute('aria-expanded') !== 'true'
      dToggle.setAttribute('aria-expanded', String(open))
      dWrap.classList.toggle('is-open', open)
      if (open) setTimeout(() => dInput?.focus(), 350)
    })
    dForm?.addEventListener('submit', (e) => {
      e.preventDefault()
      const code = dInput.value.trim()
      dMsg.textContent = code ? `Code “${code.toUpperCase()}” will be applied at checkout.` : 'Enter a discount code.'
    })

    /* focus trap while open */
    this.drawer.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !this.drawer.classList.contains('is-open')) return
      const f = [...this.cartPanel.querySelectorAll('a[href]:not([tabindex="-1"]), button:not([disabled]), input:not([disabled])')]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (!this.cartPanel.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    })

    this.renderCart(false)

    const self = this
    window.Romai = window.Romai || {}
    window.Romai.cart = {
      add: (handle, { size = 'M', qty = 1, color } = {}) => {
        const p = self.catalog.find((x) => x.handle === handle)
        if (!p) return
        color = color || p.colors?.[0]
        const hit = self.items.find((i) => i.handle === handle && i.size === size && (i.color || '') === (color || ''))
        if (hit) hit.qty += qty
        else self.items.push({ handle, size, color, qty })
        self.saveCart(); self.openCart()
      },
      /* pages can add a product the mock catalog doesn't know (e.g. product-main) */
      register: (p) => {
        if (!p?.handle || self.catalog.some((x) => x.handle === p.handle)) return
        self.catalog.push(p)
        self.renderCart(false)
      },
      open: () => self.openCart(),
      close: () => self.closeCart(),
      get items() { return self.items.map((i) => ({ ...i })) },
    }
  }
  saveCart() { try { localStorage.setItem(STORE, JSON.stringify(this.items)) } catch { /* ignore */ } }
  removeLine(row, i) {
    row.style.height = row.offsetHeight + 'px'
    row.classList.add('is-leaving')
    requestAnimationFrame(() => requestAnimationFrame(() => { row.style.height = '0px' }))
    setTimeout(() => {
      this.items.splice(i, 1); this.saveCart(); this.renderCart(false)
      ;(this.listEl.querySelector('[data-remove]') || this.drawer.querySelector('.cart-drawer__close'))?.focus()
    }, 640)
  }
  renderCart(animate = true) {
    const cur = this.drawer.dataset.currency || 'USD'
    const COLOR_NAMES = { '#0B0B0B': 'Black', '#3A3A3A': 'Charcoal', '#5C5648': 'Olive', '#FFBF00': 'Amber', '#FFFFFF': 'White', '#EDE6DC': 'Ecru' }
    let count = 0, total = 0
    const rows = this.items.map((it, i) => {
      const p = this.catalog.find((x) => x.handle === it.handle)
      if (!p) return ''
      count += it.qty
      total += p.price * it.qty
      const variant = [COLOR_NAMES[String(it.color || '').toUpperCase()], it.size].filter(Boolean).join(', ')
      const compare = p.compare_at_price && p.compare_at_price > p.price
      const url = `/product.html?p=${esc(p.handle)}`
      return `<li class="cart-item${animate ? ' is-entering' : ''}" data-index="${i}" style="--i:${i}">
        <div class="cart-item__inner">
          <a class="cart-item__img" href="${url}" tabindex="-1" aria-hidden="true"><img src="${esc(p.featured_image)}" alt="" loading="lazy"></a>
          <div class="cart-item__body">
            <div class="cart-item__row">
              <a class="cart-item__title" href="${url}">${esc(p.title)}</a>
              <span class="cart-item__line">${money(p.price * it.qty)}</span>
            </div>
            ${variant ? `<p class="cart-item__variant">${esc(variant)}</p>` : ''}
            <p class="cart-item__price">${compare
              ? `<s class="cart-item__compare"><span class="visually-hidden">Regular price </span>${money(p.compare_at_price)}</s> <span class="cart-item__sale"><span class="visually-hidden">Sale price </span>${money(p.price)}</span>`
              : `<span>${money(p.price)}</span>`}</p>
            <div class="cart-item__actions">
              <div class="cart-item__qty" role="group" aria-label="Quantity for ${esc(p.title)}">
                <button type="button" data-dec aria-label="Decrease quantity"${it.qty <= 1 ? ' disabled' : ''}><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.1"/></svg></button>
                <span class="cart-item__qty-n">${it.qty}</span>
                <button type="button" data-inc aria-label="Increase quantity"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" stroke="currentColor" stroke-width="1.1"/></svg></button>
              </div>
              <button class="cart-item__remove" type="button" data-remove aria-label="Remove ${esc(p.title)}">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      </li>`
    }).join('')
    this.listEl.innerHTML = rows
    this.drawer.classList.toggle('is-empty', !count)
    this.drawer.querySelector('[data-cart-foot]').hidden = !count
    this.drawer.querySelector('[data-cart-total]').textContent = money(total)
    const code = this.drawer.querySelector('.cart-drawer__code')
    if (code) code.textContent = cur
    const head = this.drawer.querySelector('[data-cart-drawer-count]')
    if (head) { head.textContent = count; head.setAttribute('aria-label', `${count} item${count === 1 ? '' : 's'}`) }
    const badge = this.root.querySelector('[data-cart-count]')
    badge.textContent = count
    badge.hidden = !count
  }
  openCart() {
    if (this.drawer.classList.contains('is-open')) { this.renderCart(false); return }
    this.close(true)
    this.cartOpen = true
    this.syncSolid()
    clearTimeout(this.cartTimer)
    this.renderCart(true)
    this.drawer.hidden = false
    document.documentElement.classList.add('is-locked')
    requestAnimationFrame(() => requestAnimationFrame(() => this.drawer.classList.add('is-open')))
    this.bagBtn?.setAttribute('aria-expanded', 'true')
    setTimeout(() => this.drawer.querySelector('.cart-drawer__close')?.focus({ preventScroll: true }), 60)
  }
  closeCart() {
    if (this.drawer.hidden || !this.drawer.classList.contains('is-open')) return
    this.drawer.classList.remove('is-open')
    this.cartOpen = false
    this.syncSolid()
    document.documentElement.classList.remove('is-locked')
    this.bagBtn?.setAttribute('aria-expanded', 'false')
    this.bagBtn?.focus({ preventScroll: true })
    clearTimeout(this.cartTimer)
    this.cartTimer = setTimeout(() => { if (!this.drawer.classList.contains('is-open')) this.drawer.hidden = true }, 760)
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      if (this.drawer?.classList.contains('is-open')) this.closeCart()
      else this.close()
    })
  }
}

document.querySelectorAll('[data-section="header"]').forEach((root) => {
  if (root.__header) return
  root.__header = new SiteHeader(root)
})
