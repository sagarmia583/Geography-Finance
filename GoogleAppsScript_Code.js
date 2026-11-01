/**
 * Geography voucher API. Deploy this as a new Apps Script web-app version.
 * Set APP_SECRET (at least 32 random characters) and SPREADSHEET_ID in
 * Project Settings > Script properties. APP_SECRET belongs only on the server.
 * Public GET reads and spreadsheet-controlled login passwords are not supported.
 * In the editor, run testConnection to check configuration and authorize Sheet
 * access. Running doPost without a web request cannot test the connection.
 */

var VOUCHER_HEADERS = [
  "Voucher ID",
  "Type",
  "Exam Title",
  "Date",
  "Income",
  "Expenses",
  "Distributable",
  "Full_JSON",
  "Expense_Vouchers",
  "VAT_Challan",
  "Tax_5_Challan",
  "Tax_10_Challan",
];
var CHALLAN_HEADERS = [
  "Voucher ID",
  "Type",
  "Exam Title",
  "Date",
  "VAT Challan",
  "VAT Amount",
  "VAT Date",
  "Tax 5% Challan",
  "Tax 5% Amount",
  "Tax 5% Date",
  "Tax 10% Challan",
  "Tax 10% Amount",
  "Tax 10% Date",
  "Total Deducted Tax",
];
var READABLE_SHEETS = ["Settings", "Rates", "Products", "Percentages", "Teachers", "Sectors"];

// Editor-only diagnostic: does not change properties or write any spreadsheet data.
// The HTTP handlers never expose this function as an API action.
function testConnection() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("APP_SECRET");
  var spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  var result;
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256) {
    result = {
      success: false,
      code: "APP_SECRET_INVALID",
      message:
        "Project Settings > Script properties-এ APP_SECRET বসান। স্থানীয় apps-script-properties.json-এর মানটি হুবহু দিন।",
    };
  } else if (typeof spreadsheetId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(spreadsheetId)) {
    result = {
      success: false,
      code: "SPREADSHEET_ID_INVALID",
      message:
        "Script properties-এ SPREADSHEET_ID বসান। পুরো URL নয়, স্থানীয় apps-script-properties.json-এর ID দিন।",
    };
  } else {
    try {
      SpreadsheetApp.openById(spreadsheetId).getSheetByName("Server_Vouchers");
      result = {
        success: true,
        code: "CONNECTION_OK",
        message:
          "Script properties ও Sheet access ঠিক আছে। Web app-এর নতুন version deploy করে ওয়েবসাইট থেকে তালিকা refresh করুন।",
      };
    } catch (_) {
      result = {
        success: false,
        code: "SPREADSHEET_ACCESS_FAILED",
        message:
          "এই Google account দিয়ে Sheet খোলা যায়নি। Sheet ID, account-এর permission এবং Apps Script authorization পরীক্ষা করুন।",
      };
    }
  }
  Logger.log(JSON.stringify(result));
  return result;
}

function doGet() {
  return jsonResponse({ success: false, error: "GET reads are disabled" });
}

