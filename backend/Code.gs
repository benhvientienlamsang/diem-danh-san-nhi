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
 */

var APP = { NAME: 'Điểm danh', BRAND: 'BV TLS', CREDIT: 'by Dr Huy - BV TLS', VERSION: '1.1.0' };
var TZ = 'Asia/Ho_Chi_Minh';
var SH = { CFG: 'CauHinh', SV: 'SinhVien', DD: 'DiemDanh', SK: 'SuKienViTri', HT: 'HienTai' };
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
  ['MA_LOP', 'BVTLS2026', 'Mã sinh viên phải nhập khi đăng nhập lần đầu'],
  ['NGUONG_KHUON_MAT', '0.50', 'Độ lệch đặc trưng khuôn mặt tối đa để chấp nhận (nhỏ hơn = chặt hơn)'],
  ['NGUONG_TRUNG_KHUON_MAT', '0.45', 'Khi đăng ký, khuôn mặt gần hơn mức này với SV khác sẽ bị từ chối'],
  ['KHOA_1_THIET_BI', 'TRUE', 'TRUE: mỗi SV chỉ dùng 1 điện thoại đã đăng ký'],
  ['XAC_NHAN_GIUA_CA', '08:30,09:30,10:30', 'Các mốc xác nhận khuôn mặt giữa ca. Để trống = tắt'],
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
    .addToUi();
}

