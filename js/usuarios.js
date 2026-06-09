async function loadAdmins() {
  const el = document.getElementById('admins-list'); if(!el) return;
  try {
    let q = 'admins?order=created_at.asc&select=id,username,nombre_completo,role,activo,last_login,establecimiento_id,establecimientos(nombre)';
    // Superadmin en tab Admin (Test) ve solo su establecimiento de testing
    if (_session?.establecimiento_id)
      q += `&establecimiento_id=eq.${_session.establecimiento_id}`;
    else if (isAdmin() && !isSuperAdmin())
      q += `&establecimiento_id=eq.${_session.establecimiento_id}`;
    const rows = await dbFetch(q) || [];
    const roleColor = {superadmin:'#e8c84a',admin:'#4ab4e8',trabajador:'#4ae8a0'};
    const adminRow = a => {
      const esMismo = a.username === _session?.username;
      const puedeElim = !esMismo && (
        isSuperAdmin() ||
        (isAdmin() && a.role === 'trabajador' && a.establecimiento_id === _session.establecimiento_id)
      );
      const puedeBloq = !esMismo && (
        isSuperAdmin() ||
        (isAdmin() && a.establecimiento_id === _session.establecimiento_id)
      );
      return `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${a.nombre_completo?`<span>${a.nombre_completo}</span><span style="color:var(--muted);font-size:10px">@${a.username}</span>`:a.username}
            <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${roleColor[a.role]}22;color:${roleColor[a.role]};border:1px solid ${roleColor[a.role]}44">${a.role}</span>
            ${!a.activo?'<span style="font-size:9px;color:var(--danger)">● INACTIVO</span>':''}
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            Último: ${a.last_login?new Date(a.last_login).toLocaleDateString('es-ES'):'nunca'}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          ${puedeBloq?`<button onclick="openUsuarioModal({id:'${a.id}',username:'${a.username}',nombre_completo:'${(a.nombre_completo||'').replace(/'/g,'')}',role:'${a.role}',establecimiento_id:'${a.establecimiento_id||''}'})" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 6px">✏️</button>`:''}
          ${puedeBloq?`<button onclick="toggleAdmin('${a.id}',${!a.activo})" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 6px">${a.activo?'🔒':'✓'}</button>`:''}
          ${esMismo?'<span style="font-size:10px;color:var(--muted)">(tú)</span>':''}
        </div>
      </div>`;
    };

    if (isSuperAdmin()) {
      const filtEst = document.getElementById('user-est-filter')?.value || 'all';
      const filtRows = filtEst === 'all' ? rows : rows.filter(a => a.establecimiento_id === filtEst || (!a.establecimiento_id && filtEst === '__sin__'));
      const grupos = {};
      filtRows.forEach(a => {
        const key = a.establecimiento_id || '__sin__';
        const nom = a.establecimientos?.nombre || 'Sin establecimiento';
        if (!grupos[key]) grupos[key] = {nombre: nom, users: []};
        grupos[key].users.push(a);
      });
      el.innerHTML = Object.values(grupos).map(g => `
        <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px">
          🏪 ${g.nombre}
        </div>
        ${g.users.map(adminRow).join('')}
      `).join('') || '<div style="color:var(--muted);font-size:12px">Sin usuarios</div>';
    } else {
      el.innerHTML = rows.map(adminRow).join('') || '<div style="color:var(--muted);font-size:12px">Sin usuarios</div>';
    }
  } catch(e) { el.innerHTML=`<div style="color:var(--danger);font-size:12px">Error: ${e.message}</div>`; }
}

async function addAdmin() {
  const username = document.getElementById('u-name').value.trim().toLowerCase();
  const pass     = document.getElementById('u-pass').value;
  const role     = document.getElementById('u-role').value;
  if (!username) { toast('Introduce un nombre de usuario','err'); return; }
  if (pass.length < 8) { toast('Mínimo 8 caracteres','err'); return; }
  try {
    const hash = await sha256(username + ':' + pass);
    const nombre_completo = document.getElementById('u-fullname').value.trim();
    const body = {username, password_hash:hash, role};
    if (nombre_completo) body.nombre_completo = nombre_completo;
    if (isSuperAdmin()) {
      const estSel = document.getElementById('u-est')?.value;
      if (estSel) body.establecimiento_id = estSel;
    } else if (_session?.establecimiento_id) {
      body.establecimiento_id = _session.establecimiento_id;
    }
    // P4: verificar límites del establecimiento
    const estId = body.establecimiento_id;
    if (estId) {
      const estRows = await dbFetch(`establecimientos?id=eq.${estId}&select=max_admins,max_trabajadores`);
      const est = estRows?.[0];
      if (est) {
        const existentes = await dbFetch(`admins?establecimiento_id=eq.${estId}&activo=eq.true&role=eq.${role}&select=id`);
        const count = existentes?.length || 0;
        const limite = role === 'admin' ? est.max_admins : est.max_trabajadores;
        if (count >= limite) {
          toast(`Límite alcanzado: máx ${limite} ${role==='admin'?'admins':'trabajadores'} en este establecimiento`,'err');
          return;
        }
      }
    }
    await dbFetch('admins',{method:'POST',body:JSON.stringify(body)});
    document.getElementById('u-fullname').value='';
    document.getElementById('u-name').value='';
    document.getElementById('u-pass').value='';
    toast(`Usuario "${username}" creado ✓`,'ok'); loadAdmins();
  } catch(e) { toast('Error: '+(e.message.includes('duplicate')?'Ese usuario ya existe':e.message),'err'); }
}


async function toggleAdmin(id, activo) {
  try { await dbFetch(`admins?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({activo})}); loadAdmins(); }
  catch(e) { toast('Error: '+e.message,'err'); }
}

