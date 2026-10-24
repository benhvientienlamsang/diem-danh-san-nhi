# Điểm danh – Hướng dẫn triển khai

Từ BV TLS – by Dr Huy - BV TLS

Mục đích: kiểm soát sinh viên có mặt tại khu vực lâm sàng Bệnh viện Sản Nhi Kiên Giang từ 07:00 đến 11:00, tránh trốn ca.

## 1. Hệ thống gồm những gì

| Thành phần | Thư mục | Vai trò |
|---|---|---|
| Máy chủ | `backend/` | Google Sheet + Apps Script. Kiểm tra định vị, khuôn mặt, giờ. Lưu ảnh và báo cáo PDF vào Google Drive của anh |
| App Android | `android/` + `web/` | Cài file APK. Theo dõi vị trí khi chạy nền đến 11:00, chặn fake GPS |
| Web iPhone (PWA) | `web/` | Mở bằng Safari, thêm vào màn hình chính |

Mọi quyết định (đúng giờ hay trễ, trong hay ngoài vùng, khuôn mặt có khớp không) do máy chủ đưa ra theo giờ máy chủ. Sinh viên đổi giờ điện thoại không có tác dụng.

### Quy trình của sinh viên mỗi ngày

- Trước 07:00: đến bệnh viện, mở app, đứng trong bán kính 20 m, ghi chú (nếu có), quét khuôn mặt (nhìn thẳng, nhắm mắt rồi mở mắt), xem lại ảnh có đóng dấu giờ, bấm Gửi. Sau 07:00 vẫn điểm danh được nhưng ghi “Trễ x phút”. Sau 11:00 không nhận điểm danh.
- Từ lúc điểm danh đến 11:00: app ghi nhận vị trí. Ra xa quá 60 m bị ghi “Rời vùng”, quay lại bị ghi “Quay lại” kèm số phút ở ngoài.
- Các mốc 08:30, 09:30, 10:30 (mỗi mốc mở 15 phút): quét khuôn mặt xác nhận có mặt trong bán kính 60 m. Mốc này chặn trường hợp để điện thoại lại bệnh viện rồi bỏ về, và bù cho việc iPhone không chạy nền.
- Sau 11:00: app tự ngừng định vị.

### Các lớp chống gian lận

| Gian lận | Cách chặn |
|---|---|
| Điểm danh hộ | Nhận diện khuôn mặt, so với chính SV và so với toàn bộ SV khác (người gần nhất phải là chính SV đó). Mỗi SV khóa 1 điện thoại, mỗi điện thoại chỉ điểm danh cho 1 SV mỗi ngày |
| Dùng ảnh chụp khuôn mặt | Bắt nhắm mở mắt, khuôn mặt trước và sau khi chớp phải trùng nhau |
| Fake GPS trên Android | Chặn khi vị trí có cờ mô phỏng, khi có app đang được chọn làm “Ứng dụng vị trí mô phỏng”, khi máy có cài app có quyền giả lập vị trí. Kiểm tra lại mỗi 5 phút trong ca |
| Fake GPS trên iPhone | Không có cách phát hiện trực tiếp (xem mục 8). Máy chủ ghi “Nghi giả lập” khi các lần đọc GPS giống hệt nhau hoặc vị trí nhảy xa bất thường |
| Bật/tắt app để trốn theo dõi (Android) | Không nhận vị trí quá 10 phút thì ghi “Mất tín hiệu” |
| Dùng máy tính, trình duyệt Android | Máy chủ từ chối. Android bắt buộc dùng app, iPhone bắt buộc mở từ màn hình chính |

## 2. Cài máy chủ (khoảng 15 phút)

1. Vào Google Drive bằng tài khoản sẽ nhận báo cáo, tạo Google Sheet mới, đặt tên “Điểm danh BV Sản Nhi Kiên Giang”.
2. Trong Sheet: menu **Tiện ích mở rộng > Apps Script**.
3. Xóa nội dung `Code.gs` mặc định, dán toàn bộ file `backend/Code.gs`.
4. Bấm biểu tượng bánh răng **Cài đặt dự án**, tích “Hiển thị tệp kê khai appsscript.json”. Mở `appsscript.json`, thay bằng nội dung file `backend/appsscript.json`.
5. Chọn hàm `setup` ở thanh trên, bấm **Chạy**, cấp quyền (Sheet, Drive, Gmail, Docs). Google có thể báo “ứng dụng chưa được xác minh”: bấm Nâng cao > Đi tới dự án.
6. Bấm **Triển khai > Tùy chọn triển khai mới**, loại **Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
7. Sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

