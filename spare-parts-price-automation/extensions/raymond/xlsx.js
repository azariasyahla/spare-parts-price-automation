// Dependency-free OOXML export for this extension. ZIP entries use STORE.
function makeRaymondXlsx(results){
 const enc=new TextEncoder(),xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const good=r=>r.status==='OK'&&typeof r.price==='number'&&Number.isFinite(r.price)&&r.price>=0;
 const ordered=[...results.filter(good),...results.filter(r=>!good(r))];
 const str=(ref,val,style=0)=>`<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(val)}</t></is></c>`;
 const rows=[`<row r="1">${str('A1','Part Number',1)}${str('B1','FOB',1)}</row>`,...ordered.map((r,i)=>{let n=i+2;return `<row r="${n}">${str('A'+n,r.pn)}${good(r)?`<c r="B${n}" s="2"><v>${r.price}</v></c>`:str('B'+n,r.status==='NOT_FOUND'?'NOT_FOUND':'REVIEW_REQUIRED',3)}</row>`;})].join('');
 const files={
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FOB" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF9C6500"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB9362B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B${ordered.length+1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="25" customWidth="1"/></cols><sheetData>${rows}</sheetData><autoFilter ref="A1:B${ordered.length+1}"/></worksheet>`};
 const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const hdr=n=>new Uint8Array(n),set=(b,o,v,size=4)=>{const d=new DataView(b.buffer);size===2?d.setUint16(o,v,true):d.setUint32(o,v,true);};
 let local=[],central=[],offset=0;
 for(const [name,value] of Object.entries(files)){
  const fn=enc.encode(name),data=enc.encode(value),sum=crc(data),h=hdr(30);set(h,0,0x04034b50);set(h,4,20,2);set(h,12,33,2);set(h,14,sum);set(h,18,data.length);set(h,22,data.length);set(h,26,fn.length,2);local.push(h,fn,data);
  const c=hdr(46);set(c,0,0x02014b50);set(c,4,20,2);set(c,6,20,2);set(c,14,33,2);set(c,16,sum);set(c,20,data.length);set(c,24,data.length);set(c,28,fn.length,2);set(c,42,offset);central.push(c,fn);offset+=h.length+fn.length+data.length;
 }
 const end=hdr(22),count=Object.keys(files).length;set(end,0,0x06054b50);set(end,8,count,2);set(end,10,count,2);set(end,12,central.reduce((n,b)=>n+b.length,0));set(end,16,offset);
 return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// Retain every original XLSX entry; replace only the FOB worksheet.
async function preserveWorkbookFOB(file,results){
 if(!file)throw Error('Pilih kembali Excel asli sebelum Download agar Sheet1 tetap tersimpan.');
 const scan=async source=>{const bytes=new Uint8Array(await source.arrayBuffer()),v=new DataView(bytes.buffer);let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&v.getUint32(end,true)!==0x06054b50)end--;if(end<0)throw Error('ZIP Excel tidak valid.');let pos=v.getUint32(end+16,true);const out=[];for(let i=0;i<v.getUint16(end+10,true);i++){const len=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true),c=bytes.slice(pos,pos+len),cv=new DataView(c.buffer),name=new TextDecoder().decode(c.slice(46,46+cv.getUint16(28,true))),off=cv.getUint32(42,true),lh=30+v.getUint16(off+26,true)+v.getUint16(off+28,true);out.push({name,central:c,header:bytes.slice(off,off+lh),data:bytes.slice(off+lh,off+lh+cv.getUint32(20,true))});pos+=len;}return out;};
 const original=await scan(file),generated=await scan(makeRaymondXlsx(results));
 const read=async entry=>{let b=entry.data;if(new DataView(entry.central.buffer).getUint16(10,true)===8)b=new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());return new TextDecoder().decode(b);};
 const parse=s=>new DOMParser().parseFromString(s,'application/xml'),nodes=(d,n)=>[...d.getElementsByTagNameNS('*',n)];
 const wb=parse(await read(original.find(e=>e.name==='xl/workbook.xml'))),rels=parse(await read(original.find(e=>e.name==='xl/_rels/workbook.xml.rels')));
 const sheet=nodes(wb,'sheet').find(e=>e.getAttribute('name').toLowerCase()==='fob');if(!sheet)throw Error('Sheet FOB tidak ditemukan.');
 const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rel=nodes(rels,'Relationship').find(e=>e.getAttribute('Id')===id);const target=rel.getAttribute('Target');let path=[];for(const p of (target.startsWith('/')?target.slice(1):'xl/'+target).split('/')){if(p==='..')path.pop();else if(p!=='.')path.push(p);}const name=path.join('/');
 const xml=(await read(generated.find(e=>e.name==='xl/worksheets/sheet1.xml'))).replace(/ s="\d+"/g,'');const data=new TextEncoder().encode(xml);
 const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const locals=[],centrals=[];let offset=0;
 for(const e of original){const c=e.central.slice(),cv=new DataView(c.buffer),h=e.header.slice(),hv=new DataView(h.buffer);let b=e.data;let flags=cv.getUint16(8,true)&~8;
  if(e.name===name){b=data;cv.setUint16(10,0,true);cv.setUint32(16,crc(b),true);cv.setUint32(20,b.length,true);cv.setUint32(24,b.length,true);}
  cv.setUint16(8,flags,true);cv.setUint32(42,offset,true);hv.setUint16(6,flags,true);hv.setUint16(8,cv.getUint16(10,true),true);hv.setUint32(14,cv.getUint32(16,true),true);hv.setUint32(18,cv.getUint32(20,true),true);hv.setUint32(22,cv.getUint32(24,true),true);
  locals.push(h,b);centrals.push(c);offset+=h.length+b.length;
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,original.length,true);ev.setUint16(10,original.length,true);ev.setUint32(12,centrals.reduce((n,b)=>n+b.length,0),true);ev.setUint32(16,offset,true);
 return new Blob([...locals,...centrals,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
