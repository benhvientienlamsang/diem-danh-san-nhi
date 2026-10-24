/**
 * ĐIỂM DANH – Máy chủ Google Apps Script (gắn với Google Sheet quản lý)
 * Kiểm soát sinh viên có mặt tại khu vực lâm sàng Bệnh viện Sản Nhi Kiên Giang từ 07:00 đến 11:00
 * Từ BV TLS - by Dr Huy - BV TLS
 *
 *  - Đăng ký khuôn mặt sinh viên (đặc trưng 128 chiều + ảnh đăng ký)
 *  - Điểm danh: định vị trong bán kính, khớp đúng 1 khuôn mặt, 1 lần/người/ngày, giờ máy chủ quyết định đúng giờ/trễ
 *  - Chặn vị trí giả lập và ứng dụng fake GPS (Android)
 *  - Theo dõi vị trí đến 11:00, ghi nhận rời vùng (> 60 m), mất tín hiệu, di chuyển bất thường
 *  - Xác nhận khuôn mặt giữa ca theo khung giờ
 *  - Lưu ảnh và báo cáo PDF kèm hình vào thư mục Google Drive
 *  - Tài khoản giảng viên: xem tình hình sinh viên, gửi thông báo hoặc yêu cầu xác nhận có mặt đến sinh viên được chọn
 */

var APP = { NAME: 'Điểm danh', BRAND: 'BV TLS', CREDIT: 'by Dr Huy - BV TLS', VERSION: '1.5.4' };
var TZ = 'Asia/Ho_Chi_Minh';
var SH = { CFG: 'CauHinh', SV: 'SinhVien', DD: 'DiemDanh', SK: 'SuKienViTri', HT: 'HienTai', GV: 'GiangVien', TB: 'ThongBao', CS: 'CoSo' };
var PURPOSE = 'Kiểm soát sinh viên có mặt tại khu vực lâm sàng từ 07:00 đến 11:00';

var DEFAULT_CONFIG = [
  ['TEN_BENH_VIEN', 'Bệnh viện Sản Nhi Kiên Giang', 'Tên hiển thị trên ứng dụng, ảnh và báo cáo'],
  ['DIA_CHI', '03 Ung Văn Khiêm, phường Rạch Giá, tỉnh An Giang', 'Địa chỉ hiển thị'],
  ['VI_DO', '9.9731417', 'Vĩ độ tâm vùng điểm danh. NÊN hiệu chỉnh tại chỗ (xem hướng dẫn)'],
  ['KINH_DO', '105.0975708', 'Kinh độ tâm vùng điểm danh'],
  ['BAN_KINH_DIEM_DANH_M', '20', 'Bán kính cho phép điểm danh (mét)'],
  ['BAN_KINH_ROI_VUNG_M', '60', 'Ra ngoài bán kính này bị ghi nhận rời vùng (mét)'],
  ['SAI_SO_GPS_CHO_PHEP_M', '10', 'Phần sai số GPS tối đa được trừ khi tính khoảng cách (mét)'],
  ['SAI_SO_GPS_TOI_DA_M', '50', 'Định vị có sai số lớn hơn mức này bị bỏ qua (mét)'],
  ['GIO_MO_DIEM_DANH', '05:30', 'Bắt đầu cho phép điểm danh'],
  ['GIO_HAN_DIEM_DANH', '07:00', 'Điểm danh TRƯỚC giờ này là đúng giờ, từ giờ này trở đi là trễ'],
  ['GIO_KET_THUC_THEO_DOI', '11:00', 'Hết ca: sau giờ này ngừng theo dõi vị trí và không nhận điểm danh'],
  ['NGAY_HOC', '2,3,4,5,6', 'Các ngày có điểm danh: 2 = thứ Hai ... 7 = thứ Bảy, 8 = Chủ nhật'],
  ['MA_LOP', 'BVTLS2026', 'Mã lớp SV nhập khi đăng nhập. Nhiều mã cách nhau dấu phẩy. Viết MÃ=NHÓM để mã chỉ dùng cho nhóm đó, ví dụ: SNA2026=Y6A, SNB2026=Y6B'],
  ['NGUONG_KHUON_MAT', '0.50', 'Độ lệch đặc trưng khuôn mặt tối đa để chấp nhận (nhỏ hơn = chặt hơn)'],
  ['NGUONG_TRUNG_KHUON_MAT', '0.45', 'Khi đăng ký, khuôn mặt gần hơn mức này với SV khác sẽ bị từ chối'],
  ['KHOA_1_THIET_BI', 'TRUE', 'TRUE: mỗi SV chỉ dùng 1 điện thoại đã đăng ký'],
  ['CHO_SV_TU_DANG_KY', 'TRUE', 'TRUE: SV chưa có trong danh sách được tự đăng ký lần đầu (họ tên, MSSV, mã lớp, khuôn mặt). FALSE: chỉ SV có sẵn trong sheet SinhVien'],
  ['XAC_NHAN_GIUA_CA', '', 'Các mốc SV phải quét khuôn mặt giữa ca, ví dụ 08:30,09:30,10:30. Để trống = tắt, chỉ tự động gửi định vị'],
  ['XAC_NHAN_CUA_SO_PHUT', '15', 'Mỗi mốc xác nhận mở trong bao nhiêu phút'],
  ['CHAN_APP_FAKE_GPS_DA_CAI', 'TRUE', 'Android: TRUE = không cho điểm danh khi máy có cài app giả lập vị trí'],
  ['CHAN_MAY_ROOT', 'FALSE', 'Android: TRUE = không cho điểm danh trên máy đã root'],
  ['CHU_KY_GUI_VI_TRI_PHUT', '2', 'Chu kỳ gửi vị trí khi đứng yên (phút)'],
  ['MAT_TIN_HIEU_SAU_PHUT', '10', 'Android: không nhận vị trí quá số phút này thì ghi mất tín hiệu'],
  ['TOC_DO_BAT_THUONG_MS', '70', 'Di chuyển nhanh hơn mức này (m/giây) giữa 2 lần gửi bị ghi nghi giả lập'],
  ['GIO_BAO_CAO_DAU_GIO', '07:15', 'Giờ tạo báo cáo đầu giờ (ai có mặt, ai trễ, ai vắng)'],
  ['GIO_BAO_CAO_CUOI_CA', '11:15', 'Giờ tạo báo cáo cuối ca (rời vùng, xác nhận giữa ca)'],
  ['GUI_EMAIL_BAO_CAO', 'TRUE', 'TRUE: gửi kèm PDF báo cáo qua email'],
  ['EMAIL_NHAN_BAO_CAO', '', 'Email nhận báo cáo, để trống = email chủ sở hữu script. Nhiều email cách nhau dấu phẩy'],
  ['CANH_BAO_EMAIL_KHI_ROI_VUNG', 'FALSE', 'TRUE: gửi email ngay khi SV rời vùng'],
  ['THU_MUC_GOC_ID', '', 'ID thư mục Google Drive lưu ảnh và báo cáo. Để trống = tự tạo']
];

