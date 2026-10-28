/* Lapisan data Dash Tagihan.
 * - Jika window.DASH_CONFIG berisi supabaseUrl + supabaseAnonKey -> Supabase (login magic link, RLS per user).
 * - Jika kosong -> mode lokal (localStorage di browser ini saja).
 * app.js hanya memanggil: addBill, updateBill, deleteBill, setPayment, deletePayment.
 */
(function () {
  const cfg = window.DASH_CONFIG || {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- mode lokal ---------- */
  function localStore(cb) {
    const KEY = "dash-tagihan:v1";
    let st = { bills: {}, payments: {} };
    try { st = JSON.parse(localStorage.getItem(KEY)) || st; } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} emit(); };
    const emit = () => { cb.bills(normBills(st.bills)); cb.payments({ ...st.payments }); };
    const api = {
      async addBill(id, b) { st.bills[id] = b; save(); },
      async updateBill(id, b) { st.bills[id] = { ...st.bills[id], ...b }; save(); },
      async deleteBill(id) {
        delete st.bills[id];
        for (const k of Object.keys(st.payments)) if (st.payments[k].billId === id) delete st.payments[k];
        save();
      },
      async setPayment(k, p) { st.payments[k] = p; save(); },
      async deletePayment(k) { delete st.payments[k]; save(); },
    };
    cb.ready(api);
    cb.notice('Mode lokal: data tersimpan di browser ini saja. Isi <code>docs/config.js</code> untuk menyambung ke Supabase.' +
      (Object.keys(st.bills).length ? "" : ' <button class="btn" id="seed-demo">Isi data contoh</button>'));
    const sd = document.getElementById("seed-demo");
    if (sd) sd.onclick = () => {
      const now = new Date(), p = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
      st.bills = {
        "contoh-1": { platform: "Contoh Paylater", note: "Data contoh", amount: 250000, tenor: 3, dueDay: 5, startPeriod: p },
        "contoh-2": { platform: "Contoh Kartu Kredit", note: "Data contoh", amount: 480000, tenor: 6, dueDay: 20, startPeriod: p },
        "contoh-3": { platform: "Contoh Pinjaman", note: "Data contoh", amount: 1200000, tenor: 12, dueDay: 27, startPeriod: p },
      };
      save(); cb.notice("Mode lokal: data contoh dimuat. Hapus lewat tombol Hapus di tiap baris.");
    };
    emit();
  }

  function normBills(o) {
    const out = {};
    for (const [id, x] of Object.entries(o)) out[id] = { id, ...x, amount: Number(x.amount) || 0, tenor: Number(x.tenor) || 1, dueDay: Number(x.dueDay) || 1 };
    return out;
  }

  /* ---------- mode Supabase ---------- */
  async function supabaseStore(cb) {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const authEl = document.getElementById("auth");
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
      cb.bills({}); cb.payments({});
      cb.notice('<form id="login" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
        '<span>Masuk untuk melihat tagihan Anda. Link login dikirim ke email.</span>' +
        '<input id="login-email" type="email" placeholder="email@contoh.com" required style="max-width:260px">' +
        '<button class="btn primary" type="submit">Kirim link login</button></form>');
      document.getElementById("login").onsubmit = async e => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        cb.notice(error ? "Gagal mengirim link: " + esc(error.message) : "Link login terkirim ke " + esc(email) + ". Buka email lalu klik link-nya.");
      };
      return;
    }

    if (authEl) {
      authEl.hidden = false;
      authEl.innerHTML = esc(session.user.email) + ' · <button class="btn ghost" id="logout">Keluar</button>';
      document.getElementById("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
    }
    cb.notice("");

    const chk = r => { if (r.error) throw r.error; return r.data; };
    const toRow = (b) => ({ platform: b.platform, note: b.note || "", amount: b.amount, tenor: b.tenor, due_day: b.dueDay, start_period: b.startPeriod });

    async function loadBills() {
      const rows = chk(await sb.from("bills").select("*"));
      const o = {};
      rows.forEach(r => o[r.id] = { platform: r.platform, note: r.note, amount: r.amount, tenor: r.tenor, dueDay: r.due_day, startPeriod: r.start_period, createdAt: r.created_at });
      cb.bills(normBills(o));
    }
    async function loadPayments() {
      const rows = chk(await sb.from("payments").select("*"));
      const o = {};
      rows.forEach(r => o[r.id] = { billId: r.bill_id, period: r.period, amount: Number(r.amount), paidAt: r.paid_at });
      cb.payments(o);
    }
    async function loadSettings() {
      const rows = chk(await sb.from("settings").select("*").limit(1));
      if (rows[0]) cb.settings({ cutoffDay: rows[0].cutoff_day, warnDays: rows[0].warn_days });
    }

    const api = {
      async addBill(id, b) { chk(await sb.from("bills").insert({ id, ...toRow(b) })); await loadBills(); },
      async updateBill(id, b) { chk(await sb.from("bills").update(toRow(b)).eq("id", id)); await loadBills(); },
      async deleteBill(id) { chk(await sb.from("bills").delete().eq("id", id)); await Promise.all([loadBills(), loadPayments()]); },
      async setPayment(k, p) { chk(await sb.from("payments").upsert({ id: k, bill_id: p.billId, period: p.period, amount: p.amount, paid_at: p.paidAt })); await loadPayments(); },
      async deletePayment(k) { chk(await sb.from("payments").delete().eq("id", k)); await loadPayments(); },
    };
    cb.ready(api);

    try { await Promise.all([loadSettings(), loadBills(), loadPayments()]); }
    catch (e) { cb.notice("Gagal memuat data dari Supabase: " + esc(e.message) + ". Cek migrasi tabel dan config.js."); }

    // Perubahan dari perangkat lain ikut tampil (aktifkan Realtime untuk tabel bills & payments).
    sb.channel("dash-tagihan")
      .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, () => loadBills().catch(() => {}))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => loadPayments().catch(() => {}))
      .subscribe();
  }

  window.Store = {
    init(cb) {
      cb.settings = cb.settings || (() => {});
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) supabaseStore(cb).catch(e => cb.notice("Supabase error: " + esc(e.message)));
      else localStore(cb);
    },
  };
})();
