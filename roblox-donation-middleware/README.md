# Roblox Donation Middleware — Vercel

Middleware sederhana berbasis Vercel Functions untuk:

1. Menerima HTTP POST webhook.
2. Menormalisasi data donasi.
3. Opsional meneruskan event ke Roblox Open Cloud Messaging Service.

> Penting: format payload dan mekanisme autentikasi webhook Saweria harus dicocokkan dengan dokumentasi/dashboard Saweria yang kamu gunakan. Project ini tidak mengklaim bahwa semua nama field atau signature Saweria pasti sama.

## Endpoint

- `GET /` atau `GET /api/health` — mengecek server.
- `POST /api/webhook/saweria` — menerima webhook.

## Deploy ke Vercel

1. Upload isi repository ini ke GitHub.
2. Buka https://vercel.com/new.
3. Import repository GitHub tersebut.
4. Framework Preset: **Other** (atau biarkan otomatis).
5. Build Command: kosongkan.
6. Output Directory: kosongkan.
7. Klik **Deploy**.
8. URL webhook menjadi:

   `https://NAMA-PROJECT.vercel.app/api/webhook/saweria`

## Environment Variables Vercel

Buka **Project → Settings → Environment Variables**, lalu tambahkan:

- `WEBHOOK_TOKEN` (opsional, tetapi disarankan jika Saweria dapat mengirim header token)
- `ENABLE_ROBLOX_FORWARDING` = `false` untuk tes awal
- `ROBLOX_UNIVERSE_ID` (hanya jika forwarding diaktifkan)
- `ROBLOX_API_KEY` (hanya jika forwarding diaktifkan; jangan masukkan ke GitHub)
- `ROBLOX_TOPIC` = `donations`
- `MIN_DONATION_AMOUNT` = `0`

Setelah mengubah environment variables, lakukan **Redeploy**.

## Tes setelah deploy

Buka di browser:

`https://NAMA-PROJECT.vercel.app/api/health`

Harus mendapat JSON dengan `"status":"ok"`.

Tes webhook menggunakan curl:

```bash
curl -X POST "https://NAMA-PROJECT.vercel.app/api/webhook/saweria" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-001",
    "donator_name": "Test User",
    "amount": 10000,
    "currency": "IDR",
    "message": "Tes webhook"
  }'
```

Jika `WEBHOOK_TOKEN` diisi, tambahkan:

```bash
-H "Authorization: Bearer TOKEN_KAMU"
```

## Roblox forwarding

Jika `ENABLE_ROBLOX_FORWARDING=true`, server mengirim pesan ke Roblox Open Cloud Messaging Service. Game Roblox harus memiliki script server yang subscribe ke topic `ROBLOX_TOPIC` memakai `MessagingService:SubscribeAsync()`.

Forwarding event saja **belum otomatis memberikan Robux atau hadiah**. Script Roblox harus memeriksa event, memetakan donasi ke pemain yang benar, dan menerapkan reward dengan validasi serta anti-duplikasi.

Jangan mengaktifkan forwarding sebelum Universe ID, API Key, permission Open Cloud, topic, dan script Roblox sudah diuji.

## Batasan penting

- Vercel Function bersifat serverless; jangan mengandalkan penyimpanan variabel lokal sebagai database permanen.
- Untuk anti-reward-ganda yang kuat, gunakan database/penyimpanan persisten dan id transaksi unik.
- Jangan pernah meng-commit `.env` atau API Key ke GitHub.