/* ============================ MENU & CÀI ĐẶT ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BV TLS')
    .addItem('1. Cài đặt lần đầu', 'setup')
    .addItem('2. Tạo báo cáo hôm nay', 'menuReportToday')
    .addItem('Xóa khuôn mặt SV (dòng đang chọn)', 'menuResetFace')
    .addItem('Xóa thiết bị SV (dòng đang chọn)', 'menuResetDevice')
    .addSeparator()
    .addItem('Mở thư mục Drive', 'menuOpenFolder')
    .addItem('Kiểm tra danh sách cơ sở', 'menuSites')
    .addToUi();
}

function onEdit(e) {
  try {
    var n = e && e.range && e.range.getSheet().getName();
    if (n === SH.CFG) CacheService.getScriptCache().remove('cfg');
    if (n === SH.CS) CacheService.getScriptCache().remove('sites');
  } catch (err) {}
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  var cfg = getOrCreateSheet_(SH.CFG, ['Khóa', 'Giá trị', 'Mô tả']);
  cfg.getRange('B:B').setNumberFormat('@');
  var existing = {};
  var vals = cfg.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) existing[vals[i][0]] = true;
  DEFAULT_CONFIG.forEach(function (r) { if (!existing[r[0]]) cfg.appendRow(r); });
  cfg.getRange('A:A').setFontWeight('bold');
  cfg.setColumnWidth(1, 240); cfg.setColumnWidth(2, 260); cfg.setColumnWidth(3, 520);

  var sv = getOrCreateSheet_(SH.SV, ['MSSV', 'Họ tên', 'Nhóm/Lớp', 'Khuôn mặt', 'Ngày đăng ký', 'Ảnh đăng ký',
    'Mã thiết bị', 'Ghi chú', 'Đặc trưng (không sửa)']);
  sv.getRange('A:A').setNumberFormat('@');
  sv.hideColumns(9);

  var dd = getOrCreateSheet_(SH.DD, ['Ngày', 'Giờ điểm danh', 'MSSV', 'Họ tên', 'Nhóm/Lớp', 'Trạng thái', 'Trễ (phút)',
    'Khoảng cách (m)', 'Sai số GPS (m)', 'Vĩ độ', 'Kinh độ', 'Độ lệch khuôn mặt', 'Kiểm tra người thật',
    'Ghi chú', 'Ảnh', 'Xác nhận giữa ca', 'Số lần rời vùng', 'Phút ngoài vùng', 'Nền tảng', 'Mã thiết bị', 'FileId ảnh']);
  dd.getRange('A:C').setNumberFormat('@'); dd.getRange('P:P').setNumberFormat('@'); dd.getRange('T:U').setNumberFormat('@');
  var sk = getOrCreateSheet_(SH.SK, ['Thời điểm', 'Ngày', 'MSSV', 'Họ tên', 'Sự kiện', 'Khoảng cách (m)', 'Sai số (m)',
    'Vĩ độ', 'Kinh độ', 'Chi tiết']);
  sk.getRange('A:C').setNumberFormat('@');
  var ht = getOrCreateSheet_(SH.HT, ['MSSV', 'Ngày', 'Trạng thái', 'Khoảng cách (m)', 'Sai số (m)', 'Lần cuối (ms)',
    'Lần cuối', 'Đếm ngoài', 'Ra vùng lúc (ms)', 'Số lần rời', 'Phút ngoài', 'Nền tảng', 'Mất tín hiệu', 'Họ tên',
    'Vĩ độ cuối', 'Kinh độ cuối', 'Cờ đã ghi']);
  ht.getRange('A:B').setNumberFormat('@'); ht.getRange('G:G').setNumberFormat('@');
  if (!dd.getRange(1, 22).getValue()) dd.getRange(1, 22).setValue('Cơ sở').setFontWeight('bold').setBackground('#b3261e').setFontColor('#ffffff');
  ensureSitesSheet_(cfg_());
  var gv = getOrCreateSheet_(SH.GV, ['Tài khoản', 'Mật khẩu', 'Họ tên giảng viên', 'Nhóm phụ trách (để trống = tất cả)', 'Ghi chú']);
  gv.getRange('A:B').setNumberFormat('@');
  if (gv.getLastRow() < 2) gv.appendRow(['gv01', 'DoiMatKhau@2026', 'ThS. BS. Giảng viên mẫu', '', 'Tài khoản mẫu: đổi mật khẩu và họ tên trước khi dùng']);
  var tb = getOrCreateSheet_(SH.TB, ['Mã', 'Ngày', 'Gửi lúc', 'Giảng viên', 'MSSV', 'Họ tên SV', 'Loại', 'Nội dung', 'Hạn (phút)',
    'Trạng thái', 'Nhận lúc', 'Phản hồi lúc', 'Kết quả']);
  tb.getRange('A:C').setNumberFormat('@'); tb.getRange('E:E').setNumberFormat('@'); tb.getRange('K:L').setNumberFormat('@');

  getRootFolder_();
  installTriggers_();
  CacheService.getScriptCache().remove('cfg');
  ss.toast('Đã cài đặt xong. Nhập danh sách sinh viên vào sheet SinhVien.', 'BV TLS', 8);
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#b3261e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function menuReportToday() { SpreadsheetApp.getUi().alert('Đã tạo báo cáo:\n' + makeReport_(today_(), 'THU_CONG')); }
function menuResetFace() { resetCols_([4, 5, 6, 9], 'khuôn mặt'); }
function menuResetDevice() { resetCols_([7], 'thiết bị'); }
function menuOpenFolder() { SpreadsheetApp.getUi().alert('Thư mục Drive:\n' + getRootFolder_().getUrl()); }

function resetCols_(cols, label) {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SH.SV) { SpreadsheetApp.getUi().alert('Hãy chọn một dòng trong sheet SinhVien.'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) return;
  cols.forEach(function (c) { sh.getRange(row, c).clearContent(); });
  SpreadsheetApp.getUi().alert('Đã xóa ' + label + ' của MSSV ' + sh.getRange(row, 1).getValue() + '. Sinh viên có thể đăng ký lại.');
}

/* ============================ API ============================ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) {
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width"><div style="font-family:sans-serif;padding:24px">' +
      '<h3>Máy chủ ' + APP.NAME + '</h3><p>' + PURPOSE + '</p><p>Từ ' + APP.BRAND + ' – ' + APP.CREDIT + '</p><p>Phiên bản ' + APP.VERSION + '</p></div>')
      .setTitle('Máy chủ Điểm danh – BV TLS');
  }
  return handle_(p);
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, msg: 'Dữ liệu gửi lên không hợp lệ' }); }
  return handle_(data);
}

function handle_(d) {
  try {
    switch (d.action) {
      case 'config': return json_({ ok: true, serverTime: Date.now(), config: publicConfig_(cfg_()) });
      case 'status': return json_(apiStatus_(d));
      case 'classes': return json_({ ok: true, classes: classList_(cfg_()), sites: sites_(cfg_()), version: APP.VERSION });
      case 'rebind': return json_(apiRebind_(d));
      case 'enroll': return json_(apiEnroll_(d));
      case 'checkin': return json_(apiCheckin_(d));
      case 'confirm': return json_(apiConfirm_(d));
      case 'ping': return json_(apiPing_(d));
      case 'inbox': return json_(apiInbox_(d));
      case 'ack': return json_(apiAck_(d));
      case 'answer': return json_(apiAnswer_(d));
      case 'lecLogin': return json_(apiLecLogin_(d));
      case 'lecOverview': return json_(apiLecOverview_(d));
      case 'lecSend': return json_(apiLecSend_(d));
      default: return json_({ ok: false, msg: 'Yêu cầu không xác định' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, msg: 'Lỗi máy chủ: ' + (err && err.message ? err.message : err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function publicConfig_(c) {
  var sites = sites_(c), s0 = sites[0];
  return {
    sites: sites,
    hospital: s0.name, address: s0.address, lat: s0.lat, lng: s0.lng,
    checkinRadius: s0.r1, leaveRadius: s0.r2,
    gpsTolerance: num_(c.SAI_SO_GPS_CHO_PHEP_M), gpsMaxAcc: num_(c.SAI_SO_GPS_TOI_DA_M),
    openTime: c.GIO_MO_DIEM_DANH, deadline: c.GIO_HAN_DIEM_DANH, endTime: c.GIO_KET_THUC_THEO_DOI,
    schoolDays: String(c.NGAY_HOC), pingMinutes: num_(c.CHU_KY_GUI_VI_TRI_PHUT),
    slots: slots_(c), slotWindow: num_(c.XAC_NHAN_CUA_SO_PHUT),
    purpose: PURPOSE, brand: APP.BRAND, credit: APP.CREDIT, version: APP.VERSION
  };
}

/* ---------- status ---------- */
function apiStatus_(d) {
  var c = cfg_();
  var mssv = normId_(d.mssv);
  var st = findStudent_(mssv);
  if (!st) {
    // Sinh viên mới: cho đăng ký lần đầu nếu cấu hình cho phép
    var reg = newReg_(c, mssv, d.classCode !== undefined ? d.classCode : d.regCode, d.fullName !== undefined ? d.fullName : d.regName);
    if (reg.err) return { ok: false, code: 'NO_STUDENT', msg: reg.err };
    return { ok: true, serverTime: Date.now(), config: publicConfig_(c),
      student: { mssv: mssv, name: reg.name, group: reg.group, enrolled: false, isNew: true, deviceMatch: true },
      today: { date: fmt_(new Date(), 'yyyy-MM-dd'), schoolDay: isSchoolDay_(c, new Date()), checkin: null, slots: [], live: null }, inbox: [] };
  }
  if (d.classCode !== undefined && !classOk_(c, d.classCode, st)) {
    return { ok: false, code: 'BAD_CLASS', msg: 'Mã lớp không đúng.' };
  }
  if (d.fullName !== undefined && normName_(d.fullName) !== normName_(st.name)) {
    return { ok: false, code: 'BAD_NAME', msg: 'Họ và tên không khớp với MSSV ' + mssv + ' trong danh sách lớp. Kiểm tra lại họ tên hoặc MSSV.' };
  }
  var now = new Date();
  var date = fmt_(now, 'yyyy-MM-dd');
  var rec = findCheckin_(date, mssv);
  var ht = findLive_(mssv);
  return {
    ok: true, serverTime: Date.now(), config: publicConfig_(c),
    student: { mssv: st.mssv, name: st.name, group: st.group, enrolled: !!st.desc,
      deviceMatch: !bool_(c.KHOA_1_THIET_BI) || !st.device || st.device === d.deviceId },
    today: {
      date: date, schoolDay: isSchoolDay_(c, now),
      checkin: rec ? { time: rec.time, status: rec.status, late: rec.late, site: rec.site } : null,
      slots: rec ? slotStatus_(c, now, rec) : [],
      live: ht && ht.date === date ? { state: ht.state, dist: ht.dist } : null
    },
    inbox: inbox_(mssv, d.deviceId)
  };
}

/* ---------- enroll ---------- */
function apiEnroll_(d) {
  var c = cfg_();
  var mssv = normId_(d.mssv);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var st = findStudent_(mssv);
    if (st) {
      if (!classOk_(c, d.classCode, st)) return { ok: false, msg: 'Mã lớp không đúng.' };
    } else {
      var reg = newReg_(c, mssv, d.classCode, d.fullName);
      if (reg.err) return { ok: false, msg: reg.err };
      st = { row: 0, mssv: mssv, name: reg.name, group: reg.group, desc: null, device: '' };
    }
    if (st.desc) return { ok: false, msg: 'MSSV này đã đăng ký khuôn mặt. Muốn đăng ký lại, liên hệ quản trị BV TLS.' };
    var samples = d.descriptors;
    if (!samples || samples.length < 3) return { ok: false, msg: 'Cần ít nhất 3 mẫu khuôn mặt.' };
    for (var i = 0; i < samples.length; i++) if (!validDesc_(samples[i])) return { ok: false, msg: 'Mẫu khuôn mặt không hợp lệ.' };
    for (var a = 0; a < samples.length; a++) for (var b = a + 1; b < samples.length; b++) {
      if (euclid_(samples[a], samples[b]) > 0.45) return { ok: false, msg: 'Các mẫu khuôn mặt không ổn định. Giữ yên điện thoại, đủ sáng và thử lại.' };
    }
    var mean = meanDesc_(samples);
    var all = allStudents_();
    var lockDevice = bool_(c.KHOA_1_THIET_BI);
    for (var k = 0; k < all.length; k++) {
      var o = all[k];
      if (o.mssv === mssv) continue;
      if (o.desc && euclid_(mean, o.desc) < thr_(c.NGUONG_TRUNG_KHUON_MAT, 0.45)) {
        log_('', mssv, st.name, 'DANG_KY_TRUNG_MAT', '', '', '', '', 'Trùng khuôn mặt với MSSV ' + o.mssv);
        return { ok: false, msg: 'Khuôn mặt này đã được đăng ký cho một MSSV khác. Liên hệ quản trị BV TLS.' };
      }
      if (lockDevice && d.deviceId && o.device === d.deviceId) {
        return { ok: false, msg: 'Điện thoại này đã gắn với MSSV khác. Mỗi sinh viên dùng điện thoại riêng.' };
      }
    }
    var photoUrl = '';
    if (d.photo) {
      photoUrl = savePhoto_(d.photo, folderPath_(['Anh dang ky']), mssv + '_' + slug_(st.name) + '_dangky.jpg',
        'Ảnh đăng ký khuôn mặt – ' + st.name + ' (' + mssv + ') – ' + APP.BRAND).getUrl();
    }
    var sh = sheet_(SH.SV);
    if (!st.row) {
      sh.appendRow([mssv, st.name, st.group, '', '', '', '', 'Tự đăng ký qua app ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm'), '']);
      st.row = sh.getLastRow();
      sh.getRange(st.row, 1).setNumberFormat('@').setValue(mssv);
    }
    sh.getRange(st.row, 4, 1, 4).setValues([['Đã đăng ký', fmt_(new Date(), 'dd/MM/yyyy HH:mm'),
      photoUrl ? '=HYPERLINK("' + photoUrl + '";"Xem ảnh")' : '', d.deviceId || '']]);
    sh.getRange(st.row, 9).setValue(JSON.stringify(mean.map(function (x) { return Math.round(x * 1e5) / 1e5; })));
    return { ok: true, msg: 'Đăng ký khuôn mặt thành công.' };
  } finally { lock.releaseLock(); }
}

