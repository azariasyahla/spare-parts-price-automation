async function readRaymondExcel(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('File bukan XLSX yang valid. Simpan sebagai Excel Workbook (.xlsx).');
 const count=view.getUint16(end+10,true),entries=new Map();let pos=view.getUint32(end+16,true);
 for(let i=0;i<count;i++){
  if(view.getUint32(pos,true)!==0x02014b50)throw Error('Struktur ZIP Excel tidak valid.');
  const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
  const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+n));entries.set(name,{flags,method,size,offset});pos+=46+n+extra+comment;
 }
 const read=async name=>{
  const e=entries.get(name);if(!e)throw Error('Bagian Excel tidak ditemukan: '+name);
  if(e.flags&1)throw Error('Excel terenkripsi. Pilih salinan tanpa password file.');
  const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true);let data=bytes.slice(start,start+e.size);
  if(e.method===8){try{data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}catch{throw Error('Excel tidak bisa dibaca. Gunakan Chrome terbaru dan file .xlsx.');}}
  else if(e.method!==0)throw Error('Kompresi Excel tidak didukung.');
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(data),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('XML Excel tidak valid.');return doc;
 };
 const elements=(root,name)=>[...root.getElementsByTagNameNS('*',name)];
 const wb=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
 const sheet=elements(wb,'sheet').find(s=>s.getAttribute('name').toLowerCase()==='fob');if(!sheet)throw Error('Sheet FOB tidak ditemukan. Gunakan FOB, PN di kolom A mulai A2.');
 const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
 const relation=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===id);if(!relation)throw Error('Sheet FOB tidak bisa ditemukan.');
 const target=relation.getAttribute('Target');let parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),resolved=[];for(const p of parts){if(p==='..')resolved.pop();else if(p!=='.')resolved.push(p);}
 const strings=entries.has('xl/sharedStrings.xml')?elements(await read('xl/sharedStrings.xml'),'si').map(s=>elements(s,'t').map(t=>t.textContent).join('')):[];
 const doc=await read(resolved.join('/')),pns=[];
 for(const row of elements(doc,'row')){
  if(Number(row.getAttribute('r'))<2)continue;
  const cell=elements(row,'c').find(c=>/^A\d+$/.test(c.getAttribute('r')));if(!cell)continue;
  let value=cell.getAttribute('t')==='inlineStr'?elements(cell,'t').map(t=>t.textContent).join(''):elements(cell,'v')[0]?.textContent||'';
  if(cell.getAttribute('t')==='s')value=strings[Number(value)]||'';
  if(String(value).trim())pns.push(String(value).trim());
 }
 if(!pns.length)throw Error('Kolom A sheet FOB kosong.');return [...new Set(pns)];
}
