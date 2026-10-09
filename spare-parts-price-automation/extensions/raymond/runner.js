const tabId=Number(new URLSearchParams(location.search).get('tab'));
let results=[],running=false;
const log=t=>document.getElementById('log').textContent+=t+'\n';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function frames(fn,args=[]){return chrome.scripting.executeScript({target:{tabId,allFrames:true},func:fn,args});}
function searchControls(){
 const visible=e=>!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
 const buttons=[...document.querySelectorAll('button,input[type=submit],input[type=button],a,[role=button]')].filter(e=>visible(e)&&/^search$/i.test((e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim()));
 const inputs=[...document.querySelectorAll('input:not([type]),input[type=text],input[type=search]')].filter(visible);
 let best=null;
 for(const b of buttons)for(const i of inputs){let br=b.getBoundingClientRect(),ir=i.getBoundingClientRect();let d=Math.abs(br.y-ir.y)*10+Math.abs(br.x-ir.right);if(!best||d<best.d)best={b,i,d};}
 if(!best)return null;
 const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);let parts=[];while(e&&e!==document.documentElement){let tag=e.localName;let siblings=[...e.parentElement.children].filter(x=>x.localName===tag);parts.unshift(tag+':nth-of-type('+(siblings.indexOf(e)+1)+')');e=e.parentElement;}return 'html>'+parts.join('>');};
 return {input:selector(best.i),button:selector(best.b),score:best.d};
}
function readPart(pn){
 const text=(document.body?.innerText||'').replace(/\u00a0/g,' ');
 if(document.querySelector('input[type=password]'))return {login:true};
 const compact=s=>String(s).replace(/[\u200b-\u200d\ufeff]/g,'').trim();
 const headings=[...document.querySelectorAll('h1,h2,h3,h4,[class*=title],[class*=Title],font')].map(e=>compact(e.innerText||''));
 const parts=[...text.matchAll(/\bPart(?:\s+Number)?\s*:\s*([^\s]+)/gi)].map(m=>compact(m[1]));
 for(const h of headings){const m=h.match(/^Part(?:\s+Number)?\s*:\s*(.+)$/i);if(m)parts.push(compact(m[1]));}
 const part=parts.includes(compact(pn))?pn:parts[0];
 const parse=raw=>{const m=raw.trim().match(/^(?:USD\s*)?\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)(?:\s*(?:USD|US\$))?\s*$/i);return m?Number(m[1].replaceAll(',','')):null;};
 let raw=null;
 if(part===pn){
  for(const row of document.querySelectorAll('tr')){
   const cells=[...row.children];const idx=cells.findIndex(c=>/^Your\s+Price\s*:?$/i.test(compact(c.innerText||'')));
   if(idx>=0&&cells[idx+1]){raw=compact(cells[idx+1].innerText||'');let price=parse(raw);if(price!==null)return {part,price,raw};}
  }
  const m=text.match(/Your\s+Price\s*:?\s*((?:USD\s*)?\$?\s*[0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?(?:\s*USD)?)(?=\s|$)/i);
  if(m){raw=compact(m[1]);let price=parse(raw);if(price!==null)return {part,price,raw};}
 }
 const links=[...document.querySelectorAll('a')].filter(a=>compact(a.innerText)===pn&&a.getBoundingClientRect().width);
 return {part,exactLinks:links.length,noResult:(text.match(/Search\s*:\s*([^\s>]+)/i)?.[1]===pn)&&/\(\s*nothing found\s*\)|no (?:parts|results|matches) found|part not found/i.test(text),diagnostic:{displayedPart:part||null,priceText:raw,hasYourPrice:/Your\s+Price/i.test(text)}};
}
function firstStartingPart(pn,activate=false){
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const columns=[...document.querySelectorAll('#Results .Column')];
 const primary=columns.find(c=>clean(c.textContent).toLowerCase().includes(('all parts starting '+pn).toLowerCase()));
 if(!primary)return null;
 const first=[...primary.querySelectorAll('.Link[onclick]')].find(e=>/Vin\.pg\.PartView\.run/.test(e.getAttribute('onclick')||''));
 if(!first)return null;
 const selected=clean(first.textContent);if(!selected)return null;
 if(activate)first.click();return {selected};
}
async function lookup(pn,limitMs=6000){
 await chrome.tabs.update(tabId,{active:true});
 const options=(await frames(searchControls)).filter(x=>x.result).sort((a,b)=>a.result.score-b.result.score);
 if(!options.length)throw Error('Kotak Search tidak terdeteksi. Buka halaman part Raymond; kirim screenshot jika tetap gagal.');
 const chosen=options[0];
 await chrome.scripting.executeScript({target:{tabId,frameIds:[chosen.frameId]},func:(cfg,pn)=>{const i=document.querySelector(cfg.input),b=document.querySelector(cfg.button);if(!i||!b)throw Error('Search berubah.');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(i,pn);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));b.click();},args:[chosen.result,pn]});
 await pause(250);let clicked=false;let lastStates=[];let selectedPN=pn;
 let nextNotice=Date.now()+15000;
 while(running){
  if(Date.now()>=nextNotice){log(`Masih menunggu hasil/harga — ${pn}. Klik Stop jika ingin berhenti.`);nextNotice=Date.now()+15000;}
  let states;try{states=await frames(readPart,[selectedPN]);}catch(e){if(/frame|removed|document|navigation/i.test(e.message)){await pause(250);continue;}throw e;}lastStates=states;
  const ok=states.find(x=>x.result?.part===selectedPN&&Number.isFinite(x.result?.price));
  if(ok)return {pn,matchedPart:selectedPN,price:ok.result.price,display:ok.result.raw,status:'OK',checkedAt:new Date().toISOString()};
  if(states.some(x=>x.result?.login))throw Error('Sesi login berakhir. Login di tab Raymond lalu mulai lagi.');
  if(!clicked){
   const section=(await frames(firstStartingPart,[pn,false])).filter(x=>x.result);
   if(section.length===1){
    const picked=await chrome.scripting.executeScript({target:{tabId,frameIds:[section[0].frameId]},func:firstStartingPart,args:[pn,true]});
    if(picked[0]?.result){selectedPN=picked[0].result.selected;clicked=true;log(`Buka hasil teratas — ${selectedPN}`);await pause(250);continue;}
   }else{
    const candidates=states.filter(x=>x.result?.exactLinks===1);
    if(candidates.length===1){await chrome.scripting.executeScript({target:{tabId,frameIds:[candidates[0].frameId]},func:pn=>{const a=[...document.querySelectorAll('a')].filter(a=>a.innerText.trim()===pn&&a.getBoundingClientRect().width);if(a.length===1)a[0].click();},args:[pn]});clicked=true;}
   }
  }
  if(states.some(x=>x.result?.noResult))return {pn,price:null,status:'NOT_FOUND'};
  await pause(300);
 }
 return {pn,price:null,status:running?'REVIEW_REQUIRED':'STOPPED',diagnostics:lastStates.map(x=>x.result?.diagnostic).filter(Boolean)};
}
document.getElementById('stop').onclick=()=>{running=false;log('Berhenti setelah pemeriksaan berjalan. Unduh hasil yang sudah ada.');};
document.getElementById('download').onclick=async()=>{try{if(!results.length)return alert('Belum ada hasil. Jalankan pencarian dulu.');const a=document.createElement('a');a.href=URL.createObjectURL(await preserveWorkbookFOB(document.getElementById('file').files[0],results));a.download='Raymond_FOB.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){alert(e.message);}};
document.getElementById('start').onclick=async()=>{
 if(running)return;
 try{
  const f=document.getElementById('file').files[0];const testPN=document.getElementById('testPN').value.trim();if(!testPN&&!f)throw Error('Isi PN percobaan atau pilih Excel.');
  const job=testPN?{pns:[testPN]}:/\.xlsx$/i.test(f.name)?{pns:await readRaymondExcel(f)}:JSON.parse(await f.text());if(!Array.isArray(job.pns)||!job.pns.length||job.pns.some(p=>typeof p!=='string'||!p.trim()))throw Error('Daftar PN tidak valid.');
  results=[];running=true;document.getElementById('log').textContent='';
  for(const [i,pn] of [...new Set(job.pns)].entries()){
   if(!running)break;log(`${i+1}/${job.pns.length} — ${pn}`);
   const r=await lookup(pn);results.push(r);localStorage.setItem('raymond_results',JSON.stringify(results));log(r.status==='OK'?`Your Price: ${r.display}`:r.status==='NOT_FOUND'?'NOT_FOUND — part tidak ditemukan; lanjut PN berikutnya.':'Belum terbaca — dipindah ke antrean terakhir.');await pause(150);
  }
  const deferred=results.filter(r=>r.status==='REVIEW_REQUIRED');
  if(deferred.length&&running)log(`Mencoba ulang ${deferred.length} PN di antrean terakhir...`);
  for(const item of deferred){if(!running)break;log(`Coba ulang — ${item.pn}`);const r=await lookup(item.pn,12000);results[results.findIndex(x=>x.pn===item.pn)]=r;localStorage.setItem('raymond_results',JSON.stringify(results));log(r.status==='OK'?`Your Price: ${r.display}`:r.status);}
  results=[...results.filter(r=>r.status==='OK'),...results.filter(r=>r.status!=='OK')];localStorage.setItem('raymond_results',JSON.stringify(results));
  log('Proses selesai/berhenti. Klik Download Excel. PN yang perlu diperiksa berada di bawah.');
 }catch(e){log('BERHENTI: '+e.message+'\nUnduh hasil yang sudah tersedia.');}finally{running=false;}
};
try{results=JSON.parse(localStorage.getItem('raymond_results')||'[]');if(results.length)log(`Hasil sebelumnya tersedia: ${results.length} PN. Bisa diunduh.`);}catch{}