/* ---------- kiểm tra chung cho điểm danh và xác nhận ---------- */
function verify_(d, c, date, mode, kindLabel, site) {
  var radius = mode === 'in' ? site.r1 : site.r2;
  var mssv = normId_(d.mssv);
  var all = allStudents_();
  var st = null;
  for (var i = 0; i < all.length; i++) if (all[i].mssv === mssv) st = all[i];
  if (!st) return { err: 'Không tìm thấy MSSV.' };
  if (!st.desc) return { err: 'Chưa đăng ký khuôn mặt.' };

  // Nền tảng: Android bắt buộc dùng app, iPhone dùng web PWA
  if (d.platform !== 'android' && d.platform !== 'ios-web') {
    return { err: 'Thiết bị không hợp lệ. Android dùng app Điểm danh, iPhone dùng web đã thêm vào màn hình chính.' };
  }
  if (bool_(c.KHOA_1_THIET_BI) && st.device && d.deviceId !== st.device) {
    log_(date, mssv, st.name, 'SAI_THIET_BI', '', '', '', '', kindLabel + ' từ thiết bị lạ');
    return { err: 'Bạn đang dùng điện thoại khác với điện thoại đã đăng ký. Liên hệ quản trị BV TLS.' };
  }

  // Chống giả lập vị trí
  var lat = Number(d.lat), lng = Number(d.lng), acc = Number(d.acc);
  if (!isFinite(lat) || !isFinite(lng) || !isFinite(acc)) return { err: 'Thiếu dữ liệu định vị.' };
  var af = d.antiFake || {};
  if (d.platform === 'android') {
    if (!d.antiFake) return { err: 'Không kiểm tra được phần mềm giả lập vị trí. Cập nhật app Điểm danh bản mới nhất.' };
    if (truthy_(d.simulated) || (af.activeMock && af.activeMock.length)) {
      log_(date, mssv, st.name, 'GIA_LAP_VI_TRI', '', acc, lat, lng, kindLabel + ' bị chặn. ' + (af.activeMock || []).join(', '));
      return { err: 'Phát hiện vị trí giả lập' + (af.activeMock && af.activeMock.length ? ' (' + af.activeMock.join(', ') + ')' : '') +
        '. Tắt và gỡ ứng dụng fake GPS, tắt “Ứng dụng vị trí mô phỏng” trong Tùy chọn nhà phát triển rồi thử lại.' };
    }
    if (bool_(c.CHAN_APP_FAKE_GPS_DA_CAI) && af.installedMock && af.installedMock.length) {
      log_(date, mssv, st.name, 'CO_APP_FAKE_GPS', '', acc, lat, lng, af.installedMock.join(', '));
      return { err: 'Máy có cài ứng dụng giả lập vị trí: ' + af.installedMock.join(', ') + '. Gỡ cài đặt rồi thử lại.' };
    }
    if (af.rooted) {
      log_(date, mssv, st.name, 'MAY_ROOT', '', acc, lat, lng, kindLabel);
      if (bool_(c.CHAN_MAY_ROOT)) return { err: 'Không điểm danh trên máy đã root.' };
    }
  } else if (truthy_(d.identicalSamples)) {
    log_(date, mssv, st.name, 'NGHI_GIA_LAP', '', acc, lat, lng, kindLabel + ': các lần đọc GPS giống hệt nhau');
  }
  if (acc > num_(c.SAI_SO_GPS_TOI_DA_M)) return { err: 'GPS chưa đủ chính xác (±' + Math.round(acc) + ' m). Ra chỗ thoáng, chờ vài giây rồi thử lại.' };
  var dist = haversine_(lat, lng, site.lat, site.lng);
  if (effDist_(dist, acc, c) > radius) {
    return { err: 'Bạn đang cách tâm ' + site.name + ' khoảng ' + Math.round(dist) + ' m, ngoài bán kính ' + radius + ' m.' };
  }

  // Khuôn mặt: khớp với chính SV và SV phải là người gần nhất (so 1:N)
  if (!validDesc_(d.descriptor)) return { err: 'Không đọc được khuôn mặt.' };
  if (!d.liveness) return { err: 'Chưa vượt qua kiểm tra người thật (nhắm mở mắt).' };
  if (Number(d.faceCount) !== 1) return { err: 'Khung hình phải có đúng 1 khuôn mặt.' };
  var own = euclid_(d.descriptor, st.desc);
  var nearestOther = 9, nearestId = '';
  for (var j = 0; j < all.length; j++) {
    if (all[j].mssv === mssv || !all[j].desc) continue;
    var dd = euclid_(d.descriptor, all[j].desc);
    if (dd < nearestOther) { nearestOther = dd; nearestId = all[j].mssv; }
  }
  if (own > thr_(c.NGUONG_KHUON_MAT, 0.5)) {
    log_(date, mssv, st.name, 'MAT_KHONG_KHOP', Math.round(dist), acc, lat, lng, kindLabel + ', độ lệch ' + own.toFixed(3));
    return { err: 'Khuôn mặt không khớp với sinh viên ' + st.name + '. Đủ sáng, nhìn thẳng và thử lại.' };
  }
  if (nearestOther < own) {
    log_(date, mssv, st.name, 'MAT_GIONG_SV_KHAC', Math.round(dist), acc, lat, lng, kindLabel + ', gần MSSV ' + nearestId + ' hơn');
    return { err: 'Khuôn mặt trùng với sinh viên khác. Mỗi sinh viên tự điểm danh cho mình.' };
  }
  return { st: st, mssv: mssv, lat: lat, lng: lng, acc: acc, dist: dist, own: own, site: site };
}

/* ---------- checkin ---------- */
function apiCheckin_(d) {
  var c = cfg_();
  var now = new Date();
  var date = fmt_(now, 'yyyy-MM-dd');
  if (!isSchoolDay_(c, now)) return { ok: false, msg: 'Hôm nay không có lịch điểm danh.' };
  var nowMin = minOfDay_(now);
  if (nowMin < hhmm_(c.GIO_MO_DIEM_DANH)) return { ok: false, msg: 'Chưa đến giờ mở điểm danh (' + c.GIO_MO_DIEM_DANH + ').' };
  if (nowMin >= hhmm_(c.GIO_KET_THUC_THEO_DOI)) return { ok: false, msg: 'Đã hết ca (' + c.GIO_KET_THUC_THEO_DOI + '), không nhận điểm danh.' };
  if (findCheckin_(date, normId_(d.mssv))) return { ok: false, msg: 'Hôm nay bạn đã điểm danh rồi.' };

  var deadline = deadlineDate_(now, c.GIO_HAN_DIEM_DANH).getTime();
  if (now.getTime() >= deadline && String(d.note || '').trim().length < 10) {
    return { ok: false, msg: 'Sau ' + c.GIO_HAN_DIEM_DANH + ' phải ghi chú giải thích lý do (ít nhất 10 ký tự) rồi mới điểm danh.' };
  }
  var site = siteFor_(c, d.site, d.lat, d.lng);
  var v = verify_(d, c, date, 'in', 'Điểm danh', site);
  if (v.err) return { ok: false, msg: v.err };
  var st = v.st, mssv = v.mssv;

  var onTime = now.getTime() < deadline;
  var lateMin = onTime ? 0 : Math.max(1, Math.ceil((now.getTime() - deadline) / 60000));
  var status = onTime ? 'Đúng giờ' : 'Trễ';
  var timeStr = fmt_(now, 'HH:mm:ss');

  var file = savePhoto_(d.photo, folderPath_(['Anh diem danh', date.substr(0, 7), date]),
    date + '_' + fmt_(now, 'HHmmss') + '_' + mssv + '_' + slug_(st.name) + '.jpg',
    'Điểm danh ' + st.name + ' (' + mssv + ') lúc ' + timeStr + ' ngày ' + fmt_(now, 'dd/MM/yyyy') + ' – ' + site.name + ' – ' + APP.BRAND);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (findCheckin_(date, mssv)) { file.setTrashed(true); return { ok: false, msg: 'Hôm nay bạn đã điểm danh rồi.' }; }
    var usedBy = deviceUsedToday_(date, d.deviceId, mssv);
    if (usedBy) {
      file.setTrashed(true);
      log_(date, mssv, st.name, 'THIET_BI_DUNG_CHUNG', '', '', '', '', 'Thiết bị đã điểm danh cho MSSV ' + usedBy);
      return { ok: false, msg: 'Điện thoại này đã dùng để điểm danh cho sinh viên khác hôm nay.' };
    }
    var note = String(d.note || '').substr(0, 500);
    sheet_(SH.DD).appendRow([date, timeStr, mssv, st.name, st.group, status, lateMin, Math.round(v.dist), Math.round(v.acc),
      v.lat, v.lng, Math.round(v.own * 1000) / 1000, 'Đạt (nhắm mở mắt)', note,
      '=HYPERLINK("' + file.getUrl() + '";"Xem ảnh")', '', 0, 0, d.platform || '', d.deviceId || '', file.getId(), site.code]);
    setLive_(mssv, st.name, date, { state: 'TRONG', dist: Math.round(v.dist), acc: Math.round(v.acc), last: now.getTime(),
      outCount: 0, outSince: '', leaves: 0, outMin: 0, platform: d.platform || '', lost: false, lat: v.lat, lng: v.lng, flags: '' });
    log_(date, mssv, st.name, 'DIEM_DANH', Math.round(v.dist), Math.round(v.acc), v.lat, v.lng,
      status + (lateMin ? ' ' + lateMin + ' phút' : '') + (note ? ' | Ghi chú: ' + note : ''));
    if (!st.device && d.deviceId) sheet_(SH.SV).getRange(st.row, 7).setValue(d.deviceId);
  } finally { lock.releaseLock(); }
  var rec = findCheckin_(date, mssv);
  return { ok: true, time: timeStr, date: date, status: status, late: lateMin, dist: Math.round(v.dist), site: site.code,
    slots: slotStatus_(c, now, rec),
    msg: onTime ? 'Điểm danh thành công – đúng giờ.' : 'Điểm danh thành công – trễ ' + lateMin + ' phút.' };
}

/* ---------- xác nhận khuôn mặt giữa ca ---------- */
function apiConfirm_(d) {
  var c = cfg_();
  var now = new Date();
  var date = fmt_(now, 'yyyy-MM-dd');
  var mssv = normId_(d.mssv);
  var rec = findCheckin_(date, mssv);
  if (!rec) return { ok: false, msg: 'Hôm nay bạn chưa điểm danh.' };
  var slot = openSlot_(c, now);
  if (!slot) return { ok: false, msg: 'Hiện không trong khung giờ xác nhận.' };
  if (rec.confirms.indexOf(slot) >= 0) return { ok: false, msg: 'Bạn đã xác nhận mốc ' + slot + ' rồi.' };

  var v = verify_(d, c, date, 'out', 'Xác nhận ' + slot, siteFor_(c, rec.site || d.site, d.lat, d.lng));
  if (v.err) return { ok: false, msg: v.err };
  var file = savePhoto_(d.photo, folderPath_(['Anh xac nhan giua ca', date.substr(0, 7), date]),
    date + '_' + slot.replace(':', '') + '_' + mssv + '_' + slug_(v.st.name) + '.jpg',
    'Xác nhận giữa ca ' + slot + ' – ' + v.st.name + ' (' + mssv + ') – ' + APP.BRAND);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    rec = findCheckin_(date, mssv);
    if (rec.confirms.indexOf(slot) >= 0) { file.setTrashed(true); return { ok: false, msg: 'Bạn đã xác nhận mốc ' + slot + ' rồi.' }; }
    var list = rec.confirms.concat([slot]).sort();
    sheet_(SH.DD).getRange(rec.row, 16).setValue(list.join(','));
    log_(date, mssv, v.st.name, 'XAC_NHAN', Math.round(v.dist), Math.round(v.acc), v.lat, v.lng,
      'Mốc ' + slot + ' lúc ' + fmt_(now, 'HH:mm') + ' | ' + file.getUrl());
    rec.confirms = list;
  } finally { lock.releaseLock(); }
  return { ok: true, msg: 'Đã xác nhận có mặt mốc ' + slot + '.', slots: slotStatus_(c, now, rec) };
}

