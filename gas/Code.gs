/**
 * INSOU メニュー閲覧システム MVP - Google Apps Script (GAS) バックエンド
 *
 * 【重要: MVPセキュリティについての注意】
 * 本スクリプトはMVPの業務フロー検証用です。
 * 本格的な認証基盤（JWT、セッション検証、Row Level Security、暗号化など）は
 * 意図的に省かれた「ハリボテ認証」を前提としています。
 * 本番運用時は production-spec.md に基づくセキュアな設計へ移行してください。
 */

// ==========================================
// 設定・定数
// ==========================================
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

// スクリプトプロパティのキー名
const PROP_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID', // 連携スプレッドシートID（未設定時は新規作成）
  PDF_FOLDER_ID: 'PDF_FOLDER_ID', // PDF保存先Google DriveフォルダID（未設定時は自動作成）
};

// シート名
const SHEET_NAMES = {
  STORES: 'stores',
  MENUS: 'menus',
  MENU_STORES: 'menu_stores',
};

// PDFファイル許容最大サイズ (20MB)
const MAX_PDF_BYTES = 20 * 1024 * 1024;

// ==========================================
// Web App エントリーポイント (doGet / doPost)
// ==========================================

/**
 * HTTP GET リクエストハンドラ
 */
function doGet(e) {
  try {
    // GASエディタ上で引数なし実行した場合は、初回セットアップを行う。
    // WebアプリからのHTTP GETにはイベントオブジェクトが渡るため影響しない。
    if (!e) {
      return setupMvpResources();
    }
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || 'ping';

    switch (action) {
      case 'ping':
        return createJsonResponse({
          success: true,
          message: 'INSOU Menu GAS API is running',
          timestamp: new Date().toISOString(),
        });

      case 'getInitData':
        return handleGetInitData();

      case 'getStores':
        return handleGetStores();

      case 'getMenus':
        return handleGetMenus();

      case 'getPdf':
        return handleGetPdf(params.menuId);

      case 'initDatabase':
        return handleInitDatabase();

      default:
        return createErrorResponse(`未対応のGETアクションです: ${action}`, 400);
    }
  } catch (error) {
    return createErrorResponse(error.message || String(error), 500);
  }
}

/**
 * HTTP POST リクエストハンドラ
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createErrorResponse('リクエストボディが空です', 400);
    }

    let payload = {};
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createErrorResponse(
        'JSONのパースに失敗しました: ' + parseErr.message,
        400,
      );
    }

    const action = payload.action;
    if (!action) {
      return createErrorResponse(
        'アクション (action) が指定されていません',
        400,
      );
    }

    switch (action) {
      case 'createMenu':
        return handleCreateMenu(payload);

      case 'updateMenu':
        return handleUpdateMenu(payload);

      case 'deleteMenu':
        return handleDeleteMenu(payload);

      case 'createStore':
        return handleCreateStore(payload);

      case 'deleteStore':
        return handleDeleteStore(payload);

      case 'initDatabase':
        return handleInitDatabase();

      default:
        return createErrorResponse(
          `未対応のPOSTアクションです: ${action}`,
          400,
        );
    }
  } catch (error) {
    return createErrorResponse(error.message || String(error), 500);
  }
}

// ==========================================
// レスポンスヘルパー
// ==========================================

function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function createErrorResponse(errorMessage, statusCode = 400) {
  const output = ContentService.createTextOutput(
    JSON.stringify({
      success: false,
      error: errorMessage,
      statusCode: statusCode,
    }),
  );
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ==========================================
// スプレッドシート & Google Drive ヘルパー
// ==========================================

/**
 * 対象のスプレッドシートを取得
 */
function getSpreadsheet() {
  const customId = SCRIPT_PROPS.getProperty(PROP_KEYS.SPREADSHEET_ID);
  if (customId) {
    return SpreadsheetApp.openById(customId);
  }
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (_) {}

  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyyMMdd_HHmmss',
  );
  const spreadsheet = SpreadsheetApp.create(
    'INSOU_Menu_Master_MVP_' + timestamp,
  );
  SCRIPT_PROPS.setProperty(PROP_KEYS.SPREADSHEET_ID, spreadsheet.getId());
  Logger.log(
    'MVP用スプレッドシートを新規作成しました: ' + spreadsheet.getUrl(),
  );
  return spreadsheet;
}

/**
 * 指定名のシートを取得（存在しない場合は初期化して作成）
 */
function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeSheetHeader(sheet, sheetName);
  }
  return sheet;
}

