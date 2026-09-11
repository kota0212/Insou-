import { getSupabaseBrowserClient } from './supabase/client';
import {
  getCachedPdf,
  removeCachedPdf,
  removeCachedPdfsExcept,
  storeCachedPdf,
} from './pdf-cache';

const PDF_BUCKET = 'menu-pdfs';
const pdfMemoryCache = new Map<string, Blob>();
type SyncMenu = Pick<SupabaseMenu, 'id' | 'updatedAt' | 'storagePath'>;

export interface SupabaseStore {
  id: string;
  code: string;
  name: string;
  area: string;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
}

export interface SupabaseMenu {
  id: string;
  title: string;
  fileName?: string;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
  isPublished: boolean;
}

export interface SupabaseInitData {
  stores: SupabaseStore[];
  menus: SupabaseMenu[];
}

type MenuRow = {
  id: string;
  title: string;
  file_name: string | null;
  storage_path: string;
  created_at: string;
  pdf_updated_at: string;
  updated_at: string;
  is_published: boolean;
  menu_store_assignments: Array<{ store_id: string }> | null;
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getCurrentSession() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  throwIfError(error);
  return data.session;
}

export async function signInStore(
  storeCode: string,
  password: string,
): Promise<void> {
  const normalizedCode = storeCode.trim().toLowerCase();
  const email = `${normalizedCode}@stores.insou.internal`;
  const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email,
    password,
  });
  throwIfError(error);
}

export async function signInAdmin(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  throwIfError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.signOut();
  throwIfError(error);
}

export async function fetchSupabaseInitData(): Promise<SupabaseInitData> {
  const client = getSupabaseBrowserClient();
  const [storesResult, menusResult] = await Promise.all([
    client
      .from('stores')
      .select('id, code, name, area, password_updated_at, last_login_at')
      .order('code'),
    client
      .from('menus')
      .select(
        'id, title, file_name, storage_path, created_at, pdf_updated_at, updated_at, is_published, menu_store_assignments(store_id)',
      )
      .eq('is_published', true)
      .order('updated_at', { ascending: false }),
  ]);
  throwIfError(storesResult.error);
  throwIfError(menusResult.error);

  const stores = (storesResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    area: row.area,
    passwordUpdatedAt: row.password_updated_at ?? undefined,
    lastLoginAt: row.last_login_at ?? undefined,
  }));
  const menus = ((menusResult.data ?? []) as MenuRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    fileName: row.file_name ?? undefined,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.pdf_updated_at,
    storeIds: (row.menu_store_assignments ?? []).map((item) => item.store_id),
    isPublished: row.is_published,
  }));
  return { stores, menus };
}

export async function recordStoreLogin(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('record_store_login');
  throwIfError(error);
}

function isPdfBlob(blob: Blob): Promise<boolean> {
  return blob
    .slice(0, 5)
    .text()
    .then((header) => header === '%PDF-');
}

export async function fetchSupabaseMenuPdf(
  menu: Pick<SupabaseMenu, 'id' | 'updatedAt' | 'storagePath'>,
  forceRefresh = false,
): Promise<Blob> {
  const key = `${menu.id}:${menu.updatedAt}`;
  if (!forceRefresh) {
    const memory = pdfMemoryCache.get(key);
    if (memory) return memory;
    const cached = await getCachedPdf(menu.id, menu.updatedAt);
    if (cached && (await isPdfBlob(cached))) {
      pdfMemoryCache.set(key, cached);
      return cached;
    }
  }

  if (forceRefresh) await removeCachedPdf(menu.id);
  const { data, error } = await getSupabaseBrowserClient()
    .storage.from(PDF_BUCKET)
    .download(menu.storagePath);
  throwIfError(error);
  if (!data || !(await isPdfBlob(data))) {
    throw new Error('取得したファイルは有効なPDFではありません');
  }
  await storeCachedPdf(menu.id, menu.updatedAt, data);
  pdfMemoryCache.set(key, data);
  return data;
}

export async function getMenuSyncPlan(menus: SyncMenu[]): Promise<{
  cached: Map<string, Blob>;
  pending: SyncMenu[];
}> {
  const cached = new Map<string, Blob>();
  const pending: SyncMenu[] = [];
  for (const menu of menus) {
    const blob = await getCachedPdf(menu.id, menu.updatedAt);
    if (blob && (await isPdfBlob(blob))) cached.set(menu.id, blob);
    else pending.push(menu);
  }
  await removeCachedPdfsExcept(menus.map((menu) => menu.id));
  return { cached, pending };
}

export async function syncMenuPdfs(
  pending: SyncMenu[],
  onProgress: (complete: number, total: number) => void,
): Promise<Map<string, Blob>> {
  const result = new Map<string, Blob>();
  onProgress(0, pending.length);
  for (let index = 0; index < pending.length; index += 1) {
    const menu = pending[index];
    result.set(menu.id, await fetchSupabaseMenuPdf(menu));
    onProgress(index + 1, pending.length);
  }
  return result;
}

