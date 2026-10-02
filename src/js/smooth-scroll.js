/* =====================================================================
   Smooth scrolling (Lenis). Lenis drives the real window scroll, so
   position: sticky, IntersectionObserver and every section's scroll
   listeners keep working unchanged.
   - Off for reduced motion and when ?lenis=0 is in the URL (QA).
   - Paused while the page is locked: preloader running, cart drawer or
     mobile menu open (html.is-preloading / html.is-locked).
   - In-page anchor links scroll smoothly with the header height offset.
   Exposed as window.Romai.lenis.
   ===================================================================== */
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

export function initSmoothScroll() {
  const off = new URLSearchParams(location.search).get('lenis') === '0'
  if (off || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  const lenis = new Lenis({
    lerp: 0.1,              /* their feel: soft ease-out, ~0.1 per frame */
    wheelMultiplier: 1,
    touchMultiplier: 1.4,
    smoothWheel: true,
    syncTouch: false,       /* keep native momentum on touch devices */
    anchors: { offset: -72 },
    autoRaf: true,
  })

  /* pause while something has locked the page */
  const html = document.documentElement
  /* Lenis itself writes classes on <html>, so only act when the lock state really changes
     (calling start/stop on every mutation would loop forever) */
  let wasLocked = null
  const sync = () => {
    const locked = html.classList.contains('is-locked') || html.classList.contains('is-preloading')
    if (locked === wasLocked) return
    wasLocked = locked
    if (locked) lenis.stop()
    else lenis.start()
  }
  new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['class'] })
  sync()

  /* sections that change the page height (pins sized by JS) */
  window.addEventListener('load', () => lenis.resize())

  window.Romai = window.Romai || {}
  window.Romai.lenis = lenis
  return lenis
}
