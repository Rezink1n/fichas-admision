async function loadProductos() {
  try {
    let q = 'productos?activo=eq.true&order=precio.asc&select=*';
    // Siempre filtrar por establecimiento del usuario (incluyendo superadmin en tab Test)
    if (_session?.establecimiento_id)
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
        <button class="btn btn-secondary btn-sm" onclick="openProductoModalById('${p.id}')" data-pid="${p.id}" style="font-size:10px;padding:4px 8px">✏️</button>
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
// Genera QR como dataURL
async function generarQR(uid) {
  const baseurl = (localStorage.getItem('sb_baseurl')||window.location.origin+window.location.pathname).replace(/\/$/,'');
  const qrUrl   = `${baseurl}?uid=${encodeURIComponent(uid)}`;
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
  document.body.appendChild(tmp);
  await new Promise(res => { new QRCode(tmp,{text:qrUrl,width:300,height:300,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H}); setTimeout(res,300); });
  const canvas = tmp.querySelector('canvas');
  const qrData = canvas ? canvas.toDataURL('image/png') : null;
  document.body.removeChild(tmp);
  return {qrData, qrUrl};
}

async function generarFicha() { return generarFichas(); }

async function generarFichas() {
  const prodId   = document.getElementById('gen-producto').value;
  const prod     = productos.find(p=>p.id===prodId);
  if (!prod) { toast('Selecciona un producto','err'); return; }
  const cantidad  = Math.max(1, Math.min(100, parseInt(document.getElementById('gen-cantidad')?.value)||1));
  const customUid = document.getElementById('gen-uid').value.trim();
  const productoSnap = JSON.stringify({
    nombre:prod.nombre, precio:prod.precio,
    caducidad_tipo:prod.caducidad_tipo, caducidad_valor:prod.caducidad_valor,
    caducidad_meses:prod.caducidad_meses, caducidad_fecha_fija:prod.caducidad_fecha_fija||null
  });
  const estRows = await dbFetch(`establecimientos?id=eq.${_session?.establecimiento_id}&select=nombre`).catch(()=>[]);
  const estNombre = estRows?.[0]?.nombre || '';
  const fichasEmitidas = [];
  closeModal2('modal-emitir'); // cerrar antes de empezar
  toast(`Emitiendo ${cantidad} ficha${cantidad>1?'s':''}...`,'');
  try {
    for (let i=0; i<cantidad; i++) {
      const uid = (cantidad===1 && customUid) ? customUid
        : 'F-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
      const body = {uid, producto_id:prodId, valor:prod.precio, estado:'emitida', producto_snapshot:productoSnap};
      if (_session?.establecimiento_id) body.establecimiento_id = _session.establecimiento_id;
      await dbFetch('fichas',{method:'POST',body:JSON.stringify(body)});
      const {qrData, qrUrl} = await generarQR(uid);
      if (qrData) await dbFetch(`fichas?uid=eq.${encodeURIComponent(uid)}`,{method:'PATCH',body:JSON.stringify({qr_data:qrData})});
      fichasEmitidas.push({uid, qrData, qrUrl});
    }
    window._lastFichas = fichasEmitidas.map(f=>({...f, prodNombre:prod.nombre, precio:prod.precio, estNombre}));
    const content = document.getElementById('qr-content');
    content.innerHTML = `
      <div style="margin-bottom:10px">
        <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700">✓ ${fichasEmitidas.length} ficha${fichasEmitidas.length>1?'s emitidas':' emitida'}</div>
        <div style="font-size:11px;color:var(--muted)">${prod.nombre} · ${prod.precio}€ ${estNombre?'· '+estNombre:''}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${fichasEmitidas.map(f=>`
          <div style="text-align:center;background:#fff;border-radius:6px;padding:6px;cursor:pointer" onclick="downloadQR('${f.uid}','${f.qrData}')">
            <img src="${f.qrData}" style="width:38px;height:38px;display:block">
            <div style="font-size:6px;color:#333;margin-top:2px;width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${f.uid}</div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="imprimirTodasFichas()">🖨 Imprimir todas</button>
        ${fichasEmitidas.length===1?`<button class="btn btn-secondary btn-sm" onclick="downloadQR('${fichasEmitidas[0].uid}','${fichasEmitidas[0].qrData}')">⬇ Descargar</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="closeQRModal()">Cerrar</button>
      </div>`;
    document.getElementById('qr-modal').classList.add('open');
    toast(`${fichasEmitidas.length} ficha${fichasEmitidas.length>1?'s':''}  emitida${fichasEmitidas.length>1?'s':''} ✓`,'ok');
    document.getElementById('gen-uid').value='';
    reloadFichas();
  } catch(e) { toast('Error: '+e.message,'err'); }
}

function imprimirTodasFichas() {
  const fichas = window._lastFichas||[];
  if (!fichas.length) return;
  const items = fichas.map(f=>`
    <div style="display:inline-block;text-align:center;margin:3mm;vertical-align:top;page-break-inside:avoid">
      <img src="${f.qrData}" style="width:10mm;height:10mm;display:block">
      <div style="font-size:4pt;font-family:monospace;margin-top:0.5mm;width:10mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${f.uid}</div>
    </div>`).join('');
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head>
    <style>@page{margin:8mm}body{margin:0;font-family:monospace}@media print{.no-print{display:none}}</style>
  </head><body>
    <div style="font-size:7pt;margin-bottom:3mm">${fichas[0].estNombre||''} · ${fichas[0].prodNombre} · ${fichas[0].precio}€</div>
    ${items}
    <br><button class="no-print" onclick="window.print()" style="margin-top:4mm;padding:4px 12px">Imprimir</button>
  </body></html>`);
  w.document.close();
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

async function openProductoModalById(id) {
  let p = (productos||[]).find(x => x.id === id);
  if (!p) {
    // fallback: buscar en BD
    try {
      const rows = await dbFetch(`productos?id=eq.${id}&select=*`);
      p = rows?.[0];
    } catch(e) {}
  }
  if (p) openProductoModal(p);
  else toast('Producto no encontrado', 'err');
}