/* ---------- ping (theo dõi vị trí) ---------- */
function apiPing_(d) {
  var r = apiPingCore_(d);
  if (r.ok) r.inbox = inbox_(normId_(d.mssv), d.deviceId);
  return r;
}

function apiPingCore_(d) {
  var c = cfg_();
  var mssv = normId_(d.mssv);
  var now = new Date();
  var date = fmt_(now, 'yyyy-MM-dd');
  if (minOfDay_(now) >= hhmm_(c.GIO_KET_THUC_THEO_DOI)) return { ok: true, track: false, reason: 'Hết ca ' + c.GIO_KET_THUC_THEO_DOI };
  var rec = findCheckin_(date, mssv);
  if (!rec) return { ok: true, track: false, reason: 'Chưa điểm danh hôm nay' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var live = findLive_(mssv);
    if (!live || live.date !== date) {
      live = { state: 'TRONG', dist: '', acc: '', last: 0, outCount: 0, outSince: '', leaves: 0, outMin: 0, platform: d.platform || '', lost: false, lat: '', lng: '', flags: '' };
    }
    var name = rec.name;
    var lat = Number(d.lat), lng = Number(d.lng), acc = Number(d.acc);
    if (!isFinite(lat) || !isFinite(lng)) return { ok: false, msg: 'Thiếu vị trí' };
    if (!isFinite(acc)) acc = 999;
    var site = siteFor_(c, rec.site, lat, lng);
    var dist = haversine_(lat, lng, site.lat, site.lng);
    var flags = String(live.flags || '');
    var flagOnce = function (code, detail) {
      if (flags.indexOf(code + ';') >= 0) return;
      flags += code + ';';
      log_(date, mssv, name, code, Math.round(dist), Math.round(acc), lat, lng, detail);
    };

    if (live.lost) {
      log_(date, mssv, name, 'CO_TIN_HIEU_LAI', Math.round(dist), Math.round(acc), lat, lng, 'Mất tín hiệu từ ' + fmt_(new Date(live.last), 'HH:mm'));
      live.lost = false;
    }
    var af = d.antiFake || {};
    if (truthy_(d.simulated) || (af.activeMock && af.activeMock.length)) {
      flagOnce('GIA_LAP_VI_TRI', 'Trong ca: ' + ((af.activeMock || []).join(', ') || 'vị trí mô phỏng'));
    }
    if (af.installedMock && af.installedMock.length) flagOnce('CO_APP_FAKE_GPS', 'Trong ca: ' + af.installedMock.join(', '));
    if (live.last && live.lat !== '' && isFinite(Number(live.lat))) {
      var dt = (now.getTime() - live.last) / 1000;
      var jump = haversine_(lat, lng, Number(live.lat), Number(live.lng));
      if (dt > 0 && dt < 600 && jump > 200 && jump / dt > num_(c.TOC_DO_BAT_THUONG_MS)) {
        log_(date, mssv, name, 'NGHI_GIA_LAP', Math.round(dist), Math.round(acc), lat, lng,
          'Nhảy ' + Math.round(jump) + ' m trong ' + Math.round(dt) + ' giây');
      }
    }
    live.last = now.getTime();
    live.lat = lat; live.lng = lng;
    live.platform = d.platform || live.platform;

    // Chỉ xét rời vùng trong khung giờ kiểm soát (từ giờ hạn điểm danh đến hết ca)
    if (acc <= num_(c.SAI_SO_GPS_TOI_DA_M) && minOfDay_(now) >= hhmm_(c.GIO_HAN_DIEM_DANH)) {
      var eff = effDist_(dist, acc, c);
      var R = site.r2;
      live.dist = Math.round(dist); live.acc = Math.round(acc);
      if (live.state !== 'NGOAI') {
        if (eff > R) {
          live.outCount = Number(live.outCount || 0) + 1;
          if (live.outCount === 1) live.outSince = now.getTime();
          if (live.outCount >= 2 || truthy_(d.confirmedOut)) {
            live.state = 'NGOAI';
            live.leaves = Number(live.leaves || 0) + 1;
            log_(date, mssv, name, 'ROI_VUNG', Math.round(dist), Math.round(acc), lat, lng,
              'Ra ngoài bán kính ' + R + ' m từ khoảng ' + fmt_(new Date(Number(live.outSince)), 'HH:mm'));
            if (bool_(c.CANH_BAO_EMAIL_KHI_ROI_VUNG)) {
              notify_('[BV TLS] ' + name + ' rời khỏi ' + site.name,
                name + ' (' + mssv + ') rời bán kính ' + R + ' m lúc ' + fmt_(now, 'HH:mm') + ', cách tâm ' + Math.round(dist) + ' m.\n' +
                'Bản đồ: https://maps.google.com/?q=' + lat + ',' + lng + '\n\nTừ BV TLS – ' + APP.CREDIT);
            }
          }
        } else { live.outCount = 0; live.outSince = ''; live.state = 'TRONG'; }
      } else if (eff <= R - 10) {
        var mins = Math.round((now.getTime() - Number(live.outSince)) / 60000);
        live.outMin = Number(live.outMin || 0) + mins;
        live.state = 'TRONG'; live.outCount = 0; live.outSince = '';
        log_(date, mssv, name, 'QUAY_LAI', Math.round(dist), Math.round(acc), lat, lng, 'Ở ngoài khoảng ' + mins + ' phút');
      }
    }
    live.flags = flags;
    setLive_(mssv, name, date, live);
    updateCheckinStats_(rec.row, live);
    return { ok: true, track: true, state: live.state, dist: Math.round(dist), interval: num_(c.CHU_KY_GUI_VI_TRI_PHUT),
      slots: slotStatus_(c, now, rec) };
  } finally { lock.releaseLock(); }
}

/* ============================ TRIGGER ĐỊNH KỲ ============================ */

function tick() {
  var c = cfg_();
  var now = new Date();
  var date = fmt_(now, 'yyyy-MM-dd');
  var m = minOfDay_(now);
  if (!isSchoolDay_(c, now) || m < 300 || m > 20 * 60) return;
  var props = PropertiesService.getScriptProperties();
  var endMin = hhmm_(c.GIO_KET_THUC_THEO_DOI);
  var lostAfter = num_(c.MAT_TIN_HIEU_SAU_PHUT) * 60000;

  var sh = sheet_(SH.HT);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (fmtDateCell_(r[1]) !== date) continue;
    var state = r[2];
    if (state !== 'TRONG' && state !== 'NGOAI') continue;
    if (m >= endMin) {
      // Hết ca: chốt số phút ngoài vùng nếu SV vẫn đang ở ngoài
      if (state === 'NGOAI' && r[8]) {
        var endTs = deadlineDate_(now, c.GIO_KET_THUC_THEO_DOI).getTime();
        var outMin = Number(r[10] || 0) + Math.max(0, Math.round((endTs - Number(r[8])) / 60000));
        sh.getRange(i + 1, 11).setValue(outMin);
        var rec = findCheckin_(date, normId_(r[0]));
        if (rec) sheet_(SH.DD).getRange(rec.row, 18).setValue(outMin);
      }
      sh.getRange(i + 1, 3).setValue('HET_CA');
      continue;
    }
    var lost = r[12] === true || r[12] === 'TRUE';
    if (String(r[11]) === 'android' && !lost && m >= hhmm_(c.GIO_HAN_DIEM_DANH) && now.getTime() - Number(r[5]) > lostAfter) {
      sh.getRange(i + 1, 13).setValue(true);
      log_(date, normId_(r[0]), r[13], 'MAT_TIN_HIEU', r[3], r[4], '', '', 'Không nhận vị trí từ ' + fmt_(new Date(Number(r[5])), 'HH:mm') +
        ' (tắt GPS, tắt app, hết pin hoặc mất mạng)');
    }
  }

  [['GIO_BAO_CAO_DAU_GIO', 'DAU_GIO'], ['GIO_BAO_CAO_CUOI_CA', 'CUOI_CA']].forEach(function (k) {
    var key = 'report_' + date + '_' + k[1];
    if (c[k[0]] && m >= hhmm_(c[k[0]]) && !props.getProperty(key)) {
      props.setProperty(key, '1');
      makeReport_(date, k[1]);
    }
  });
}

/* ============================ BÁO CÁO PDF KÈM ẢNH ============================ */

