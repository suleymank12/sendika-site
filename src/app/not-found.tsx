import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="text-center">
        <p className="text-7xl font-bold text-primary/20">404</p>
        <h1 className="mt-4 text-2xl font-bold text-text-dark tracking-tight">
          Sayfa Bulunamadı
        </h1>
        <p className="mt-2 text-text-muted">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          Anasayfaya Dön
        </Link>
      </div>
    </div>
  );
}
