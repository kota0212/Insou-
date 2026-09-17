'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function AdminSetupPasswordPage() {
  const [ready, setReady] = useState(false);
  const [sessionAvailable, setSessionAvailable] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true);
      return;
    }
    const client = getSupabaseBrowserClient();
    const updateSessionState = async () => {
      const { data } = await client.auth.getSession();
      setSessionAvailable(Boolean(data.session));
      setReady(true);
    };
    void updateSessionState();
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      setIsRecovery(event === 'PASSWORD_RECOVERY');
      setSessionAvailable(Boolean(session));
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }
    if (password !== confirmation) {
      setError('確認用パスワードが一致しません。');
      return;
    }
    setSaving(true);
    try {
      const client = getSupabaseBrowserClient();
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) throw new Error('認証リンクの有効期限が切れたか、無効です。もう一度メールを送信してください。');
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmation('');
      setCompleted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'パスワードを設定できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold text-blue-600">INSOU 管理者認証</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{isRecovery ? 'パスワードを再設定' : 'パスワードを設定'}</h1>
        <p className="mt-2 text-sm text-slate-600">招待または再設定メールのリンクを開いた本人が、新しいパスワードを設定します。</p>

        {!ready ? <p className="mt-6 text-sm text-slate-500">認証情報を確認しています...</p> : !isSupabaseConfigured() ? <p className="mt-6 text-sm text-red-600">Supabase接続設定がありません。</p> : !sessionAvailable ? <div className="mt-6 space-y-3"><p className="text-sm text-red-600">認証リンクが無効か、有効期限が切れています。管理者へ招待または再設定メールの再送を依頼してください。</p><Link href="/admin" className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-900 hover:bg-slate-50">管理者ログインへ戻る</Link></div> : completed ? <div className="mt-6 space-y-3"><p className="text-sm font-semibold text-emerald-600">パスワードを設定しました。管理者ログインへ進んでください。</p><Link href="/admin" className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">管理者ログインへ</Link></div> : <form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium text-slate-800">新しいパスワード<Input className="mt-1" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required disabled={saving} /></label><label className="block text-sm font-medium text-slate-800">新しいパスワード（確認）<Input className="mt-1" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required disabled={saving} /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<Button type="submit" className="w-full" disabled={saving}>{saving ? '設定中...' : isRecovery ? 'パスワードを再設定' : 'パスワードを設定'}</Button></form>}
      </section>
    </main>
  );
}
