begin;

-- =============================================================================
-- 1. stores 拡張
-- =============================================================================
alter table public.stores
  add column if not exists notification_email text,
  add column if not exists registered_tablet_count integer check (registered_tablet_count is null or registered_tablet_count >= 0),
  add column if not exists is_active boolean not null default true;

create index if not exists stores_is_active_idx on public.stores(is_active);

-- =============================================================================
-- 2. store_otp_challenges (店舗OTP認証チャレンジ)
-- =============================================================================
create table if not exists public.store_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code_hash text not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  invalidated_at timestamptz,
  resend_count integer not null default 0,
  failed_attempt_count integer not null default 0,
  last_failed_at timestamptz,
  status text not null default 'issued' check (status in ('issued', 'used', 'expired', 'invalidated', 'locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_otp_challenges_store_status on public.store_otp_challenges(store_id, status);
create index if not exists idx_otp_challenges_expires_at on public.store_otp_challenges(expires_at);

create trigger otp_challenges_touch_updated_at before update on public.store_otp_challenges
for each row execute function public.touch_updated_at();

-- =============================================================================
-- 3. store_device_sessions (30日端末セッション)
-- =============================================================================
create table if not exists public.store_device_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_id text not null,
  token_hash text not null unique,
  device_name text not null default '',
  issued_at timestamptz not null default now(),
  first_authenticated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  revoked_reason text,
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_sessions_store_active on public.store_device_sessions(store_id, expires_at desc)
where revoked_at is null;
create index if not exists idx_device_sessions_token_hash on public.store_device_sessions(token_hash);
create index if not exists idx_device_sessions_store_device on public.store_device_sessions(store_id, device_id);

create trigger device_sessions_touch_updated_at before update on public.store_device_sessions
for each row execute function public.touch_updated_at();

-- =============================================================================
-- 4. security_alerts (セキュリティアラート)
-- =============================================================================
create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_session_id uuid references public.store_device_sessions(id) on delete set null,
  device_id text,
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_alerts_store on public.security_alerts(store_id, occurred_at desc);
create index if not exists idx_security_alerts_unresolved on public.security_alerts(severity, occurred_at desc)
where resolved_at is null;

create trigger security_alerts_touch_updated_at before update on public.security_alerts
for each row execute function public.touch_updated_at();

-- =============================================================================
-- 5. audit_logs (監査ログ)
-- =============================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin', 'store', 'system', 'anonymous')),
  actor_id text,
  store_id uuid references public.stores(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_audit_logs_occurred_at on public.audit_logs(occurred_at desc);
create index if not exists idx_audit_logs_store on public.audit_logs(store_id, occurred_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action, occurred_at desc);

-- =============================================================================
-- 6. DB Functions / Transactions
-- =============================================================================

-- 6.1 Create OTP Challenge
create or replace function public.create_store_otp_challenge(
  p_store_id uuid,
  p_code_hash text,
  p_expires_in interval default interval '15 minutes'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_challenge_id uuid;
begin
  -- Invalidate any active issued challenges for this store upon resend/reissue
  update public.store_otp_challenges
  set status = 'invalidated',
      invalidated_at = now()
  where store_id = p_store_id
    and status = 'issued';

  insert into public.store_otp_challenges (
    store_id,
    code_hash,
    requested_at,
    expires_at,
    status
  ) values (
    p_store_id,
    p_code_hash,
    now(),
    now() + p_expires_in,
    'issued'
  )
  returning id into v_challenge_id;

  return v_challenge_id;
end;
$$;

-- 6.2 Invalidate unused OTP challenges
create or replace function public.invalidate_store_otp_challenges(
  p_store_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.store_otp_challenges
  set status = 'invalidated',
      invalidated_at = now()
  where store_id = p_store_id
    and status = 'issued';
end;
$$;

-- 6.3 Atomically Verify OTP
create or replace function public.verify_store_otp(
  p_challenge_id uuid,
  p_code_hash text,
  p_max_attempts integer default 5
) returns table(
  success boolean,
  store_id uuid,
  message text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_challenge record;
begin
  -- Lock challenge row for atomic concurrency protection
  select * into v_challenge
  from public.store_otp_challenges
  where id = p_challenge_id
  for update;

  if not found then
    return query select false, null::uuid, 'not_found'::text;
    return;
  end if;

  if v_challenge.status <> 'issued' then
    return query select false, v_challenge.store_id, v_challenge.status;
    return;
  end if;

  if v_challenge.expires_at < now() then
    update public.store_otp_challenges
    set status = 'expired'
    where id = p_challenge_id;

    return query select false, v_challenge.store_id, 'expired'::text;
    return;
  end if;

  if v_challenge.failed_attempt_count >= p_max_attempts then
    update public.store_otp_challenges
    set status = 'locked'
    where id = p_challenge_id;

    return query select false, v_challenge.store_id, 'locked'::text;
    return;
  end if;

  -- Check code hash
  if v_challenge.code_hash <> p_code_hash then
    update public.store_otp_challenges
    set failed_attempt_count = failed_attempt_count + 1,
        last_failed_at = now(),
        status = case when failed_attempt_count + 1 >= p_max_attempts then 'locked' else 'issued' end
    where id = p_challenge_id;

    if v_challenge.failed_attempt_count + 1 >= p_max_attempts then
      return query select false, v_challenge.store_id, 'locked'::text;
    else
      return query select false, v_challenge.store_id, 'invalid_code'::text;
    end if;
    return;
  end if;

  -- Match verified: Mark as used
  update public.store_otp_challenges
  set status = 'used',
      used_at = now()
  where id = p_challenge_id;

  return query select true, v_challenge.store_id, 'ok'::text;
  return;
end;
$$;

-- 6.4 Create Device Session & Check Tablet Limit
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
begin
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

  -- Check tablet count vs registered count
  select registered_tablet_count into v_registered_count
  from public.stores
  where id = p_store_id;

  if v_registered_count is not null and v_registered_count > 0 then
    select count(*) into v_active_count
    from public.store_device_sessions
    where store_id = p_store_id
      and revoked_at is null
      and expires_at > now();

    if v_active_count > v_registered_count then
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
        'tablet_count_exceeded',
        'warning',
        jsonb_build_object(
          'active_count', v_active_count,
          'registered_count', v_registered_count,
          'device_name', p_device_name
        )
      );
    end if;
  end if;

  return v_session_id;
end;
$$;

-- 6.5 Revoke Single Device Session
create or replace function public.revoke_store_device_session(
  p_session_id uuid,
  p_reason text default 'manual_revoke'
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
begin
  update public.store_device_sessions
  set revoked_at = now(),
      revoked_reason = p_reason
  where id = p_session_id
    and revoked_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- 6.6 Store-wide Revoke All Sessions
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
  return v_updated;
end;
$$;

-- Revoke execute from public/anon
revoke all on function public.create_store_otp_challenge from public;
revoke all on function public.invalidate_store_otp_challenges from public;
revoke all on function public.verify_store_otp from public;
revoke all on function public.create_store_device_session from public;
revoke all on function public.revoke_store_device_session from public;
revoke all on function public.revoke_all_store_device_sessions from public;

grant execute on function public.revoke_store_device_session to authenticated;
grant execute on function public.revoke_all_store_device_sessions to authenticated;

-- =============================================================================
-- 7. RLS 設定
-- =============================================================================
alter table public.store_otp_challenges enable row level security;
alter table public.store_device_sessions enable row level security;
alter table public.security_alerts enable row level security;
alter table public.audit_logs enable row level security;

-- store_otp_challenges: 管理者のみメタデータ参照可（クライアント直接操作不可）
create policy otp_challenges_admin_select on public.store_otp_challenges
for select to authenticated
using (public.current_user_role() = 'admin');

-- store_device_sessions: 管理者のみ全件参照・管理可
create policy device_sessions_admin_all on public.store_device_sessions
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- security_alerts: 管理者のみ全件参照・管理可
create policy security_alerts_admin_all on public.security_alerts
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- audit_logs: 管理者のみ参照可
create policy audit_logs_admin_select on public.audit_logs
for select to authenticated
using (public.current_user_role() = 'admin');

commit;
