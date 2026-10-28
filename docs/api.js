/* Akses data Dash Tagihan ke Supabase.
 * Login: username dipetakan ke email internal <username>@dash-tagihan.local (lihat migrasi app_users).
 * Password disimpan ter-hash (bcrypt) oleh Supabase Auth.
 */
(function () {
  const cfg = window.DASH_CONFIG || {};
  const ok = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = ok ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const DOMAIN = "dash-tagihan.local";

  const chk = r => { if (r.error) throw r.error; return r.data; };

  const mapBill = r => ({ id: r.id, platform: r.platform, note: r.note || "", amount: Number(r.amount) || 0, tenor: Number(r.tenor) || 1, dueDay: Number(r.due_day) || 1, startPeriod: r.start_period, createdAt: r.created_at });
  const billRow = b => ({ platform: b.platform, note: b.note || "", amount: b.amount, tenor: b.tenor, due_day: b.dueDay, start_period: b.startPeriod });

  window.Api = {
    configured: ok,
    DEFAULT_PASSWORD: "P@ssw0rd",

    async session() { return ok ? (await sb.auth.getSession()).data.session : null; },
    async login(username, password) {
      const email = username.trim().toLowerCase() + "@" + DOMAIN;
      return chk(await sb.auth.signInWithPassword({ email, password }));
    },
    async logout() { await sb.auth.signOut(); },
    async me() {
      const s = await this.session(); if (!s) return null;
      const rows = chk(await sb.from("app_users").select("*").eq("user_id", s.user.id).limit(1));
      return rows[0] || null;
    },
    async changePassword(pw) {
      chk(await sb.auth.updateUser({ password: pw }));
      chk(await sb.rpc("mark_password_changed"));
    },

    async bills() { const o = {}; chk(await sb.from("bills").select("*")).forEach(r => o[r.id] = mapBill(r)); return o; },
    async payments() {
      const o = {};
      chk(await sb.from("payments").select("*")).forEach(r => o[r.id] = { billId: r.bill_id, period: r.period, amount: Number(r.amount), paidAt: r.paid_at });
      return o;
    },
    async addBill(id, b) { chk(await sb.from("bills").insert({ id, ...billRow(b) })); },
    async updateBill(id, b) { chk(await sb.from("bills").update(billRow(b)).eq("id", id)); },
    async deleteBill(id) { chk(await sb.from("bills").delete().eq("id", id)); },
    async setPayment(k, p) { chk(await sb.from("payments").upsert({ id: k, bill_id: p.billId, period: p.period, amount: p.amount, paid_at: p.paidAt })); },
    async deletePayment(k) { chk(await sb.from("payments").delete().eq("id", k)); },

    async users() { return chk(await sb.from("app_users").select("*").order("created_at")); },
    async createUser(u) { return chk(await sb.rpc("admin_create_user", { p_username: u.username, p_full_name: u.fullName, p_role: u.role })); },
    async updateUser(id, u) { chk(await sb.rpc("admin_update_user", { p_user_id: id, p_full_name: u.fullName, p_role: u.role, p_active: u.active })); },
    async resetUserPassword(id) { chk(await sb.rpc("admin_reset_password", { p_user_id: id })); },
    async deleteUser(id) { chk(await sb.rpc("admin_delete_user", { p_user_id: id })); },

    /* Perubahan dari perangkat lain (butuh Realtime aktif untuk tabel bills & payments) */
    watch(onBills, onPayments) {
      return sb.channel("dash-tagihan")
        .on("postgres_changes", { event: "*", schema: "public", table: "bills" }, onBills)
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onPayments)
        .subscribe();
    },
  };
})();
