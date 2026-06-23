import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseHostname } from "@/lib/tenant-hostname";

export async function middleware(request: NextRequest) {
  // Hostname'i parse et (DB'siz, senkron). Server Component'ler tenant'i
  // x-tenant-slug header'i üzerinden okuyacak.
  const hostname = request.headers.get("host") || "localhost:3000";
  const match = parseHostname(hostname);

  // apex / custom_domain başlangıçta "default"; subdomain doğrudan slug.
  // custom_domain için final slug aşağıda DB sorgusuyla belirlenir.
  // NOT: let — closure (cookies.setAll) güncel değeri görsün diye.
  let tenantSlug = "default";
  if (match.type === "subdomain") {
    tenantSlug = match.slug;
  }

  // x-tenant-slug request header'ına HENÜZ yazılmıyor: custom_domain DB
  // sorgusu slug'i değiştirebilir. Forward edilen request header'i NextResponse.next()
  // çağrısı anında yakalandığı için, header'i final slug belli olduktan
  // SONRA set edip response'u yeniden kuruyoruz (aşağıda).
  const requestHeaders = new Headers(request.headers);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          // tenantSlug closure'dan okunur. setAll, auth.getUser() sırasında
          // (custom_domain DB sorgusundan SONRA) tetiklendiği için güncel
          // slug görünür.
          supabaseResponse.headers.set("x-tenant-slug", tenantSlug);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // KRİTİK: custom_domain DB sorgusu auth.getUser() ÖNCESİNDE yapılmalı.
  // Böylece hem setAll closure'i hem de forward edilen request header'i
  // güncel slug'i taşır. Sorgu yalnızca custom_domain case'inde çalışır;
  // subdomain/apex DB'ye hiç gitmez. Anon key + tenants_public_select
  // (USING true) yeterli — service role gerekmez.
  if (match.type === "custom_domain") {
    const { data, error } = await supabase
      .from("tenants")
      .select("slug")
      .eq("custom_domain", match.host)
      .maybeSingle();

    if (error) {
      console.error("[Middleware] custom_domain lookup hatasi:", error);
      // tenantSlug "default" kalır (graceful degradation)
    } else if (data?.slug) {
      tenantSlug = data.slug;
    }
    // data null ise (bulunamadı): tenantSlug "default" kalır
  }

  // Final slug belli. Forward edilen request header'ına yaz ve response'u
  // güncel header'larla YENİDEN kur (setAll henüz tetiklenmemiş olabilir —
  // bu rebuild olmadan no-cookie-refresh durumunda slug forward edilmezdi).
  requestHeaders.set("x-tenant-slug", tenantSlug);
  supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.headers.set("x-tenant-slug", tenantSlug);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin giris ve davet-kabul/yetkisiz sayfalari haric tum admin rotalarini koru
  // (davet-kabul login OLMAYAN kullanici icin token ile session olusturur)
  const ADMIN_PUBLIC_PATHS = [
    "/admin/giris",
    "/admin/davet-kabul",
    "/admin/sifremi-unuttum",
    "/admin/yetkisiz",
  ];
  if (pathname.startsWith("/admin") && !ADMIN_PUBLIC_PATHS.includes(pathname)) {
    if (!user) {
      const loginUrl = new URL("/admin/giris", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Süper admin rotalarını da auth ile koru.
  // Süper admin yetkisi kontrolü (is_super_admin) middleware'de YAPILMAZ
  // (her request'te RPC çağırmak pahalı). Bu kontrol layout'ta yapılır.
  if (pathname.startsWith("/super-admin")) {
    if (!user) {
      const loginUrl = new URL("/admin/giris", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Giris yapmis kullanici giris sayfasina giderse rolune gore yonlendir
  if (pathname === "/admin/giris" && user) {
    // Super admin kontrolu icin RPC (nadir cagri, performans tolere edilir)
    const { data: isSuperAdmin, error: rpcError } = await supabase.rpc(
      "is_super_admin",
      { user_id: user.id }
    );

    if (rpcError) {
      console.error("[Middleware] is_super_admin RPC hatasi:", rpcError);
      // Hata durumunda guvenli taraf: normal admin'e at
    }

    const rawNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      !!rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//");

    const url = request.nextUrl.clone();
    url.search = ""; // next param redirect URL'inden temizle

    if (safeNext && rawNext!.startsWith("/super-admin")) {
      // next /super-admin/* ise: super admin ise oraya, degilse /admin'e
      url.pathname = isSuperAdmin ? rawNext! : "/admin";
    } else if (safeNext) {
      // next normal yolsa: oldugu gibi git (super admin de tenant sayfasina donebilir)
      url.pathname = rawNext!;
    } else {
      // next yoksa: super admin -> /super-admin, normal -> /admin
      url.pathname = isSuperAdmin ? "/super-admin" : "/admin";
    }

    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Statik dosyalar ve API hariç tüm rotalar (public + admin)
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