/**
 * シートごとのヘッダー行を初期化
 */
function initializeSheetHeader(sheet, sheetName) {
  switch (sheetName) {
    case SHEET_NAMES.STORES:
      sheet.appendRow(['id', 'code', 'name', 'area', 'createdAt', 'updatedAt']);
      break;
    case SHEET_NAMES.MENUS:
      sheet.appendRow([
        'id',
        'title',
        'driveFileId',
        'fileName',
        'fileSize',
        'createdAt',
        'updatedAt',
      ]);
      break;
    case SHEET_NAMES.MENU_STORES:
      sheet.appendRow(['menuId', 'storeId', 'createdAt']);
      break;
  }
}

/**
 * MVP専用のPDF保存フォルダを新規作成する。
 * 同名フォルダを検索・再利用せず、既存フォルダや既存PDFには触れない。
 * GASエディタからこの関数を手動実行した場合も、常に新しい保存先へ切り替わる。
 */
function createNewPdfStorageFolder() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyyMMdd_HHmmss',
  );
  const folderName = 'INSOU_Menu_PDFs_MVP_' + timestamp;
  const folder = DriveApp.createFolder(folderName);
  SCRIPT_PROPS.setProperty(PROP_KEYS.PDF_FOLDER_ID, folder.getId());

  Logger.log('PDF保存用フォルダを新規作成しました: ' + folder.getUrl());
  return {
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl(),
  };
}

/**
 * 現在設定されているPDF保存用Google Driveフォルダを取得する。
 * 未設定または参照不能の場合は、MVP専用フォルダを新規作成する。
 */
function getPdfFolder() {
  const folderId = SCRIPT_PROPS.getProperty(PROP_KEYS.PDF_FOLDER_ID);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log(
        '設定済みフォルダを参照できないため、新しい保存先を作成します: ' +
          e.message,
      );
    }
  }

  const created = createNewPdfStorageFolder();
  return DriveApp.getFolderById(created.id);
}

// ==========================================
// ビジネスロジック: データ取得
// ==========================================

/**
 * 初期化データ（店舗一覧 + メニュー一覧 + 紐付け）を一括返却
 */
function handleGetInitData() {
  const stores = getAllStores();
  const menus = getAllMenus();

  return createJsonResponse({
    success: true,
    data: {
      stores: stores,
      menus: menus, // driveFileId は除外された安全なオブジェクト配列
    },
  });
}

function handleGetStores() {
  return createJsonResponse({
    success: true,
    data: getAllStores(),
  });
}

function handleGetMenus() {
  return createJsonResponse({
    success: true,
    data: getAllMenus(),
  });
}

/**
 * 全店舗リストを取得
 */
function getAllStores() {
  const sheet = getOrCreateSheet(SHEET_NAMES.STORES);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headers = rows[0];
  const idIdx = headers.indexOf('id');
  const codeIdx = headers.indexOf('code');
  const nameIdx = headers.indexOf('name');
  const areaIdx = headers.indexOf('area');

  const stores = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[idIdx]) continue;
    stores.push({
      id: String(row[idIdx]),
      code: String(row[codeIdx] || ''),
      name: String(row[nameIdx] || ''),
      area: String(row[areaIdx] || '大阪'),
    });
  }
  return stores;
}

/**
 * 全メニューリストを取得（紐づく storeIds も集約）
 * ※ Drive File ID や Drive URL はクライアントへ露出させない
 */
function getAllMenus() {
  const menuSheet = getOrCreateSheet(SHEET_NAMES.MENUS);
  const menuRows = menuSheet.getDataRange().getValues();
  if (menuRows.length <= 1) return [];

  // メニュー・店舗紐付けマップを作成
  const storeMap = getMenuStoreMapping();

  const headers = menuRows[0];
  const idIdx = headers.indexOf('id');
  const titleIdx = headers.indexOf('title');
  const fileNameIdx = headers.indexOf('fileName');
  const createdAtIdx = headers.indexOf('createdAt');
  const updatedAtIdx = headers.indexOf('updatedAt');

  const menus = [];
  for (let i = 1; i < menuRows.length; i++) {
    const row = menuRows[i];
    const id = String(row[idIdx]);
    if (!id) continue;

    menus.push({
      id: id,
      title: String(row[titleIdx] || ''),
      fileName: String(row[fileNameIdx] || ''),
      createdAt: formatDateValue(row[createdAtIdx]),
      updatedAt: formatDateValue(row[updatedAtIdx]),
      storeIds: storeMap[id] || [], // 複数店舗への割当に対応
      // driveFileId は含めない（要件: DriveファイルIDを直接露出しない）
    });
  }

  return menus;
}

