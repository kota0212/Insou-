'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import {
  createSupabaseMenu,
  createSupabaseStore,
  deleteSupabaseMenu,
  deleteSupabaseStore,
  fetchSupabaseInitData,
  fetchSupabaseMenuPdf,
  getCurrentSession,
  getMenuSyncPlan,
  recordStoreLogin,
  signInAdmin,
  signInStore,
  signOut,
  syncMenuPdfs,
  updateSupabaseMenu,
} from '@/lib/supabase-api';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export type Screen =
  | 'login'
  | 'admin-list'
  | 'admin-new'
  | 'admin-stores'
  | 'store-list'
  | 'sync'
  | 'viewer';

export type Store = {
  id: string;
  code: string;
  name: string;
  area: string;
  passcode?: string;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
};

export type MenuPdf = {
  id: string;
  title: string;
  pdfData?: Blob; // IndexedDBとメモリ内の閲覧用データ
  storagePath?: string; // Supabase Private Storage内のパス（UIには表示しない）
  isPublished?: boolean;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
};

export type ApiStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

// 認証前の店舗コード入力補助。業務データは認証後にSupabaseから取得する。
const initialStores: Store[] = [
  { id: 'kitashinchi-a', code: 'KS-01', name: '北新地A店', area: '大阪' },
  { id: 'kitashinchi-b', code: 'KS-02', name: '北新地B店', area: '大阪' },
  { id: 'minami-a', code: 'MN-01', name: 'ミナミA店', area: '大阪' },
  { id: 'shinsaibashi', code: 'SB-01', name: '心斎橋店', area: '大阪' },
  { id: 'kyoto-a', code: 'KT-01', name: '京都A店', area: '京都' },
  { id: 'kyoto-b', code: 'KT-02', name: '京都B店', area: '京都' },
  { id: 'kobe', code: 'KB-01', name: '神戸店', area: '神戸' },
  { id: 'sannomiya', code: 'SN-01', name: '三宮店', area: '神戸' },
];

const formatDate = (date: string) => {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(date));
  } catch {
    return date;
  }
};

const formatDateTime = (date: string) => {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return date;
  }
};

const shortTitle = (title: string) => title.replace(/\s*20\d{2}年.*$/, '');

type LoginMode = 'store' | 'admin';

const prototypeMode = process.env.NEXT_PUBLIC_PROTOTYPE_MODE === 'true';
const prototypeStoreCode = process.env.NEXT_PUBLIC_PROTOTYPE_STORE_CODE ?? '';
const prototypeStorePin = process.env.NEXT_PUBLIC_PROTOTYPE_STORE_PIN ?? '';
const prototypeAdminEmail =
  process.env.NEXT_PUBLIC_PROTOTYPE_ADMIN_EMAIL ?? 'k.nishida@vexum-ai.com';
const prototypeAdminPassword =
  process.env.NEXT_PUBLIC_PROTOTYPE_ADMIN_PASSWORD ?? '';

