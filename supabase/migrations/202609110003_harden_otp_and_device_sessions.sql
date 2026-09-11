begin;

-- =============================================================================
-- 1. revoke関数の権限修正
-- PUBLIC, anon, authenticated から直接EXECUTE権限を完全に剥奪する。
-- Next.js サーバー側 (service_role) 経由でのみ実行可能とする。
-- =============================================================================
revoke all on function public.revoke_store_device_session(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_all_store_device_sessions(uuid, text) from public, anon, authenticated;

-- =============================================================================
-- 2. create_store_otp_challenge 改修 (resend_count 追跡対応)
-- 同一店舗で未完了のまま再発行された場合、resend_count をインクリメント (0 -> 1 -> 2 ...)
-- =============================================================================
create or replace function public.create_store_otp_challenge(
  p_store_id uuid,
  p_code_hash text,
  p_expires_in interval default interval '15 minutes'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_challenge_id uuid;
  v_prev_resend_count integer := -1;
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

  -- 新規チャレンジ挿入 (初回は0、再送時は前回+1)
  insert into public.store_otp_challenges (
    store_id,
    code_hash,
    requested_at,
    expires_at,
    resend_count,
    status
  ) values (
    p_store_id,
    p_code_hash,
    now(),
    now() + p_expires_in,
    case when v_prev_resend_count >= 0 then v_prev_resend_count + 1 else 0 end,
    'issued'
  )
  returning id into v_challenge_id;

  return v_challenge_id;
end;
$$;

revoke all on function public.create_store_otp_challenge(uuid, text, interval) from public, anon, authenticated;

-- =============================================================================
-- 3. create_store_device_session 改修
-- - 同一 device_id の既存有効セッションの自動失効 (重複セッション・端末数水増し防止)
-- - registered_tablet_count との差分検知 (active_count <> registered_count)
-- - 同一差分アラートの重複抑制
-- - details は active_count, registered_count のみ保持
-- =============================================================================
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
  v_registered_count integer;
  v_active_count integer;
  v_existing_alert_count integer;
begin
  -- 1. 同一店舗・同一 device_id の既存有効セッションを新セッション発行前に失効
  update public.store_device_sessions
  set revoked_at = now(),
      revoked_reason = 'replaced_by_new_session'
  where store_id = p_store_id
    and device_id = p_device_id
    and revoked_at is null;

  -- 2. 新セッションを作成
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

  -- 3. 店舗の registered_tablet_count を確認
  select registered_tablet_count into v_registered_count
  from public.stores
  where id = p_store_id;

  -- registered_tablet_count が設定されている場合のみ差分チェック (NULLは対象外)
  if v_registered_count is not null and v_registered_count >= 0 then
    -- 現在の有効セッション数を集計 (失効済みおよび期限切れを除外)
    select count(*) into v_active_count
    from public.store_device_sessions
    where store_id = p_store_id
      and revoked_at is null
      and expires_at > now();

    -- active_count と registered_count に差分がある場合
    if v_active_count <> v_registered_count then
      -- 未解決の同一差分アラートが既に存在するか確認 (重複抑制)
      select count(*) into v_existing_alert_count
      from public.security_alerts
      where store_id = p_store_id
        and alert_type = 'tablet_count_mismatch'
        and resolved_at is null
        and details->>'active_count' = v_active_count::text
        and details->>'registered_count' = v_registered_count::text;

      if v_existing_alert_count = 0 then
        insert into public.security_alerts (
          store_id,
          device_session_id,
          device_id,
          alert_type,
          severity,
          details
        ) values (
          p_store_id,
          v_session_id,
          p_device_id,
          'tablet_count_mismatch',
          'warning',
          jsonb_build_object(
            'active_count', v_active_count,
            'registered_count', v_registered_count
          )
        );
      end if;
    end if;
  end if;

  return v_session_id;
end;
$$;

revoke all on function public.create_store_device_session(uuid, text, text, text, interval) from public, anon, authenticated;

commit;
