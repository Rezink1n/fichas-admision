document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const uid    = params.get('uid');

  // ?setup=fichas-setup-2024 → acceso al panel de configuración (solo desarrollador)
  if (params.get('setup') === 'fichas-setup-2024') {
    localStorage.clear();
    window.history.replaceState({}, '', window.location.pathname);
    showSetup();
    return;
  }

  // ?logout=1 → cerrar sesión
  if (params.get('logout') === '1') {
    localStorage.removeItem('saved_session');
    window.history.replaceState({}, '', window.location.pathname);
    showLogin();
    return;
  }

  const hasSaved = !!localStorage.getItem('saved_session');

  if (uid && hasSaved) {
    const restored = await tryRestoreSession();
    if (restored) return;
  }

  if (uid) {
    document.getElementById('public-view').style.display = 'block';
    loadPublicFicha(uid);
    return;
  }

  const saved = await tryRestoreSession();
  if (saved) return;
  showLogin();
});

async function tryRestoreSession() {
  const raw = localStorage.getItem('saved_session');
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (!s.id || !s.username) return false;
    _session = s;
    await launchApp();
    // Si hay ?uid= en la URL y sesión restaurada, cargar ficha directamente
    const uid = new URLSearchParams(window.location.search).get('uid');
    if (uid) {
      showPage('buscar');
      document.getElementById('uid-input').value = uid;
      await buscarFicha(uid);
      setTimeout(() => {
        document.getElementById('buscar-result').scrollIntoView({behavior:'smooth', block:'start'});
      }, 300);
    }
    return true;
  } catch(e) { return false; }
}

// ══════════════════════════════════════════════════════════
//  LOGIN / SETUP
// ══════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('setup-overlay').classList.remove('show');
  document.getElementById('login-overlay').classList.add('show');
  setTimeout(()=>document.getElementById('l-user').focus(), 100);
}
function showSetup() {
  document.getElementById('login-overlay').classList.remove('show');
  document.getElementById('setup-overlay').classList.add('show');
  const {url,key} = getConfig();
  document.getElementById('s-url').value = url;
  document.getElementById('s-key').value = key;
}

async function submitLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  const remember = document.getElementById('l-remember').checked;
  const errEl = document.getElementById('l-err');
  const btn   = document.getElementById('l-btn');
  if (!user || !pass) { errEl.textContent = 'Introduce usuario y contraseña'; return; }
  btn.textContent = 'Verificando…'; btn.disabled = true; errEl.textContent = '';
  await new Promise(r => setTimeout(r, 400));
  try {
    const s = await verifyLogin(user, pass);
    if (s) {
      _session = s;
      if (remember) localStorage.setItem('saved_session', JSON.stringify(s));
      // Leer si venía de vista pública con un UID
      const fromUid = document.getElementById('login-overlay').dataset.fromUid || null;
      document.getElementById('login-overlay').dataset.fromUid = '';
      document.getElementById('login-overlay').classList.remove('show');
      await launchApp();
      // Si venía de QR público, ir directo a buscar + cargar ficha
      if (fromUid) {
        showPage('buscar');
        document.getElementById('uid-input').value = fromUid;
        await buscarFicha(fromUid);
        // Scroll suave al resultado
        setTimeout(() => {
          document.getElementById('buscar-result').scrollIntoView({behavior:'smooth', block:'start'});
        }, 300);
      }
    } else {
      errEl.textContent = 'Usuario o contraseña incorrectos';
      document.getElementById('l-pass').value = '';
      btn.textContent = 'Entrar'; btn.disabled = false;
    }
  } catch(e) {
    errEl.textContent = 'Error de conexión: ' + e.message;
    btn.textContent = 'Entrar'; btn.disabled = false;
  }
}