async function deleteAdmin(id, username) {
  if (!confirm(`¿Eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) return;
  try {
    await dbFetch(`admins?id=eq.${id}`, {method:'DELETE'});
    toast(`Usuario "${username}" eliminado`,'ok');
    loadAdmins();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════════
//  P7: CONFIRMACIÓN MODAL
// ══════════════════════════════════════════════════════════
let _confirmCallback = null;

// ══ Gestión global de usuarios (page-users, solo superadmin) ══
async function loadAdminsGlobal() {
  const el = document.getElementById('admins-list-global'); if(!el) return;
  const filtEst = document.getElementById('user-est-filter')?.value || 'all';
  const search  = (document.getElementById('user-search')?.value || '').toLowerCase().trim();
  try {
    let q = 'admins?order=created_at.asc&select=id,username,nombre_completo,role,activo,last_login,establecimiento_id,establecimientos(nombre)';
    if (filtEst !== 'all') q += `&establecimiento_id=eq.${filtEst}`;
    const rows = await dbFetch(q) || [];
    const roleColor = {superadmin:'#e8c84a',admin:'#4ab4e8',trabajador:'#4ae8a0'};
    const filtered = search ? rows.filter(a =>
      a.username.toLowerCase().includes(search) ||
      (a.nombre_completo||'').toLowerCase().includes(search)
    ) : rows;
    el.innerHTML = filtered.map(a => {
      const esMismo = a.username === _session?.username;
      return `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${a.nombre_completo?`<span>${a.nombre_completo}</span><span style="color:var(--muted);font-size:10px">@${a.username}</span>`:a.username}
            <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${roleColor[a.role]}22;color:${roleColor[a.role]};border:1px solid ${roleColor[a.role]}44">${a.role}</span>
            ${!a.activo?'<span style="font-size:9px;color:var(--danger)">● INACTIVO</span>':''}
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ${a.establecimientos?.nombre?`🏪 ${a.establecimientos.nombre} · `:''}Último: ${a.last_login?new Date(a.last_login).toLocaleDateString('es-ES'):'nunca'}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          ${!esMismo?`<button onclick="openUsuarioGlobalModal({id:'${a.id}',username:'${a.username}',nombre_completo:'${(a.nombre_completo||'').replace(/'/g,'')}',role:'${a.role}',establecimiento_id:'${a.establecimiento_id||''}'})" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 6px">✏️</button>`:''}
          ${!esMismo?`<button onclick="toggleAdmin('${a.id}',${!a.activo})" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 6px">${a.activo?'🔒':'✓'}</button>`:''}
          ${esMismo?'<span style="font-size:10px;color:var(--muted)">(tú)</span>':''}
        </div>
      </div>`;
    }).join('') || '<div style="color:var(--muted);font-size:12px">Sin usuarios</div>';
  } catch(e) { el.innerHTML=`<div style="color:var(--danger);font-size:12px">Error: ${e.message}</div>`; }
}

async function addAdminGlobal() {
  const username  = document.getElementById('ug-name').value.trim().toLowerCase();
  const pass      = document.getElementById('ug-pass').value;
  const role      = document.getElementById('ug-role').value;
  const fullname  = document.getElementById('ug-fullname').value.trim();
  const estId     = document.getElementById('ug-est').value;
  if (!username) { toast('Introduce un usuario','err'); return; }
  if (pass.length < 8) { toast('Mínimo 8 caracteres','err'); return; }
  try {
    const hash = await sha256(username + ':' + pass);
    const body = {username, password_hash:hash, role};
    if (fullname) body.nombre_completo = fullname;
    if (estId)    body.establecimiento_id = estId;
    await dbFetch('admins',{method:'POST',body:JSON.stringify(body)});
    document.getElementById('ug-name').value='';
    document.getElementById('ug-pass').value='';
    document.getElementById('ug-fullname').value='';
    toast(`Usuario "${username}" creado ✓`,'ok');
    loadAdminsGlobal();
  } catch(e) { toast('Error: '+(e.message.includes('duplicate')?'Ese usuario ya existe':e.message),'err'); }
}

// ══ Ir a pestaña usuarios y buscar por login ══
function gotoUserSearch(username) {
  showPage('users');
  const input = document.getElementById('user-search');
  if (input) {
    input.value = username;
    loadAdminsGlobal();
    setTimeout(() => input.scrollIntoView({behavior:'smooth'}), 200);
  }
}
