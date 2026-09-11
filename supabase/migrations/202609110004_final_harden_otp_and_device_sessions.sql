begin;

-- =============================================================================
-- 1. notification_email 大文字小文字区別なしユニーク制約
-- NULLまたは空文字列は許容、値がある場合は店舗間で重複を禁止
-- =============================================================================
create unique index if not exists stores_notification_email_lower_uidx
on public.stores (lower(notification_email))
where notification_email is not null and trim(notification_email) <> '';

-- =============================================================================
-- 2. OTP challenge_id 先行生成対応
-- サーバー側で challenge_id を先行生成し、HMAC(secret, challenge_id + ":" + OTP)
-- を計算してから渡せるよう p_challenge_id を受け取るシグネチャへ変更。
-- =============================================================================
drop function if exists public.create_store_otp_challenge(uuid, text, interval);

create or replace function public.create_store_otp_challenge(
  p_challenge_id uuid,
  p_store_id uuid,
  p_code_hash text,
  p_expires_in interval default interval '15 minutes'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prev_resend_count integer := -1;
  v_target_id uuid := coalesce(p_challenge_id, gen_random_uuid());
begin
  -- 直近の未完了（issued）チャレンジがあればそのresend_countを取得
  select resend_count into v_prev_resend_count
  from public.store_otp_challenges
  where store_id = p_store_id
    and status = 'issued'
  order by requested_at desc
  limit 1;

  -- 既存のissuedチャレンジを無効化
  update public.store_otp_challenges
  set status = 'invalidated',
      invalidated_at = now()
  where store_id = p_store_id
    and status = 'issued';

  -- 新規チャレンジ挿入 (先行生成challenge_idを使用)
  insert into public.store_otp_challenges (
    id,
    store_id,
    code_hash,
    requested_at,
    expires_at,
    resend_count,
    status
  ) values (
    v_target_id,
    p_store_id,
    p_code_hash,
    now(),
    now() + p_expires_in,
    case when v_prev_resend_count >= 0 then v_prev_resend_count + 1 else 0 end,
    'issued'
  );

  return v_target_id;
end;
$$;

-- =============================================================================
-- 3. Tablet Count Reconciliation 共通関数
-- registered_tablet_count と active session数を比較し、差分アラートの作成・解決を自動化
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

  -- 未設定（NULL）の場合はアラート対象外
  if v_registered_count is null or v_registered_count < 0 then
    select count(*) into v_active_count
    from public.store_device_sessions
    where store_id = p_store_id
      and revoked_at is null
      and expires_at > now();

    return query select v_active_count, null::integer, 'not_configured'::text;
    return;
  end if;

  -- 有効セッション数を算出 (revoked除外、期限切れ除外)
  select count(*) into v_active_count
  from public.store_device_sessions
  where store_id = p_store_id
      and revoked_at is null
      and expires_at > now();

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

-- =============================================================================
-- 4. 各ライフサイクルへの Reconciliation 自動連携
-- =============================================================================

-- 4.1 create_store_device_session (作成時)
create or replace function public.create_store_device_session(
  p_store_id uuid,
  p_device_id text,
  p_token_hash text,
  p_device_name text default '',
  p_expires_in interval default interval '30 days'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_session_id uuid;
begin
  -- 1. 同一店舗・同一 device_id の既存有効セッションを失効
  update public.store_device_sessions
  set revoked_at = now(),
      revoked_reason = 'replaced_by_new_session'
  where store_id = p_store_id
    and device_id = p_device_id
    and revoked_at is null;

  -- 2. 新セッション作成
  insert into public.store_device_sessions (
    store_id,
    device_id,
    token_hash,
    device_name,
    issued_at,
    first_authenticated_at,
    last_accessed_at,
    expires_at
  ) values (
    p_store_id,
    p_device_id,
    p_token_hash,
    p_device_name,
    now(),
    now(),
    now(),
    now() + p_expires_in
  )
  returning id into v_session_id;

  -- 3. 台数再評価 (Reconciliation)
  perform public.reconcile_store_tablet_count(p_store_id);

  return v_session_id;
end;
$$;

-- 4.2 revoke_store_device_session (個別失効時)
create or replace function public.revoke_store_device_session(
  p_session_id uuid,
  p_reason text default 'manual_revoke'
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_updated integer;
begin
  update public.store_device_sessions
  set revoked_at = now(),
      revoked_reason = p_reason
  where id = p_session_id
    and revoked_at is null
  returning store_id into v_store_id;

  get diagnostics v_updated = row_count;

  if v_updated > 0 and v_store_id is not null then
    perform public.reconcile_store_tablet_count(v_store_id);
    return true;
  end if;

  return false;
end;
$$;

-- 4.3 revoke_all_store_device_sessions (一括失効時)
create or replace function public.revoke_all_store_device_sessions(
  p_store_id uuid,
  p_reason text default 'store_wide_revoke'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
begin
  update public.store_device_sessions
  set revoked_at = now(),
      revoked_reason = p_reason
  where store_id = p_store_id
    and revoked_at is null;

  get diagnostics v_updated = row_count;

  perform public.reconcile_store_tablet_count(p_store_id);

  return v_updated;
end;
$$;

-- 4.4 stores.registered_tablet_count 変更時トリガー
create or replace function public.trigger_reconcile_store_tablet_count()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.registered_tablet_count is distinct from new.registered_tablet_count) then
    perform public.reconcile_store_tablet_count(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists stores_reconcile_tablet_count on public.stores;
create trigger stores_reconcile_tablet_count
after update of registered_tablet_count on public.stores
for each row execute function public.trigger_reconcile_store_tablet_count();

-- =============================================================================
-- 5. 全 SECURITY DEFINER 関数の EXECUTE 権限完全剥奪
-- PUBLIC, anon, authenticated から直接実行を拒否し、service_role のみに限定
-- =============================================================================
revoke all on function public.create_store_otp_challenge(uuid, uuid, text, interval) from public, anon, authenticated;
revoke all on function public.invalidate_store_otp_challenges(uuid) from public, anon, authenticated;
revoke all on function public.verify_store_otp(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.create_store_device_session(uuid, text, text, text, interval) from public, anon, authenticated;
revoke all on function public.revoke_store_device_session(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_all_store_device_sessions(uuid, text) from public, anon, authenticated;
revoke all on function public.reconcile_store_tablet_count(uuid) from public, anon, authenticated;

commit;