async function submitSetup() {
  const url = document.getElementById('s-url').value.trim();
  const key = document.getElementById('s-key').value.trim();
  const err = document.getElementById('s-err');
  const btn = document.getElementById('s-btn');
  if (!url || !key) { err.textContent = 'URL y Anon Key obligatorias'; return; }
  if (!url.startsWith('https://')) { err.textContent = 'La URL debe empezar por https://'; return; }
  btn.textContent = 'Conectando…'; btn.disabled = true; err.textContent = '';
  localStorage.setItem(SB_URL_KEY, url);
  localStorage.setItem(SB_KEY_KEY, key);
  try {
    await dbFetch('admins?select=id&limit=1');
    document.getElementById('setup-overlay').classList.remove('show');
    showLogin();
  } catch(e) {
    localStorage.removeItem(SB_URL_KEY); localStorage.removeItem(SB_KEY_KEY);
    err.textContent = 'No se pudo conectar: ' + e.message;
    btn.textContent = 'Guardar y conectar'; btn.disabled = false;
  }
}

function toggleVis(inputId, btnId) {
  const i = document.getElementById(inputId);
  const b = document.getElementById(btnId);
  i.type = i.type === 'password' ? 'text' : 'password';
  b.textContent = i.type === 'password' ? '👁' : '🙈';
}

function logout() {
  _session = null;
  localStorage.removeItem('saved_session');
  const gh = document.getElementById('global-header');
  if (gh) gh.style.display = 'none';
  document.getElementById('main-nav').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  showLogin();
}
function confirmLogout() {
  askConfirm('⏻ Cerrar sesión', '¿Seguro que quieres salir?', 'Sí, salir', 'btn-danger', logout);
}

