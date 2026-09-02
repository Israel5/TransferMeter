// The PDF is drawn by hand: filled bands, rounded cards, Bézier circles and
// tracked capitals, using only the base-14 fonts every reader has. No library
// is loaded, so this works identically on a server, in a browser, and inside a
// sandboxed page that cannot fetch anything.
import { fmt, dur, niceDate, countList, customerRoute, shortName } from "./quote";
import { wordsFor } from "./words";
import { PAX_KEYS, GEAR_KEYS, BAG_KEYS } from "./types";
import type { Quote, Settings } from "./types";

const WIN_ANSI: Record<number, number> = {0x2014:0x97,0x2013:0x96,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2026:0x85,0x2022:0x95,0x20AC:0x80};
function pdfText(str: string){
  let out="";
  for(const ch of String(str)){
    const c=ch.codePointAt(0)!;
    if(c===0x2192){ out+="->"; continue; }
    let b;
    if(c<0x100) b=c;
    else if(WIN_ANSI[c]!=null) b=WIN_ANSI[c];
    else { out+="?"; continue; }
    const t=String.fromCharCode(b);
    out += (t==="("||t===")"||t==="\\") ? "\\"+t : t;
  }
  return out;
}
export function pdfWidth(str: string, size: number, bold?: boolean, track?: number){
  let w=0;
  for(const ch of String(str)){
    const c=ch.codePointAt(0)!;
    if("iljI.,:;'|!".includes(ch)) w+=0.28;
    else if("frt(){}[]/\\".includes(ch)) w+=0.36;
    else if("mMW@".includes(ch)) w+=0.86;
    else if(c>=48 && c<=57) w+=0.556;
    else if(ch===" ") w+=0.28;
    else if(ch===ch.toUpperCase() && ch!==ch.toLowerCase()) w+=0.68;
    else w+=0.53;
  }
  return w*size*(bold?1.04:1) + (track||0)*Math.max(0,String(str).length-1);
}

