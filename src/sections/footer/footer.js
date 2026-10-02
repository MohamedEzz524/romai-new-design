/* =====================================================================
   Footer: menus are open on desktop and become accordions (closed) on
   phones, where they animate open / closed. Reveal: CSS only (footer
   sticky at bottom 0 under the whole page).
   ===================================================================== */
const mq = window.matchMedia('(max-width: 989px)')
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

document.querySelectorAll('[data-section="footer"]').forEach((root) => {
  if (root.__footer) return
  root.__footer = true
  const groups = [...root.querySelectorAll('[data-ft-collapse]')]

  const setState = (d, open) => { d.open = open; d.classList.toggle('is-open', open) }
  const syncCollapse = () => groups.forEach((d) => { d._anim?.cancel(); setState(d, !mq.matches) })

  groups.forEach((d) => {
    const summary = d.querySelector('summary')
    const list = d.querySelector('.ft__list')
    summary.addEventListener('click', (e) => {
      e.preventDefault()
      if (!mq.matches || !list) return            /* desktop: titles are not toggles */
      const opening = !d.classList.contains('is-open')
      if (reduced()) { setState(d, opening); return }

      /* start from the current height, so a tap mid-animation reverses smoothly */
      const from = d.open ? list.getBoundingClientRect().height : 0
      d._anim?.cancel()
      d.classList.toggle('is-open', opening)      /* icon flips immediately */
      d.open = true                                /* content must render while it moves */
      const to = opening ? list.scrollHeight : 0
      const anim = list.animate(
        [{ height: from + 'px', opacity: opening ? 0.2 : 1 }, { height: to + 'px', opacity: opening ? 1 : 0 }],
        { duration: opening ? 480 : 380, easing: EASE }
      )
      d._anim = anim
      anim.onfinish = () => { d._anim = null; if (!opening) d.open = false }
    })
  })

  mq.addEventListener('change', syncCollapse)
  syncCollapse()
})
