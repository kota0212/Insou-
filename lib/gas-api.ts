// 旧GAS版からの移行検証用にのみ残している互換コードです。
// 現行アプリのPDF配信・認証経路からは参照されません。
/**
 * Google Apps Script Web App API クライアント
 *
 * 【MVPセキュリティについての注意】
 * 本APIクライアントはMVPの業務フロー検証用です。
 * 認証はモック（ハリボテ認証）であり、本番運用に必要なセキュリティトークン・暗号化通信の
 * 厳密な検証基盤ではありません。
 */

export interface GasStore {
  id: string;
  code: string;
  name: string;
  area: string;
  passcode: string;
  passwordUpdatedAt: string;
  lastLoginAt: string;
}

export interface GasMenu {
  id: string;
  title: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
  fileUrl?: string; // 管理画面で選択中のPDFデータURL
}

export interface GasInitDataResponse {
  stores: GasStore[];
  menus: GasMenu[];
}

export interface GasPdfResponse {
  menuId: string;
  title: string;
  dataUrl: string;
}

interface GasEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// PDFデータのインメモリキャッシュ（セッション中の不要な再フェッチを防止）
const pdfCache = new Map<string, ArrayBuffer>();

function isPdfData(data: ArrayBuffer): boolean {
  if (data.byteLength < 5) return false;
  const header = new Uint8Array(data, 0, 5);
  return String.fromCharCode(...header) === '%PDF-';
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('PDFデータの形式が不正です');
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const binary = metadata.includes(';base64')
    ? atob(payload)
    : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

// MVP用に公開したGAS Web App。公開URLであり秘密情報は含まない。
const DEFAULT_GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbyDCxSqXb2aLAWjT15lb6-Wt7l_hL2mzLpAHfu60zQ8p3zfzEZ9FQOdBSVbWz2YHy3z/exec';

/**
 * GAS Web App URL を取得
 */
export function getGasWebAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_GAS_WEB_APP_URL || DEFAULT_GAS_WEB_APP_URL
  ).trim();
}

/**
 * GAS Web App URL が設定されているかどうかを確認
 */
export function isGasConfigured(): boolean {
  const url = getGasWebAppUrl();
  return Boolean(url && url.startsWith('http'));
}

/**
 * 共通 GET リクエスト実行関数
 */
async function gasGetRequest<T>(
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const baseUrl = getGasWebAppUrl();
  if (!baseUrl) {
    throw new Error(
      'Google Apps Script の Web App URL (NEXT_PUBLIC_GAS_WEB_APP_URL) が設定されていません。',
    );
  }

  const url = new URL(baseUrl);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`サーバー通信エラーが発生しました (HTTP ${res.status})`);
    }

    const json = (await res.json()) as GasEnvelope<T>;
    if (!json.success) {
      throw new Error(json.error || 'API処理でエラーが発生しました');
    }

    if (json.data === undefined) {
      throw new Error('GAS APIのレスポンスにdataが含まれていません');
    }
    return json.data;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('GAS APIとの通信中に予期せぬエラーが発生しました');
  }
}

/**
 * 共通 POST リクエスト実行関数
 * ※ GASのCORS制約を回避するため Content-Type: text/plain でJSON文字列を送信
 */
async function gasPostRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const baseUrl = getGasWebAppUrl();
  if (!baseUrl) {
    throw new Error(
      'Google Apps Script の Web App URL (NEXT_PUBLIC_GAS_WEB_APP_URL) が設定されていません。',
    );
  }

  const bodyData = {
    action,
    ...payload,
  };

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyData),
    });

    if (!res.ok) {
      throw new Error(`サーバー通信エラーが発生しました (HTTP ${res.status})`);
    }

    const json = (await res.json()) as GasEnvelope<T>;
    if (!json.success) {
      throw new Error(json.error || 'API処理でエラーが発生しました');
    }

    if (json.data === undefined) {
      // 削除系APIは成功時にdataを返さないため、void型として扱える。
      return undefined as T;
    }
    return json.data;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('GAS APIへのデータ送信中に予期せぬエラーが発生しました');
  }
}

/**
 * 初期化データ（店舗一覧 + メニュー一覧）を一括取得
 */
export async function fetchGasInitData(): Promise<GasInitDataResponse> {
  return await gasGetRequest<GasInitDataResponse>('getInitData');
}

/**
 * 指定メニューのPDFバイナリ（Base64形式）を取得
 * Drive File ID は隠蔽され、menuId を指定してGAS経由で取得します。
 */