function makeReport_(date, kind) {
  var c = cfg_();
  var now = new Date();
  var students = allStudents_();
  var rows = sheet_(SH.DD).getDataRange().getValues().slice(1).filter(function (r) { return fmtDateCell_(r[0]) === date; });
  var events = sheet_(SH.SK).getDataRange().getValues().slice(1).filter(function (r) {
    return fmtDateCell_(r[1]) === date && ['DIEM_DANH', 'XAC_NHAN', 'DANG_KY_TRUNG_MAT'].indexOf(r[4]) < 0;
  });
  var byId = {};
  rows.forEach(function (r) { byId[normId_(r[2])] = r; });
  var absent = students.filter(function (s) { return !byId[s.mssv]; });
  var onTime = rows.filter(function (r) { return r[5] === 'Đúng giờ'; }).length;
  var late = rows.length - onTime;
  var leaveIds = {}, fakeIds = {};
  events.forEach(function (e) {
    if (e[4] === 'ROI_VUNG') leaveIds[normId_(e[2])] = true;
    if (['GIA_LAP_VI_TRI', 'CO_APP_FAKE_GPS', 'NGHI_GIA_LAP'].indexOf(e[4]) >= 0) fakeIds[normId_(e[2])] = true;
  });
  var dParts = date.split('-');
  var dateVN = dParts[2] + '/' + dParts[1] + '/' + dParts[0];
  var kindVN = kind === 'DAU_GIO' ? 'đầu giờ' : (kind === 'CUOI_CA' ? 'cuối ca' : 'tạo thủ công');
  var A = DocumentApp.HorizontalAlignment;

  var doc = DocumentApp.create('BaoCao_DiemDanh_' + date + '_' + kind);
  var body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(40).setMarginRight(40);
  var p0 = body.getParagraphs()[0];
  p0.setText('BV TLS – BỆNH VIỆN TIỀN LÂM SÀNG');
  styleP_(p0, { size: 10, bold: true });
  para_(body, 'BÁO CÁO ĐIỂM DANH LÂM SÀNG', { size: 16, bold: true, align: A.CENTER, before: 10 });
  var siteNames = sites_(c).map(function (x) { return x.name; });
  para_(body, 'Cơ sở thực tập: ' + siteNames.join(', '), { size: 12, align: A.CENTER });
  para_(body, 'Ngày ' + dateVN + ' – báo cáo ' + kindVN + ', lập lúc ' + fmt_(now, 'HH:mm'), { size: 11, italic: true, align: A.CENTER });
  para_(body, 'Mục đích: ' + PURPOSE.charAt(0).toLowerCase() + PURPOSE.slice(1) + '.', { size: 10, italic: true, align: A.CENTER, after: 10 });
  para_(body, 'Tổng số sinh viên: ' + students.length + '   |   Đúng giờ (trước ' + c.GIO_HAN_DIEM_DANH + '): ' + onTime +
    '   |   Trễ: ' + late + '   |   Vắng: ' + absent.length + '   |   Có rời vùng: ' +
    Object.keys(leaveIds).length + '   |   Nghi/giả lập vị trí: ' + Object.keys(fakeIds).length, { size: 11, bold: true });

  para_(body, '1. Danh sách đã điểm danh', { size: 12, bold: true, before: 10 });
  if (rows.length) {
    rows.sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); });
    var t = body.appendTable([['STT', 'Ảnh điểm danh', 'Sinh viên', 'Giờ, vị trí', 'Trạng thái', 'Xác nhận giữa ca', 'Rời vùng', 'Ghi chú']]);
    styleHeader_(t.getRow(0));
    rows.forEach(function (r, idx) {
      var tr = t.appendTableRow();
      tr.appendTableCell(String(idx + 1));
      var imgCell = tr.appendTableCell('');
      try {
        var img = imgCell.getChild(0).asParagraph().appendInlineImage(DriveApp.getFileById(r[20]).getBlob());
        var w = img.getWidth(), h = img.getHeight(), W = 78;
        img.setWidth(W).setHeight(Math.round(h * W / w));
      } catch (e) { imgCell.setText('(không tải được ảnh)'); }
      tr.appendTableCell(r[3] + '\n' + r[2] + (r[4] ? '\n' + r[4] : '') + (fakeIds[normId_(r[2])] ? '\n(!) Nghi giả lập vị trí' : ''));
      tr.appendTableCell(fmtTimeCell_(r[1]) + '\n' + siteName_(c, r[21]) + '\n' + r[7] + ' m (±' + r[8] + ')');
      tr.appendTableCell(r[5] === 'Đúng giờ' ? 'Đúng giờ' : 'Trễ ' + r[6] + ' phút');
      tr.appendTableCell(slotSummary_(c, now, date, { time: fmtTimeCell_(r[1]), confirms: splitList_(r[15]) }));
      tr.appendTableCell((r[16] || 0) + ' lần' + (r[17] ? '\n' + r[17] + ' phút' : ''));
      tr.appendTableCell(String(r[13] || ''));
    });
    tableFont_(t, 9.5);
    setWidths_(t, [24, 84, 104, 58, 50, 62, 46, 87]);
  } else {
    para_(body, 'Chưa có sinh viên điểm danh.', {});
  }

  para_(body, '2. Sinh viên vắng (chưa điểm danh)', { size: 12, bold: true, before: 12 });
  if (absent.length) {
    var t2 = body.appendTable([['STT', 'MSSV', 'Họ tên', 'Nhóm/Lớp']]);
    styleHeader_(t2.getRow(0));
    absent.forEach(function (s, i) {
      var tr = t2.appendTableRow();
      tr.appendTableCell(String(i + 1)); tr.appendTableCell(s.mssv); tr.appendTableCell(s.name); tr.appendTableCell(s.group || '');
    });
    tableFont_(t2, 10);
  } else {
    para_(body, 'Không có.', {});
  }

  para_(body, '3. Sự kiện vị trí và cảnh báo', { size: 12, bold: true, before: 12 });
  if (events.length) {
    var t3 = body.appendTable([['Giờ', 'MSSV', 'Họ tên', 'Sự kiện', 'Cách tâm', 'Chi tiết']]);
    styleHeader_(t3.getRow(0));
    events.forEach(function (e) {
      var tr = t3.appendTableRow();
      tr.appendTableCell(String(e[0]).substr(11, 5)); tr.appendTableCell(String(e[2])); tr.appendTableCell(String(e[3]));
      tr.appendTableCell(eventLabel_(e[4])); tr.appendTableCell(e[5] !== '' ? e[5] + ' m' : '');
      tr.appendTableCell(String(e[9] || ''));
    });
    tableFont_(t3, 9.5);
  } else {
    para_(body, 'Không ghi nhận sự kiện bất thường.', {});
  }

  var msgs = messagesOn_(date);
  if (msgs.length) {
    para_(body, '4. Thông báo và yêu cầu của giảng viên', { size: 12, bold: true, before: 12 });
    var t4 = body.appendTable([['Gửi lúc', 'Giảng viên', 'Sinh viên', 'Loại', 'Nội dung', 'Kết quả']]);
    styleHeader_(t4.getRow(0));
    msgs.forEach(function (m) {
      var tr = t4.appendTableRow();
      tr.appendTableCell(m.sentAt); tr.appendTableCell(m.lecturer); tr.appendTableCell(m.studentName + '\n' + m.mssv);
      tr.appendTableCell(m.type === 'XN' ? 'Yêu cầu xác nhận có mặt' : 'Thông báo'); tr.appendTableCell(m.text);
      tr.appendTableCell(m.status + (m.ackAt ? ' lúc ' + m.ackAt : '') + (m.result ? '\n' + m.result : ''));
    });
    tableFont_(t4, 9.5);
  }

  para_(body, 'Ghi chú: Giờ lấy theo máy chủ (GMT+7). Khoảng cách tính từ tâm vùng điểm danh đã cấu hình. ' +
    'Android được theo dõi vị trí liên tục đến ' + c.GIO_KET_THUC_THEO_DOI + '. iPhone (web) chỉ gửi vị trí khi đang mở ứng dụng, ' +
    'việc có mặt được kiểm soát thêm bằng xác nhận khuôn mặt giữa ca.', { size: 9, italic: true, before: 12 });
  para_(body, 'Từ BV TLS – ' + APP.CREDIT, { size: 10, bold: true, align: A.RIGHT });
  doc.saveAndClose();

  var folder = folderPath_(['Bao cao', date.substr(0, 7)]);
  var name = 'BaoCao_DiemDanh_' + date + '_' + kind + '.pdf';
  var old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  var docFile = DriveApp.getFileById(doc.getId());
  var pdf = folder.createFile(docFile.getAs(MimeType.PDF).setName(name));
  pdf.setDescription('Báo cáo điểm danh ' + dateVN + ' – ' + siteNames.join(', ') + ' – Từ BV TLS – ' + APP.CREDIT);
  docFile.setTrashed(true);

  if (bool_(c.GUI_EMAIL_BAO_CAO)) {
    notify_('[BV TLS] Báo cáo điểm danh ' + dateVN + ' – ' + kindVN,
      'Báo cáo điểm danh lâm sàng tại ' + siteNames.join(', ') + ' ngày ' + dateVN + '.\n' +
      'Đúng giờ: ' + onTime + ' | Trễ: ' + late + ' | Vắng: ' + absent.length + ' | Có rời vùng: ' + Object.keys(leaveIds).length +
      ' | Nghi giả lập: ' + Object.keys(fakeIds).length + '\n\nFile trên Drive: ' + pdf.getUrl() + '\n\nTừ BV TLS – ' + APP.CREDIT, [pdf.getBlob()]);
  }
  return pdf.getUrl();
}

function para_(body, text, o) { var p = body.appendParagraph(text); styleP_(p, o); return p; }
function styleP_(p, o) {
  var a = {};
  a[DocumentApp.Attribute.FONT_FAMILY] = 'Times New Roman';
  a[DocumentApp.Attribute.FONT_SIZE] = o.size || 11;
  a[DocumentApp.Attribute.BOLD] = !!o.bold;
  a[DocumentApp.Attribute.ITALIC] = !!o.italic;
  p.setAttributes(a);
  p.setAlignment(o.align || DocumentApp.HorizontalAlignment.LEFT);
  if (o.before) p.setSpacingBefore(o.before);
  if (o.after) p.setSpacingAfter(o.after);
}
function styleHeader_(row) {
  for (var i = 0; i < row.getNumCells(); i++) {
    var cell = row.getCell(i);
    cell.setBackgroundColor('#b3261e');
    cell.editAsText().setForegroundColor('#ffffff').setBold(true);
  }
}
function tableFont_(t, size) {
  var a = {}; a[DocumentApp.Attribute.FONT_FAMILY] = 'Times New Roman'; a[DocumentApp.Attribute.FONT_SIZE] = size;
  t.setAttributes(a);
  for (var r = 1; r < t.getNumRows(); r++) t.getRow(r).editAsText().setBold(false).setItalic(false).setForegroundColor('#000000');
}
function setWidths_(t, ws) { for (var i = 0; i < ws.length; i++) try { t.setColumnWidth(i, ws[i]); } catch (e) {} }
function eventLabel_(code) {
  return ({
    ROI_VUNG: 'Rời vùng', QUAY_LAI: 'Quay lại', MAT_TIN_HIEU: 'Mất tín hiệu', CO_TIN_HIEU_LAI: 'Có tín hiệu lại',
    GIA_LAP_VI_TRI: 'Giả lập vị trí', DOI_THIET_BI: 'Đổi điện thoại', DOI_THIET_BI_LOI: 'Đổi điện thoại thất bại', XN_GIANG_VIEN: 'Xác nhận theo yêu cầu GV', CO_APP_FAKE_GPS: 'Cài app fake GPS', NGHI_GIA_LAP: 'Nghi giả lập', MAY_ROOT: 'Máy đã root',
    MAT_KHONG_KHOP: 'Mặt không khớp', MAT_GIONG_SV_KHAC: 'Mặt giống SV khác',
    SAI_THIET_BI: 'Sai thiết bị', THIET_BI_DUNG_CHUNG: 'Thiết bị dùng chung'
  })[code] || code;
}

/* ============================ MỐC XÁC NHẬN GIỮA CA ============================ */

function slots_(c) {
  return String(c.XAC_NHAN_GIUA_CA || '').split(',').map(function (s) {
    var m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
  }).filter(String).sort();
}
function openSlot_(c, now) {
  var m = minOfDay_(now), w = num_(c.XAC_NHAN_CUA_SO_PHUT);
  var s = slots_(c);
  for (var i = 0; i < s.length; i++) if (m >= hhmm_(s[i]) && m < hhmm_(s[i]) + w) return s[i];
  return '';
}
/** Trạng thái từng mốc: done | open | upcoming | missed | na (điểm danh sau khi mốc đã đóng) */
function slotStatus_(c, now, rec) {
  var m = minOfDay_(now), w = num_(c.XAC_NHAN_CUA_SO_PHUT);
  var ci = rec && rec.time ? hhmm_(String(rec.time).substr(0, 5)) : 0;
  var confirms = (rec && rec.confirms) || [];
  return slots_(c).map(function (s) {
    var st = hhmm_(s), status;
    if (confirms.indexOf(s) >= 0) status = 'done';
    else if (ci >= st + w) status = 'na';
    else if (m < st) status = 'upcoming';
    else if (m < st + w) status = 'open';
    else status = 'missed';
    return { time: s, end: mm2hhmm_(st + w), status: status };
  });
}
function slotSummary_(c, now, date, rec) {
  var ref = date === today_() ? now : deadlineDate_(now, '23:59');
  var list = slotStatus_(c, ref, rec).filter(function (x) { return x.status !== 'na'; });
  if (!list.length) return '–';
  var done = list.filter(function (x) { return x.status === 'done'; }).length;
  var missed = list.filter(function (x) { return x.status === 'missed'; }).map(function (x) { return x.time; });
  return done + '/' + list.length + (missed.length ? '\nThiếu: ' + missed.join(', ') : '');
}