export default function HomePage() {
  const pathname = usePathname();
  const loginMode: LoginMode = pathname.startsWith('/admin')
    ? 'admin'
    : 'store';
  const [screen, setScreen] = useState<Screen>('login');
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [menus, setMenus] = useState<MenuPdf[]>([]);
  const [storeId, setStoreId] = useState('kitashinchi-a');
  const [activeId, setActiveId] = useState('');
  const [returnScreen, setReturnScreen] = useState<Screen>('store-list');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [syncProgress, setSyncProgress] = useState({ complete: 0, total: 0 });
  const [isPrototypeAdminSession, setIsPrototypeAdminSession] =
    useState(false);
  const didResumeSessionRef = useRef(false);

  // 認証済みの場合だけSupabaseから軽量メタデータを取得する。
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setApiStatus('unconfigured');
      setStores(initialStores);
      setMenus([]);
      return;
    }

    setApiStatus('loading');
    setErrorMessage('');
    try {
      const session = await getCurrentSession();
      if (!session) {
        setStores(initialStores);
        setMenus([]);
        setApiStatus('ready');
        return;
      }
      const data = await fetchSupabaseInitData();
      setStores(data.stores.length > 0 ? data.stores : []);
      setMenus(data.menus.length > 0 ? data.menus : []);
      setApiStatus('ready');
    } catch (err) {
      setApiStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Supabaseとの通信に失敗しました',
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ModelContext ツール連携（最新の店舗・メニューデータと同期）
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {}
    };

    register({
      name: 'list_store_menus',
      title: '店舗の公開メニューを確認',
      description:
        '指定した店舗に現在公開されているPDFメニューを一覧で返します。',
      inputSchema: {
        type: 'object',
        properties: {
          storeId: { type: 'string', enum: stores.map((s) => s.id) },
        },
        required: ['storeId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { storeId?: string };
        if (!stores.some((s) => s.id === value.storeId))
          throw new Error('店舗IDが正しくありません');
        return {
          storeId: value.storeId,
          menus: menus
            .filter((menu) => menu.storeIds.includes(value.storeId!))
            .map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
        };
      },
    });

    return () => lifecycle.abort();
  }, [menus, stores]);

  // PDFビューアーを開く処理（Private Storageから必要時のみ取得）
  const handleOpenViewer = async (
    menuId: string,
    returnTo: Screen,
    forceRefresh = false,
  ) => {
    setActiveId(menuId);
    setReturnScreen(returnTo);
    setScreen('viewer');
    setPdfError('');

    const targetMenu = menus.find((m) => m.id === menuId);
    // IndexedDB/メモリに同じupdatedAtのPDFがあればStorageにアクセスしない。
    if (
      targetMenu?.storagePath &&
      (!targetMenu.pdfData || forceRefresh) &&
      isSupabaseConfigured()
    ) {
      setIsPdfLoading(true);
      try {
        const pdfData = await fetchSupabaseMenuPdf(
          {
            id: targetMenu.id,
            updatedAt: targetMenu.updatedAt,
            storagePath: targetMenu.storagePath,
          },
          forceRefresh,
        );
        setMenus((prev) =>
          prev.map((m) => (m.id === menuId ? { ...m, pdfData } : m)),
        );
      } catch (err) {
        console.error('PDF読み込み失敗:', err);
        setPdfError(
          err instanceof Error ? err.message : 'PDFの読み込みに失敗しました',
        );
      } finally {
        setIsPdfLoading(false);
      }
    }
  };

  // メニュー新規保存・更新処理
  const handleSaveMenu = async (menuData: {
    id?: string;
    title: string;
    file?: File;
    fileName?: string;
    storeIds: string[];
    createdAt?: string;
  }) => {
    setIsSubmitting(true);
    try {
      if (isPrototypeAdminSession)
        throw new Error('試作モードでは保存できません');
      if (isSupabaseConfigured()) {
        if (activeId) {
          const updated = await updateSupabaseMenu({
            id: activeId,
            title: menuData.title,
            storeIds: menuData.storeIds,
            fileName: menuData.fileName,
            pdfFile: menuData.file,
          });
          setMenus((prev) =>
            prev.map((m) =>
              m.id === activeId
                ? { ...m, ...updated, pdfData: menuData.file || m.pdfData }
                : m,
            ),
          );
        } else {
          // 新規メニュー作成
          const created = await createSupabaseMenu({
            title: menuData.title,
            storeIds: menuData.storeIds,
            fileName: menuData.fileName || 'menu.pdf',
            pdfFile: menuData.file!,
          });
          setMenus((prev) => [{ ...created, pdfData: menuData.file }, ...prev]);
        }
      } else throw new Error('Supabaseの接続設定が必要です');
      setActiveId('');
      setScreen('admin-list');
    } catch (err) {
      alert(
        `保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // メニュー削除処理
  const handleDeleteMenu = async (id: string) => {
    setIsSubmitting(true);
    try {
      if (isPrototypeAdminSession)
        throw new Error('試作モードでは削除できません');
      if (!isSupabaseConfigured())
        throw new Error('Supabaseの接続設定が必要です');
      await deleteSupabaseMenu(id);
      setMenus((prev) => prev.filter((m) => m.id !== id));
      if (activeId === id) setActiveId('');
    } catch (err) {
      alert(
        `削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 店舗追加処理
  const handleAddStore = async (newStore: Store) => {
    setIsSubmitting(true);
    try {
      if (isPrototypeAdminSession)
        throw new Error('試作モードでは店舗を追加できません');
      if (isSupabaseConfigured()) {
        const created = await createSupabaseStore(newStore);
        setStores((prev) => [...prev, created]);
      } else throw new Error('Supabaseの接続設定が必要です');
    } catch (err) {
      alert(
        `店舗追加に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 店舗削除処理
  const handleDeleteStore = async (delId: string) => {
    setIsSubmitting(true);
    try {
      if (isPrototypeAdminSession)
        throw new Error('試作モードでは店舗を削除できません');
      if (!isSupabaseConfigured())
        throw new Error('Supabaseの接続設定が必要です');
      await deleteSupabaseStore(delId);
      setStores((prev) => prev.filter((s) => s.id !== delId));
      setMenus((prev) =>
        prev.map((m) => ({
          ...m,
          storeIds: m.storeIds.filter((id) => id !== delId),
        })),
      );
      if (storeId === delId && stores.length > 1) {
        const remaining = stores.filter((s) => s.id !== delId);
        setStoreId(remaining[0].id);
      }
    } catch (err) {
      alert(
        `店舗削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const prepareStoreMenus = async (data: {
    stores: Store[];
    menus: MenuPdf[];
  }) => {
    const currentStore = data.stores[0];
    if (!currentStore) throw new Error('認証ユーザーに店舗が紐付いていません');
    const assignedMenus = data.menus.filter(
      (menu): menu is MenuPdf & { storagePath: string } =>
        Boolean(menu.storagePath && menu.storeIds.includes(currentStore.id)),
    );
    setStoreId(currentStore.id);
    setStores(data.stores);

    const plan = await getMenuSyncPlan(assignedMenus);
    let cached = plan.cached;
    if (plan.pending.length > 0) {
      setSyncProgress({ complete: 0, total: plan.pending.length });
      setScreen('sync');
      const synced = await syncMenuPdfs(plan.pending, (complete, total) =>
        setSyncProgress({ complete, total }),
      );
      cached = new Map([...cached, ...synced]);
    }

    const readyMenus = assignedMenus.map((menu) => ({
      ...menu,
      pdfData: cached.get(menu.id),
    }));
    setMenus(readyMenus);
    const firstMenu = readyMenus[0];
    if (firstMenu) {
      setActiveId(firstMenu.id);
      setReturnScreen('login');
      setScreen('viewer');
    } else {
      setScreen('store-list');
    }
  };

  useEffect(() => {
    if (
      didResumeSessionRef.current ||
      loginMode !== 'store' ||
      screen !== 'login' ||
      apiStatus !== 'ready' ||
      stores.length !== 1
    ) {
      return;
    }
    didResumeSessionRef.current = true;
    void prepareStoreMenus({ stores, menus }).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : 'メニューの準備に失敗しました',
      );
      setApiStatus('error');
      setScreen('login');
    });
  }, [apiStatus, loginMode, menus, screen, stores]);

  const activeMenu = menus.find((m) => m.id === activeId);

  // 通信中ローディング画面
  if (apiStatus === 'loading' && stores.length === 0 && menus.length === 0) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-50 text-slate-600">
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <Loader2 className="size-8 animate-spin text-blue-600" />
          <p className="text-base font-bold text-slate-800">
            データを読み込んでいます...
          </p>
          <p className="text-xs text-slate-500">Supabaseと通信中</p>
        </div>
      </div>
    );
  }

  // エラー画面
  if (apiStatus === 'error' && stores.length === 0) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-50 p-6 text-slate-700">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-6 shadow-sm text-center">
          <AlertCircle className="mx-auto size-12 text-red-500 mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            API通信エラー
          </h2>
          <p className="text-xs text-slate-600 mb-4">{errorMessage}</p>
          <p className="text-[11px] text-slate-500 mb-6 bg-slate-50 p-2.5 rounded-lg text-left">
            ・SupabaseのURLとanon keyを確認してください。
            <br />
            ・DB migration、Authユーザー、RLSの設定を確認してください。
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              onClick={() => void loadData()}
              className="bg-blue-600 text-white font-bold"
            >
              <RefreshCw className="mr-1.5 size-4" />
              再試行する
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'sync') {
    const rate = syncProgress.total
      ? Math.round((syncProgress.complete / syncProgress.total) * 100)
      : 0;
    return (
      <main className="grid min-h-svh place-items-center bg-[#15130f] p-6 text-[#e8dcc5]">
        <section className="w-full max-w-md text-center">
          <Loader2 className="mx-auto size-10 animate-spin text-[#ba985b]" />
          <h1 className="mt-5 font-serif text-2xl">
            最新のメニューを準備しています
          </h1>
          <p className="mt-3 text-sm text-[#a99c87]">
            {syncProgress.complete} / {syncProgress.total} 件完了（{rate}%）
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#302a20]">
            <div
              className="h-full rounded-full bg-[#ba985b] transition-[width]"
              style={{ width: `${rate}%` }}
            />
          </div>
        </section>
      </main>
    );
  }

  // 1. 統合ログイン画面
  if (screen === 'login') {
    return (
      <UnifiedLogin
        mode={loginMode}
        stores={stores}
        apiStatus={apiStatus}
        errorMessage={errorMessage}
        onRetry={() => void loadData()}
        onStoreLogin={async (selectedId, passcode) => {
          if (!isSupabaseConfigured())
            throw new Error('Supabaseの接続設定が必要です');
          const selected = stores.find((store) => store.id === selectedId);
          if (!selected) throw new Error('店舗コードを確認してください');
          await signInStore(
            selected.code,
            prototypeMode ? prototypeStorePin : passcode,
          );
          const data = await fetchSupabaseInitData();
          void recordStoreLogin().catch((error) =>
            console.warn('ログイン日時を記録できませんでした:', error),
          );
          didResumeSessionRef.current = true;
          await prepareStoreMenus(data);
        }}
        onAdminLogin={async (email, password) => {
          if (!isSupabaseConfigured())
            throw new Error('Supabaseの接続設定が必要です');
          if (prototypeMode && !prototypeAdminPassword) {
            // 試作モードでは管理者の入力値やAuthアカウントの有無に依存せず、
            // 管理画面の導線・表示を確認できる。更新操作は実行しない。
            setIsPrototypeAdminSession(true);
            setStores(initialStores);
            setMenus([]);
            setApiStatus('ready');
            setScreen('admin-list');
            return;
          }
          await signInAdmin(
            prototypeMode ? prototypeAdminEmail : email,
            prototypeMode ? prototypeAdminPassword : password,
          );
          setIsPrototypeAdminSession(false);
          const data = await fetchSupabaseInitData();
          setStores(data.stores);
          setMenus(data.menus);
          setApiStatus('ready');
          setScreen('admin-list');
        }}
      />
    );
  }

  // 2. 自店舗向けメニュー一覧
  if (screen === 'store-list') {
    return (
      <StoreMenuList
        storeId={storeId}
        stores={stores}
        menus={menus}
        apiStatus={apiStatus}
        onView={(id) => handleOpenViewer(id, 'store-list')}
        onLogout={() => {
          void signOut();
          setScreen('login');
        }}
      />
    );
  }

  // 3. PDFビューアー
  if (screen === 'viewer' && activeMenu) {
    return (
      <PdfViewer
        menu={activeMenu}
        isLoadingPdf={isPdfLoading}
        errorMessage={pdfError}
        onRetry={() => void handleOpenViewer(activeMenu.id, returnScreen, true)}
        onBack={() => setScreen(returnScreen)}
      />
    );
  }

  if (loginMode === 'store') {
    return (
      <div className="grid min-h-svh place-items-center bg-[#15130f] p-6 text-[#e8dcc5]">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 size-10 text-[#ba985b]" />
          <h2 className="font-serif text-xl">メニューを開けませんでした</h2>
          <p className="mt-2 text-sm text-[#a99c87]">
            店舗情報を読み直してから、もう一度ログインしてください。
          </p>
          <Button
            className="mt-6 bg-[#ba985b] text-[#15130f]"
            onClick={() => {
              setActiveId('');
              setScreen('login');
              void loadData();
            }}
          >
            ログイン画面に戻る
          </Button>
        </div>
      </div>
    );
  }

  // 4. 管理者シェル（メニュー一覧、新規登録、店舗管理）
  return (
    <AdminShell
      current={screen}
      onNavigate={(next) => {
        if (next === 'admin-new') setActiveId('');
        setScreen(next);
      }}
      onLogout={() => {
        void signOut();
        setIsPrototypeAdminSession(false);
        setActiveId('');
        setScreen('login');
      }}
    >
      {/* APIステータスバナー（未設定または通信エラー時） */}
      <BackendStatusNotification
        status={apiStatus}
        errorMessage={errorMessage}
        onRetry={() => void loadData()}
      />
      {isPrototypeAdminSession && (
        <div className="mx-6 mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>試作モードの管理画面です。</strong>{' '}
          認証・保存を伴う操作は行わず、画面遷移と表示のみ確認できます。
        </div>
      )}

      {screen === 'admin-new' ? (
        <NewPdfForm
          stores={stores}
          initialMenu={menus.find((menu) => menu.id === activeId)}
          isSubmitting={isSubmitting}
          onCancel={() => {
            setActiveId('');
            setScreen('admin-list');
          }}
          onSave={handleSaveMenu}
        />
      ) : screen === 'admin-stores' ? (
        <AdminStoreManagement
          stores={stores}
          menus={menus}
          isSubmitting={isSubmitting}
          onAddStore={handleAddStore}
          onDeleteStore={handleDeleteStore}
        />
      ) : (
        <AdminPdfList
          menus={menus}
          isSubmitting={isSubmitting}
          onNew={() => {
            setActiveId('');
            setScreen('admin-new');
          }}
          onEdit={(id) => {
            setActiveId(id);
            setScreen('admin-new');
          }}
          onView={(id) => handleOpenViewer(id, 'admin-list')}
          onDelete={handleDeleteMenu}
        />
      )}
    </AdminShell>
  );
}

