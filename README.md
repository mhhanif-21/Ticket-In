# TiketIn (formerly Event Gate System)

Platform B2B bagi Event Organizer untuk mengelola siklus pendaftaran dan check-in acara secara mandiri.

Proyek ini dibangun menggunakan arsitektur monorepo yang menampung dua stack utama:
1. **Web (Next.js)**: Backend API (Route Handlers) dan antarmuka web untuk publik (pendaftar) serta panitia lapangan (scanner check-in). Kode terdapat di folder `web/`.
2. **Mobile Admin (Flutter)**: Aplikasi mobile untuk admin EO mengelola acara. Kode terdapat di folder `mobile/`.

## Development Environment
Proyek ini menggunakan Docker Compose dan Supabase CLI untuk *local development*. 
Lihat `docker-compose.yml` untuk topologi jaringan `TiketIn-network`.

## Dokumentasi
- [Requirements](docs/requirements)
- [Architecture](docs/architecture)
- [Design](docs/design)
- [Sprint Backlog](docs/event-gate-sprint-backlog)

## Setup Git
Penyimpanan kredensial seperti `.env` dan direktori *build/vendor* sudah diabaikan melalui `.gitignore`.