/* ============================ DỮ LIỆU ============================ */

function cfg_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('cfg');
  if (hit) return JSON.parse(hit);
  var o = {};
  DEFAULT_CONFIG.forEach(function (r) { o[r[0]] = r[1]; });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.CFG);
  if (sh) {
    sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) {
      if (!r[0]) return;
      var v = String(r[1]).trim();
      var tm = v.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
      if (tm) v = ('0' + tm[1]).slice(-2) + ':' + tm[2];
      o[String(r[0]).trim()] = v;
    });
  }
  cache.put('cfg', JSON.stringify(o), 120);
  return o;
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Chưa có sheet ' + name + '. Chạy menu BV TLS > Cài đặt lần đầu.');
  return sh;
}

function allStudents_() {
  var vals = sheet_(SH.SV).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    var desc = null;
    if (r[8]) { try { desc = JSON.parse(r[8]); } catch (e) { desc = null; } }
    out.push({ row: i + 1, mssv: normId_(r[0]), name: String(r[1]).trim(), group: String(r[2] || '').trim(), desc: desc, device: String(r[6] || '').trim() });
  }
  return out;
}

function findStudent_(mssv) {
  var all = allStudents_();
  for (var i = 0; i < all.length; i++) if (all[i].mssv === mssv) return all[i];
  return null;
}

function findCheckin_(date, mssv) {
  var vals = sheet_(SH.DD).getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    var r = vals[i];
    if (fmtDateCell_(r[0]) === date && normId_(r[2]) === mssv) {
      return { row: i + 1, time: fmtTimeCell_(r[1]), name: r[3], status: r[5], late: r[6], confirms: splitList_(r[15]), site: String(r[21] || '') };
    }
  }
  return null;
}

function deviceUsedToday_(date, deviceId, mssv) {
  if (!deviceId) return '';
  var vals = sheet_(SH.DD).getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (fmtDateCell_(r[0]) === date && String(r[19]) === String(deviceId) && normId_(r[2]) !== mssv) return normId_(r[2]);
  }
  return '';
}

function findLive_(mssv) {
  var vals = sheet_(SH.HT).getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (normId_(r[0]) === mssv) {
      return { row: i + 1, date: fmtDateCell_(r[1]), state: r[2], dist: r[3], acc: r[4], last: Number(r[5]) || 0,
        outCount: Number(r[7]) || 0, outSince: r[8], leaves: Number(r[9]) || 0, outMin: Number(r[10]) || 0,
        platform: String(r[11] || ''), lost: r[12] === true || r[12] === 'TRUE', lat: r[14], lng: r[15], flags: String(r[16] || '') };
    }
  }
  return null;
}

function setLive_(mssv, name, date, o) {
  var sh = sheet_(SH.HT);
  var row = [mssv, date, o.state, o.dist, o.acc, o.last, o.last ? fmt_(new Date(o.last), 'HH:mm:ss') : '',
    o.outCount || 0, o.outSince || '', o.leaves || 0, o.outMin || 0, o.platform || '', !!o.lost, name,
    o.lat === undefined ? '' : o.lat, o.lng === undefined ? '' : o.lng, o.flags || ''];
  var ex = findLive_(mssv);
  if (ex) sh.getRange(ex.row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function updateCheckinStats_(row, live) { sheet_(SH.DD).getRange(row, 17, 1, 2).setValues([[live.leaves || 0, live.outMin || 0]]); }

function log_(date, mssv, name, ev, dist, acc, lat, lng, detail) {
  var now = new Date();
  sheet_(SH.SK).appendRow([fmt_(now, 'yyyy-MM-dd HH:mm:ss'), date || fmt_(now, 'yyyy-MM-dd'), mssv, name, ev, dist, acc, lat, lng, detail]);
}

/* ============================ DRIVE & EMAIL ============================ */

function getRootFolder_() {
  var c = cfg_();
  var id = c.THU_MUC_GOC_ID || PropertiesService.getScriptProperties().getProperty('ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('Diem danh BV San Nhi Kien Giang - BV TLS');
  f.setDescription('Ảnh và báo cáo điểm danh lâm sàng – Từ BV TLS – ' + APP.CREDIT);
  PropertiesService.getScriptProperties().setProperty('ROOT_ID', f.getId());
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.CFG);
  if (sh) {
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) if (vals[i][0] === 'THU_MUC_GOC_ID') sh.getRange(i + 1, 2).setValue(f.getId());
  }
  CacheService.getScriptCache().remove('cfg');
  return f;
}

function folderPath_(parts) {
  var cacheKey = 'fold_' + parts.join('/');
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if (hit) { try { return DriveApp.getFolderById(hit); } catch (e) {} }
  var f = getRootFolder_();
  parts.forEach(function (name) {
    var it = f.getFoldersByName(name);
    f = it.hasNext() ? it.next() : f.createFolder(name);
  });
  cache.put(cacheKey, f.getId(), 21600);
  return f;
}

function savePhoto_(dataUrl, folder, name, desc) {
  if (!dataUrl) throw new Error('Thiếu ảnh');
  var b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
  var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name));
  if (desc) f.setDescription(desc);
  return f;
}

function notify_(subject, text, attachments) {
  var to = cfg_().EMAIL_NHAN_BAO_CAO || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var opt = { name: 'BV TLS – Điểm danh' };
  if (attachments) opt.attachments = attachments;
  try { MailApp.sendEmail(to, subject, text, opt); } catch (e) { console.error(e); }
}

/* ============================ TIỆN ÍCH ============================ */

function today_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function fmt_(d, p) { return Utilities.formatDate(d, TZ, p); }
function num_(v) {
  var t = String(v == null ? '' : v).trim().replace(/\s+/g, '');
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');          // 0,5 kiểu Việt Nam
  return Number(t);
}
/** Ngưỡng khuôn mặt hợp lệ trong khoảng 0.2–0.9, sai định dạng thì dùng mặc định. */
function thr_(v, def) { var n = num_(v); return n >= 0.2 && n <= 0.9 ? n : def; }
/** Đọc 1 số tọa độ: chấp nhận 9.97 | 9,97 | có khoảng trắng, ký hiệu độ. */
function coordNum_(t) {
  t = String(t || '').replace(/[°\s]/g, '');
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  var n = Number(t);
  return isFinite(n) && t !== '' ? n : NaN;
}
/** Tách các số trong một ô: chấp nhận cả cặp "9.97314, 105.09757" dán từ Google Maps. */
function coordList_(v) {
  return String(v == null ? '' : v).trim().split(/\s*[;\/]\s*|,\s+|\s+/).map(coordNum_).filter(function (n) { return isFinite(n); });
}
function okLat_(n) { return isFinite(n) && n >= -90 && n <= 90 && n !== 0; }
function okLng_(n) { return isFinite(n) && n >= -180 && n <= 180 && n !== 0; }
/** Lấy vĩ độ, kinh độ từ 2 ô; nếu một ô chứa cả cặp tọa độ thì tự tách. */
function latLng_(a, b) {
  var la = coordList_(a), lb = coordList_(b);
  var lat = la.length ? la[0] : NaN, lng = lb.length ? lb[lb.length - 1] : NaN;
  if (la.length >= 2 && !okLng_(lng)) lng = la[1];
  if (lb.length >= 2 && !okLat_(lat)) lat = lb[0];
  if (!vnLat_(lat)) lat = fixDigits_(a, vnLat_);
  if (!vnLng_(lng)) lng = fixDigits_(String(b == null ? '' : b).trim() ? b : a, vnLng_, true);
  return { lat: okLat_(lat) ? lat : NaN, lng: okLng_(lng) ? lng : NaN };
}
function vnLat_(n) { return isFinite(n) && n >= 8 && n <= 23.5; }
function vnLng_(n) { return isFinite(n) && n >= 102 && n <= 110; }
/**
 * Google Sheet tiếng Việt hay tự đổi 10.0171240 thành số 100171240 (hiện 100.171.240).
 * Lấy lại các chữ số rồi đặt dấu thập phân sao cho rơi vào vùng tọa độ Việt Nam.
 */
function fixDigits_(v, ok, last) {
  var parts = String(v == null ? '' : v).split(/,\s+|;|\s+/).filter(String);
  var t = last ? parts[parts.length - 1] : parts[0];
  var digits = String(t || '').replace(/[^0-9]/g, '');
  if (digits.length < 3) return NaN;
  for (var k = 1; k <= 3; k++) {
    var n = Number(digits.slice(0, k) + '.' + digits.slice(k));
    if (ok(n)) return n;
  }
  return NaN;
}
function kgLatLng_(c) {
  var ll = latLng_(c.VI_DO, c.KINH_DO);
  return { lat: isFinite(ll.lat) ? ll.lat : 9.9731417, lng: isFinite(ll.lng) ? ll.lng : 105.0975708 };
}
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function truthy_(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function normId_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function hhmm_(s) { var p = String(s).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function mm2hhmm_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function minOfDay_(d) { return hhmm_(fmt_(d, 'HH:mm')); }
function splitList_(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
function isSchoolDay_(c, d) {
  var thu = Number(fmt_(d || new Date(), 'u')) + 1; // 'u': 1 = thứ Hai ... 7 = Chủ nhật → 2..8
  return String(c.NGAY_HOC).split(',').map(function (x) { return Number(String(x).trim()); }).indexOf(thu) >= 0;
}
function deadlineDate_(now, hhmm) {
  return Utilities.parseDate(fmt_(now, 'yyyy-MM-dd') + ' ' + hhmm + ':00', TZ, 'yyyy-MM-dd HH:mm:ss');
}
function fmtDateCell_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v).substr(0, 10); }
function fmtTimeCell_(v) { return v instanceof Date ? fmt_(v, 'HH:mm:ss') : String(v || ''); }
function slug_(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function haversine_(lat1, lon1, lat2, lon2) {
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function effDist_(dist, acc, c) { return Math.max(0, dist - Math.min(acc, num_(c.SAI_SO_GPS_CHO_PHEP_M))); }
function validDesc_(a) {
  if (!a || a.length !== 128) return false;
  for (var i = 0; i < 128; i++) if (typeof a[i] !== 'number' || !isFinite(a[i])) return false;
  return true;
}
function euclid_(a, b) { var s = 0; for (var i = 0; i < 128; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function meanDesc_(arr) {
  var m = []; for (var i = 0; i < 128; i++) m.push(0);
  arr.forEach(function (a) { for (var i = 0; i < 128; i++) m[i] += a[i] / arr.length; });
  return m;
}


/* ============================ GIẢNG VIÊN VÀ THÔNG BÁO ============================ */

function secret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}
function sign_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret_())); }
function makeToken_(user) {
  var body = user + '|' + (Date.now() + 14 * 3600 * 1000);
  return Utilities.base64EncodeWebSafe(body, Utilities.Charset.UTF_8) + '.' + sign_(body);
}
function lecFromToken_(token) {
  try {
    var parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    var body = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8');
    if (sign_(body) !== parts[1]) return null;
    var bits = body.split('|');
    if (Number(bits[1]) < Date.now()) return null;
    return findLecturer_(bits[0]);
  } catch (e) { return null; }
}
function findLecturer_(user) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.GV);
  if (!sh) return null;
  var vals = sh.getDataRange().getDisplayValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === String(user).trim().toLowerCase() && vals[i][0]) {
      return { user: String(vals[i][0]).trim(), pass: String(vals[i][1]), name: String(vals[i][2]).trim() || String(vals[i][0]).trim(),
        groups: String(vals[i][3] || '').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(String) };
    }
  }
  return null;
}
function lecStudents_(lec) {
  return allStudents_().filter(function (s) { return !lec.groups.length || lec.groups.indexOf(String(s.group).toUpperCase()) >= 0; });
}

