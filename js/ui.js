// ══════════════════════════════════════════════════════════
//  SISTEMA DE MODALES UNIFICADO
// ══════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal2(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── Producto modal ──
function openProductoModal(prod = null) {
  const isEdit = !!prod;
  document.getElementById('modal-prod-title').textContent = isEdit ? '✏️ Editar producto' : '🛒 Nuevo producto';
  document.getElementById('p-edit-id').value  = prod?.id || '';
  document.getElementById('p-nombre').value   = prod?.nombre || '';
  document.getElementById('p-precio').value   = prod?.precio || '';
  document.getElementById('p-cad-tipo').value = prod?.caducidad_tipo || 'meses';
  document.getElementById('p-cad-val').value  = prod?.caducidad_valor || prod?.caducidad_meses || 3;
  document.getElementById('p-cad-fecha').value = prod?.caducidad_fecha_fija || '';
  document.getElementById('p-del-btn').style.display = isEdit ? '' : 'none';
  toggleCadInput();
  openModal('modal-producto');
}
async function saveProductoModal() {
  const id      = document.getElementById('p-edit-id').value;
  const nombre  = document.getElementById('p-nombre').value.trim();
  const precio  = parseFloat(document.getElementById('p-precio').value);
  const cadTipo = document.getElementById('p-cad-tipo').value;
  const cadVal  = parseInt(document.getElementById('p-cad-val').value) || 3;
  const cadFecha= document.getElementById('p-cad-fecha').value || null;
  if (!nombre || isNaN(precio)) { toast('Nombre y precio obligatorios','err'); return; }
  const cadMeses = (cadTipo==='nunca'||cadTipo==='fecha') ? null : cadTipo==='dias' ? Math.ceil(cadVal/30) : cadVal;
  const body = {nombre, precio, caducidad_tipo:cadTipo,
    caducidad_valor: (cadTipo!=='nunca'&&cadTipo!=='fecha') ? cadVal : null,
    caducidad_fecha_fija: cadTipo==='fecha' ? cadFecha : null};
  if (cadMeses !== null) body.caducidad_meses = cadMeses;
  try {
    if (id) {
      await dbFetch(`productos?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(body)});
      // Actualizar precio en fichas emitidas de este producto
      if (body.precio !== undefined) {
        const newSnap = JSON.stringify({nombre:body.nombre||nombre, precio:body.precio,
          caducidad_tipo:body.caducidad_tipo, caducidad_valor:body.caducidad_valor,
          caducidad_meses:body.caducidad_meses, caducidad_fecha_fija:body.caducidad_fecha_fija||null});
        await dbFetch(`fichas?producto_id=eq.${id}&estado=eq.emitida`,{
          method:'PATCH', body:JSON.stringify({valor:body.precio, producto_snapshot:newSnap})
        }).catch(()=>{});
      }
      toast('Producto actualizado ✓','ok');
    } else {
      if (_session?.establecimiento_id) body.establecimiento_id = _session.establecimiento_id;
      await dbFetch('productos',{method:'POST',body:JSON.stringify(body)});
      toast('Producto creado ✓','ok');
    }
    closeModal2('modal-producto');
    await loadProductos();
  } catch(e) { toast('Error: '+e.message,'err'); }
}
async function deleteProductoModal() {
  const id = document.getElementById('p-edit-id').value;
  if (!id || !confirm('¿Eliminar este producto?')) return;
  // Verificar fichas emitidas
  const emitidas = await dbFetch(`fichas?producto_id=eq.${id}&estado=eq.emitida&select=id&limit=1`).catch(()=>[]);
  if (emitidas?.length) { toast('Hay fichas emitidas con este producto','err'); return; }
  await dbFetch(`productos?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({activo:false})});
  toast('Producto eliminado','ok');
  closeModal2('modal-producto');
  loadProductos();
}

// ── Usuario modal (page-admin) ──
function openUsuarioModal(user = null) {
  const isEdit = !!user;
  document.getElementById('modal-user-title').textContent = isEdit ? '✏️ Editar usuario' : '👤 Nuevo usuario';
  document.getElementById('u-edit-id').value   = user?.id || '';
  document.getElementById('u-fullname').value  = user?.nombre_completo || '';
  document.getElementById('u-name').value      = user?.username || '';
  document.getElementById('u-name').disabled   = isEdit; // no cambiar login
  document.getElementById('u-pass').value      = '';
  document.getElementById('u-pass-label').textContent = isEdit ? '(vacío = no cambiar)' : '(mínimo 8 caracteres)';
  document.getElementById('u-pass2-row').style.display = '';
  const passInput = document.getElementById('u-pass');
  passInput.placeholder = isEdit ? 'Vacío para no cambiar' : 'Mínimo 8 caracteres';
  document.getElementById('u-del-btn').style.display = isEdit ? '' : 'none';
  // Rol
  const roleEl = document.getElementById('u-role');
  if (roleEl && user?.role) roleEl.value = user.role;
  // Est
  const estRow = document.getElementById('u-est-row');
  if (estRow) estRow.style.display = isSuperAdmin() ? '' : 'none';
  openModal('modal-usuario');
}
async function saveUsuarioModal() {
  const id       = document.getElementById('u-edit-id').value;
  const username = document.getElementById('u-name').value.trim().toLowerCase();
  const pass     = document.getElementById('u-pass').value;
  const fullname = document.getElementById('u-fullname').value.trim();
  const role     = document.getElementById('u-role').value;
  if (!username) { toast('Login obligatorio','err'); return; }
  if (!id && pass.length < 8) { toast('Contraseña mínimo 8 caracteres','err'); return; }
  try {
    const patch = {};
    if (fullname) patch.nombre_completo = fullname;
    if (!id) patch.username = username;
    if (!id) patch.role = role;
    if (id && role) patch.role = role;
    if (pass && pass.length >= 8) patch.password_hash = await sha256(username+':'+pass);
    if (isSuperAdmin()) {
      const estSel = document.getElementById('u-est');
      if (estSel) patch.establecimiento_id = estSel.value || null;
    }
    if (id) {
      await dbFetch(`admins?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(patch)});
      toast('Usuario actualizado ✓','ok');
    } else {
      if (!pass || pass.length < 8) { toast('Contraseña obligatoria','err'); return; }
      patch.password_hash = await sha256(username+':'+pass);
      if (!isSuperAdmin() && _session?.establecimiento_id) patch.establecimiento_id = _session.establecimiento_id;
      await dbFetch('admins',{method:'POST',body:JSON.stringify({username, role, ...patch})});
      toast(`Usuario "${username}" creado ✓`,'ok');
    }
    closeModal2('modal-usuario');
    await loadAdmins();
  } catch(e) { toast('Error: '+(e.message.includes('duplicate')?'Login ya existe':e.message),'err'); }
}
async function deleteUsuarioModal() {
  const id = document.getElementById('u-edit-id').value;
  const username = document.getElementById('u-name').value;
  if (!id || !confirm(`¿Eliminar usuario "${username}"?`)) return;
  await dbFetch(`admins?id=eq.${id}`,{method:'DELETE'});
  toast('Usuario eliminado','ok');
  closeModal2('modal-usuario');
  loadAdmins();
}

// ── Usuario global modal (page-users) ──
function openUsuarioGlobalModal(user = null) {
  const isEdit = !!user;
  document.getElementById('modal-ug-title').textContent = isEdit ? '✏️ Editar usuario' : '👤 Nuevo usuario';
  document.getElementById('ug-edit-id').value  = user?.id || '';
  document.getElementById('ug-fullname').value = user?.nombre_completo || '';
  document.getElementById('ug-name').value     = user?.username || '';
  document.getElementById('ug-name').disabled  = isEdit;
  document.getElementById('ug-pass').value     = '';
  document.getElementById('ug-pass').placeholder = isEdit ? 'Vacío para no cambiar' : 'Mínimo 8 caracteres';
  document.getElementById('ug-del-btn').style.display = isEdit ? '' : 'none';
  const roleEl = document.getElementById('ug-role');
  if (roleEl && user?.role) roleEl.value = user.role;
  const estEl = document.getElementById('ug-est');
  if (estEl && user?.establecimiento_id) estEl.value = user.establecimiento_id;
  openModal('modal-usuario-global');
}
async function saveUsuarioGlobalModal() {
  const id       = document.getElementById('ug-edit-id').value;
  const username = document.getElementById('ug-name').value.trim().toLowerCase();
  const pass     = document.getElementById('ug-pass').value;
  const fullname = document.getElementById('ug-fullname').value.trim();
  const role     = document.getElementById('ug-role').value;
  const estId    = document.getElementById('ug-est').value;
  if (!username) { toast('Login obligatorio','err'); return; }
  try {
    const patch = {role};
    if (fullname) patch.nombre_completo = fullname;
    if (estId) patch.establecimiento_id = estId; else patch.establecimiento_id = null;
    if (pass && pass.length >= 8) patch.password_hash = await sha256(username+':'+pass);
    if (id) {
      await dbFetch(`admins?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(patch)});
      toast('Usuario actualizado ✓','ok');
    } else {
      if (!pass || pass.length < 8) { toast('Contraseña obligatoria','err'); return; }
      patch.username = username;
      patch.password_hash = await sha256(username+':'+pass);
      await dbFetch('admins',{method:'POST',body:JSON.stringify(patch)});
      toast(`Usuario "${username}" creado ✓`,'ok');
    }
    closeModal2('modal-usuario-global');
    await loadAdminsGlobal();
  } catch(e) { toast('Error: '+(e.message.includes('duplicate')?'Login ya existe':e.message),'err'); }
}
async function deleteUsuarioGlobalModal() {
  const id = document.getElementById('ug-edit-id').value;
  const u  = document.getElementById('ug-name').value;
  if (!id || !confirm(`¿Eliminar usuario "${u}"?`)) return;
  await dbFetch(`admins?id=eq.${id}`,{method:'DELETE'});
  toast('Usuario eliminado','ok');
  closeModal2('modal-usuario-global');
  loadAdminsGlobal();
}

