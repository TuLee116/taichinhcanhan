# Các phiên bản Sổ Cá Nhân & cách quay lại bản cũ (rollback)

Mỗi phiên bản là một **nhánh cố định** `phien-ban/vX.Y.Z` trên GitHub, trỏ đúng commit đã kiểm tra và triển khai. Không sửa các nhánh này. Bản đang chạy trên Railway luôn là nhánh `main`.

- Repo: **TuLee116/taichinhcanhan** · Railway: dịch vụ **taichinhcanhan** · Địa chỉ: `https://taichinhcanhan-production.up.railway.app`

> Muốn có tag / Release: GitHub → **Releases → Draft a new release → Choose a tag** (gõ `v1.13.1`) → **Target**: chọn nhánh `phien-ban/v1.13.1` → **Publish**.

## Phiên bản trong repo này

| Phiên bản | Ngày | Nội dung | Tải về |
|---|---|---|---|
| **v1.13.2** | 2026-11-26 | Chuyển toàn bộ về repo/tên miền của TuLee116: sao lưu GitHub phải đặt `GITHUB_REPO` (không còn mặc định repo khác), ví dụ trong app dùng tên trung tính | [code](https://github.com/TuLee116/taichinhcanhan/tree/phien-ban/v1.13.2) · [.zip](https://github.com/TuLee116/taichinhcanhan/archive/refs/heads/phien-ban/v1.13.2.zip) |
| **v1.13.1** | 2026-11-26 | Chép nguyên bản 1.13.1 (giao diện Sáng/Tối, Tiếng Việt/English, đăng nhập, sinh trắc, thông báo, đọc ảnh giao dịch, sao lưu GitHub…) | [code](https://github.com/TuLee116/taichinhcanhan/tree/phien-ban/v1.13.1) · [.zip](https://github.com/TuLee116/taichinhcanhan/archive/refs/heads/phien-ban/v1.13.1.zip) |
| **v1.0.2** | 2026-11-23 | Bản đầu của repo: PWA + font Montserrat + máy chủ đồng bộ gộp | [code](https://github.com/TuLee116/taichinhcanhan/tree/phien-ban/v1.0.2) · [.zip](https://github.com/TuLee116/taichinhcanhan/archive/refs/heads/phien-ban/v1.0.2.zip) |

## Lịch sử phát triển trước khi chuyển vào repo này

| Phiên bản | Ngày | Commit gốc | Nội dung |
|---|---|---|---|
| v1.13.1 | 2026-11-25 | `da0d9b0` | Sửa ngôn ngữ & màu giao diện tối |
| v1.13.0 | 2026-11-25 | `a1044e9` | Giao diện Sáng/Tối + Tiếng Việt/English |
| v1.12.2 | 2026-11-25 | `933f38f` | Đọc ảnh nghiêng + xác nhận số tiền chưa chắc |
| v1.12.1 | 2026-11-25 | `01a0747` | Sửa đọc ảnh giao dịch |
| v1.12.0 | 2026-11-24 | `5e26aaf` | Face ID / vân tay trên điện thoại – khoá gắn máy |
| v1.11.3 | 2026-11-24 | `764c8e2` | Sửa icon cũ khi thêm vào màn hình chính |
| v1.11.2 | 2026-11-24 | `8455b9b` | Logo mới bản 2 |
| v1.11.1 | 2026-11-24 | `730d6cc` | Logo mới cho app |
| v1.11.0 | 2026-11-24 | `12b541a` | Sinh trắc thiết bị + xác thực lại + giao diện đăng nhập mới |
| v1.10.0 | 2026-11-24 | `f4c9982` | Xác thực lại bằng sinh trắc cho thao tác nhạy cảm + nhận diện AAGUID |
| v1.9.0 | 2026-11-24 | `0455d73` | Sinh trắc thiết bị: không passkey đồng bộ, không cá nhân hoá, CSDL riêng |
| v1.8.0 | 2026-11-24 | `243129a` | Ảnh giao dịch tự đọc số tiền + gõ nhanh |
| v1.7.0 | 2026-11-24 | `2195fd3` | Thông báo biến động kiểu tin nhắn ngân hàng |
| v1.6.0 | 2026-11-24 | `b27ceb8` | Trang Tài khoản, rà soát bảo mật, sửa vân tay |
| v1.5.0 | 2026-11-23 | `b99b6ed` | Đăng nhập tài khoản chủ, vân tay/Face ID, khoá app |
| v1.4.0 | 2026-11-23 | `4bf078d` | Đồng bộ tức thời, Postgres, thông báo đẩy, sao lưu GitHub, lịch sử giao dịch |
| v1.3.1 | 2026-11-23 | `de2ad0e` | Thêm nút đồng bộ nhanh trên nút + |
| v1.3.0 | 2026-11-23 | `08de412` | Tách khỏi Claude, đồng bộ qua máy chủ Railway |
| v1.2.0 | 2026-11-23 | `fe59f14` | Máy chủ gộp app + đồng bộ cho Railway |
| v1.1.0 | 2026-11-23 | `62955c0` | Đồng bộ qua máy chủ bằng Service Worker |

## Cách rollback

### Cách 1 – Nhanh nhất, trên Railway (không đụng code) – khuyên dùng khi bản mới lỗi
1. Railway → dịch vụ **taichinhcanhan** → tab **Deployments**.
2. Tìm bản triển khai cũ đang chạy tốt (xem thời gian / tiêu đề commit) → bấm **⋮** → **Redeploy**.
3. Chờ ~1 phút → mở `https://taichinhcanhan-production.up.railway.app/health` kiểm tra `"ver"`.

Lưu ý: lần sau đẩy code mới vào `main`, Railway sẽ tự triển khai bản mới nhất trở lại.

### Cách 2 – Đưa `main` về đúng một phiên bản (lâu dài)
Nhờ Claude (hoặc tự làm trên GitHub): đưa `main` về nội dung của nhánh `phien-ban/vX.Y.Z` bằng một commit mới (không xoá lịch sử) → Railway tự triển khai lại bản đó. Câu nhắn mẫu cho Claude: *"rollback main về v1.13.1"*.

### Cách 3 – Chạy bản cũ trên máy tính
Tải `.zip` của phiên bản ở bảng trên → giải nén → `npm install` → `npm start` (xem HUONG-DAN.md).

## Dữ liệu có bị ảnh hưởng khi rollback không?
- Dữ liệu nằm trong **Postgres** (Railway) và trên từng thiết bị – rollback code **không xoá dữ liệu**.
- **v1.13.1** lưu trên máy chủ ở bảng `scn_store`; **v1.0.2** lưu ở bảng `docs`. Hai bản không đọc dữ liệu máy chủ của nhau:
  - Lên 1.13.1 lần đầu: máy chủ trống → các thiết bị **tự gửi lại toàn bộ dữ liệu** (đã kiểm tra 26/11/2026).
  - Quay về 1.0.2: máy chủ chỉ còn dữ liệu cũ trước khi lên 1.13.1 → trước khi quay về, hãy **Tải tệp sao lưu (.json)** trên máy có dữ liệu mới nhất, sau đó **Khôi phục từ tệp**.
- Quay về bản **trước 1.12.0**: khoá Face ID / vân tay gắn máy trên điện thoại sẽ không dùng được → đăng nhập bằng mật khẩu.
- Trên điện thoại, mở app 1–2 lần để Service Worker nhận đúng phiên bản (chân màn đăng nhập hiện `v…`).
