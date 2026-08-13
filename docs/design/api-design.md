# API Design Document
**Project:** Event Gate System
**Phase:** 6 (API Design)

Dokumen ini melengkapi `interface-contract_admin-api.md` dengan spesifikasi yang lebih detail untuk kebutuhan *development* *Mobile App (Flutter)* dan *AJAX Polling* dari Web.

## 1. Auth - Admin Login
**Endpoint:** `POST /api/v1/auth/admin/login`
**Description:** Mengautentikasi pengguna (Admin utama) untuk mengelola data dan memindai tiket semua acara.

**Request Body (JSON):**
```json
{
  "email": "admin@eventgate.com",
  "password": "securepassword"
}
```

**Response 200 (OK):**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1...",
    "role": "admin",
    "user": {
      "id": "uuid-1234",
      "name": "Super Admin"
    }
  }
}
```
**Response 401 (Unauthorized):** `{"status": "error", "message": "Kredensial tidak valid"}`

---

## 2. Auth - Volunteer Login (PIN Based)
**Endpoint:** `POST /api/v1/auth/volunteer/login`
**Description:** Mengautentikasi relawan panitia lapangan. Akses terbatas hanya untuk memindai tiket pada acara spesifik. Dilindungi oleh *RateLimiter* (Maksimal 5 percobaan gagal per IP selama 15 menit).

**Request Body (JSON):**
```json
{
  "event_slug": "tech-conf-2026",
  "pin": "849201",
  "volunteer_name": "Budi Lapangan"
}
```

**Response 200 (OK):**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1...",
    "role": "volunteer",
    "volunteer_name": "Budi Lapangan",
    "event_id": "uuid-5678",
    "event_name": "Tech Conference 2026"
  }
}
```
**Response 401 (Unauthorized):** `{"status": "error", "message": "PIN atau Event Slug tidak valid"}`
**Response 429 (Too Many Requests):** `{"status": "error", "message": "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit."}`

---

## 3. Event - List Events
**Endpoint:** `GET /api/v1/events`
**Description:** Menampilkan daftar acara. Jika token milik Admin, tampilkan semua acara. Jika milik Relawan, tampilkan hanya acara yang bersangkutan.

**Headers:** `Authorization: Bearer <token>`

