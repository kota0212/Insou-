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
}

export interface GasMenu {
  id: string;
  title: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
  fileUrl?: string; // クライアント側で取得・キャッシュしたPDFデータURL
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
const pdfCache = new Map<string, string>();

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
async function gasGetRequest<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const baseUrl = getGasWebAppUrl();
  if (!baseUrl) {
    throw new Error('Google Apps Script の Web App URL (NEXT_PUBLIC_GAS_WEB_APP_URL) が設定されていません。');
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
async function gasPostRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const baseUrl = getGasWebAppUrl();
  if (!baseUrl) {
    throw new Error('Google Apps Script の Web App URL (NEXT_PUBLIC_GAS_WEB_APP_URL) が設定されていません。');
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
export async function fetchGasMenuPdf(menuId: string): Promise<string> {
  if (pdfCache.has(menuId)) {
    return pdfCache.get(menuId)!;
  }

  const res = await gasGetRequest<GasPdfResponse>('getPdf', { menuId });
  if (!res.dataUrl) {
    throw new Error('PDFデータの取得に失敗しました');
  }

  pdfCache.set(menuId, res.dataUrl);
  return res.dataUrl;
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
    pdfCache.set(created.id, params.pdfBase64);
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
    pdfCache.set(updated.id, params.pdfBase64);
  }
  return updated;
}

/**
 * メニューの削除（Spreadsheet削除 + Driveファイルゴミ箱移動）
 */
export async function deleteGasMenu(menuId: string): Promise<void> {
  await gasPostRequest('deleteMenu', { id: menuId });
  pdfCache.delete(menuId);
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

/**
 * データベースの初期化（シード店舗データの作成）
 */
export async function initGasDatabase(): Promise<void> {
  await gasGetRequest('initDatabase');
}