// ══════════════════════════════════════════════════════════
//  LAUNCH APP
// ══════════════════════════════════════════════════════════
async function launchApp() {
  // ── Mostrar nav INMEDIATAMENTE antes de cualquier await ──
  const nav = document.getElementById('main-nav');
  nav.style.display = 'flex';
  document.getElementById('page-buscar').classList.add('active');
  // Pestañas según rol
  document.getElementById('nav-fichas').style.display   = isAdmin() ? '' : 'none';
  document.getElementById('nav-ests').style.display     = isSuperAdmin() ? '' : 'none';
  document.getElementById('nav-users').style.display    = isSuperAdmin() ? '' : 'none';
  const navAdmin    = document.getElementById('nav-admin');
  const navSettings = document.getElementById('nav-settings');
  // Trabajador: ocultar admin y ajustes
  if (navAdmin)    navAdmin.style.display    = _session?.role === 'trabajador' ? 'none' : '';
  if (navSettings) navSettings.style.display = _session?.role === 'trabajador' ? 'none' : '';
  // Renombrar pestaña admin a "Test" para superadmin
  const adminLabel = document.getElementById('nav-admin-label');
  if (adminLabel) adminLabel.textContent = isSuperAdmin() ? 'Test' : 'Admin';
  const adminTitle = document.getElementById('admin-page-title');
  if (adminTitle) adminTitle.innerHTML = isSuperAdmin() ? '🧪 <span>Test</span>' : 'Mi <span>espacio</span>';
  // P4: rellenar header global
  const gh = document.getElementById('global-header');
  if (gh) { gh.style.display = 'flex'; gh.style.alignItems = 'center'; }

  // Label usuario
  const displayName = _session?.nombre_completo || _session?.username || '';
  try { document.getElementById('admin-username-label').textContent = `${displayName} · ${_session?.role||''}`; } catch(e){}
  // Rellenar header global INMEDIATAMENTE con lo que sabemos
  const ghLocal = document.getElementById('gh-local');
  const ghUser  = document.getElementById('gh-user');
  if (ghUser)  ghUser.textContent = `${displayName} · ${_session?.role||''}`;
  if (ghLocal) ghLocal.textContent = isSuperAdmin() ? '⚡ Superadmin' : '…';
  // Botón ajustes en header — visible para admin y superadmin
  const ghSettingsBtn = document.getElementById('gh-settings-btn');
  if (ghSettingsBtn) ghSettingsBtn.style.display = _session?.role !== 'trabajador' ? '' : 'none';

  // Secciones según rol — todo síncrono, sin awaits
  ['section-emitir','section-productos','section-usuarios'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin() ? '' : 'none';
  });
  const setDisplay = (id, show) => { const el = document.getElementById(id); if(el) el.style.display = show ? '' : 'none'; };
  setDisplay('section-est',      isSuperAdmin());
  setDisplay('section-ests',     isSuperAdmin());
  setDisplay('section-config',   isSuperAdmin());
  setDisplay('section-est-info', false); // info est solo en página Buscar
  setDisplay('u-est-row',        isSuperAdmin());

  document.getElementById('u-role-row').querySelector('select').innerHTML =
    isSuperAdmin()
      ? '<option value="trabajador">Trabajador</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option>'
      : '<option value="trabajador">Trabajador</option><option value="admin">Admin</option>';

  // ── A partir de aquí los awaits — si fallan, el nav ya está visible ──
  // Cargar baseurl
  try {
    const rows = await dbFetch('config?key=eq.baseurl&select=value');
    if (rows?.[0]?.value) localStorage.setItem('sb_baseurl', rows[0].value);
  } catch(e) {}

  // Rellenar campos config (siempre existen en DOM aunque estén ocultos)
  const cfg = getConfig();
  try { document.getElementById('cfg-url').value = cfg.url; } catch(e){}
  try { document.getElementById('cfg-key').value = cfg.key; } catch(e){}
  try { document.getElementById('cfg-baseurl').value = localStorage.getItem('sb_baseurl') || ''; } catch(e){}

  // Nombre establecimiento en headers
  if (_session.establecimiento_id) {
    try {
      const rows = await dbFetch(`establecimientos?id=eq.${_session.establecimiento_id}&select=nombre,direccion,maps_link,max_admins,max_trabajadores`);
      if (rows?.[0]) {
        const e = rows[0];
        try{document.getElementById('buscar-est-name').textContent = e.nombre;}catch(e){}
        try{document.getElementById('fichas-est-name').textContent = e.nombre;}catch(e){}
        // Header global
        const ghLocalEl = document.getElementById('gh-local');
        if (ghLocalEl) ghLocalEl.textContent = e.nombre;
        // Cargar campos establecimiento en admin
        document.getElementById('e-nombre').value   = e.nombre || '';
        document.getElementById('e-dir').value     = e.direccion || '';
        document.getElementById('e-maps').value    = e.maps_link || '';
        const eMaxAdm  = document.getElementById('e-maxadm');
        const eMaxTrab = document.getElementById('e-maxtrab');
        if (eMaxAdm)  eMaxAdm.value  = e.max_admins || 3;
        if (eMaxTrab) eMaxTrab.value = e.max_trabajadores || 10;
        // Info establecimiento para todos (admin/trabajador), solo lectura
        document.getElementById('est-info-trabajador').style.display = '';
        document.getElementById('est-info-body').innerHTML = `
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;margin-bottom:6px">${e.nombre}</div>
          ${e.direccion ? `<div style="font-size:12px;color:var(--muted);margin-bottom:4px">📍 ${e.direccion}</div>` : ''}
          ${e.maps_link ? `<a href="${e.maps_link}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;margin-bottom:10px;display:inline-flex">🗺 Ver en Google Maps</a>` : ''}
          ${isAdmin() ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Máx. admins</div>
              <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--accent)">${e.max_admins||3}</div></div>
            <div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Máx. trabajadores</div>
              <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--accent)">${e.max_trabajadores||10}</div></div>
          </div>` : ''}
        `;
      }
    } catch(e) {}
  }

  await checkCaducadas();

  if (isAdmin()) {
    await loadProductos();
    await reloadFichas();
    loadAdmins();
    if (isSuperAdmin()) loadEstablecimientos();
  }
}

// ══════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const navBtn = document.getElementById('nav-' + id);
  if (navBtn) navBtn.classList.add('active');
  // Cargar datos al entrar en páginas específicas
  if (id === 'ests') loadEstablecimientos();
  if (id === 'users') loadAdminsGlobal();
}

// ══════════════════════════════════════════════════════════
//  BUSCAR FICHA
// ══════════════════════════════════════════════════════════
