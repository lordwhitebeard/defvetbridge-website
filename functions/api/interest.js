// DefVetBridge: "Register your interest" form handler (Cloudflare Pages Function, POST /api/interest).
// Saves each sign-up to the D1 database bound as DB (Pages project > Settings > Bindings > D1, variable name DB).
// No third parties. Spam checks: a hidden honeypot field and a minimum time on the page.
// View sign-ups: Cloudflare > Storage & Databases > D1 > dvb-interest > Console:
//   SELECT * FROM interest ORDER BY created_at DESC;
// Emails (optional, via Resend): set the secret RESEND_API_KEY on the Pages project. A NEW sign-up then gets one
// confirmation email (free guide link), and admin@ gets a note. Re-submissions update the row, no email.
// Without the key, sign-ups still save and no email is sent.

const ROLES = ["Veteran", "Advocate", "Family member", "Organisation", "Other"];
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA", "Outside Australia"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

export async function onRequestPost({ request, env, waitUntil }) {
  let d;
  try {
    const type = request.headers.get("content-type") || "";
    d = type.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return json(400, { ok: false, error: "Could not read the form." });
  }

  // Spam: bots fill the hidden "website" field and submit instantly. Pretend success so they learn nothing.
  if (clean(d.website, 200) !== "") return json(200, { ok: true });
  const ms = Number(d.elapsed_ms);
  if (!Number.isFinite(ms) || ms < 3000) return json(200, { ok: true });

  const rec = {
    name: clean(d.name, 100),
    email: clean(d.email, 200).toLowerCase(),
    role: clean(d.role, 40),
    state: clean(d.state, 40),
    message: clean(d.message, 1000),
  };
  const consent = d.consent === true || d.consent === "on" || d.consent === "true";

  if (!rec.name) return json(400, { ok: false, error: "Please enter your name." });
  if (!EMAIL.test(rec.email)) return json(400, { ok: false, error: "Please enter a valid email address." });
  if (!ROLES.includes(rec.role)) return json(400, { ok: false, error: "Please choose who you are." });
  if (rec.state && !STATES.includes(rec.state)) return json(400, { ok: false, error: "Please choose a state from the list." });
  if (!consent) return json(400, { ok: false, error: "Please tick the box so we can contact you." });

  if (!env.DB) return json(503, { ok: false, error: "Sign-ups are not switched on yet." });

  let row;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS interest (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT,
         name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
         role TEXT, state TEXT, message TEXT, country TEXT)`
    ).run();
    // One row per email: signing up again updates the details instead of adding a duplicate.
    // RETURNING tells us whether this was a new sign-up (only new ones get an email).
    row = await env.DB.prepare(
      `INSERT INTO interest (name, email, role, state, message, country) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET name = ?1, role = ?3, state = ?4,
         message = CASE WHEN ?5 <> '' THEN ?5 ELSE message END, updated_at = datetime('now')
       RETURNING (updated_at IS NULL) AS is_new`
    ).bind(rec.name, rec.email, rec.role, rec.state, rec.message, (request.cf && request.cf.country) || "").first();
  } catch (e) {
    return json(500, { ok: false, error: "Something went wrong saving your details." });
  }
  if (row && Number(row.is_new) === 1 && env.RESEND_API_KEY) {
    const job = sendEmails(env, rec).catch(() => {});   // an email failure never loses the sign-up
    if (typeof waitUntil === "function") waitUntil(job); else await job;
  }
  return json(200, { ok: true });
}

// ---------- emails (Resend) ----------
const SITE = "https://www.defvetbridge.com";
const GUIDE = SITE + "/DVB_Getting_Ready_For_Your_DVA_Claim.pdf";
const FROM = "Graham at DefVetBridge <admin@defvetbridge.com>";
const ADMIN = "admin@defvetbridge.com";
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function resend(env, msg) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error("resend " + r.status);
}

function welcome(rec) {
  const first = rec.name.split(/\s+/)[0];
  const text = [
    `Hi ${first},`,
    ``,
    `Thanks for registering your interest in DefVetBridge. You are on the list, and I will email you when there is a place for you.`,
    ``,
    `While you wait, the best thing you can do is start gathering your records. Defence and DVA records can take around 30 days to arrive.`,
    `Free guide, "Getting ready for your DVA claim" (PDF): ${GUIDE}`,
    ``,
    `Graham Kissell`,
    `DefVetBridge | ${SITE}`,
    ``,
    `You are receiving this because you registered your interest at defvetbridge.com. To be taken off the list, reply with "remove" or email ${ADMIN}.`,
    `Need support now? Open Arms, Veterans & Families Counselling: 1800 011 046, free, 24 hours a day.`,
  ].join("\n");
  const btn = (href, label, bg, fg) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:${fg};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:6px">${label}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#102f4c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e0e4;border-radius:10px">
<tr><td style="padding:28px 28px 8px"><img src="${SITE}/DVB_wordmark.png" alt="DVB" width="104" height="48" style="display:block"></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:16px;line-height:1.6">
<p style="margin:0 0 14px">Hi ${esc(first)},</p>
<p style="margin:0 0 14px">Thanks for registering your interest in <b>DefVetBridge</b>. You are on the list, and I will email you when there is a place for you.</p>
<p style="margin:0 0 18px">While you wait, the best thing you can do is start gathering your records. Defence and DVA records can take around 30 days to arrive, and this free two-page guide shows you how to ask for them.</p>
<p style="margin:0 0 22px">${btn(GUIDE, "Get the free guide (PDF)", "#1d432e", "#ffffff")}</p>
<p style="margin:0 0 4px">Graham Kissell</p>
<p style="margin:0 0 24px"><a href="${SITE}" style="color:#1d432e">DefVetBridge</a></p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #d9e0e4;font-size:12px;line-height:1.5;color:#4a5d70">
You are receiving this because you registered your interest at defvetbridge.com. To be taken off the list, reply with "remove" or email <a href="mailto:${ADMIN}" style="color:#4a5d70">${ADMIN}</a>.<br>
Need support now? Open Arms, Veterans &amp; Families Counselling: 1800 011 046, free, 24 hours a day.
</td></tr></table></body></html>`;
  return { text, html };
}

async function sendEmails(env, rec) {
  const w = welcome(rec);
  await resend(env, { from: FROM, to: [rec.email], reply_to: ADMIN, subject: "You're on the DefVetBridge list", text: w.text, html: w.html });
  const note = [`New interest sign-up`, ``, `Name: ${rec.name}`, `Email: ${rec.email}`, `I am a: ${rec.role}`,
    `State: ${rec.state || "-"}`, `Message: ${rec.message || "-"}`].join("\n");
  await resend(env, { from: FROM, to: [ADMIN], reply_to: rec.email, subject: `New DVB sign-up: ${rec.name} (${rec.role})`, text: note });
}

export function onRequest() {
  return json(405, { ok: false, error: "Use the form on the page." });
}
