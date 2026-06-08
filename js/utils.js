function toggleCadInput() {
  const tipo    = document.getElementById('p-cad-tipo')?.value;
  const valEl   = document.getElementById('p-cad-val');
  const fechaEl = document.getElementById('p-cad-fecha');
  if (!valEl || !fechaEl) return;
  valEl.style.display   = (tipo === 'nunca' || tipo === 'fecha') ? 'none' : '';
  fechaEl.style.display = tipo === 'fecha' ? '' : 'none';
  if (tipo === 'nunca') valEl.value = '';
  if (tipo !== 'fecha') fechaEl.value = '';
}

// ══════════════════════════════════════════════════════════
//  P4: COLAPSABLES
// ══════════════════════════════════════════════════════════
function toggleCollapse(headerId) {
  const header = document.getElementById(headerId);
  const body   = document.getElementById(headerId + '-body');
  if (!header || !body) return;
  const arrow  = header.querySelector('.collapsible-arrow');
  const isOpen = !body.classList.contains('collapsed');
  if (isOpen) {
    body.style.maxHeight = body.scrollHeight + 'px';
    requestAnimationFrame(() => {
      body.style.maxHeight = body.scrollHeight + 'px';
      requestAnimationFrame(() => { body.classList.add('collapsed'); body.style.maxHeight = '0'; });
    });
    arrow?.classList.remove('open');
  } else {
    body.classList.remove('collapsed');
    body.style.maxHeight = body.scrollHeight + 'px';
    setTimeout(() => body.style.maxHeight = 'none', 310);
    arrow?.classList.add('open');
  }
}
function initCollapse(headerId, startOpen = true) {
  const body = document.getElementById(headerId + '-body');
  if (!body) return;
  const arrow = document.getElementById(headerId)?.querySelector('.collapsible-arrow');
  if (startOpen) {
    body.style.maxHeight = 'none';
    arrow?.classList.add('open');
  } else {
    body.classList.add('collapsed');
    body.style.maxHeight = '0';
  }
}

// ══════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════
async function checkCaducadas() {
  try {
    await dbFetch(`fichas?estado=eq.vendida&fecha_caducidad=lt.${new Date().toISOString()}`,{
      method:'PATCH', body:JSON.stringify({estado:'caducada'})
    });
  } catch(e) {}
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
function fmtDateLong(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});
}

function toast(msg, type='') {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='show '+(type==='ok'?'ok':type==='err'?'err':'');
  setTimeout(()=>el.className='',3000);
}