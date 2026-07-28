import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Tenant admin HTML'i icin render-zamani sanitize hatti (Guvenlik bulgusu Y2).
 * ---------------------------------------------------------------------------
 * NEDEN RENDER ANINDA:
 *   Admin panel tamamen client-side; kayitlar tarayicidan DOGRUDAN Supabase'e
 *   (PostgREST) gidiyor. Yazma yolunda sanitize ZORLANAMAZ — kotu niyetli bir
 *   tenant admin kendi oturum token'iyla content alanina ham HTML yazabilir.
 *   Ayrica DB'de bu duzeltmeden onceki kirli veri olabilir. Tek zorlanabilir
 *   darbogaz render'dir.
 *
 * NEDEN "server-only":
 *   sanitize-html Node-only'dir (htmlparser2). Bu import yanlislikla bir client
 *   component'e sizarsa build HATA verir — sessizce bundle'a girmez.
 *
 * ALLOW-LIST'IN KAYNAGI:
 *   Tiptap'in (StarterKit v3 + Underline + Link + Image + TextAlign) uretebildigi
 *   HTML kumesi. Liste daraltilirsa mesru icerik bozulur; genisletilirse saldiri
 *   yuzeyi acilir. RichTextEditor extension listesi degisirse BURASI DA
 *   guncellenmelidir.
 */

/** Editor gorselleri yalnizca Supabase Storage'a yuklenir. */
const SUPABASE_HOST_RE = /^[a-z0-9-]+\.supabase\.co$/i;

/** text-align disinda hicbir CSS property'sine izin yok. */
const ALIGN_VALUES = [/^left$/, /^center$/, /^right$/, /^justify$/];

/**
 * img src kabul kurali. Iki isi birden yapar:
 *  1) Guvenlik: data:/javascript: ve yabanci origin'leri eler.
 *  2) Kararlilik: extractImagesFromHtml bu src'leri next/image'a veriyor;
 *     ayristirilamayan bir src (ornek: "x") next/image'i "Failed to parse
 *     src" ile cokertip sayfayi 500'e dusuruyordu.
 *
 * KABUL EDILEN TEK IKI BICIM:
 *   https://<alt>.supabase.co/...   (editor yuklemelerinin cikti bicimi)
 *   /...                            (site-goreli, TEK egik cizgi)
 * Baska her sey duser: "x", "a.jpg", "./a.png", "../a.png", "//evil.com/a.jpg",
 * "http://..." (https disi), "data:...", bos veya src'siz <img>.
 */
function isAllowedImageSrc(rawSrc: string | undefined): boolean {
  const src = (rawSrc || "").trim();
  if (!src) return false;

  // Site-goreli: TEK egik cizgi. "//evil.com/x.jpg" protokol-gorelidir
  // (yabanci origin) — reddedilir.
  if (src.startsWith("/")) return !src.startsWith("//");

  // Buraya dusen her sey mutlak URL olmak ZORUNDA. "x" / "a.jpg" / "./a.png"
  // gibi degerlerde new URL throw eder -> catch -> false.
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    return SUPABASE_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // Blok
    "p", "br", "hr", "blockquote", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6",
    // Liste
    "ul", "ol", "li",
    // Satir ici
    "strong", "em", "u", "s", "code", "a", "img", "span",
    // Eski/yapistirilmis icerik icin (globals.css'te .prose table stilleri var)
    "div", "table", "thead", "tbody", "tr", "th", "td",
  ],

  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    ol: ["start", "type"],
    code: ["class"], // degeri allowedClasses ile language-* ile sinirli
    "*": ["style"], // degeri allowedStyles ile text-align ile sinirli
  },

  allowedClasses: {
    code: [/^language-[a-z0-9-]+$/],
  },

  allowedStyles: {
    "*": {
      "text-align": ALIGN_VALUES,
    },
  },

  // href/src'te izinli semalar. javascript:, data:, vbscript: kapsam disi.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // "//evil.com" bicimli protokol-goreli URL'leri reddet.
  allowProtocolRelative: false,

  // Izinsiz tag at, icindeki METNI koru (icerik kaybini en aza indirir).
  // script/style/textarea/option icin sanitize-html icerigi de atar
  // (nonTextTags varsayilani) — istedigimiz davranis.
  disallowedTagsMode: "discard",

  transformTags: {
    // Disari acilan her link icin rel/target zorunlu (tabnabbing + SEO).
    // NOT: href semasi gecersizse (javascript: gibi) sanitize-html href'i
    // ayrica dusurur; geriye zararsiz bir <a> metni kalir.
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
  },

  // src'i kabul edilmeyen <img>'i tamamen dusur (bkz. isAllowedImageSrc).
  exclusiveFilter: (frame) =>
    frame.tag === "img" && !isAllowedImageSrc(frame.attribs.src),
};

/**
 * Tenant admin kaynakli HTML'i guvenli alt kumeye indirger.
 *
 * - null/undefined/bos girdi icin "" doner (cagiran tarafta falsy kontrolu yapilir).
 * - Idempotenttir: sanitizeContentHtml(sanitizeContentHtml(x)) === sanitizeContentHtml(x).
 */
export function sanitizeContentHtml(
  dirty: string | null | undefined
): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, OPTIONS);
}
