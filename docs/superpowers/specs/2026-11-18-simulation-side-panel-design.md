# Simulation Panel: pindah ke samping — Design

Tanggal: 2026-11-18
Status: menunggu persetujuan

## Intent

Kontrol simulasi sekarang berupa bar lebar (maks 1080px) yang menempel di bawah
layar. Bar itu menutupi bagian bawah office dan terasa terlalu lebar untuk
isinya. Yang benar-benar dipakai saat demo cuma dua: **pilih provider** dan
**menu kamera**. Keduanya mau dipindah ke satu panel ramping di samping, supaya
office 3D terlihat utuh.

Kenapa: ini dashboard demo 3D — office adalah konten utamanya. Kontrol adalah
alat bantu, jadi tidak semestinya memakan sepertiga tinggi layar.

## Goals

- Panel kontrol di sisi kanan, lebar tetap 320px, tinggi mengikuti konten.
- Isi panel, urut prioritas: **Pilih Provider** (paling atas & paling besar),
  **Kamera** (3 tombol berlabel), **Mood** (grid 2x2 ringkas).
- Scene 3D **menyempit** untuk memberi ruang panel — tidak tertimpa.
- Bar bawah 1080px hilang.

## Non-goals

- Tidak mengubah isi telemetri, aturan status, atau polling 9Router.
- Tidak mengubah perilaku kamera (pose, durasi flight, orbit) — hanya tampilan
  tombolnya.
- Tidak menyentuh scene 3D, robot, atau lighting.

## Anti-goals

- Panel yang menutupi robot/meja (meja Antigravity ada di paling kanan).
- Tombol mood hilang sama sekali — masih dibutuhkan untuk demo.
- Hardcode tinggi panel di CSS.

## Constraints

- Lebar minimum dock lama ~860px agar tombol tidak ter-clip. Panel 320px berarti
  scene butuh sisa lebar; di bawah `lg` (1024px) panel disembunyikan dan kontrol
  kembali ke bar bawah seperti sekarang.
- `layout-check.mjs` yang sudah ada harus tetap lulus (tidak ada panel saling
  menimpa, tidak ada konten ter-clip).

## Approaches

1. **Panel kanan mendorong canvas** — scene jadi `right: 320px`, panel
   `position: fixed` di kanan. *Dipilih.*
2. **Panel kanan menimpa scene** — canvas tetap selebar layar. Ditolak: sudah
   dibuktikan lewat screenshot bahwa panel menutupi meja Antigravity dan kartu
   Office Vitals.
3. **Panel kanan + bar bawah tipis** — bar bawah menyusut jadi satu baris mood.
   Ditolak: user secara eksplisit ingin menghindari bar bawah yang lebar.

**Kenapa 1 menang:** satu-satunya opsi yang memenuhi "di samping, jangan lebar"
tanpa mengorbankan isi scene. Diverifikasi: canvas 960px di viewport 1280px
masih menampilkan keempat robot lengkap.

## Design

### Struktur

```
<main flex>
  <div scene-column>          ← melebar, canvas di dalamnya
    <Scene />
    <TacticalOverlay />       ← identity (kiri-atas) + Office Vitals (kanan-atas)
    <RobotSpotlightCard />    ← kiri-bawah
  </div>
  <aside panel 320px>         ← tidak menimpa; scene-column menyempit
    <ProviderPicker />
    <CameraMenu />
    <MoodGrid />
    <MoodLog />               ← dipindah dari kiri-bawah
  </aside>
</main>
```

`main` memakai `flex`, bukan `absolute inset-0`, supaya panel dan scene berbagi
lebar lewat layout normal. Panel `hidden lg:flex` — di bawah 1024px kontrol
kembali ke bar bawah (komponen yang sama, layout berbeda).

### Isi panel

**Pilih Provider** — daftar 4 robot, tiap baris: titik warna provider, nama,
lalu pill status. Baris terpilih diberi border + background `card-soft`.
Klik = `selectAgent(id)`. Ini menggantikan "Pick a robot" di dock lama.

**Kamera** — 3 tombol selebar panel, berlabel teks (bukan ikon saja):
`Overview`, `Hub`, `Fokus robot`. Ikon Lucide tetap dipakai di kiri label.
Klik = `requestCamera(preset)`.

**Mood** — grid 2x2. Tiap tombol: ikon + label + kbd angka. Hint ekspresi
dipindah ke `title`/tooltip agar tidak memakan tinggi. Tetap memanggil
`trigger(status)`, termasuk perilaku "Only X / Everyone".

**Mood Changes** — daftar transisi terakhir, `max-h` dengan scroll, di bawah
mood grid.

**Footer** — Pause/Resume + Reset sebagai dua tombol sejajar di dasar panel.

### Yang dipertahankan

- Shortcut keyboard 1–4 tetap.
- `simulationMode` tetap otomatis aktif saat mood dipicu.
- Sound toggle & Model toggle tetap ada, dipindah ke footer panel.
- Robot Spotlight tetap kiri-bawah.

## Yang diserahkan ke builder

- Jarak/`gap` dan ukuran font final di dalam panel.
- Apakah panel perlu `overflow-y-auto` saat tinggi viewport sangat pendek
  (misal 1280x600) — ya, pakai `toy-scroll` + `max-h`.
- Nama komponen baru dan apakah `ControlDock` dipecah atau ditulis ulang.

## Verifikasi

- `npm run layout:test` lulus di semua viewport (termasuk yang baru: panel tidak
  boleh menimpa Office Vitals atau Robot Spotlight).
- Screenshot di 1280x800, 1440x900, 1600x1000, 1920x1080: keempat robot terlihat.
- `npm run smoke` — keempat mood bisa diklik, bubble error muncul.
- Di bawah 1024px: panel tersembunyi, kontrol kembali ke bar bawah, tetap lulus
  layout test.
