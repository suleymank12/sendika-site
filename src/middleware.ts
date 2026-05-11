import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function extractSlugFromHostname(hostname: string): string {
  const host = hostname.split(":")[0];

  if (host === "localhost" || host === "127.0.0.1") {
    return "default";
  }

  if (host.endsWith(".localhost")) {
    const sub = host.replace(/\.localhost$/, "");
    if (!sub || sub === "www") return "default";
    return sub;
  }

  if (host.endsWith(".vercel.app")) {
    const parts = host.replace(".vercel.app", "").split(".");
    if (parts.length <= 1) return "default";
    return parts[0];
  }

  const parts = host.split(".");
  if (parts.length <= 2) return "default";
  const first = parts[0];
  if (first === "www") return "default";
  return first;
}

export async function middleware(request: NextRequest) {
  // Tenant slug'ı request header'ına yaz; Server Component'ler
  // headers() üzerinden okuyacak.
  const hostname = request.headers.get("host") || "localhost:3000";
  const tenantSlug = extractSlugFromHostname(hostname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-slug", tenantSlug);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.headers.set("x-tenant-slug", tenantSlug);

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
          supabaseResponse.headers.set("x-tenant-slug", tenantSlug);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Admin giris sayfasi haric tum admin rotalarini koru
  if (pathname.startsWith("/admin") && pathname !== "/admin/giris") {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/giris";
      return NextResponse.redirect(url);
    }
  }

  // Süper admin rotalarını da auth ile koru.
  // Süper admin yetkisi kontrolü (is_super_admin) middleware'de YAPILMAZ
  // (her request'te RPC çağırmak pahalı). Bu kontrol layout'ta yapılır.
  if (pathname.startsWith("/super-admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/giris";
      return NextResponse.redirect(url);
    }
  }

  // Giris yapmis kullanici giris sayfasina giderse admin'e yonlendir
  if (pathname === "/admin/giris" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
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
