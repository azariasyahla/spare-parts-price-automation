const tabId=Number(new URLSearchParams(location.search).get('tab'));
let results=[],running=false,skip=false,currentPN=null,clickAttempts=[];
const log=t=>document.getElementById('log').textContent+=t+'\n';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function frames(fn,args=[]){return chrome.scripting.executeScript({target:{tabId,allFrames:true},func:fn,args});}
function inspectBT(pn,expand=false){
 const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
 const shown=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length>0;};
 const body=document.body?.innerText||'';
 if([...document.querySelectorAll('input[type=password]')].some(shown))return {login:true};
 const numberRE=/Item\s+number\s*:\s*([A-Za-z0-9/._-]+)/gi;
 const numbers=e=>[...clean(e.innerText).matchAll(numberRE)].map(m=>m[1]);
 const parse=raw=>{let n=raw.replace(/\s/g,'');if(n.includes(',')&&n.includes('.')){if(n.lastIndexOf(',')>n.lastIndexOf('.'))n=n.replaceAll('.','').replace(',','.');else n=n.replaceAll(',','');}else if(n.includes(',')){n=/,\d{1,2}$/.test(n)?n.replace(',','.'):n.replaceAll(',','');}return Number(n);};
 const price=e=>{const text=e.innerText||'';const m=[...text.matchAll(/€\s*([0-9][0-9.,]*(?:[ \u00a0][0-9]{3})*(?:[.,][0-9]{1,2})?)([^\n€]*)/g)].find(m=>!/^\s*\//.test(m[2]));return m?{price:parse(m[1]),raw:'€'+m[1].trim()}:null;};
 const rows=[];
 for(const leaf of document.querySelectorAll('body *')){
  if(!shown(leaf)||numbers(leaf).length!==1||[...leaf.children].some(c=>numbers(c).length))continue;
  const item=numbers(leaf)[0];let row=leaf;
  while(row.parentElement&&row.parentElement!==document.body&&numbers(row.parentElement).length===1){row=row.parentElement;if(price(row)||/This part has expired and has been replaced/i.test(row.innerText))break;}
  if(!rows.some(r=>r.item===item&&r.node===row))rows.push({item,node:row,...price(row),expired:/This part has expired and has been replaced/i.test(row.innerText)});
 }
 rows.sort((a,b)=>a.node.getBoundingClientRect().top-b.node.getBoundingClientRect().top);
 const original=rows.find(r=>r.item===pn);
 if(original?.expired){
  const i=rows.indexOf(original);const replacement=rows.slice(i+1).find(r=>Number.isFinite(r.price));
  if(replacement)return {pn,matchedPart:replacement.item,price:replacement.price,raw:replacement.raw,replaced:true};
  if(expand){
   const candidates=[...original.node.querySelectorAll('p.MuiTypography-root,p')];
   const exact=candidates.find(e=>shown(e)&&/^This part has expired and has been replaced$/i.test(clean(e.innerText||e.textContent)));
   const link=exact||[...original.node.querySelectorAll('a,button,[role=button],span,td[colspan="5"]')].find(e=>shown(e)&&/^This part has expired and has been replaced$/i.test(clean(e.innerText||e.textContent)));
   if(link){link.click();return {expanded:true,clickTarget:link.tagName};}
  }
 }
 if(original&&!original.expired&&Number.isFinite(original.price))return {pn,matchedPart:pn,price:original.price,raw:original.raw};
 const query=new URL(location.href).searchParams.get('query');
 const itemMatches=[...document.querySelectorAll('input')].some(e=>shown(e)&&clean(e.value)===pn);
 const emptyMessage=[...document.querySelectorAll('p,li,div,[role=option]')].some(e=>shown(e)&&/^No results(?: found)?$/i.test(clean(e.innerText)));
 const busy=[...document.querySelectorAll('[role=progressbar],[aria-busy="true"],.MuiCircularProgress-root,.MuiLinearProgress-root')].some(shown);
 const errorPage=/something went wrong|service unavailable|network error|access denied|session expired/i.test(body);
 const shellReady=document.readyState==='complete'&&[...document.querySelectorAll('input')].some(shown)&&/PARTS/.test(body)&&/Privacy Policy/.test(body);
 const blankCandidate=query===pn&&shellReady&&!busy&&!errorPage&&rows.length===0&&!/Item\s+number|€|part\(s\) found/i.test(body);
 const noResult=rows.length===0&&((itemMatches&&emptyMessage)||(query===pn&&/\b0\s+part\(s\) found|no parts found|no results found/i.test(body)));

 return {blankCandidate,replacementVisible:!!original?.expired&&rows.some(r=>r.item!==pn),expired:!!original?.expired,noResult,diagnostic:{itemMatches,emptyMessage,busy,shellReady,errorPage,blankCandidate,url:location.origin+location.pathname,query,rows:rows.map(r=>({item:r.item,price:r.price??null,expired:r.expired})),snippets:body.split('\n').map(s=>s.trim()).filter(s=>/Item number|expired|€|part\(s\) found/i.test(s)).slice(0,30)}};
}
async function lookup(pn){
 currentPN=pn;skip=false;
 // Use the exact search URL shown by BT; preserves the signed-in browser session.
 await chrome.tabs.update(tabId,{active:true,url:'https://parts.toyota-forklifts.eu/parts-finder?tab=partsSearch&query='+encodeURIComponent(pn)+'&page=1'});
 let emptySince=null;
 let attempts=0,nextClick=Date.now()+1500,nextNotice=Date.now()+15000;
 while(running&&!skip){
  try{
   const states=await frames(inspectBT,[pn,false]);
   const ok=states.find(x=>Number.isFinite(x.result?.price));
   if(ok)return {pn,...ok.result,status:'OK'};
   if(states.some(x=>x.result?.login))throw Error('Login BT diperlukan. Login di tab BT lalu mulai lagi.');
   if(states.some(x=>x.result?.noResult))return {pn,price:null,status:'NOT_FOUND'};
   const blank=states.find(x=>x.frameId===0)?.result?.blankCandidate;
   if(blank){
    emptySince??=Date.now();
    if(Date.now()-emptySince>=10000){
     log('Hasil kosong — NOT_FOUND, ditempatkan di bawah Excel.');
     return {pn,price:null,status:'NOT_FOUND',reason:'EMPTY_RESULT'};
    }
   }else emptySince=null;

   if(attempts<3&&Date.now()>=nextClick){
    const target=states.find(x=>x.result?.expired&&!x.result?.replacementVisible);
    if(target){
     const r=await chrome.scripting.executeScript({target:{tabId,frameIds:[target.frameId]},world:'MAIN',func:inspectBT,args:[pn,true]});
     attempts++;nextClick=Date.now()+3000;
     const action={pn,attempt:attempts,target:r[0]?.result?.clickTarget||null,dispatched:!!r[0]?.result?.expanded};
     clickAttempts.push(action);
     log('Percobaan klik '+attempts+' ('+(action.target||'target belum ditemukan')+') — '+pn);
    }
   }
  }catch(e){if(!/frame|removed|document|navigation|Cannot access contents/i.test(e.message))throw e;}
  if(Date.now()>nextNotice){log('Menunggu hasil/harga — '+pn+'. Bisa bantu klik expired, Lewati PN, atau Stop.');nextNotice=Date.now()+15000;}
  await pause(300);
 }
 return {pn,price:null,status:skip?'REVIEW_REQUIRED':'STOPPED'};
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
document.getElementById('stop').onclick=()=>{running=false;log('Stop. Hasil tersedia untuk diunduh.');};
document.getElementById('skip').onclick=()=>{skip=true;};
document.getElementById('download').onclick=async()=>{try{if(!results.length)return alert('Belum ada hasil.');download(await preserveWorkbookFOB(document.getElementById('file').files[0],results),'BT_FOB.xlsx');}catch(e){alert(e.message);}};
document.getElementById('diagnostic').onclick=async()=>{let pages;try{pages=await frames(inspectBT,[currentPN||'',false]);}catch(e){pages=[{error:e.message}];}download(new Blob([JSON.stringify({version:'0.1.6',pn:currentPN,results,clickAttempts,pages},null,2)],{type:'application/json'}),'BT_diagnostic.json');};
document.getElementById('start').onclick=async()=>{
 if(running)return;
 try{const f=document.getElementById('file').files[0];const testPN=document.getElementById('testPN').value.trim();if(!testPN&&!f)throw Error('Isi PN percobaan atau pilih Excel.');const pns=testPN?[testPN]:await readRaymondExcel(f);if(!pns.length)throw Error('PN tidak ditemukan di sheet FOB kolom A.');running=true;results=[];clickAttempts=[];document.getElementById('log').textContent='';for(const [i,pn]of pns.entries()){if(!running)break;log(`${i+1}/${pns.length} — ${pn}`);const r=await lookup(pn);results.push(r);localStorage.setItem('bt_results',JSON.stringify(results));log(r.status==='OK'?`${r.raw}${r.replaced?' (pengganti '+r.matchedPart+')':''}`:r.status);}log('Klik Download Excel. Harga EUR; PN review berada di bawah.');}catch(e){log('BERHENTI: '+e.message);}finally{running=false;}
};
try{results=JSON.parse(localStorage.getItem('bt_results')||'[]');}catch{}