/**
 * menuId と storeIds の紐付けを取得
 */
function getMenuStoreMapping() {
  const sheet = getOrCreateSheet(SHEET_NAMES.MENU_STORES);
  const rows = sheet.getDataRange().getValues();
  const mapping = {};
  if (rows.length <= 1) return mapping;

  const headers = rows[0];
  const menuIdIdx = headers.indexOf('menuId');
  const storeIdIdx = headers.indexOf('storeId');

  for (let i = 1; i < rows.length; i++) {
    const menuId = String(rows[i][menuIdIdx]);
    const storeId = String(rows[i][storeIdIdx]);
    if (!menuId || !storeId) continue;
    if (!mapping[menuId]) {
      mapping[menuId] = [];
    }
    if (!mapping[menuId].includes(storeId)) {
      mapping[menuId].push(storeId);
    }
  }
  return mapping;
}

function formatDateValue(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) {
    return Utilities.formatDate(
      val,
      Session.getScriptTimeZone() || 'Asia/Tokyo',
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
  }
  return String(val);
}

/**
 * PDFバイナリを取得（Base64形式）
 * クライアントにDrive URLやDrive File IDを露出させず、menuIdから安全にPDFデータを引き渡す
 */
function handleGetPdf(menuId) {
  if (!menuId) {
    return createErrorResponse('menuId が指定されていません', 400);
  }

  const menuSheet = getOrCreateSheet(SHEET_NAMES.MENUS);
  const rows = menuSheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return createErrorResponse('メニューが見つかりません', 404);
  }

  const headers = rows[0];
  const idIdx = headers.indexOf('id');
  const driveFileIdIdx = headers.indexOf('driveFileId');
  const titleIdx = headers.indexOf('title');

  let driveFileId = null;
  let title = '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(menuId)) {
      driveFileId = String(rows[i][driveFileIdIdx]);
      title = String(rows[i][titleIdx]);
      break;
    }
  }

  if (!driveFileId) {
    return createErrorResponse(
      `指定されたメニューID (${menuId}) のPDFファイルが見つかりません`,
      404,
    );
  }

  try {
    const file = DriveApp.getFileById(driveFileId);
    const blob = file.getBlob();
    const contentType = blob.getContentType();

    // MIMEタイプ検証
    if (contentType !== 'application/pdf') {
      return createErrorResponse(
        '保存されているファイルは有効なPDFではありません',
        500,
      );
    }

    const base64Data = Utilities.base64Encode(blob.getBytes());
    const dataUrl = 'data:application/pdf;base64,' + base64Data;

    return createJsonResponse({
      success: true,
      data: {
        menuId: menuId,
        title: title,
        dataUrl: dataUrl,
      },
    });
  } catch (err) {
    return createErrorResponse(
      `Google DriveからのPDF読み込みに失敗しました: ${err.message}`,
      500,
    );
  }
}

// ==========================================
// ビジネスロジック: メニュー登録・更新・削除
// ==========================================

/**
 * 新規メニュー登録
 */
function handleCreateMenu(payload) {
  const title = (payload.title || '').trim();
  const storeIds = Array.isArray(payload.storeIds) ? payload.storeIds : [];
  const fileName = (payload.fileName || 'menu.pdf').trim();
  const pdfBase64 = payload.pdfBase64;

  // 入力検証
  if (!title) {
    return createErrorResponse('メニュータイトルを入力してください', 400);
  }
  if (!storeIds || storeIds.length === 0) {
    return createErrorResponse(
      '公開対象の店舗を少なくとも1店舗選択してください',
      400,
    );
  }
  if (!pdfBase64) {
    return createErrorResponse('PDFファイルが指定されていません', 400);
  }

  // PDF MIME & サイズ検証
  const validation = validateAndExtractPdf(pdfBase64, fileName);
  if (!validation.success) {
    return createErrorResponse(validation.error, 400);
  }

  const folder = getPdfFolder();
  const file = folder.createFile(validation.blob);
  const driveFileId = file.getId();
  const fileSize = file.getSize();

  const menuId = 'menu-' + Utilities.getUuid().slice(0, 8);
  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    "yyyy-MM-dd'T'HH:mm:ssXXX",
  );

  // メニューシートへ追加
  const menuSheet = getOrCreateSheet(SHEET_NAMES.MENUS);
  menuSheet.appendRow([
    menuId,
    title,
    driveFileId,
    fileName,
    fileSize,
    now,
    now,
  ]);

  // 店舗割当シートへ追加（1店舗1メニュー制限撤廃: 複数店舗をそのまま登録）
  saveMenuStoreAssignments(menuId, storeIds);

  return createJsonResponse({
    success: true,
    data: {
      id: menuId,
      title: title,
      fileName: fileName,
      createdAt: now,
      updatedAt: now,
      storeIds: storeIds,
    },
  });
}

