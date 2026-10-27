(() => {
  function initialise() {
    const illustration = document.getElementById('inspection');
    const toggle = document.getElementById('inside-toggle');
    if (illustration && toggle) {
      function setMode(inside) {
        illustration.dataset.insideMode = inside ? 'inside' : 'surface';
        toggle.setAttribute('aria-pressed', String(inside));
        toggle.textContent = inside ? 'Вернуться к внешнему виду' : 'Показать изнутри';
      }

      setMode(false);
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        setMode(illustration.dataset.insideMode !== 'inside');
      });
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        typeof window.requestAnimationFrame === 'function' && typeof document.querySelectorAll === 'function') {
      const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      document.querySelectorAll('.primary-link').forEach(link => {
        let frame = null;
        let generation = 0;
        let x = 0;
        let y = 0;
        let listening = false;

        function stopPointer() {
          generation += 1;
          if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
          frame = null;
        }
        function movePointer(event) {
          if (event.pointerType !== 'mouse') return;
          x = event.clientX;
          y = event.clientY;
          if (frame !== null) return;
          const scheduledGeneration = ++generation;
          frame = window.requestAnimationFrame(() => {
            if (generation !== scheduledGeneration) return;
            frame = null;
            const bounds = link.getBoundingClientRect();
            link.style.setProperty('--pointer-x', `${x - bounds.left}px`);
            link.style.setProperty('--pointer-y', `${y - bounds.top}px`);
          });
        }
        function updatePointerAvailability() {
          const enabled = fineHover.matches && !reducedMotion.matches;
          if (enabled === listening) return;
          listening = enabled;
          if (enabled) {
            link.addEventListener('pointermove', movePointer);
            link.addEventListener('pointerleave', stopPointer);
          } else {
            link.removeEventListener('pointermove', movePointer);
            link.removeEventListener('pointerleave', stopPointer);
            stopPointer();
            link.style.removeProperty('--pointer-x');
            link.style.removeProperty('--pointer-y');
          }
        }
        if (typeof fineHover.addEventListener === 'function') fineHover.addEventListener('change', updatePointerAvailability);
        if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', updatePointerAvailability);
        updatePointerAvailability();
      });
    }

    const process = document.querySelector('.work-steps');
    if (!process) return;
    const steps = Array.from(process.querySelectorAll('li'));
    if (!steps.length) return;
    const markers = steps.map(step => step.querySelector('span'));
    if (markers.some(marker => !marker)) return;

    let framePending = false;
    function updateProcess() {
      framePending = false;
      const reference = window.innerHeight / 2;
      const listTop = process.getBoundingClientRect().top;
      const centers = markers.map(marker => {
        const rect = marker.getBoundingClientRect();
        const dot = window.getComputedStyle(marker, '::before');
        const top = parseFloat(dot.top) || 0;
        const height = parseFloat(dot.height) || 0;
        return rect.top + top + height / 2;
      });
      const first = centers[0];
      const last = centers[centers.length - 1];
      const progress = last > first ? Math.max(0, Math.min(1, (reference - first) / (last - first))) : 0;
      let active = 0;
      centers.forEach((center, index) => {
        if (Math.abs(center - reference) < Math.abs(centers[active] - reference)) active = index;
      });
      process.style.setProperty('--track-start', `${first - listTop}px`);
      process.style.setProperty('--track-length', `${Math.max(0, last - first)}px`);
      process.style.setProperty('--progress', String(progress));
      steps.forEach((step, index) => step.classList.toggle('is-active', index === active));
    }
    function scheduleProcessUpdate() {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(updateProcess);
    }
    window.addEventListener('scroll', scheduleProcessUpdate, { passive: true });
    window.addEventListener('resize', scheduleProcessUpdate, { passive: true });
    scheduleProcessUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
