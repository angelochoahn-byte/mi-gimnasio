// Conexión con Supabase: inicio de sesión y una capa pequeña con la misma forma
// que usa la app (collection/doc, add/set/update/delete, onSnapshot).
// Todos los registros viven en la tabla "docs" (ver supabase/schema.sql) y cada
// fila solo la puede ver o cambiar su dueño.
(() => {
"use strict";
const CFG = window.GYM_CONFIG || {};
let sb = null, user = null, loaded = false;
const cache = {}, colL = {}, docL = {};

function newId(){const a=new Uint8Array(20);crypto.getRandomValues(a);return [...a].map(b=>"abcdefghijklmnopqrstuvwxyz0123456789"[b%36]).join("")}
function fail(e){const msg=String(e&&e.message||e||"");const x=new Error(msg);
  x.code=/fetch|network|Failed|timeout|Load failed/i.test(msg)?"unavailable":"error";return x}
const snapCol = col => ({docs:[...(cache[col]||new Map())].map(([id,d])=>({id,data:()=>d})),metadata:{fromCache:false}});
const snapDoc = (col,id) => {const d=cache[col]&&cache[col].get(id);return {id,exists:!!d,data:()=>d}};
function emit(col,id){
  (colL[col]||new Set()).forEach(l=>l.cb(snapCol(col)));
  if(id)(docL[col+"/"+id]||new Set()).forEach(l=>l.cb(snapDoc(col,id)));
}
function emitAll(){
  Object.keys(colL).forEach(c=>emit(c));
  Object.keys(docL).forEach(k=>{const [c,i]=k.split("/");(docL[k]||new Set()).forEach(l=>l.cb(snapDoc(c,i)))});
}
function put(col,id,data){(cache[col]||(cache[col]=new Map())).set(id,data)}
function drop(col,id){cache[col]&&cache[col].delete(id)}

async function write(col,id,data){
  const prev=cache[col]&&cache[col].get(id);
  data===null?drop(col,id):put(col,id,data);emit(col,id);
  try{
    const q=data===null?sb.from("docs").delete().match({owner:user.id,col,id})
      :sb.from("docs").upsert({owner:user.id,col,id,data,updated_at:new Date().toISOString()});
    const {error}=await q;if(error)throw error;
  }catch(e){prev===undefined?drop(col,id):put(col,id,prev);emit(col,id);throw fail(e)}
}
function listen(map,key,cb,onErr){
  const l={cb,onErr};(map[key]||(map[key]=new Set())).add(l);
  if(loaded)setTimeout(()=>{const [c,i]=key.split("/");cb(map===colL?snapCol(key):snapDoc(c,i))},0);
  return ()=>map[key].delete(l);
}
function docRef(col,id){
  return {id,
    set:data=>write(col,id,{...data}),
    update:data=>{const cur=cache[col]&&cache[col].get(id);if(!cur)return Promise.reject(fail("No existe"));return write(col,id,{...cur,...data})},
    delete:()=>write(col,id,null),
    onSnapshot:(cb,onErr)=>listen(docL,col+"/"+id,cb,onErr)};
}
const api = {
  collection:col=>({add:data=>docRef(col,newId()).set(data),doc:id=>docRef(col,id||newId()),onSnapshot:(cb,onErr)=>listen(colL,col,cb,onErr)}),
  doc:path=>{const [c,i]=path.split("/");return docRef(c,i)},
};

async function load(){
  const rows=[];
  for(let from=0;;from+=1000){
    const {data,error}=await sb.from("docs").select("col,id,data").order("col").order("id").range(from,from+999);
    if(error)throw fail(error);rows.push(...data);if(data.length<1000)break;
  }
  Object.keys(cache).forEach(k=>delete cache[k]);
  rows.forEach(r=>put(r.col,r.id,r.data));
  loaded=true;emitAll();
}
function errAll(){Object.values(colL).concat(Object.values(docL)).forEach(s=>s.forEach(l=>l.onErr&&l.onErr()))}

// ---------- pantalla de inicio de sesión ----------
function login(){
  return new Promise(resolve=>{
    const el=document.createElement("div");
    el.setAttribute("style","position:fixed;inset:0;z-index:50;background:var(--bg,#eef0ec);display:flex;align-items:center;justify-content:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px))");
    el.innerHTML=`<form class="card" style="width:100%;max-width:380px;gap:14px" novalidate>
      <div style="display:flex;align-items:center;gap:12px"><img src="icons/icon-192.png" alt="" width="48" height="48" style="border-radius:12px"><div><h1>Mi Gimnasio</h1><div class="sub">Entra con tu correo y contraseña</div></div></div>
      <label>Correo<input type="email" name="email" autocomplete="username" inputmode="email" required></label>
      <label>Contraseña<input type="password" name="pass" autocomplete="current-password" required></label>
      <div class="sub" id="lg-err" style="color:var(--bad);font-weight:600"></div>
      <button type="submit" class="primary">Entrar</button></form>`;
    const f=el.querySelector("form"),err=el.querySelector("#lg-err");
    f.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";const b=f.querySelector("button");b.disabled=true;b.textContent="Entrando…";
      const {data,error}=await sb.auth.signInWithPassword({email:f.email.value.trim(),password:f.pass.value});
      b.disabled=false;b.textContent="Entrar";
      if(error){err.textContent=/invalid/i.test(error.message)?"Correo o contraseña incorrectos.":/fetch|network/i.test(error.message)?"Sin conexión. Revisa tu internet.":"No se pudo entrar: "+error.message;return}
      el.remove();resolve(data.user)});
    document.body.appendChild(el);
  });
}

window.GymDB = {
  async conectar(){
    if(!CFG.url||!CFG.key||!window.supabase)throw new Error("Falta configurar Supabase");
    sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"mi-gimnasio-auth"}});
    const {data:{session}}=await sb.auth.getSession();
    user=session?session.user:await login();
    sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT")location.reload()});
    try{await load()}catch(e){setTimeout(errAll,0);throw e}
    sb.channel("docs-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"docs",filter:"owner=eq."+user.id},p=>{
      const n=p.new&&p.new.col?p.new:null,o=p.old||{};
      if(p.eventType==="DELETE"){if(o.col){drop(o.col,o.id);emit(o.col,o.id)}else load().catch(()=>{});return}
      if(n){put(n.col,n.id,n.data);emit(n.col,n.id)}
    }).subscribe();
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")load().catch(()=>{})});
    return api;
  },
  email:()=>user&&user.email,
  salir:async()=>{try{await sb.auth.signOut()}finally{location.reload()}},
};
})();
