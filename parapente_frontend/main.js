/* =========================================================================
   BITÁCORA DE VUELO — ALTOVUELO
   Frontend conectado al backend FastAPI (SQLite3) vía fetch + JWT.
   Antes: localStorage. Ahora: API en http://127.0.0.1:8000 (configurable abajo).
   ========================================================================= */

/* ================= Helpers ================= */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const fmtCOP  = v => '$ ' + Number(v||0).toLocaleString('es-CO');
const fmtHora = ts => ts ? new Date(ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
const pad = (n,l=2) => String(n).padStart(l,'0');

const IC = {
  check:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5l3.5 3.5 7-8"/></svg>',
  cam:'<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 8h3.2L9.4 5.4h5.2L16.8 8H20v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>'
};

/* ================= API client ================= */
// Cambia esta URL si tu backend corre en otro host/puerto.
const API_BASE = 'https://paraglading.onrender.com';
const TOKEN_KEY = 'parapente_jwt_v1';
const TOKEN_EXP_KEY = 'parapente_jwt_exp_v1';
const USER = 'client'

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function getUser(){ return localStorage.getItem(USER); }
function setUser(username){
  localStorage.setItem(USER, username);
}
function setToken(token, expiresIn, username){
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresIn*1000));
  localStorage.setItem(USER, username);
}
function clearToken(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
}
function tokenValid(){
  const t = getToken(); if(!t) return false;
  const exp = +localStorage.getItem(TOKEN_EXP_KEY); return exp > Date.now() + 5000;
}

