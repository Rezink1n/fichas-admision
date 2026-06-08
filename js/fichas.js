function clearBuscar() {
  document.getElementById('uid-input').value = '';
  document.getElementById('buscar-result').innerHTML = '';
}

async function buscarFicha(uidParam) {
  const uid = uidParam || document.getElementById('uid-input').value.trim();
  if (!uid) { toast('Introduce un UID', 'err'); return; }
  const el = document.getElementById('buscar-result');
  el.innerHTML = `<div class="loader"><div class="spin"></div> Buscando…</div>`;
  try {
    const rows = await dbFetch(
      `fichas?uid=eq.${encodeURIComponent(uid)}&select=*,productos(nombre),establecimientos(nombre,direccion,maps_link),vendido_por(username,nombre_completo),canjeado_por(username,nombre_completo)`
    );
    if (!rows || rows.length === 0) {
      el.innerHTML = `<div style="padding:24px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">✗</div>
        <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--danger)">Ficha no encontrada</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${uid}</div>
      </div>`; return;
    }
    renderBuscarResult(rows[0], el);
  } catch(e) {
    el.innerHTML = `<div style="padding:20px;color:var(--danger);font-size:12px">Error: ${e.message}</div>`;
  }
}

const ICONS = {emitida:'🪙',vendida:'🎫',usada:'✅',caducada:'⏰',archivo:'📦'};

// P2: ver trazabilidad solo si es superadmin o admin del mismo establecimiento
function canVerTrazab(f) {
  if (!_session || !isAdmin()) return false;
  if (isSuperAdmin()) return true;
  return f.establecimiento_id === _session.establecimiento_id;
}