export async function fetchGasMenuPdf(
  menuId: string,
  updatedAt: string,
  forceRefresh = false,
): Promise<ArrayBuffer> {
  const cacheKey = `${menuId}:${updatedAt}`;
  if (!forceRefresh && pdfCache.has(cacheKey)) {
    return pdfCache.get(cacheKey)!.slice(0);
  }

  if (forceRefresh) {
    pdfCache.delete(cacheKey);
    try {
      await removeCachedPdf(menuId);
    } catch (error) {
      console.warn('IndexedDBのPDFキャッシュを削除できませんでした:', error);
    }
  } else {
    try {
      const cachedData = await getCachedPdf(menuId, updatedAt);
      const cachedBuffer = cachedData ? await cachedData.arrayBuffer() : null;
      if (cachedBuffer && isPdfData(cachedBuffer)) {
        pdfCache.set(cacheKey, cachedBuffer);
        return cachedBuffer.slice(0);
      }
      if (cachedData) await removeCachedPdf(menuId);
    } catch (error) {
      console.warn('IndexedDBのPDFキャッシュを読み込めませんでした:', error);
    }
  }

  const res = await gasGetRequest<GasPdfResponse>('getPdf', { menuId });
  if (!res.dataUrl) {
    throw new Error('PDFデータの取得に失敗しました');
  }

  const pdfData = dataUrlToArrayBuffer(res.dataUrl);
  if (!isPdfData(pdfData)) {
    throw new Error('取得したファイルは有効なPDFではありません');
  }
  try {
    await storeCachedPdf(
      menuId,
      updatedAt,
      new Blob([pdfData], { type: 'application/pdf' }),
    );
  } catch (error) {
    console.warn('PDFをIndexedDBへ保存できませんでした:', error);
  }
  pdfCache.set(cacheKey, pdfData);
  return pdfData.slice(0);
}

/**
 * 新規メニューの登録（Drive保存 + Spreadsheet記録）
 */
export async function createGasMenu(params: {
  title: string;
  storeIds: string[];
  fileName: string;
  pdfBase64: string;
}): Promise<GasMenu> {
  const created = await gasPostRequest<GasMenu>('createMenu', params);
  if (params.pdfBase64) {
    const data = dataUrlToArrayBuffer(params.pdfBase64);
    try {
      await storeCachedPdf(
        created.id,
        created.updatedAt,
        new Blob([data], { type: 'application/pdf' }),
      );
    } catch (error) {
      console.warn('PDFをIndexedDBへ保存できませんでした:', error);
    }
    pdfCache.set(`${created.id}:${created.updatedAt}`, data);
  }
  return created;
}

/**
 * 既存メニューの更新（名称・店舗割当・PDFファイル再アップロード）
 */
export async function updateGasMenu(params: {
  id: string;
  title: string;
  storeIds: string[];
  fileName?: string;
  pdfBase64?: string;
}): Promise<GasMenu> {
  const updated = await gasPostRequest<GasMenu>('updateMenu', params);
  if (params.pdfBase64) {
    const data = dataUrlToArrayBuffer(params.pdfBase64);
    try {
      await storeCachedPdf(
        updated.id,
        updated.updatedAt,
        new Blob([data], { type: 'application/pdf' }),
      );
    } catch (error) {
      console.warn('PDFをIndexedDBへ保存できませんでした:', error);
    }
    pdfCache.set(`${updated.id}:${updated.updatedAt}`, data);
  }
  return updated;
}

/**
 * メニューの削除（Spreadsheet削除 + Driveファイルゴミ箱移動）
 */
export async function deleteGasMenu(menuId: string): Promise<void> {
  await gasPostRequest('deleteMenu', { id: menuId });
  for (const key of pdfCache.keys()) {
    if (key.startsWith(`${menuId}:`)) pdfCache.delete(key);
  }
  try {
    await removeCachedPdf(menuId);
  } catch (error) {
    console.warn('IndexedDBのPDFキャッシュを削除できませんでした:', error);
  }
}

/**
 * 店舗の新規作成
 */
export async function createGasStore(params: {
  id?: string;
  code: string;
  name: string;
  area: string;
}): Promise<GasStore> {
  return await gasPostRequest<GasStore>('createStore', params);
}

/**
 * 店舗の削除
 */
export async function deleteGasStore(storeId: string): Promise<void> {
  await gasPostRequest('deleteStore', { id: storeId });
}

/** MVP店舗ログインを記録し、管理画面の最終ログイン日時へ反映する。 */
export async function recordGasStoreLogin(
  storeId: string,
  passcode: string,
): Promise<void> {
  const baseUrl = getGasWebAppUrl();
  if (!baseUrl) return;

  // GASはPOST処理後にgoogleusercontent.comへリダイレクトする。
  // Safariはその応答をCORS/404エラーとして扱うことがあるため、
  // MVPのログイン日時記録は送信完了だけを確認し、応答本文は読まない。
  await fetch(baseUrl, {
    method: 'POST',
    mode: 'no-cors',
    keepalive: true,
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'recordStoreLogin',
      storeId,
      passcode,
    }),
  });
}

/**
 * データベースの初期化（シード店舗データの作成）
 */
export async function initGasDatabase(): Promise<void> {
  await gasGetRequest('initDatabase');
}
import { getCachedPdf, removeCachedPdf, storeCachedPdf } from './pdf-cache';
