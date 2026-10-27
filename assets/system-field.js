/* A reversible diagram: local scroll position determines every fragment. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.mount(root);
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

  function buildGrid(width, height) {
    const mobile = width < 600;
    const spacing = mobile ? 56 : 64;
    const size = mobile ? 16 : 18;
    const origin = { x: width * .88, y: height * .5 };
    const maxDistance = Math.hypot(Math.max(origin.x, width - origin.x), height / 2) || 1;
    const nodes = [];
    const links = [];
    const columns = Math.ceil(width / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = column * spacing + spacing / 2;
        const y = row * spacing + spacing / 2;
        const distance = Math.hypot(x - origin.x, y - origin.y);
        const node = { x, y, distance, onset: Math.min(.62, distance / maxDistance * .62) };
        nodes.push(node);
        if (column) links.push({ a: nodes[nodes.length - 2], b: node, horizontal: true });
        if (row) links.push({ a: nodes[nodes.length - 1 - columns], b: node, horizontal: false });
      }
    }
    const spread = mobile
      ? Math.max(100, Math.min(150, Math.hypot(width, height) * .15))
      : Math.max(220, Math.min(460, Math.hypot(width, height) * .24));
    return { nodes, links, origin, size, mobile, spread };
  }

  function nodeState(node, progress, field) {
    const phase = clamp((progress - node.onset - .13) / .22);
    const movement = ease(phase);
    const dx = node.x - field.origin.x;
    const dy = node.y - field.origin.y;
    const distance = Math.hypot(dx, dy);
    // The centre module gets a stable direction too, never a divide-by-zero jump.
    const ux = distance < 1 ? 1 : dx / distance;
    const uy = distance < 1 ? 0 : dy / distance;
    const displacement = movement * field.spread;
    return {
      x: node.x + ux * displacement,
      y: node.y + uy * displacement,
      displacement,
      opacity: 1 - movement * .45,
      flash: Math.sin(phase * Math.PI)
    };
  }

  function connectionState(link, progress) {
    const onset = Math.min(link.a.onset, link.b.onset);
    const phase = clamp((progress - onset) / .13);
    return { opacity: 1 - ease(phase), flash: Math.sin(phase * Math.PI) };
  }

  function scrollProgress(scrollY, height) {
    return clamp(scrollY / Math.max(1, height * 1.7));
  }

  function mount(win) {
    const doc = win.document;
    const host = doc.querySelector('.system-field');
    const canvas = host && host.querySelector('.system-field-canvas');
    if (!canvas || !win.matchMedia || !win.requestAnimationFrame) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    let field;
    let frame = null;
    let visible = true;

    function resize() {
      const width = win.innerWidth;
      const height = win.innerHeight;
      if (!width || !height) return;
      const ratio = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      field = buildGrid(width, height);
      schedule();
    }

    function draw() {
      frame = null;
      if (!field || !visible) return;
      const progress = reduced.matches ? 0 : scrollProgress(win.scrollY, win.innerHeight);
      ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
      ctx.lineWidth = 1;
      const half = field.size / 2;
      field.links.forEach(link => {
        const state = connectionState(link, progress);
        if (state.opacity <= 0) return;
        ctx.strokeStyle = state.flash > .02
          ? `rgba(75, 219, 238, ${state.opacity * (.48 + state.flash * .32)})`
          : `rgba(79, 139, 184, ${state.opacity * .48})`;
        ctx.beginPath();
        if (link.horizontal) {
          ctx.moveTo(link.a.x + half, link.a.y);
          ctx.lineTo(link.b.x - half, link.b.y);
        } else {
          ctx.moveTo(link.a.x, link.a.y + half);
          ctx.lineTo(link.b.x, link.b.y - half);
        }
        ctx.stroke();
      });
      field.nodes.forEach(node => {
        const state = nodeState(node, progress, field);
        const flash = state.flash;
        ctx.strokeStyle = flash > .02
          ? `rgba(75, 219, 238, ${state.opacity * (.64 + flash * .3)})`
          : `rgba(98, 155, 196, ${state.opacity * .64})`;
        ctx.strokeRect(state.x - half, state.y - half, field.size, field.size);
      });
      host.classList.add('is-rendered');
    }

    function schedule() {
      if (frame === null && visible) frame = win.requestAnimationFrame(draw);
    }

    function visibility() {
      visible = !doc.hidden;
      if (visible) schedule();
    }

    win.addEventListener('scroll', () => { if (!reduced.matches) schedule(); }, { passive: true });
    win.addEventListener('resize', resize, { passive: true });
    doc.addEventListener('visibilitychange', visibility);
    if (typeof reduced.addEventListener === 'function') reduced.addEventListener('change', schedule);
    else if (typeof reduced.addListener === 'function') reduced.addListener(schedule);
    resize();
  }

  return { buildGrid, nodeState, connectionState, scrollProgress, mount };
});
