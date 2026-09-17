"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Store = { id: string; name: string };
type Device = {
  id: string;
  store_id: string;
  device_id: string;
  device_name: string;
  issued_at: string;
  expires_at: string;
  last_accessed_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  session_version: number;
};
type Alert = {
  id: string;
  store_id: string;
  alert_type: string;
  severity: string;
  occurred_at: string;
  active_count: number;
  registered_count: number;
  resolved: boolean;
  resolution_note: string | null;
};
type Log = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string;
  store_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
};
const actionLabels: Record<string, string> = {
  store_updated: "店舗情報を変更",
  store_sessions_revoked: "店舗の全端末をログアウト",
  admin_deleted: "管理者アカウントを削除",
  security_alert_resolved: "セキュリティアラートを解決",
  admin_invited: "管理者を招待",
  admin_password_reset_requested: "パスワード再設定メールを送信",
  CREATE_ADMIN_USER: "管理者を追加（旧方式）",
  LIST_ADMIN_USERS: "管理者一覧を表示",
};
const actorLabels: Record<string, string> = { admin: "管理者", store: "店舗", anonymous: "未認証" };
async function authFetch(path: string, init?: RequestInit) {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("認証が必要です");
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}
export function AdminOperations({
  stores,
  mode,
  initialStoreId = "",
}: {
  stores: Store[];
  mode: "devices" | "alerts" | "audit";
  initialStoreId?: string;
}) {
  const [storeId, setStoreId] = useState(initialStoreId);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [severity, setSeverity] = useState("");
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState("");
  const [unresolved, setUnresolved] = useState(true);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "devices") {
        const r = await authFetch(
          `/api/admin/devices${storeId ? `?storeId=${storeId}` : ""}`,
        );
        setDevices(((await r.json()) as { devices?: Device[] }).devices || []);
      } else if (mode === "alerts") {
        const p = new URLSearchParams(); if (unresolved) p.set("unresolved", "true"); if (storeId) p.set("storeId", storeId); if (severity) p.set("severity", severity);
        const r = await authFetch(`/api/admin/security-alerts?${p}`);
        setAlerts(((await r.json()) as { alerts?: Alert[] }).alerts || []);
      } else {
        const p = new URLSearchParams(); if (storeId) p.set("storeId", storeId); if (action) p.set("action", action); if (actorType) p.set("actorType", actorType);
        const r = await authFetch(`/api/admin/audit-logs?${p}`);
        setLogs(((await r.json()) as { logs?: Log[] }).logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, storeId, severity, action, actorType, unresolved]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const revoke = async (id: string, all = false) => {
    if (
      !window.confirm(
        all
          ? "この店舗の全端末をログアウトしますか？"
          : "この端末をログアウトしますか？",
      )
    )
      return;
    await authFetch(
      all ? "/api/admin/stores/revoke-all" : "/api/admin/devices/revoke",
      {
        method: "POST",
        body: JSON.stringify(
          all
            ? { storeId, reason: "admin_revoke_all" }
            : { sessionId: id, reason: "admin_revoke" },
        ),
      },
    );
    await reload();
  };
  if (mode === "devices")
    return (
      <section className="p-6">
        <h1 className="mb-4 text-2xl font-bold">店舗の認証端末</h1>
        <select
          className="mb-4 rounded border p-2"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">全店舗</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {storeId && (
          <Button
            className="ml-2"
            variant="destructive"
            onClick={() => void revoke(storeId, true)}
          >
            この店舗の全端末をログアウト
          </Button>
        )}
        <div className="space-y-3">
          {devices.map((d) => (
            <div key={d.id} className="rounded-xl border bg-white p-4">
              <div className="flex justify-between">
                <div>
                  <b>{d.device_name || "名称未設定"}</b>
                  <p className="text-xs text-slate-500">
                    端末ID: {d.device_id.slice(0, 8)}… / 発行:{" "}
                    {new Date(d.issued_at).toLocaleString("ja-JP")}
                  </p>
                  <p className="text-xs">
                    {d.revoked_at ? "失効" : "有効"}・期限{" "}
                    {new Date(d.expires_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                {!d.revoked_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void revoke(d.id)}
                  >
                    この端末をログアウト
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!loading && !devices.length && <p>端末はありません。</p>}
        </div>
      </section>
    );
  if (mode === "alerts")
    return (
      <section className="p-6">
        <h1 className="mb-4 text-2xl font-bold">Security Alerts</h1>
        <div className="mb-4 flex flex-wrap gap-2"><select className="rounded border p-2" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">全店舗</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="rounded border p-2" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="">全severity</option><option value="critical">critical</option><option value="warning">warning</option><option value="info">info</option></select><label className="flex items-center gap-2"><input type="checkbox" checked={unresolved} onChange={e=>setUnresolved(e.target.checked)}/>未解決のみ</label></div>
        {alerts.map((a) => (
          <div key={a.id} className="mb-3 rounded-xl border bg-white p-4">
            <b>{stores.find((s) => s.id === a.store_id)?.name || "店舗"}</b>
            <p>
              {a.alert_type} / {a.severity} / 有効 {a.active_count}・登録{" "}
              {a.registered_count}
            </p>
            <Button
              size="sm"
              onClick={async () => {
                await authFetch("/api/admin/security-alerts", {
                  method: "PATCH",
                  body: JSON.stringify({
                    id: a.id,
                    resolved: true,
                    resolutionNote: "確認済み",
                  }),
                });
                await reload();
              }}
            >
              解決
            </Button>
          </div>
        ))}
        {!loading && !alerts.length && <p>未解決アラートはありません。</p>}
      </section>
    );
  return (
    <section className="p-6">
      <h1 className="mb-4 text-2xl font-bold">操作ログ</h1>
      <div className="mb-4 flex flex-wrap gap-2"><select className="rounded border p-2" value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">全店舗</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input className="rounded border p-2" placeholder="action" value={action} onChange={e=>setAction(e.target.value)}/><input className="rounded border p-2" placeholder="actor_type" value={actorType} onChange={e=>setActorType(e.target.value)}/></div>
      {logs.map((l) => (
        <div key={l.id} className="border-b py-3 text-sm">
          <span>{new Date(l.occurred_at).toLocaleString("ja-JP")}</span>　
          <b>{actionLabels[l.action] || l.action}</b>　操作者: {actorLabels[l.actor_type] || l.actor_type}　対象店舗: {stores.find((s) => s.id === l.store_id)?.name || "全体"}　対象: {l.target_type || "-"}
        </div>
      ))}
    </section>
  );
}