// ── Establecimiento: eliminar desde modal ──
function deleteEstDesdeModal() {
  const id = document.getElementById('ne-id').value;
  if (!id) return;
  closeModal2('modal-establecimiento');
  deleteEstConfirm(id);
}

function askConfirm(title, body, btnLabel, btnClass, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent  = body;
  const btn = document.getElementById('confirm-ok-btn');
  btn.textContent = btnLabel || 'Confirmar';
  btn.className   = `btn ${btnClass||'btn-primary'}`;
  _confirmCallback = cb;
  document.getElementById('confirm-modal').classList.add('open');
}
function confirmOK() {
  const cb = _confirmCallback;
  closeConfirm();
  if (cb) cb();
}
function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmCallback = null;
}

// ══════════════════════════════════════════════════════════
//  P8: MODAL QR (ficha o producto)
// ══════════════════════════════════════════════════════════
function openQRView(title, qrData, uidLabel, dlName) {
  document.getElementById('qrv-title').textContent = title;
  document.getElementById('qrv-uid').textContent   = uidLabel || '';
  const img = document.getElementById('qrv-img');
  img.innerHTML = qrData
    ? `<img src="${qrData}" style="width:220px;height:220px;display:block;border-radius:6px">`
    : '<div style="width:220px;height:220px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px">Sin QR generado</div>';
  const dlBtn = document.getElementById('qrv-dl-btn');
  dlBtn.style.display = qrData ? '' : 'none';
  dlBtn.onclick = qrData ? () => downloadQR(dlName || 'qr', qrData) : null;
  document.getElementById('qr-view-modal').classList.add('open');
}
function closeQRView() { document.getElementById('qr-view-modal').classList.remove('open'); }

