function getConfig() {
  return {
    url: localStorage.getItem(SB_URL_KEY) || '',
    key: localStorage.getItem(SB_KEY_KEY) || '',
  };
}

async function dbFetch(path, opts = {}) {
  const { url, key } = getConfig();
  if (!url || !key) throw new Error('Sin configuración Supabase');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      'apikey': key, 'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
      ...opts.headers
    }, ...opts
  });
  if (!r.ok) {
    const t = await r.text();
    let m = t; try { m = JSON.parse(t).message || t; } catch(e){}
    throw new Error(`${r.status}: ${m}`);
  }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
let _session = null; // { id, username, role, establecimiento_id }

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function verifyLogin(user, pass) {
  const hash = await sha256(user.toLowerCase().trim() + ':' + pass);
  const rows = await dbFetch(
    `admins?username=eq.${encodeURIComponent(user.toLowerCase().trim())}&password_hash=eq.${hash}&activo=eq.true&select=id,username,role,establecimiento_id,nombre_completo`
  );
  if (rows && rows.length > 0) {
    dbFetch(`admins?id=eq.${rows[0].id}`, {
      method:'PATCH', body:JSON.stringify({last_login:new Date().toISOString()})
    }).catch(()=>{});
    return rows[0];
  }
  return null;
}

function isSuperAdmin() { return _session?.role === 'superadmin'; }
function isAdmin()      { return _session?.role === 'admin' || isSuperAdmin(); }

// ══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════════════════════
