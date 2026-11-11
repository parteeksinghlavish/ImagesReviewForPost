
import { reviewDecision, maintenance, queueStats } from "./operations.js";
import { LIVE_POSTING_ENABLED } from "./queue.js";
const HOME = "review.titanrigs.com";
// Owner identity is injected as the Cloudflare OWNER_EMAIL runtime secret.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {...securityHeaders, "Content-Type":"application/json; charset=utf-8"}});
}
function page() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#0a0b0e"/><meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<link rel="manifest" href="/manifest.webmanifest"/><link rel="icon" href="/icon.svg" type="image/svg+xml"/>
<title>Review — Social Studio</title>
<style>
:root{color-scheme:dark;--bg:#090a0d;--panel:#111217;--muted:#8d929f;--line:#26272e;--bright:#eeeef3;--accent:#9ca4ee;--red:#ff717c;--green:#7bd6af}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--bright);font:15px/1.45 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{overscroll-behavior-y:contain}button{font:inherit;cursor:pointer}button:disabled{opacity:.42;cursor:wait}
.shell{min-height:100dvh;max-width:550px;margin:auto;display:flex;flex-direction:column;padding:0 18px calc(20px + env(safe-area-inset-bottom))}
.top{height:70px;display:flex;align-items:center;justify-content:space-between;gap:15px}.brand{display:flex;align-items:center;gap:11px;font-size:13px;letter-spacing:.045em;font-weight:690}.mark{height:31px;width:31px;display:grid;place-items:center;background:#1c1f29;border:1px solid #363946;border-radius:10px;color:#bbbfff;font-size:17px;transform:rotate(-3deg)}
.env{border:1px solid var(--line);padding:6px 9px;border-radius:999px;font-size:10px;color:#9ea3af;letter-spacing:.11em;font-weight:700;text-transform:uppercase}
.titlebar{display:flex;align-items:end;justify-content:space-between;margin:23px 0 19px}.eyebrow{text-transform:uppercase;letter-spacing:.18em;color:var(--muted);font-size:10px;font-weight:750}h1{font-size:31px;letter-spacing:-.05em;line-height:1.15;margin:5px 0 0;font-weight:700}.count{font-size:13px;color:#9799ac;padding-bottom:4px}
.tabs{display:flex;gap:5px;margin-bottom:19px;overflow-x:auto;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}.tab{border:1px solid transparent;background:transparent;color:#969ba7;border-radius:10px;padding:8px 12px;white-space:nowrap;font-size:13px}.tab.active{background:#1c1e27;border-color:#30323b;color:#f4f4f7}
.progress{height:3px;background:#23252b;border-radius:5px;overflow:hidden;margin:0 0 14px}.progress>div{height:100%;background:#a8adf5;width:0%;border-radius:5px;transition:width .3s}
.stage{position:relative;flex:1;min-height:0}.review{position:relative;width:100%;overflow:hidden;isolation:isolate;background:#15161b;border:1px solid #282a34;border-radius:20px;aspect-ratio:4/5;max-height:min(65dvh,620px);margin:auto;touch-action:pan-y;user-select:none;box-shadow:0 25px 85px #0006;transition:transform .22s ease,opacity .2s ease}.review.dragging{transition:none;cursor:grabbing}.review img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;background:#111217}
.review:after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 72%,#0009);pointer-events:none}.review .tag{position:absolute;z-index:3;top:15px;left:15px;background:#090a0dc7;backdrop-filter:blur(10px);border:1px solid #ffffff26;padding:6px 10px;border-radius:999px;font-size:11px;letter-spacing:.04em}
.card-footer{position:absolute;z-index:3;bottom:18px;left:19px;right:19px;display:flex;align-items:end;justify-content:space-between;gap:12px}.card-footer strong{font-size:15px}.card-footer p{margin:4px 0 0;color:#d0d0d9;font-size:12px}
.stamp{z-index:5;position:absolute;top:24%;border:3px solid;border-radius:10px;font-size:27px;font-weight:850;padding:10px 15px;transform:rotate(-13deg);opacity:0;letter-spacing:.025em;pointer-events:none;text-transform:uppercase}.stamp.reject{left:20px;color:var(--red)}.stamp.approve{right:20px;color:var(--green);transform:rotate(13deg)}
.controls{display:flex;align-items:center;justify-content:center;gap:29px;margin-top:19px}.action{width:72px;height:72px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--line);background:#18191f;transition:transform .15s,border-color .15s}.action:hover{transform:scale(1.05)}.action svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.action.reject{color:var(--red);border-color:#5e3038}.action.approve{color:var(--green);border-color:#2c5a49}.action.refresh{width:48px;height:48px;color:#aeb1be}
.hint{text-align:center;color:#747785;font-size:11px;margin:16px 0 0;letter-spacing:.01em}
.empty{border:1px dashed #353641;background:#101116;border-radius:20px;min-height:400px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:35px}.empty .symbol{width:65px;height:65px;border:1px solid #363942;border-radius:19px;display:grid;place-items:center;background:#1a1b23;color:#abb1ef;font-size:31px}.empty h2{margin:18px 0 6px;font-size:21px;letter-spacing:-.04em}.empty p{margin:0;max-width:280px;color:var(--muted);font-size:13px}
.bottom{border-top:1px solid #23252d;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:25px;padding-top:15px;color:#7a7d89;font-size:11px}.bottom strong{color:#afb2c0;font-weight:600}
.toast{position:fixed;left:50%;bottom:calc(35px + env(safe-area-inset-bottom));transform:translate(-50%,140px);background:#262831;border:1px solid #41444e;color:#fff;padding:12px 18px;border-radius:12px;box-shadow:0 14px 50px #000a;z-index:30;font-size:13px;max-width:90vw;transition:transform .25s;white-space:nowrap}.toast.show{transform:translate(-50%,0)}
@media (max-height:730px){.top{height:52px}.titlebar{margin:13px 0 12px}.tabs{margin-bottom:13px}.review{max-height:50dvh}.controls{margin-top:12px}.action{width:57px;height:57px}.hint{margin:10px 0 0}}
</style></head>
<body><main class="shell">
<header class="top"><div class="brand"><div class="mark">✦</div><span>SOCIAL STUDIO<span style="color:#777986"> / REVIEW</span></span></div><div class="env">Private workspace</div></header>
<section class="titlebar"><div><div class="eyebrow">Creative approval</div><h1>Review queue</h1></div><div class="count" id="counter">—</div></section>
<nav class="tabs" id="tabs" aria-label="Review filters"></nav>
<div class="progress"><div id="progress"></div></div>
<section class="stage" id="stage" aria-live="polite"></section>
<div class="controls" id="controls">
<button class="action reject" id="rejectBtn" aria-label="Reject image" title="Reject (left arrow)"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
<button class="action refresh" id="refreshBtn" aria-label="Refresh queue" title="Refresh"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-2.3-5.6M20 4v7h-7"/></svg></button>
<button class="action approve" id="approveBtn" aria-label="Approve image" title="Approve (right arrow)"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></button>
</div><p class="hint" id="hint">Swipe left to reject · Swipe right to approve</p>
<footer class="bottom"><span>DiscoverXploration · Image by image</span><strong>PRIVATE REVIEW</strong></footer></main>
<div class="toast" role="status" id="toast"></div>
<script>
(()=>{'use strict';
const TABS=['pending','approved','scheduled','published','rejected','error'];
const labels={pending:'Pending',approved:'Approved',scheduled:'Scheduled',published:'Published',rejected:'Rejected',error:'Issues'};
const state={tab:'pending',items:[],index:0,stats:{},busy:false};
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}
async function api(path,options){const r=await fetch(path,{credentials:'same-origin',...options});const data=await r.json().catch(()=>({error:'Unexpected response'}));if(!r.ok)throw Error(data.error||'Request failed');return data}
function current(){return state.items[state.index]}
function showTabs(){const tabs=$('tabs');tabs.innerHTML=TABS.map(t=>'<button class="tab '+(state.tab===t?'active':'')+'" data-tab="'+t+'">'+labels[t]+' '+(state.stats[t]||'')+'</button>').join('');tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;load()}))}
function render(){
 showTabs();const item=current(),n=state.items.length;
 $('counter').textContent=n?((state.index+1)+' / '+n):'0 / 0';
 $('progress').style.width=n?Math.min(100,((state.index+1)/n)*100)+'%':'0%';
 $('controls').style.display=state.tab==='pending'?'flex':'none';
 $('hint').textContent=state.tab==='pending'?'Swipe left to reject · Swipe right to approve':'Review history · images remain private';
 if(!item){$('stage').innerHTML='<div class="empty"><div class="symbol">✦</div><h2>'+(state.tab==='pending'?'All reviewed':'Nothing here yet')+'</h2><p>'+(state.tab==='pending'?'New images will appear here after the generation workflow uploads them to private R2 storage.':'No images with this status yet.')+'</p></div>';return}
 const img=item.status==='rejected'?'<div style="height:100%;display:grid;place-items:center;color:#777985;font-size:13px">Image deleted from storage</div>':'<img loading="eager" draggable="false" alt="Image awaiting review" src="/media/'+encodeURIComponent(item.object_key)+'"/>';
 $('stage').innerHTML='<article class="review" id="review">'+img+'<span class="tag">'+escape(labels[item.status]||item.status)+'</span><span class="stamp reject" id="rStamp">REJECT</span><span class="stamp approve" id="aStamp">APPROVE</span><div class="card-footer"><div><strong>Image '+(item.image_index+1)+' of 4</strong><p>Batch '+escape(item.batch_id.slice(0,12))+' · '+escape(item.status)+'</p></div><span style="font-size:12px;color:#ccc">'+(state.index+1)+' / '+n+'</span></div></article>';
 if(state.tab==='pending')swipe($('review'));
 else {const imgEl=$('review').querySelector('img');if(imgEl)imgEl.addEventListener('click',()=>window.open(imgEl.src,'_blank','noopener,noreferrer'))}
}
async function load(){try{const data=await api('/api/items?status='+encodeURIComponent(state.tab));state.items=data.items||[];state.stats=data.stats||{};state.index=0;render()}catch(e){toast(e.message);$('stage').innerHTML='<div class="empty"><h2>Could not load queue</h2><p>'+escape(e.message)+'</p></div>'}}
async function decide(decision){const item=current();if(!item||state.busy||state.tab!=='pending')return;state.busy=true;$('rejectBtn').disabled=true;$('approveBtn').disabled=true;const card=$('review');if(card){card.style.transform=decision==='approved'?'translateX(120%) rotate(13deg)':'translateX(-120%) rotate(-13deg)';card.style.opacity='.2'}
 try{await api('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,decision})});state.items.splice(state.index,1);if(state.index>=state.items.length)state.index=Math.max(0,state.items.length-1);state.stats.pending=Math.max(0,(state.stats.pending||1)-1);state.stats[decision]=(state.stats[decision]||0)+1;render();toast(decision==='approved'?'Approved · awaiting scheduler':'Rejected · removed from storage')}catch(e){toast(e.message);render()}finally{state.busy=false;$('rejectBtn').disabled=false;$('approveBtn').disabled=false}}
function swipe(card){let start=null;card.addEventListener('pointerdown',e=>{if(state.busy||e.button!==0)return;start={x:e.clientX,y:e.clientY};card.classList.add('dragging');card.setPointerCapture(e.pointerId)});
card.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)*1.7)return;card.style.transform='translateX('+dx+'px) rotate('+(dx/25)+'deg)';const opacity=Math.min(1,Math.abs(dx)/110);$('rStamp').style.opacity=dx<0?opacity:0;$('aStamp').style.opacity=dx>0?opacity:0});
card.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x;start=null;card.classList.remove('dragging');if(dx>85)decide('approved');else if(dx< -85)decide('rejected');else {card.style.transform='';$('rStamp').style.opacity=0;$('aStamp').style.opacity=0}});
card.addEventListener('pointercancel',()=>{start=null;card.classList.remove('dragging');card.style.transform=''})}
$('approveBtn').addEventListener('click',()=>decide('approved'));$('rejectBtn').addEventListener('click',()=>decide('rejected'));$('refreshBtn').addEventListener('click',()=>load());
window.addEventListener('keydown',e=>{if(state.busy)return;if(state.tab==='pending'&&e.key==='ArrowLeft')decide('rejected');if(state.tab==='pending'&&e.key==='ArrowRight')decide('approved')});
load();
})();
</script></body></html>`;
}
const KEY_MATCH = /^review\/pending\/([A-Za-z0-9_-]{8,80})\/([0-3])\.(jpg|jpeg|png|webp)$/i;
async function sync(env) {
  const all = [];
  let cursor = undefined;
  do {
    const batch = await env.PENDING.list({prefix:"review/pending/",limit:1000,...(cursor?{cursor}:{})});
    for (const file of batch.objects) {
      const match = KEY_MATCH.exec(file.key);
      if (!match) continue;
      const id = match[1]+"-"+match[2];
      all.push(env.DB.prepare("INSERT OR IGNORE INTO image_reviews (id,object_key,batch_id,image_index) VALUES (?,?,?,?)").bind(id,file.key,match[1],Number(match[2])));
    }
    cursor = batch.truncated?batch.cursor:undefined;
  } while (cursor && all.length < 3000);
  if (all.length) for(let i=0;i<all.length;i+=100) await env.DB.batch(all.slice(i,i+100));
}
async function stats(env) {
 const s=await queueStats(env);
 return {...s.reviews,error:(s.reviews.error||0)+s.cleanup_failures+(s.publication.failed||0)+(s.publication.uncertain||0)};
}
export default {
 async fetch(req,env) {
  try {
   const u=new URL(req.url);
   if(u.hostname!==HOME)return new Response("Not found",{status:404});
   const identity=(req.headers.get("Cf-Access-Authenticated-User-Email")||"").trim().toLowerCase();
   if((!env.OWNER_EMAIL || identity!==env.OWNER_EMAIL.trim().toLowerCase())) return new Response("Access denied",{status:403,headers:securityHeaders});
   const path=u.pathname;
   if(req.method==="GET"&&path==="/")return new Response(page(),{headers:{...securityHeaders,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'"}});
   if(req.method==="GET"&&path==="/manifest.webmanifest")return json({name:"Social Studio Review",short_name:"Image Review",start_url:"/",display:"standalone",background_color:"#090a0d",theme_color:"#090a0d",icons:[{src:"/icon.svg",type:"image/svg+xml",sizes:"any",purpose:"any"}]});
   if(req.method==="GET"&&path==="/icon.svg")return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="32" fill="#171a23"/><path d="m64 22 12 30 30 12-30 12-12 30-12-30-30-12 30-12Z" fill="#abb4fa"/></svg>',{headers:{...securityHeaders,"Content-Type":"image/svg+xml"}});
   if(req.method==="GET"&&path==="/api/health")return json({ok:true,project:"social-image-review",publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only"});
   if(req.method==="GET"&&path==="/api/items") {
    await sync(env);
    const status=u.searchParams.get("status")||"pending";
    if(!["pending","approved","rejected","scheduling","scheduled","published","error"].includes(status))return json({error:"Invalid status"},400);
    const filter=status==="error" ? "(i.status='error' OR c.status='failed' OR j.status IN ('failed','uncertain'))" : "i.status=?";
    const sql="SELECT i.id,i.object_key,i.batch_id,i.image_index,i.status,i.created_at,i.decided_at,i.scheduled_at,i.postiz_post_id,i.last_error,j.publish_at AS planned_at,j.status AS publication_state,j.attempts AS publication_attempts,j.last_error AS publication_error,c.status AS cleanup_state,c.last_error AS cleanup_error FROM image_reviews i LEFT JOIN publication_jobs j ON j.image_id=i.id LEFT JOIN cleanup_jobs c ON c.image_id=i.id WHERE "+filter+" ORDER BY i.created_at ASC,i.image_index ASC LIMIT 200";
    const stmt=env.DB.prepare(sql);
    const items=status==="error" ? await stmt.all() : await stmt.bind(status).all();
    return json({items:items.results||[],stats:await stats(env),publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only"});
   }
   if(req.method==="GET"&&path==="/api/jobs") {
    const r=await env.DB.prepare("SELECT j.image_id,j.publish_at,j.status,j.attempts,j.next_attempt_at,j.postiz_post_id,j.provider_status,j.last_error,j.created_at,i.batch_id,i.image_index FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id ORDER BY j.publish_at ASC LIMIT 200").all();
    return json({jobs:r.results||[],publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only"});
   }
   if(req.method==="GET"&&path==="/api/events") {
    const id=u.searchParams.get("id")||"";
    if(!/^[A-Za-z0-9_-]{8,80}-[0-3]$/.test(id))return json({error:"Image ID required"},400);
    const r=await env.DB.prepare("SELECT event,detail,created_at FROM review_events WHERE image_id=? ORDER BY id DESC LIMIT 100").bind(id).all();
    return json({events:r.results||[]});
   }
   if(req.method==="GET"&&path.startsWith("/media/")){
    const key=decodeURIComponent(path.substring(7));
    if(!KEY_MATCH.test(key))return new Response("Not found",{status:404});
    const record=await env.DB.prepare("SELECT status FROM image_reviews WHERE object_key=?").bind(key).first();
    if(!record||record.status==="rejected")return new Response("Not found",{status:404});
    const media=await env.PENDING.get(key);
    if(!media)return new Response("Not found",{status:404});
    return new Response(media.body,{headers:{...securityHeaders,"Content-Type":media.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, max-age=60"}});
   }
   if(req.method==="POST"&&path==="/api/decision"){
    if(req.headers.get("Origin")!=="https://"+HOME)return json({error:"Origin not allowed"},403);
    if(!String(req.headers.get("Content-Type")||"").startsWith("application/json"))return json({error:"JSON required"},415);
    if(Number(req.headers.get("Content-Length")||0)>1024)return json({error:"Body too large"},413);
    const raw=await req.text();
    if(raw.length>1024)return json({error:"Body too large"},413);
    let payload;try{payload=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
    try{return json(await reviewDecision(env,payload?.id,payload?.decision))}
    catch(error){if(error?.status===409||error?.status===400)return json({error:error.message},error.status);throw error}
   }
   return json({error:"Not found"},404);
  } catch(e){return json({error:"Request failed",details:String(e).slice(0,140)},500)}
 },
 async scheduled(controller,env,ctx) {
  // Periodic cleanup only. Never dispatch held posts to Postiz/Instagram.
  ctx.waitUntil(maintenance(env).then(result=>console.log("review cleanup",JSON.stringify(result))).catch(e=>console.error("review cleanup failed",String(e))));
 }
};