// Mostrar QR de una ficha (desde botón ⬇ QR en lista)
function showFichaQR(uid, qrData) {
  openQRView(`QR · ${uid}`, qrData, uid, `ficha-${uid}`);
}

// Mostrar/generar QR de un producto
async function showProdQR(prodId) {
  const prod = productos.find(p=>p.id===prodId);
  if (!prod) return;
  if (prod.qr_data) {
    openQRView(`QR · ${prod.nombre}`, prod.qr_data, prod.nombre, `prod-${prod.nombre}`);
    return;
  }
  // Generar QR para el producto (URL pública del producto)
  const baseurl = (localStorage.getItem('sb_baseurl')||window.location.origin+window.location.pathname).replace(/\/$/,'');
  const qrUrl   = `${baseurl}?producto=${encodeURIComponent(prod.id)}`;
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
  document.body.appendChild(tmp);
  await new Promise(res => { new QRCode(tmp,{text:qrUrl,width:300,height:300,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H}); setTimeout(res,300); });
  const canvas = tmp.querySelector('canvas');
  const qrData = canvas ? canvas.toDataURL('image/png') : null;
  document.body.removeChild(tmp);
  if (qrData) {
    await dbFetch(`productos?id=eq.${prodId}`,{method:'PATCH',body:JSON.stringify({qr_data:qrData,qr_url:qrUrl})}).catch(()=>{});
    prod.qr_data = qrData;
  }
  openQRView(`QR · ${prod.nombre}`, qrData, prod.nombre, `prod-${prod.nombre}`);
}

