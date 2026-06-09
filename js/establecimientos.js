async function saveEstablecimiento() {
  const id = _session?.establecimiento_id;
  if (!id) { toast('Sin establecimiento asignado','err'); return; }
  const nombre = document.getElementById('e-nombre').value.trim();
  const body = {
    nombre,
    direccion: document.getElementById('e-dir').value.trim(),
    maps_link: document.getElementById('e-maps').value.trim(),
    max_admins:      parseInt(document.getElementById('e-maxadm')?.value)||3,
    max_trabajadores:parseInt(document.getElementById('e-maxtrab')?.value)||10,
  };
  if (!nombre) { toast('El nombre es obligatorio','err'); return; }
  try {
    await dbFetch(`establecimientos?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(body)});
    toast('Establecimiento guardado ✓','ok');
  } catch(e) { toast('Error: '+e.message,'err'); }
}

let _todosEsts = [];

async function loadEstablecimientos() {
  const el = document.getElementById('ests-list'); if(!el)return;
  try {
    _todosEsts = await dbFetch('establecimientos?order=nombre.asc') || [];
    el.innerHTML = _todosEsts.map(e=>`
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700">${e.nombre}</div>
          <div style="font-size:10px;color:var(--muted)">${e.direccion||'Sin dirección'}</div>
        </div>
        <button onclick="showEstDetail('${e.id}')" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 8px">👁</button>
        <button onclick="editEstForm('${e.id}')" class="btn btn-secondary btn-sm" style="font-size:10px;padding:4px 8px">✏️</button>
        ${e.protegido ? '' : `<button data-eid="${e.id}" onclick="deleteEstConfirm(this.dataset.eid)" class="btn btn-danger btn-sm" style="font-size:10px;padding:4px 8px">🗑</button>`}
      </div>`).join('') || '<div style="color:var(--muted);font-size:12px">Sin establecimientos</div>';
    // Rellenar select de establecimientos en form de usuario
    const sel = document.getElementById('u-est');
    if (sel) sel.innerHTML = _todosEsts.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('');
    // Rellenar selects de filtro (solo visibles para superadmin)
    const opts = '<option value="all">🏪 Todos los establecimientos</option>' +
      _todosEsts.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('');
    ['fichas-est-select','prod-est-filter','user-est-filter','ug-est'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
    // Mostrar filas de filtro solo para superadmin
    ['fichas-est-filter-row','prod-est-filter-row','user-est-filter-row'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isSuperAdmin() ? '' : 'none';
    });
  } catch(e) { el.innerHTML=`<div style="color:var(--danger);font-size:12px">Error: ${e.message}</div>`; }
}

function editEstForm(id) {
  const e = _todosEsts.find(x=>x.id===id); if(!e) return;
  document.getElementById('ne-id').value    = e.id;
  document.getElementById('ne-nombre').value = e.nombre;
  document.getElementById('ne-dir').value   = e.direccion||'';
  document.getElementById('ne-maps').value  = e.maps_link||'';
  document.getElementById('ne-maxadm').value  = e.max_admins||3;
  document.getElementById('ne-maxtrab').value = e.max_trabajadores||10;
  document.getElementById('est-form-title').textContent = '✏️ Editar establecimiento';
  document.getElementById('ne-btn').textContent = 'Guardar cambios';
  document.getElementById('ne-cancel').style.display = '';
  document.getElementById('est-form-card').scrollIntoView({behavior:'smooth'});
}

function cancelEstForm() {
  document.getElementById('ne-id').value='';
  document.getElementById('ne-nombre').value='';
  document.getElementById('ne-dir').value='';
  document.getElementById('ne-maps').value='';
  document.getElementById('est-form-title').textContent = '+ Nuevo establecimiento';
  document.getElementById('ne-btn').textContent = 'Crear';
  document.getElementById('ne-cancel').style.display='none';
}

async function saveEstablecimientoForm() {
  const id       = document.getElementById('ne-id').value;
  const nombre   = document.getElementById('ne-nombre').value.trim();
  const dir      = document.getElementById('ne-dir').value.trim();
  const maps     = document.getElementById('ne-maps').value.trim();
  const maxAdm   = parseInt(document.getElementById('ne-maxadm').value) || 3;
  const maxTrab  = parseInt(document.getElementById('ne-maxtrab').value) || 10;
  if (!nombre) { toast('Nombre obligatorio','err'); return; }
  const body = {nombre, direccion:dir, maps_link:maps, max_admins:maxAdm, max_trabajadores:maxTrab};
  try {
    if (id) {
      await dbFetch(`establecimientos?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(body)});
      toast('Establecimiento actualizado ✓','ok');
    } else {
      await dbFetch('establecimientos',{method:'POST',body:JSON.stringify(body)});
      toast('Establecimiento creado ✓','ok');
    }
    cancelEstForm();
    loadEstablecimientos();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function deleteEstConfirm(id) {
  const est = (_todosEsts||[]).find(e => e.id === id);
  const nombre = est?.nombre || 'establecimiento';
  // P4: confirmación escribiendo el nombre
  showDeleteEstModal(id, nombre);
}
function showDeleteEstModal(id, nombre) {
  // Crear modal dinámico de confirmación con input
  let overlay = document.getElementById('del-est-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'del-est-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.85);display:flex;align-items:flex-end;justify-content:center';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="width:100%;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--danger);padding:24px;max-height:70vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 18px"></div>
      <h2 style="font-family:'Syne',sans-serif;font-size:17px;font-weight:800;margin-bottom:8px;color:var(--danger)">🗑 Eliminar establecimiento</h2>
      <p style="font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6">
        Esta acción eliminará <strong style="color:var(--text)">${nombre}</strong>.<br>
        Las fichas pasarán a <strong>Archivo</strong>. Usuarios y productos se eliminarán.<br><br>
        Escribe el nombre del establecimiento para confirmar:
      </p>
      <input id="del-est-input" class="input" placeholder="${nombre}" style="margin-bottom:12px"
        oninput="document.getElementById('del-est-btn').disabled = this.value !== '${nombre.replace(/'/g,"\'")}'"  >
      <div style="display:flex;gap:8px">
        <button id="del-est-btn" class="btn btn-danger" style="flex:1" disabled
          onclick="closeDelEstModal();deleteEst('${id}','${nombre.replace(/'/g,"\'")}')">Eliminar</button>
        <button class="btn btn-secondary btn-sm" onclick="closeDelEstModal()">Cancelar</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('del-est-input')?.focus(), 100);
}
function closeDelEstModal() {
  const o = document.getElementById('del-est-overlay');
  if (o) o.style.display = 'none';
}
async function deleteEst(id, nombre) {
  toast('Eliminando...','');
  try {
    // 1. Snapshot del establecimiento
    const estRows = await dbFetch(`establecimientos?id=eq.${id}&select=*`);
    const est = estRows?.[0] || {nombre, id};
    const estSnap = JSON.stringify({
      nombre:est.nombre, direccion:est.direccion, maps_link:est.maps_link, id:est.id
    });
    // 2. Fichas con snapshot de producto
    const fichas = await dbFetch(`fichas?establecimiento_id=eq.${id}&select=*,productos(*),establecimientos(*)`);
    // 3. Archivar cada ficha — nullificar FKs + guardar snapshots
    for (const f of (fichas||[])) {
      const pSnap = f.producto_snapshot || JSON.stringify({
        nombre:f.productos?.nombre, precio:f.productos?.precio,
        caducidad_tipo:f.productos?.caducidad_tipo, caducidad_valor:f.productos?.caducidad_valor,
        caducidad_meses:f.productos?.caducidad_meses, caducidad_fecha_fija:f.productos?.caducidad_fecha_fija
      });
      await dbFetch(`fichas?id=eq.${f.id}`, {
        method:'PATCH', body:JSON.stringify({
          estado:'archivo', est_snapshot:estSnap, producto_snapshot:pSnap,
          establecimiento_id:null, producto_id:null
        })
      });
    }
    // 4. Nullificar FK de admins a establecimiento ANTES de eliminar usuarios
    await dbFetch(`admins?establecimiento_id=eq.${id}`, {
      method:'PATCH', body:JSON.stringify({establecimiento_id:null, activo:false})
    });
    // 5. Nullificar FK de productos a establecimiento ANTES de eliminar productos
    await dbFetch(`productos?establecimiento_id=eq.${id}`, {
      method:'PATCH', body:JSON.stringify({establecimiento_id:null, activo:false})
    });
    // 6. Ahora eliminar el establecimiento (FKs ya nullificadas)
    await dbFetch(`establecimientos?id=eq.${id}`, {method:'DELETE'});
    toast(`"${nombre}" eliminado. ${(fichas||[]).length} fichas archivadas.`,'ok');
    loadEstablecimientos();
    reloadFichas();
    loadAdmins();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

// addEstablecimiento reemplazado por saveEstablecimientoForm

// ══════════════════════════════════════════════════════════
//  USUARIOS
// ══════════════════════════════════════════════════════════

// ══ Detalle de establecimiento ══
async function showEstDetail(estId) {
  const est = (_todosEsts||[]).find(e=>e.id===estId);
  if (!est) return;
  document.getElementById('est-detail').style.display = '';
  document.getElementById('est-detail-nombre').textContent = est.nombre;
  document.getElementById('ed-info').innerHTML = `
    ${est.direccion?`<div style="font-size:12px;margin-bottom:6px">📍 ${est.direccion}</div>`:''}
    ${est.maps_link?`<a href="${est.maps_link}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;margin-bottom:8px;display:inline-flex">🗺 Maps</a>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <div><div style="font-size:9px;color:var(--muted)">MÁX ADMINS</div><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--accent)">${est.max_admins||3}</div></div>
      <div><div style="font-size:9px;color:var(--muted)">MÁX TRAB.</div><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--accent)">${est.max_trabajadores||10}</div></div>
    </div>`;

  // Stats fichas
  try {
    const fichas = await dbFetch(`fichas?establecimiento_id=eq.${estId}&select=estado`);
    const activas = (fichas||[]).filter(f=>f.estado!=='archivo');
    document.getElementById('ed-total').textContent = activas.length;
    document.getElementById('ed-vend').textContent  = activas.filter(f=>f.estado==='vendida').length;
    document.getElementById('ed-usad').textContent  = activas.filter(f=>f.estado==='usada').length;
    document.getElementById('ed-cad').textContent   = activas.filter(f=>f.estado==='caducada').length;
  } catch(e) {}

  // Productos
  try {
    const prods = await dbFetch(`productos?establecimiento_id=eq.${estId}&activo=eq.true&select=nombre,precio`);
    document.getElementById('ed-productos').innerHTML = (prods||[]).length
      ? (prods||[]).map(p=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px">${p.nombre}</span><span style="color:var(--accent);font-family:'Syne',sans-serif;font-weight:700">${p.precio}€</span></div>`).join('')
      : '<div style="color:var(--muted);font-size:12px">Sin productos</div>';
  } catch(e) {}

  // Usuarios
  try {
    const users = await dbFetch(`admins?establecimiento_id=eq.${estId}&select=username,nombre_completo,role,activo`);
    const roleColor = {superadmin:'#e8c84a',admin:'#4ab4e8',trabajador:'#4ae8a0'};
    document.getElementById('ed-usuarios').innerHTML = (users||[]).length
      ? (users||[]).map(u=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-size:13px">${u.nombre_completo||u.username}</div>
          <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${roleColor[u.role]}22;color:${roleColor[u.role]};border:1px solid ${roleColor[u.role]}44">${u.role}</span>
          ${!u.activo?'<span style="font-size:9px;color:var(--danger)">●</span>':''}
        </div>`).join('')
      : '<div style="color:var(--muted);font-size:12px">Sin usuarios</div>';
  } catch(e) {}

  document.getElementById('est-detail').scrollIntoView({behavior:'smooth'});
}

function closeEstDetail() {
  document.getElementById('est-detail').style.display = 'none';
}