/**
 * メニュー更新
 */
function handleUpdateMenu(payload) {
  const menuId = payload.id;
  const title = (payload.title || '').trim();
  const storeIds = Array.isArray(payload.storeIds) ? payload.storeIds : [];
  const pdfBase64 = payload.pdfBase64;
  const fileName = payload.fileName;

  if (!menuId) {
    return createErrorResponse('メニューIDが指定されていません', 400);
  }
  if (!title) {
    return createErrorResponse('メニュータイトルを入力してください', 400);
  }
  if (!storeIds || storeIds.length === 0) {
    return createErrorResponse(
      '公開対象の店舗を少なくとも1店舗選択してください',
      400,
    );
  }

  const menuSheet = getOrCreateSheet(SHEET_NAMES.MENUS);
  const rows = menuSheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('id');
  const titleIdx = headers.indexOf('title');
  const driveFileIdIdx = headers.indexOf('driveFileId');
  const fileNameIdx = headers.indexOf('fileName');
  const fileSizeIdx = headers.indexOf('fileSize');
  const createdAtIdx = headers.indexOf('createdAt');
  const updatedAtIdx = headers.indexOf('updatedAt');

  let rowIndex = -1;
  let currentDriveId = '';
  let currentFileName = '';
  let createdAt = '';

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(menuId)) {
      rowIndex = i + 1; // 1-indexed for Sheet API
      currentDriveId = String(rows[i][driveFileIdIdx]);
      currentFileName = String(rows[i][fileNameIdx]);
      createdAt = formatDateValue(rows[i][createdAtIdx]);
      break;
    }
  }

  if (rowIndex === -1) {
    return createErrorResponse(
      `更新対象のメニュー (${menuId}) が見つかりません`,
      404,
    );
  }

  let finalDriveId = currentDriveId;
  let finalFileName = currentFileName;
  let finalFileSize = rows[rowIndex - 1][fileSizeIdx];

  // 新しいPDFがアップロードされている場合
  if (pdfBase64) {
    const validation = validateAndExtractPdf(
      pdfBase64,
      fileName || currentFileName || 'updated_menu.pdf',
    );
    if (!validation.success) {
      return createErrorResponse(validation.error, 400);
    }

    // 旧ファイルをゴミ箱へ
    if (currentDriveId) {
      try {
        DriveApp.getFileById(currentDriveId).setTrashed(true);
      } catch (trashErr) {
        Logger.log(
          '旧ファイルの削除（ゴミ箱移動）スキップ: ' + trashErr.message,
        );
      }
    }

    const folder = getPdfFolder();
    const newFile = folder.createFile(validation.blob);
    finalDriveId = newFile.getId();
    finalFileName = fileName || currentFileName;
    finalFileSize = newFile.getSize();
  }

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    "yyyy-MM-dd'T'HH:mm:ssXXX",
  );

  // スプレッドシート更新
  menuSheet.getRange(rowIndex, titleIdx + 1).setValue(title);
  menuSheet.getRange(rowIndex, driveFileIdIdx + 1).setValue(finalDriveId);
  menuSheet.getRange(rowIndex, fileNameIdx + 1).setValue(finalFileName);
  menuSheet.getRange(rowIndex, fileSizeIdx + 1).setValue(finalFileSize);
  menuSheet.getRange(rowIndex, updatedAtIdx + 1).setValue(today);

  // 店舗紐付け更新
  saveMenuStoreAssignments(menuId, storeIds);

  return createJsonResponse({
    success: true,
    data: {
      id: menuId,
      title: title,
      fileName: finalFileName,
      createdAt: createdAt || today,
      updatedAt: today,
      storeIds: storeIds,
    },
  });
}

/**
 * メニュー削除
 */
