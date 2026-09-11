begin;

-- =============================================================================
-- 1. notification_email 正規化一意インデックス (lower(trim(notification_email)))
-- =============================================================================
drop index if exists public.stores_notification_email_lower_uidx;

create unique index if not exists stores_notification_email_normalized_uidx
on public.stores (lower(trim(notification_email)))
where notification_email is not null and trim(notification_email) <> '';

-- =============================================================================
-- 2. reconcile_store_tablet_count 改修
-- registered_tablet_count が NULL の場合、過去の未解決 tablet_count_mismatch アラートを自動解決
-- =============================================================================
create or replace function public.reconcile_store_tablet_count(
  p_store_id uuid
) returns table(
  active_count integer,
  registered_count integer,
  status text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_registered_count integer;
  v_active_count integer;
  v_existing_alert_count integer;
begin
  select registered_tablet_count into v_registered_count
  from public.stores
  where id = p_store_id;

  -- 有効セッション数を算出 (revoked除外、期限切れ除外)
  select count(*) into v_active_count
  from public.store_device_sessions
  where store_id = p_store_id
    and revoked_at is null
    and expires_at > now();

  -- registered_tablet_count が未設定（NULL）または負数の場合:
  -- 比較対象外のため、過去の未解決差分アラートをすべて自動解決する
  if v_registered_count is null or v_registered_count < 0 then
    update public.security_alerts
    set resolved_at = now(),
        resolution_note = 'auto_reconciled: tablet count not configured'
    where store_id = p_store_id
      and alert_type = 'tablet_count_mismatch'
      and resolved_at is null;

    return query select v_active_count, null::integer, 'not_configured'::text;
    return;
  end if;

  if v_active_count = v_registered_count then
    -- 台数一致: 未解決の差分アラートを自動解決
    update public.security_alerts
    set resolved_at = now(),
        resolution_note = 'auto_reconciled: counts match'
    where store_id = p_store_id
      and alert_type = 'tablet_count_mismatch'
      and resolved_at is null;

    return query select v_active_count, v_registered_count, 'matched'::text;
    return;
  else
    -- 台数不一致: 同一差分のアラートが既に未解決で存在するか確認
    select count(*) into v_existing_alert_count
    from public.security_alerts
    where store_id = p_store_id
      and alert_type = 'tablet_count_mismatch'
      and resolved_at is null
      and details->>'active_count' = v_active_count::text
      and details->>'registered_count' = v_registered_count::text;

    if v_existing_alert_count = 0 then
      -- 過去の未解決アラート（異なる差分数値）があれば更新して最新化
      update public.security_alerts
      set resolved_at = now(),
          resolution_note = 'auto_reconciled: superseded by updated count difference'
      where store_id = p_store_id
        and alert_type = 'tablet_count_mismatch'
        and resolved_at is null;

      -- 新しい差分アラートを作成
      insert into public.security_alerts (
        store_id,
        alert_type,
        severity,
        details
      ) values (
        p_store_id,
        'tablet_count_mismatch',
        'warning',
        jsonb_build_object(
          'active_count', v_active_count,
          'registered_count', v_registered_count
        )
      );
    end if;

    return query select v_active_count, v_registered_count, 'mismatched'::text;
    return;
  end if;
end;
$$;

revoke all on function public.reconcile_store_tablet_count(uuid) from public, anon, authenticated;

commit;
