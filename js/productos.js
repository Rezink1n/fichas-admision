async function loadProductos() {
  try {
    let q = 'productos?activo=eq.true&order=establecimiento_id.asc,precio.asc&select=*';
    if (!isSuperAdmin() && _session?.establecimiento_id)
      q += `&establecimiento_id=eq.${_session.establecimiento_id}`;
    productos = await dbFetch(q) || [];
    renderProductos(); renderGenSelect();
  } catch(e) {
    document.getElementById('productos-list').innerHTML = `<div style="color:var(--danger);font-size:12px">Error: ${e.message}</div>`;
  }
}

function renderProductos() {
  const el = document.getElementById('productos-list');
  if (!productos.length) { el.innerHTML='<div style="color:var(--muted);font-size:12px">Sin productos</div>'; return; }
  const fmtCad = p => {
    const t = p.caducidad_tipo;
    if (t === 'nunca') return 'Sin caducidad';
    if (t === 'fecha' && p.caducidad_fecha_fija) return `Hasta ${new Date(p.caducidad_fecha_fija).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'})}`;
    if (t === 'dias')  return `${p.caducidad_valor||'?'} días desde la venta`;
    return `${p.caducidad_valor||p.caducidad_meses||'?'} meses desde la venta`;
  };
  const productoRow = p => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        <span style="flex:1;font-size:13px;font-weight:600">${p.nombre}</span>
        <span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--accent)">${p.precio}€</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">⏱ ${fmtCad(p)}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="showProdQR('${p.id}')" style="font-size:10px;padding:4px 8px">📱 QR</button>
        <button class="btn btn-secondary btn-sm" onclick="editProducto('${p.id}')" style="font-size:10px;padding:4px 8px">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleProducto('${p.id}',false)" style="font-size:10px;padding:4px 8px">✕</button>
      </div>
    </div>`;

  if (isSuperAdmin()) {
    const filtEst = document.getElementById('prod-est-filter')?.value || 'all';
    let filtrados = filtEst === 'all' ? productos : productos.filter(p => p.establecimiento_id === filtEst || (!p.establecimiento_id && filtEst === '__sin__'));
    const grupos = {};
    filtrados.forEach(p => {
      const key = p.establecimiento_id || '__sin__';
      const est = _todosEsts?.find(e=>e.id===p.establecimiento_id);
      const nom = est?.nombre || 'Sin establecimiento';
      if (!grupos[key]) grupos[key] = {nombre: nom, prods: []};
      grupos[key].prods.push(p);
    });
    el.innerHTML = Object.values(grupos).map(g => `
      <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px">
        🏪 ${g.nombre}
      </div>
      ${g.prods.map(productoRow).join('')}
    `).join('') || '<div style="color:var(--muted);font-size:12px">Sin productos</div>';
  } else {
    el.innerHTML = productos.map(productoRow).join('');
  }
}

function renderGenSelect() {
  document.getElementById('gen-producto').innerHTML =
    productos.map(p=>`<option value="${p.id}">${p.nombre} — ${p.precio}€</option>`).join('');
}

async function addProducto() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const precio = parseFloat(document.getElementById('p-precio').value);
  const cadTipo  = document.getElementById('p-cad-tipo').value;
  const cadVal   = parseInt(document.getElementById('p-cad-val').value) || 3;
  const cadFecha = document.getElementById('p-cad-fecha').value || null;
  if (!nombre || isNaN(precio)) { toast('Nombre y precio obligatorios','err'); return; }
  try {
    const cadMeses = cadTipo === 'nunca' ? null : cadTipo === 'fecha' ? null : cadTipo === 'dias' ? Math.ceil(cadVal/30) : cadVal;
    const body = { nombre, precio, caducidad_meses: cadMeses, caducidad_tipo: cadTipo, caducidad_valor: cadVal, caducidad_fecha: cadFecha };
    if (_session?.establecimiento_id) body.establecimiento_id = _session.establecimiento_id;
    await dbFetch('productos', {method:'POST', body:JSON.stringify(body)});
    document.getElementById('p-nombre').value=''; document.getElementById('p-precio').value='';
    toast('Producto añadido ✓','ok'); loadProductos();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

async function toggleProducto(id, activo) {
  // Si se intenta desactivar, verificar que no haya fichas emitidas con este producto
  if (!activo) {
    try {
      const emitidas = await dbFetch(`fichas?producto_id=eq.${id}&estado=eq.emitida&select=id&limit=1`);
      if (emitidas && emitidas.length > 0) {
        toast('No se puede eliminar: hay fichas emitidas con este producto','err');
        return;
      }
    } catch(e) { toast('Error: '+e.message,'err'); return; }
  }
  try { await dbFetch(`productos?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({activo})}); loadProductos(); }
  catch(e) { toast('Error: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════════
//  GENERAR FICHA
// ══════════════════════════════════════════════════════════
async function generarFicha() {
  const prodId = document.getElementById('gen-producto').value;
  const prod = productos.find(p=>p.id===prodId);
  if (!prod) { toast('Selecciona un producto','err'); return; }
  const customUid = document.getElementById('gen-uid').value.trim();
  const uid = customUid || 'F-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
  const baseurl = (localStorage.getItem('sb_baseurl')||window.location.origin+window.location.pathname).replace(/\/$/,'');
  const qrUrl = `${baseurl}?uid=${encodeURIComponent(uid)}`;
  try {
    // Snapshot del producto en el momento de emisión (inmutable)
    const productoSnap = JSON.stringify({
      nombre: prod.nombre, precio: prod.precio,
      caducidad_tipo: prod.caducidad_tipo, caducidad_valor: prod.caducidad_valor,
      caducidad_meses: prod.caducidad_meses, caducidad_fecha_fija: prod.caducidad_fecha_fija || null
    });
    const body = {uid, producto_id:prodId, valor:prod.precio, estado:'emitida', producto_snapshot: productoSnap};
    if (_session?.establecimiento_id) body.establecimiento_id = _session.establecimiento_id;
    await dbFetch('fichas', {method:'POST', body:JSON.stringify(body)});
    // Generar QR
    const tmp = document.createElement('div');
    tmp.style.cssText='position:absolute;left:-9999px;top:-9999px';
    document.body.appendChild(tmp);
    await new Promise(res=>{ new QRCode(tmp,{text:qrUrl,width:300,height:300,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H}); setTimeout(res,300); });
    const canvas = tmp.querySelector('canvas');
    const qrData = canvas ? canvas.toDataURL('image/png') : null;
    document.body.removeChild(tmp);
    if (qrData) await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}`,{method:'PATCH',body:JSON.stringify({qr_data:qrData})});
    // Modal QR
    const estNombre = (await dbFetch(`establecimientos?id=eq.${_session?.establecimiento_id}&select=nombre`).catch(()=>[]))?.[0]?.nombre || '';
    document.getElementById('qr-content').innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:800;margin-bottom:2px">${uid}</div>
        <div style="color:var(--muted);font-size:12px">${prod.nombre} · ${prod.precio}€</div>
        ${estNombre ? `<div style="color:var(--accent);font-size:11px;margin-top:2px">🏪 ${estNombre}</div>` : ''}
        <div style="color:var(--muted);font-size:10px;margin-top:4px;word-break:break-all">${qrUrl}</div>
      </div>
      ${qrData?`<div style="background:#fff;padding:14px;border-radius:8px;display:inline-block;margin-bottom:14px"><img src="${qrData}" style="width:190px;height:190px;display:block"></div>`:''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${qrData?`<button class="btn btn-primary btn-sm" onclick="downloadQR('${uid}',\`${qrData}\`)">⬇ Descargar</button>`:''}
        ${qrData?`<button class="btn btn-secondary btn-sm" onclick="printQR('${uid}',\`${qrData}\`)">🖨 Imprimir</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="closeQRModal()">Cerrar</button>
      </div>`;
    document.getElementById('qr-modal').classList.add('open');
    toast('Ficha emitida ✓','ok');
    document.getElementById('gen-uid').value='';
    reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function closeQRModal() { document.getElementById('qr-modal').classList.remove('open'); }
function downloadQR(uid, data) { if(!data)return; const a=document.createElement('a'); a.href=data; a.download=`ficha-${uid}.png`; a.click(); }
function printQR(uid, data) {
  if(!data)return;
  const w=window.open('','_blank');
  w.document.write(`<html><body style="text-align:center;padding:40px;font-family:monospace"><img src="${data}" style="width:220px;display:block;margin:0 auto 12px"><div style="font-size:15px;font-weight:bold">${uid}</div></body></html>`);
  w.document.close(); w.onload=()=>w.print();
}

// ══════════════════════════════════════════════════════════
//  ESTABLECIMIENTOS
// ══════════════════════════════════════════════════════════
