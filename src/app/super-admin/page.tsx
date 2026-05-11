import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Building2, CheckCircle2, Plus, ArrowRight, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export default async function SuperAdminDashboard() {
  const supabase = createClient();

  const [allRes, activeRes, recentRes] = await Promise.all([
    supabase.from("tenants").select("id", { count: "exact", head: true }),
    supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("tenants")
      .select("id, name, slug, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const total = allRes.count || 0;
  const activeCount = activeRes.count || 0;
  const recent = (recentRes.data as TenantRow[]) || [];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-text-dark tracking-tight">Platform Özeti</h1>
          <p className="text-sm text-text-muted mt-1">
            Tüm tenant'lara ve platform durumuna genel bakış.
          </p>
        </div>
        <Link
          href="/super-admin/tenants/yeni"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Tenant
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Toplam Tenant"
          value={total}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Aktif Tenant"
          value={activeCount}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          icon={Calendar}
          label="Pasif Tenant"
          value={total - activeCount}
          iconBg="bg-gray-100"
          iconColor="text-gray-500"
        />
      </div>

      {/* Recent tenants */}
      <div className="rounded-xl bg-white border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text-dark">Son Eklenen Tenant'lar</h2>
          <Link
            href="/super-admin/tenants"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Tümünü Gör
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">
            Henüz tenant eklenmemiş.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  href={`/super-admin/tenants/${t.id}`}
                  className="flex-1 min-w-0 group"
                >
                  <p className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors truncate">
                    {t.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {t.slug}
                  </p>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={
                      "text-xs px-2 py-0.5 rounded-full font-medium " +
                      (t.is_active
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning")
                    }
                  >
                    {t.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <span className="text-xs text-text-muted hidden sm:inline">
                    {formatDate(t.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 border border-border">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-dark">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}