// ==========================================
// 共通ブランドマーク
// ==========================================
function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`grid size-10 place-items-center rounded-xl ${
        dark ? 'bg-[#ba985b] text-[#15130f]' : 'bg-blue-600 text-white'
      }`}
    >
      <FileText className="size-5" />
    </div>
  );
}

// ==========================================
// Supabase接続状態通知バナー
// ==========================================
function BackendStatusNotification({
  status,
  errorMessage,
  onRetry,
}: {
  status: ApiStatus;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  if (status === 'ready') return null;

  if (status === 'unconfigured') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
          <span>
            <strong>【Supabase未設定】</strong> <code>.env.local</code>{' '}
            にProject URLとanon keyを設定してください。
          </span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-red-600 shrink-0" />
          <span>
            <strong>【Supabase通信エラー】</strong>{' '}
            {errorMessage || 'データの同期に失敗しました。'}
          </span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded bg-red-100 px-2 py-1 font-bold text-red-800 hover:bg-red-200"
          >
            再読み込み
          </button>
        )}
      </div>
    );
  }

  return null;
}

// ==========================================
// 1. 統合ログインコンポーネント (UnifiedLogin)
// ==========================================
function UnifiedLogin({
  mode,
  stores,
  apiStatus,
  errorMessage,
  onRetry,
  onStoreLogin,
  onAdminLogin,
}: {
  mode: LoginMode;
  stores: Store[];
  apiStatus: ApiStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onStoreLogin: (storeId: string, passcode: string) => Promise<void>;
  onAdminLogin: (email: string, password: string) => Promise<void>;
}) {
  const [storeCode, setStoreCode] = useState(
    prototypeMode ? prototypeStoreCode : '',
  );
  const [storePasscode, setStorePasscode] = useState(
    prototypeMode ? prototypeStorePin : '',
  );
  const [storeLoginError, setStoreLoginError] = useState('');
  const [adminEmail, setAdminEmail] = useState(
    prototypeMode ? prototypeAdminEmail : '',
  );
  const [adminPass, setAdminPass] = useState(
    prototypeMode ? prototypeAdminPassword : '',
  );
  const [adminLoginError, setAdminLoginError] = useState('');

  // 入力された店舗コードから該当店舗を検索
  const trimmed = storeCode.trim().toLowerCase();
  const matchedStore = stores.find(
    (s) =>
      s.code?.toLowerCase() === trimmed ||
      s.id.toLowerCase() === trimmed ||
      s.name.toLowerCase().includes(trimmed),
  );

  const handleStoreSubmit = async (
    e: React.SyntheticEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    const effectiveStoreCode = prototypeMode ? prototypeStoreCode : storeCode;
    const effectivePasscode = prototypeMode
      ? prototypeStorePin
      : storePasscode;
    const effectiveMatchedStore = stores.find(
      (store) => store.code?.toLowerCase() === effectiveStoreCode.trim().toLowerCase(),
    );

    if (effectiveMatchedStore) {
      if (
        effectiveMatchedStore.passcode &&
        effectivePasscode !== effectiveMatchedStore.passcode
      ) {
        setStoreLoginError('パスコードが正しくありません。');
        return;
      }
      try {
        setStoreLoginError('');
        await onStoreLogin(effectiveMatchedStore.id, effectivePasscode);
      } catch (error) {
        setStoreLoginError(
          error instanceof Error
            ? error.message
            : 'ログイン情報を確認してください。',
        );
      }
    } else {
      setStoreLoginError('店舗コードを確認してください。');
    }
  };

  return (
    <main className="login-canvas admin-login-canvas">
      <section className="login-card max-w-lg w-full">
        {prototypeMode && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>試作モード</strong>
            <span className="ml-2">
              入力内容に関係なく、ログインボタンだけで検証用アカウントへ開始できます。
            </span>
          </div>
        )}
        {/* Supabase接続状態 */}
        {apiStatus === 'unconfigured' && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/80 p-2.5 text-[11px] text-blue-900">
            <strong>【Supabase未設定】</strong> <code>.env.local</code>{' '}
            にProject URLとanon
            keyを設定してください。未設定の間はログインできません。
          </div>
        )}
        {apiStatus === 'error' && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-900 flex items-center justify-between">
            <span>
              <strong>【APIエラー】</strong> {errorMessage}
            </span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="font-bold text-red-700 underline"
              >
                再試行
              </button>
            )}
          </div>
        )}

        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-bold text-slate-900 tracking-wide">INSOU</p>
            <p className="text-[11px] font-medium tracking-[.18em] text-slate-400">
              MENU CLOUD SYSTEM (MVP)
            </p>
          </div>
        </div>

        {mode === 'store' ? (
          <div>
            <div className="mb-5">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">
                店舗端末モード
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                店舗コードとパスコードを入力して、自店舗向けメニューを確認します。
              </p>
            </div>

            <form onSubmit={handleStoreSubmit} className="space-y-4">
              <div>
                <label className="form-label block mb-1 text-xs font-semibold text-slate-700">
                  店舗コード
                </label>
                <Input
                  type="text"
                  value={storeCode}
                  onChange={(e) => {
                    setStoreCode(e.target.value);
                    setStoreLoginError('');
                  }}
                  placeholder="例：KS-01"
                  className="h-12 rounded-xl text-base font-bold uppercase tracking-wider text-slate-900"
                  required={!prototypeMode}
                />
                <div className="mt-1.5 min-h-5">
                  {matchedStore ? (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                      <Check className="size-4" />
                      対象店舗: {matchedStore.name} ({matchedStore.area}エリア)
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      ※該当する店舗コードが見つかりません
                    </p>
                  )}
                </div>
              </div>

              {storeLoginError && (
                <p role="alert" className="text-sm font-semibold text-red-600">
                  {storeLoginError}
                </p>
              )}

              <div>
                <label className="form-label block mb-1 text-xs font-semibold text-slate-700">
                  パスコード (PIN)
                </label>
                <Input
                  type="password"
                  value={storePasscode}
                  onChange={(e) => setStorePasscode(e.target.value)}
                  placeholder="••••"
                  className="h-12 rounded-xl text-base tracking-widest"
                  required={!prototypeMode}
                />
              </div>

              {/* クイック選択チップ */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500 mb-2">
                  店舗コード候補（タップで入力）:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stores.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStoreCode(s.code || s.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                        matchedStore?.id === s.id
                          ? 'bg-amber-500 border-amber-600 text-white font-bold shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-amber-400'
                      }`}
                    >
                      <span className="font-bold">{s.code || s.id}</span> (
                      {s.name})
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                disabled={!prototypeMode && apiStatus !== 'ready'}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 text-base font-bold text-white shadow-md shadow-amber-600/20 hover:from-amber-700 hover:to-amber-800"
              >
                店舗端末としてログイン
                <ChevronRight className="ml-1 size-5" />
              </Button>
            </form>
          </div>
        ) : (
          <div>
            <div className="mb-5">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">
                本部・管理者モード
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                メニューPDFの配信管理・店舗管理を行う管理者画面へ入ります。
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setAdminLoginError('');
                  await onAdminLogin(
                    prototypeMode ? prototypeAdminEmail : adminEmail,
                    prototypeMode ? prototypeAdminPassword : adminPass,
                  );
                } catch (error) {
                  setAdminLoginError(
                    error instanceof Error
                      ? error.message
                      : 'ログイン情報を確認してください。',
                  );
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="form-label block mb-1 text-xs font-semibold text-slate-700">
                  管理者ID / メールアドレス
                </label>
                <Input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="h-11 rounded-xl"
                  required={!prototypeMode}
                />
              </div>

              <div>
                <label className="form-label block mb-1 text-xs font-semibold text-slate-700">
                  パスワード
                </label>
                <Input
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl"
                  required={!prototypeMode}
                />
              </div>

              {adminLoginError && (
                <p role="alert" className="text-sm font-semibold text-red-600">
                  {adminLoginError}
                </p>
              )}

              <Button
                type="submit"
                disabled={!prototypeMode && apiStatus !== 'ready'}
                className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
              >
                管理者としてログイン
                <ChevronRight className="ml-1 size-5" />
              </Button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

// ==========================================
// 管理者シェル（サイドバー付きレイアウト）
// ==========================================
function AdminShell({
  current,
  onNavigate,
  onLogout,
  children,
}: {
  current: Screen;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const items = [
    { label: 'PDF配信一覧', icon: FileText, screen: 'admin-list' as Screen },
    {
      label: '店舗一覧・管理',
      icon: Building2,
      screen: 'admin-stores' as Screen,
    },
  ];

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="none"
        className="border-r border-slate-200 bg-white"
      >
        <SidebarHeader className="border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-bold text-slate-900 tracking-wide">INSOU</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] tracking-[.14em] text-slate-400">
                  MENU CLOUD
                </p>
                <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-bold text-slate-600">
                  MVP
                </span>
              </div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-3">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      isActive={current === item.screen}
                      onClick={() => onNavigate(item.screen)}
                      className="h-11 rounded-xl px-3 text-sm data-[active=true]:bg-blue-50 data-[active=true]:font-semibold data-[active=true]:text-blue-700"
                    >
                      <item.icon />
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t border-slate-100 p-4">
          <button
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={onLogout}
          >
            <LogOut className="size-4" />
            ログアウト
          </button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f5f7fb]">{children}</SidebarInset>
    </SidebarProvider>
  );
}

// ==========================================
// 2. 店舗管理画面 (AdminStoreManagement)
// ==========================================
function AdminStoreManagement({
  stores,
  menus,
  isSubmitting,
  onAddStore,
  onDeleteStore,
}: {
  stores: Store[];
  menus: MenuPdf[];
  isSubmitting: boolean;
  onAddStore: (store: Store) => void;
  onDeleteStore: (id: string) => void;
}) {
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreCode, setNewStoreCode] = useState('');
  const [newArea, setNewArea] = useState('大阪');
  const [customArea, setCustomArea] = useState('');
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);

  const existingAreas = Array.from(new Set(stores.map((s) => s.area)));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim() || isSubmitting) return;
    const finalArea = isCustomArea ? customArea.trim() || 'その他' : newArea;
    const id = `store-${Date.now()}`;
    const code =
      newStoreCode.trim() || `ST-${String(stores.length + 1).padStart(2, '0')}`;
    onAddStore({
      id,
      code: code.toUpperCase(),
      name: newStoreName.trim(),
      area: finalArea,
    });
    setNewStoreName('');
    setNewStoreCode('');
    if (isCustomArea) {
      setCustomArea('');
      setIsCustomArea(false);
    }
  };

  return (
    <main className="min-h-svh p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">マスター設定</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                店舗一覧・管理
              </h1>
              <p className="mt-2 text-slate-500">
                Supabaseと同期し、メニューを配信する店舗を管理します。
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-700">
              全 {stores.length} 店舗登録中
            </span>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* 新規店舗追加カード */}
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 font-bold text-slate-900">
              <Building2 className="size-5 text-blue-600" />
              新しい店舗を追加
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  店舗名<span className="text-red-500 ml-1">*</span>
                </label>
                <Input
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="例：祇園A店、銀座中央店"
                  className="rounded-xl"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  店舗コード (ログイン用)
                </label>
                <Input
                  value={newStoreCode}
                  onChange={(e) => setNewStoreCode(e.target.value)}
                  placeholder="例：GN-01 (未入力で自動生成)"
                  className="rounded-xl uppercase font-mono"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  所属エリア
                </label>
                {!isCustomArea ? (
                  <div className="space-y-2">
                    <Select
                      value={newArea}
                      onValueChange={(v) => setNewArea(v || '大阪')}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="rounded-xl bg-slate-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {existingAreas.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}エリア
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => setIsCustomArea(true)}
                      className="text-xs text-blue-600 hover:underline"
                      disabled={isSubmitting}
                    >
                      + 新しいエリアを入力する
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={customArea}
                      onChange={(e) => setCustomArea(e.target.value)}
                      placeholder="エリア名（例：東京、福岡）"
                      className="rounded-xl"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomArea(false)}
                      className="text-xs text-slate-500 hover:underline"
                      disabled={isSubmitting}
                    >
                      既存エリアから選択に戻す
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={!newStoreName.trim() || isSubmitting}
                className="w-full rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Plus className="mr-1 size-4" />
                    店舗を追加
                  </>
                )}
              </Button>
            </form>
          </section>

          {/* 登録店舗一覧テーブル */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-5 bg-slate-50/50 flex items-center justify-between">
              <p className="font-bold text-slate-900">登録済み店舗</p>
              <span className="text-xs text-slate-500">
                削除すると、各メニューの配信対象からも自動除外されます
              </span>
            </div>

            {stores.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                登録されている店舗はありません。左側のフォームから追加してください。
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="pl-6 text-xs text-slate-500">
                      コード
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      店舗名
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      エリア
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      配信中メニュー
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      ログイン状況
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      パスワード
                    </TableHead>
                    <TableHead className="pr-6 text-right text-xs text-slate-500">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => {
                    const assignedCount = menus.filter((m) =>
                      m.storeIds.includes(store.id),
                    ).length;
                    return (
                      <TableRow key={store.id} className="h-16">
                        <TableCell className="pl-6">
                          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-bold text-slate-800">
                            {store.code || store.id}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {store.name}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {store.area}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                            {assignedCount} 件配信中
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                store.lastLoginAt
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {store.lastLoginAt
                                ? 'ログイン済み'
                                : '未ログイン'}
                            </span>
                            <p className="whitespace-nowrap text-[11px] text-slate-500">
                              最終:{' '}
                              {store.lastLoginAt
                                ? formatDateTime(store.lastLoginAt)
                                : '記録なし'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-sm font-bold text-slate-800">
                            {store.passcode || '1234'}
                          </p>
                          <p className="whitespace-nowrap text-[11px] text-slate-500">
                            更新:{' '}
                            {store.passwordUpdatedAt
                              ? formatDateTime(store.passwordUpdatedAt)
                              : '記録なし'}
                          </p>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSubmitting}
                            className="rounded-lg text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTarget(store)}
                          >
                            <Trash2 className="size-3.5 mr-1" />
                            削除
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </div>

        {/* 店舗削除確認モーダル */}
        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-red-50 text-red-600">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>
                「{deleteTarget?.name}」を削除しますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                店舗を削除すると、この店舗向けの配信設定もすべて解除されます。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  if (deleteTarget) onDeleteStore(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}

// ==========================================
// メニュー一覧画面 (AdminPdfList)
// ==========================================
function AdminPdfList({
  menus,
  isSubmitting,
  onNew,
  onEdit,
  onView,
  onDelete,
}: {
  menus: MenuPdf[];
  isSubmitting: boolean;
  onNew: () => void;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<MenuPdf | null>(null);

  return (
    <main className="min-h-svh p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">配信管理</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                PDFメニュー一覧
              </h1>
              <p className="mt-2 text-slate-500">
                登録済みメニューの管理、公開店舗の設定を行います。
              </p>
            </div>
            <Button
              onClick={onNew}
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-blue-600 px-5 font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <FilePlus2 className="mr-2 size-4" />
              新しいPDFを登録
            </Button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 p-5 bg-slate-50/50 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">配信メニュー</p>
              <p className="text-xs text-slate-500">全 {menus.length} 件</p>
            </div>
          </div>

          {menus.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText className="mx-auto size-10 text-slate-400 mb-3" />
              <p className="font-bold text-slate-700">
                登録されているメニューがありません
              </p>
              <p className="text-xs text-slate-500 mt-1">
                「新しいPDFを登録」からPDFを追加してください。
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-16 pl-6 text-xs text-slate-500">
                    種類
                  </TableHead>
                  <TableHead className="text-xs text-slate-500">
                    PDFメニュー名
                  </TableHead>
                  <TableHead className="text-xs text-slate-500">
                    公開店舗数
                  </TableHead>
                  <TableHead className="text-xs text-slate-500">
                    更新日
                  </TableHead>
                  <TableHead className="pr-6 text-right text-xs text-slate-500">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {menus.map((menu, index) => (
                  <TableRow key={menu.id} className="h-20">
                    <TableCell className="pl-6">
                      <MenuThumb tone={index % 3} />
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-slate-900">
                        {menu.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {menu.fileName || 'PDFメニュー'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        {menu.storeIds.length} 店舗に公開中
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDate(menu.updatedAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSubmitting}
                          className="rounded-lg text-blue-700 hover:bg-blue-50 hover:border-blue-200"
                          onClick={() => onView(menu.id)}
                        >
                          <Eye className="size-3.5 mr-1" />
                          プレビュー
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSubmitting}
                          className="rounded-lg"
                          onClick={() => onEdit(menu.id)}
                        >
                          <Pencil className="size-3.5 mr-1" />
                          編集
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSubmitting}
                          className="rounded-lg text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setDeleteTarget(menu)}
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-red-50 text-red-600">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>このPDFを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                「{deleteTarget?.title}
                」は、公開中のすべての店舗画面から削除され、Google
                Drive上のファイルもゴミ箱へ移動されます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  if (deleteTarget) onDelete(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}

function MenuThumb({
  tone = 0,
  large = false,
}: {
  tone?: number;
  large?: boolean;
}) {
  const tones = [
    'from-[#5d4625] to-[#2b2216] border-[#876738]',
    'from-[#47222b] to-[#251318] border-[#7f3f4e]',
    'from-[#253f35] to-[#14231e] border-[#446f5e]',
  ];
  return (
    <div
      className={`grid place-items-center rounded-lg border bg-gradient-to-br shadow-inner ${
        tones[tone]
      } ${large ? 'size-20 rounded-2xl' : 'size-12'}`}
    >
      <FileText
        className={
          large ? 'size-9 text-amber-200/80' : 'size-5 text-amber-200/80'
        }
      />
    </div>
  );
}

// ==========================================
// 新規PDF登録・編集フォーム (NewPdfForm)
// ==========================================
function NewPdfForm({
  stores,
  initialMenu,
  isSubmitting,
  onCancel,
  onSave,
}: {
  stores: Store[];
  initialMenu?: MenuPdf;
  isSubmitting: boolean;
  onCancel: () => void;
  onSave: (menu: {
    id?: string;
    title: string;
    file?: File;
    fileName?: string;
    storeIds: string[];
    createdAt?: string;
  }) => void;
}) {
  const editing = Boolean(initialMenu);
  const [title, setTitle] = useState(initialMenu?.title || '');
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>(
    initialMenu?.storeIds || stores.map((s) => s.id),
  );
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const areas = Array.from(new Set(stores.map((s) => s.area)));
  const allSelected = selected.length === stores.length && stores.length > 0;

  const chooseFile = (picked?: File) => {
    if (!picked) return;
    if (
      picked.type !== 'application/pdf' &&
      !picked.name.toLowerCase().endsWith('.pdf')
    ) {
      alert('PDFファイルを選択してください。');
      return;
    }
    // 20MB制限チェック
    if (picked.size > 20 * 1024 * 1024) {
      alert('PDFファイルサイズは20MB以下にしてください。');
      return;
    }
    setFile(picked);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || selected.length === 0 || isSubmitting) return;

    // 新規登録時はファイル必須
    if (!editing && !file) {
      alert('PDFファイルを選択してください。');
      return;
    }

    onSave({
      id: initialMenu?.id,
      title: title.trim(),
      file: file ?? undefined,
      fileName: file?.name || initialMenu?.fileName,
      storeIds: selected,
      createdAt: initialMenu?.createdAt,
    });
  };

  return (
    <main className="min-h-svh p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          PDF一覧へ戻る
        </button>

        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">
            コンテンツ管理
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            {editing ? 'PDFの配信設定を編集' : '新しいPDFを登録'}
          </h1>
          <p className="mt-2 text-slate-500">
            {editing
              ? '公開する店舗を変更すると、対象店舗の端末一覧へすぐに反映されます。'
              : 'PDFをPrivate Storageへ保存し、閲覧対象の店舗を選択してください。'}
          </p>
        </header>

        <form onSubmit={submit} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="font-bold text-slate-950">PDF情報</p>
                <p className="text-xs text-slate-500">
                  メニューのタイトルとファイルを登録します
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  タイトル<span className="ml-1 text-red-500">*</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例：シャンパンメニュー 2026年9月版"
                  className="h-12 rounded-xl"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  PDFファイル{' '}
                  {!editing && <span className="ml-1 text-red-500">*</span>}
                </label>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={isSubmitting}
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isSubmitting) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (!isSubmitting) chooseFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => !isSubmitting && inputRef.current?.click()}
                  className={`flex h-28 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition ${
                    dragOver
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                >
                  <UploadCloud className="size-7 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {file?.name ||
                        initialMenu?.fileName ||
                        (editing
                          ? '登録済みPDF（変更する場合クリック）'
                          : 'ファイルを選択またはドロップ')}
                    </p>
                    <p className="text-xs text-slate-400">PDF形式・上限20MB</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 公開店舗選択セクション（複数店舗選択可能） */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-950">公開する店舗を選択</p>
                  <p className="text-xs text-slate-500">
                    選択したすべての店舗で、このPDFが閲覧可能になります
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {selected.length} / {stores.length} 店舗 選択中
              </span>
            </div>

            <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 font-semibold text-slate-900">
              <Checkbox
                checked={allSelected}
                disabled={isSubmitting}
                onCheckedChange={(checked) =>
                  setSelected(checked ? stores.map((s) => s.id) : [])
                }
                className="size-5"
              />
              全店舗に公開する
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              {areas.map((area) => (
                <fieldset
                  key={area}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <legend className="px-2 text-xs font-bold text-slate-700">
                    {area}エリア
                  </legend>
                  <div className="space-y-1.5 mt-1">
                    {stores
                      .filter((s) => s.area === area)
                      .map((store) => (
                        <label
                          key={store.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Checkbox
                            checked={selected.includes(store.id)}
                            disabled={isSubmitting}
                            onCheckedChange={() =>
                              setSelected((curr) =>
                                curr.includes(store.id)
                                  ? curr.filter((id) => id !== store.id)
                                  : [...curr, store.id],
                              )
                            }
                          />
                          {store.name}
                        </label>
                      ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="h-11 rounded-xl px-6"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={
                !title.trim() ||
                selected.length === 0 ||
                isSubmitting ||
                (!editing && !file)
              }
              className="h-11 rounded-xl bg-blue-600 px-8 font-bold text-white shadow-sm hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  保存しています...
                </>
              ) : (
                '保存して公開'
              )}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

// ==========================================
// 店舗メニュー一覧画面 (StoreMenuList)
// 1店舗複数メニュー対応: 自店舗に公開されているPDFをカード一覧で表示
// ==========================================
function StoreMenuList({
  storeId,
  stores,
  menus,
  apiStatus,
  onView,
  onLogout,
}: {
  storeId: string;
  stores: Store[];
  menus: MenuPdf[];
  apiStatus: ApiStatus;
  onView: (id: string) => void;
  onLogout: () => void;
}) {
  const store = stores.find((item) => item.id === storeId) || stores[0];
  // 1店舗1メニュー制限を撤廃: 該当店舗IDが含まれる全メニューを取得
  const visible = menus.filter((m) => m.storeIds.includes(store?.id || ''));

  return (
    <main className="store-surface min-h-svh">
      <header className="store-header">
        <div className="flex items-center gap-3">
          <BrandMark dark />
          <span className="hidden font-serif tracking-[.16em] text-[#e8dcc5] sm:block">
            INSOU
          </span>
        </div>
        <p className="absolute left-1/2 -translate-x-1/2 font-serif text-lg tracking-wide text-white sm:text-2xl">
          {store?.name || '店舗端末'}
        </p>
        <Button
          variant="outline"
          onClick={onLogout}
          className="rounded-xl border-[#5f513c] bg-transparent text-[#d4c6ac] hover:bg-[#27231c] hover:text-white"
        >
          <LogOut className="size-4 mr-1" />
          ログアウト
        </Button>
      </header>

      {/* Supabase未設定バナー（店舗画面用） */}
      {apiStatus === 'unconfigured' && (
        <div className="bg-[#292318] border-b border-[#5a482b] px-4 py-2 text-center text-xs text-[#deb877]">
          ※Supabase接続設定が必要です
        </div>
      )}

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-9 sm:py-12">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <p className="mb-2 text-sm tracking-[.18em] text-[#b9985e]">
              MENU COLLECTION
            </p>
            <h1 className="font-serif text-4xl text-[#f6f0e5] sm:text-5xl">
              自店舗メニュー
            </h1>
          </div>
          <p className="text-sm text-[#8f8575]">{visible.length} MENU</p>
        </div>

        {visible.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((menu, index) => (
              <article key={menu.id} className="store-menu-card">
                <div className="menu-preview-wrap">
                  <MenuThumb tone={index % 3} large />
                </div>
                <div className="p-6">
                  <p className="mb-2 text-xs tracking-[.16em] text-[#ad905c]">
                    PDF MENU
                  </p>
                  <h2 className="min-h-14 font-serif text-2xl leading-snug text-[#f8f2e8]">
                    {shortTitle(menu.title)}
                  </h2>
                  <p className="mt-2 text-sm text-[#9d9382]">
                    {menu.title.replace(shortTitle(menu.title), '').trim() ||
                      `更新日 ${formatDate(menu.updatedAt)}`}
                  </p>
                  <Button
                    onClick={() => onView(menu.id)}
                    className="mt-6 h-14 w-full rounded-xl bg-[#b79659] text-base font-bold text-[#17130d] hover:bg-[#c9aa6d]"
                  >
                    見る
                    <ChevronRight className="ml-1" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#3d3528] bg-[#1b1915] px-6 py-20 text-center">
            <FileText className="mx-auto mb-4 size-10 text-[#6e6049]" />
            <p className="text-lg text-[#c6baa6]">
              公開中のメニューはありません
            </p>
            <p className="mt-2 text-sm text-[#766d60]">
              管理者へご確認ください。
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ==========================================
// 3. PDFビューアー (ダウンロード/共有UI排除・Drive URL完全隠蔽)
// ==========================================
function PdfViewer({
  menu,
  isLoadingPdf,
  errorMessage,
  onRetry,
  onBack,
}: {
  menu: MenuPdf;
  isLoadingPdf: boolean;
  errorMessage: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [total, setTotal] = useState(1);
  const [turnAnim, setTurnAnim] = useState<'next' | 'prev' | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // 拡大時のパン（平行移動）状態
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // ドラッグ操作トラッキング用ref
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    midpoint: { x: number; y: number };
    pan: { x: number; y: number };
  } | null>(null);

  const clampZoom = (value: number) => Math.max(100, Math.min(400, value));
  const getPinchGeometry = () => {
    const points = Array.from(pointersRef.current.values());
    if (points.length < 2) return null;
    const [a, b] = points;
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  // ズーム変更時、100%に戻ったらパンをリセット
  useEffect(() => {
    if (zoom <= 100) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // ページ送り処理（本めくりエフェクト付き）
  const movePage = useCallback(
    (direction: -1 | 1) => {
      if (turnAnim) return;
      const nextPage = page + direction;
      if (nextPage < 1 || nextPage > total) return;

      setTurnAnim(direction === 1 ? 'next' : 'prev');
      setPan({ x: 0, y: 0 });

      const switchTimer = setTimeout(() => {
        setPage(nextPage);
      }, 240);

      const endTimer = setTimeout(() => {
        setTurnAnim(null);
        setSwipeOffset(0);
      }, 530);

      return () => {
        clearTimeout(switchTimer);
        clearTimeout(endTimer);
      };
    },
    [page, total, turnAnim],
  );

  // キーボードショートカット操作
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (page > 1 && !turnAnim) {
          movePage(-1);
        }
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (page < total && !turnAnim) {
          movePage(1);
        }
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom((z) => Math.min(260, z + 20));
      } else if (event.key === '-') {
        event.preventDefault();
        setZoom((z) => Math.max(100, z - 20));
      } else if (event.key === '0') {
        event.preventDefault();
        setZoom(100);
        setPan({ x: 0, y: 0 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [movePage, onBack, page, total, turnAnim]);

  // ポインター押下
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (pointersRef.current.size >= 2) {
      const geometry = getPinchGeometry();
      if (geometry) {
        pinchRef.current = {
          ...geometry,
          zoom,
          pan: { ...pan },
        };
        setIsPanning(true);
        setSwipeOffset(0);
      }
      return;
    }

    dragStartRef.current = { x: event.clientX, y: event.clientY };
    initialPanRef.current = { ...pan };
    hasDraggedRef.current = false;
  };

  // ポインター移動
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const geometry = getPinchGeometry();
      if (!geometry) return;
      const nextZoom = clampZoom(
        pinchRef.current.zoom *
          (geometry.distance / Math.max(1, pinchRef.current.distance)),
      );
      setZoom(nextZoom);
      setPan({
        x:
          pinchRef.current.pan.x +
          geometry.midpoint.x -
          pinchRef.current.midpoint.x,
        y:
          pinchRef.current.pan.y +
          geometry.midpoint.y -
          pinchRef.current.midpoint.y,
      });
      setIsPanning(true);
      hasDraggedRef.current = true;
      return;
    }

    if (!dragStartRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const dist = Math.hypot(deltaX, deltaY);

    if (dist > 4) {
      hasDraggedRef.current = true;
    }

    if (zoom > 100) {
      setIsPanning(true);
      const limitX = Math.max(200, window.innerWidth * (zoom / 100) * 0.7);
      const limitY = Math.max(200, window.innerHeight * (zoom / 100) * 0.7);

      const nextX = Math.max(
        -limitX,
        Math.min(limitX, initialPanRef.current.x + deltaX),
      );
      const nextY = Math.max(
        -limitY,
        Math.min(limitY, initialPanRef.current.y + deltaY),
      );
      setPan({ x: nextX, y: nextY });
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const allowed = (deltaX < 0 && page < total) || (deltaX > 0 && page > 1);
      setSwipeOffset(
        allowed ? Math.max(-120, Math.min(120, deltaX)) : deltaX * 0.15,
      );
    }
  };

  // ポインター離上
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasPinching = Boolean(pinchRef.current);
    pointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (wasPinching) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      const remaining = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = remaining ? { ...remaining } : null;
      initialPanRef.current = { ...pan };
      setIsPanning(false);
      return;
    }

    if (!dragStartRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    setIsPanning(false);

    if (
      zoom <= 100 &&
      Math.abs(deltaX) >= 45 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    ) {
      movePage(deltaX < 0 ? 1 : -1);
    }

    dragStartRef.current = null;
    if (!turnAnim) setSwipeOffset(0);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    dragStartRef.current = null;
    setIsPanning(false);
    setSwipeOffset(0);
  };

  // マウスホイール
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (zoom > 100) {
      event.preventDefault();
      const limitX = Math.max(200, window.innerWidth * (zoom / 100) * 0.7);
      const limitY = Math.max(200, window.innerHeight * (zoom / 100) * 0.7);

      setPan((prev) => ({
        x: Math.max(-limitX, Math.min(limitX, prev.x - event.deltaX)),
        y: Math.max(-limitY, Math.min(limitY, prev.y - event.deltaY)),
      }));
    }
  };

  return (
    <main className="viewer-surface viewer-pdf-only">
      {/* ビューアーステージ */}
      <div
        className={`viewer-stage ${zoom > 100 ? (isPanning ? 'viewer-panning' : 'viewer-pannable') : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
      >
        <div className="book-turn-viewport">
          <div
            className={`book-turn-stage ${
              turnAnim === 'next'
                ? 'book-anim-next'
                : turnAnim === 'prev'
                  ? 'book-anim-prev'
                  : ''
            }`}
            style={{
              transform:
                zoom > 100
                  ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom / 100})`
                  : swipeOffset
                    ? `translate3d(${swipeOffset * 0.24}px, -3px, 0) scale(0.985)`
                    : undefined,
              transition: isPanning ? 'none' : 'transform 0.12s ease-out',
            }}
          >
            {turnAnim && <div className="book-turn-overlay" />}
            {isLoadingPdf ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-amber-200">
                <Loader2 className="size-10 animate-spin text-[#ba985b]" />
                <p className="font-serif text-sm tracking-wide">
                  PDFを安全に読み込んでいます...
                </p>
              </div>
            ) : errorMessage ? (
              <PdfLoadError message={errorMessage} onRetry={onRetry} />
            ) : menu.pdfData ? (
              <PdfCanvas
                pdfData={menu.pdfData}
                page={page}
                onLoaded={setTotal}
                onRetry={onRetry}
              />
            ) : (
              <PdfLoadError
                message="PDFデータを読み込めませんでした"
                onRetry={onRetry}
              />
            )}
          </div>
        </div>
      </div>
      <div className="viewer-page-indicator" aria-live="polite">
        {page}
        <span>/</span>
        {total}
      </div>
    </main>
  );
}

function PdfLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center text-[#e8dcc5]">
      <AlertCircle className="mb-4 size-10 text-[#ba985b]" />
      <p className="font-serif text-lg">PDFを表示できませんでした</p>
      <p className="mt-2 max-w-sm text-sm text-[#a99c87]">{message}</p>
      <Button
        onClick={onRetry}
        className="mt-6 bg-[#ba985b] text-[#15130f] hover:bg-[#c9aa6d]"
      >
        <RefreshCw className="mr-2 size-4" />
        もう一度読み込む
      </Button>
    </div>
  );
}

// ==========================================
// 実際のPDFレンダラー (PdfCanvas)
// ==========================================
function PdfCanvas({
  pdfData,
  page,
  onLoaded,
  onRetry,
}: {
  pdfData: Blob;
  page: number;
  onLoaded: (pages: number) => void;
  onRetry: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(page);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    currentPageRef.current = page;
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    const renderTasks: Array<{
      cancel: () => void;
      promise: Promise<unknown>;
    }> = [];
    let documentTask: { destroy: () => Promise<void> } | undefined;

    const render = async () => {
      try {
        setStatus('loading');
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const source = await pdfData.arrayBuffer();
        const bytes = new Uint8Array(source);
        if (
          bytes.length < 5 ||
          String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-'
        ) {
          throw new Error('無効なPDFデータです');
        }
        const loadingTask = pdfjs.getDocument({
          data: bytes,
        });
        const pdf = await loadingTask.promise;
        documentTask = pdf;
        if (cancelled) return;

        onLoaded(pdf.numPages);
        const container = containerRef.current;
        if (!container) return;
        container.replaceChildren();

        const firstPage = Math.min(currentPageRef.current, pdf.numPages);
        const pageOrder = [
          firstPage,
          ...Array.from(
            { length: pdf.numPages },
            (_, index) => index + 1,
          ).filter((pageNumber) => pageNumber !== firstPage),
        ];

        for (const pageNumber of pageOrder) {
          const pdfPage = await pdf.getPage(pageNumber);
          const baseViewport = pdfPage.getViewport({ scale: 1 });
          const deviceScale = Math.min(window.devicePixelRatio || 1, 1.5);
          const maxPixels = 8_000_000;
          const pixelScaleLimit = Math.sqrt(
            maxPixels / (baseViewport.width * baseViewport.height),
          );
          const renderScale = Math.max(
            1,
            Math.min(deviceScale, pixelScaleLimit),
          );
          const viewport = pdfPage.getViewport({ scale: renderScale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context || cancelled) return;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'pdf-canvas';
          canvas.dataset.page = String(pageNumber);
          canvas.style.display =
            pageNumber === currentPageRef.current ? 'block' : 'none';
          canvas.style.height = 'min(78vh, 880px)';
          container.appendChild(canvas);
          const task = pdfPage.render({
            canvas,
            canvasContext: context,
            viewport,
          });
          renderTasks.push(task);
          await task.promise;
          if (pageNumber === firstPage && !cancelled) setStatus('ready');

          // iPad Safariのメインスレッドとメモリを一度に占有しない。
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });
        }
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (
          !cancelled &&
          !(
            error instanceof Error &&
            error.name === 'RenderingCancelledException'
          )
        ) {
          console.error('PDFの先読み・描画に失敗しました:', error);
          setStatus('error');
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      for (const task of renderTasks) task.cancel();
      void documentTask?.destroy();
    };
  }, [onLoaded, pdfData]);

  useEffect(() => {
    const canvases =
      containerRef.current?.querySelectorAll<HTMLCanvasElement>(
        'canvas[data-page]',
      );
    canvases?.forEach((canvas) => {
      canvas.style.display =
        canvas.dataset.page === String(page) ? 'block' : 'none';
    });
  }, [page]);

  return (
    <div className="pdf-canvas-wrap">
      <div
        ref={containerRef}
        className={status === 'ready' ? 'opacity-100' : 'opacity-0'}
      />
      {status === 'loading' && (
        <p className="pdf-status">PDFを描画しています...</p>
      )}
      {status === 'error' && (
        <div className="pdf-status flex flex-col items-center gap-3">
          <span>PDFを表示できませんでした</span>
          <Button size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 size-4" />
            もう一度読み込む
          </Button>
        </div>
      )}
    </div>
  );
}
