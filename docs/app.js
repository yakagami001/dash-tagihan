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
  const pShort=p=>{const i=pIdx(p);return MON[i%12]+" "+Math.floor(i/12)};
  const dayMs=864e5;
  const today=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())})();
  const dateID=s=>s?new Date(s).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}):"—";
  const errText=e=>{const m=(e&&(e.message||e.error_description))||String(e||"");
    if(/invalid login credentials/i.test(m)) return "Username atau password salah.";
    if(/should be different/i.test(m)) return "Password baru harus berbeda dari password lama.";
    if(/rate limit|too many/i.test(m)) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    return m||"Terjadi kesalahan. Coba lagi.";};

  const PAGES={
    "dashboard":{title:"Dashboard",crumb:"Menu utama"},
    "kalkulator":{title:"Kalkulator Budget",crumb:"Menu utama"},
    "master-tagihan":{title:"Data Master Tagihan",crumb:"Master"},
    "master-user":{title:"Setting User",crumb:"Master",admin:true},
  };

  const S={me:null,bills:{},payments:{},users:[],settings:{cutoffDay:25,warnDays:3},period:null,filter:"all",group:"platform",
    page:"dashboard",editBill:null,editUser:null,loaded:false,toastShown:false,watching:false,captcha:"",fails:0,lockUntil:0};

  function currentPeriod(){let i=today.getFullYear()*12+today.getMonth();if(today.getDate()>=S.settings.cutoffDay)i++;return idxP(i)}
  S.period=currentPeriod();

  /* ================= util UI ================= */
  let tt; function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,4200)}
  function show(view){["login","reset","app"].forEach(v=>$("view-"+v).hidden=v!==view)}
  // label tiap sel dari judul kolom, dipakai tampilan kartu di HP
  function labelize(tbodyId){const tb=$(tbodyId),hs=[...tb.closest("table").querySelectorAll("thead th")].map(t=>t.textContent.trim());
    tb.querySelectorAll("tr").forEach(tr=>{if(tr.children.length<2)return;[...tr.children].forEach((td,i)=>td.dataset.label=hs[i]||"")})}
  function setErr(id,msg){const e=$(id);e.textContent=msg||"";e.hidden=!msg}
  document.addEventListener("click",e=>{
    const t=e.target.closest("[data-toggle]");
    if(t){const i=$(t.dataset.toggle);i.type=i.type==="password"?"text":"password";t.textContent=i.type==="password"?"Lihat":"Sembunyi"}
    const c=e.target.closest("[data-close]"); if(c) c.closest(".modal").hidden=true;
    if(e.target.classList.contains("modal")) e.target.hidden=true;
    if(e.target.closest("[data-act='logout']")) logout();
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal").forEach(m=>m.hidden=true)});

  let confirmFn=null;
  function confirmBox(msg,okLabel,fn){$("m-confirm-msg").innerHTML=msg;$("m-confirm-ok").textContent=okLabel||"Ya, lanjutkan";setErr("m-confirm-err","");confirmFn=fn;$("m-confirm").hidden=false}
  $("m-confirm-ok").onclick=async()=>{const b=$("m-confirm-ok");b.disabled=true;
    try{await confirmFn();$("m-confirm").hidden=true}catch(e){setErr("m-confirm-err",errText(e))}finally{b.disabled=false}};

  /* ================= captcha ================= */
  function newCaptcha(){
    const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s="";
    const rnd=new Uint32Array(5); crypto.getRandomValues(rnd);
    for(const r of rnd) s+=A[r%A.length];
    S.captcha=s;
    const c=$("cap-canvas"),x=c.getContext("2d"),W=c.width,H=c.height;
    x.clearRect(0,0,W,H); x.fillStyle="#f2f5fa"; x.fillRect(0,0,W,H);
    for(let i=0;i<6;i++){x.strokeStyle=`rgba(18,59,102,${.15+Math.random()*.2})`;x.lineWidth=1+Math.random()*2;x.beginPath();x.moveTo(Math.random()*W,Math.random()*H);x.bezierCurveTo(Math.random()*W,Math.random()*H,Math.random()*W,Math.random()*H,Math.random()*W,Math.random()*H);x.stroke()}
    for(let i=0;i<70;i++){x.fillStyle=`rgba(11,42,74,${Math.random()*.3})`;x.fillRect(Math.random()*W,Math.random()*H,2,2)}
    [...s].forEach((ch,i)=>{x.save();x.translate(30+i*54,H/2+6);x.rotate((Math.random()-.5)*.6);
      x.font=`700 ${44+Math.random()*10|0}px "IBM Plex Mono",Consolas,monospace`;x.fillStyle=["#0b2a4a","#1d5fbf","#123b66","#a35f00"][i%4];
      x.textAlign="center";x.textBaseline="middle";x.fillText(ch,0,0);x.restore()});
    $("l-cap").value="";
  }
  $("cap-refresh").onclick=newCaptcha;

  /* ================= auth flow ================= */
  function toLogin(msg){show("login");newCaptcha();setErr("l-err",msg);$("l-pass").value="";setTimeout(()=>$("l-user").focus(),0)}
  async function boot(){
    if(!Api.configured){show("login");newCaptcha();$("cfg-err").hidden=false;$("l-submit").disabled=true;return}
    let s=null; try{s=await Api.session()}catch(e){}
    if(!s) return toLogin("");
    await afterAuth();
  }
  async function afterAuth(){
    let me=null;
    try{me=await Api.me()}catch(e){await Api.logout();return toLogin(errText(e))}
    if(!me||!me.active){await Api.logout();return toLogin(me?"Akun Anda dinonaktifkan. Hubungi admin.":"Akun tidak terdaftar di aplikasi ini.")}
    S.me=me;
    if(me.must_reset){show("reset");$("reset-who").textContent="Masuk sebagai "+me.username;$("r-pass").value="";$("r-pass2").value="";checkRules();setTimeout(()=>$("r-pass").focus(),0);return}
    enterApp();
  }
  $("login-form").addEventListener("submit",async e=>{
    e.preventDefault(); setErr("l-err","");
    const u=$("l-user").value.trim().toLowerCase(), p=$("l-pass").value, c=$("l-cap").value.trim().toUpperCase();
    const wait=Math.ceil((S.lockUntil-Date.now())/1000);
    if(wait>0) return setErr("l-err",`Terlalu banyak percobaan gagal. Coba lagi dalam ${wait} detik.`);
    if(!u||!p) return setErr("l-err","Isi username dan password.");
    if(!c) return setErr("l-err","Ketik kode captcha.");
    if(c!==S.captcha){newCaptcha();return setErr("l-err","Kode captcha salah. Kode baru sudah dibuat.")}
    const b=$("l-submit");b.disabled=true;b.textContent="Memeriksa…";
    try{await Api.login(u,p);S.fails=0;await afterAuth()}
    catch(err){S.fails++;if(S.fails>=5){S.lockUntil=Date.now()+60e3;S.fails=0}newCaptcha();setErr("l-err",errText(err))}
    finally{b.disabled=false;b.textContent="Masuk"}
  });

  const RULES={len:p=>p.length>=8,up:p=>/[a-z]/.test(p)&&/[A-Z]/.test(p),num:p=>/\d/.test(p),sym:p=>/[^A-Za-z0-9]/.test(p),def:p=>p&&p!==Api.DEFAULT_PASSWORD,same:(p,q)=>p&&p===q};
  function checkRules(){const p=$("r-pass").value,q=$("r-pass2").value;let all=true;
    document.querySelectorAll("#r-rules li").forEach(li=>{const ok=RULES[li.dataset.r](p,q);li.classList.toggle("ok",!!ok);if(!ok)all=false});
    $("r-submit").disabled=!all;return all}
  $("r-pass").addEventListener("input",checkRules);$("r-pass2").addEventListener("input",checkRules);
  $("reset-form").addEventListener("submit",async e=>{
    e.preventDefault(); if(!checkRules()) return;
    const b=$("r-submit");b.disabled=true;setErr("r-err","");
    try{await Api.changePassword($("r-pass").value);S.me.must_reset=false;toast("Password berhasil diganti.");enterApp()}
    catch(err){setErr("r-err",errText(err));b.disabled=false}
  });

  async function logout(){try{await Api.logout()}catch(e){}
    S.me=null;S.bills={};S.payments={};S.users=[];S.loaded=false;S.toastShown=false;
    history.replaceState(null,"",location.pathname);toLogin("")}

  /* ================= shell & routing ================= */
  function enterApp(){
    show("app");
    const me=S.me, name=me.full_name||me.username;
    $("who-name").textContent=name;$("who-role").textContent=(me.role==="admin"?"Administrator":"User")+" · "+me.username;
    $("who-av").textContent=name.split(/[\s.]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
    $("nav-user").hidden=me.role!=="admin";
    route(); loadData();
    if(!S.watching){S.watching=true;try{Api.watch(()=>reload("bills"),()=>reload("payments"))}catch(e){}}
  }
  function route(){
    if(!S.me||S.me.must_reset) return;
    let p=(location.hash||"#dashboard").slice(1); if(!PAGES[p]) p="dashboard";
    if(PAGES[p].admin&&S.me.role!=="admin") p="dashboard";
    S.page=p;
    Object.keys(PAGES).forEach(k=>$("page-"+k).hidden=k!==p);
    document.querySelectorAll(".nav a").forEach(a=>{if(a.dataset.page===p)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
    $("page-title").textContent=PAGES[p].title;$("crumb").textContent=PAGES[p].crumb;
    $("view-app").classList.remove("nav-open");
    renderPage();
    if(p==="master-user") loadUsers();
  }
  window.addEventListener("hashchange",route);
  $("menu-btn").onclick=()=>$("view-app").classList.toggle("nav-open");

  async function loadData(){
    try{const [b,p]=await Promise.all([Api.bills(),Api.payments()]);S.bills=b;S.payments=p;S.loaded=true;renderPage();maybeNotify()}
    catch(e){toast("Gagal memuat data: "+errText(e))}
  }
  async function reload(which){try{if(which==="bills")S.bills=await Api.bills();else S.payments=await Api.payments();renderPage()}catch(e){}}
  function renderPage(){if(S.page==="dashboard")renderDashboard();if(S.page==="kalkulator")renderCalc();if(S.page==="master-tagihan")renderMasterBills();}

  /* ================= jadwal cicilan ================= */
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
  const sum=a=>a.reduce((s,i)=>s+i.bill.amount,0);
  const itemsFor=p=>billsArr().map(b=>inst(b,p)).filter(Boolean).sort((a,b)=>a.due-b.due||a.bill.platform.localeCompare(b.bill.platform));
  function allUnpaidSoon(){
    const out=[];
    for(const b of billsArr()){const s=pIdx(b.startPeriod);
      for(let k=0;k<b.tenor;k++){const it=inst(b,idxP(s+k));if(!it||it.paid)continue;
        if(Math.round((it.due-today)/dayMs)<=7)out.push(it);else break}}
    return out.sort((a,b)=>a.due-b.due);
  }
  function ewsSummary(){const l=allUnpaidSoon();const late=l.filter(i=>i.due<today).length,soon=l.length-late;
    if(!l.length) return "Tidak ada tagihan mendesak dalam 7 hari.";
    return (late?late+" tagihan terlambat, ":"")+soon+" jatuh tempo ≤7 hari · total "+fmt(sum(l));}

  /* ================= dashboard ================= */
  function renderDashboard(){
    $("period-lbl").textContent=pLabel(S.period);
    $("today-lbl").textContent="Hari ini "+DAYS[today.getDay()]+", "+today.getDate()+" "+MONTHS[today.getMonth()]+" "+today.getFullYear();
    $("list-title").textContent="Checklist "+pLabel(S.period);
    const items=itemsFor(S.period), paid=items.filter(i=>i.paid), tot=sum(items), pTot=sum(paid);
    $("k-total").textContent=fmt(tot);$("k-total-s").textContent=items.length+" cicilan dari "+new Set(items.map(i=>i.bill.platform)).size+" platform";
    $("k-paid").textContent=fmt(pTot);$("k-paid-s").textContent=paid.length+" cicilan";
    $("k-left").textContent=fmt(tot-pTot);$("k-left-s").textContent=(items.length-paid.length)+" cicilan";
    const pct=tot?Math.round(pTot/tot*100):0;$("k-pct").textContent=pct+"%";$("k-bar").style.width=pct+"%";
    if(!S.loaded) return;
    renderEWS();renderList(items);renderPlat(items);renderChart();
  }
  function renderEWS(){
    const list=allUnpaidSoon(),el=$("ews-list");
    if(!list.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1">Aman. Tidak ada tagihan terlambat atau jatuh tempo dalam 7 hari ke depan.</div>`;return}
    el.innerHTML=list.map(it=>{const st=status(it),c=st.cls==="idle"?"soon":st.cls;
      return `<div class="ews-item ${c}"><div class="d">${st.txt}</div><div class="t"><b>${esc(it.bill.platform)} · ${fmt(it.bill.amount)}</b><span>${it.due.getDate()} ${MON[it.due.getMonth()]} ${it.due.getFullYear()}${it.bill.note?" · "+esc(it.bill.note):""}</span></div></div>`}).join("");
  }
  function rowHTML(it){
    const st=status(it),b=it.bill;
    return `<div class="row ${it.paid?"paid":""}">
      <span class="chk${st.cls==="crit"?" late":""}" role="img" aria-label="${it.paid?"Sudah dibayar":"Belum dibayar"}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m3 7.5 2.5 2.5L11 4.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <div class="due">${String(it.due.getDate()).padStart(2,"0")} ${MON[it.due.getMonth()]}<small>${DAYS[it.due.getDay()]}</small></div>
      <div class="desc"><b>${S.group==="date"?esc(b.platform)+(b.note?" · "+esc(b.note):""):esc(b.note||"Cicilan "+b.platform)}</b><span>Cicilan ke-${it.ke} dari ${b.tenor} · sisa ${it.sisa}x${it.paid&&it.pay.paidAt?" · dibayar "+new Date(it.pay.paidAt).toLocaleDateString("id-ID",{day:"numeric",month:"short"}):""}</span></div>
      <div class="st"><span class="amt">${fmt(b.amount)}</span><span class="pill ${st.cls}">${st.txt}</span></div></div>`;
  }
  function renderList(items){
    const el=$("list");
    let f=items;if(S.filter==="paid")f=items.filter(i=>i.paid);if(S.filter==="unpaid")f=items.filter(i=>!i.paid);
    if(!items.length){el.innerHTML=`<div class="empty">Tidak ada cicilan di ${pLabel(S.period)}.<br>Tambah tagihan di menu <a href="#master-tagihan">Data Master Tagihan</a>.</div>`;return}
    if(!f.length){el.innerHTML=`<div class="empty">${S.filter==="paid"?"Belum ada yang dibayar di periode ini.":"Semua tagihan periode ini sudah dibayar."}</div>`;return}
    if(S.group==="date"){el.innerHTML=`<div class="group">${f.map(rowHTML).join("")}</div>`;return}
    const g={},all={};f.forEach(i=>(g[i.bill.platform]=g[i.bill.platform]||[]).push(i));items.forEach(i=>(all[i.bill.platform]=all[i.bill.platform]||[]).push(i));
    el.innerHTML=Object.keys(g).sort((a,b)=>sum(all[b])-sum(all[a])).map(p=>{const a=all[p],pd=a.filter(i=>i.paid).length;
      return `<div class="group"><div class="group-h"><b>${esc(p)}</b><span>${pd}/${a.length} lunas</span><span class="num">${fmt(sum(a))}</span></div>${g[p].map(rowHTML).join("")}</div>`}).join("");
  }
  function renderPlat(items){
    const g={};items.forEach(i=>{const x=g[i.bill.platform]=g[i.bill.platform]||{t:0,p:0};x.t+=i.bill.amount;if(i.paid)x.p+=i.bill.amount});
    const keys=Object.keys(g).sort((a,b)=>g[b].t-g[a].t),max=Math.max(1,...keys.map(k=>g[k].t));
    $("plat-hint").textContent=pLabel(S.period);
    $("plat").innerHTML=keys.length?keys.map(k=>{const x=g[k],wp=x.p/max*100,wu=(x.t-x.p)/max*100;
      return `<div class="plat-row" title="${esc(k)}: dibayar ${fmt(x.p)}, belum ${fmt(x.t-x.p)}"><div class="top2"><b>${esc(k)}</b><span class="num">${fmt(x.t-x.p)} belum · ${fmt(x.t)}</span></div><div class="stack">${wp?`<i style="width:${wp}%;background:var(--accent)"></i>`:""}${wu?`<i style="width:${wu}%;background:var(--unpaid)"></i>`:""}</div></div>`}).join(""):`<div class="hint">Belum ada data.</div>`;
  }
  function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x)));const n=x/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p}
  function barPath(x,y,w,h,round){if(h<=0)return"";const r=round?Math.min(4,h,w/2):0;
    return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}
  function renderChart(){
    const c=$("chart"),base=pIdx(S.period),months=[];
    for(let k=-5;k<=6;k++){const p=idxP(base+k),its=itemsFor(p);months.push({p,t:sum(its),pd:sum(its.filter(i=>i.paid))})}
    const W=330,H=170,L=34,B=22,T=8,cw=(W-L)/12,bw=Math.min(16,cw-6),ph=H-T-B;
    const max=Math.max(1,...months.map(m=>m.t)),step=niceStep(max/3),top=Math.ceil(max/step)*step,y=v=>T+ph*(1-v/top);
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Total tagihan per bulan, dibayar dan belum">`;
    for(let v=0;v<=top+1;v+=step)s+=`<line class="gl" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${v?short(v):"0"}</text>`;
    months.forEach((m,i)=>{const x=L+i*cw+(cw-bw)/2,sel=m.p===S.period,hp=ph*m.pd/top,hu=ph*(m.t-m.pd)/top,y0=H-B;
      if(m.pd)s+=`<path d="${barPath(x,y0-hp,bw,hp,!(m.t-m.pd))}" fill="var(--accent)"/>`;
      if(m.t-m.pd)s+=`<path d="${barPath(x,y0-hp-hu,bw,hu-(m.pd?2:0),true)}" fill="var(--unpaid)"/>`;
      s+=`<text x="${x+bw/2}" y="${H-7}" text-anchor="middle" style="${sel?"fill:var(--navy);font-weight:600":""}">${MON[pIdx(m.p)%12]}</text>`;
      s+=`<rect x="${L+i*cw}" y="0" width="${cw}" height="${H}" fill="transparent" data-i="${i}" style="cursor:pointer"/>`});
    c.innerHTML=s+`</svg><div class="tip" id="tip" hidden></div>`;
    const tip=$("tip");
    c.querySelectorAll("rect[data-i]").forEach(r=>{
      r.addEventListener("mouseenter",()=>{const m=months[+r.dataset.i],bb=r.getBoundingClientRect(),cb=c.getBoundingClientRect();
        tip.innerHTML=`<b>${pLabel(m.p)}</b><br>Total <span class="num">${fmt(m.t)}</span><br>Dibayar <span class="num">${fmt(m.pd)}</span><br>Belum <span class="num">${fmt(m.t-m.pd)}</span>`;
        tip.style.left=Math.min(Math.max(bb.left-cb.left+bb.width/2,80),cb.width-80)+"px";tip.style.top=(bb.top-cb.top+20)+"px";tip.hidden=false});
      r.addEventListener("mouseleave",()=>tip.hidden=true);
      r.addEventListener("click",()=>{S.period=months[+r.dataset.i].p;renderDashboard()});
    });
  }

  $("prev").onclick=()=>{S.period=idxP(pIdx(S.period)-1);renderDashboard()};
  $("next").onclick=()=>{S.period=idxP(pIdx(S.period)+1);renderDashboard()};
  $("go-now").onclick=()=>{S.period=currentPeriod();renderDashboard()};
  document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{S.filter=b.dataset.f;document.querySelectorAll("[data-f]").forEach(x=>x.setAttribute("aria-pressed",x===b));renderDashboard()});
  document.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{S.group=b.dataset.g;document.querySelectorAll("[data-g]").forEach(x=>x.setAttribute("aria-pressed",x===b));renderDashboard()});
  /* ---------- konfirmasi pembayaran (multi pilih) ---------- */
  const P={mode:"pay",items:{}};
  const keyOf=it=>it.bill.id+"__"+it.period;
  function payCandidates(){
    if(P.mode==="undo") return {groups:[["Sudah dibayar · "+pLabel(S.period),itemsFor(S.period).filter(i=>i.paid)]]};
    const late=[];
    for(const b of billsArr()){const s=pIdx(b.startPeriod);
      for(let k=0;k<b.tenor;k++){const p=idxP(s+k);if(pIdx(p)>=pIdx(S.period))break;const it=inst(b,p);if(it&&!it.paid)late.push(it)}}
    late.sort((a,b)=>a.due-b.due);
    return {groups:[["Tunggakan bulan sebelumnya",late],["Belum dibayar · "+pLabel(S.period),itemsFor(S.period).filter(i=>!i.paid)]]};
  }
  function openPay(mode){
    P.mode=mode||P.mode;P.items={};setErr("pay-err","");
    document.querySelectorAll("[data-pm]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pm===P.mode));
    // kelompokkan per platform: tunggakan + periode ini, urut jatuh tempo di dalam platform
    const byPlat={};
    payCandidates().groups.forEach(([,list])=>list.forEach(it=>(byPlat[it.bill.platform]=byPlat[it.bill.platform]||[]).push(it)));
    let html="";
    Object.keys(byPlat).sort((a,b)=>a.localeCompare(b)).forEach((plat,gi)=>{
      const list=byPlat[plat].sort((a,b)=>a.due-b.due),late=list.filter(i=>!i.paid&&i.due<today).length;
      html+=`<label class="pay-sep"><input type="checkbox" data-grp="${gi}" aria-label="Pilih semua ${esc(plat)}"><b>${esc(plat)}</b><span>${list.length} cicilan${late?` · <span class="pill crit">${late} telat</span>`:""}</span><span class="num">${fmt(sum(list))}</span></label>`;
      list.forEach(it=>{const k=keyOf(it),st=status(it);P.items[k]=it;
        html+=`<label class="pay-item"><input type="checkbox" value="${esc(k)}" data-in="${gi}">
          <span class="due">${String(it.due.getDate()).padStart(2,"0")} ${MON[it.due.getMonth()]}<small>${it.due.getFullYear()}</small></span>
          <span class="desc"><b>${esc(it.bill.platform)}${it.bill.note?" · "+esc(it.bill.note):""}</b><span>Cicilan ke-${it.ke} dari ${it.bill.tenor} · <span class="pill ${st.cls}">${st.txt}</span></span></span>
          <span class="amt">${fmt(it.bill.amount)}</span></label>`})});
    $("pay-list").innerHTML=html||`<div class="empty">${P.mode==="pay"?"Tidak ada cicilan yang belum dibayar di periode ini.":"Belum ada pembayaran di periode ini."}</div>`;
    $("pay-hint").textContent=P.mode==="pay"?"Dikelompokkan per platform, termasuk tunggakan bulan sebelumnya. Centang cicilan yang sudah Anda bayar, atau centang nama platform untuk memilih semuanya.":"Centang pembayaran periode ini yang ingin dibatalkan (dikembalikan ke status belum dibayar).";
    $("pay-date-l").hidden=P.mode!=="pay";$("pay-date").value=iso(today);
    $("pay-all").checked=false;$("pay-all").closest("label").hidden=!Object.keys(P.items).length;
    $("pay-go").textContent=P.mode==="pay"?"Konfirmasi sudah dibayar":"Batalkan pembayaran";
    $("pay-go").classList.toggle("danger",P.mode==="undo");$("pay-go").classList.toggle("solid",P.mode==="undo");
    paySum();$("m-pay").hidden=false;
  }
  const payInputs=()=>[...document.querySelectorAll("#pay-list input[data-in]")];
  const paySel=()=>payInputs().filter(i=>i.checked).map(i=>P.items[i.value]);
  function paySum(){const s=paySel();$("pay-sum").textContent=s.length+" dipilih · "+fmt(sum(s));$("pay-go").disabled=!s.length;
    const all=payInputs();$("pay-all").checked=all.length&&s.length===all.length;
    document.querySelectorAll("#pay-list input[data-grp]").forEach(g=>{const its=all.filter(i=>i.dataset.in===g.dataset.grp),n=its.filter(i=>i.checked).length;
      g.checked=n>0&&n===its.length;g.indeterminate=n>0&&n<its.length})}
  $("pay-open").onclick=()=>openPay("pay");
  document.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>openPay(b.dataset.pm));
  $("pay-list").addEventListener("change",e=>{const g=e.target.dataset.grp;
    if(g!==undefined)payInputs().filter(i=>i.dataset.in===g).forEach(i=>i.checked=e.target.checked);paySum()});
  $("pay-all").onchange=e=>{document.querySelectorAll("#pay-list input").forEach(i=>i.checked=e.target.checked);paySum()};
  $("pay-go").onclick=()=>{
    const sel=paySel();if(!sel.length)return;
    const dv=$("pay-date").value;
    if(P.mode==="pay"&&!dv)return setErr("pay-err","Isi tanggal bayar.");
    const list=sel.map(it=>`<li>${esc(it.bill.platform)}${it.bill.note?" · "+esc(it.bill.note):""} — ${it.due.getDate()} ${MON[it.due.getMonth()]} · <b>${fmt(it.bill.amount)}</b></li>`).join("");
    const head=P.mode==="pay"
      ?`Konfirmasi <b>${sel.length} cicilan</b> senilai <b>${fmt(sum(sel))}</b> sudah dibayar pada <b>${dateID(dv)}</b>?`
      :`Batalkan <b>${sel.length} pembayaran</b> senilai <b>${fmt(sum(sel))}</b>? Statusnya kembali menjadi belum dibayar.`;
    confirmBox(`${head}<ul style="margin:10px 0 0;padding-left:18px;font-size:13px;max-height:180px;overflow:auto">${list}</ul>`,P.mode==="pay"?"Ya, sudah dibayar":"Ya, batalkan",async()=>{
      if(P.mode==="pay"){const[Y,M,D]=dv.split("-").map(Number),at=new Date(Y,M-1,D,12).toISOString();
        await Api.setPayments(sel.map(it=>[keyOf(it),{billId:it.bill.id,period:it.period,amount:it.bill.amount,paidAt:at}]))}
      else await Api.deletePayments(sel.map(keyOf));
      $("m-pay").hidden=true;await reload("payments");
      toast(P.mode==="pay"?sel.length+" cicilan ditandai sudah dibayar":sel.length+" pembayaran dibatalkan");
    });
  };

  /* ---------- notifikasi browser ---------- */
  function notify(msg){try{new Notification("Dash Tagihan",{body:msg,tag:"dash-tagihan"});return true}catch(e){return false}}
  function maybeNotify(){
    if(S.toastShown||!billsArr().length)return;S.toastShown=true;
    const msg=ewsSummary();toast(msg);
    try{if(Notification.permission!=="granted"||!allUnpaidSoon().length)return;
      const k="dash-tagihan:notified",d=today.toDateString();if(localStorage.getItem(k)===d)return;
      if(notify(msg))localStorage.setItem(k,d)}catch(e){}
  }
  function syncNotifBtn(){try{if("Notification" in window&&Notification.permission==="granted")$("notif-btn").textContent="Kirim notifikasi sekarang"}catch(e){}}
  syncNotifBtn();
  $("notif-btn").onclick=async()=>{
    try{
      if(!("Notification" in window))throw 0;
      const p=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(p!=="granted")return toast("Notifikasi ditolak browser. Izinkan lewat ikon gembok di address bar.");
      syncNotifBtn();notify(ewsSummary());toast("Notifikasi aktif. Pengingat muncul sekali sehari saat dashboard dibuka.");
    }catch(e){toast("Browser ini tidak mendukung notifikasi.")}
  };

  /* ================= kalkulator budget ================= */
  const C={init:false,off:new Set(),extras:[]};
  const XKEY="dash-tagihan:extras";
  try{C.extras=JSON.parse(localStorage.getItem(XKEY))||[]}catch(e){}
  const saveExtras=()=>{try{localStorage.setItem(XKEY,JSON.stringify(C.extras))}catch(e){}};
  function presetRange(p){
    const cur=pIdx(currentPeriod()),y=Math.floor(cur/12),m=cur%12;
    if(p==="period")return [today,new Date(y,m+1,0)];
    if(p==="next")return [new Date(y,m+1,1),new Date(y,m+2,0)];
    if(p==="90")return [today,new Date(today.getTime()+90*dayMs)];
    return [today,new Date(today.getTime()+30*dayMs)];
  }
  function applyPreset(p){const[f,t]=presetRange(p);$("c-from").value=iso(f);$("c-to").value=iso(t);
    document.querySelectorAll("[data-preset]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.preset===p));renderCalc()}
  document.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
  ["c-from","c-to"].forEach(id=>$(id).addEventListener("input",()=>{document.querySelectorAll("[data-preset]").forEach(b=>b.setAttribute("aria-pressed","false"));renderCalc()}));
  $("c-fund").addEventListener("input",e=>{const n=parseAmt(e.target.value);e.target.value=n?n.toLocaleString("id-ID"):"";renderCalc()});
  $("c-overdue").addEventListener("change",renderCalc);
  $("c-plats").addEventListener("change",e=>{const p=e.target.value;e.target.checked?C.off.delete(p):C.off.add(p);renderCalc()});
  $("c-x-amt").addEventListener("input",e=>{const n=parseAmt(e.target.value);e.target.value=n?n.toLocaleString("id-ID"):""});
  function addExtra(){const n=$("c-x-name").value.trim(),a=parseAmt($("c-x-amt").value);
    if(!n||!a)return toast("Isi nama dan nominal biaya lain.");
    C.extras.push({n,a});saveExtras();$("c-x-name").value="";$("c-x-amt").value="";renderCalc();$("c-x-name").focus()}
  $("c-x-add").onclick=addExtra;
  ["c-x-name","c-x-amt"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addExtra()}}));
  $("c-extras").addEventListener("click",e=>{const b=e.target.closest("[data-x]");if(!b)return;C.extras.splice(+b.dataset.x,1);saveExtras();renderCalc()});
  const parseDate=v=>{if(!v)return null;const[Y,M,D]=v.split("-").map(Number);return new Date(Y,M-1,D)};

  function renderCalc(){
    if(!C.init){C.init=true;applyPreset("period");return}
    const plats=[...new Set(billsArr().map(b=>b.platform))].sort();
    $("c-plats").innerHTML=plats.map(p=>`<label class="chip"><input type="checkbox" value="${esc(p)}"${C.off.has(p)?"":" checked"}>${esc(p)}</label>`).join("")||'<span class="hint">Belum ada tagihan.</span>';
    $("c-extras").innerHTML=C.extras.map((x,i)=>`<div class="extra"><span>${esc(x.n)}</span><b class="num">${fmt(x.a)}</b><button type="button" class="btn ghost danger" data-x="${i}" aria-label="Hapus ${esc(x.n)}">✕</button></div>`).join("");
    if(!S.loaded)return;
    const from=parseDate($("c-from").value),to=parseDate($("c-to").value),fund=parseAmt($("c-fund").value),od=$("c-overdue").checked;
    if(!from||!to||to<from){$("c-rows").innerHTML=`<tr><td colspan="5" class="empty">Pilih rentang tanggal yang valid.</td></tr>`;return}
    const items=[];
    for(const b of billsArr()){if(C.off.has(b.platform))continue;const s=pIdx(b.startPeriod);
      for(let k=0;k<b.tenor;k++){const it=inst(b,idxP(s+k));if(!it||it.paid)continue;
        if(it.due>to)break;if(it.due>=from||od)items.push(it)}}
    items.sort((a,b)=>a.due-b.due);
    const xTot=C.extras.reduce((s,x)=>s+x.a,0),bTot=sum(items),need=bTot+xTot,late=items.filter(i=>i.due<from);
    $("c-need").textContent=fmt(need);
    $("c-need-s").textContent=items.length+" cicilan"+(late.length?` (${late.length} tunggakan)`:"")+(C.extras.length?` + ${C.extras.length} biaya lain`:"");
    $("c-fund-v").textContent=fmt(fund);
    $("c-range").textContent=dateID(from)+" – "+dateID(to);
    const diff=fund-need,card=$("c-diff-card");
    card.classList.toggle("good",!!fund&&diff>=0);card.classList.toggle("bad",!!fund&&diff<0);
    $("c-diff-k").textContent=!fund?"Selisih":diff>=0?"Sisa dana":"Kekurangan";
    $("c-diff").textContent=fund?fmt(Math.abs(diff)):"—";
    $("c-diff-s").textContent=!fund?"Isi dana tersedia untuk menghitung":diff>=0?"Dana cukup untuk semua tagihan":"Dana tidak cukup";
    // urutan bayar: biaya lain dulu, lalu tagihan per jatuh tempo
    let bal=fund,firstShort=null;
    const rowsX=C.extras.map(x=>{bal-=x.a;const sh=fund&&bal<0;if(sh&&!firstShort)firstShort={label:x.n,when:"biaya lain"};
      return `<tr class="${sh?"short":""}"><td><span class="hint">Biaya lain</span></td><td>${esc(x.n)}</td><td></td><td class="r num">${fmt(x.a)}</td><td class="r num">${fund?fmt(bal):"—"}</td></tr>`});
    const rowsB=items.map(it=>{bal-=it.bill.amount;const sh=fund&&bal<0,ov=it.due<from;
      if(sh&&!firstShort)firstShort={label:it.bill.platform,when:dateID(it.due)};
      return `<tr class="${sh?"short ":""}${ov?"overdue":""}"><td>${dateID(it.due)}${ov?' · telat':""}</td><td>${esc(it.bill.platform)}</td><td>${esc(it.bill.note)||'<span class="hint">Cicilan ke-'+it.ke+"</span>"}</td><td class="r num">${fmt(it.bill.amount)}</td><td class="r num">${fund?fmt(bal):"—"}</td></tr>`});
    $("c-rows").innerHTML=rowsX.concat(rowsB).join("")||`<tr><td colspan="5" class="empty">Tidak ada tagihan belum dibayar di rentang ini.</td></tr>`;
    labelize("c-rows");
    const al=$("c-short");
    if(firstShort){al.hidden=false;al.innerHTML=`Dana mulai tidak cukup saat membayar <b>${esc(firstShort.label)}</b> (${esc(firstShort.when)}). Total kekurangan <b>${fmt(-diff)}</b>.`}else al.hidden=true;
    const g={};items.forEach(i=>g[i.bill.platform]=(g[i.bill.platform]||0)+i.bill.amount);if(xTot)g["Biaya lain"]=xTot;
    const keys=Object.keys(g).sort((a,b)=>g[b]-g[a]),max=Math.max(1,...keys.map(k=>g[k]));
    $("c-plat-sum").innerHTML=keys.map(k=>`<div class="plat-row"><div class="top2"><b>${esc(k)}</b><span class="num">${fmt(g[k])} · ${need?Math.round(g[k]/need*100):0}%</span></div><div class="stack"><i style="width:${g[k]/max*100}%;background:var(--navy)"></i></div></div>`).join("")||'<div class="hint">Tidak ada data di rentang ini.</div>';
  }

  /* ================= master tagihan ================= */
  function billInfo(b){
    const s=pIdx(b.startPeriod);let paid=0;
    for(let k=0;k<b.tenor;k++)if(S.payments[b.id+"__"+idxP(s+k)])paid++;
    return {paid,sisa:b.tenor-paid,end:idxP(s+b.tenor-1)};
  }
  ["bf-q","bf-plat","bf-status"].forEach(id=>$(id).addEventListener("input",renderMasterBills));
  function renderMasterBills(){
    const plats=[...new Set(billsArr().map(b=>b.platform))].sort();
    const sel=$("bf-plat"),cur=sel.value;
    sel.innerHTML=`<option value="">Semua platform</option>`+plats.map(p=>`<option${p===cur?" selected":""}>${esc(p)}</option>`).join("");
    $("plat-list").innerHTML=plats.map(p=>`<option value="${esc(p)}">`).join("");
    if(!S.loaded)return;
    const q=$("bf-q").value.trim().toLowerCase(),fp=$("bf-plat").value,fs=$("bf-status").value;
    const rows=billsArr().map(b=>({b,i:billInfo(b)}))
      .filter(({b,i})=>(!q||(b.platform+" "+b.note).toLowerCase().includes(q))&&(!fp||b.platform===fp)&&(!fs||(fs==="lunas"?i.sisa===0:i.sisa>0)))
      .sort((x,y)=>x.b.platform.localeCompare(y.b.platform)||x.b.dueDay-y.b.dueDay);
    if(!rows.length){$("bill-rows").innerHTML=`<tr><td colspan="9" class="empty">${billsArr().length?"Tidak ada tagihan yang cocok dengan filter.":"Belum ada tagihan. Klik “+ Tambah tagihan”."}</td></tr>`;$("bill-foot").innerHTML="";return}
    $("bill-rows").innerHTML=rows.map(({b,i})=>`<tr>
      <td><b>${esc(b.platform)}</b></td><td>${esc(b.note)||'<span class="hint">—</span>'}</td>
      <td class="r num">${fmt(b.amount)}</td><td>Tgl ${b.dueDay} tiap bulan</td>
      <td>${pShort(b.startPeriod)}${b.tenor>1?" – "+pShort(i.end):""}</td>
      <td class="r num">${i.paid}/${b.tenor}</td><td class="r num">${fmt(i.sisa*b.amount)}</td>
      <td>${i.sisa?`<span class="pill soon">Aktif · sisa ${i.sisa}x</span>`:`<span class="pill good">Lunas</span>`}</td>
      <td><div class="acts"><button class="btn ghost" data-bill-edit="${esc(b.id)}">Ubah</button><button class="btn ghost danger" data-bill-del="${esc(b.id)}">Hapus</button></div></td></tr>`).join("");
    labelize("bill-rows");
    const act=rows.filter(r=>r.i.sisa>0);
    $("bill-foot").innerHTML=`<tr><td colspan="2">${rows.length} tagihan · ${act.length} aktif</td><td class="r num" data-label="Nominal aktif / bln">${fmt(act.reduce((s,r)=>s+r.b.amount,0))}</td><td colspan="3"></td><td class="r num" data-label="Total sisa nominal">${fmt(rows.reduce((s,r)=>s+r.i.sisa*r.b.amount,0))}</td><td colspan="2"></td></tr>`;
  }
  const parseAmt=v=>Number(String(v).replace(/[^\d]/g,""));
  const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  $("f-amount").addEventListener("input",e=>{const n=parseAmt(e.target.value);e.target.value=n?n.toLocaleString("id-ID"):""});
  function openBill(id){
    S.editBill=id||null;setErr("f-err","");
    const b=id&&S.bills[id];
    $("m-bill-t").textContent=b?"Ubah tagihan":"Tambah tagihan";
    $("f-platform").value=b?b.platform:"";$("f-note").value=b?b.note:"";
    $("f-amount").value=b?b.amount.toLocaleString("id-ID"):"";$("f-tenor").value=b?b.tenor:1;
    if(b){const i=pIdx(b.startPeriod),y=Math.floor(i/12),m=i%12;$("f-date").value=iso(new Date(y,m,Math.min(b.dueDay,new Date(y,m+1,0).getDate())))}
    else $("f-date").value=iso(new Date(today.getTime()+7*dayMs));
    $("m-bill").hidden=false;setTimeout(()=>$("f-platform").focus(),0);
  }
  $("bill-add").onclick=()=>openBill(null);
  $("bill-rows").addEventListener("click",e=>{
    const ed=e.target.closest("[data-bill-edit]");if(ed)return openBill(ed.dataset.billEdit);
    const del=e.target.closest("[data-bill-del]");if(!del)return;
    const b=S.bills[del.dataset.billDel];
    confirmBox(`Hapus tagihan <b>${esc(b.platform)}${b.note?" · "+esc(b.note):""}</b> (${fmt(b.amount)}) beserta histori pembayarannya?`,"Ya, hapus",async()=>{
      await Api.deleteBill(b.id);delete S.bills[b.id];await reload("payments");toast("Tagihan dihapus")});
  });
  $("bill-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const platform=$("f-platform").value.trim(),note=$("f-note").value.trim(),amount=parseAmt($("f-amount").value),tenor=parseInt($("f-tenor").value,10),dv=$("f-date").value;
    const bad=!platform?"Isi nama platform.":!amount?"Isi nominal per bulan.":!(tenor>=1&&tenor<=120)?"Jumlah cicilan 1–120.":!dv?"Pilih tanggal jatuh tempo pertama.":"";
    if(bad)return setErr("f-err",bad);
    const[Y,M,D]=dv.split("-").map(Number);
    const body={platform,note,amount,tenor,dueDay:D,startPeriod:Y+"-"+String(M).padStart(2,"0")};
    const btn=$("f-submit");btn.disabled=true;
    try{
      if(S.editBill){await Api.updateBill(S.editBill,body);toast("Tagihan diperbarui")}
      else{await Api.addBill("b-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),body);toast("Tagihan "+platform+" ditambahkan")}
      $("m-bill").hidden=true;await reload("bills");
    }catch(x){setErr("f-err","Gagal menyimpan: "+errText(x))}finally{btn.disabled=false}
  });

  /* ================= master user ================= */
  async function loadUsers(){
    try{S.users=await Api.users();renderUsers()}catch(e){$("user-rows").innerHTML=`<tr><td colspan="7" class="empty">Gagal memuat: ${esc(errText(e))}</td></tr>`}
  }
  function renderUsers(){
    $("user-rows").innerHTML=S.users.map(u=>{const self=u.user_id===S.me.user_id;
      return `<tr>
      <td><b>${esc(u.username)}</b>${self?' <span class="hint">(Anda)</span>':""}</td><td>${esc(u.full_name)||'<span class="hint">—</span>'}</td>
      <td>${u.role==="admin"?"Admin":"User"}</td>
      <td>${u.active?'<span class="pill good">Aktif</span>':'<span class="pill idle">Nonaktif</span>'}</td>
      <td>${u.must_reset?'<span class="pill warn">Wajib ganti</span>':'<span class="hint">Diganti '+dateID(u.password_changed_at)+"</span>"}</td>
      <td>${dateID(u.created_at)}</td>
      <td><div class="acts"><button class="btn ghost" data-u-edit="${u.user_id}">Ubah</button>
        <button class="btn ghost" data-u-reset="${u.user_id}">Reset password</button>
        ${self?"":`<button class="btn ghost danger" data-u-del="${u.user_id}">Hapus</button>`}</div></td></tr>`}).join("")||`<tr><td colspan="7" class="empty">Belum ada user.</td></tr>`;
    labelize("user-rows");
  }
  function openUser(id){
    const u=id&&S.users.find(x=>x.user_id===id);S.editUser=u?id:null;setErr("u-err","");
    $("m-user-t").textContent=u?"Ubah user":"Tambah user";
    $("u-username").value=u?u.username:"";$("u-username").disabled=!!u;
    $("u-name").value=u?u.full_name:"";$("u-role").value=u?u.role:"user";$("u-active").value=u&&!u.active?"0":"1";
    $("m-user").hidden=false;setTimeout(()=>(u?$("u-name"):$("u-username")).focus(),0);
  }
  $("user-add").onclick=()=>openUser(null);
  $("user-rows").addEventListener("click",e=>{
    const ed=e.target.closest("[data-u-edit]");if(ed)return openUser(ed.dataset.uEdit);
    const rs=e.target.closest("[data-u-reset]");
    if(rs){const u=S.users.find(x=>x.user_id===rs.dataset.uReset);
      return confirmBox(`Reset password <b>${esc(u.username)}</b> ke default <b>P@ssw0rd</b>? User wajib mengganti password saat login berikutnya.`,"Ya, reset",async()=>{
        await Api.resetUserPassword(u.user_id);toast("Password "+u.username+" direset ke default");
        if(u.user_id===S.me.user_id){await logout();return}await loadUsers()})}
    const dl=e.target.closest("[data-u-del]");
    if(dl){const u=S.users.find(x=>x.user_id===dl.dataset.uDel);
      confirmBox(`Hapus user <b>${esc(u.username)}</b>? Akun tidak bisa login lagi. Data tagihan tetap tersimpan.`,"Ya, hapus",async()=>{
        await Api.deleteUser(u.user_id);toast("User "+u.username+" dihapus");await loadUsers()})}
  });
  $("user-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const username=$("u-username").value.trim().toLowerCase(),fullName=$("u-name").value.trim(),role=$("u-role").value,active=$("u-active").value==="1";
    if(!S.editUser&&!/^[a-z0-9._-]{3,32}$/.test(username))return setErr("u-err","Username 3–32 karakter: huruf kecil, angka, titik, minus, underscore.");
    if(!fullName)return setErr("u-err","Isi nama lengkap.");
    const btn=$("u-submit");btn.disabled=true;
    try{
      if(S.editUser){await Api.updateUser(S.editUser,{fullName,role,active});toast("User diperbarui")}
      else{const id=await Api.createUser({username,fullName,role});if(!active)await Api.updateUser(id,{fullName,role,active});toast("User "+username+" dibuat. Password awal: P@ssw0rd")}
      $("m-user").hidden=true;await loadUsers();
    }catch(x){setErr("u-err",errText(x))}finally{btn.disabled=false}
  });

  boot();
})();
