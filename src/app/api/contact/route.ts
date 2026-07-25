import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHostname } from "@/lib/tenant-hostname";

// SHA-256 (crypto) icin Node.js runtime sart (Edge runtime'da yok).
export const runtime = "nodejs";
// Her istekte host/IP header'i okunur → statik degil.
export const dynamic = "force-dynamic";

// ---- Sabitler ----
const RATE_LIMIT_MAX = 5; // saatte en fazla 5 mesaj (gercek kullaniciyi engellemez)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 saat
const MAX_RAW_BODY = 10_000; // ham body kaba ust sinir (bellek/abuse korumasi)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactBody {
  ad?: string;
  email?: string;
  telefon?: string;
  mesaj?: string;
  website?: string; // honeypot — gercek kullanici doldurmaz
}

/**
 * Tenant'i HOSTNAME'den cozer. Client'in gonderdigi hicbir tenant_id'ye
 * GUVENILMEZ — server istegin geldigi host'tan kendi belirler. Boylece
 * cross-tenant spam (baskasinin kutusuna mesaj atma) imkansiz olur.
 *
 * NOT: /api rotalari middleware matcher'inin DISINDA (x-tenant-slug header'i
 * gelmez), bu yuzden burada parseHostname + DB lookup elle yapilir
 * (middleware'deki custom_domain cozumuyle ayni mantik).
 */
async function resolveTenantId(
  admin: ReturnType<typeof createAdminClient>,
  host: string
): Promise<string | null> {
  const match = parseHostname(host);

  // custom_domain → tenants.custom_domain uzerinden ara
  if (match.type === "custom_domain") {
    const { data } = await admin
      .from("tenants")
      .select("id, is_active")
      .eq("custom_domain", match.host)
      .maybeSingle();
    if (!data || !data.is_active) return null;
    return data.id as string;
  }

  // subdomain → slug; apex → "default"
  const slug = match.type === "subdomain" ? match.slug : "default";
  const { data } = await admin
    .from("tenants")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data.id as string;
}

export async function POST(req: NextRequest) {
  // 1) Body parse (ham boyut siniri + JSON)
  let body: ContactBody;
  try {
    const raw = await req.text();
    if (raw.length > MAX_RAW_BODY) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 400 });
    }
    body = JSON.parse(raw) as ContactBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  // 2) HONEYPOT — "website" alani CSS ile gizli; bot doldurur, insan gormez.
  //    Doluysa: bot'a basarili gibi gorun ama KAYDETME (sessizce yut).
  if ((body.website || "").trim() !== "") {
    console.warn("[Contact] Honeypot tetiklendi, mesaj yok sayildi.");
    return NextResponse.json({ ok: true });
  }

  // 3) TENANT'i HOSTNAME'den belirle (client'a asla guvenme)
  const admin = createAdminClient();
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const tenantId = await resolveTenantId(admin, host);
  if (!tenantId) {
    return NextResponse.json({ error: "Geçersiz alan adı." }, { status: 404 });
  }

  // 4) Server-side validation (client'a EK koruma — ASIL koruma burasi)
  const ad = (body.ad || "").trim();
  const email = (body.email || "").trim();
  const telefon = (body.telefon || "").trim();
  const mesaj = (body.mesaj || "").trim();

  if (!ad || ad.length > 100) {
    return NextResponse.json(
      { error: "Adınızı girin (en fazla 100 karakter)." },
      { status: 400 }
    );
  }
  if (!email || email.length < 3 || email.length > 150 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Geçerli bir e-posta adresi girin." },
      { status: 400 }
    );
  }
  // Telefon: zorunlu ama KATI format YOK (sabit/cep/+90 hepsi kabul) — sadece
  // bos olmasin ve makul uzunlukta olsun.
  if (!telefon || telefon.length > 30) {
    return NextResponse.json(
      { error: "Telefon numaranızı girin (en fazla 30 karakter)." },
      { status: 400 }
    );
  }
  if (!mesaj || mesaj.length > 2000) {
    return NextResponse.json(
      { error: "Mesajınızı girin (en fazla 2000 karakter)." },
      { status: 400 }
    );
  }

  // 5) RATE LIMIT (DB-tabanli). IP ham SAKLANMAZ → SHA-256(ip + salt).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const salt = process.env.CONTACT_IP_SALT || "sendika-contact-default-salt";
  const ipHash = createHash("sha256").update(ip + salt).digest("hex");

  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: rlError } = await admin
    .from("contact_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("ip_hash", ipHash)
    .gte("created_at", cutoff);

  if (rlError) {
    console.error("[Contact] Rate limit sorgusu hatasi:", rlError);
    return NextResponse.json(
      { error: "Bir hata oluştu, lütfen tekrar deneyin." },
      { status: 500 }
    );
  }
  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Çok fazla mesaj gönderdiniz, lütfen daha sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  // 6) KAYIT (service role — RLS bypass, tek kontrollu yazma noktasi).
  //    mesaj DUZ METIN saklanir (HTML degil); admin panelde de duz metin gosterilir.
  const { error: insertError } = await admin
    .from("contact_messages")
    .insert({ tenant_id: tenantId, ad, email, telefon, mesaj });

  if (insertError) {
    console.error("[Contact] Mesaj kaydi hatasi:", insertError);
    return NextResponse.json(
      { error: "Bir hata oluştu, lütfen tekrar deneyin." },
      { status: 500 }
    );
  }

  // Rate limit kaydini ekle (best-effort; hatasi mesaj kaydini bozmaz)
  const { error: rlInsertError } = await admin
    .from("contact_rate_limit")
    .insert({ tenant_id: tenantId, ip_hash: ipHash });
  if (rlInsertError) {
    console.error("[Contact] Rate limit kaydi hatasi:", rlInsertError);
  }

  return NextResponse.json({ ok: true });
}
