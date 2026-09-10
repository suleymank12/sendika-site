import "server-only";
import { Resolver } from "node:dns/promises";
import tls from "node:tls";
import type { ProbeDeps } from "@/lib/super-admin/setup-probes";

/**
 * Kurulum Durumu yoklamalarının GERÇEK ağ bağımlılıkları (yalnız sunucu).
 * Mantık setup-probes.ts'te (import'suz, test edilir); burası yalnız Node
 * API'lerini o sözleşmeye bağlar.
 */

/** Tek yoklamanın üst sınırı. Yoklamalar paralel — route ≈ DNS + bu süre. */
export const PROBE_TIMEOUT_MS = 5000;

const USER_AGENT = "sendika-site-setup-check";

export function createNodeProbeDeps(): ProbeDeps {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  return {
    resolve4: (host) => resolver.resolve4(host),
    resolve6: (host) => resolver.resolve6(host),

    async httpGet(url) {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT },
      });
      // Gövde okunmaz: yalnız durum + iki başlık. Bağlantı açık kalmasın.
      await res.body?.cancel().catch(() => {});
      return {
        status: res.status,
        location: res.headers.get("location"),
        tenantSlug: res.headers.get("x-tenant-slug"),
      };
    },

    tlsCert(host) {
      return new Promise((resolve, reject) => {
        // rejectUnauthorized:false — geçersiz sertifikayı da OKUMAK için
        // (sebebini göstermek). Veri gönderilmez; yalnız el sıkışma.
        const socket = tls.connect({
          host,
          port: 443,
          servername: host,
          rejectUnauthorized: false,
          timeout: PROBE_TIMEOUT_MS,
        });
        socket.once("secureConnect", () => {
          const cert = socket.getPeerCertificate();
          const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
          // Node çalışma anında kod dizesi yazar (ör. ERR_TLS_CERT_ALTNAME_INVALID);
          // tip tanımı Error diyor — ikisini de karşıla.
          const authError = socket.authorizationError as unknown;
          resolve({
            authorized: socket.authorized,
            authorizationError:
              authError == null
                ? null
                : typeof authError === "string"
                  ? authError
                  : ((authError as { code?: string }).code ?? String(authError)),
            validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo.toISOString() : null,
          });
          socket.end();
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(Object.assign(new Error("TLS zaman aşımı"), { code: "TIMEOUT" }));
        });
        socket.once("error", (err) => {
          socket.destroy();
          reject(err);
        });
      });
    },
  };
}
