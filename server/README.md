# Máy chủ – Sổ Cá Nhân

Một service Node duy nhất làm hai việc trên cùng một địa chỉ:

- **Phục vụ app**: `index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` (có nén gzip, ETag).
  Chỉ các tệp này được phục vụ; mã server, `package.json`, `.git` đều không truy cập được.
- **Đồng bộ dữ liệu**: `POST /sync`, lưu vào PostgreSQL.

App vẫn chạy đầy đủ khi chưa bật đồng bộ; dữ liệu lúc đó chỉ nằm trên từng máy.

## Deploy trên Railway

Service `taichinhcanhan` (nối GitHub repo này) trong project có Postgres:

1. **Settings → Source → Root Directory**: để **trống** (thư mục gốc repo). Railway thấy `package.json` và chạy `npm start`.
2. **Variables**:

   | Tên | Giá trị |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `SYNC_TOKEN` | mã ngẫu nhiên, tối thiểu 32 ký tự (xem dưới) |
   | `ALLOWED_ORIGINS` | (tuỳ chọn) địa chỉ khác được gọi `/sync`; app cùng địa chỉ luôn được phép |

3. **Settings → Deploy → Healthcheck Path**: `/health`.
4. Trong app trên từng máy: ⚙️ → Máy chủ đồng bộ → địa chỉ = **chính địa chỉ app** (vd. `https://taichinhcanhan-production.up.railway.app`), mã = `SYNC_TOKEN` → **Lưu & đồng bộ**.
   Làm trên máy có dữ liệu thật trước.

Tạo mã ngẫu nhiên (PowerShell), giữ kín, không dán vào chat:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

## Chạy trên máy

```powershell
$env:DATABASE_URL = "postgres://..."; $env:SYNC_TOKEN = "<mã>"; npm install; npm start
```

## Giao thức

`POST /sync` với `Authorization: Bearer <SYNC_TOKEN>`

- Gửi: `{ device, since, ops: [{ op: "put"|"del", col, id, data, ts }] }`
- Nhận: `{ now, changes: [{ col, id, data, del, ts }] }`

Xung đột giữa hai máy: bản sửa sau (theo `ts`) thắng. Mục đã xoá được giữ dấu xoá để máy khác cũng xoá theo.

`GET /health` – kiểm tra server và kết nối database.

## Bảo mật

- Sai mã → 401; một IP sai quá 20 lần trong 15 phút → 429. Đúng mã luôn được vào.
- Gọi `/sync` từ trang web khác chỉ được khi địa chỉ đó nằm trong `ALLOWED_ORIGINS`.
- Đổi mã: sửa `SYNC_TOKEN` trên Railway rồi nhập mã mới trong app ở từng máy.
