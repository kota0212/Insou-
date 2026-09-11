begin;

-- =============================================================================
-- store_auth_rate_limits (永続化レート制限テーブル)
-- Vercel serverless / multi-instance 環境で共有されるレートリミッター
-- =============================================================================
create table if not exists public.store_auth_rate_limits (
  rate_key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_auth_rate_limits_expires
on public.store_auth_rate_limits(expires_at);

-- RLS を有効化し、外部クライアント（anon / authenticated）からのアクセスを遮断
alter table public.store_auth_rate_limits enable row level security;

-- =============================================================================
-- check_and_increment_rate_limit
-- アトミックなインクリメント & ウィンドウ更新を行う SECURITY DEFINER 関数
-- =============================================================================
create or replace function public.check_and_increment_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
) returns table(
  allowed boolean,
  current_count integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_row public.store_auth_rate_limits%rowtype;
  v_new_expires timestamptz := v_now + (p_window_seconds * interval '1 second');
begin
  -- 期限切れから1時間以上経過した古いレコードを自動クリーンアップ
  delete from public.store_auth_rate_limits
  where expires_at < v_now - interval '1 hour';

  -- アトミックな挿入または更新 (ON CONFLICT DO UPDATE)
  insert into public.store_auth_rate_limits (
    rate_key,
    count,
    window_start,
    expires_at,
    created_at,
    updated_at
  ) values (
    p_rate_key,
    1,
    v_now,
    v_new_expires,
    v_now,
    v_now
  )
  on conflict (rate_key) do update
  set
    count = case
      when public.store_auth_rate_limits.expires_at <= v_now then 1
      else public.store_auth_rate_limits.count + 1
    end,
    window_start = case
      when public.store_auth_rate_limits.expires_at <= v_now then v_now
      else public.store_auth_rate_limits.window_start
    end,
    expires_at = case
      when public.store_auth_rate_limits.expires_at <= v_now then v_new_expires
      else public.store_auth_rate_limits.expires_at
    end,
    updated_at = v_now
  returning * into v_row;

  if v_row.count > p_limit then
    return query select false, v_row.count, 0, v_row.expires_at;
  else
    return query select true, v_row.count, p_limit - v_row.count, v_row.expires_at;
  end if;
end;
$$;

-- 権限剥奪: public, anon, authenticated から直接実行を拒否（service_role / server のみ実行可能）
revoke all on function public.check_and_increment_rate_limit(text, integer, integer) from public, anon, authenticated;

commit;
