/**
 * Weavelon 2 Loom Performance — web app backend.
 * Lives in the "W2 Loom Performance Config" Google Sheet (Extensions > Apps Script).
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 *
 * The app reads saved targets and head-group answers from here and writes them back.
 * Every call must carry the app passcode; nothing else in the Sheet is exposed.
 */
const APP_KEY = 'PASTE-THE-APP-PASSCODE-HERE';
const SHEET_ID = '16MLmxEEc3JUNwMS29-KiJZRCAw-1vtwZoHYbD6kh3QI';
const T_TAB = 'App targets';      // id | width | hg | cfm | rpm | main | at
const A_TAB = 'App assignments';  // style | head_group | is_new | status | at | applied_at
const T_HEAD = ['id', 'width', 'hg', 'cfm', 'rpm', 'main', 'at'];
const A_HEAD = ['style', 'head_group', 'is_new', 'status', 'at', 'applied_at'];

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function tab(name, head) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]); sh.setFrozenRows(1); }
  return sh;
}

function rows(sh, n) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues();
}

const num = (v) => (v === '' || v == null || !isFinite(Number(v))) ? null : Number(v);
const bool = (v) => v === true || String(v).toUpperCase() === 'TRUE';

function readState() {
  const targets = rows(tab(T_TAB, T_HEAD), 7).filter((r) => r[0]).map((r) => ({
    id: String(r[0]), width: String(r[1]), hg: String(r[2]), cfm: num(r[3]), rpm: num(r[4]), main: num(r[5]), at: String(r[6] || '')}));
  const assignments = rows(tab(A_TAB, A_HEAD), 6).filter((r) => r[0] !== '').map((r) => ({
    style: String(r[0]), head_group: String(r[1]), is_new: bool(r[2]), status: String(r[3]), at: String(r[4] || ''), applied_at: String(r[5] || '')}));
  return {targets, assignments};
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== APP_KEY) return out({ok: false, error: 'Wrong passcode'});
  if (p.action === 'state') return out(Object.assign({ok: true}, readState()));
  return out({ok: true, pong: true});
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ok: false, error: 'Bad request'}); }
  if (!b || b.key !== APP_KEY) return out({ok: false, error: 'Wrong passcode'});
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (b.action === 'setTarget' || b.action === 'deleteTarget') {
      const id = String(b.id || '').slice(0, 200);
      if (!id) return out({ok: false, error: 'Missing id'});
      const sh = tab(T_TAB, T_HEAD);
      const r = rows(sh, 1).findIndex((x) => String(x[0]) === id);
      if (b.action === 'deleteTarget') {
        if (r >= 0) sh.deleteRow(r + 2);
      } else {
        const d = b.data || {};
        const row = [id, String(d.width || ''), String(d.hg || ''), num(d.cfm) ?? '', num(d.rpm) ?? '', num(d.main) ?? '', new Date().toISOString()];
        if (r >= 0) sh.getRange(r + 2, 1, 1, 7).setValues([row]); else sh.appendRow(row);
      }
      return out(Object.assign({ok: true}, readState()));
    }
    if (b.action === 'assign') {
      const d = b.data || {};
      const style = String(d.style || '');
      const hg = String(d.head_group || '').trim();
      if (!hg) return out({ok: false, error: 'Missing head group'});
      const sh = tab(A_TAB, A_HEAD);
      // Text format keeps style names like 0402 or TRUE exactly as decoded.
      const row = [style, hg, d.is_new ? 'TRUE' : 'FALSE', 'pending', new Date().toISOString(), ''];
      const r = rows(sh, 4).findIndex((x) => String(x[0]) === style && String(x[3]) === 'pending');
      const rng = r >= 0 ? sh.getRange(r + 2, 1, 1, 6) : sh.getRange(sh.getLastRow() + 1, 1, 1, 6);
      rng.setNumberFormat('@').setValues([row]);
      return out(Object.assign({ok: true}, readState()));
    }
    return out({ok: false, error: 'Unknown action'});
  } finally {
    lock.releaseLock();
  }
}