Khi sửa `Code.gs` về sau: **Triển khai > Quản lý triển khai > Chỉnh sửa > Phiên bản mới**. Làm vậy URL giữ nguyên.

Sau bước 5, Drive có thư mục **Diem danh BV San Nhi Kien Giang - BV TLS** gồm:

- `Anh dang ky/`: ảnh đăng ký khuôn mặt
- `Anh diem danh/2026-10/2026-10-27/`: ảnh điểm danh có đóng dấu giờ
- `Anh xac nhan giua ca/...`: ảnh các mốc xác nhận
- `Bao cao/2026-10/`: `BaoCao_DiemDanh_2026-10-27_DAU_GIO.pdf` (07:15) và `..._CUOI_CA.pdf` (11:15), kèm ảnh từng SV

Báo cáo cũng được gửi email đến tài khoản chủ Sheet (đổi ở `EMAIL_NHAN_BAO_CAO`). Tạo báo cáo bất kỳ lúc nào: menu **BV TLS > Tạo báo cáo hôm nay** trong Sheet.

## 3. Hiệu chỉnh tọa độ bệnh viện (bắt buộc làm tại chỗ)

Tọa độ mặc định `9.9731417, 105.0975708` lấy từ Google Maps cho địa chỉ 03 Ung Văn Khiêm, phường Rạch Giá. Đây là điểm đại diện của cả khuôn viên, chưa chắc là nơi sinh viên tập trung. Bán kính 20 m rất hẹp so với kích thước tòa nhà, nên cần đặt tâm đúng chỗ:

1. Chọn điểm tập trung điểm danh (ví dụ sảnh khoa Nhi hoặc cổng chính), nên ở nơi thoáng.
2. Đứng tại đó, mở Google Maps, nhấn giữ vào chấm xanh vị trí của mình, sao chép tọa độ.
3. Dán vào `VI_DO` và `KINH_DO` trong sheet `CauHinh`.

Lưu ý thực tế: trong nhà, GPS điện thoại thường sai 10 đến 30 m. Máy chủ đã trừ tối đa 10 m sai số (`SAI_SO_GPS_CHO_PHEP_M`). Nếu tuần đầu nhiều SV báo “ngoài bán kính” dù đứng đúng chỗ, tăng `BAN_KINH_DIEM_DANH_M` lên 30 hoặc 40.

## 4. Nhập danh sách sinh viên

Sheet `SinhVien`, mỗi dòng một SV: cột A **MSSV**, cột B **Họ tên**, cột C **Nhóm/Lớp**. Các cột còn lại app tự điền.

- Đổi `MA_LOP` trong `CauHinh` cho mỗi đợt thực tập, gửi mã cho SV.
- SV đổi điện thoại: chọn dòng SV, menu **BV TLS > Xóa thiết bị SV**.
- SV đăng ký khuôn mặt sai (ví dụ lỡ đăng ký trên MSSV người khác): **BV TLS > Xóa khuôn mặt SV**.

## 5. Đưa lên GitHub, tạo file APK và trang web

Không cần cài Android Studio. GitHub tự build file APK.

1. Trên GitHub, trong tổ chức **benhvientienlamsang**, tạo kho mới tên **diem-danh**.
2. Mở `web/config.js`, dán URL ở bước 2.7 vào `API_URL`. Giữ `APK_URL` như mẫu nếu kho tên `diem-danh`.
3. Dùng GitHub Desktop đưa toàn bộ thư mục `diem-danh-san-nhi` lên kho (thư mục `node_modules` tự bị bỏ qua).
4. Kho trên GitHub > **Settings > Secrets and variables > Actions > New repository secret**: tạo 4 secret theo file `DOC_KY.txt` trong gói **khoa-ky-app** (gửi riêng). Gói này tuyệt đối không đưa lên GitHub.
5. **Settings > Pages > Source**: chọn **GitHub Actions**.
6. Mỗi lần đẩy code lên nhánh `main`:
   - Trang web iPhone được cập nhật tại `https://benhvientienlamsang.github.io/diem-danh/`
   - Tab **Actions > Build APK Android** tạo file `DiemDanh-BVTLS.apk` (tải trong mục Artifacts)
