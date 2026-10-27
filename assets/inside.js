(() => {
  function initialise() {
    const illustration = document.getElementById('inspection');
    const toggle = document.getElementById('inside-toggle');
    if (!illustration || !toggle) return;

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
