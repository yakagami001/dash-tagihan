// Edge Function: ews-reminder
// Dipanggil terjadwal (pg_cron, lihat README). Untuk tiap user yang mengisi settings.telegram_chat_id,
// kirim ringkasan cicilan yang terlambat / jatuh tempo <= warn_days hari ke Telegram.
// Secrets: TELEGRAM_BOT_TOKEN (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY tersedia otomatis).
import { createClient } from "jsr:@supabase/supabase-js@2";

type Bill = { id: string; user_id: string; platform: string; note: string; amount: number; tenor: number; due_day: number; start_period: string };

const pIdx = (p: string) => { const [y, m] = p.split("-").map(Number); return y * 12 + m - 1; };
const idxP = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

function jakartaToday(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const today = jakartaToday();

  const { data: settings, error } = await sb.from("settings").select("*").not("telegram_chat_id", "is", null);
  if (error) return new Response(error.message, { status: 500 });

  let notified = 0;
  for (const s of settings ?? []) {
    const [{ data: bills }, { data: pays }] = await Promise.all([
      sb.from("bills").select("*").eq("user_id", s.user_id),
      sb.from("payments").select("id").eq("user_id", s.user_id),
    ]);
    const paid = new Set((pays ?? []).map((p: { id: string }) => p.id));
    const lines: { d: number; text: string; amount: number }[] = [];

    for (const b of (bills ?? []) as Bill[]) {
      const start = pIdx(b.start_period);
      for (let k = 0; k < b.tenor; k++) {
        const i = start + k, period = idxP(i);
        if (paid.has(`${b.id}__${period}`)) continue;
        const y = Math.floor(i / 12), m = i % 12;
        const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const due = new Date(Date.UTC(y, m, Math.min(b.due_day, dim)));
        const d = Math.round((due.getTime() - today.getTime()) / 864e5);
        if (d > s.warn_days) break;
        const when = d < 0 ? `TELAT ${-d} hari` : d === 0 ? "HARI INI" : `${d} hari lagi`;
        lines.push({ d, amount: b.amount, text: `• ${when} — ${b.platform}${b.note ? " (" + b.note + ")" : ""} ${rupiah(b.amount)}` });
      }
    }
    if (!lines.length || !token) continue;
    lines.sort((a, b) => a.d - b.d);
    const total = lines.reduce((a, l) => a + l.amount, 0);
    const msg = `Dash Tagihan — ${lines.length} cicilan perlu dibayar (${rupiah(total)})\n` + lines.map(l => l.text).join("\n");
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text: msg }),
    });
    notified++;
  }
  return Response.json({ ok: true, notified });
});
