(function(){
  const MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const MON=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const DAYS=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
  const fmt=n=>"Rp "+Math.round(n).toLocaleString("id-ID");
  const short=n=>n>=1e6?(n/1e6).toLocaleString("id-ID",{maximumFractionDigits:1})+" jt":Math.round(n/1e3)+" rb";
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const $=id=>document.getElementById(id);
  const pIdx=p=>{const[y,m]=p.split("-").map(Number);return y*12+m-1};
  const idxP=i=>Math.floor(i/12)+"-"+String(i%12+1).padStart(2,"0");
  const pLabel=p=>{const i=pIdx(p);return MONTHS[i%12]+" "+Math.floor(i/12)};
  const dayMs=864e5;
  const today=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())})();

  const S={bills:{},payments:{},settings:{cutoffDay:25,warnDays:3},period:null,filter:"all",group:"platform",editing:null,confirm:null,db:null,loaded:{b:false,p:false},toastShown:false};

  function currentPeriod(){
    let i=today.getFullYear()*12+today.getMonth();
    if(today.getDate()>=S.settings.cutoffDay) i++;
    return idxP(i);
  }
  S.period=currentPeriod();

  function inst(b,p){
    const off=pIdx(p)-pIdx(b.startPeriod);
    if(off<0||off>=b.tenor) return null;
    const i=pIdx(p),y=Math.floor(i/12),m=i%12,dim=new Date(y,m+1,0).getDate();
    const due=new Date(y,m,Math.min(b.dueDay,dim));
    const pay=S.payments[b.id+"__"+p];
    return {bill:b,period:p,due,ke:off+1,sisa:b.tenor-off,paid:!!pay,pay};
  }
  function status(it){
    if(it.paid) return {cls:"good",txt:"Lunas"};
    const d=Math.round((it.due-today)/dayMs);
    if(d<0) return {cls:"crit",txt:"Telat "+(-d)+" hr",d};
    if(d===0) return {cls:"crit",txt:"Hari ini",d};
    if(d<=S.settings.warnDays) return {cls:"warn",txt:d+" hari lagi",d};
    if(d<=7) return {cls:"soon",txt:d+" hari lagi",d};
    return {cls:"idle",txt:d+" hari lagi",d};
  }
  const billsArr=()=>Object.values(S.bills);
  const itemsFor=p=>billsArr().map(b=>inst(b,p)).filter(Boolean).sort((a,b)=>a.due-b.due||a.bill.platform.localeCompare(b.bill.platform));

  function allUnpaidSoon(){
    const out=[];
    for(const b of billsArr()){
      const s=pIdx(b.startPeriod);
      for(let k=0;k<b.tenor;k++){
        const it=inst(b,idxP(s+k)); if(!it||it.paid) continue;
        const d=Math.round((it.due-today)/dayMs);
        if(d<=7) out.push(it); else break;
      }
    }
    return out.sort((a,b)=>a.due-b.due);
  }

  /* ---------- render ---------- */
  function render(){
    $("period-lbl").textContent=pLabel(S.period);
    $("today-lbl").textContent="Hari ini "+DAYS[today.getDay()]+", "+today.getDate()+" "+MONTHS[today.getMonth()]+" "+today.getFullYear();
    $("list-title").textContent="Checklist "+pLabel(S.period);
    const items=itemsFor(S.period);
    const tot=items.reduce((a,i)=>a+i.bill.amount,0), paid=items.filter(i=>i.paid), pTot=paid.reduce((a,i)=>a+i.bill.amount,0);
    $("k-total").textContent=fmt(tot); $("k-total-s").textContent=items.length+" cicilan dari "+new Set(items.map(i=>i.bill.platform)).size+" platform";
    $("k-paid").textContent=fmt(pTot); $("k-paid-s").textContent=paid.length+" cicilan";
    $("k-left").textContent=fmt(tot-pTot); $("k-left-s").textContent=(items.length-paid.length)+" cicilan";
    const pct=tot?Math.round(pTot/tot*100):0; $("k-pct").textContent=pct+"%"; $("k-bar").style.width=pct+"%";
    renderEWS(); renderList(items); renderPlat(items); renderChart();
    $("plat-list").innerHTML=[...new Set(billsArr().map(b=>b.platform))].sort().map(p=>`<option value="${esc(p)}">`).join("");
  }

  function renderEWS(){
    const list=allUnpaidSoon(), el=$("ews-list");
    if(!S.loaded.b){return}
    if(!list.length){el.innerHTML=`<div class="ews-empty">Aman. Tidak ada tagihan terlambat atau jatuh tempo dalam 7 hari ke depan.</div>`;return}
    el.innerHTML=list.map(it=>{const st=status(it);const c=st.cls==="idle"?"soon":st.cls;
      return `<div class="ews-item ${c}"><div class="d">${st.txt}</div><div class="t"><b>${esc(it.bill.platform)} · ${fmt(it.bill.amount)}</b><span>${it.due.getDate()} ${MON[it.due.getMonth()]}${it.bill.note?" · "+esc(it.bill.note):""}</span></div></div>`}).join("");
  }

  function rowHTML(it){
    const st=status(it), b=it.bill;
    const conf=S.confirm===b.id?`<div class="confirm">Hapus tagihan <b>${esc(b.platform)} ${fmt(b.amount)}</b> beserta histori pembayarannya?<button class="btn danger" data-act="del-yes" data-id="${b.id}">Ya, hapus</button><button class="btn" data-act="del-no">Batal</button></div>`:"";
    return `<div class="row ${it.paid?"paid":""}">
      <button class="chk" data-act="toggle" data-id="${b.id}" aria-label="${it.paid?"Tandai belum dibayar":"Tandai sudah dibayar"}" aria-pressed="${it.paid}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 7.5 2.5 2.5L11 4.5" stroke="var(--on-accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="due">${String(it.due.getDate()).padStart(2,"0")} ${MON[it.due.getMonth()]}<small>${DAYS[it.due.getDay()]}</small></div>
      <div class="desc"><b>${S.group==="date"?esc(b.platform)+(b.note?" · "+esc(b.note):""):esc(b.note||"Cicilan "+b.platform)}</b><span>Cicilan ke-${it.ke} dari ${b.tenor} · sisa ${it.sisa}x${it.paid&&it.pay.paidAt?" · dibayar "+new Date(it.pay.paidAt).toLocaleDateString("id-ID",{day:"numeric",month:"short"}):""}</span></div>
      <div class="st" style="display:flex;gap:10px;align-items:center;justify-content:flex-end"><span class="amt">${fmt(b.amount)}</span><span class="pill ${st.cls}">${st.txt}</span></div>
      <div class="acts"><button class="btn ghost" data-act="edit" data-id="${b.id}">Ubah</button><button class="btn ghost danger" data-act="del" data-id="${b.id}">Hapus</button></div>
      ${conf}</div>`;
  }
  function renderList(items){
    const el=$("list");
    if(!S.loaded.b){return}
    let f=items; if(S.filter==="paid") f=items.filter(i=>i.paid); if(S.filter==="unpaid") f=items.filter(i=>!i.paid);
    if(!items.length){el.innerHTML=`<div class="empty">Tidak ada cicilan di ${pLabel(S.period)}.<br>Tambah tagihan lewat form “Tambah tagihan baru”.</div>`;return}
    if(!f.length){el.innerHTML=`<div class="empty">${S.filter==="paid"?"Belum ada yang dibayar bulan ini.":"Semua tagihan bulan ini sudah dibayar."}</div>`;return}
    if(S.group==="date"){el.innerHTML=`<div class="group">${f.map(rowHTML).join("")}</div>`;return}
    const g={}; f.forEach(i=>(g[i.bill.platform]=g[i.bill.platform]||[]).push(i));
    const all={}; items.forEach(i=>(all[i.bill.platform]=all[i.bill.platform]||[]).push(i));
    el.innerHTML=Object.keys(g).sort((a,b)=>sum(all[b])-sum(all[a])).map(p=>{const a=all[p];const pd=a.filter(i=>i.paid).length;
      return `<div class="group"><div class="group-h"><b>${esc(p)}</b><span>${pd}/${a.length} lunas</span><span class="num">${fmt(sum(a))}</span></div>${g[p].map(rowHTML).join("")}</div>`}).join("");
  }
  const sum=a=>a.reduce((s,i)=>s+i.bill.amount,0);

  function renderPlat(items){
    const g={}; items.forEach(i=>{const x=g[i.bill.platform]=g[i.bill.platform]||{t:0,p:0};x.t+=i.bill.amount;if(i.paid)x.p+=i.bill.amount});
    const keys=Object.keys(g).sort((a,b)=>g[b].t-g[a].t), max=Math.max(1,...keys.map(k=>g[k].t));
    $("plat-hint").textContent=pLabel(S.period);
    $("plat").innerHTML=keys.length?keys.map(k=>{const x=g[k],wp=x.p/max*100,wu=(x.t-x.p)/max*100;
      return `<div class="plat-row" title="${esc(k)}: dibayar ${fmt(x.p)}, belum ${fmt(x.t-x.p)}"><div class="top2"><b>${esc(k)}</b><span class="num">${fmt(x.t-x.p)} belum · ${fmt(x.t)}</span></div><div class="stack">${wp?`<i style="width:${wp}%;background:var(--accent)"></i>`:""}${wu?`<i style="width:${wu}%;background:var(--unpaid)"></i>`:""}</div></div>`}).join(""):`<div class="ews-empty">Belum ada data.</div>`;
  }

  function renderChart(){
    const c=$("chart"), base=pIdx(S.period), months=[];
    for(let k=-5;k<=6;k++){const p=idxP(base+k),its=itemsFor(p);months.push({p,t:sum(its),pd:sum(its.filter(i=>i.paid)),n:its.length})}
    const W=330,H=170,L=34,B=22,T=8,cw=(W-L)/12,bw=Math.min(16,cw-6);
    const max=Math.max(1,...months.map(m=>m.t)); const step=niceStep(max/3), top=Math.ceil(max/step)*step;
    const y=v=>T+(H-T-B)*(1-v/top);
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Total tagihan per bulan, dibayar dan belum">`;
    for(let v=0;v<=top+1;v+=step){s+=`<line class="gl" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${v?short(v):"0"}</text>`}
    months.forEach((m,i)=>{const x=L+i*cw+(cw-bw)/2, sel=m.p===S.period;
      const hp=(H-T-B)*m.pd/top, hu=(H-T-B)*(m.t-m.pd)/top, y0=H-B;
      if(m.pd) s+=`<path d="${barPath(x,y0-hp,bw,hp,!(m.t-m.pd))}" fill="var(--accent)"/>`;
      if(m.t-m.pd) s+=`<path d="${barPath(x,y0-hp-hu-(m.pd?0:0),bw,hu-(m.pd?2:0),true)}" fill="var(--unpaid)"/>`;
      const mi=pIdx(m.p)%12;
      s+=`<text x="${x+bw/2}" y="${H-7}" text-anchor="middle" style="${sel?"fill:var(--fg);font-weight:600":""}">${MON[mi].slice(0,3)}</text>`;
      s+=`<rect x="${L+i*cw}" y="0" width="${cw}" height="${H}" fill="transparent" data-i="${i}" style="cursor:pointer"/>`;
    });
    s+=`</svg><div class="tip" id="tip" hidden></div>`;
    c.innerHTML=s;
    const tip=$("tip"), svg=c.querySelector("svg");
    c.querySelectorAll("rect[data-i]").forEach(r=>{
      r.addEventListener("mouseenter",()=>{const m=months[+r.dataset.i];const bb=r.getBoundingClientRect(),cb=c.getBoundingClientRect();
        tip.innerHTML=`<b>${pLabel(m.p)}</b><br>Total <span class="num">${fmt(m.t)}</span><br>Dibayar <span class="num">${fmt(m.pd)}</span><br>Belum <span class="num">${fmt(m.t-m.pd)}</span>`;
        tip.style.left=Math.min(Math.max(bb.left-cb.left+bb.width/2,80),cb.width-80)+"px"; tip.style.top=(bb.top-cb.top+20)+"px"; tip.hidden=false});
      r.addEventListener("mouseleave",()=>tip.hidden=true);
      r.addEventListener("click",()=>{S.period=months[+r.dataset.i].p;render()});
    });
  }
  function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x)));const n=x/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}
  function barPath(x,y,w,h,round){if(h<=0)return"";const r=round?Math.min(4,h,w/2):0;
    return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}

  /* ---------- toast & notif ---------- */
  let tt; function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,4200)}
  function ewsSummary(){const l=allUnpaidSoon();const late=l.filter(i=>i.due<today).length,soon=l.length-late;
    const amt=sum(l);
    if(!l.length) return "Tidak ada tagihan mendesak dalam 7 hari.";
    return (late?late+" tagihan terlambat, ":"")+soon+" jatuh tempo ≤7 hari · total "+fmt(amt);}
  $("notif-btn").addEventListener("click",async()=>{
    const msg=ewsSummary();
    try{
      if(!("Notification" in window)) throw 0;
      const perm=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(perm!=="granted") throw 0;
      new Notification("Dash Tagihan",{body:msg}); toast("Notifikasi terkirim.");
    }catch(e){toast("Browser menolak notifikasi di halaman ini. "+msg)}
  });

  /* ---------- interactions ---------- */
  $("prev").onclick=()=>{S.period=idxP(pIdx(S.period)-1);render()};
  $("next").onclick=()=>{S.period=idxP(pIdx(S.period)+1);render()};
  $("go-now").onclick=()=>{S.period=currentPeriod();render()};
  document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{S.filter=b.dataset.f;document.querySelectorAll("[data-f]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  document.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{S.group=b.dataset.g;document.querySelectorAll("[data-g]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});

  $("list").addEventListener("click",async e=>{
    const btn=e.target.closest("[data-act]"); if(!btn) return;
    const id=btn.dataset.id, act=btn.dataset.act;
    if(act==="toggle"){
      if(!S.db) return toast("Masuk dulu untuk menyimpan perubahan.");
      const b=S.bills[id], key=id+"__"+S.period, was=!!S.payments[key];
      try{
        if(was){delete S.payments[key];render();await S.db.deletePayment(key);toast(b.platform+" ditandai belum dibayar")}
        else{const d={billId:id,period:S.period,amount:b.amount,paidAt:new Date().toISOString()};S.payments[key]=d;render();await S.db.setPayment(key,d);toast(b.platform+" "+fmt(b.amount)+" ditandai lunas")}
      }catch(err){toast("Gagal menyimpan: "+(err&&err.message||err.code||"coba lagi"))}
    }
    if(act==="edit") startEdit(id);
    if(act==="del"){S.confirm=id;render()}
    if(act==="del-no"){S.confirm=null;render()}
    if(act==="del-yes"){
      S.confirm=null;
      try{
        await S.db.deleteBill(id);
        toast("Tagihan dihapus");
      }catch(err){toast("Gagal menghapus: "+(err&&err.message||"coba lagi"))}
    }
  });

  const parseAmt=v=>Number(String(v).replace(/[^\d]/g,""));
  $("f-amount").addEventListener("input",e=>{const n=parseAmt(e.target.value);e.target.value=n?n.toLocaleString("id-ID"):""});
  function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function resetForm(){S.editing=null;$("bill-form").reset();$("f-tenor").value=1;$("f-date").value=iso(new Date(today.getTime()+7*dayMs));$("form-title").textContent="Tambah tagihan baru";$("f-submit").textContent="Tambah tagihan";$("f-cancel").hidden=true;$("f-err").hidden=true}
  function startEdit(id){const b=S.bills[id];S.editing=id;
    // next unpaid installment date from today, else first
    let p=b.startPeriod; const s=pIdx(b.startPeriod);
    $("f-platform").value=b.platform;$("f-note").value=b.note||"";$("f-amount").value=b.amount.toLocaleString("id-ID");$("f-tenor").value=b.tenor;
    const i=s,y=Math.floor(i/12),m=i%12;$("f-date").value=iso(new Date(y,m,Math.min(b.dueDay,new Date(y,m+1,0).getDate())));
    $("form-title").textContent="Ubah tagihan";$("f-submit").textContent="Simpan perubahan";$("f-cancel").hidden=false;
    $("bill-form").scrollIntoView({behavior:"smooth",block:"center"});$("f-platform").focus({preventScroll:true});
  }
  $("f-cancel").onclick=resetForm;
  $("bill-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const platform=$("f-platform").value.trim(), note=$("f-note").value.trim(), amount=parseAmt($("f-amount").value), tenor=parseInt($("f-tenor").value,10), dv=$("f-date").value;
    const err=$("f-err");
    const bad=!platform?"Isi nama platform.":!amount?"Isi nominal per bulan.":!(tenor>=1)?"Sisa cicilan minimal 1x.":!dv?"Pilih tanggal jatuh tempo.":"";
    if(bad){err.textContent=bad;err.hidden=false;return}
    if(!S.db){err.textContent="Masuk dulu untuk menyimpan tagihan.";err.hidden=false;return}
    const [Y,M,D]=dv.split("-").map(Number);
    const body={platform,note,amount,tenor,dueDay:D,startPeriod:Y+"-"+String(M).padStart(2,"0")};
    try{
      if(S.editing){const id=S.editing;await S.db.updateBill(id,body);toast("Tagihan diperbarui")}
      else{const id="b-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);body.createdAt=new Date().toISOString();await S.db.addBill(id,body);toast("Tagihan "+platform+" ditambahkan")}
      resetForm();
    }catch(x){err.textContent="Gagal menyimpan: "+(x&&x.message||"coba lagi");err.hidden=false}
  });
  resetForm();
  render();

  /* ---------- data: Supabase atau localStorage (lihat store.js) ---------- */
  window.Store.init({
    notice:msg=>{const n=$("notice");n.innerHTML=msg||"";n.hidden=!msg},
    ready:store=>{S.db=store},
    settings:d=>{S.settings={...S.settings,...d};render()},
    bills:o=>{S.bills=o;S.loaded.b=true;render();maybeToast()},
    payments:o=>{S.payments=o;S.loaded.p=true;render();maybeToast()},
  });
  function maybeToast(){if(S.toastShown||!S.loaded.b||!S.loaded.p)return;S.toastShown=true;if(billsArr().length)toast(ewsSummary())}
})();