function handleDeleteMenu(payload) {
  const menuId = payload.id;
  if (!menuId) {
    return createErrorResponse('削除対象のメニューIDが指定されていません', 400);
  }

  const menuSheet = getOrCreateSheet(SHEET_NAMES.MENUS);
  const rows = menuSheet.getDataRange().getValues();
  const headers = rows[0];
  const idIdx = headers.indexOf('id');
  const driveFileIdIdx = headers.indexOf('driveFileId');

  let rowIndex = -1;
  let driveFileId = '';

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(menuId)) {
      rowIndex = i + 1;
      driveFileId = String(rows[i][driveFileIdIdx]);
      break;
    }
  }

  if (rowIndex === -1) {
    return createErrorResponse(
      `削除対象のメニュー (${menuId}) が見つかりません`,
      404,
    );
  }

  // スプレッドシートから行削除
  menuSheet.deleteRow(rowIndex);

  // Driveファイルをゴミ箱へ
  if (driveFileId) {
    try {
      DriveApp.getFileById(driveFileId).setTrashed(true);
    } catch (e) {
      Logger.log('Driveファイル削除失敗: ' + e.message);
    }
  }

  // 紐付けシートから削除
  removeMenuStoreAssignments(menuId);

  return createJsonResponse({
    success: true,
    message: `メニュー (${menuId}) を削除しました`,
  });
}

// ==========================================
// ビジネスロジック: 店舗管理
// ==========================================

function handleCreateStore(payload) {
  const name = (payload.name || '').trim();
  const code = (payload.code || '').trim().toUpperCase();
  const area = (payload.area || '大阪').trim();
  const id = payload.id || 'store-' + Date.now();

  if (!name) {
    return createErrorResponse('店舗名を入力してください', 400);
  }

  const sheet = getOrCreateSheet(SHEET_NAMES.STORES);
  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyy-MM-dd',
  );
  sheet.appendRow([id, code, name, area, now, now]);

  return createJsonResponse({
    success: true,
    data: {
      id: id,
      code: code,
      name: name,
      area: area,
    },
  });
}

function handleDeleteStore(payload) {
  const storeId = payload.id;
  if (!storeId) {
    return createErrorResponse('店舗IDが指定されていません', 400);
  }

  const sheet = getOrCreateSheet(SHEET_NAMES.STORES);
  const rows = sheet.getDataRange().getValues();
  const idIdx = rows[0].indexOf('id');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIdx]) === String(storeId)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  // 割当シートからも該当店舗を削除
  const assignSheet = getOrCreateSheet(SHEET_NAMES.MENU_STORES);
  const assignRows = assignSheet.getDataRange().getValues();
  const storeIdx = assignRows[0].indexOf('storeId');

  for (let i = assignRows.length - 1; i >= 1; i--) {
    if (String(assignRows[i][storeIdx]) === String(storeId)) {
      assignSheet.deleteRow(i + 1);
    }
  }

  return createJsonResponse({
    success: true,
    message: `店舗 (${storeId}) を削除しました`,
  });
}

// ==========================================
// 補助: 店舗割当の管理
// ==========================================

function saveMenuStoreAssignments(menuId, storeIds) {
  const sheet = getOrCreateSheet(SHEET_NAMES.MENU_STORES);
  const rows = sheet.getDataRange().getValues();
  const menuIdIdx = rows[0].indexOf('menuId');

  // 編集対象メニューの旧割当だけを削除し、他メニューの割当は維持する。
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][menuIdIdx]) === String(menuId)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 新規割当を追加
  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyy-MM-dd',
  );
  for (let i = 0; i < storeIds.length; i++) {
    sheet.appendRow([menuId, storeIds[i], now]);
  }
}

