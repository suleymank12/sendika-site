export default function SiteKapaliView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Site Şu Anda Kapalı
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Bu site şu anda hizmet vermemektedir. Daha sonra tekrar
              deneyebilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
