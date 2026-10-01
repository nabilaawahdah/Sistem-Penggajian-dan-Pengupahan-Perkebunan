# Arboria — Sistem Penggajian dan Pengupahan Perkebunan

Aplikasi pengelolaan kompensasi staf bergaji bulanan dan pemanen dengan upah berdasarkan bobot panen. Folder sengaja dijaga sederhana dan tidak memerlukan `package.json` atau dependensi npm.

## Struktur

```text
frontend/
  index.html
  styles.css
  script.js
backend/
  app.js
  schema.sql
README.md
```

## Menjalankan Lokal

Memerlukan Node.js 18 atau lebih baru. Dari root folder proyek, jalankan:

```powershell
node backend/app.js
```

Buka `http://localhost:3000` untuk menggunakan backend Node lokal; backend tersebut terhubung ke project Supabase yang dikonfigurasi. Jangan bagikan URL `localhost` ke perangkat lain karena hanya bisa diakses dari komputer yang menjalankannya. Pada GitHub Pages, frontend mengakses Supabase langsung dan tidak membutuhkan backend lokal.

## Menghubungkan Supabase

1. Buat proyek Supabase dan jalankan versi terbaru `backend/schema.sql` pada SQL Editor. Skema membentuk empat tabel: `employees`, `attendance_records`, `salary_payments`, dan `harvest_records`. Absensi dicatat satu baris per karyawan per bulan; kolom hari kerja, izin, dan alfa tidak boleh melebihi jumlah hari dalam bulan itu.
2. Pastikan `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` pada konstanta di awal `frontend/script.js` dan konfigurasi backend lokal menunjuk ke project Supabase yang sama.
3. Jika Supabase gagal dimuat pada GitHub Pages atau host publik lain, aplikasi memberi peringatan dan tidak menyimpan perubahan lokal yang akan berbeda antarperangkat. Mode demo lokal hanya digunakan saat membuka file atau menjalankan localhost.
4. Jika pencatatan gaji menampilkan error kolom `payment_date`, jalankan ulang versi terbaru `backend/schema.sql` di SQL Editor. Skrip tersebut menambahkan kolom dan mengisi tanggal gaji lama berdasarkan akhir bulan periodenya.

**Peringatan:** skema ini membuka CRUD empat tabel ke role `anon` agar demo dapat memakai publishable key tanpa login. Siapa pun yang mengetahui URL dan key dapat membaca serta mengubah seluruh data. Gunakan hanya data latihan; jangan masukkan data karyawan atau nominal penggajian nyata.

PowerShell:

```powershell
$env:SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
node backend/app.js
```

## Deploy dari GitHub tanpa folder tambahan

Frontend terhubung langsung ke Supabase menggunakan URL project dan publishable key yang sama di semua perangkat. Backend `localhost` tidak diperlukan saat situs dibuka dari hosting publik; semua data tersimpan di project Supabase tersebut, bukan di penyimpanan lokal HP atau komputer.

1. Pastikan `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` di awal `frontend/script.js` menunjuk ke project Supabase yang akan digunakan. Jangan masukkan `service_role` key ke frontend atau GitHub.
2. Pastikan skema `backend/schema.sql` sudah dijalankan di Supabase SQL Editor.
3. Push repository ke GitHub.
4. Hubungkan repository GitHub ke layanan hosting situs statis, lalu atur folder publikasi/build output ke `frontend` dan biarkan build command kosong.
5. Buka URL HTTPS yang diberikan hosting dari HP, tablet, laptop, atau komputer. Semua perangkat akan membaca dan mengubah database Supabase yang sama selama online.

GitHub Pages dengan pengaturan manual hanya menerbitkan root repository atau folder `docs`, bukan folder `frontend`. Karena struktur repository ini harus tetap hanya memakai folder `frontend` dan `backend`, gunakan hosting statis yang bisa memilih `frontend` sebagai folder publikasi. Tanpa workflow atau salinan file ke root, GitHub Pages tidak dapat menerbitkan struktur ini secara langsung.

Backend Node tetap tersedia untuk pengembangan lokal di `http://localhost:3000`.

**Peringatan keamanan:** skema saat ini memberi role `anon` akses baca/tambah/ubah/hapus ke empat tabel. Publishable key memang boleh tampil di browser, tetapi kebijakan publik tersebut berarti siapa pun dapat mengakses dan mengubah data. Jangan gunakan data gaji atau identitas karyawan nyata sampai autentikasi pengguna dan kebijakan RLS untuk role `authenticated` diterapkan.

## Model kompensasi

- **Tanggal gaji:** `salary_payments.payment_date` default ke hari terakhir dari periode yang dipilih; berbeda dari `paid_at`, yang mencatat tanggal pelunasan aktual.
- Data karyawan tidak dapat dihapus selama masih memiliki transaksi terkait. Transaksi dapat diedit atau dihapus dari halaman Penggajian.
- Periode bulanan menggunakan format `YYYY-MM`. Database menghitung total pembayaran dan upah melalui generated columns.
