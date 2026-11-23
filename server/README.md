# Máy chủ đồng bộ – Sổ Cá Nhân

Server nhỏ (Node + PostgreSQL) giúp app đồng bộ dữ liệu giữa nhiều máy và giữ một bản trên máy chủ.
App vẫn chạy đầy đủ khi không có server; server chỉ nhận và trả các thay đổi.

## Deploy trên Railway

1. Trong project có sẵn Postgres: **New → GitHub Repo → taichinhcanhan** (tạo service mới).
2. Service mới → **Settings → Source → Root Directory**: `/server`.
3. **Variables**:

   | Tên | Giá trị |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `SYNC_TOKEN` | mã ngẫu nhiên, tối thiểu 32 ký tự (xem dưới) |
   | `ALLOWED_ORIGINS` | `https://taichinhcanhan-production.up.railway.app` |

4. **Settings → Networking → Generate Domain**, và **Healthcheck Path**: `/health`.
5. Trong app: ⚙️ → Máy chủ đồng bộ → dán địa chỉ server và `SYNC_TOKEN` → **Lưu & đồng bộ**. Làm vậy trên từng máy.

Tạo mã ngẫu nhiên (PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

## Giao thức

`POST /sync` với `Authorization: Bearer <SYNC_TOKEN>`

- Gửi: `{ device, since, ops: [{ op: "put"|"del", col, id, data, ts }] }`
- Nhận: `{ now, changes: [{ col, id, data, del, ts }] }`

Xung đột giữa hai máy: bản sửa sau (theo `ts`) thắng. Mục đã xoá được giữ dấu xoá để máy khác cũng xoá theo.

`GET /health` – kiểm tra server và kết nối database.

## Bảo mật

- Sai mã → 401; một IP sai quá 20 lần trong 15 phút → 429. Đúng mã luôn được vào.
- Chỉ các địa chỉ trong `ALLOWED_ORIGINS` gọi được từ trình duyệt.
- Đổi mã: sửa `SYNC_TOKEN` trên Railway rồi nhập mã mới trong app ở từng máy.