function removeMenuStoreAssignments(menuId) {
  const sheet = getOrCreateSheet(SHEET_NAMES.MENU_STORES);
  const rows = sheet.getDataRange().getValues();
  const menuIdIdx = rows[0].indexOf('menuId');

  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][menuIdIdx]) === String(menuId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ==========================================
// 補助: PDFバリデーション & Blob化
// ==========================================

function validateAndExtractPdf(base64String, fileName) {
  try {
    let cleanBase64 = base64String;
    let mimeType = 'application/pdf';

    // data:application/pdf;base64,... のプレフィックスを処理
    if (cleanBase64.indexOf(',') > -1) {
      const parts = cleanBase64.split(',');
      const meta = parts[0];
      cleanBase64 = parts[1];

      if (
        meta.indexOf('application/pdf') === -1 &&
        meta.indexOf('pdf') === -1
      ) {
        return {
          success: false,
          error: 'アップロードされたファイルはPDF形式ではありません',
        };
      }
    }

    const decodedBytes = Utilities.base64Decode(cleanBase64);

    // サイズチェック
    if (decodedBytes.length > MAX_PDF_BYTES) {
      return {
        success: false,
        error: `PDFファイルサイズが上限（${MAX_PDF_BYTES / (1024 * 1024)}MB）を超えています`,
      };
    }

    // PDFシグネチャ（%PDF-）検証: 先頭4バイトが 0x25, 0x50, 0x44, 0x46
    if (
      decodedBytes.length < 4 ||
      decodedBytes[0] !== 0x25 || // '%'
      decodedBytes[1] !== 0x50 || // 'P'
      decodedBytes[2] !== 0x44 || // 'D'
      decodedBytes[3] !== 0x46 // 'F'
    ) {
      return {
        success: false,
        error:
          '有効なPDFファイル構造ではありません (%PDF ヘッダが見つかりません)',
      };
    }

    const blob = Utilities.newBlob(
      decodedBytes,
      mimeType,
      fileName || 'menu.pdf',
    );
    return { success: true, blob: blob };
  } catch (err) {
    return {
      success: false,
      error: 'PDFのデコード・検証に失敗しました: ' + err.message,
    };
  }
}

// ==========================================
// データベース初期化（シードデータ投入）
// ==========================================

/**
 * 初期店舗・初期シートをセットアップする関数
 * GASエディタから手動実行、またはAPIから initDatabase アクションで実行可能
 */
function handleInitDatabase() {
  const ss = getSpreadsheet();

  // 1. 店舗シート
  let storeSheet = ss.getSheetByName(SHEET_NAMES.STORES);
  if (!storeSheet) {
    storeSheet = ss.insertSheet(SHEET_NAMES.STORES);
  } else {
    storeSheet.clear();
  }
  initializeSheetHeader(storeSheet, SHEET_NAMES.STORES);

  const initialStores = [
    ['kitashinchi-a', 'KS-01', '北新地A店', '大阪'],
    ['kitashinchi-b', 'KS-02', '北新地B店', '大阪'],
    ['minami-a', 'MN-01', 'ミナミA店', '大阪'],
    ['shinsaibashi', 'SB-01', '心斎橋店', '大阪'],
    ['kyoto-a', 'KT-01', '京都A店', '京都'],
    ['kyoto-b', 'KT-02', '京都B店', '京都'],
    ['kobe', 'KB-01', '神戸店', '神戸'],
    ['sannomiya', 'SN-01', '三宮店', '神戸'],
  ];

  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Tokyo',
    'yyyy-MM-dd',
  );
  initialStores.forEach((s) =>
    storeSheet.appendRow([s[0], s[1], s[2], s[3], now, now]),
  );

  // 2. メニューシート
  let menuSheet = ss.getSheetByName(SHEET_NAMES.MENUS);
  if (!menuSheet) {
    menuSheet = ss.insertSheet(SHEET_NAMES.MENUS);
  } else {
    menuSheet.clear();
  }
  initializeSheetHeader(menuSheet, SHEET_NAMES.MENUS);

  // 3. メニュー店舗割当シート
  let assignSheet = ss.getSheetByName(SHEET_NAMES.MENU_STORES);
  if (!assignSheet) {
    assignSheet = ss.insertSheet(SHEET_NAMES.MENU_STORES);
  } else {
    assignSheet.clear();
  }
  initializeSheetHeader(assignSheet, SHEET_NAMES.MENU_STORES);

  // PDF保存用フォルダの準備
  getPdfFolder();

  return createJsonResponse({
    success: true,
    message: 'データベースの初期化（初期店舗の作成等）が完了しました',
    storesCount: initialStores.length,
  });
}

/**
 * 初回セットアップ用。SpreadsheetとPDF保存フォルダを新規作成し、初期データを投入する。
 * 既存のGoogle DriveファイルやSpreadsheetは変更しない。
 */
function setupMvpResources() {
  // この新規GASプロジェクト専用のSpreadsheetを作成する。
  SCRIPT_PROPS.deleteProperty(PROP_KEYS.SPREADSHEET_ID);
  const spreadsheet = getSpreadsheet();

  // PDF保存先も必ず新しい空フォルダを作成する。
  const folder = createNewPdfStorageFolder();
  handleInitDatabase();

  const result = {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    pdfFolderId: folder.id,
    pdfFolderUrl: folder.url,
  };
  Logger.log(JSON.stringify(result));
  return result;
}
