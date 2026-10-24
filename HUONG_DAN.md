# Điểm danh – Hướng dẫn triển khai

Từ BV TLS – by Dr Huy - BV TLS

Mục đích: kiểm soát sinh viên có mặt tại khu vực lâm sàng (Bệnh viện Sản Nhi Kiên Giang, Bệnh viện Nhi Đồng Cần Thơ và các cơ sở khai báo thêm) từ 07:00 đến 11:00, tránh trốn ca.

## 1. Hệ thống gồm những gì

| Thành phần | Thư mục | Vai trò |
|---|---|---|
| Máy chủ | `backend/` | Google Sheet + Apps Script. Kiểm tra định vị, khuôn mặt, giờ. Lưu ảnh và báo cáo PDF vào Google Drive của anh |
| App Android | `android/` + `web/` | Cài file APK. Theo dõi vị trí khi chạy nền đến 11:00, chặn fake GPS |
| Web iPhone (PWA) | `web/` | Mở bằng Safari, thêm vào màn hình chính |

Mọi quyết định (đúng giờ hay trễ, trong hay ngoài vùng, khuôn mặt có khớp không) do máy chủ đưa ra theo giờ máy chủ. Sinh viên đổi giờ điện thoại không có tác dụng.

### Quy trình của sinh viên mỗi ngày

- Trước 07:00: đến bệnh viện, mở app, đứng trong bán kính 20 m, ghi chú (nếu có), quét khuôn mặt (nhìn thẳng, giữ yên khoảng 2 giây), xem lại ảnh có đóng dấu giờ, bấm Gửi. Sau 07:00 vẫn điểm danh được nhưng ghi “Trễ x phút”. Sau 11:00 không nhận điểm danh.
- Từ lúc điểm danh đến 11:00: app ghi nhận vị trí. Ra xa quá 60 m bị ghi “Rời vùng”, quay lại bị ghi “Quay lại” kèm số phút ở ngoài.
- Từ 07:00 đến 11:00 app tự động gửi vị trí, sinh viên không phải thao tác. Rời vùng chỉ tính trong khung giờ này.
- Tùy chọn: điền các mốc vào `XAC_NHAN_GIUA_CA` (ví dụ 08:30,09:30,10:30) nếu muốn sinh viên quét khuôn mặt giữa ca. Mặc định tắt. Giảng viên vẫn có thể gửi “Yêu cầu xác nhận có mặt” đột xuất cho sinh viên được chọn.
- Sau 11:00: app tự ngừng định vị.

### Các lớp chống gian lận

| Gian lận | Cách chặn |
|---|---|
| Điểm danh hộ | Nhận diện khuôn mặt, so với chính SV và so với toàn bộ SV khác (người gần nhất phải là chính SV đó). Mỗi SV khóa 1 điện thoại, mỗi điện thoại chỉ điểm danh cho 1 SV mỗi ngày |
| Dùng ảnh chụp khuôn mặt | Ảnh điểm danh có đóng dấu giờ lưu trên Drive để đối chiếu. Đã bỏ bước nhắm mở mắt cho nhanh, nên không chặn tự động việc giơ ảnh chụp |
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

## 3. Cơ sở thực tập và tọa độ (bắt buộc kiểm tra tại chỗ)

Sheet **CoSo** (tạo khi chạy hàm `setup`) liệt kê các bệnh viện thực tập, mỗi dòng một cơ sở:

| Mã | Tên cơ sở | Vĩ độ | Kinh độ | Bán kính điểm danh | Bán kính rời vùng | Đang dùng |
|---|---|---|---|---|---|---|
| KG | Bệnh viện Sản Nhi Kiên Giang | 9.9731417 | 105.0975708 | 20 | 60 | TRUE |
| NDCT | Bệnh viện Nhi Đồng Cần Thơ | 10.0171240 | 105.7391971 | 20 | 60 | TRUE |

