
import { reviewDecision, maintenance, queueStats, retryFailedCleanup } from "./operations.js";
import { LIVE_POSTING_ENABLED } from "./queue.js";
import { reconcileHeldManifests } from "./manifest.js";
import { listCalendar, manageHeldSlot, retryCancelledManifestCleanup } from "./schedule.js";
import { dryRunAction } from "./dry-run.js";
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

/* Review workspace: card navigation, history, scheduling and IST calendar */
[hidden]{display:none!important}
.workspace-switch{display:flex;align-items:center;gap:6px;margin:2px 0 15px}
.workspace-switch button{background:transparent;border:1px solid var(--line);color:#a7aab8;padding:9px 14px;border-radius:11px;font-size:12px;font-weight:600}
.workspace-switch button.selected{background:#252738;border-color:#585a79;color:#e5e7fd}
.browse-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px}
.browse-nav button,.card-tools button,.calendar-toolbar button{background:#1d1f29;color:#e0e1ed;border:1px solid #393b49;border-radius:10px;padding:10px 13px;font-size:12px;font-weight:600}
.browse-nav span{color:#a6a7b7;font-size:12px;font-variant-numeric:tabular-nums}
.browse-nav button:disabled{opacity:.35}
.filmstrip{display:flex;gap:9px;justify-content:center;overflow-x:auto;scrollbar-width:thin;padding:12px 0 3px}
.filmstrip button{flex:0 0 52px;width:52px;height:69px;border:2px solid #333640;border-radius:9px;overflow:hidden;padding:0;background:#17181c;position:relative;color:#888}
.filmstrip button.active{border-color:var(--accent)}.filmstrip img{width:100%;height:100%;object-fit:cover}
.filmstrip button span{position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:9px;color:#fff;background:#111b;padding:3px}
.card-tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;align-items:center;justify-content:center}
.card-tools button:hover,.browse-nav button:hover,.workspace-switch button:hover{border-color:#7b7e99}
.card-tools .caution{border-color:#6f4248;color:#ffb5b8}
.card-summary{font-size:12px;color:#979bad;text-align:center;margin-top:8px}
.calendar-panel{margin-bottom:20px}
.calendar-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:15px}
.calendar-toolbar h2{font-size:18px;letter-spacing:-.03em;margin:0}
.calendar-toolbar button{min-width:40px}
.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.calendar-weekdays{text-align:center;font-size:10px;color:#868b9b;padding-bottom:8px}
.daycell{min-height:64px;padding:7px 3px;border:1px solid #292b36;border-radius:10px;background:#14151b;color:#c9cad3;display:flex;flex-direction:column;gap:5px;align-items:center;font-size:12px}
.daycell:disabled{background:#0c0d11;border-color:#191a1e}
.daycell.today{border-color:#7980af}.daycell.has-events{background:#232535}
.daycount{font-size:9px;background:#343b68;border-radius:8px;padding:1px 5px;color:#c1c6ff}
.agenda{margin-top:21px;display:flex;flex-direction:column;gap:8px}
.agenda h3{font-size:14px;letter-spacing:-.01em;margin:8px 0 4px}
.agenda-item{width:100%;display:flex;text-align:left;justify-content:space-between;align-items:center;gap:12px;background:#171922;border:1px solid #31343f;border-radius:13px;padding:12px 14px;color:#e9eaf0}
.agenda-item strong{display:block;font-size:13px}.agenda-item small{display:block;color:#a1a7b5;margin-top:4px;font-size:11px}
.held-label{font-size:10px;color:#f4cf84;border:1px solid #5a4e34;padding:4px 6px;border-radius:8px;white-space:nowrap}
.calendar-notice{background:#211e1a;border:1px solid #504436;border-radius:12px;color:#e4cba3;font-size:12px;padding:11px 13px;margin-bottom:15px}
.modal-overlay{position:fixed;inset:0;background:#000c;z-index:90;display:flex;align-items:center;justify-content:center;padding:17px}
.modal-dialog{width:min(100%,455px);max-height:85dvh;overflow:auto;border:1px solid #454655;border-radius:18px;background:#191b23;padding:24px;box-shadow:0 20px 80px #000a}
.modal-dialog h2{margin:0 0 10px;font-size:20px}.modal-dialog p,.modal-dialog label{font-size:13px;color:#bdc0cf}
.modal-dialog input{width:100%;color:#fff;background:#0f1017;border:1px solid #535468;border-radius:9px;padding:12px;margin-top:8px;font:inherit;color-scheme:dark}
.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:19px}
.modal-actions button{padding:10px 16px;border-radius:10px;font:inherit;border:1px solid #4a4c59;color:#eee;background:#272934}
.modal-actions button.primary{background:#5e65a8;border-color:#7078be}
.event-list{list-style:none;padding:0;margin:15px 0;display:flex;flex-direction:column;gap:10px}
.event-list li{padding:10px 12px;border:1px solid #343646;border-radius:10px}
.event-list strong{display:block;font-size:12px;color:#d8dbea}.event-list small{display:block;font-size:11px;color:#a0a3af;margin-top:5px}
@media(min-width:480px){.daycell{min-height:85px}}
</style></head>
<body><main class="shell">
<header class="top"><div class="brand"><div class="mark">✦</div><span>SOCIAL STUDIO<span style="color:#777986"> / REVIEW</span></span></div><div class="env" style="color:#e6cc8c;border-color:#72613e">Publishing paused</div></header>
<section class="titlebar"><div><div class="eyebrow">Creative approval</div><h1>Review queue</h1></div><div class="count" id="counter">—</div></section>
<div class="workspace-switch"><button type="button" id="queueView" class="selected">◫ Image queue</button><button type="button" id="calendarView">▦ Calendar</button></div>
<nav class="tabs" id="tabs" aria-label="Review filters"></nav>
<div class="progress"><div id="progress"></div></div>
<section class="stage" id="stage" aria-live="polite"></section>
<section class="calendar-panel" id="calendarPanel" hidden aria-live="polite"></section>
<div class="controls" id="controls">
<button class="action reject" id="rejectBtn" aria-label="Reject image" title="Reject (left arrow)"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
<button class="action refresh" id="refreshBtn" aria-label="Refresh queue" title="Refresh"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 1-2.3-5.6M20 4v7h-7"/></svg></button>
<button class="action approve" id="approveBtn" aria-label="Approve image" title="Approve (right arrow)"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></button>
</div>
<div class="browse-nav" id="browseNav" hidden><button id="previousCard" type="button">← Previous</button><span id="browsePosition">1 / 1</span><button id="nextCard" type="button">Next →</button></div>
<div class="filmstrip" id="filmstrip" hidden></div>
<p class="hint" id="hint">Swipe left to reject · Swipe right to approve</p>
<footer class="bottom"><span>DiscoverXploration · Image by image</span><strong>NO LIVE POSTS</strong></footer></main>
<div class="toast" role="status" id="toast"></div><div id="modalRoot"></div>
<script>
(()=>{'use strict';
const TABS=['pending','all','approved','scheduled','published','error'];
const labels={pending:'Pending',all:'All',approved:'Approved',scheduled:'Scheduled',published:'Published',error:'Issues'};
const state={view:'queue',tab:'pending',items:[],index:0,stats:{},busy:false,calendarMonth:null,calendarItems:[]};
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}
async function api(path,options){const r=await fetch(path,{credentials:'same-origin',...options});const data=await r.json().catch(()=>({error:'Unexpected response'}));if(!r.ok)throw Error(data.error||'Request failed');return data}
function current(){return state.items[state.index]}
function showTabs(){const tabs=$('tabs');tabs.innerHTML=TABS.map(t=>'<button class="tab '+(state.tab===t?'active':'')+'" data-tab="'+t+'">'+labels[t]+' '+(state.stats[t]||'')+'</button>').join('');tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.view='queue';state.tab=b.dataset.tab;syncViewButtons();load()}))}
function render(){
 if(state.view==='calendar'){renderCalendar();return}
 $('stage').hidden=false;$('calendarPanel').hidden=true;$('tabs').hidden=false;$('progress').hidden=false;$('controls').hidden=false;
 showTabs();const item=current(),n=state.items.length;
 $('browseNav').hidden=state.tab==='pending'||n<2;
 $('filmstrip').hidden=state.tab==='pending'||n<2;
 $('browsePosition').textContent=n?(state.index+1)+' / '+n:'0 / 0';
 $('previousCard').disabled=state.index<=0;
 $('nextCard').disabled=state.index>=n-1;
 renderFilmstrip();
 $('counter').textContent=n?((state.index+1)+' / '+n):'0 / 0';
 $('progress').style.width=n?Math.min(100,((state.index+1)/n)*100)+'%':'0%';
 $('controls').style.display=state.tab==='pending'?'flex':'none';
 $('hint').hidden=false;
 $('hint').textContent=state.tab==='pending'?'Swipe left to reject · Swipe right to approve':'Browse with arrows · image decisions are retained';
 if(!item){$('stage').innerHTML='<div class="empty"><div class="symbol">✦</div><h2>'+(state.tab==='pending'?'All reviewed':'Nothing here yet')+'</h2><p>'+(state.tab==='pending'?'New images will appear here after the generation workflow uploads them to private R2 storage.':'No images with this status yet.')+'</p></div>';return}
 const img=item.status==='rejected'?'<div style="height:100%;display:grid;place-items:center;color:#777985;font-size:13px">Image deleted from storage</div>':'<img loading="eager" draggable="false" alt="Image awaiting review" src="/media/'+encodeURIComponent(item.object_key)+'"/>';
 const simulated=item.status==='approved' && item.publication_state==='held' && !!item.simulation_state;
 const cardLabel=simulated?'SIMULATED · '+escape(labels[item.display_status]||item.display_status).toUpperCase():escape(labels[item.display_status]||item.display_status||item.status);
 const cardDetail=simulated?'Simulated: '+escape(item.simulation_state.replace('simulated_',''))+' · REAL: HELD · NO INSTAGRAM POST':escape(item.status);
 $('stage').innerHTML='<article class="review" id="review">'+img+'<span class="tag">'+cardLabel+'</span><span class="stamp reject" id="rStamp">REJECT</span><span class="stamp approve" id="aStamp">APPROVE</span><div class="card-footer"><div><strong>Image '+(item.image_index+1)+' of 4</strong><p>Batch '+escape(item.batch_id.slice(0,12))+' · '+cardDetail+(item.planned_at?' · PLANNED '+new Date(item.planned_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'')+'</p></div><span style="font-size:12px;color:#ccc">'+(state.index+1)+' / '+n+'</span></div></article>';
 if(item.status==='approved' && (state.tab==='approved'||state.tab==='all' || simulated && ['scheduled','error'].includes(state.tab))){
  const panel=document.createElement('div');
  panel.style.cssText='margin:13px 0 0;padding:13px;border:1px solid #363944;border-radius:12px;background:#15161c;display:flex;flex-direction:column;align-items:center;gap:9px';
  const heading=document.createElement('strong');
  heading.textContent='POSTIZ SIMULATION ONLY';heading.style.cssText='color:#b9bff2;font-size:11px;letter-spacing:.1em';
  panel.appendChild(heading);
  const status=document.createElement('div');
  status.textContent=item.simulation_state ? 'Mock status: '+item.simulation_state.replace('simulated_','') : 'Not simulated yet';
  status.style.cssText='font-size:12px;color:#a4a6b1';
  panel.appendChild(status);
  const buttons=document.createElement('div');buttons.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:7px';
  function addDryRunButton(label,action){
   const button=document.createElement('button');
   button.type='button';button.textContent=label;
   button.style.cssText='border:1px solid #4a4c60;border-radius:9px;background:#242635;color:#e4e5f3;font-size:12px;padding:9px 12px';
   button.addEventListener('click',async()=>{
    if(state.busy)return;state.busy=true;button.disabled=true;
    try{const result=await api('/api/dry-run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,action})});
     toast('Simulation: '+result.simulation_state.replace('simulated_',''));
     state.tab=result.simulation_state==='simulated_scheduled'?'scheduled':result.simulation_state==='simulated_published'?'published':'error';
     await load();
    }catch(e){toast(e.message)}finally{state.busy=false;button.disabled=false}
   });
   buttons.appendChild(button);
  }
  if(!item.simulation_state)addDryRunButton('Simulate scheduling','prepare');
  else if(item.simulation_state==='simulated_scheduled'){
    addDryRunButton('Simulate published','published');
    addDryRunButton('Simulate failed','failed');
    addDryRunButton('Simulate uncertain','uncertain');
  }else if(item.simulation_state==='simulated_uncertain'){
    addDryRunButton('Verify scheduled','verified_scheduled');
    addDryRunButton('Verify published','published');
    addDryRunButton('Verify failed','failed');
  }
  panel.appendChild(buttons);
  const note=document.createElement('small');
  note.textContent='No real Postiz or Instagram requests. Held publishing slot is unchanged.';
  note.style.cssText='font-size:11px;color:#868996;text-align:center';
  panel.appendChild(note);$('stage').appendChild(panel);
 }
 if(state.tab==='error'&&item.cleanup_state==='failed'){
  $('stage').insertAdjacentHTML('beforeend','<button id="retryCleanup" style="margin:14px auto 0;display:block;background:#2d2325;color:#ffb4bc;border:1px solid #714149;border-radius:12px;padding:10px 20px">Retry failed image deletion</button>');
  $('retryCleanup').addEventListener('click',async()=>{
    if(state.busy)return;state.busy=true;
    try{const result=await api('/api/cleanup/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});toast('Cleanup: '+result.cleanup);await load()}
    catch(e){toast(e.message)}
    finally{state.busy=false}
  });
 }
 addCardTools(item);
 if(state.tab==='pending')swipe($('review'));
 else {const imgEl=$('review').querySelector('img');if(imgEl)imgEl.addEventListener('click',()=>window.open(imgEl.src,'_blank','noopener,noreferrer'))}
}
async function load(focusId){try{const data=await api('/api/items?status='+encodeURIComponent(state.tab));state.items=data.items||[];state.stats=data.stats||{};state.index=focusId?Math.max(0,state.items.findIndex(x=>x.id===focusId)):0;render()}catch(e){toast(e.message);$('stage').innerHTML='<div class="empty"><h2>Could not load queue</h2><p>'+escape(e.message)+'</p></div>'}}
async function decide(decision){const item=current();if(!item||state.busy||state.tab!=='pending')return;state.busy=true;$('rejectBtn').disabled=true;$('approveBtn').disabled=true;const card=$('review');if(card){card.style.transform=decision==='approved'?'translateX(120%) rotate(13deg)':'translateX(-120%) rotate(-13deg)';card.style.opacity='.2'}
 try{await api('/api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,decision})});state.items.splice(state.index,1);if(state.index>=state.items.length)state.index=Math.max(0,state.items.length-1);state.stats.pending=Math.max(0,(state.stats.pending||1)-1);state.stats[decision]=(state.stats[decision]||0)+1;render();toast(decision==='approved'?'Approved · slot reserved (Instagram paused)':'Rejected · cleanup requested')}catch(e){toast(e.message);render()}finally{state.busy=false;$('rejectBtn').disabled=false;$('approveBtn').disabled=false}}
function swipe(card){let start=null;card.addEventListener('pointerdown',e=>{if(state.busy||e.button!==0)return;start={x:e.clientX,y:e.clientY};card.classList.add('dragging');card.setPointerCapture(e.pointerId)});
card.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>Math.abs(dx)*1.7)return;card.style.transform='translateX('+dx+'px) rotate('+(dx/25)+'deg)';const opacity=Math.min(1,Math.abs(dx)/110);$('rStamp').style.opacity=dx<0?opacity:0;$('aStamp').style.opacity=dx>0?opacity:0});
card.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x;start=null;card.classList.remove('dragging');if(dx>85)decide('approved');else if(dx< -85)decide('rejected');else {card.style.transform='';$('rStamp').style.opacity=0;$('aStamp').style.opacity=0}});
card.addEventListener('pointercancel',()=>{start=null;card.classList.remove('dragging');card.style.transform=''})}
$('approveBtn').addEventListener('click',()=>decide('approved'));$('rejectBtn').addEventListener('click',()=>decide('rejected'));$('refreshBtn').addEventListener('click',()=>load());
$('previousCard').addEventListener('click',()=>navigate(-1));$('nextCard').addEventListener('click',()=>navigate(1));
$('queueView').addEventListener('click',()=>{state.view='queue';syncViewButtons();load()});
$('calendarView').addEventListener('click',()=>{state.view='calendar';syncViewButtons();loadCalendar()});
window.addEventListener('keydown',e=>{if($('modalRoot').childElementCount){if(e.key==='Escape')closeModal();return}if(state.busy)return;if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(state.view==='calendar')return;if(state.tab==='pending'&&e.key==='ArrowLeft')decide('rejected');else if(state.tab==='pending'&&e.key==='ArrowRight')decide('approved');else if(e.key==='ArrowLeft')navigate(-1);else if(e.key==='ArrowRight')navigate(1)});

function navigate(offset){
 if(state.busy || state.view!=='queue')return;
 const idx=state.index+offset;
 if(idx<0||idx>=state.items.length)return;
 state.index=idx;render();
}
function renderFilmstrip(){
 const el=$('filmstrip'),n=state.items.length;
 if(state.tab==='pending'||n<2){el.innerHTML='';return}
 const start=Math.max(0,Math.min(state.index-4,n-8)),end=Math.min(n,start+8);
 el.innerHTML=state.items.slice(start,end).map((item,offset)=>{
  const i=start+offset;
  const img=item.status==='rejected'?'<span style="position:static;background:none;font-size:12px">×</span>':'<img loading="lazy" alt="Image '+(item.image_index+1)+'" src="/media/'+encodeURIComponent(item.object_key)+'"/>';
  return '<button type="button" class="'+(i===state.index?'active':'')+'" data-card="'+i+'" aria-label="View item '+(i+1)+'">'+img+'<span>'+(i+1)+'</span></button>';
 }).join('');
 el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.index=Number(b.dataset.card);render()}));
}
function syncViewButtons(){
 $('queueView').classList.toggle('selected',state.view==='queue');
 $('calendarView').classList.toggle('selected',state.view==='calendar');
}
function addTool(parent,label,fn,warning=false){
 const button=document.createElement('button');button.type='button';button.textContent=label;
 if(warning)button.className='caution';
 button.addEventListener('click',fn);parent.appendChild(button);return button;
}
function closeModal(){$('modalRoot').innerHTML=''}
function openModal(title,content){
 closeModal();
 const overlay=document.createElement('div');overlay.className='modal-overlay';overlay.setAttribute('role','presentation');
 const panel=document.createElement('section');panel.className='modal-dialog';panel.setAttribute('role','dialog');
 panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
 const heading=document.createElement('h2');heading.textContent=title;panel.appendChild(heading);
 overlay.appendChild(panel);$('modalRoot').appendChild(overlay);
 overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal()});
 if(content)content(panel);return panel;
}
function localIST(iso){return new Date(Date.parse(iso)+330*60000).toISOString().slice(0,16)}
function toUTCFromIST(value){
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value))throw Error('Choose a valid IST date and time');
 return new Date(Date.parse(value+':00Z')-330*60000).toISOString().replace('.000Z','Z');
}
function addCardTools(item){
 const tools=document.createElement('div');tools.className='card-tools';
 addTool(tools,'View history',()=>showHistory(item));
 if(item.status==='approved'&&item.publication_state==='held'){
  addTool(tools,'Change held slot',()=>openScheduleDialog(item,'reschedule'));
  addTool(tools,'Cancel hold',()=>cancelHeldSlot(item),true);
 }
 if(item.status==='approved'&&item.publication_state==='cancelled'){
  addTool(tools,'Reserve new slot',()=>openScheduleDialog(item,'restore'));
 }
 $('stage').appendChild(tools);
 if(item.publication_state==='cancelled'){
  const p=document.createElement('p');p.className='card-summary';p.textContent='Hold cancelled · Image retained · Not published';
  $('stage').appendChild(p);
 }
}
async function showHistory(item){
 const panel=openModal('Image activity',section=>{
  const note=document.createElement('p');note.textContent='Image '+(item.image_index+1)+' · '+item.batch_id;section.appendChild(note);
  const content=document.createElement('div');content.textContent='Loading activity...';content.id='eventContents';section.appendChild(content);
  const footer=document.createElement('div');footer.className='modal-actions';
  addTool(footer,'Close',closeModal);section.appendChild(footer);
 });
 try{
  const x=await api('/api/events?id='+encodeURIComponent(item.id));
  if(!$('eventContents'))return;
  $('eventContents').innerHTML=x.events.length?'<ul class="event-list">'+x.events.map(e=>'<li><strong>'+escape(e.event.replaceAll('_',' '))+'</strong><small>'+escape(e.detail||'')+'</small><small>'+escape(new Date(e.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))+' IST</small></li>').join('')+'</ul>':'No activity recorded';
 }catch(e){if($('eventContents'))$('eventContents').textContent=e.message}
}
async function cancelHeldSlot(item){
 if(!confirm('Cancel the reserved slot for image '+(item.image_index+1)+'? The approved JPEG will stay in R2 and Instagram remains disabled.'))return;
 if(state.busy)return;state.busy=true;
 try{
  const p=await api('/api/slot',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id:item.id,action:'cancel',expected_at:item.planned_at})});
  toast(p.manifest_state==='retry_pending'?'Slot cancelled; manifest cleanup queued':'Held slot cancelled');
  state.tab='all';state.view='queue';syncViewButtons();await load(item.id);
 }catch(e){toast(e.message)}finally{state.busy=false}
}
function openScheduleDialog(item,action){
 const panel=openModal(action==='restore'?'Reserve a held slot':'Change held slot',section=>{
  const desc=document.createElement('p');desc.textContent='Planning only: no Postiz or Instagram request. Times are always in India Standard Time (IST).';
  section.appendChild(desc);
  const label=document.createElement('label');label.textContent='Date and time (IST)';
  const input=document.createElement('input');input.type='datetime-local';input.id='slotInput';
  input.min=localIST(new Date(Date.now()+61*60000).toISOString());
  input.max=localIST(new Date(Date.now()+90*86400000).toISOString());
  input.value=item.planned_at?localIST(item.planned_at):localIST(new Date(Date.now()+2*86400000).toISOString());
  label.appendChild(input);section.appendChild(label);
  const footer=document.createElement('div');footer.className='modal-actions';
  addTool(footer,'Keep current',closeModal);
  const save=addTool(footer,action==='restore'?'Reserve slot':'Save new time',async()=>{
   if(state.busy)return;state.busy=true;save.disabled=true;
   try{
    const body={id:item.id,action,publish_at:toUTCFromIST(input.value)};
    if(action==='reschedule')body.expected_at=item.planned_at;
    const result=await api('/api/slot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    toast(result.duplicate?'No changes':'Held slot updated; Instagram still paused');
    closeModal();state.tab='all';state.view='queue';syncViewButtons();await load(item.id);
   }catch(e){toast(e.message)}finally{state.busy=false;save.disabled=false}
  });
  save.classList.add('primary');section.appendChild(footer);
 });
}
function currentISTMonth(){
 return new Date(Date.now()+330*60000).toISOString().slice(0,7);
}
function shiftMonth(value,delta){
 const [year,month]=value.split('-').map(Number);
 return new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,7);
}
function istDate(value){
 return new Date(Date.parse(value)+330*60000).toISOString().slice(0,10);
}
async function loadCalendar(){
 if(!state.calendarMonth)state.calendarMonth=currentISTMonth();
 $('calendarPanel').hidden=false;$('calendarPanel').textContent='Loading held slots...';
 $('stage').hidden=true;$('tabs').hidden=true;$('progress').hidden=true;$('controls').hidden=true;
 $('browseNav').hidden=true;$('filmstrip').hidden=true;$('hint').hidden=true;
 try{
  const r=await api('/api/calendar?month='+encodeURIComponent(state.calendarMonth));
  state.calendarItems=r.items||[];renderCalendar();
 }catch(e){$('calendarPanel').textContent='Could not load calendar: '+e.message;toast(e.message)}
}
function renderCalendar(){
 $('calendarPanel').hidden=false;$('stage').hidden=true;$('tabs').hidden=true;$('progress').hidden=true;
 $('controls').hidden=true;$('browseNav').hidden=true;$('filmstrip').hidden=true;$('hint').hidden=true;
 $('counter').textContent=state.calendarItems.length+' held';
 const panel=$('calendarPanel');
 const [year,month]=state.calendarMonth.split('-').map(Number);
 const first=new Date(Date.UTC(year,month-1,1)).getUTCDay();
 const offset=(first+6)%7;
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const counts={};
 for(const item of state.calendarItems){const day=Number(istDate(item.publish_at).slice(-2));counts[day]=(counts[day]||0)+1}
 const name=new Date(Date.UTC(year,month-1,1)).toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'});
 const currentDay=new Date(Date.now()+330*60000).toISOString().slice(0,10);
 let html='<div class="calendar-notice">These are <strong>held planning slots</strong>. No images are scheduled or published in Postiz or Instagram.</div>';
 html+='<div class="calendar-toolbar"><button id="calendarPrev" aria-label="Previous month">←</button><h2>'+escape(name)+'</h2><button id="calendarNext" aria-label="Next month">→</button></div>';
 html+='<div class="calendar-weekdays">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<span>'+x+'</span>').join('')+'</div>';
 html+='<div class="calendar-grid">';
 for(let i=0;i<Math.ceil((offset+days)/7)*7;i++){
  const day=i-offset+1;
  if(day<1||day>days){html+='<div class="daycell" style="opacity:.12"></div>';continue}
  const date=state.calendarMonth+'-'+String(day).padStart(2,'0');
  html+='<button class="daycell '+(currentDay===date?'today ':'')+(counts[day]?'has-events':'')+'" data-day="'+escape(date)+'" type="button"><span>'+day+'</span>'+(counts[day]?'<span class="daycount">'+counts[day]+' hold'+(counts[day]>1?'s':'')+'</span>':'')+'</button>';
 }
 html+='</div><div class="agenda" id="calendarAgenda"><h3>Held slots this month</h3>';
 if(!state.calendarItems.length)html+='<p style="font-size:13px;color:#a0a2b0">No held slots for this month. Cancelled holds are excluded.</p>';
 for(const item of state.calendarItems){
  const day=istDate(item.publish_at),hour=new Date(Date.parse(item.publish_at)+330*60000).toISOString().slice(11,16);
  html+='<button class="agenda-item" type="button" data-image="'+escape(item.image_id)+'" data-date="'+day+'"><span><strong>'+escape(day)+' · '+hour+' IST</strong><small>Image '+(item.image_index+1)+' · batch '+escape(item.batch_id.slice(0,12))+(item.simulation_state?' · '+escape(item.simulation_state.replace('simulated_','SIMULATED ')):'')+'</small></span><span class="held-label">HELD</span></button>';
 }
 html+='</div>';panel.innerHTML=html;
 $('calendarPrev').addEventListener('click',()=>{state.calendarMonth=shiftMonth(state.calendarMonth,-1);loadCalendar()});
 $('calendarNext').addEventListener('click',()=>{state.calendarMonth=shiftMonth(state.calendarMonth,1);loadCalendar()});
 panel.querySelectorAll('.daycell[data-day]').forEach(button=>button.addEventListener('click',()=>{
  const event=panel.querySelector('.agenda-item[data-date="'+button.dataset.day+'"]');
  if(event)event.scrollIntoView({behavior:'smooth',block:'nearest'});
 }));
 panel.querySelectorAll('.agenda-item').forEach(button=>button.addEventListener('click',()=>{
  state.view='queue';state.tab='all';syncViewButtons();load(button.dataset.image);
 }));
}
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
      const timestamp=file.uploaded ? new Date(file.uploaded) : new Date();
      const createdAt=Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString();
      all.push(env.DB.prepare("INSERT OR IGNORE INTO image_reviews (id,object_key,batch_id,image_index,created_at) VALUES (?,?,?,?,?)").bind(id,file.key,match[1],Number(match[2]),createdAt));
    }
    cursor = batch.truncated?batch.cursor:undefined;
  } while (cursor && all.length < 3000);
  if (all.length) for(let i=0;i<all.length;i+=100) await env.DB.batch(all.slice(i,i+100));
}
// UI statuses are a view over simulated outcomes, never real Postiz state.
const viewFromSQL = "FROM image_reviews i LEFT JOIN publication_jobs j ON j.image_id=i.id LEFT JOIN cleanup_jobs c ON c.image_id=i.id LEFT JOIN publication_simulations d ON d.image_id=i.id";
const viewStatusSQL = `CASE
 WHEN i.status='error' OR c.status='failed' OR j.status IN ('failed','uncertain') THEN 'error'
 WHEN j.status='published' OR i.status='published' THEN 'published'
 WHEN j.status='scheduled' OR i.status='scheduled' THEN 'scheduled'
 WHEN i.status='approved' AND j.status='held' AND d.status='simulated_scheduled' THEN 'scheduled'
 WHEN i.status='approved' AND j.status='held' AND d.status='simulated_published' THEN 'published'
 WHEN i.status='approved' AND j.status='held' AND d.status IN ('simulated_failed','simulated_uncertain') THEN 'error'
 ELSE i.status END`;
async function stats(env) {
 // Deleted rejected items are not part of the visible queue. Failed R2 deletion
 // remains visible as an actionable Issues item until cleanup can succeed.
 const r=await env.DB.prepare("SELECT "+viewStatusSQL+" AS view_status,COUNT(*) AS n "+viewFromSQL+" WHERE i.status<>'rejected' OR c.status='failed' GROUP BY "+viewStatusSQL).all();
 return Object.fromEntries((r.results||[]).map(x=>[x.view_status,x.n]));
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
   if(req.method==="GET"&&path==="/api/health")return json({ok:true,project:"social-image-review",publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only",dry_run_enabled:true});
   if(req.method==="GET"&&path==="/api/items") {
    await sync(env);
    const status=u.searchParams.get("status")||"pending";
    if(!["all","pending","approved","scheduling","scheduled","published","error"].includes(status))return json({error:"Invalid status"},400);
    const sql="SELECT i.id,i.object_key,i.batch_id,i.image_index,i.status,("+viewStatusSQL+") AS display_status,i.created_at,i.decided_at,i.scheduled_at,i.postiz_post_id,i.last_error,CASE WHEN j.status='cancelled' THEN NULL ELSE j.publish_at END AS planned_at,d.status AS simulation_state,d.mock_post_id AS simulated_post_id,j.status AS publication_state,j.attempts AS publication_attempts,j.last_error AS publication_error,c.status AS cleanup_state,c.last_error AS cleanup_error "+viewFromSQL+(status==="all"?" WHERE i.status<>'rejected'":status==="error"?" WHERE ("+viewStatusSQL+")=? AND (i.status<>'rejected' OR c.status='failed')":" WHERE ("+viewStatusSQL+")=? AND i.status<>'rejected'")+" ORDER BY i.created_at DESC,i.image_index ASC LIMIT 200";
    const items=status==="all"?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(status).all();
    return json({items:items.results||[],stats:await stats(env),publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only",limit:200});
   }
   if(req.method==="GET"&&path==="/api/calendar") {
    try{return json(await listCalendar(env,u.searchParams.get("month")))}
    catch(error){if(error?.status===400)return json({error:error.message},400);throw error}
   }
   if(req.method==="POST"&&path==="/api/slot") {
    if(req.headers.get("Origin")!=="https://"+HOME)return json({error:"Origin not allowed"},403);
    if(!String(req.headers.get("Content-Type")||"").startsWith("application/json"))return json({error:"JSON required"},415);
    if(Number(req.headers.get("Content-Length")||0)>1024)return json({error:"Body too large"},413);
    const raw=await req.text();if(raw.length>1024)return json({error:"Body too large"},413);
    let payload;try{payload=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
    try{return json(await manageHeldSlot(env,payload))}
    catch(error){if([400,409].includes(error?.status))return json({error:error.message},error.status);throw error}
   }
   if(req.method==="GET"&&path==="/api/jobs") {
    const r=await env.DB.prepare("SELECT j.image_id,j.publish_at,j.status,j.attempts,j.next_attempt_at,j.postiz_post_id,j.provider_status,j.last_error,j.created_at,i.batch_id,i.image_index FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id ORDER BY j.publish_at ASC LIMIT 200").all();
    return json({jobs:r.results||[],publishing_enabled:LIVE_POSTING_ENABLED,mode:"hold_only"});
   }
   if(req.method==="GET"&&path==="/api/simulations") {
    const r=await env.DB.prepare("SELECT s.image_id,s.status AS simulation_state,s.publish_at AS planned_at,s.mock_post_id,s.updated_at FROM publication_simulations s ORDER BY s.updated_at DESC LIMIT 200").all();
    return json({simulations:r.results||[],mode:"dry_run_only",publishing_enabled:false});
   }
   if(req.method==="POST"&&path==="/api/dry-run") {
    if(req.headers.get("Origin")!=="https://"+HOME)return json({error:"Origin not allowed"},403);
    if(!String(req.headers.get("Content-Type")||"").startsWith("application/json"))return json({error:"JSON required"},415);
    if(Number(req.headers.get("Content-Length")||0)>1024)return json({error:"Body too large"},413);
    const raw=await req.text();if(raw.length>1024)return json({error:"Body too large"},413);
    let payload;try{payload=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
    try{return json(await dryRunAction(env,payload?.id,payload?.action))}
    catch(error){if([400,409,422].includes(error?.status))return json({error:error.message},error.status);throw error}
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
   if(req.method==="POST"&&path==="/api/cleanup/retry") {
    if(req.headers.get("Origin")!=="https://"+HOME)return json({error:"Origin not allowed"},403);
    if(!String(req.headers.get("Content-Type")||"").startsWith("application/json"))return json({error:"JSON required"},415);
    if(Number(req.headers.get("Content-Length")||0)>1024)return json({error:"Body too large"},413);
    const raw=await req.text();if(raw.length>1024)return json({error:"Body too large"},413);
    let payload;try{payload=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
    try{return json(await retryFailedCleanup(env,payload?.id))}
    catch(error){if(error?.status===409||error?.status===400)return json({error:error.message},error.status);throw error}
   }
   return json({error:"Not found"},404);
  } catch(e){return json({error:"Request failed",details:String(e).slice(0,140)},500)}
 },
 async scheduled(controller,env,ctx) {
  // Periodic cleanup only. Never dispatch held posts to Postiz/Instagram.
  ctx.waitUntil((async()=>{await sync(env);const cleanup=await maintenance(env);const held=await reconcileHeldManifests(env);const cancelledManifests=await retryCancelledManifestCleanup(env);return {cleanup,held,cancelledManifests}})().then(result=>console.log("review maintenance",JSON.stringify(result))).catch(e=>console.error("review maintenance failed",String(e))));
 }
};
