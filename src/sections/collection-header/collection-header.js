/* =====================================================================
   Collection header strip
   - Only the active collection is wide; the others stay slivers.
   - The chevron scrolls one wide-card width; it hides at the end of the strip.
   ===================================================================== */
class CollectionHeader {
  constructor(root) {
    this.root = root
    this.viewport = root.querySelector('[data-ch-viewport]')
    this.items = [...root.querySelectorAll('[data-ch-item]')]
    this.next = root.querySelector('[data-ch-next]')
    /* the active card follows the page (?c=handle in this prototype; collection.handle on Shopify) */
    const fromUrl = new URLSearchParams(location.search).get('c')
    const byUrl = fromUrl && this.items.find((el) => el.dataset.handle === fromUrl)
    this.active = byUrl || this.items.find((el) => el.classList.contains('is-active')) || this.items[0]
    this.items.forEach((el) => {
      const on = el === this.active
      el.classList.toggle('is-active', on)
      const link = el.querySelector('a')
      if (on) link?.setAttribute('aria-current', 'page')
      else link?.removeAttribute('aria-current')
    })
    /* prototype only: title follows the active card (Shopify renders collection.title server-side) */
    if (byUrl) { const t = root.querySelector('.ch__title'); const label = byUrl.querySelector('.ch__label span'); if (t && label) t.textContent = label.textContent }
    /* expand into place: start with every card narrow, then widen the active one (0.5s ease-in-out) */
    this.widen(null)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.widen(this.active)
      this.active.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'instant' })
    }))

    /* only the active collection is wide; no hover/focus widening */

    this.next?.addEventListener('click', () => {
      const step = this.active.getBoundingClientRect().width || this.viewport.clientWidth / 2
      this.viewport.scrollBy({ left: step, behavior: 'smooth' })
    })
    this.viewport.addEventListener('scroll', () => this.syncNext(), { passive: true })
    window.addEventListener('resize', () => this.syncNext())
    this.syncNext()
  }

  widen(target) {
    this.items.forEach((el) => el.classList.toggle('is-wide', el === target))
  }

  syncNext() {
    if (!this.next) return
    const end = this.viewport.scrollLeft + this.viewport.clientWidth >= this.viewport.scrollWidth - 2
    this.next.disabled = end
  }
}

document.querySelectorAll('[data-section="collection-header"]').forEach((root) => {
  if (root.__ch) return
  root.__ch = new CollectionHeader(root)
})