function apiLecLogin_(d) {
  var user = String(d.user || '').trim(), cache = CacheService.getScriptCache();
  var key = 'lecfail_' + user.toLowerCase();
  var fails = Number(cache.get(key) || 0);
  if (fails >= 5) return { ok: false, msg: 'Nhập sai quá 5 lần. Thử lại sau 10 phút.' };
  var lec = findLecturer_(user);
  if (!lec || !lec.pass || String(d.pass || '') !== lec.pass) {
    cache.put(key, String(fails + 1), 600);
    return { ok: false, msg: 'Sai tài khoản hoặc mật khẩu.' };
  }
  cache.remove(key);
  log_('', '', lec.name, 'GV_DANG_NHAP', '', '', '', '', 'Tài khoản ' + lec.user);
  return { ok: true, token: makeToken_(lec.user), name: lec.name, serverTime: Date.now() };
}

function apiLecOverview_(d) {
  var lec = lecFromToken_(d.token);
  if (!lec) return { ok: false, code: 'AUTH', msg: 'Phiên đăng nhập đã hết hạn, đăng nhập lại.' };
  var c = cfg_(), now = new Date(), date = fmt_(now, 'yyyy-MM-dd');
  var students = lecStudents_(lec);
  var dd = {}, ht = {};
  sheet_(SH.DD).getDataRange().getValues().slice(1).forEach(function (r) { if (fmtDateCell_(r[0]) === date) dd[normId_(r[2])] = r; });
  sheet_(SH.HT).getDataRange().getValues().slice(1).forEach(function (r) { if (fmtDateCell_(r[1]) === date) ht[normId_(r[0])] = r; });
  var mine = {};
  students.forEach(function (s) { mine[s.mssv] = true; });
  var list = students.map(function (s) {
    var r = dd[s.mssv], h = ht[s.mssv];
    return {
      mssv: s.mssv, name: s.name, group: s.group, enrolled: !!s.desc,
      checkin: r ? { time: fmtTimeCell_(r[1]).substr(0, 5), status: r[5], late: r[6], dist: r[7], note: String(r[13] || ''), site: String(r[21] || ''), siteName: siteName_(c, r[21]),
        slots: slotSummary_(c, now, date, { time: fmtTimeCell_(r[1]), confirms: splitList_(r[15]) }).replace('\n', ' '),
        leaves: Number(r[16] || 0), outMin: Number(r[17] || 0), platform: String(r[18] || '') } : null,
      live: h ? { state: h[2], dist: h[3], last: h[6], lost: h[12] === true || h[12] === 'TRUE' } : null
    };
  });
  var msgs = messagesOn_(date).filter(function (m) { return mine[m.mssv]; });
  return { ok: true, serverTime: Date.now(), config: publicConfig_(c), lecturer: { name: lec.name, user: lec.user },
    date: date, students: list, messages: msgs.reverse() };
}

function apiLecSend_(d) {
  var lec = lecFromToken_(d.token);
  if (!lec) return { ok: false, code: 'AUTH', msg: 'Phiên đăng nhập đã hết hạn, đăng nhập lại.' };
  var type = d.type === 'XN' ? 'XN' : 'TB';
  var text = String(d.text || '').trim().substr(0, 500);
  if (!text) text = type === 'XN' ? 'Giảng viên yêu cầu bạn xác nhận có mặt ngay.' : '';
  if (!text) return { ok: false, msg: 'Chưa nhập nội dung thông báo.' };
  var minutes = type === 'XN' ? Math.max(1, Math.min(60, Number(d.minutes) || 10)) : '';
  var allowed = {};
  lecStudents_(lec).forEach(function (s) { allowed[s.mssv] = s; });
  var ids = (d.mssv || []).map(normId_).filter(function (x) { return allowed[x]; });
  if (!ids.length) return { ok: false, msg: 'Chưa chọn sinh viên.' };
  var now = new Date(), date = fmt_(now, 'yyyy-MM-dd'), t = fmt_(now, 'HH:mm:ss');
  var rows = ids.map(function (m) {
    return [Utilities.getUuid().substr(0, 8), date, t, lec.name, m, allowed[m].name, type, text, minutes, 'Đã gửi', '', '', ''];
  });
  var sh = sheet_(SH.TB);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { ok: true, count: rows.length, msg: 'Đã gửi đến ' + rows.length + ' sinh viên.' };
}

/** Thông báo trong ngày của 1 sinh viên chưa xử lý xong. Đánh dấu "Đã nhận" khi điện thoại tải về. */
function inbox_(mssv, deviceId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.TB);
  if (!sh || sh.getLastRow() < 2) return [];
  var now = new Date(), date = fmt_(now, 'yyyy-MM-dd'), nowStr = fmt_(now, 'HH:mm:ss');
  var vals = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (fmtDateCell_(r[1]) !== date || normId_(r[4]) !== mssv) continue;
    var status = String(r[9]);
    if (status !== 'Đã gửi' && status !== 'Đã nhận') continue;
    var sent = fmtTimeCell_(r[2]);
    var deadline = '';
    if (r[6] === 'XN') {
      var endTs = Utilities.parseDate(date + ' ' + sent, TZ, 'yyyy-MM-dd HH:mm:ss').getTime() + Number(r[8] || 10) * 60000;
      if (now.getTime() > endTs) { sh.getRange(i + 1, 10).setValue('Quá hạn'); continue; }
      deadline = fmt_(new Date(endTs), 'HH:mm');
    }
    if (status === 'Đã gửi') { sh.getRange(i + 1, 10, 1, 2).setValues([['Đã nhận', nowStr]]); }
    out.push({ id: String(r[0]), type: r[6], text: String(r[7]), from: String(r[3]), sentAt: sent.substr(0, 5), deadline: deadline });
  }
  return out;
}

function messagesOn_(date) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.TB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(function (r) { return fmtDateCell_(r[1]) === date; }).map(function (r) {
    return { id: String(r[0]), sentAt: fmtTimeCell_(r[2]).substr(0, 5), lecturer: String(r[3]), mssv: normId_(r[4]), studentName: String(r[5]),
      type: String(r[6]), text: String(r[7]), minutes: r[8], status: String(r[9]), recvAt: fmtTimeCell_(r[10]).substr(0, 5),
      ackAt: fmtTimeCell_(r[11]).substr(0, 5), result: String(r[12] || '') };
  });
}

function findMessage_(id, mssv) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.TB);
  if (!sh) return null;
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id) && normId_(vals[i][4]) === mssv) return { row: i + 1, r: vals[i], sh: sh };
  }
  return null;
}

function apiInbox_(d) { return { ok: true, serverTime: Date.now(), inbox: inbox_(normId_(d.mssv), d.deviceId) }; }

function apiAck_(d) {
  var m = findMessage_(d.id, normId_(d.mssv));
  if (!m) return { ok: false, msg: 'Không tìm thấy thông báo.' };
  if (m.r[6] !== 'TB') return { ok: false, msg: 'Yêu cầu này phải xác nhận bằng khuôn mặt.' };
  m.sh.getRange(m.row, 10, 1, 3).setValues([['Đã xem', m.r[10] || fmt_(new Date(), 'HH:mm:ss'), fmt_(new Date(), 'HH:mm:ss')]]);
  return { ok: true };
}

function apiAnswer_(d) {
  var c = cfg_(), now = new Date(), date = fmt_(now, 'yyyy-MM-dd'), mssv = normId_(d.mssv);
  var m = findMessage_(d.id, mssv);
  if (!m || m.r[6] !== 'XN') return { ok: false, msg: 'Không tìm thấy yêu cầu xác nhận.' };
  var status = String(m.r[9]);
  if (status === 'Có mặt') return { ok: false, msg: 'Bạn đã xác nhận yêu cầu này rồi.' };
  var sent = fmtTimeCell_(m.r[2]);
  var endTs = Utilities.parseDate(fmtDateCell_(m.r[1]) + ' ' + sent, TZ, 'yyyy-MM-dd HH:mm:ss').getTime() + Number(m.r[8] || 10) * 60000;
  if (fmtDateCell_(m.r[1]) !== date || now.getTime() > endTs) {
    m.sh.getRange(m.row, 10).setValue('Quá hạn');
    return { ok: false, msg: 'Yêu cầu đã quá hạn.' };
  }
  var recA = findCheckin_(date, mssv);
  var v = verify_(d, c, date, 'out', 'Xác nhận theo yêu cầu GV', siteFor_(c, (recA && recA.site) || d.site, d.lat, d.lng));
  if (v.err) {
    m.sh.getRange(m.row, 13).setValue('Lần thử lỗi lúc ' + fmt_(now, 'HH:mm') + ': ' + v.err);
    return { ok: false, msg: v.err };
  }
  var file = savePhoto_(d.photo, folderPath_(['Anh xac nhan giang vien', date.substr(0, 7), date]),
    date + '_' + fmt_(now, 'HHmmss') + '_' + mssv + '_' + slug_(v.st.name) + '.jpg',
    'Xác nhận có mặt theo yêu cầu của ' + m.r[3] + ' – ' + v.st.name + ' (' + mssv + ') – ' + APP.BRAND);
  var t = fmt_(now, 'HH:mm:ss');
  m.sh.getRange(m.row, 10, 1, 4).setValues([['Có mặt', m.r[10] || t, t, 'Cách tâm ' + Math.round(v.dist) + ' m | ' + file.getUrl()]]);
  log_(date, mssv, v.st.name, 'XN_GIANG_VIEN', Math.round(v.dist), Math.round(v.acc), v.lat, v.lng, 'Yêu cầu của ' + m.r[3] + ' | ' + file.getUrl());
  return { ok: true, msg: 'Đã xác nhận có mặt, gửi đến ' + m.r[3] + '.' };
}

function normName_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Mã lớp hợp lệ: MA_LOP có thể chứa nhiều mã, cách nhau dấu phẩy. Dạng MÃ=NHÓM chỉ dùng cho sinh viên thuộc nhóm đó. */
function classOk_(c, code, st) {
  var input = String(code || '').trim().toUpperCase();
  if (!input) return false;
  var group = st ? String(st.group || '').trim().toUpperCase() : '';
  return String(c.MA_LOP || '').split(',').some(function (item) {
    var parts = item.split('=');
    var k = String(parts[0] || '').trim().toUpperCase();
    var g = String(parts[1] || '').trim().toUpperCase();
    return k && k === input && (!g || g === group);
  });
}

