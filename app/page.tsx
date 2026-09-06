'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Home,
  LogOut,
  Maximize2,
  Minus,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Store as StoreIcon,
  Trash2,
  UploadCloud,
  Users,
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

export type Screen =
  | 'login'
  | 'admin-list'
  | 'admin-new'
  | 'admin-stores'
  | 'store-list'
  | 'viewer';

export type Store = { id: string; code: string; name: string; area: string };

export type MenuPdf = {
  id: string;
  title: string;
  fileUrl: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
};

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

const initialMenus: MenuPdf[] = [
  {
    id: 'champagne-202609',
    title: 'シャンパンメニュー 2026年9月版',
    fileUrl: '',
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    storeIds: ['kitashinchi-a', 'kitashinchi-b'],
  },
  {
    id: 'wine-202609',
    title: 'ワインメニュー 2026年9月版',
    fileUrl: '',
    createdAt: '2026-08-28',
    updatedAt: '2026-09-02',
    storeIds: ['kitashinchi-a', 'minami-a', 'shinsaibashi', 'kyoto-a', 'kobe'],
  },
  {
    id: 'autumn-2026',
    title: '季節のおすすめ 2026年秋',
    fileUrl: '',
    createdAt: '2026-08-25',
    updatedAt: '2026-08-31',
    storeIds: ['kyoto-b', 'sannomiya'],
  },
];

const normalizeSingleMenuPerStore = (items: MenuPdf[]) => {
  const assigned = new Set<string>();
  return items.map((menu) => ({
    ...menu,
    storeIds: menu.storeIds.filter((storeId) => {
      if (assigned.has(storeId)) return false;
      assigned.add(storeId);
      return true;
    }),
  }));
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));