function renderBuscarResult(f, el) {
  const mismEst = isSuperAdmin() ||
    !_session?.establecimiento_id ||
    !f.establecimiento_id ||
    f.establecimiento_id === _session.establecimiento_id;
  const canVender = f.estado === 'emitida' && _session && mismEst;
  const canUsar   = f.estado === 'vendida' && _session && mismEst;
  el.innerHTML = `
    <div class="card">
      <div style="padding:14px 16px;background:var(--surface2);display:flex;align-items:center;justify-content:space-between">
        <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700">${ICONS[f.estado]||'🪙'} ${f.uid}</span>
        <span class="badge b-${f.estado}">${f.estado.toUpperCase()}</span>
      </div>
      <div style="padding:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          ${(()=>{
            const snap = f.producto_snapshot ? JSON.parse(f.producto_snapshot) : null;
            // Priorizar snapshot: inmutable desde la emisión
            const pNombre = (f.estado !== 'emitida' && snap?.nombre) ? snap.nombre : (f.productos?.nombre || snap?.nombre || '—');
            return `<div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Valor</div>
            <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:var(--accent)">${f.valor}€</div></div>
          <div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Producto</div>
            <div style="font-size:13px">${pNombre}</div></div>`;
          })()}
          <div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Establecimiento</div>
            <div style="font-size:12px;font-weight:600">${f.establecimientos?.nombre||'—'}</div>
            ${f.establecimientos?.direccion?`<div style="font-size:11px;color:var(--muted);margin-top:2px">📍 ${f.establecimientos.direccion}</div>`:''}
            ${f.establecimientos?.maps_link?`<a href="${f.establecimientos.maps_link}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;display:inline-block;margin-top:3px">🗺 Ver en Maps</a>`:''}
          </div>
          <div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Caduca</div>
            <div style="font-size:12px">${fmtDate(f.fecha_caducidad)||'Sin caducidad'}</div></div>
          ${f.fecha_canje?`<div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Canjeada</div><div style="font-size:12px;color:var(--accent2)">${fmtDate(f.fecha_canje)}</div></div>`:''}
          ${canVerTrazab(f) && (f.vendido_por || f.vendido_por_nombre) ? `<div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Vendida por</div><div style="font-size:12px">${f.vendido_por?.nombre_completo||f.vendido_por?.username||f.vendido_por_nombre||'—'}</div></div>` : ''}
          ${canVerTrazab(f) && (f.canjeado_por || f.canjeado_por_nombre) ? `<div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Canjeada por</div><div style="font-size:12px">${f.canjeado_por?.nombre_completo||f.canjeado_por?.username||f.canjeado_por_nombre||'—'}</div></div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${canVender ? `<button class="btn btn-primary btn-sm" data-uid="${f.uid}" data-valor="${f.valor}" data-nombre="${(f.productos?.nombre||'').replace(/"/g,'&quot;')}" onclick="venderFichaConfirm(this.dataset.uid,this.dataset.valor,this.dataset.nombre)">💰 Vender</button>` : ''}
          ${canUsar   ? `<button class="btn btn-success btn-sm" data-uid="${f.uid}" data-valor="${f.valor}" data-nombre="${(f.productos?.nombre||'').replace(/"/g,'&quot;')}" onclick="usarFichaConfirm(this.dataset.uid,this.dataset.valor,this.dataset.nombre)">✓ Usar</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="clearBuscar()">✕ Cerrar</button>
        </div>
      </div>
    </div>`;
}

async function venderFicha(uid) {
  try {
    const rows = await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}&select=*,productos(*),establecimientos(*)`);
    const f = rows[0];
    if (!isSuperAdmin() && _session?.establecimiento_id && f.establecimiento_id &&
        f.establecimiento_id !== _session.establecimiento_id) {
      toast('Esta ficha pertenece a otro establecimiento','err'); return;
    }
    // Usar snapshot guardado al emitir, o construir desde join
    const p = f.producto_snapshot ? JSON.parse(f.producto_snapshot) : (f.productos || {});
    const e = f.establecimientos || {};
    // Snapshot establecimiento (si no existe)
    const estSnapshot = f.est_snapshot || JSON.stringify({
      nombre:e.nombre, direccion:e.direccion, maps_link:e.maps_link, id:e.id
    });
    // Calcular caducidad desde snapshot
    const cadTipo  = p.caducidad_tipo || 'meses';
    const cadVal   = p.caducidad_valor || p.caducidad_meses || 3;
    const cadFecha = p.caducidad_fecha_fija || null;
    let cad = null;
    if (cadTipo === 'fecha' && cadFecha) {
      cad = new Date(cadFecha + 'T23:59:59');
    } else if (cadTipo !== 'nunca') {
      cad = new Date();
      if (cadTipo === 'dias') cad.setDate(cad.getDate() + cadVal);
      else                    cad.setMonth(cad.getMonth() + cadVal);
    }
    const nombreSnap = _session?.nombre_completo || _session?.username || null;
    await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}`, {
      method:'PATCH', body:JSON.stringify({
        estado:'vendida',
        fecha_venta: new Date().toISOString(),
        fecha_caducidad: cad ? cad.toISOString() : null,
        vendido_por: _session?.id || null,
        vendido_por_nombre: nombreSnap,
        est_snapshot: estSnapshot
      })
    });
    toast('Ficha vendida ✓','ok');
    // P2: renovar ventanita con datos actualizados
    await buscarFicha(uid);
    reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function venderFichaConfirm(uid, valor, nombre) {
  askConfirm(
    "💰 Confirmar venta",
    "¿Vender la ficha " + uid + "?\n" + (nombre||"") + " · " + (valor||"") + "€",
    "Sí, vender", "btn-primary",
    function() { venderFicha(uid); }
  );
}
function usarFichaConfirm(uid, valor, nombre) {
  askConfirm(
    "✓ Confirmar canje",
    "¿Canjear la ficha " + uid + "?\n" + (nombre||"") + " · " + (valor||"") + "€\n\nEsta acción no se puede deshacer.",
    "Sí, canjear", "btn-success",
    function() { usarFicha(uid); }
  );
}
async function usarFicha(uid) {
  try {
    const rows = await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}&select=*,productos(*),establecimientos(*)`);
    const f = rows?.[0];
    if (!isSuperAdmin() && _session?.establecimiento_id && f?.establecimiento_id &&
        f.establecimiento_id !== _session.establecimiento_id) {
      toast('Esta ficha pertenece a otro establecimiento','err'); return;
    }
    const p = f?.productos || {};
    const e = f?.establecimientos || {};
    // Snapshots completos (usar existente o construir)
    const productoSnap = f.producto_snapshot || JSON.stringify({
      nombre:p.nombre, precio:p.precio,
      caducidad_tipo:p.caducidad_tipo, caducidad_valor:p.caducidad_valor,
      caducidad_meses:p.caducidad_meses, caducidad_fecha_fija:p.caducidad_fecha_fija
    });
    const estSnap = f.est_snapshot || JSON.stringify({
      nombre:e.nombre, direccion:e.direccion, maps_link:e.maps_link, id:e.id
    });
    const nombreSnap = _session?.nombre_completo || _session?.username || null;
    const ahora = new Date().toISOString();
    await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}`, {
      method:'PATCH', body:JSON.stringify({
        estado:'usada',
        fecha_uso: ahora,
        fecha_canjeado: ahora,
        qr_data: null,
        canjeado_por: _session?.id || null,
        canjeado_por_nombre: nombreSnap,
        producto_snapshot: productoSnap,
        est_snapshot: estSnap
      })
    });
    toast('Ficha canjeada ✓','ok');
    // P2: renovar ventanita con datos actualizados
    await buscarFicha(uid);
    reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════════
//  BASE DE DATOS
// ══════════════════════════════════════════════════════════
let allFichas = [], currentFilter = 'all', currentEstFilter = 'all';

async function reloadFichas() {
  document.getElementById('fichas-list').innerHTML = '<div class="loader"><div class="spin"></div> Cargando…</div>';
  try {
    let q = 'fichas?select=*,productos(nombre),establecimientos(nombre,direccion,maps_link),vendido_por(username,nombre_completo),canjeado_por(username,nombre_completo)&order=created_at.desc';
    if (!isSuperAdmin() && _session?.establecimiento_id)
      q += `&establecimiento_id=eq.${_session.establecimiento_id}`;
    allFichas = await dbFetch(q) || [];
    // también traer los snapshots
    updateStats(); renderFichas();
  } catch(e) {
    document.getElementById('fichas-list').innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function updateStats() {
  const activas = allFichas.filter(f=>f.estado!=='archivo');
  document.getElementById('s-total').textContent = activas.length;
  document.getElementById('s-vend').textContent  = activas.filter(f=>f.estado==='vendida').length;
  document.getElementById('s-usad').textContent  = activas.filter(f=>f.estado==='usada').length;
  document.getElementById('s-cad').textContent   = activas.filter(f=>f.estado==='caducada').length;
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.fbtn:not(.fbtn-est)').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); renderFichas();
}
function setEstFilter(estId, btn) {
  currentEstFilter = estId;
  document.querySelectorAll('.fbtn-est').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); renderFichas();
}

function fichaCardHTML(f) {
  return `<div class="fcard" onclick="showDetail('${f.uid}')">
    <div class="fcard-ico">${ICONS[f.estado]||'🪙'}</div>
    <div class="fcard-info">
      <div class="fcard-uid">${f.uid}</div>
      <div class="fcard-meta">${(f.estado!=='emitida'&&f.producto_snapshot)?JSON.parse(f.producto_snapshot).nombre:(f.productos?.nombre||'—')} · ${f.establecimientos?.nombre||(f.est_snapshot?JSON.parse(f.est_snapshot).nombre:'')||''} · ${fmtDate(f.created_at)}</div>
    </div>
    <div class="fcard-right">
      <div class="fcard-val">${f.valor}€</div>
      <span class="badge b-${f.estado}" style="font-size:8px">${f.estado}</span>
    </div>
  </div>`;
}

function renderFichas() {
  const q = (document.getElementById('fichas-search')?.value||'').toLowerCase();
  let list = allFichas;
  if (currentFilter !== 'all') list = list.filter(f=>f.estado===currentFilter);
  if (currentEstFilter !== 'all') list = list.filter(f=>f.establecimiento_id===currentEstFilter || (!f.establecimiento_id && currentEstFilter==='__sin__'));
  if (q) list = list.filter(f=>f.uid.toLowerCase().includes(q));
  if (!list.length) { document.getElementById('fichas-list').innerHTML='<div class="empty">Sin fichas</div>'; return; }

  if (isSuperAdmin()) {
    // Agrupar por establecimiento
    const grupos = {};
    list.forEach(f => {
      const key = f.establecimiento_id || '__sin__';
      const nom = f.establecimientos?.nombre || 'Sin establecimiento';
      if (!grupos[key]) grupos[key] = {nombre: nom, fichas: []};
      grupos[key].fichas.push(f);
    });
    document.getElementById('fichas-list').innerHTML = Object.values(grupos).map(g => `
      <div style="padding:10px 20px 4px;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);border-top:1px solid var(--border);margin-top:6px">
        🏪 ${g.nombre} <span style="color:var(--muted);font-weight:400">(${g.fichas.length})</span>
      </div>
      ${g.fichas.map(fichaCardHTML).join('')}
    `).join('');
  } else {
    document.getElementById('fichas-list').innerHTML = list.map(fichaCardHTML).join('');
  }
}

function showDetail(uid) {
  const f = allFichas.find(x=>x.uid===uid); if(!f) return;
  const mismEst2 = isSuperAdmin() ||
    !_session?.establecimiento_id ||
    !f.establecimiento_id ||
    f.establecimiento_id === _session.establecimiento_id;
  const canVender = f.estado==='emitida' && mismEst2;
  const canUsar   = f.estado==='vendida' && mismEst2;
  document.getElementById('modal-content').innerHTML = `
    <h2>${f.uid}</h2>
    <span class="badge b-${f.estado}" style="margin-bottom:14px;display:inline-block">${f.estado.toUpperCase()}</span>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><div style="font-size:9px;color:var(--muted);margin-bottom:3px">VALOR</div><div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--accent)">${f.valor}€</div></div>
      <div><div style="font-size:9px;color:var(--muted);margin-bottom:3px">PRODUCTO</div><div style="font-size:12px">${(f.estado!=='emitida'&&f.producto_snapshot)?JSON.parse(f.producto_snapshot).nombre:(f.productos?.nombre||'—')}</div></div>
      <div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);margin-bottom:3px">ESTABLECIMIENTO</div>
        <div style="font-size:12px;font-weight:600">${(()=>{const s=f.est_snapshot?JSON.parse(f.est_snapshot):{};return f.establecimientos?.nombre||s.nombre||'—';})()}${f.est_snapshot?' <span style="font-size:9px;color:var(--muted)">(archivo)</span>':''}</div>
        ${(()=>{const d=f.establecimientos?.direccion||(f.est_snapshot?JSON.parse(f.est_snapshot).direccion:'');return d?`<div style="font-size:11px;color:var(--muted);margin-top:1px">📍 ${d}</div>`:''})()}
        ${(()=>{const m=f.establecimientos?.maps_link||(f.est_snapshot?JSON.parse(f.est_snapshot).maps_link:'');return m?`<a href="${m}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none">🗺 Ver en Maps</a>`:''})()}
      </div>
      <div><div style="font-size:9px;color:var(--muted);margin-bottom:3px">EMITIDA</div><div style="font-size:12px">${fmtDate(f.fecha_emision)}</div></div>
      <div><div style="font-size:9px;color:var(--muted);margin-bottom:3px">VENDIDA</div><div style="font-size:12px">${fmtDate(f.fecha_venta)}</div></div>
      <div><div style="font-size:9px;color:var(--muted);margin-bottom:3px">CADUCA</div><div style="font-size:12px">${fmtDate(f.fecha_caducidad)}</div></div>
      ${f.fecha_canjeado ? `<div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);margin-bottom:3px">CANJEADA</div><div style="font-size:12px;color:var(--accent2)">${fmtDate(f.fecha_canjeado)}</div></div>` : ''}
      ${canVerTrazab(f) && (f.vendido_por || f.vendido_por_nombre) ? `<div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);margin-bottom:3px">VENDIDA POR</div><div style="font-size:12px">${f.vendido_por?.nombre_completo||f.vendido_por?.username||f.vendido_por_nombre||'—'}</div></div>` : ''}
      ${canVerTrazab(f) && (f.canjeado_por || f.canjeado_por_nombre) ? `<div style="grid-column:span 2"><div style="font-size:9px;color:var(--muted);margin-bottom:3px">CANJEADA POR</div><div style="font-size:12px">${f.canjeado_por?.nombre_completo||f.canjeado_por?.username||f.canjeado_por_nombre||'—'}</div></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${canVender?`<button class="btn btn-primary btn-sm" data-uid="${f.uid}" data-valor="${f.valor}" data-nombre="${(f.productos?.nombre||'').replace(/"/g,'&quot;')}" onclick="venderFichaConfirm(this.dataset.uid,this.dataset.valor,this.dataset.nombre)">💰 Vender</button>`:''}
      ${canUsar?`<button class="btn btn-success btn-sm" data-uid="${f.uid}" data-valor="${f.valor}" data-nombre="${(f.productos?.nombre||'').replace(/"/g,'&quot;')}" onclick="usarFichaConfirm(this.dataset.uid,this.dataset.valor,this.dataset.nombre)">✓ Usar</button>`:''}
      ${f.qr_data&&f.estado!=='usada'?`<button class="btn btn-secondary btn-sm" onclick="showFichaQR('${f.uid}','${f.qr_data}')">📱 QR</button>`:''}
      ${f.estado==='emitida'&&isAdmin()?`<button class="btn btn-secondary btn-sm" onclick="showCambiarProducto('${f.id}','${f.uid}')">✏️ Producto</button>`:''}
      ${(isSuperAdmin()||(f.estado==='emitida'&&isAdmin()))?`<button class="btn btn-danger btn-sm" onclick="deleteFicha('${f.id}')">🗑</button>`:''}
      <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cerrar</button>
    </div>`;
  document.getElementById('detail-modal').classList.add('open');
}

async function deleteFicha(id) {
  const f = allFichas.find(x=>x.id===id);
  if (!isSuperAdmin() && f && f.estado !== 'emitida') {
    toast('Solo superadmin puede eliminar fichas no emitidas','err'); return;
  }
  if (!confirm('¿Eliminar esta ficha?')) return;
  try {
    await dbFetch(`fichas?id=eq.${id}`, {method:'DELETE'});
    toast('Eliminada','ok'); closeModal(); reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function showCambiarProducto(fichaId, uid) {
  closeModal();
  // Crear overlay dinámico
  let o = document.getElementById('cambiar-prod-overlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'cambiar-prod-overlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.8);display:flex;align-items:flex-end';
    o.onclick = () => o.style.display='none';
    document.body.appendChild(o);
  }
  const opts = productos.map(p=>`<option value="${p.id}" data-precio="${p.precio}" data-snap='${JSON.stringify({nombre:p.nombre,precio:p.precio,caducidad_tipo:p.caducidad_tipo,caducidad_valor:p.caducidad_valor,caducidad_meses:p.caducidad_meses,caducidad_fecha_fija:p.caducidad_fecha_fija||null})}'>${p.nombre} — ${p.precio}€</option>`).join('');
  o.innerHTML = `
    <div style="width:100%;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);padding:24px" onclick="event.stopPropagation()">
      <div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 18px"></div>
      <h2 style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;margin-bottom:14px">✏️ Cambiar producto</h2>
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Ficha: <strong style="color:var(--accent)">${uid}</strong></div>
      <div class="frow"><label>Nuevo producto</label><select class="input" id="cp-select">${opts}</select></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmarCambioProducto('${fichaId}')">Guardar</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cambiar-prod-overlay').style.display='none'">Cancelar</button>
      </div>
    </div>`;
  o.style.display = 'flex';
}

async function confirmarCambioProducto(fichaId) {
  const sel = document.getElementById('cp-select');
  const opt = sel.options[sel.selectedIndex];
  const prodId = sel.value;
  const precio = parseFloat(opt.dataset.precio);
  const snap   = opt.dataset.snap;
  try {
    await dbFetch(`fichas?id=eq.${fichaId}`, {
      method:'PATCH', body:JSON.stringify({
        producto_id: prodId, valor: precio, producto_snapshot: snap
      })
    });
    document.getElementById('cambiar-prod-overlay').style.display='none';
    toast('Producto actualizado ✓','ok');
    reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function closeModal() { document.getElementById('detail-modal').classList.remove('open'); }

// ══════════════════════════════════════════════════════════
//  PRODUCTOS
// ══════════════════════════════════════════════════════════
let productos = [];

