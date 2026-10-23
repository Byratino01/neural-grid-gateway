// Shared, same-origin service marks for connector cards and telemetry rows.
(() => {
  'use strict';
  const assets = Object.freeze({
    github: './assets/icons/github.svg',
    render: './assets/icons/render.svg',
    netlify: './assets/icons/netlify.svg',
    chatgpt: './assets/icons/openai.svg',
    higgsfield: './assets/icons/higgsfield.ico'
  });
  const icon = (id, className = 'service-icon') => {
    const src = assets[id];
    return src ? '<img class="' + className + ' icon-' + id + '" src="' + src + '" alt="" aria-hidden="true">' : '';
  };
  window.__NG_ICONS = Object.freeze({assets, icon});
  document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('v71-connectors');
    if (!list) return;
    for (const [id,src] of Object.entries(assets)) {
      const row = list.querySelector('[data-connector="' + id + '"]');
      if (row) {
        const mark = document.createElement('img');
        mark.className = 'service-icon icon-' + id;
        mark.src = src; mark.alt = ''; mark.setAttribute('aria-hidden', 'true');
        row.prepend(mark);
      }
    }
    const legacy = list.querySelector('[data-connector="truck-scanner"]');
    if (legacy) legacy.hidden = true;
    if (!list.querySelector('[data-connector="higgsfield"]')) {
      const row = document.createElement('div');
      row.className = 'v71-connector visual-only';
      row.dataset.connector = 'higgsfield';
      row.dataset.status = 'unconnected';
      row.innerHTML = icon('higgsfield') + '<span class="v71-dot" aria-hidden="true"></span><span>Higgsfield</span><strong>UNCONFIGURED</strong>';
      row.title = 'Visual catalog only; no authorized telemetry integration';
      list.append(row);
    }
    // Keep the independent verified-run widget, but let the requested Add
    // Connector control remain visible above it in the compact side panel.
    const workflows = document.getElementById('v87-github-workflows');
    if (workflows) list.closest('.panel-body')?.append(workflows);
  });
})();