function doPost(e) {
  var lock = null;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== "string" || !raw || raw.length > 2500000) {
      return jsonResponse({ success: false, error: "Invalid request" });
    }
    var data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return jsonResponse({ success: false, error: "Invalid JSON request" });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return jsonResponse({ success: false, error: "Invalid request" });
    }

    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty("APP_SECRET");
    var spreadsheetId = properties.getProperty("SPREADSHEET_ID");
    if (
      typeof secret !== "string" ||
      secret.length < 32 ||
      secret.length > 256 ||
      typeof spreadsheetId !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(spreadsheetId)
    ) {
      return jsonResponse({ success: false, error: "API configuration is incomplete" });
    }
    if (!sameSecret(data.secret, secret)) {
      return jsonResponse({ success: false, error: "Unauthorized" });
    }
    if (data.id !== undefined && data.id !== spreadsheetId) {
      return jsonResponse({ success: false, error: "Spreadsheet is not allowed" });
    }
    if (
      [
        "getVouchers",
        "verifyVoucher",
        "saveVoucher",
        "deleteVoucher",
        "readSheet",
        "getPasswordState",
        "changePasswordHash",
      ].indexOf(data.action) < 0
    ) {
      return jsonResponse({ success: false, error: "Unsupported action" });
    }

    // Login credentials are shared Script properties, never spreadsheet cells.
    // Only the trusted website server can call these actions or receive a hash.
    if (data.action === "getPasswordState" || data.action === "changePasswordHash") {
      var propertyKey = passwordPropertyKey(data.bootstrapVersion);
      if (
        !propertyKey ||
        (data.action === "changePasswordHash" &&
          (!validLoginPasswordHash(data.expectedHash) ||
            !validLoginPasswordHash(data.nextHash) ||
            sameSecret(data.expectedHash, data.nextHash)))
      ) {
        return jsonResponse({ success: false, error: "Invalid password request" });
      }
      if (data.action === "changePasswordHash") {
        lock = LockService.getScriptLock();
        if (!lock.tryLock(10000)) {
          lock = null;
          return jsonResponse({ success: false, error: "API is busy; retry shortly" });
        }
      }
      // Read after acquiring the write lock so simultaneous changes cannot
      // overwrite each other after both callers verified the previous password.
      var currentHash = properties.getProperty(propertyKey);
      if (currentHash !== null && !validLoginPasswordHash(currentHash)) {
        return jsonResponse({ success: false, error: "Password state is invalid" });
      }
      if (data.action === "getPasswordState") {
        return jsonResponse({ success: true, passwordHash: currentHash });
      }
      if (currentHash !== null && !sameSecret(data.expectedHash, currentHash)) {
        return jsonResponse({ success: false, error: "Password changed" });
      }
      // An absent scope uses the website's trusted environment seed. Changing
      // that seed intentionally creates a fresh scope for an offline reset.
      properties.setProperty(propertyKey, data.nextHash);
      return jsonResponse({ success: true });
    }

    var voucherId = null;
    if (
      data.action === "verifyVoucher" ||
      data.action === "saveVoucher" ||
      data.action === "deleteVoucher"
    ) {
      voucherId = validVoucherId(data.voucherId);
      if (!voucherId) return jsonResponse({ success: false, error: "Invalid voucher ID" });
    }
    var read = null;
    if (data.action === "readSheet") {
      read = allowedRead(data.sheetName, data.range);
      if (!read) return jsonResponse({ success: false, error: "Sheet range is not allowed" });
    }
    var saved = null;
    if (data.action === "saveVoucher") {
      saved = validateVoucher(data, voucherId);
      if (!saved) return jsonResponse({ success: false, error: "Invalid voucher data" });
    }

    // Invalid or unauthenticated requests never open a spreadsheet or take a lock.
    if (data.action === "saveVoucher" || data.action === "deleteVoucher") {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) {
        lock = null;
        return jsonResponse({ success: false, error: "API is busy; retry shortly" });
      }
    }
    var ss = SpreadsheetApp.openById(spreadsheetId);
    if (data.action === "readSheet") {
      return readSheetResponse(ss, read);
    }
    if (data.action === "getVouchers") {
      return jsonResponse({ success: true, vouchers: voucherRecords(ss).reverse() });
    }
    if (data.action === "verifyVoucher") {
      var records = voucherRecords(ss);
      var match = null;
      for (var i = records.length - 1; i >= 0; i--) {
        if (normalizeVoucherId(records[i].id) === normalizeVoucherId(voucherId)) {
          match = records[i];
          break;
        }
      }
      return jsonResponse({ success: true, voucher: match });
    }
    if (data.action === "saveVoucher") {
      var voucherSheet = ensureSheet(ss, "Server_Vouchers", VOUCHER_HEADERS);
      upsertRow(voucherSheet, voucherId, saved.voucher);
      var challanSheet = ensureSheet(ss, "Challans", CHALLAN_HEADERS);
      upsertRow(challanSheet, voucherId, saved.challan);
      return jsonResponse({ success: true, message: "Voucher and challans saved successfully" });
    }
    var sheet = ss.getSheetByName("Server_Vouchers");
    var row = sheet && findVoucherRow(sheet, voucherId);
    if (!row) return jsonResponse({ success: false, error: "Voucher was not found" });
    // Older deployments could save duplicate IDs with different casing. Remove
    // every exact normalized match so a historical copy cannot reappear later.
    var voucherRows = sheet.getDataRange().getValues();
    for (var v = voucherRows.length - 1; v >= 1; v--) {
      if (normalizeVoucherId(voucherRows[v][0]) === normalizeVoucherId(voucherId))
        sheet.deleteRow(v + 1);
    }
    var challans = ss.getSheetByName("Challans");
    if (challans) {
      // Delete all matching historical rows, without partial/suffix matching.
      var rows = challans.getDataRange().getValues();
      for (var c = rows.length - 1; c >= 1; c--) {
        if (normalizeVoucherId(rows[c][0]) === normalizeVoucherId(voucherId))
          challans.deleteRow(c + 1);
      }
    }
    return jsonResponse({ success: true, message: "Voucher deleted successfully" });
  } catch (_) {
    // Do not send stack traces, spreadsheet content, or configuration to callers.
    return jsonResponse({ success: false, error: "API operation failed" });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function sameSecret(actual, expected) {
  if (typeof actual !== "string" || actual.length > 256) return false;
  var mismatch = actual.length ^ expected.length;
  for (var i = 0; i < expected.length; i++)
    mismatch |= (actual.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

function passwordPropertyKey(version) {
  return typeof version === "string" && version.length === 64 && /^[a-f0-9]{64}$/.test(version)
    ? "APP_LOGIN_PASSWORD_" + version
    : null;
}

function validLoginPasswordHash(value) {
  return (
    typeof value === "string" &&
    value.length === 107 &&
    /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(value)
  );
}

function validVoucherId(value) {
  if (typeof value !== "string" || value.length > 128) return null;
  var id = value.trim();
  return id && !/[\u0000-\u001f\u007f]/.test(id) ? id : null;
}

function normalizeVoucherId(value) {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .toLowerCase();
}

function allowedRead(sheetName, range) {
  if (
    typeof sheetName !== "string" ||
    READABLE_SHEETS.indexOf(sheetName) < 0 ||
    typeof range !== "string"
  )
    return null;
  var parts = range.split("!");
  if (parts.length > 2 || (parts.length === 2 && parts[0] !== sheetName)) return null;
  var match = /^([A-Z]{1,2})([1-9][0-9]{0,3})?(?::([A-Z]{1,2})([1-9][0-9]{0,3})?)?$/.exec(
    parts[parts.length - 1],
  );
  if (!match) return null;
  var startCol = columnNumber(match[1]);
  var endCol = columnNumber(match[3] || match[1]);
  var startRow = Number(match[2] || 1);
  var endRow = Number(match[4] || (match[3] ? 5000 : match[2] || 5000));
  if (startCol > 26 || endCol > 26 || startCol > endCol || startRow > endRow || endRow > 5000)
    return null;
  return {
    sheetName: sheetName,
    startCol: startCol,
    endCol: endCol,
    startRow: startRow,
    endRow: endRow,
  };
}

function columnNumber(label) {
  var number = 0;
  for (var i = 0; i < label.length; i++) number = number * 26 + label.charCodeAt(i) - 64;
  return number;
}

function readSheetResponse(ss, request) {
  var sheet = ss.getSheetByName(request.sheetName);
  if (!sheet) return jsonResponse({ success: true, values: [] });
  var rows = sheet.getDataRange().getValues();
  if (request.sheetName === "Settings") rows = publicSettings(rows);
  var result = [];
  for (var r = request.startRow - 1; r < Math.min(rows.length, request.endRow); r++) {
    var row = [];
    for (var c = request.startCol - 1; c < request.endCol; c++)
      row.push(rows[r][c] === undefined ? "" : rows[r][c]);
    result.push(row);
  }
  return jsonResponse({ success: true, values: result });
}

function settingsKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s:：_\-]/g, "");
}