function onEdit(e) {
  try { if (e && e.range && e.range.getSheet().getName() === SH.CFG) CacheService.getScriptCache().remove('cfg'); } catch (err) {}
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
      case 'enroll': return json_(apiEnroll_(d));
      case 'checkin': return json_(apiCheckin_(d));
      case 'confirm': return json_(apiConfirm_(d));
      case 'ping': return json_(apiPing_(d));
      default: return json_({ ok: false, msg: 'Yêu cầu không xác định' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, msg: 'Lỗi máy chủ: ' + (err && err.message ? err.message : err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function publicConfig_(c) {
  return {
    hospital: c.TEN_BENH_VIEN, address: c.DIA_CHI, lat: num_(c.VI_DO), lng: num_(c.KINH_DO),
    checkinRadius: num_(c.BAN_KINH_DIEM_DANH_M), leaveRadius: num_(c.BAN_KINH_ROI_VUNG_M),
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
  if (!st) return { ok: false, code: 'NO_STUDENT', msg: 'Không tìm thấy MSSV ' + mssv + ' trong danh sách. Liên hệ quản trị BV TLS.' };
  if (d.classCode !== undefined && String(d.classCode).trim().toUpperCase() !== String(c.MA_LOP).trim().toUpperCase()) {
    return { ok: false, code: 'BAD_CLASS', msg: 'Mã lớp không đúng.' };
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
      checkin: rec ? { time: rec.time, status: rec.status, late: rec.late } : null,
      slots: rec ? slotStatus_(c, now, rec) : [],
      live: ht && ht.date === date ? { state: ht.state, dist: ht.dist } : null
    }
  };
}

/* ---------- enroll ---------- */
function apiEnroll_(d) {
  var c = cfg_();
  var mssv = normId_(d.mssv);
  if (String(d.classCode || '').trim().toUpperCase() !== String(c.MA_LOP).trim().toUpperCase()) return { ok: false, msg: 'Mã lớp không đúng.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var st = findStudent_(mssv);
    if (!st) return { ok: false, msg: 'Không tìm thấy MSSV trong danh sách.' };
    if (st.desc) return { ok: false, msg: 'MSSV này đã đăng ký khuôn mặt. Muốn đăng ký lại, liên hệ quản trị BV TLS.' };
    var samples = d.descriptors;
    if (!samples || samples.length < 3) return { ok: false, msg: 'Cần ít nhất 3 mẫu khuôn mặt.' };
    for (var i = 0; i < samples.length; i++) if (!validDesc_(samples[i])) return { ok: false, msg: 'Mẫu khuôn mặt không hợp lệ.' };
    for (var a = 0; a < samples.length; a++) for (var b = a + 1; b < samples.length; b++) {
      if (euclid_(samples[a], samples[b]) > 0.45) return { ok: false, msg: 'Các mẫu khuôn mặt không ổn định. Giữ yên điện thoại, đủ sáng và thử lại.' };
    }
    if (!d.liveness) return { ok: false, msg: 'Chưa vượt qua kiểm tra người thật (nhắm mở mắt).' };
    var mean = meanDesc_(samples);
    var all = allStudents_();
    var lockDevice = bool_(c.KHOA_1_THIET_BI);
    for (var k = 0; k < all.length; k++) {
      var o = all[k];
      if (o.mssv === mssv) continue;
      if (o.desc && euclid_(mean, o.desc) < num_(c.NGUONG_TRUNG_KHUON_MAT)) {
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
    sh.getRange(st.row, 4, 1, 4).setValues([['Đã đăng ký', fmt_(new Date(), 'dd/MM/yyyy HH:mm'),
      photoUrl ? '=HYPERLINK("' + photoUrl + '";"Xem ảnh")' : '', d.deviceId || '']]);
    sh.getRange(st.row, 9).setValue(JSON.stringify(mean.map(function (x) { return Math.round(x * 1e5) / 1e5; })));
    return { ok: true, msg: 'Đăng ký khuôn mặt thành công.' };
  } finally { lock.releaseLock(); }
}

/* ---------- kiểm tra chung cho điểm danh và xác nhận ---------- */
function verify_(d, c, date, radius, kindLabel) {
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
  var dist = haversine_(lat, lng, num_(c.VI_DO), num_(c.KINH_DO));
  if (effDist_(dist, acc, c) > radius) {
    return { err: 'Bạn đang cách tâm ' + c.TEN_BENH_VIEN + ' khoảng ' + Math.round(dist) + ' m, ngoài bán kính ' + radius + ' m.' };
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
  if (own > num_(c.NGUONG_KHUON_MAT)) {
    log_(date, mssv, st.name, 'MAT_KHONG_KHOP', Math.round(dist), acc, lat, lng, kindLabel + ', độ lệch ' + own.toFixed(3));
    return { err: 'Khuôn mặt không khớp với sinh viên ' + st.name + '. Đủ sáng, nhìn thẳng và thử lại.' };
  }
  if (nearestOther < own) {
    log_(date, mssv, st.name, 'MAT_GIONG_SV_KHAC', Math.round(dist), acc, lat, lng, kindLabel + ', gần MSSV ' + nearestId + ' hơn');
    return { err: 'Khuôn mặt trùng với sinh viên khác. Mỗi sinh viên tự điểm danh cho mình.' };
  }
  return { st: st, mssv: mssv, lat: lat, lng: lng, acc: acc, dist: dist, own: own };
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

  var v = verify_(d, c, date, num_(c.BAN_KINH_DIEM_DANH_M), 'Điểm danh');
  if (v.err) return { ok: false, msg: v.err };
  var st = v.st, mssv = v.mssv;

  var deadline = deadlineDate_(now, c.GIO_HAN_DIEM_DANH).getTime();
  var onTime = now.getTime() < deadline;
  var lateMin = onTime ? 0 : Math.max(1, Math.ceil((now.getTime() - deadline) / 60000));
  var status = onTime ? 'Đúng giờ' : 'Trễ';
  var timeStr = fmt_(now, 'HH:mm:ss');

  var file = savePhoto_(d.photo, folderPath_(['Anh diem danh', date.substr(0, 7), date]),
    date + '_' + fmt_(now, 'HHmmss') + '_' + mssv + '_' + slug_(st.name) + '.jpg',
    'Điểm danh ' + st.name + ' (' + mssv + ') lúc ' + timeStr + ' ngày ' + fmt_(now, 'dd/MM/yyyy') + ' – ' + c.TEN_BENH_VIEN + ' – ' + APP.BRAND);

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
      '=HYPERLINK("' + file.getUrl() + '";"Xem ảnh")', '', 0, 0, d.platform || '', d.deviceId || '', file.getId()]);
    setLive_(mssv, st.name, date, { state: 'TRONG', dist: Math.round(v.dist), acc: Math.round(v.acc), last: now.getTime(),
      outCount: 0, outSince: '', leaves: 0, outMin: 0, platform: d.platform || '', lost: false, lat: v.lat, lng: v.lng, flags: '' });
    log_(date, mssv, st.name, 'DIEM_DANH', Math.round(v.dist), Math.round(v.acc), v.lat, v.lng,
      status + (lateMin ? ' ' + lateMin + ' phút' : '') + (note ? ' | Ghi chú: ' + note : ''));
    if (!st.device && d.deviceId) sheet_(SH.SV).getRange(st.row, 7).setValue(d.deviceId);
  } finally { lock.releaseLock(); }
  var rec = findCheckin_(date, mssv);
  return { ok: true, time: timeStr, date: date, status: status, late: lateMin, dist: Math.round(v.dist),
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

  var v = verify_(d, c, date, num_(c.BAN_KINH_ROI_VUNG_M), 'Xác nhận ' + slot);
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
    var dist = haversine_(lat, lng, num_(c.VI_DO), num_(c.KINH_DO));
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

    if (acc <= num_(c.SAI_SO_GPS_TOI_DA_M)) {
      var eff = effDist_(dist, acc, c);
      var R = num_(c.BAN_KINH_ROI_VUNG_M);
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
              notify_('[BV TLS] ' + name + ' rời khỏi ' + c.TEN_BENH_VIEN,
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
    if (String(r[11]) === 'android' && !lost && now.getTime() - Number(r[5]) > lostAfter) {
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
  para_(body, 'Cơ sở thực tập: ' + c.TEN_BENH_VIEN, { size: 12, align: A.CENTER });
  para_(body, 'Ngày ' + dateVN + ' – báo cáo ' + kindVN + ', lập lúc ' + fmt_(now, 'HH:mm'), { size: 11, italic: true, align: A.CENTER });
  para_(body, 'Mục đích: ' + PURPOSE.charAt(0).toLowerCase() + PURPOSE.slice(1) + '.', { size: 10, italic: true, align: A.CENTER, after: 10 });
  para_(body, 'Tổng số sinh viên: ' + students.length + '   |   Đúng giờ (trước ' + c.GIO_HAN_DIEM_DANH + '): ' + onTime +
    '   |   Trễ: ' + late + '   |   Vắng: ' + absent.length + '   |   Có rời vùng > ' + c.BAN_KINH_ROI_VUNG_M + ' m: ' +
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
      tr.appendTableCell(fmtTimeCell_(r[1]) + '\n' + r[7] + ' m (±' + r[8] + ')');
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
  pdf.setDescription('Báo cáo điểm danh ' + dateVN + ' – ' + c.TEN_BENH_VIEN + ' – Từ BV TLS – ' + APP.CREDIT);
  docFile.setTrashed(true);

  if (bool_(c.GUI_EMAIL_BAO_CAO)) {
    notify_('[BV TLS] Báo cáo điểm danh ' + dateVN + ' – ' + kindVN,
      'Báo cáo điểm danh lâm sàng tại ' + c.TEN_BENH_VIEN + ' ngày ' + dateVN + '.\n' +
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
    GIA_LAP_VI_TRI: 'Giả lập vị trí', CO_APP_FAKE_GPS: 'Cài app fake GPS', NGHI_GIA_LAP: 'Nghi giả lập', MAY_ROOT: 'Máy đã root',
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
      return { row: i + 1, time: fmtTimeCell_(r[1]), name: r[3], status: r[5], late: r[6], confirms: splitList_(r[15]) };
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
function num_(v) { return Number(String(v).replace(',', '.')); }
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
