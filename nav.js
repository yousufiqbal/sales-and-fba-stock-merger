(() => {
  const toggle = document.getElementById('navMenuToggle');
  const sidebar = document.getElementById('navSidebar');
  const overlay = document.getElementById('navSidebarOverlay');
  if (!toggle || !sidebar || !overlay) return;

  function openNav() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    toggle.classList.add('open');
  }

  function closeNav() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    toggle.classList.remove('open');
  }

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeNav();
    else openNav();
  });

  overlay.addEventListener('click', closeNav);
})();