// Editar producto (rellenar form con sus datos)
function editProducto(prodId) {
  const p = productos.find(x=>x.id===prodId);
  if (!p) return;
  document.getElementById('p-nombre').value   = p.nombre;
  document.getElementById('p-precio').value   = p.precio;
  document.getElementById('p-cad-tipo').value = p.caducidad_tipo || 'meses';
  document.getElementById('p-cad-val').value  = p.caducidad_valor || p.caducidad_meses || 3;
  if (p.caducidad_fecha_fija) document.getElementById('p-cad-fecha').value = p.caducidad_fecha_fija;
  toggleCadInput();
  // Cambiar botón para actualizar
  const btn = document.querySelector('#section-productos .card:last-child .btn-primary');
  if (btn) {
    btn.textContent = 'Actualizar producto';
    btn.onclick = () => updateProducto(prodId);
  }
  document.getElementById('section-productos').scrollIntoView({behavior:'smooth'});
}
async function updateProducto(prodId) {
  const nombre   = document.getElementById('p-nombre').value.trim();
  const precio   = parseFloat(document.getElementById('p-precio').value);
  const cadTipo  = document.getElementById('p-cad-tipo').value;
  const cadVal   = parseInt(document.getElementById('p-cad-val').value) || 3;
  const cadFecha = document.getElementById('p-cad-fecha').value || null;
  if (!nombre || isNaN(precio)) { toast('Nombre y precio obligatorios','err'); return; }
  const cadMeses = cadTipo === 'nunca' || cadTipo === 'fecha' ? null
                 : cadTipo === 'dias' ? Math.ceil(cadVal/30) : cadVal;
  try {
    const patchBody = {nombre, precio, caducidad_tipo:cadTipo,
      caducidad_valor: cadTipo !== 'nunca' && cadTipo !== 'fecha' ? (cadVal||3) : null,
      caducidad_fecha_fija: cadTipo === 'fecha' ? cadFecha : null};
    if (cadMeses !== null) patchBody.caducidad_meses = cadMeses;
    await dbFetch(`productos?id=eq.${prodId}`,{method:'PATCH',body:JSON.stringify(patchBody)});
    toast('Producto actualizado ✓','ok');
    // Resetear botón
    const btn = document.querySelector('#section-productos .card:last-child .btn-primary');
    if (btn) { btn.textContent = 'Añadir producto'; btn.onclick = addProducto; }
    document.getElementById('p-nombre').value=''; document.getElementById('p-precio').value='';
    loadProductos();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════════
//  EDITAR USUARIO (P5)
// ══════════════════════════════════════════════════════════
async function editUserModal(id, fullname, username) {
  document.getElementById('eu-id').value = id;
  document.getElementById('eu-fullname').value = fullname || '';
  document.getElementById('eu-username-label').textContent = username;
  document.getElementById('eu-pass').value = '';
  document.getElementById('eu-pass2').value = '';
  // Cargar establecimiento actual del usuario
  const estRow = document.getElementById('eu-est-row');
  const estSel = document.getElementById('eu-est');
  if (isSuperAdmin() && estRow && estSel) {
    estRow.style.display = '';
    // Obtener establecimiento_id actual
    try {
      const rows = await dbFetch(`admins?id=eq.${id}&select=establecimiento_id`);
      const currentEstId = rows?.[0]?.establecimiento_id || '';
      const opts = '<option value="">Sin establecimiento</option>' +
        (_todosEsts||[]).map(e=>`<option value="${e.id}" ${e.id===currentEstId?'selected':''}>${e.nombre}</option>`).join('');
      estSel.innerHTML = opts;
    } catch(e) {}
  } else if (estRow) {
    estRow.style.display = 'none';
  }
  document.getElementById('edit-user-modal').classList.add('open');
}
function closeEditUser() {
  document.getElementById('edit-user-modal').classList.remove('open');
}
async function saveEditUser() {
  const id       = document.getElementById('eu-id').value;
  const fullname = document.getElementById('eu-fullname').value.trim();
  const pass     = document.getElementById('eu-pass').value;
  const pass2    = document.getElementById('eu-pass2').value;
  if (!id) return;
  const patch = {};
  if (fullname) patch.nombre_completo = fullname;
  if (pass) {
    if (pass.length < 8) { toast('Mínimo 8 caracteres','err'); return; }
    if (pass !== pass2)  { toast('Las contraseñas no coinciden','err'); return; }
    // Necesitamos el username para generar el hash
    const label = document.getElementById('eu-username-label').textContent;
    patch.password_hash = await sha256(label + ':' + pass);
  }
  // Establecimiento (solo superadmin)
  if (isSuperAdmin()) {
    const estSel = document.getElementById('eu-est');
    if (estSel) patch.establecimiento_id = estSel.value || null;
  }
  if (!Object.keys(patch).length) { toast('Sin cambios','err'); return; }
  try {
    await dbFetch(`admins?id=eq.${id}`, {method:'PATCH', body:JSON.stringify(patch)});
    toast('Usuario actualizado ✓','ok');
    closeEditUser();
    loadAdmins();
    if (typeof loadAdminsGlobal === 'function') loadAdminsGlobal();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════════
//  MI CUENTA / CONFIG
// ══════════════════════════════════════════════════════════
async function changePassword() {
  const p1=document.getElementById('np1').value, p2=document.getElementById('np2').value;
  if (!p1) { toast('Introduce la contraseña','err'); return; }
  if (p1.length<8) { toast('Mínimo 8 caracteres','err'); return; }
  if (p1!==p2) { toast('No coinciden','err'); return; }
  if (!_session) return;
  try {
    const hash = await sha256(_session.username+':'+p1);
    await dbFetch(`admins?id=eq.${_session.id}`,{method:'PATCH',body:JSON.stringify({password_hash:hash})});
    // Actualizar sesión guardada si existe
    if (localStorage.getItem('saved_session')) localStorage.setItem('saved_session', JSON.stringify(_session));
    document.getElementById('np1').value=''; document.getElementById('np2').value='';
    toast('Contraseña actualizada ✓','ok');
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function saveConfig() {
  const url     = document.getElementById('cfg-url').value.trim();
  const key     = document.getElementById('cfg-key').value.trim();
  const baseurl = document.getElementById('cfg-baseurl').value.trim().replace(/\/$/,'');
  if (!url) { toast('URL obligatoria','err'); return; }
  if (!key) { toast('Anon Key obligatoria','err'); return; }
  localStorage.setItem(SB_URL_KEY, url);
  localStorage.setItem(SB_KEY_KEY, key);
  localStorage.setItem('sb_baseurl', baseurl);
  dbFetch(`config?key=eq.baseurl`,{method:'PATCH',body:JSON.stringify({value:baseurl,updated_at:new Date().toISOString()})}).catch(()=>{});
  toast('Configuración guardada ✓','ok');
}

// ══════════════════════════════════════════════════════════
//  VISTA PÚBLICA
// ══════════════════════════════════════════════════════════
async function loadPublicFicha(uid) {
  const el = document.getElementById('public-content');
  try {
    const rows = await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}&select=*,productos(nombre,precio,caducidad_meses),establecimientos(nombre,direccion,maps_link)`);
    if (!rows || rows.length===0) {
      el.innerHTML=`<div class="pub-hero"><div class="pub-logo">Fichas <span>·</span> Admisión</div>
        <span class="pub-ico">❓</span><div class="pub-prod">Ficha no encontrada</div>
        <div class="pub-uid">${uid}</div></div>
        <div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">Este UID no existe en el sistema</div>`;
      return;
    }
    renderPublicFicha(rows[0], el);
  } catch(e) {
    el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--danger);font-size:12px">Error: ${e.message}</div>`;
  }
}

function renderPublicFicha(f, el) {
  const banners = {
    emitida: {cls:'pb-emitida',  ico:'🪙', title:'Ficha emitida',        sub:'Esta ficha todavía no ha sido vendida'},
    vendida: {cls:'pb-vendida',  ico:'🎫', title:'¡Lista para usar!',     sub:'Presenta esta ficha para canjearla'},
    usada:   {cls:'pb-usada',    ico:'✅', title:'Ficha ya utilizada',     sub:'Esta ficha ya ha sido canjeada'},
    caducada:{cls:'pb-caducada', ico:'⏰', title:'Ficha caducada',         sub:'El periodo de validez ha expirado'},
  };
  const b = banners[f.estado]||banners.emitida;
  const est = f.establecimientos;

  let diasRestantes=null, pct=0;
  if (f.fecha_venta && f.fecha_caducidad && f.estado==='vendida') {
    const total = new Date(f.fecha_caducidad)-new Date(f.fecha_venta);
    const rest  = new Date(f.fecha_caducidad)-Date.now();
    diasRestantes = Math.max(0, Math.ceil(rest/86400000));
    pct = Math.max(0, Math.min(100, (rest/total)*100));
  }
  const urg = diasRestantes!==null && diasRestantes<=7;

  el.innerHTML = `
    <div class="pub-hero">
      <div class="pub-logo">Fichas <span>·</span> Admisión</div>
      <span class="pub-ico">${ICONS[f.estado]||'🪙'}</span>
      <div class="pub-prod">${f.productos?.nombre||'Consumición'}</div>
      <div class="pub-val">${f.valor}€</div>
      <div class="pub-uid">${f.uid}</div>
    </div>

    ${est ? `<div class="pub-est">
      <div class="pub-est-ico">🏪</div>
      <div>
        <div class="pub-est-name">${est.nombre}</div>
        ${est.direccion?`<div class="pub-est-addr">📍 ${est.direccion}</div>`:''}
        ${est.maps_link?`<a href="${est.maps_link}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none;margin-top:4px;display:inline-block">🗺 Ver en Google Maps</a>`:''}
      </div>
    </div>` : ''}

    <div class="pub-banner ${b.cls}">
      <span style="font-size:22px">${b.ico}</span>
      <div><div class="pb-title">${b.title}</div><div class="pb-sub">${b.sub}</div></div>
    </div>

    ${diasRestantes!==null?`<div class="bar-wrap">
      <div class="bar-top">
        <span class="bar-lbl">Validez restante</span>
        <span class="bar-dias ${urg?'urg':''}">${diasRestantes} día${diasRestantes!==1?'s':''}</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${urg?'urg':''}" style="width:${pct}%"></div></div>
    </div>`:''}

    <div class="pub-dates">
      <div class="pub-dates-title">Información</div>
      ${f.fecha_emision?`<div class="drow"><div class="drow-ico">📅</div><span class="drow-lbl">Emitida</span><span class="drow-val">${fmtDateLong(f.fecha_emision)}</span></div>`:''}
      ${f.fecha_venta?`<div class="drow"><div class="drow-ico">💰</div><span class="drow-lbl">Comprada</span><span class="drow-val">${fmtDateLong(f.fecha_venta)}</span></div>`:''}
      ${f.fecha_caducidad?`<div class="drow"><div class="drow-ico" style="${urg?'background:rgba(232,74,74,.15)':''}">⏳</div><span class="drow-lbl">Válida hasta</span><span class="drow-val" style="${urg?'color:var(--danger)':''}">${fmtDateLong(f.fecha_caducidad)}</span></div>`:''}
      ${(f.fecha_canje||f.fecha_uso)?`<div class="drow"><div class="drow-ico">✅</div><span class="drow-lbl">Canjeada</span><span class="drow-val">${fmtDateLong(f.fecha_canje||f.fecha_uso)}</span></div>`:''}
    </div>

    <div class="pub-footer">Fichas <strong>·</strong> Admisión</div>
    <div style="text-align:center;padding:16px 0 8px">
      <button onclick="openAdminFromPublic('${f.uid}')" style="background:none;border:none;cursor:pointer;color:var(--border);font-family:'DM Mono';font-size:11px;padding:8px 16px" onmouseover="this.style.color='var(--muted)'" onmouseout="this.style.color='var(--border)'">🔐 admin</button>
    </div>`;
}

function openAdminFromPublic(uid) {
  document.getElementById('public-view').style.display='none';
  document.getElementById('l-sub').textContent = 'Credenciales para gestionar fichas';
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('show');
  // Al hacer login desde vista pública, redirigir a buscar con ese uid
  overlay.dataset.fromUid = uid;
  setTimeout(()=>document.getElementById('l-user').focus(),100);
}

// Modificar submitLogin para manejar fromUid
const _origSubmitLogin = submitLogin;
// Patch para fromUid
document.getElementById('login-overlay').addEventListener('submit', e=>e.preventDefault());

// ══════════════════════════════════════════════════════════
//  P6: TOGGLE CADUCIDAD INPUT
// ══════════════════════════════════════════════════════════