- Tọa độ mặc định lấy từ Google Maps theo địa chỉ, là điểm đại diện của cả khuôn viên. Với bán kính 20 m, cần đứng tại điểm tập trung của từng bệnh viện, mở Google Maps, nhấn giữ chấm xanh để lấy tọa độ, rồi sửa cột Vĩ độ, Kinh độ.
- Thêm cơ sở mới: thêm một dòng với mã ngắn (không dấu, không khoảng trắng). Tạm ngừng một cơ sở: ghi FALSE ở cột Đang dùng.
- Trên app, sinh viên thấy mục **Cơ sở thực tập hôm nay**. App tự chọn cơ sở gần nhất theo GPS, sinh viên có thể đổi. Sau khi điểm danh, cả ca (đến 11:00) được theo dõi theo cơ sở đã điểm danh. Báo cáo và màn hình giảng viên ghi rõ sinh viên điểm danh tại cơ sở nào, giảng viên lọc được theo từng cơ sở.
- Trong nhà, GPS điện thoại thường sai 10 đến 30 m. Nếu sinh viên hay bị báo ngoài bán kính dù đứng đúng chỗ, tăng bán kính điểm danh của cơ sở đó lên 30 hoặc 40.

## 4. Mã lớp và sinh viên tự đăng ký

- Ô **MA_LOP** (sheet CauHinh) chứa các mã lớp, cách nhau dấu phẩy. Sinh viên thấy các mã này dưới dạng danh sách để **tích chọn** khi đăng ký.
  - `BVTLS2026`: một mã chung.
  - `SNA2026=Y6A, SNB2026=Y6B`: mỗi mã gắn với một nhóm. Sinh viên tự đăng ký bằng mã nào thì được xếp vào nhóm đó.
- **Đăng ký lần đầu** (3 bước trên app): nhập họ và tên có dấu, MSSV, tích chọn mã lớp, đọc quy định, quét khuôn mặt. Khi quét xong, máy chủ tự thêm sinh viên vào sheet **SinhVien** (cột Ghi chú ghi “Tự đăng ký qua app”).
- Màn hình đăng nhập: sinh viên **chọn bệnh viện điểm danh** trước (tiêu đề app đổi theo bệnh viện), rồi nhập họ tên, MSSV, tích chọn mã lớp.
- Cài lại app trên cùng điện thoại: nhập đúng họ tên, MSSV, mã lớp cũ.
- **Đổi điện thoại mới**: sinh viên tích ô **“Tôi đã đổi sang điện thoại mới”** khi đăng nhập, sau đó quét khuôn mặt. Khuôn mặt khớp với khuôn mặt đã đăng ký thì tài khoản chuyển sang máy mới, máy cũ không dùng được nữa. Sự kiện “Đổi điện thoại” (kèm ảnh xác minh trong thư mục Drive `Anh doi thiet bi`) được ghi vào sheet SuKienViTri và báo cáo. Khuôn mặt không khớp thì bị từ chối và ghi “Đổi điện thoại thất bại”. Giảng viên vẫn có thể xóa thiết bị bằng menu BV TLS > Xóa thiết bị SV nếu cần.
- Muốn chỉ cho sinh viên có sẵn trong danh sách: đặt `CHO_SV_TU_DANG_KY` = FALSE và nhập trước danh sách vào sheet SinhVien (cột A MSSV, B Họ tên, C Nhóm/Lớp).
- Một MSSV chỉ đăng ký được một lần, một khuôn mặt chỉ gắn với một MSSV, một điện thoại chỉ gắn với một sinh viên. Sai sót thì dùng menu **BV TLS > Xóa khuôn mặt SV** hoặc xóa dòng của sinh viên đó.

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
5. Trong ca, thỉnh thoảng mở app để gửi vị trí và nhận thông báo (iPhone không chạy nền).

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
| `XAC_NHAN_GIUA_CA` | (trống) | Điền mốc giờ, ví dụ 08:30,09:30,10:30, nếu muốn SV quét khuôn mặt giữa ca |
| `NGUONG_KHUON_MAT` | 0.50 | Giảm (0.45) nếu muốn chặt hơn, tăng (0.55) nếu SV hay bị báo không khớp |
| `CHAN_APP_FAKE_GPS_DA_CAI` | TRUE | Chặn cả khi chỉ cài app fake GPS (chưa bật) |
| `CHAN_MAY_ROOT` | FALSE | TRUE để chặn máy đã root |
| `CANH_BAO_EMAIL_KHI_ROI_VUNG` | FALSE | TRUE để nhận email ngay khi SV rời vùng |
| `LUU_TRU_NGAY` | 30 | Mỗi tối khoảng 19:30, dữ liệu cũ hơn số ngày này được chuyển sang file lưu trữ. Tối thiểu 7, ghi 0 để tắt |