async function api(path, {method='GET', body, auth=true, query} = {}){
  const url = new URL(API_BASE + path);
  if(query){
    for(const [k,v] of Object.entries(query)){
      if(v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers = {};
  if(body !== undefined){ headers['Content-Type'] = 'application/json'; }
  if(auth && tokenValid()) headers['Authorization'] = 'Bearer ' + getToken();

  let resp;
  try{
    resp = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }catch(err){
    throw new ApiError('No se pudo conectar con el servidor. ¿Está corriendo el backend?', 0);
  }

  if(resp.status === 401){
    clearToken();
    showLogin();
    throw new ApiError('Sesión expirada. Inicia sesión de nuevo.', 401);
  }
  let data = null;
  const text = await resp.text();
  if(text){
    try{ data = JSON.parse(text); }
    catch(_){ data = { detail: text }; }
  }
  if(!resp.ok){
    const msg = (data && (data.detail || data.message)) || `Error ${resp.status}`;
    throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), resp.status, data);
  }
  return data;
}

class ApiError extends Error {
  constructor(message, status, payload){
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/* ================= Estado de la app ================= */
let db = { users: [], pilots: [] };
let ui = { dir:'asc', filtro:'all', q:'' };
let pendingPilot = null;
let authUser = null;

/* ================= Toasts ================= */
function toast(msg, type='info', opts={}){
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${msg}</span>` + (opts.label ? `<button class="t-act">${opts.label}</button>` : '');
  $('#toasts').appendChild(t);
  const out = () => { t.classList.add('out'); setTimeout(()=>t.remove(), 320); };
  if(opts.label) t.querySelector('.t-act').onclick = () => { opts.fn(); out(); };
  setTimeout(out, 3800);
}

/* ================= Login / Logout ================= */
function showLogin(){
  $('#loginOvl').classList.add('open');
  $('#authBar').hidden = true;
  authUser = null;
  setTimeout(()=>$('#loginUser').focus(), 50);
}
function hideLogin(){
  $('#loginOvl').classList.remove('open');
}

['loginUser','loginPass'].forEach(id => {
  document.addEventListener('input', e=>{ if(e.target && e.target.id === id) setErr(id,''); });
});


async function doLogin(){
  const username = $('#loginUser').value.trim();
  const password = $('#loginPass').value;

  let ok = true;
  if(!username){ setErr('loginUser','Escribe el usuario'); ok=false; }
  if(!password){ setErr('loginPass','Escribe la contraseña'); ok=false; }
  if(!ok) return;
  const btn = $('#loginSubmit');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try{
    const r = await api('/api/auth/login', { method:'POST', body:{ username, password }, auth:false });
    setToken(r.access_token, r.expires_in, username);
    authUser = username;
    $('#authUser').textContent = username.toUpperCase();
    $('#authBar').hidden = false;
    hideLogin();
    $('#loginForm').reset();
    toast(`Bienvenida, ${username}`, 'ok');
    await refreshAll();
  }catch(err){
    toast(err.message, 'warn');
  }finally{
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}
$('#loginSubmit').addEventListener('click', doLogin);
$('#loginForm').addEventListener('submit', e=>{ e.preventDefault(); doLogin(); });
$('#logoutBtn').addEventListener('click', ()=>{
  clearToken();
  toast('Sesión cerrada', 'info');
  showLogin();
});

/* ================= Pestañas ================= */
 $('#tabsNav').addEventListener('click', e=>{
  const b = e.target.closest('.tab'); if(!b) return;
  $$('.tab').forEach(t=>t.classList.toggle('on', t===b));
  $$('.sec').forEach(s=>s.classList.toggle('on', s.id === 'sec-'+b.dataset.tab));
});

function counts(){
  $('#cTabReg').textContent = '('+db.users.length+')';
  $('#cTabMan').textContent = '('+db.users.filter(u=>!u.volado).length+' en tierra)';
  $('#cTabFv').textContent  = '('+db.users.filter(u=>u.fv).length+')';
  $('#cAll').textContent = db.users.length;
  $('#cGround').textContent = db.users.filter(u=>!u.volado).length;
  $('#cFlown').textContent = db.users.filter(u=>u.volado).length;
}

/* ================= Módulo 01 · Registro ================= */
const setErr = (id, msg) => {
  const el = document.querySelector(`.err[data-for="${id}"]`);
  if(el) el.textContent = msg;
};
['fNombre','fCorreo','fTel','fPeso'].forEach(id => $('#'+id).addEventListener('input', ()=>setErr(id,'')));

 $('#regForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const nombre = $('#fNombre').value.trim(),
        correo = $('#fCorreo').value.trim(),
        tel    = $('#fTel').value.trim(),
        peso   = parseFloat($('#fPeso').value);
  let ok = true;
  // if(nombre.length < 3){ setErr('fNombre','Escribe el nombre completo'); ok=false; }
  if (!/^(?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}\s+){2,}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}$/.test(nombre.trim())) {
    setErr('fNombre', 'Escribe el nombre completo (mínimo 3 palabras de 3 caracteres)');
    ok = false;
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)){ setErr('fCorreo','Correo no válido'); ok=false; }
  if(tel.replace(/\D/g,'').length != 10){ setErr('fTel','Teléfono no válido'); ok=false; }
  if(!(peso >= 30 && peso <= 120)){ setErr('fPeso','Entre 30 y 150 kg'); ok=false; }
  if(!ok) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try{
    const created = await api('/api/usuarios', { method:'POST', body:{ nombre, correo, tel, peso }, auth:false });
    db.users.push(created);
    e.target.reset();
    if ("will" != authUser && "nelson" != authUser){setUser(nombre);authUser=nombre;};
    renderAll();
    toast(`Participante registrado — ${created.nombre}, ${created.peso} kg`, 'ok');
  }catch(err){
    toast(err.message, 'warn');
  }finally{
    btn.disabled = false;
  }
});

function renderRegistry(){
  // El "seq" es solo de display: usa el mayor id + 1 (el backend lo calcula solo).
  const nextSeq = db.users.length ? Math.max(...db.users.map(u=>u.id)) + 1 : 1;
  $('#seqNo').textContent = pad(nextSeq,4);
  const q = db.users.filter(u=>!u.volado).sort((a,b)=>a.peso-b.peso);
  $('#queue').innerHTML = q.length
    ? q.map((u,i)=>`<li><span class="q-n">${pad(i+1)}</span><span>${esc(u.nombre)}</span><span class="q-fill"></span><span class="q-kg">${u.peso} kg</span></li>`).join('')
    : '<li class="q-empty" style="border:0;display:block">Nadie en espera de despegue.</li>';
  const flown = db.users.filter(u=>u.volado).length;
  const avg = db.users.length ? (db.users.reduce((s,u)=>s+ (+u.peso),0)/db.users.length).toFixed(1) : 0;
  $('#regStats').textContent = `${pad(db.users.length)} REGISTRADOS · ${pad(flown)} VOLADOS · PROM ${avg} KG`;
}

/* ================= Módulo 02 · Manifiesto ================= */
 $('#filtros').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  ui.filtro = b.dataset.f;
  $$('#filtros button').forEach(x=>x.classList.toggle('on', x===b));
  renderManifest();
});
 $('#orden').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  setDir(b.dataset.dir);
});
 $('#thPeso').addEventListener('click', ()=> setDir(ui.dir==='asc' ? 'desc' : 'asc'));
function setDir(d){
  ui.dir = d;
  $$('#orden button').forEach(x=>x.classList.toggle('on', x.dataset.dir===d));
  $('#pesoArrow').textContent = d==='asc' ? '↑' : '↓';
  renderManifest();
}
 $('#searchInp').addEventListener('input', e=>{ ui.q = e.target.value; renderManifest(); });

function pilotCell(u){
  if(u.volado){
    return `<div class="pilot-done">${IC.check} ${esc(u.pilotoVuelo || '—')}</div>
            <div class="mono dim tiny">VOLÓ ${u.voladoAt ? fmtHora(u.voladoAt) : ''}</div>`;
  }
  const flash = u.id === pendingPilot ? ' flash' : '';
  const opts = db.pilots.map(p=>`<option value="${p.id}"${u.pilotoAsignadoId===p.id?' selected':''}>${esc(p.nombre)}</option>`).join('');
  return `<select class="sel-pilot${flash}" data-action="pilot" data-id="${u.id}">
            <option value="">— asignar piloto —</option>${opts}</select>`;
}
function stateCell(u){
  if(u.volado){
    const just = u.voladoAt && (Date.now() - new Date(u.voladoAt).getTime() < 1500);
    return `<span class="stamp${just?' stamp-in':''}">VOLÓ</span>`;
  }
  return `<span class="grounded"><i></i>EN TIERRA</span>`;
}
function fvCell(u){
  if(u.fv){
    const t = u.fv.paid ? 'Pagado — clic para gestionar' : 'Pago pendiente — clic para gestionar';
    return `<button class="chip${u.fv.paid?' paid':''}" data-action="fv" title="${t}">F/V ${fmtCOP(u.fv.valor)}<i class="dot"></i></button>`;
  }
  return `<button class="chip add" data-action="fv">+ F/V</button>`;
}
function actionCell(u){
  return u.volado
    ? `<button class="btn ghost sm" data-action="unfly">Deshacer</button>`
    : `<button class="btn solid sm" data-action="fly">Marcar vuelo</button>`;
}
function renderManifest(){
  let list = [...db.users];
  if(ui.filtro==='ground') list = list.filter(u=>!u.volado);
  if(ui.filtro==='flown')  list = list.filter(u=> u.volado);
  if(ui.q){ const q = norm(ui.q); list = list.filter(u=> norm(u.nombre+' '+u.correo).includes(q)); }
  list.sort((a,b)=> ui.dir==='asc' ? a.peso-b.peso : b.peso-a.peso);

  $('#maniBody').innerHTML = list.length ? list.map((u,i)=>{
    const pct = Math.max(5, Math.min(100, Math.round((u.peso-30)/120*100)));
    return `<tr class="${u.volado?'flown':''}" data-id="${u.id}">
      <td class="idx">${pad(i+1)}</td>
      <td><div class="p-name">${esc(u.nombre)}</div><div class="p-contact">${esc(u.correo)} · ${esc(u.tel)}</div></td>
      <td><div class="p-weight">${u.peso} <small>kg</small></div><span class="pbar"><i style="width:${pct}%"></i></span></td>
      <td>${pilotCell(u)}</td>
      <td>${stateCell(u)}</td>
      <td>${fvCell(u)}</td>
      <td class="ta-r">${actionCell(u)}</td>
    </tr>`;
  }).join('') : `<tr class="empty"><td colspan="7">${IC.cam}Sin participantes que coincidan — registra en el módulo 01.</td></tr>`;

  pendingPilot = null;
}

 $('#maniBody').addEventListener('click', async e=>{
  const b = e.target.closest('[data-action]'); if(!b) return;
  const id = +b.closest('tr').dataset.id;
  const u = db.users.find(x=>x.id===id);
  if(!u) return;
  if(b.dataset.action==='fly'){
    if(!u.pilotoAsignadoId){
      pendingPilot = id;
      renderManifest();
      toast(`Asigna primero un piloto para ${u.nombre}`, 'warn');
      return;
    }
    try{
      const updated = await api(`/api/usuarios/${id}/vuelo`, { method:'PATCH', query:{ volado:true } });
      Object.assign(u, updated);
      renderAll();
      toast(`Vuelo registrado — ${u.nombre} con ${u.pilotoVuelo}`, 'ok');
    }catch(err){ toast(err.message, 'warn'); }
  }
  if(b.dataset.action==='unfly'){
    try{
      const updated = await api(`/api/usuarios/${id}/vuelo`, { method:'PATCH', query:{ volado:false } });
      Object.assign(u, updated);
      renderAll();
      toast(`Vuelo deshecho — ${u.nombre} vuelve a la fila`, 'warn');
    }catch(err){ toast(err.message, 'warn'); }
  }
  if(b.dataset.action==='fv') openFv(id);
});
 $('#maniBody').addEventListener('change', async e=>{
  const s = e.target.closest('select[data-action="pilot"]'); if(!s) return;
  const u = db.users.find(x=>x.id === +s.closest('tr').dataset.id);
  if(!u) return;
  const pilotoId = s.value ? +s.value : null;
  try{
    const updated = await api(`/api/usuarios/${u.id}/piloto`, { method:'PATCH', query:{ piloto_id: pilotoId } });
    Object.assign(u, updated);
    if(u.pilotoAsignado) toast(`Piloto asignado — ${u.nombre} con ${u.pilotoAsignado}`, 'ok');
    else toast(`Piloto desasignado — ${u.nombre}`, 'info');
  }catch(err){ toast(err.message, 'warn'); }
});

/* ================= Modal F/V ================= */
function userOptions(sel){
  return db.users.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre))
    .map(u=>`<option value="${u.id}"${u.id===sel?' selected':''}>${esc(u.nombre)}${u.fv?' · servicio activo':''}</option>`).join('');
}
function openFv(id){
  $('#mUser').innerHTML = userOptions(id);
  $('#mMedio').value = 'Efectivo'; $('#mValor').value = '';
  const u = db.users.find(x=>x.id===id);
  if(u && u.fv){ $('#mMedio').value = u.fv.medio; $('#mValor').value = u.fv.valor; }
  const editing = u && u.fv;
  $('#mTitle').textContent = editing ? 'Editar servicio — Foto & Vídeo' : 'Contratar servicio — Foto & Vídeo';
  $('#mSave').textContent  = editing ? 'Guardar cambios' : 'Habilitar servicio';
  $('#ovl').classList.add('open');
  setTimeout(()=>$('#mValor').focus(), 60);
}
function closeFv(){ $('#ovl').classList.remove('open'); }
 $('#mClose').addEventListener('click', closeFv);
 $('#ovl').addEventListener('click', e=>{ if(e.target === $('#ovl')) closeFv(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeFv(); });
 $('#mSave').addEventListener('click', async ()=>{
  const userId = +$('#mUser').value;
  const u = db.users.find(x=>x.id === userId);
  const medio = $('#mMedio').value;
  const valor = parseFloat($('#mValor').value);
  if(!u){ toast('Selecciona un participante', 'warn'); return; }
  if(!(valor > 0)){ toast('Ingresa un valor de pago válido', 'warn'); return; }
  const editing = !!u.fv;
  const btn = $('#mSave'); btn.disabled = true;
  try{
    const updated = await api(`/api/usuarios/${userId}/foto-video`, {
      method:'PUT',
      body:{ medio, valor, paid: editing ? u.fv.paid : false },
    });
    Object.assign(u, updated);
    closeFv(); renderAll();
    toast(editing
      ? `Servicio actualizado — ${u.nombre}, ${fmtCOP(valor)}`
      : `Foto & Vídeo habilitado — ${u.nombre}, ${fmtCOP(valor)} (${medio})`, 'ok');
  }catch(err){
    toast(err.message, 'warn');
  }finally{ btn.disabled = false; }
});

/* ================= Módulo 03 · Foto & Vídeo ================= */
function renderFinance(){
  const withFv = db.users.filter(u=>u.fv);
  const total = withFv.reduce((s,u)=>s+u.fv.valor,0);
  const paid  = withFv.filter(u=>u.fv.paid).reduce((s,u)=>s+u.fv.valor,0);
  $('#cashTotal').textContent = fmtCOP(total);
  $('#cashPaid').textContent  = fmtCOP(paid);
  $('#cashDue').textContent   = fmtCOP(total-paid);
  $('#cashCount').textContent = withFv.length;

  $('#fvUser').innerHTML = '<option value="">— seleccionar —</option>' + userOptions(null);

  $('#fvBody').innerHTML = withFv.length ? withFv.map((u,i)=>`
    <tr data-id="${u.id}">
      <td class="idx">${pad(i+1)}</td>
      <td><div class="who">${esc(u.nombre)}</div><div class="p-contact">${u.peso} kg · ${u.volado?'voló':'en tierra'}</div></td>
      <td class="mono dim" style="font-size:11px">${fmtHora(u.fv.at)}</td>
      <td class="mono" style="font-size:12px">${esc(u.fv.medio)}</td>
      <td class="mono" style="font-size:13px;font-weight:600">${fmtCOP(u.fv.valor)}</td>
      <td>${u.fv.paid
            ? `<span class="chip-ok">PAGADO</span> <button class="link-btn" data-act="unpay">anular</button>`
            : `<span class="chip-pend">PENDIENTE</span> <button class="link-btn" data-act="pay">cobrar</button>`}</td>
      <td class="ta-r"><button class="icon-x" data-act="del" title="Quitar servicio" aria-label="Quitar servicio">×</button></td>
    </tr>`).join('')
  : `<tr class="empty"><td colspan="7">${IC.cam}Sin servicios contratados todavía — habilita uno arriba o desde el manifiesto.</td></tr>`;
}
 $('#fvBody').addEventListener('click', async e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const u = db.users.find(x=>x.id === +b.closest('tr').dataset.id);
  if(!u) return;
  const act = b.dataset.act;
  if(act==='pay' || act==='unpay'){
    try{
      const updated = await api(`/api/usuarios/${u.id}/foto-video/pago`, { method:'PATCH', body:{ paid: act==='pay' } });
      Object.assign(u, updated);
      renderAll();
      toast(act==='pay'
        ? `Pago registrado — ${fmtCOP(u.fv.valor)} de ${u.nombre}`
        : `Pago anulado — ${u.nombre}`,
        act==='pay' ? 'ok' : 'warn');
    }catch(err){ toast(err.message, 'warn'); }
  }
  if(act==='del'){
    try{
      await api(`/api/usuarios/${u.id}/foto-video`, { method:'DELETE' });
      const backup = u.fv;
      u.fv = null; renderAll();
      toast(`Servicio retirado — ${u.nombre}`, 'warn',
        { label:'DESHACER', fn: async ()=>{
          try{
            const restored = await api(`/api/usuarios/${u.id}/foto-video`, { method:'PUT', body:{ medio:backup.medio, valor:backup.valor, paid:backup.paid } });
            Object.assign(u, restored);
            renderAll();
          }catch(err){ toast(err.message,'warn'); }
        }});
    }catch(err){ toast(err.message, 'warn'); }
  }
});
 $('#fvForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const u = db.users.find(x=>x.id === +$('#fvUser').value);
  const medio = $('#fvMedio').value;
  const valor = parseFloat($('#fvValor').value);
  if(!u){ toast('Selecciona un participante', 'warn'); return; }
  if(!(valor > 0)){ toast('Ingresa un valor de pago válido', 'warn'); return; }
  const editing = !!u.fv;
  try{
    const updated = await api(`/api/usuarios/${u.id}/foto-video`, {
      method:'PUT',
      body:{ medio, valor, paid: editing ? u.fv.paid : false },
    });
    Object.assign(u, updated);
    e.target.reset(); renderAll();
    toast(editing ? `Servicio actualizado — ${u.nombre}` : `Foto & Vídeo habilitado — ${u.nombre}, ${fmtCOP(valor)}`, 'ok');
  }catch(err){ toast(err.message, 'warn'); }
});

/* ================= Reinicio ================= */
const RESET_LABEL = 'Reiniciar datos de demostración';
let armed = false, armT = null;
 $('#resetBtn').addEventListener('click', async function(){
  if(!armed){
    armed = true; this.textContent = '¿Seguro? Borra todos los usuarios vía API'; this.classList.add('armed');
    armT = setTimeout(()=>{ armed=false; this.textContent = RESET_LABEL; this.classList.remove('armed'); }, 3200);
  } else {
    clearTimeout(armT); armed = false;
    this.textContent = 'Borrando…'; this.classList.remove('armed');
    // Borra todos los participantes uno a uno (la API no tiene endpoint de wipe).
    const ids = db.users.map(u=>u.id);
    try{
      await Promise.all(ids.map(id => api(`/api/usuarios/${id}`, { method:'DELETE' })));
      db.users = [];
      renderAll();
      toast('Datos borrados en el backend', 'ok');
    }catch(err){
      toast('No se pudo borrar todo: ' + err.message, 'warn');
      await refreshAll();
    }finally{
      this.textContent = RESET_LABEL;
    }
  }
});

/* ================= Reloj, fecha y viento ================= */
function tick(){
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('es-CO',{hour12:false});
  $('#dateNow').textContent = d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}).replace(/\./g,'').toUpperCase();
}
tick(); setInterval(tick, 1000);

// const windSpeed = t => {
//     const wave =
//         9 +
//         4.5 * Math.sin(t * 0.21) +
//         3 * Math.sin(t * 0.53 + 2) +
//         1.5 * Math.sin(t * 1.7 + 5);

//     return 5 + ((wave - 0) / 18) * 40;
// };
const windSpeed = t =>
    25 + 20 * (
        0.5 * Math.sin(t * 0.21) +
        0.3 * Math.sin(t * 0.53 + 2) +
        0.2 * Math.sin(t * 1.7 + 5)
    );
// const windSpeed = t => Math.max(1.2, 9 + 4.5*Math.sin(t*0.21) + 3*Math.sin(t*0.53+2) + 1.5*Math.sin(t*1.7+5));
function drawWind(t){
  const v = windSpeed(t);
  const rot = Math.min(80, Math.max(8, 82 - v*3.4));
  const stretch = 0.8 + 0.2*Math.min(1, v/16);
  const n = 4, L = 76*stretch, x0 = 19, y0 = 16, h0 = 12, h1 = 4.5;
  const pts = [];
  for(let i=0;i<=n;i++){
    const s = i/n;
    pts.push({
      x: x0 + s*L,
      y: y0 + Math.sin(t*2.3 + i*0.85) * (0.5 + v*0.14) * s,
      h: h0 + (h1-h0)*s
    });
  }
  let html = '';
  for(let i=0;i<n;i++){
    const a = pts[i], b = pts[i+1];
    html += `<polygon points="${a.x.toFixed(1)},${(a.y-a.h).toFixed(1)} ${b.x.toFixed(1)},${(b.y-b.h).toFixed(1)} ${b.x.toFixed(1)},${(b.y+b.h).toFixed(1)} ${a.x.toFixed(1)},${(a.y+a.h).toFixed(1)}"
      fill="${i%2 ? 'var(--paper-hi)' : 'var(--acc)'}" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  $('#sockSegs').innerHTML = html;
  $('#sockG').setAttribute('transform', `rotate(${rot.toFixed(1)} 16 16)`);
  $('#windVal').textContent = Math.round(v);
  const dirs = ['NE','ENE','E'];
  $('#windDir').textContent = dirs[Math.floor((Math.sin(t*0.05)+1)*1.49)];
  const msg = $('#windMsg');
  if(v < 10){ msg.textContent = 'VIENTO SUAVE'; msg.className = 'fine'; }
  else if(v <= 25){ msg.textContent = 'CONDICIONES ÓPTIMAS'; msg.className = 'fine'; }
  else { msg.textContent = 'RÁFAGAS — PRECAUCIÓN'; msg.className = 'fine hot'; }
}
(function loop(ts){ drawWind((ts||0)/1000); requestAnimationFrame(loop); })();

/* ================= Carga desde el backend ================= */
async function refreshAll(){
  if(!tokenValid()){ showLogin(); return; }
  
  const tabsNav = $('#tabsNav')
  const txt_reset_all = $('#resetBtn')
  const logoutBtn = $('#logoutBtn')
  $('#authUser').textContent = authUser.toUpperCase();
  if (authUser == 'will') {
    console.log('ES SUPERADMIN')

  } else if (authUser == 'nelson') {
    console.log('NO ES SUPERADMIN')
    txt_reset_all.hidden = true;
  } else {
    console.log('NO ES SUPERADMIN')
    txt_reset_all.hidden = true;
    // txt_reset_all.remove();
    // tabsNav.hidden = true;
    tabsNav.style.display = 'none';
    // tabsNav.remove();
    logoutBtn.remove();
  }

  try{
    const [users, pilots] = await Promise.all([
      api('/api/usuarios', { query:{ limit:1000 } }),
      api('/api/pilotos', { query:{ activos: true } }),
    ]);
    db.users = users;
    db.pilots = pilots;
    renderAll();
    $('#footerStatus').textContent = `Conectado · ${users.length} participantes · ${pilots.length} pilotos`;
  }catch(err){
    toast('No se pudo cargar el manifiesto: ' + err.message, 'warn');
    $('#footerStatus').textContent = 'Error de conexión con la API';
  }
}

function hideForm(){
  const form = $('#regForm');

  if ("will" != authUser && "nelson" != authUser && "user" != authUser) {
    form.hidden = true;
  }
}

function renderAll(){ counts(); renderRegistry(); renderManifest(); renderFinance(); hideLogin(); hideForm();}

/* ================= Init ================= */
(async function init(){
  $('#footerStatus').textContent = 'Conectando con la API…';
  if(tokenValid()){
    // Intenta cargar; si el token caducó, mostrará login automáticamente.
    authUser = getUser();
    $('#authUser').textContent = 'SESIÓN';
    $('#authBar').hidden = false;
    await refreshAll();
  }else{
    showLogin();
  }
})();