**Response 200 (OK):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid-5678",
      "name": "Tech Conference 2026",
      "slug": "tech-conf-2026",
      "date": "2026-08-15",
      "status": "Published"
    }
  ]
}
```

---

## 3B. Registration - Submit Form (Public)
**Endpoint:** `POST /api/v1/events/{slug}/register`
**Description:** Mengirim data payload formulir pendaftaran. Bisa berupa form-data jika menyertakan file (maks 1MB).
**Request Body:** `multipart/form-data` berisi `name`, `email`, `answers` (dinamis), dan opsi `registration_id` (jika user melakukan perbaikan data/ubah email, hal ini akan melakukan update pada draft lama alih-alih membuat baris duplikat).
**Response 201 (Created):** Mengembalikan ID Registrasi. Jika mode 'Manual Review', status pendaftaran adalah 'Draft' dan menunggu OTP.

---

## 3C. Registration - Submit OTP (Public)
**Endpoint:** `POST /api/v1/registrations/{id}/verify-otp`
**Description:** Memverifikasi OTP dari email peserta. Jika berhasil, status registrasi berubah dari 'Draft' menjadi 'Pending' (atau 'Accepted' sesuai mode acara).
**Request Body (JSON):** `{"otp_code": "123456"}`
**Response 200 (OK):** `{"status": "success", "message": "OTP valid. Pendaftaran diproses."}`

---

## 4. Check-In - Scan Ticket
**Endpoint:** `POST /api/v1/checkin/scan`
**Description:** Merekam kehadiran peserta berdasarkan kode tiket 8 karakter alfanumerik (dari QR).

**Headers:** `Authorization: Bearer <token>`

**Request Body (JSON):**
```json
{
  "ticket_code": "AB12CD34",
  "event_id": "uuid-5678"
}
```

**Response 200 (OK) - Tiket Sah:**
```json
{
  "status": "success",
  "message": "Berhasil Masuk!",
  "data": {
    "participant_name": "Budi Santoso",
    "attendance_time": "2026-08-15T08:30:00Z"
  }
}
```

**Response 409 (Conflict) - Tiket Sudah Digunakan (Double Scan):**
```json
{
  "status": "error",
  "message": "Tiket Sudah Digunakan!",
  "data": {
    "first_scanned_at": "2026-08-15T08:15:00Z",
    "scanned_by_role": "volunteer"
  }
}
```

**Response 404 (Not Found / Invalid):**
```json
{
  "status": "error",
  "message": "Tiket tidak terdaftar di sistem atau pendaftaran belum disetujui."
}
```

---

## 5. Registration - Check Status (Web AJAX)
**Endpoint:** `GET /api/v1/registration/{id}/status`
**Description:** Digunakan oleh Web *Frontend* (AJAX polling) untuk mengecek apakah *Worker* sudah selesai men-*generate* QR Code.

**Headers:** None (Public Endpoint, dipanggil oleh browser peserta)

**Response 200 (OK) - Sedang Diproses:**
```json
{
  "status": "processing",
  "message": "Sedang diproses...",
  "qr_code_url": null
}
```

**Response 200 (OK) - Selesai:**
```json
{
  "status": "completed",
  "message": "Tiket berhasil diterbitkan",
  "qr_code_url": "https://supabase.com/storage/v1/object/public/tickets/AB12CD34.png"
}
```

---

## 5B. Registration - Check Status Mandiri (Public)
**Endpoint:** `GET /api/v1/registration/status`
**Description:** Digunakan oleh peserta (UC010) untuk mengecek status pendaftaran dan mengunduh tiket secara mandiri menggunakan kombinasi Nama dan Email, jika mereka kehilangan email/ID.

**Query Parameters (Required):**
- `name` (string): Nama lengkap peserta
- `email` (string): Email peserta

**Response 200 (OK) - Tiket Ditemukan:**
```json
{
  "status": "success",
  "message": "Tiket berhasil ditemukan",
  "data": {
    "status": "Accepted",
    "ticket_code": "AB12CD34",
    "qr_code_url": "https://supabase.com/storage/v1/object/public/tickets/AB12CD34.png"
  }
}
```

**Response 404 (Not Found):**
```json
{
  "status": "error",
  "message": "Data Tidak Ditemukan"
}
```

---

## 6. Event - Create Event (Admin)
**Endpoint:** `POST /api/v1/events`
**Headers:** `Authorization: Bearer <admin_token>`
**Request Body (JSON):**
```json
{
  "name": "Konser Tahunan",
  "capacity": 500,
  "registration_mode": "Manual Review"
  
}
```
**Response 200 (OK):** `{"status": "success", "message": "Event berhasil dibuat"}`

---

## 7. Event - Approve/Reject Registration (Admin)
**Endpoint:** `POST /api/v1/registrations/{id}/review`
**Headers:** `Authorization: Bearer <admin_token>`
**Request Body (JSON):**
```json
{
  "action": "Approve" // atau "Reject"
}
```
**Response 200 (OK):** `{"status": "success", "message": "Pendaftaran disetujui"}`

---

## 7B. Admin - Get Global Dashboard Stats
**Endpoint:** `GET /api/v1/admin/dashboard`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Menampilkan statistik global dari seluruh event (Total Event, Total Pendaftar Keseluruhan, Total Hadir Keseluruhan) dan data singkat 5 event terakhir.

---

## 8. Event - Get Event Stats (Admin)
**Endpoint:** `GET /api/v1/events/{id}/stats`
**Headers:** `Authorization: Bearer <admin_token>`
**Response 200 (OK):**
```json
{
  "status": "success",
  "data": {
    "total_capacity": 500,
    "pending": 50,
    "accepted": 120,
    "present": 80
  }
}
```


---

## 9. Event - Save Custom Form Fields (Admin)
**Endpoint:** `POST /api/v1/events/{id}/fields`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Menyimpan definisi kolom dinamis maksimal 25 field per event.
**Request Body (JSON):**
```json
{
  "fields": [
    {
      "field_name": "Asal Instansi",
      "field_type": "text",
      "is_required": true,
      "options": null
    }
  ]
}
```
**Response 200 (OK):** `{"status": "success", "message": "Form berhasil disimpan"}`

---

## 10. Event - Generate Volunteer PIN (Admin)
**Endpoint:** `POST /api/v1/events/{id}/generate-pin`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Menghasilkan PIN acak untuk panitia, menyimpannya secara ter-hash, dan mengembalikannya dalam bentuk plaintext sekali saja.
**Response 200 (OK):**
```json
{
  "status": "success",
  "message": "PIN berhasil dibuat",
  "data": {
    "pin": "849201"
  }
}
```

---

## 11. Event - Get Event Details (Admin)
**Endpoint:** `GET /api/v1/events/{id}`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Mengambil detail acara beserta form kustomnya untuk ditampilkan di halaman Edit Event.
**Response 200 (OK):** Mengembalikan objek Event lengkap beserta array `form_fields`, serta data `public_registration_url` dan `public_qr_code_url` untuk diakses Admin.

---

## 12. Event - List Registrations (Admin)
**Endpoint:** `GET /api/v1/events/{id}/registrations`
**Query Parameters (Optional):**
- `search` (string): Pencarian berdasarkan Nama atau Email.
- `status` (enum: Pending, Accepted, Rejected).
- `attendance` (boolean): `true` (Hadir), `false` (Belum Hadir).
- `start_date`, `end_date` (date): Rentang waktu pendaftaran.
- `sort` (enum: asc, desc).
*(Catatan: Filter UI bersifat Mutually Exclusive, namun backend harus mendukung parameter ini secara terpisah).*
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Mengambil daftar pendaftar dengan dukungan filter tingkat lanjut untuk halaman *Participant List*.
**Response 200 (OK):** Mengembalikan array objek Registration dengan *pagination*.

---

## 13. Event - Update Event (Admin)
**Endpoint:** `PUT /api/v1/events/{id}`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Memperbarui data dasar acara (seperti nama, lokasi, batas kuota).
**Request Body (JSON):** Sama seperti Create Event (kecuali field yang tidak dapat diubah).
**Response 200 (OK):** `{"status": "success", "message": "Event berhasil diperbarui"}`

---

## 14. Event - Export Participants (Admin)
**Endpoint:** `POST /api/v1/events/{id}/export`
**Headers:** `Authorization: Bearer <admin_token>`
**Description:** Membuat asynchronous export job untuk data peserta dalam format CSV.
Operasi export tidak dijalankan synchronous agar tidak terkena batas waktu eksekusi Vercel.
**Response 200 (OK):**
```json
{
  "status": "success",
  "data": { "job_id": "uuid" }
}
```
Client melakukan polling `GET /api/v1/exports/{job_id}`. Setelah job selesai, response
status mengembalikan `data.file_url`.