Sửa cấu hình trực tiếp trong Sheet có hiệu lực ngay, chậm nhất sau 2 phút.

### Bộ nhớ đệm và lưu trữ (từ máy chủ 1.7.0)

- Máy chủ giữ trạng thái theo dõi vị trí trong bộ nhớ đệm. Sheet `HienTai` được ghi ngay khi có thay đổi (rời vùng, quay lại, mất tín hiệu) và tối đa 5 phút một lần khi sinh viên đứng yên. Màn hình giảng viên luôn thấy vị trí mới nhất.
- Sửa ô trong các sheet thì máy chủ tự cập nhật. Riêng khi **xóa cả dòng, chèn dòng hoặc sắp xếp** trong `DiemDanh`, `SinhVien`, `HienTai`, hãy chọn menu **BV TLS > Làm mới dữ liệu tạm**.
- Mỗi tối, các dòng cũ trong `DiemDanh`, `SuKienViTri`, `ThongBao` được chuyển sang file Google Sheet **Diem danh - Luu tru du lieu cu - BV TLS** trong thư mục Drive gốc (liên kết ảnh giữ nguyên). Muốn chạy ngay: menu **BV TLS > Lưu trữ dữ liệu cũ ngay**. Ảnh và báo cáo PDF trên Drive không bị xóa.

## 8. Giới hạn cần biết

- **iPhone không chạy nền được.** Apple không cho trang web lấy vị trí khi đã thoát hoặc khóa màn hình. Vì vậy SV dùng iPhone chỉ bị theo dõi khi đang mở app, việc có mặt được kiểm soát bằng 3 mốc xác nhận khuôn mặt. Muốn theo dõi nền trên iPhone phải làm app iOS gốc và phát hành qua App Store hoặc TestFlight (cần tài khoản Apple Developer).
- **Fake GPS trên iPhone** cần bẻ khóa máy hoặc thiết bị giả lập gắn ngoài. Trang web không phát hiện trực tiếp được, chỉ có các dấu hiệu nghi ngờ ghi trong báo cáo.
- **Android đã root** có công cụ che giấu được việc giả lập. App ghi nhận dấu hiệu root vào báo cáo, có thể bật `CHAN_MAY_ROOT`.
- **Nhận diện khuôn mặt** chạy ngay trên điện thoại và không còn bước nhắm mở mắt, nên không tự chặn được việc giơ ảnh hoặc video của người khác trước camera. Ảnh điểm danh lưu trên Drive để giảng viên đối chiếu khi nghi ngờ.
- **Sức chứa**: Apps Script xử lý tối đa khoảng 30 yêu cầu cùng lúc. Từ máy chủ 1.7.0, việc gửi vị trí không còn phải xếp hàng và gần như không đọc sheet, nên vài trăm sinh viên dùng cùng lúc vẫn ổn. Điểm nghẽn còn lại là lúc nhiều SV bấm điểm danh trong cùng một phút (mỗi lượt lưu ảnh lên Drive mất 1–2 giây). Nếu bị báo bận, SV chờ vài giây rồi bấm Gửi lại.
- **Dữ liệu sinh trắc học**: ảnh và đặc trưng khuôn mặt là dữ liệu cá nhân nhạy cảm theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân. App đã có màn hình SV đồng ý, nhưng nên có thông báo chính thức của Trường về mục đích thu thập, thời hạn lưu và người được xem dữ liệu. Anh nên trao đổi thêm với bộ phận pháp chế.

## 9. Kiểm thử trước khi áp dụng

1. Tạo 2 SV thử trong `SinhVien`, cài trên 1 máy Android và 1 iPhone.
2. Đứng tại điểm tập trung, điểm danh, kiểm tra ảnh trong Drive và dòng trong sheet `DiemDanh`.
3. Đi bộ ra xa khoảng 100 m trong 3 đến 5 phút rồi quay lại, kiểm tra sheet `SuKienViTri` có “ROI_VUNG” và “QUAY_LAI”.
4. Trên Android, cài thử một app fake GPS, kiểm tra app bị chặn điểm danh.
5. Chạy menu **BV TLS > Tạo báo cáo hôm nay**, mở file PDF.