function credentialKey(value) {
  return /password|passwd|passphrase|secret|token|auth|credential|apikey|privatekey|পাসওয়ার্ড|পাসওয়ার্ড|পাসওয়ারড|গোপন/.test(
    settingsKey(value),
  );
}

function organizationKey(value) {
  var key = settingsKey(value);
  // Unknown settings (including the old unlabeled B1 password fallback) are private.
  return (
    !credentialKey(value) &&
    /^(dept|department|departmentname|বিভাগ|বিভাগেরনাম|college|collegename|institution|institutionname|কলেজ|কলেজেরনাম|প্রতিষ্ঠান|প্রতিষ্ঠানেরনাম|mobile|phone|telephone|contact|মোবাইল|ফোন|যোগাযোগ|email|mail|ইমেইল|ইমেইলঠিকানা|web|website|url|ওয়েব|ওয়েব|ওয়েবসাইট|ওয়েবসাইট)$/.test(
      key,
    )
  );
}

function publicSettings(rows) {
  var result = rows.map(function (row) {
    return row.map(function () {
      return "";
    });
  });
  if (!rows.length) return result;
  // Header-based layout: preserve only explicitly public organization columns.
  if (rows.length > 1 && rows[0].filter(organizationKey).length > 1) {
    for (var c = 0; c < rows[0].length; c++) {
      if (organizationKey(rows[0][c])) {
        result[0][c] = rows[0][c];
        result[1][c] = rows[1][c] === undefined ? "" : rows[1][c];
      }
    }
  } else {
    // Key-value layout. No unlabelled, password, secret, token, or auth row escapes.
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].length > 1 && organizationKey(rows[r][0]) && !rows[r].some(credentialKey)) {
        result[r][0] = rows[r][0];
        result[r][1] = rows[r][1];
      }
    }
  }
  return result;
}

