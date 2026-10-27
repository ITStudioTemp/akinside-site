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