7. Phát hành APK cho SV tải: tab **Releases > Draft a new release**, gõ tag `v1.1.0`, bấm Publish. Khoảng 5 phút sau file APK tự gắn vào bản phát hành. Link tải cố định: `https://github.com/benhvientienlamsang/diem-danh/releases/latest`.

Ghi chú: GitHub Pages của kho công khai cho phép người khác xem mã giao diện web. Phần quyết định (ngưỡng khuôn mặt, vùng định vị, giờ, danh sách SV) nằm trên Apps Script của anh, người ngoài không xem hay sửa được.

## 6. Hướng dẫn sinh viên cài đặt

### Android

1. Tải file APK từ link Releases, mở file, cho phép “Cài ứng dụng không rõ nguồn gốc”. Có thể Google Play Protect cảnh báo vì app không qua CH Play, chọn “Vẫn cài đặt”.
2. Mở app **Điểm danh** (biểu tượng BV TLS nền đỏ), nhập họ và tên (đúng như danh sách lớp), MSSV và mã lớp, đọc quy định, đăng ký khuôn mặt.
3. Cấp quyền: Camera, Vị trí **chính xác** “Khi dùng ứng dụng”, Thông báo.
4. **Pin**: Cài đặt > Ứng dụng > Điểm danh > Pin > **Không hạn chế**. Các máy Xiaomi, Oppo, Vivo, Samsung hay tự tắt app chạy nền, không làm bước này dễ bị ghi “Mất tín hiệu”.
5. Trong ca: không vuốt tắt app khỏi danh sách đa nhiệm, không tắt GPS. Có thông báo cố định “Điểm danh – BV TLS” là app đang theo dõi bình thường.

### iPhone

1. Mở **Safari**, vào `https://benhvientienlamsang.github.io/diem-danh/`.
2. Bấm **Chia sẻ > Thêm vào MH chính > Thêm**.
3. Mở biểu tượng **Điểm danh** trên màn hình chính, nhập họ và tên, MSSV và mã lớp, đăng ký khuôn mặt, cho phép Camera và Vị trí.
4. Nếu lỡ từ chối vị trí: Cài đặt > Quyền riêng tư & Bảo mật > Dịch vụ định vị > Trang web Safari > Khi dùng ứng dụng, bật **Vị trí chính xác**.
5. Đặt báo thức cho các mốc 08:30, 09:30, 10:30 (iPhone không tự nhắc).

## 6b. Tài khoản giảng viên

- Sheet **GiangVien** (tự tạo khi chạy lại hàm `setup`): mỗi dòng một giảng viên gồm Tài khoản, Mật khẩu, Họ tên giảng viên, Nhóm phụ trách. Để trống Nhóm phụ trách thì giảng viên thấy toàn bộ sinh viên. Ghi `Y6A, Y6B` thì chỉ thấy các nhóm đó (khớp cột Nhóm/Lớp của sheet SinhVien).
- Dòng `gv01` là tài khoản mẫu: đổi mật khẩu và họ tên trước khi dùng. Nhập sai mật khẩu 5 lần thì tài khoản bị khóa 10 phút.
- Giảng viên đăng nhập bằng nút **Đăng nhập dành cho giảng viên** ở màn hình đăng nhập (trên app Android, trên iPhone, hoặc mở link web bằng máy tính). Phiên đăng nhập có hiệu lực 14 giờ.
- Màn hình giảng viên hiện tên giảng viên, số SV có mặt, trễ, vắng, ngoài vùng. Giảng viên tích chọn sinh viên rồi gửi:
  - **Yêu cầu xác nhận có mặt**: sinh viên phải quét khuôn mặt tại khu vực lâm sàng (trong 60 m) trước hạn chót. Quá hạn ghi “Quá hạn”.
  - **Thông báo**: sinh viên bấm “Đã đọc”.
- Trạng thái từng yêu cầu (Đã gửi, Đã nhận, Đã xem, Có mặt, Quá hạn) hiện ngay trên màn hình giảng viên, lưu ở sheet **ThongBao** và in vào mục 4 của báo cáo PDF.
- Cách thông báo đến điện thoại sinh viên: app tự hỏi máy chủ, không dùng dịch vụ đẩy thông báo riêng. Android trong ca (đến 11:00) nhận thông báo hệ thống trong vòng khoảng 2 phút kể cả khi tắt màn hình. Ngoài ca hoặc trên iPhone, sinh viên thấy thông báo khi mở app (app hỏi lại mỗi 45 giây khi đang mở).

