# SignageOS — Control Panel

Aplikasi *Signage Control Panel* berbasis web: dashboard admin untuk mengelola device & content digital signage, lengkap dengan simulasi device client dan update status real-time lewat WebSocket (Supabase Realtime).

## Fitur

### Requirement wajib
- **Database Postgres (Supabase)** — tabel `devices` (id, nama, lokasi, status, last_seen) dan `contents` (id, judul, tipe, payload, created_at).
- **REST API CRUD** untuk `devices` dan `contents`, lewat Supabase REST API (PostgREST) — create, read, update, delete penuh, bukan data statis.
- **WebSocket real-time** — status online/offline device di dashboard otomatis update tanpa refresh halaman, via Supabase Realtime channel di tabel `devices`.
- **Dashboard admin** — kelola device (tambah/edit/hapus) dan content (tambah/edit/hapus), termasuk attach content ke device.
- **Halaman Device Client** — simulasi tampilan device yang menampilkan content yang sedang aktif.
- **UI/UX** — dark theme custom, responsif untuk mobile & desktop.

### Nilai tambah (bonus)
- **Playlist device–content** — atur urutan beberapa content untuk diputar bergantian di satu device.
- **Push content** — kirim/tetapkan content tertentu langsung ke device tertentu.
- **Autentikasi sederhana** — login berbasis token (JWT sederhana, disimpan di localStorage) untuk mengakses dashboard admin.
- **Reconnection handling** — koneksi WebSocket otomatis mencoba reconnect setiap 3 detik jika terputus.

> Belum diimplementasikan: device client sebagai aplikasi desktop (Electron). Saat ini device client berupa halaman web (`Device Client Simulator`) di dalam aplikasi yang sama.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | HTML, CSS (custom + Tailwind via CDN), JavaScript (vanilla) |
| Backend / Database | Supabase (Postgres + REST API otomatis via PostgREST) |
| Real-time | Supabase Realtime (WebSocket) |
| Autentikasi | JWT sederhana (client-side, localStorage) |

## Struktur Proyek

```
teknikal/
├── index.html      # Struktur halaman (login, dashboard, devices, contents, client, logs)
├── style.css        # Semua styling
├── app.js           # Logika aplikasi: CRUD, WebSocket, auth, rendering UI
└── README.md
```

## Setup & Menjalankan

1. **Buat project Supabase** di https://supabase.com/dashboard.
2. **Buat tabel** berikut di SQL Editor:

```sql
create table devices (
    id uuid primary key default gen_random_uuid(),
    nama text not null,
    lokasi text,
    status text default 'offline',
    last_seen timestamptz,
    active_content_id uuid,
    created_at timestamptz default now()
);

create table contents (
    id uuid primary key default gen_random_uuid(),
    judul text not null,
    tipe text not null,
    payload text,
    created_at timestamptz default now()
);

create table playlists (
    device_id uuid references devices(id) on delete cascade,
    content_id uuid references contents(id) on delete cascade,
    urutan int default 0,
    primary key (device_id, content_id)
);

create table logs (
    id uuid primary key default gen_random_uuid(),
    tipe text,
    pesan text,
    created_at timestamptz default now()
);
```

3. **Aktifkan Row Level Security (RLS)** dan buat policy akses (lihat bagian Catatan Keamanan di bawah).
4. **Aktifkan Realtime** untuk tabel `devices` (Database → Replication → aktifkan tabel `devices`).
5. **Ambil Publishable key** di Settings → API Keys, lalu isi di `app.js`:

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xxxxx'; // JANGAN pakai sb_secret_...
```

6. Buka `index.html` langsung di browser (atau lewat Live Server) — tidak perlu build step.

## Login

| Username | Password |
|---|---|
| `admin` | `davit2009` |

## Catatan Keamanan

- **Jangan pernah** memasukkan Supabase **Secret key** (`sb_secret_...`) ke `app.js` — file ini berjalan di browser dan bisa dilihat siapa saja lewat DevTools. Selalu gunakan **Publishable key** (`sb_publishable_...`).
- Aplikasi ini menggunakan RLS policy yang mengizinkan akses penuh (read/write) untuk role `anon`, cocok untuk demo/tugas — **belum cocok untuk data production/sensitif** tanpa autentikasi Supabase Auth yang sesungguhnya di sisi server.
- Autentikasi login saat ini murni sisi client (localStorage) untuk keperluan demo; tidak menggantikan otorisasi di level database.

## Known limitation

- Device client belum dibungkus sebagai aplikasi Electron desktop.
- Reconnection WebSocket saat ini fixed 3 detik (belum exponential backoff).