export async function createSupabaseMenu(params: {
  title: string;
  storeIds: string[];
  fileName: string;
  pdfFile: Blob;
}): Promise<SupabaseMenu> {
  const client = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const storagePath = `${id}/${crypto.randomUUID()}.pdf`;
  const blob = params.pdfFile;
  const upload = await client.storage
    .from(PDF_BUCKET)
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: false,
    });
  throwIfError(upload.error);

  const inserted = await client
    .from('menus')
    .insert({
      id,
      title: params.title,
      file_name: params.fileName,
      storage_path: storagePath,
      is_published: true,
    })
    .select(
      'id, title, file_name, storage_path, created_at, pdf_updated_at, is_published',
    )
    .single();
  if (inserted.error) {
    await client.storage.from(PDF_BUCKET).remove([storagePath]);
    throwIfError(inserted.error);
  }
  if (!inserted.data)
    throw new Error('メニューの登録結果を取得できませんでした');
  const assignments = await client
    .from('menu_store_assignments')
    .insert(
      params.storeIds.map((storeId) => ({ menu_id: id, store_id: storeId })),
    );
  throwIfError(assignments.error);
  await storeCachedPdf(id, inserted.data.pdf_updated_at, blob);
  return {
    id,
    title: inserted.data.title,
    fileName: inserted.data.file_name ?? undefined,
    storagePath,
    createdAt: inserted.data.created_at,
    updatedAt: inserted.data.pdf_updated_at,
    storeIds: params.storeIds,
    isPublished: true,
  };
}

export async function updateSupabaseMenu(params: {
  id: string;
  title: string;
  storeIds: string[];
  fileName?: string;
  pdfFile?: Blob;
}): Promise<SupabaseMenu> {
  const client = getSupabaseBrowserClient();
  const current = await client
    .from('menus')
    .select('storage_path, file_name, created_at')
    .eq('id', params.id)
    .single();
  throwIfError(current.error);
  if (!current.data) throw new Error('更新対象のメニューが見つかりません');

  let storagePath = current.data.storage_path;
  let blob: Blob | undefined;
  if (params.pdfFile) {
    blob = params.pdfFile;
    const nextPath = `${params.id}/${crypto.randomUUID()}.pdf`;
    const upload = await client.storage
      .from(PDF_BUCKET)
      .upload(nextPath, blob, { contentType: 'application/pdf' });
    throwIfError(upload.error);
    storagePath = nextPath;
  }

  const pdfUpdatedAt = blob ? new Date().toISOString() : undefined;
  const updated = await client
    .from('menus')
    .update({
      title: params.title,
      file_name: params.fileName ?? current.data.file_name,
      storage_path: storagePath,
      ...(pdfUpdatedAt ? { pdf_updated_at: pdfUpdatedAt } : {}),
    })
    .eq('id', params.id)
    .select(
      'id, title, file_name, storage_path, created_at, pdf_updated_at, is_published',
    )
    .single();
  throwIfError(updated.error);
  if (!updated.data)
    throw new Error('メニューの更新結果を取得できませんでした');
  const deletedAssignments = await client
    .from('menu_store_assignments')
    .delete()
    .eq('menu_id', params.id);
  throwIfError(deletedAssignments.error);
  const assignments = await client.from('menu_store_assignments').insert(
    params.storeIds.map((storeId) => ({
      menu_id: params.id,
      store_id: storeId,
    })),
  );
  throwIfError(assignments.error);

  if (blob) {
    await storeCachedPdf(params.id, updated.data.pdf_updated_at, blob);
    await client.storage.from(PDF_BUCKET).remove([current.data.storage_path]);
  }
  return {
    id: updated.data.id,
    title: updated.data.title,
    fileName: updated.data.file_name ?? undefined,
    storagePath: updated.data.storage_path,
    createdAt: updated.data.created_at,
    updatedAt: updated.data.pdf_updated_at,
    storeIds: params.storeIds,
    isPublished: updated.data.is_published,
  };
}

export async function deleteSupabaseMenu(menuId: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  const current = await client
    .from('menus')
    .select('storage_path')
    .eq('id', menuId)
    .single();
  throwIfError(current.error);
  if (!current.data) throw new Error('削除対象のメニューが見つかりません');
  const deleted = await client.from('menus').delete().eq('id', menuId);
  throwIfError(deleted.error);
  await client.storage.from(PDF_BUCKET).remove([current.data.storage_path]);
  await removeCachedPdf(menuId);
}

export async function createSupabaseStore(params: {
  id?: string;
  code: string;
  name: string;
  area: string;
}): Promise<SupabaseStore> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('stores')
    .insert({
      id: params.id,
      code: params.code,
      name: params.name,
      area: params.area,
    })
    .select('id, code, name, area, password_updated_at, last_login_at')
    .single();
  throwIfError(error);
  if (!data) throw new Error('店舗の登録結果を取得できませんでした');
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    area: data.area,
    passwordUpdatedAt: data.password_updated_at ?? undefined,
    lastLoginAt: data.last_login_at ?? undefined,
  };
}

export async function updateSupabaseStore(params: {
  id: string;
  name: string;
  area: string;
}): Promise<SupabaseStore> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('stores')
    .update({ name: params.name, area: params.area })
    .eq('id', params.id)
    .select('id, code, name, area, password_updated_at, last_login_at')
    .single();
  throwIfError(error);
  if (!data) throw new Error('店舗の更新結果を取得できませんでした');
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    area: data.area,
    passwordUpdatedAt: data.password_updated_at ?? undefined,
    lastLoginAt: data.last_login_at ?? undefined,
  };
}

export async function deleteSupabaseStore(storeId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('stores')
    .delete()
    .eq('id', storeId);
  throwIfError(error);
}