const shortTitle = (title: string) => title.replace(/\s*20\d{2}年.*$/, '');

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>('login');
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [menus, setMenus] = useState<MenuPdf[]>(initialMenus);
  const [storeId, setStoreId] = useState('kitashinchi-a');
  const [activeId, setActiveId] = useState('');
  const [returnScreen, setReturnScreen] = useState<Screen>('store-list');
  const [ready, setReady] = useState(false);

  // localStorage 読み込み
  useEffect(() => {
    try {
      const savedStores = localStorage.getItem('insou-stores');
      if (savedStores) {
        const parsed = JSON.parse(savedStores);
        if (Array.isArray(parsed) && parsed.length > 0) setStores(parsed);
      }
      const savedMenus = localStorage.getItem('insou-menus');
      if (savedMenus) {
        const parsed = JSON.parse(savedMenus);
        if (Array.isArray(parsed)) setMenus(normalizeSingleMenuPerStore(parsed));
      }
      const savedStore = localStorage.getItem('insou-store');
      if (savedStore) setStoreId(savedStore);
    } catch {}
    setReady(true);
  }, []);

  // localStorage 書き込み
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem('insou-menus', JSON.stringify(menus));
      } catch {}
      try {
        localStorage.setItem('insou-stores', JSON.stringify(stores));
      } catch {}
    }
  }, [menus, stores, ready]);

  // ModelContext ツール連携
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
      description: '指定した店舗に現在公開されているPDFメニューを一覧で返します。',
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

  const activeMenu = menus.find((m) => m.id === activeId);

  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-50 text-slate-500">
        読み込み中...
      </div>
    );
  }

  // 1. 統合ログイン画面
  if (screen === 'login') {
    return (
      <UnifiedLogin
        stores={stores}
        onStoreLogin={(selectedId) => {
          setStoreId(selectedId);
          try {
            localStorage.setItem('insou-store', selectedId);
          } catch {}
          const assigned = menus.find((menu) => menu.storeIds.includes(selectedId));
          if (assigned) {
            setActiveId(assigned.id);
            setReturnScreen('login');
            setScreen('viewer');
          } else {
            setScreen('store-list');
          }
        }}
        onAdminLogin={() => setScreen('admin-list')}
      />
    );
  }

  // 2. 店舗側メニュー一覧画面
  if (screen === 'store-list') {
    return (
      <StoreMenuList
        storeId={storeId}
        stores={stores}
        menus={menus}
        onView={(id) => {
          setActiveId(id);
          setReturnScreen('store-list');
          setScreen('viewer');
        }}
        onLogout={() => setScreen('login')}
      />
    );
  }

  // 3. PDFビューアー
  if (screen === 'viewer' && activeMenu) {
    return (
      <PdfViewer
        menu={activeMenu}
        onBack={() => setScreen(returnScreen)}
      />
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
        setActiveId('');
        setScreen('login');
      }}
    >
      {screen === 'admin-new' ? (
        <NewPdfForm
          stores={stores}
          initialMenu={menus.find((menu) => menu.id === activeId)}
          onCancel={() => {
            setActiveId('');
            setScreen('admin-list');
          }}
          onSave={(menu) => {
            setMenus((current) => {
              const cleared = current.map((item) =>
                item.id === menu.id
                  ? item
                  : { ...item, storeIds: item.storeIds.filter((id) => !menu.storeIds.includes(id)) },
              );
              return cleared.some((item) => item.id === menu.id)
                ? cleared.map((item) => (item.id === menu.id ? menu : item))
                : [menu, ...cleared];
            });
            setActiveId('');
            setScreen('admin-list');
          }}
        />
      ) : screen === 'admin-stores' ? (
        <AdminStoreManagement
          stores={stores}
          menus={menus}
          onAddStore={(newStore) => {
            setStores((current) => [...current, newStore]);
          }}
          onDeleteStore={(delId) => {
            setStores((current) => current.filter((s) => s.id !== delId));
            // 該当店舗をメニューの配信対象からも除外
            setMenus((current) =>
              current.map((m) => ({
                ...m,
                storeIds: m.storeIds.filter((id) => id !== delId),
              })),
            );
            if (storeId === delId && stores.length > 1) {
              const remaining = stores.filter((s) => s.id !== delId);
              setStoreId(remaining[0].id);
            }
          }}
        />
      ) : (
        <AdminPdfList
          menus={menus}
          onNew={() => {
            setActiveId('');
            setScreen('admin-new');
          }}
          onEdit={(id) => {
            setActiveId(id);
            setScreen('admin-new');
          }}
          onView={(id) => {
            setActiveId(id);
            setReturnScreen('admin-list');
            setScreen('viewer');
          }}
          onDelete={(id) => {
            setMenus((current) => current.filter((menu) => menu.id !== id));
            if (activeId === id) setActiveId('');
          }}
        />
      )}
    </AdminShell>
  );
}

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
// 1. 統合ログインコンポーネント (UnifiedLogin)
// ==========================================
function UnifiedLogin({
  stores,
  onStoreLogin,
  onAdminLogin,
}: {
  stores: Store[];
  onStoreLogin: (storeId: string) => void;
  onAdminLogin: () => void;
}) {
  const [mode, setMode] = useState<'store' | 'admin'>('store');
  const [storeCode, setStoreCode] = useState('KS-01');
  const [storePasscode, setStorePasscode] = useState('1234');
  const [adminEmail, setAdminEmail] = useState('admin@insou-cloud.jp');
  const [adminPass, setAdminPass] = useState('password123');

  // 入力された店舗コードから該当店舗を検索
  const trimmed = storeCode.trim().toLowerCase();
  const matchedStore = stores.find(
    (s) =>
      s.code?.toLowerCase() === trimmed ||
      s.id.toLowerCase() === trimmed ||
      s.name.toLowerCase().includes(trimmed),
  );

  const handleStoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchedStore) {
      onStoreLogin(matchedStore.id);
    } else if (stores.length > 0) {
      onStoreLogin(stores[0].id);
    }
  };

  return (
    <main className="login-canvas admin-login-canvas">
      <section className="login-card max-w-lg w-full">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-bold text-slate-900 tracking-wide">INSOU</p>
            <p className="text-[11px] font-medium tracking-[.18em] text-slate-400">
              MENU CLOUD SYSTEM
            </p>
          </div>
        </div>

        {/* ログイン種別タブ切り替え */}
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1.5 border border-slate-200">
          <button
            type="button"
            onClick={() => setMode('store')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition ${
              mode === 'store'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <StoreIcon className="size-4 text-amber-600" />
            店舗端末ログイン
          </button>
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition ${
              mode === 'admin'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="size-4 text-blue-600" />
            管理者ログイン
          </button>
        </div>

        {mode === 'store' ? (
          <div>
            <div className="mb-5">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">
                店舗端末モード
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                店舗コードとパスコードを入力して、店舗メニュー画面を開きます。
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
                  onChange={(e) => setStoreCode(e.target.value)}
                  placeholder="例：KS-01"
                  className="h-12 rounded-xl text-base font-bold uppercase tracking-wider text-slate-900"
                  required
                />
                <div className="mt-1.5 min-h-5">
                  {matchedStore ? (
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                      <Check className="size-4" />
                      対象店舗: {matchedStore.name} ({matchedStore.area}エリア)
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      ※該当する店舗コードが見つかりません（先頭店舗で開きます）
                    </p>
                  )}
                </div>
              </div>

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
                  required
                />
              </div>

              {/* クイック選択チップ */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500 mb-2">
                  デモ用店舗コード（タップで自動入力）:
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
                      <span className="font-bold">{s.code || s.id}</span> ({s.name})
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                ※動作確認用デモのため、入力済みのまま「店舗端末としてログイン」を押すだけで自店舗メニュー画面へ入れます。
              </p>

              <Button
                type="submit"
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
              onSubmit={(e) => {
                e.preventDefault();
                onAdminLogin();
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
                  required
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
                  required
                />
              </div>

              <p className="text-[11px] text-blue-700 bg-blue-50/80 border border-blue-200/60 rounded-xl p-2.5">
                ※動作確認用デモのため、初期入力のまま「管理者としてログイン」を押すだけで管理画面へ入れます。
              </p>

              <Button
                type="submit"
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
    { label: '店舗一覧・管理', icon: Building2, screen: 'admin-stores' as Screen },
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="none" className="border-r border-slate-200 bg-white">
        <SidebarHeader className="border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-bold text-slate-900 tracking-wide">INSOU</p>
              <p className="text-[11px] tracking-[.14em] text-slate-400">MENU CLOUD</p>
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
  onAddStore,
  onDeleteStore,
}: {
  stores: Store[];
  menus: MenuPdf[];
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
    if (!newStoreName.trim()) return;
    const finalArea = isCustomArea
      ? customArea.trim() || 'その他'
      : newArea;
    const id = `store-${Date.now()}`;
    const code = newStoreCode.trim() || `ST-${String(stores.length + 1).padStart(2, '0')}`;
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
                メニューを配信する店舗の追加・削除ができます。
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
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  所属エリア
                </label>
                {!isCustomArea ? (
                  <div className="space-y-2">
                    <Select value={newArea} onValueChange={(v) => setNewArea(v || '大阪')}>
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
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomArea(false)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      既存エリアから選択に戻す
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={!newStoreName.trim()}
                className="w-full rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700"
              >
                <Plus className="mr-1 size-4" />
                店舗を追加
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

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="pl-6 text-xs text-slate-500">コード</TableHead>
                  <TableHead className="text-xs text-slate-500">店舗名</TableHead>
                  <TableHead className="text-xs text-slate-500">エリア</TableHead>
                  <TableHead className="text-xs text-slate-500">配信中メニュー</TableHead>
                  <TableHead className="pr-6 text-right text-xs text-slate-500">操作</TableHead>
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
                      <TableCell className="pr-6 text-right">
                        <Button
                          variant="outline"
                          size="sm"
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
              <AlertDialogTitle>「{deleteTarget?.name}」を削除しますか？</AlertDialogTitle>
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
  onNew,
  onEdit,
  onView,
  onDelete,
}: {
  menus: MenuPdf[];
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

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-16 pl-6 text-xs text-slate-500">種類</TableHead>
                <TableHead className="text-xs text-slate-500">PDFメニュー名</TableHead>
                <TableHead className="text-xs text-slate-500">公開店舗数</TableHead>
                <TableHead className="text-xs text-slate-500">更新日</TableHead>
                <TableHead className="pr-6 text-right text-xs text-slate-500">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.map((menu, index) => (
                <TableRow key={menu.id} className="h-20">
                  <TableCell className="pl-6">
                    <MenuThumb tone={index % 3} />
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold text-slate-900">{menu.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {menu.fileName || (menu.fileUrl ? 'アップロードPDF' : 'サンプルモック')}
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
                        className="rounded-lg text-blue-700 hover:bg-blue-50 hover:border-blue-200"
                        onClick={() => onView(menu.id)}
                      >
                        <Eye className="size-3.5 mr-1" />
                        プレビュー
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => onEdit(menu.id)}
                      >
                        <Pencil className="size-3.5 mr-1" />
                        編集
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
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
                「{deleteTarget?.title}」は、公開中のすべての店舗画面から削除されます。
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

function MenuThumb({ tone = 0, large = false }: { tone?: number; large?: boolean }) {
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
      <FileText className={large ? 'size-9 text-amber-200/80' : 'size-5 text-amber-200/80'} />
    </div>
  );
}

// ==========================================
// 新規PDF登録・編集フォーム (NewPdfForm)
// ==========================================
function NewPdfForm({
  stores,
  initialMenu,
  onCancel,
  onSave,
}: {
  stores: Store[];
  initialMenu?: MenuPdf;
  onCancel: () => void;
  onSave: (menu: MenuPdf) => void;
}) {
  const editing = Boolean(initialMenu);
  const [title, setTitle] = useState(initialMenu?.title || '');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState(initialMenu?.fileUrl || '');
  const [selected, setSelected] = useState<string[]>(
    initialMenu?.storeIds || stores.map((s) => s.id),
  );
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const areas = Array.from(new Set(stores.map((s) => s.area)));
  const allSelected = selected.length === stores.length && stores.length > 0;

  const chooseFile = (picked?: File) => {
    if (!picked) return;
    setFile(picked);
    const reader = new FileReader();
    reader.onload = () => setFileUrl(String(reader.result || ''));
    reader.readAsDataURL(picked);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || selected.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    onSave({
      id: initialMenu?.id || `menu-${Date.now()}`,
      title: title.trim(),
      fileUrl,
      fileName: file?.name || initialMenu?.fileName,
      createdAt: initialMenu?.createdAt || today,
      updatedAt: today,
      storeIds: selected,
    });
  };

  return (
    <main className="min-h-svh p-6 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={onCancel}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          PDF一覧へ戻る
        </button>

        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-600">コンテンツ管理</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            {editing ? 'PDFの配信設定を編集' : '新しいPDFを登録'}
          </h1>
          <p className="mt-2 text-slate-500">
            {editing
              ? '公開する店舗を変更すると、店舗画面へすぐに反映されます。'
              : 'PDFをアップロードし、公開する店舗を選択してください。'}
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
                <p className="text-xs text-slate-500">メニューのタイトルとファイルを登録します</p>
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
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  PDFファイル
                </label>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    chooseFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => inputRef.current?.click()}
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
                        (editing && initialMenu?.fileUrl
                          ? '登録済みPDF'
                          : 'ファイルを選択またはドロップ')}
                    </p>
                    <p className="text-xs text-slate-400">PDF形式・推奨3MB以下</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 公開店舗選択セクション */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-950">公開する店舗を選択</p>
                  <p className="text-xs text-slate-500">選択した店舗にのみ、このPDFが表示されます</p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {selected.length} / {stores.length} 店舗 選択中
              </span>
            </div>

            <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 font-semibold text-slate-900">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  setSelected(checked ? stores.map((s) => s.id) : [])
                }
                className="size-5"
              />
              全店舗に公開する
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              {areas.map((area) => (
                <fieldset key={area} className="rounded-xl border border-slate-200 p-4">
                  <legend className="px-2 text-xs font-bold text-slate-700">{area}エリア</legend>
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
              className="h-11 rounded-xl px-6"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || selected.length === 0}
              className="h-11 rounded-xl bg-blue-600 px-8 font-bold text-white shadow-sm hover:bg-blue-700"
            >
              保存して公開
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

// ==========================================
// 店舗メニュー一覧画面 (StoreMenuList)
// ==========================================
function StoreMenuList({
  storeId,
  stores,
  menus,
  onView,
  onLogout,
}: {
  storeId: string;
  stores: Store[];
  menus: MenuPdf[];
  onView: (id: string) => void;
  onLogout: () => void;
}) {
  const store = stores.find((item) => item.id === storeId) || stores[0];
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
          店舗切替
        </Button>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-9 sm:px-9 sm:py-12">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <p className="mb-2 text-sm tracking-[.18em] text-[#b9985e]">MENU COLLECTION</p>
            <h1 className="font-serif text-4xl text-[#f6f0e5] sm:text-5xl">メニュー</h1>
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
                  <p className="mb-2 text-xs tracking-[.16em] text-[#ad905c]">PDF MENU</p>
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
            <p className="text-lg text-[#c6baa6]">公開中のメニューはありません</p>
            <p className="mt-2 text-sm text-[#766d60]">管理者へご確認ください。</p>
          </div>
        )}
      </div>
    </main>
  );
}

// ==========================================
// 3. PDFビューアー (拡大時パン移動 & リアルな本めくりエフェクト)
// ==========================================
function PdfViewer({ menu, onBack }: { menu: MenuPdf; onBack: () => void }) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [total, setTotal] = useState(menu.fileUrl ? 1 : 2);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [turnAnim, setTurnAnim] = useState<'next' | 'prev' | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // 拡大時のパン（平行移動）状態
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // ドラッグ操作トラッキング用ref
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // ズーム変更時、100%に戻ったらパンをリセット
  useEffect(() => {
    if (zoom <= 100) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // ページ送り処理（本めくりエフェクト付き）
  const movePage = (direction: -1 | 1) => {
    if (turnAnim) return;
    const nextPage = page + direction;
    if (nextPage < 1 || nextPage > total) return;

    setTurnAnim(direction === 1 ? 'next' : 'prev');
    setPan({ x: 0, y: 0 }); // ページめくり時は中央リセット

    // めくりの途中（約260ms）で実際のページ内容を切り替え
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
  };

  // ポインター押下（マウス / タッチ開始）
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    initialPanRef.current = { ...pan };
    hasDraggedRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  // ポインター移動（ドラッグによるパン移動）
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const dist = Math.hypot(deltaX, deltaY);

    if (dist > 4) {
      hasDraggedRef.current = true;
    }

    if (zoom > 100) {
      // 拡大時は上下左右に自由にパン移動
      setIsPanning(true);
      const limitX = Math.max(200, (window.innerWidth * (zoom / 100)) * 0.7);
      const limitY = Math.max(200, (window.innerHeight * (zoom / 100)) * 0.7);

      const nextX = Math.max(-limitX, Math.min(limitX, initialPanRef.current.x + deltaX));
      const nextY = Math.max(-limitY, Math.min(limitY, initialPanRef.current.y + deltaY));
      setPan({ x: nextX, y: nextY });
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const allowed = (deltaX < 0 && page < total) || (deltaX > 0 && page > 1);
      setSwipeOffset(allowed ? Math.max(-120, Math.min(120, deltaX)) : deltaX * 0.15);
    }
  };

  // ポインター離上
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.x;
    const deltaY = event.clientY - dragStartRef.current.y;
    const dist = Math.hypot(deltaX, deltaY);

    setIsPanning(false);

    // 100%標準サイズでの左右スワイプによるページめくり
    if (zoom <= 100 && Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      movePage(deltaX < 0 ? 1 : -1);
    } else if (!hasDraggedRef.current && dist < 5) {
      // タップ時：コントロールUIの表示・非表示をトグル
      setChromeVisible((prev) => !prev);
    }

    dragStartRef.current = null;
    if (!turnAnim) setSwipeOffset(0);
  };

  // マウスホイール / トラックパッドのスクロールによるパン移動
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (zoom > 100) {
      event.preventDefault();
      const limitX = Math.max(200, (window.innerWidth * (zoom / 100)) * 0.7);
      const limitY = Math.max(200, (window.innerHeight * (zoom / 100)) * 0.7);

      setPan((prev) => ({
        x: Math.max(-limitX, Math.min(limitX, prev.x - event.deltaX)),
        y: Math.max(-limitY, Math.min(limitY, prev.y - event.deltaY)),
      }));
    }
  };

  // ダブルクリックでズーム切り替え（100% ↔ 160%）
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 100) {
      setZoom(100);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(160);
    }
  };

  return (
    <main className={`viewer-surface ${chromeVisible ? '' : 'viewer-pdf-only'}`}>
      {chromeVisible && (
        <header className="viewer-header z-30">
          <button
            onClick={onBack}
            className="flex h-12 items-center gap-2 rounded-xl px-3 text-[#e7dcc9] hover:bg-white/5"
          >
            <ArrowLeft />
            一覧に戻る
          </button>
          <h1 className="absolute left-1/2 max-w-[45%] -translate-x-1/2 truncate font-serif text-lg text-white sm:text-xl">
            {menu.title}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setChromeVisible(false)}
              className="rounded-xl border-[#504633] bg-transparent text-[#e7dcc9] hover:bg-white/5 hover:text-white"
            >
              <EyeOff className="size-4" />
              <span className="hidden sm:inline">全画面表示</span>
            </Button>
            <span className="rounded-lg border border-[#504633] px-3 py-2 text-sm text-[#cdbd9f]">
              {page} / {total}
            </span>
          </div>
        </header>
      )}

      {/* 拡大中ガイドバッジ */}
      {zoom > 100 && (
        <div className="pointer-events-none absolute top-4 inset-x-0 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/75 px-4 py-1.5 text-xs font-semibold text-amber-200 shadow-xl backdrop-blur-md">
            <Move className="size-3.5 animate-pulse" />
            ドラッグまたはスクロールで紙面を自由に移動できます ({zoom}%)
          </div>
        </div>
      )}

      {/* ビューアーステージ */}
      <div
        className={`viewer-stage ${zoom > 100 ? (isPanning ? 'viewer-panning' : 'viewer-pannable') : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={handleDoubleClick}
      >
        <button
          aria-label="前のページ"
          disabled={page === 1 || Boolean(turnAnim)}
          onClick={(event) => { event.stopPropagation(); movePage(-1); }}
          className="viewer-edge-nav viewer-edge-prev"
        >
          <ChevronLeft /><span>前へ</span>
        </button>
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
                    ? `translate3d(${swipeOffset}px, 0, 0) rotateY(${swipeOffset / 18}deg)`
                    : undefined,
              transition: isPanning ? 'none' : 'transform 0.12s ease-out',
            }}
          >
            {turnAnim && <div className="book-turn-overlay" />}
            {menu.fileUrl ? (
              <PdfCanvas
                fileUrl={menu.fileUrl}
                page={page}
                onLoaded={setTotal}
              />
            ) : (
              <MockPdfPage menu={menu} page={page} />
            )}
          </div>
        </div>
        <button
          aria-label="次のページ"
          disabled={page === total || Boolean(turnAnim)}
          onClick={(event) => { event.stopPropagation(); movePage(1); }}
          className="viewer-edge-nav viewer-edge-next"
        >
          <span>次へ</span><ChevronRight />
        </button>
      </div>

      {chromeVisible && (
        <footer className="viewer-controls z-30">
          <Button
            disabled={page === 1 || Boolean(turnAnim)}
            onClick={() => movePage(-1)}
            className="viewer-nav"
          >
            <ChevronLeft />
            前のページを捲る
          </Button>

          <div className="flex items-center justify-center gap-2">
            <Button
              aria-label="縮小"
              variant="outline"
              onClick={() => setZoom((z) => Math.max(100, z - 20))}
              className="viewer-tool"
              title="PDFを縮小"
            >
              <Minus />
            </Button>
            <span className="w-14 text-center text-sm font-semibold text-[#cdbd9f]">
              {zoom}%
            </span>
            <Button
              aria-label="拡大"
              variant="outline"
              onClick={() => setZoom((z) => Math.min(260, z + 20))}
              className="viewer-tool"
              title="PDFを拡大"
            >
              <Plus />
            </Button>
            <Button
              aria-label="表示をリセット"
              variant="outline"
              onClick={() => {
                setZoom(100);
                setPan({ x: 0, y: 0 });
              }}
              className="viewer-tool"
              title="倍率と表示位置をリセット"
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>

          <Button
            disabled={page === total || Boolean(turnAnim)}
            onClick={() => movePage(1)}
            className="viewer-nav"
          >
            次のページを捲る
            <ChevronRight />
          </Button>
        </footer>
      )}
    </main>
  );
}

// ==========================================
// 実際のPDFレンダラー (PdfCanvas)
// ==========================================
function PdfCanvas({
  fileUrl,
  page,
  onLoaded,
}: {
  fileUrl: string;
  page: number;
  onLoaded: (pages: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined;
    let documentTask: { destroy: () => Promise<void> } | undefined;

    const render = async () => {
      try {
        setStatus('loading');
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '5.4.149'}/build/pdf.worker.min.mjs`;

        // Base64またはURLからArrayBufferを取得
        const bytes = new Uint8Array(await (await fetch(fileUrl)).arrayBuffer());
        const loadingTask = pdfjs.getDocument({
          data: bytes,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.149/cmaps/',
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        documentTask = pdf;
        if (cancelled) return;

        onLoaded(pdf.numPages);
        const pdfPage = await pdf.getPage(Math.min(page, pdf.numPages));
        const viewport = pdfPage.getViewport({ scale: 2 });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof Error && error.name === 'RenderingCancelledException')
        ) {
          setStatus('error');
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void documentTask?.destroy();
    };
  }, [fileUrl, page, onLoaded]);

  return (
    <div className="pdf-canvas-wrap">
      <canvas
        ref={canvasRef}
        className={`pdf-canvas ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: 'min(78vh, 880px)' }}
      />
      {status === 'loading' && <p className="pdf-status">PDFを表示しています...</p>}
      {status === 'error' && <p className="pdf-status">PDFを表示できませんでした</p>}
    </div>
  );
}

// ==========================================
// モック用ダミー画面 (MockPdfPage)
// ==========================================
function MockPdfPage({
  menu,
  page,
}: {
  menu: MenuPdf;
  page: number;
}) {
  const content =
    page === 1
      ? [
          { name: 'ドン ペリニヨン ヴィンテージ', en: 'Dom Pérignon Vintage', price: '¥85,000' },
          { name: 'クリュッグ グランド キュヴェ', en: 'Krug Grande Cuvée', price: '¥98,000' },
          { name: 'アルマン・ド・ブリニャック', en: 'Armand de Brignac Gold', price: '¥160,000' },
          { name: 'ペリエ ジュエ ベル エポック', en: 'Perrier-Jouët Belle Epoque', price: '¥78,000' },
        ]
      : [
          { name: 'オーパス・ワン 2019', en: 'Opus One Napa Valley', price: '¥145,000' },
          { name: 'シャトー・マルゴー 2017', en: 'Château Margaux Premier Grand Cru', price: '¥220,000' },
          { name: 'ケンゾー エステイト 紫鈴 rindo', en: 'KENZO ESTATE rindo', price: '¥55,000' },
          { name: 'サッシカイア 2020', en: 'Sassicaia Bolgheri', price: '¥88,000' },
        ];

  return (
    <div className="mock-paper">
      <div className="paper-frame">
        <p className="paper-tag">PREMIUM SELECTION</p>
        <h3 className="paper-title">{shortTitle(menu.title)}</h3>
        <p className="paper-sub">PAGE {page} / 2</p>

        <div className="paper-grid">
          {content.map((item) => (
            <div key={item.name} className="paper-item">
              <div>
                <p className="paper-name">{item.name}</p>
                <p className="paper-en">{item.en}</p>
              </div>
              <p className="paper-price">{item.price}</p>
            </div>
          ))}
        </div>

        <footer className="paper-footer">INSOU RESTAURANT GROUP</footer>
      </div>
    </div>
  );
}