/** Danh sách mã lớp để sinh viên tích chọn, lấy từ ô MA_LOP: [{ code, group }] */
function classList_(c) {
  var seen = {};
  return String(c.MA_LOP || '').split(',').map(function (item) {
    var parts = item.split('=');
    return { code: String(parts[0] || '').trim().toUpperCase(), group: String(parts[1] || '').trim() };
  }).filter(function (x) { if (!x.code || seen[x.code]) return false; seen[x.code] = true; return true; });
}

/** Kiểm tra thông tin đăng ký lần đầu của sinh viên chưa có trong danh sách. */
function newReg_(c, mssv, code, fullName) {
  if (!bool_(c.CHO_SV_TU_DANG_KY)) return { err: 'Không tìm thấy MSSV ' + mssv + ' trong danh sách. Liên hệ quản trị BV TLS.' };
  if (!/^[A-Z0-9]{4,15}$/.test(mssv)) return { err: 'MSSV chỉ gồm chữ và số, từ 4 đến 15 ký tự.' };
  var input = String(code || '').trim().toUpperCase(), group = null;
  String(c.MA_LOP || '').split(',').forEach(function (item) {
    var parts = item.split('=');
    if (group === null && String(parts[0] || '').trim().toUpperCase() === input && input) group = String(parts[1] || '').trim();
  });
  if (group === null) return { err: 'Mã lớp không đúng.' };
  if (!group) group = input;
  var name = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (name.split(' ').length < 2 || name.length < 5) return { err: 'Nhập đầy đủ họ và tên (có dấu), ví dụ: Nguyễn Văn An.' };
  name = name.split(' ').map(function (w) { return w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase(); }).join(' ');
  return { name: name, group: group };
}


/* ============================ CƠ SỞ THỰC TẬP ============================ */

/** Các cơ sở đang dùng (sheet CoSo). Không có sheet thì dùng 1 cơ sở trong CauHinh. */
function sites_(c) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('sites');
  if (hit) return JSON.parse(hit);
  var out = [];
  var sh = ensureSitesSheet_(c);
  if (sh) {
    sh.getDataRange().getDisplayValues().slice(1).forEach(function (r, idx) {
      var code = String(r[0] || '').trim().toUpperCase();
      if (!code || String(r[7]).trim().toUpperCase() === 'FALSE') return;
      var ll = latLng_(r[3], r[4]), lat = ll.lat, lng = ll.lng;
      if (isFinite(lat) && isFinite(lng) && (String(r[3]).trim() !== String(lat) || String(r[4]).trim() !== String(lng))) {
        try { sh.getRange(idx + 2, 4, 1, 2).setNumberFormat('@').setValues([[String(lat), String(lng)]]); } catch (e) {}
      }
      if (!isFinite(lat) || !isFinite(lng)) return;
      out.push({ code: code, name: String(r[1] || code).trim(), address: String(r[2] || '').trim(), lat: lat, lng: lng,
        r1: num_(r[5]) || num_(c.BAN_KINH_DIEM_DANH_M), r2: num_(r[6]) || num_(c.BAN_KINH_ROI_VUNG_M) });
    });
  }
  if (!out.length) {
    var kg = kgLatLng_(c);
    out.push({ code: 'KG', name: c.TEN_BENH_VIEN, address: c.DIA_CHI, lat: kg.lat, lng: kg.lng,
      r1: num_(c.BAN_KINH_DIEM_DANH_M), r2: num_(c.BAN_KINH_ROI_VUNG_M) });
  }
  cache.put('sites', JSON.stringify(out), 120);
  return out;
}

/** Chọn cơ sở theo mã; không có mã thì lấy cơ sở gần vị trí nhất. */
function siteFor_(c, code, lat, lng) {
  var list = sites_(c);
  var k = String(code || '').trim().toUpperCase();
  for (var i = 0; i < list.length; i++) if (list[i].code === k) return list[i];
  lat = Number(lat); lng = Number(lng);
  if (isFinite(lat) && isFinite(lng) && String(lat) !== '') {
    var best = list[0], bd = 1e12;
    list.forEach(function (s) { var dd = haversine_(lat, lng, s.lat, s.lng); if (dd < bd) { bd = dd; best = s; } });
    return best;
  }
  return list[0];
}

function siteName_(c, code) {
  var k = String(code || '').trim().toUpperCase();
  var list = sites_(c);
  for (var i = 0; i < list.length; i++) if (list[i].code === k) return list[i].name;
  return k || list[0].name;
}


/* ============================ ĐỔI ĐIỆN THOẠI ============================ */

/** Sinh viên đổi điện thoại: đúng họ tên, MSSV, mã lớp và khuôn mặt khớp thì gắn sang điện thoại mới. */
function apiRebind_(d) {
  var c = cfg_(), now = new Date(), date = fmt_(now, 'yyyy-MM-dd');
  var mssv = normId_(d.mssv);
  var st = findStudent_(mssv);
  if (!st) return { ok: false, msg: 'Không tìm thấy MSSV.' };
  if (normName_(d.fullName) !== normName_(st.name)) return { ok: false, msg: 'Họ và tên không khớp với MSSV.' };
  if (!classOk_(c, d.classCode, st)) return { ok: false, msg: 'Mã lớp không đúng.' };
  if (!st.desc) return { ok: false, msg: 'Bạn chưa đăng ký khuôn mặt, hãy đăng ký như lần đầu.' };
  if (!d.deviceId) return { ok: false, msg: 'Không đọc được mã thiết bị.' };
  if (d.platform !== 'android' && d.platform !== 'ios-web') return { ok: false, msg: 'Thiết bị không hợp lệ.' };
  if (!validDesc_(d.descriptor) || Number(d.faceCount) !== 1) return { ok: false, msg: 'Không đọc được khuôn mặt, thử lại.' };
  if (!d.liveness) return { ok: false, msg: 'Chưa vượt qua kiểm tra người thật (nhắm mở mắt).' };
  var all = allStudents_();
  var own = euclid_(d.descriptor, st.desc), nearestOther = 9, nearestId = '';
  for (var i = 0; i < all.length; i++) {
    var o = all[i];
    if (o.mssv === mssv) continue;
    if (bool_(c.KHOA_1_THIET_BI) && o.device && o.device === d.deviceId) {
      return { ok: false, msg: 'Điện thoại này đang gắn với MSSV ' + o.mssv + '. Mỗi sinh viên dùng điện thoại riêng.' };
    }
    if (o.desc) { var dd = euclid_(d.descriptor, o.desc); if (dd < nearestOther) { nearestOther = dd; nearestId = o.mssv; } }
  }
  if (own > thr_(c.NGUONG_KHUON_MAT, 0.5) || nearestOther < own) {
    log_(date, mssv, st.name, 'DOI_THIET_BI_LOI', '', '', '', '', 'Khuôn mặt không khớp (độ lệch ' + own.toFixed(3) + (nearestOther < own ? ', gần MSSV ' + nearestId + ' hơn' : '') + ')');
    return { ok: false, msg: 'Khuôn mặt không khớp với sinh viên ' + st.name + '. Đủ sáng, nhìn thẳng và thử lại, hoặc liên hệ giảng viên.' };
  }
  var usedBy = deviceUsedToday_(date, d.deviceId, mssv);
  if (usedBy) return { ok: false, msg: 'Điện thoại này đã điểm danh cho MSSV ' + usedBy + ' hôm nay.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(SH.SV);
    var oldDev = st.device;
    sh.getRange(st.row, 7).setValue(d.deviceId);
    var note = String(sh.getRange(st.row, 8).getValue() || '');
    sh.getRange(st.row, 8).setValue((note ? note + ' | ' : '') + 'Đổi điện thoại ' + fmt_(now, 'dd/MM/yyyy HH:mm'));
    var url = '';
    if (d.photo) {
      url = savePhoto_(d.photo, folderPath_(['Anh doi thiet bi']), date + '_' + fmt_(now, 'HHmmss') + '_' + mssv + '_' + slug_(st.name) + '.jpg',
        'Xác minh đổi điện thoại – ' + st.name + ' (' + mssv + ') – ' + APP.BRAND).getUrl();
    }
    log_(date, mssv, st.name, 'DOI_THIET_BI', '', '', '', '', 'Thiết bị cũ ' + (oldDev || '(chưa có)') + ' → ' + d.deviceId +
      ' | ' + (d.platform === 'android' ? 'Android' : 'iPhone') + ' | độ lệch mặt ' + own.toFixed(3) + (url ? ' | ' + url : ''));
  } finally { lock.releaseLock(); }
  var r = apiStatus_({ mssv: mssv, deviceId: d.deviceId });
  r.msg = 'Đã chuyển sang điện thoại này.';
  return r;
}


/** Các cơ sở có sẵn. Sheet CoSo được tự tạo với các dòng này nếu chưa có. */
var DEFAULT_SITES = [
  ['NDCT', 'Bệnh viện Nhi Đồng Cần Thơ', '345 Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ', '10.0171240', '105.7391971', '20', '60', 'TRUE']
];

/** Tạo sheet CoSo nếu chưa có, và bổ sung cơ sở mặc định còn thiếu (không ghi đè dòng anh đã sửa). */
function ensureSitesSheet_(c) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SH.CS);
  if (!sh) {
    sh = getOrCreateSheet_(SH.CS, ['Mã', 'Tên cơ sở', 'Địa chỉ', 'Vĩ độ', 'Kinh độ', 'Bán kính điểm danh (m)', 'Bán kính rời vùng (m)', 'Đang dùng (TRUE/FALSE)']);
    sh.getRange('A:H').setNumberFormat('@');
    sh.setColumnWidth(2, 240); sh.setColumnWidth(3, 280);
  }
  var have = {};
  sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) { if (r[0]) have[String(r[0]).trim().toUpperCase()] = true; });
  var rows = [];
  if (!have.KG) { var kg = kgLatLng_(c); rows.push(['KG', c.TEN_BENH_VIEN, c.DIA_CHI, String(kg.lat), String(kg.lng), String(num_(c.BAN_KINH_DIEM_DANH_M) || 20), String(num_(c.BAN_KINH_ROI_VUNG_M) || 60), 'TRUE']); }
  DEFAULT_SITES.forEach(function (r) { if (!have[r[0]]) rows.push(r); });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
    CacheService.getScriptCache().remove('sites');
  }
  return sh;
}

function menuSites() {
  CacheService.getScriptCache().remove('sites');
  var list = sites_(cfg_());
  SpreadsheetApp.getUi().alert('Các cơ sở đang dùng (' + list.length + '):\n\n' + list.map(function (x) {
    return x.code + ' – ' + x.name + '\n   ' + x.lat + ', ' + x.lng + ' | điểm danh ' + x.r1 + ' m, rời vùng ' + x.r2 + ' m';
  }).join('\n'));
}