## 7. Bảng cấu hình (sheet `CauHinh`)

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `BAN_KINH_DIEM_DANH_M` | 20 | Bán kính điểm danh |
| `BAN_KINH_ROI_VUNG_M` | 60 | Ra ngoài là “Rời vùng” (cần 2 lần đọc liên tiếp để tránh GPS nhảy) |
| `GIO_HAN_DIEM_DANH` | 07:00 | Trước giờ này là đúng giờ |
| `GIO_KET_THUC_THEO_DOI` | 11:00 | Hết ca, ngừng định vị |
| `NGAY_HOC` | 2,3,4,5,6 | Thứ Hai đến thứ Sáu. Thêm 7 nếu học thứ Bảy |
| `XAC_NHAN_GIUA_CA` | 08:30,09:30,10:30 | Để trống nếu không muốn xác nhận giữa ca |
| `NGUONG_KHUON_MAT` | 0.50 | Giảm (0.45) nếu muốn chặt hơn, tăng (0.55) nếu SV hay bị báo không khớp |
| `CHAN_APP_FAKE_GPS_DA_CAI` | TRUE | Chặn cả khi chỉ cài app fake GPS (chưa bật) |
| `CHAN_MAY_ROOT` | FALSE | TRUE để chặn máy đã root |
| `CANH_BAO_EMAIL_KHI_ROI_VUNG` | FALSE | TRUE để nhận email ngay khi SV rời vùng |

Sửa cấu hình trực tiếp trong Sheet có hiệu lực ngay, chậm nhất sau 2 phút.

## 8. Giới hạn cần biết

- **iPhone không chạy nền được.** Apple không cho trang web lấy vị trí khi đã thoát hoặc khóa màn hình. Vì vậy SV dùng iPhone chỉ bị theo dõi khi đang mở app, việc có mặt được kiểm soát bằng 3 mốc xác nhận khuôn mặt. Muốn theo dõi nền trên iPhone phải làm app iOS gốc và phát hành qua App Store hoặc TestFlight (cần tài khoản Apple Developer).
- **Fake GPS trên iPhone** cần bẻ khóa máy hoặc thiết bị giả lập gắn ngoài. Trang web không phát hiện trực tiếp được, chỉ có các dấu hiệu nghi ngờ ghi trong báo cáo.
- **Android đã root** có công cụ che giấu được việc giả lập. App ghi nhận dấu hiệu root vào báo cáo, có thể bật `CHAN_MAY_ROOT`.
- **Nhận diện khuôn mặt** chạy ngay trên điện thoại, bước nhắm mở mắt chặn được ảnh chụp tĩnh nhưng không chặn tuyệt đối video quay sẵn. Ảnh điểm danh lưu trên Drive để đối chiếu khi nghi ngờ.
- **Sức chứa**: Apps Script xử lý tối đa khoảng 30 yêu cầu cùng lúc. Với nhóm khoảng 100 SV hoạt động ổn, nếu SV dồn điểm danh cùng một phút có thể phải bấm Gửi lại.
- **Dữ liệu sinh trắc học**: ảnh và đặc trưng khuôn mặt là dữ liệu cá nhân nhạy cảm theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân. App đã có màn hình SV đồng ý, nhưng nên có thông báo chính thức của Trường về mục đích thu thập, thời hạn lưu và người được xem dữ liệu. Anh nên trao đổi thêm với bộ phận pháp chế.

## 9. Kiểm thử trước khi áp dụng

1. Tạo 2 SV thử trong `SinhVien`, cài trên 1 máy Android và 1 iPhone.
2. Đứng tại điểm tập trung, điểm danh, kiểm tra ảnh trong Drive và dòng trong sheet `DiemDanh`.
3. Đi bộ ra xa khoảng 100 m trong 3 đến 5 phút rồi quay lại, kiểm tra sheet `SuKienViTri` có “ROI_VUNG” và “QUAY_LAI”.
4. Trên Android, cài thử một app fake GPS, kiểm tra app bị chặn điểm danh.
5. Chạy menu **BV TLS > Tạo báo cáo hôm nay**, mở file PDF.