function voucherRecords(ss) {
  var sheet = ss.getSheetByName("Server_Vouchers");
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var vouchers = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue;
    vouchers.push({
      id: row[0],
      type: row[1],
      examTitle: row[2],
      date: row[3],
      income: row[4],
      expenses: row[5],
      distributable: row[6],
      fullState: row[7],
      expenseVouchers: row[8] || "",
      vatChallan: row[9] || "",
      tax5Challan: row[10] || "",
      tax10Challan: row[11] || "",
    });
  }
  return vouchers;
}

function validateVoucher(data, voucherId) {
  if (typeof data.fullState !== "string" || data.fullState.length > 2000000) return null;
  var fullState;
  try {
    fullState = JSON.parse(data.fullState);
  } catch (_) {
    return null;
  }
  if (
    !fullState ||
    typeof fullState !== "object" ||
    Array.isArray(fullState) ||
    normalizeVoucherId(fullState.id) !== normalizeVoucherId(voucherId)
  )
    return null;
  var numericKeys = [
    "income",
    "expenses",
    "distributable",
    "vatAmount",
    "tax5Amount",
    "tax10Amount",
  ];
  var numbers = {};
  for (var n = 0; n < numericKeys.length; n++) {
    var key = numericKeys[n];
    var value = data[key] === undefined ? 0 : data[key];
    if (typeof value !== "number" || !isFinite(value) || value < 0 || value > 1000000000000000)
      return null;
    numbers[key] = value;
  }
  var textKeys = [
    "configName",
    "examName",
    "date",
    "expenseVouchers",
    "vatChallan",
    "tax5Challan",
    "tax10Challan",
    "vatDate",
    "tax5Date",
    "tax10Date",
  ];
  var text = {};
  for (var t = 0; t < textKeys.length; t++) {
    var field = textKeys[t];
    var content = data[field] === undefined ? "" : data[field];
    if (
      typeof content !== "string" ||
      content.length > (field === "expenseVouchers" ? 1000000 : 1000)
    )
      return null;
    text[field] = safeSheetText(content);
  }
  var id = safeSheetText(voucherId);
  return {
    voucher: [
      id,
      text.configName,
      text.examName,
      text.date,
      numbers.income,
      numbers.expenses,
      numbers.distributable,
      data.fullState,
      text.expenseVouchers,
      text.vatChallan,
      text.tax5Challan,
      text.tax10Challan,
    ],
    challan: [
      id,
      text.configName,
      text.examName,
      text.date,
      text.vatChallan,
      numbers.vatAmount,
      text.vatDate,
      text.tax5Challan,
      numbers.tax5Amount,
      text.tax5Date,
      text.tax10Challan,
      numbers.tax10Amount,
      text.tax10Date,
      numbers.vatAmount + numbers.tax5Amount + numbers.tax10Amount,
    ],
  };
}

function safeSheetText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (sheet.getLastColumn() < headers.length) {
    for (var h = sheet.getLastColumn(); h < headers.length; h++)
      sheet.getRange(1, h + 1).setValue(headers[h]);
  }
  return sheet;
}

function findVoucherRow(sheet, voucherId) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (normalizeVoucherId(rows[i][0]) === normalizeVoucherId(voucherId)) return i + 1;
  }
  return 0;
}

function upsertRow(sheet, voucherId, values) {
  var row = findVoucherRow(sheet, voucherId);
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
