(function () {
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

  const pages = [
    { href: 'dashboard.html', label: 'Command Centre', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>` },
    { href: 'sos.html', label: 'SOS Alert', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>` },
    { href: 'responder.html', label: 'Responder View', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>` },
    { href: 'floorplan.html', label: 'Floor Plan', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/></svg>` }
  ];

  const style = document.createElement('style');
  style.textContent = `
    .hm-btn{position:fixed;top:16px;right:16px;z-index:9999;width:44px;height:44px;border-radius:12px;
      background:rgba(20,20,20,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      border:1px solid rgba(255,255,255,0.1);cursor:pointer;display:flex;align-items:center;
      justify-content:center;transition:all .2s;box-shadow:0 4px 16px rgba(0,0,0,0.4)}
    .hm-btn:hover{background:rgba(40,40,40,0.95);border-color:rgba(255,255,255,0.2);transform:scale(1.05)}
    .hm-btn svg{width:22px;height:22px;color:#f59e0b;transition:transform .3s}
    .hm-btn.open svg{transform:rotate(90deg)}
    .hm-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.6);
      backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;
      pointer-events:none;transition:opacity .3s}
    .hm-overlay.open{opacity:1;pointer-events:auto}
    .hm-panel{position:fixed;top:0;right:-320px;z-index:9999;width:300px;height:100vh;
      background:rgba(14,14,14,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      border-left:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;
      transition:right .35s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 30px rgba(0,0,0,0.5)}
    .hm-panel.open{right:0}
    .hm-head{padding:24px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;
      justify-content:space-between;align-items:center}
    .hm-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;
      letter-spacing:2px;color:#f59e0b;text-transform:uppercase}
    .hm-close{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05);
      border:1px solid rgba(255,255,255,0.08);cursor:pointer;display:flex;align-items:center;
      justify-content:center;transition:all .2s;color:rgba(255,255,255,0.5)}
    .hm-close:hover{background:rgba(255,255,255,0.1);color:#fff}
    .hm-close svg{width:18px;height:18px}
    .hm-links{flex:1;padding:16px;display:flex;flex-direction:column;gap:6px;overflow-y:auto}
    .hm-link{display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;
      text-decoration:none;color:rgba(255,255,255,0.6);transition:all .2s;
      border:1px solid transparent;font-family:'Barlow',sans-serif}
    .hm-link:hover{background:rgba(255,255,255,0.04);color:#fff;border-color:rgba(255,255,255,0.06)}
    .hm-link.active{background:rgba(245,158,11,0.08);color:#f59e0b;
      border-color:rgba(245,158,11,0.2)}
    .hm-link-icon{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.04);
      display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .hm-link-icon svg{width:20px;height:20px}
    .hm-link.active .hm-link-icon{background:rgba(245,158,11,0.12)}
    .hm-link-text{font-size:16px;font-weight:600;letter-spacing:.5px}
    .hm-foot{padding:20px 24px;border-top:1px solid rgba(255,255,255,0.06);
      font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:1px;
      font-family:'Barlow Condensed',sans-serif;text-transform:uppercase}
  `;
  document.head.appendChild(style);

  const linksHtml = pages.map(p => {
    const isActive = currentPage === p.href;
    return `<a href="${p.href}" class="hm-link ${isActive ? 'active' : ''}">
      <div class="hm-link-icon">${p.icon}</div>
      <span class="hm-link-text">${p.label}</span>
    </a>`;
  }).join('');

  const html = `
    <button class="hm-btn" id="hm-btn" aria-label="Menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
    </button>
    <div class="hm-overlay" id="hm-overlay"></div>
    <div class="hm-panel" id="hm-panel">
      <div class="hm-head">
        <span class="hm-title">CrisisSync</span>
        <button class="hm-close" id="hm-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="hm-links">${linksHtml}</div>
      <div class="hm-foot">Emergency Response System</div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  const btn = document.getElementById('hm-btn');
  const overlay = document.getElementById('hm-overlay');
  const panel = document.getElementById('hm-panel');
  const close = document.getElementById('hm-close');

  function toggle() {
    const open = panel.classList.toggle('open');
    overlay.classList.toggle('open', open);
    btn.classList.toggle('open', open);
  }
  btn.onclick = toggle;
  overlay.onclick = toggle;
  close.onclick = toggle;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(); });
})();