export function buildPDF(q: Quote, S: Settings): Uint8Array {
  const W=612, H=792, M=54;
  const PAGES: string[][] = []; let ops: string[] = []; let y = 0;

  /* palette — the app's instrument colours, tuned for paper */
  const SLATE=[0.086,0.125,0.180], AMBER=[0.784,0.545,0.145],
        INK=[0.075,0.098,0.137], GREY=[0.420,0.463,0.529],
        FAINT=[0.894,0.914,0.941], TINT=[0.965,0.973,0.984],
        PAPER=[1,1,1], MUTEWHITE=[0.604,0.659,0.733];

  const n=(v:number)=>Number(v).toFixed(3);
  const col=(c:number[])=>c.map(n).join(" ");

  /* ---- primitives ---- */
  const rect=(x:number,yy:number,w:number,h:number,c:number[])=>ops.push(col(c)+" rg "+n(x)+" "+n(yy)+" "+n(w)+" "+n(h)+" re f");
  const line=(x1:number,y1:number,x2:number,y2:number,c:number[],w=0.7)=>
    ops.push(col(c)+" RG "+n(w)+" w "+n(x1)+" "+n(y1)+" m "+n(x2)+" "+n(y2)+" l S");
  const K=0.5523;
  const circle=(cx:number,cy:number,r:number,c:number[])=>{
    const k=r*K;
    ops.push(col(c)+" rg "+n(cx+r)+" "+n(cy)+" m "
      +n(cx+r)+" "+n(cy+k)+" "+n(cx+k)+" "+n(cy+r)+" "+n(cx)+" "+n(cy+r)+" c "
      +n(cx-k)+" "+n(cy+r)+" "+n(cx-r)+" "+n(cy+k)+" "+n(cx-r)+" "+n(cy)+" c "
      +n(cx-r)+" "+n(cy-k)+" "+n(cx-k)+" "+n(cy-r)+" "+n(cx)+" "+n(cy-r)+" c "
      +n(cx+k)+" "+n(cy-r)+" "+n(cx+r)+" "+n(cy-k)+" "+n(cx+r)+" "+n(cy)+" c f");
  };
  const ring=(cx:number,cy:number,r:number,c:number[],w=1.1)=>{
    const k=r*K;
    ops.push(col(c)+" RG "+n(w)+" w "+n(cx+r)+" "+n(cy)+" m "
      +n(cx+r)+" "+n(cy+k)+" "+n(cx+k)+" "+n(cy+r)+" "+n(cx)+" "+n(cy+r)+" c "
      +n(cx-k)+" "+n(cy+r)+" "+n(cx-r)+" "+n(cy+k)+" "+n(cx-r)+" "+n(cy)+" c "
      +n(cx-r)+" "+n(cy-k)+" "+n(cx-k)+" "+n(cy-r)+" "+n(cx)+" "+n(cy-r)+" c "
      +n(cx+k)+" "+n(cy-r)+" "+n(cx+r)+" "+n(cy-k)+" "+n(cx+r)+" "+n(cy)+" c S");
  };
  const roundRect=(x:number,yy:number,w:number,h:number,r:number,fill:number[]|null,stroke:number[]|null)=>{
    const k=r*K;
    const p=[n(x+r)+" "+n(yy)+" m",
      n(x+w-r)+" "+n(yy)+" l",
      n(x+w-r+k)+" "+n(yy)+" "+n(x+w)+" "+n(yy+r-k)+" "+n(x+w)+" "+n(yy+r)+" c",
      n(x+w)+" "+n(yy+h-r)+" l",
      n(x+w)+" "+n(yy+h-r+k)+" "+n(x+w-r+k)+" "+n(yy+h)+" "+n(x+w-r)+" "+n(yy+h)+" c",
      n(x+r)+" "+n(yy+h)+" l",
      n(x+r-k)+" "+n(yy+h)+" "+n(x)+" "+n(yy+h-r+k)+" "+n(x)+" "+n(yy+h-r)+" c",
      n(x)+" "+n(yy+r)+" l",
      n(x)+" "+n(yy+r-k)+" "+n(x+r-k)+" "+n(yy)+" "+n(x+r)+" "+n(yy)+" c"].join(" ");
    if(fill && stroke) ops.push(col(fill)+" rg "+col(stroke as number[])+" RG 0.7 w "+p+" B");
    else if(fill)      ops.push(col(fill)+" rg "+p+" f");
    else if(stroke)    ops.push(col(stroke)+" RG 0.7 w "+p+" S");
  };
  const text=(str:string|null|undefined,x:number,yy:number,o:any={})=>{
    if(str==null || str==="") return;
    const size=o.size||10, bold=!!o.bold, ital=!!o.ital, track=o.track||0;
    const font = bold ? "F2" : (ital ? "F3" : "F1");
    let xx=x;
    if(o.align==="right")  xx = x - pdfWidth(str,size,bold,track);
    else if(o.align==="center") xx = x - pdfWidth(str,size,bold,track)/2;
    ops.push("BT /"+font+" "+size+" Tf "+n(track)+" Tc "+col(o.color||INK)
      +" rg 1 0 0 1 "+n(xx)+" "+n(yy)+" Tm ("+pdfText(str)+") Tj ET");
  };
  /* small tracked capitals — the label voice used throughout */
  const cap=(str:string,x:number,yy:number,o:any={})=>text(String(str).toUpperCase(),x,yy,
    {size:7.4,bold:true,track:1.25,color:GREY,...o});

  const W_=wordsFor(q.lang);
  const TITLE={pt:"ORÇAMENTO DE TRANSFER",en:"TRANSFER QUOTE",fr:"DEVIS DE TRANSFERT"}[q.lang] || "TRANSFER QUOTE";
  const LBL={
    pt:{to:"Preparado para",dist:"Distância total",time:"Tempo estimado",stops:"Trajeto"},
    en:{to:"Prepared for",dist:"Total distance",time:"Estimated time",stops:"Route"},
    fr:{to:"Préparé pour",dist:"Distance totale",time:"Durée estimée",stops:"Trajet"}
  }[q.lang] || {to:"Prepared for",dist:"Total distance",time:"Estimated time",stops:"Route"};

  /* ---- page furniture ---- */
  const BAND=98;
  function startPage(first:boolean){
    ops=[]; PAGES.push(ops);
    rect(0,H-BAND,W,BAND,SLATE);
    rect(0,H-BAND-3.2,W,3.2,AMBER);
    if(first){
      text((S.bizName||"").trim() || "Transfer", M, H-46, {size:19,bold:true,color:PAPER});
      const contact=(S.bizPhone||"").trim();
      if(contact) text(contact, M, H-63, {size:9,color:MUTEWHITE});
      cap(TITLE, W-M, H-44, {align:"right",color:AMBER,size:7.4});
      if(q.quoteNo) text((W_.noShort||"No.")+" "+q.quoteNo, W-M, H-62, {size:12.5,bold:true,color:PAPER,align:"right"});
      text(new Date(q.savedAt).toLocaleDateString("en-CA"), W-M, H-77, {size:8.5,color:MUTEWHITE,align:"right"});
    } else {
      text((S.bizName||"").trim() || "Transfer", M, H-52, {size:13,bold:true,color:PAPER});
      cap((W_.no+" "+(q.quoteNo||"")).trim()+"  ·  continued", W-M, H-52, {align:"right",color:MUTEWHITE});
    }
    y = H-BAND-3.2-34;
  }
  const room=(h:number)=>{ if(y-h < M+26){ startPage(false); } };

  startPage(true);

  /* ---- who it's for ---- */
  cap(LBL.to, M, y);
  text(q.customer || "—", M, y-17, {size:14,bold:true});
  const legN=(q.trips||[]).length;
  const paxKm   = (q.trips||[]).reduce((n:number,t:any)=>n+customerRoute(t.stops,t.legKm,W_).km, 0);
  const paxMins = (q.trips||[]).reduce((n:number,t:any)=>n+(t.mins||0), 0);
  cap(legN>1 ? legN+" "+W_.legs[1] : W_.oneway, W-M, y, {align:"right"});
  text(fmt(paxKm,1)+" km", W-M, y-17, {size:11,color:GREY,align:"right"});
  y -= 40;
  line(M,y,W-M,y,FAINT); y -= 26;

  /* ---- each leg as a card with a route rail ---- */
  (q.trips||[]).forEach((t:any)=>{
    const view=customerRoute(t.stops, t.legKm, W_);
    const stops=view.stops;
    const cardH = 30 + Math.max(stops.length,1)*17 + 22;
    room(cardH+16);
    const top=y, bot=y-cardH;
    roundRect(M, bot, W-2*M, cardH, 7, TINT, FAINT);

    const head=(t.label==="Return"?W_.ret:W_.out)
      + (t.date ? "   ·   "+niceDate(t.date,q.lang) : "")
      + (t.time ? "   ·   "+W_.at+" "+t.time : "");
    cap(head, M+16, top-19, {color:AMBER, size:7.8});
    text("$"+fmt(t.price,0)+" CAD", W-M-16, top-21, {size:12.5,bold:true,align:"right"});

    const railX=M+22, labelX=M+38;
    let ry=top-40;
    const firstDot=ry+3.2, lastDot=ry+3.2-(stops.length-1)*17;
    line(railX, firstDot, railX, lastDot, [0.792,0.827,0.878], 1.4);
    if(!stops.length){
      text("—", labelX, ry, {size:9.8, color:GREY});
      ry -= 17;
    }
    stops.forEach((st:string,i:number)=>{
      const isEnd = i===0 || i===stops.length-1;
      const cy=ry+3.2;
      circle(railX, cy, isEnd?3.4:3.0, isEnd?SLATE:PAPER);
      if(!isEnd) ring(railX, cy, 3.0, AMBER, 1.3);
      text(st||"\u2014", labelX, ry, {size:9.8});
      if(i<stops.length-1 && isFinite(view.legKm[i])){
        text(fmt(view.legKm[i],1)+" km", W-M-16, ry-8.5, {size:8,color:GREY,align:"right"});
      }
      ry -= 17;
    });
    text(fmt(view.km,1)+" km  \u00b7  "+dur(t.mins||0), labelX, bot+11, {size:8.5,color:GREY});
    y = bot - 16;
  });

  /* ---- what's coming with them ---- */
  const rows: [string,string][] = [];
  const pp=countList(q.pax||{}, PAX_KEYS, W_ as any);
  const gg=countList(q.gear||{}, GEAR_KEYS, W_ as any);
  const bb=countList(q.bags||{}, BAG_KEYS, W_ as any);
  if(pp) rows.push([W_.pax, pp]);
  if(gg) rows.push([W_.gear, gg]);
  if(bb) rows.push([W_.bags, bb]);
  if(rows.length){
    room(rows.length*17+24);
    y -= 6;
    rows.forEach(([k,v])=>{
      cap(k, M, y);
      text(v, M+118, y, {size:9.8});
      y -= 17;
    });
    y -= 10;
  }

  /* ---- the number that matters ---- */
  room(96);
  line(M,y,W-M,y,FAINT); y -= 20;
  if(legN>1){
    cap(LBL.dist, M, y);
    text(fmt(paxKm,1)+" km", W-M, y, {size:9.8,align:"right"});
    y -= 16;
  }
  cap(LBL.time, M, y);
  text(dur(paxMins), W-M, y, {size:9.8,align:"right"});
  y -= 26;

  const th=54;
  roundRect(M, y-th, W-2*M, th, 8, SLATE, null);
  cap(W_.total, M+18, y-th/2-3, {color:MUTEWHITE, size:8.4});
  const cadW = pdfWidth("CAD", 9, false, 1.1);
  text("CAD", W-M-18, y-th/2-7, {size:9,color:MUTEWHITE,align:"right",track:1.1});
  text("$"+fmt(q.price,0), W-M-18-cadW-7, y-th/2-7, {size:26,bold:true,color:AMBER,align:"right"});
  y -= th+22;

  if(W_.note){
    room(20);
    text(W_.note, M, y, {size:8.6,ital:true,color:GREY});
  }

  /* ---- assemble: catalog, pages, per-page content, fonts ---- */
  const nPages=PAGES.length;
  const pageObj = (i:number) => 3 + i*2;          // page objects at 3,5,7...
  const contObj = (i:number) => 4 + i*2;          // its stream follows
  const fontBase = 3 + nPages*2;
  const objs: string[] = [];
  objs.push("<</Type/Catalog/Pages 2 0 R>>");
  objs.push("<</Type/Pages/Kids["+PAGES.map((_,i)=>pageObj(i)+" 0 R").join(" ")+"]/Count "+nPages+">>");
  PAGES.forEach((page,i)=>{
    const content=page.join("\n");
    objs.push("<</Type/Page/Parent 2 0 R/MediaBox[0 0 "+W+" "+H+"]/Resources<</Font<<"
      +"/F1 "+fontBase+" 0 R /F2 "+(fontBase+1)+" 0 R /F3 "+(fontBase+2)+" 0 R>>>>"
      +"/Contents "+contObj(i)+" 0 R>>");
    objs.push("<</Length "+content.length+">>\nstream\n"+content+"\nendstream");
  });
  objs.push("<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
  objs.push("<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>");
  objs.push("<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Oblique/Encoding/WinAnsiEncoding>>");

  let pdf="%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o,i)=>{ offsets.push(pdf.length); pdf += (i+1)+" 0 obj\n"+o+"\nendobj\n"; });
  const xref=pdf.length;
  pdf += "xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n";
  offsets.forEach(o=>{ pdf += String(o).padStart(10,"0")+" 00000 n \n"; });
  pdf += "trailer\n<</Size "+(objs.length+1)+"/Root 1 0 R>>\nstartxref\n"+xref+"\n%%EOF";

  const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++) bytes[i]=pdf.charCodeAt(i) & 0xFF;
  return bytes;
}
