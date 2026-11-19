# Panel Simulasi Bisa Dilipat — Design

Tanggal: 2026-11-19
Status: disetujui (opsi 1: rail vertikal 56px)

## Intent

Panel kanan (`SimulationPanel`) memakan 344px dari scene setiap saat, termasuk saat
pengguna hanya ingin melihat kantor. Pemilik meminta panel bisa **ditutup dan
dibuka**: saat dilipat yang tersisa hanya satu rail tipis berisi logo, dan saat
dibuka tampilannya persis seperti sekarang.

## Goals

- Tombol di dalam panel melipat panel menjadi rail vertikal **56px** berisi tombol
  logo; klik logo membuka panel kembali.
- Kondisi terbuka tetap sama: lebar 320px, isi, urutan, dan perilaku identik
  dengan hari ini.
- Kamera ikut menyesuaikan: area scene yang terlihat bertambah saat panel dilipat,
  jadi office tetap ter-frame di tengah area yang tidak tertutup.
- Kartu "Office vitals" ikut bergeser ke kanan saat panel dilipat (tidak
  meninggalkan celah 300px).
- Rail bisa dicapai keyboard, punya nama aksesibel, dan `aria-expanded` benar.

## Non-goals

- Tidak mengubah isi panel, `MoodGrid`, `ProviderPicker`, `CameraMenu`, footer,
  atau dock `< lg`.
- Tidak menyimpan kondisi lipat ke `localStorage` (sesi saja). Alasannya ada di
  *Keputusan 3*.
- Tidak menambah gate browser baru di `scripts/layout-check.mjs`; gate itu tetap
  menguji kondisi default (terbuka).
- Tidak ada animasi lebar. Panel muncul/hilang sebagai dua keadaan utuh, sama
  seperti cara `SimulationPanel`/`ControlDock` sudah bertukar di breakpoint.

## Anti-goals

- Rail yang masih memuat judul, status provider, atau tombol lain sampai terbaca
  sebagai panel mini.
- Panel terbuka yang bergeser satu piksel dari tampilan sekarang.
- Kamera yang tiba-tiba zoom/geser karena lebar panel berubah tanpa perhitungan
  ulang.

## Constraints

- **State presentasi, bukan telemetri.** `AGENT.md` §6 melarang menaruh preferensi
  tampilan di `useAgentStore`; tempatnya `useUiStore`.
- **Angka geometri dipakai bersama.** Lebar panel, gutter, dan footprint sudah
  dimiliki `src/lib/hudLayout.ts`; lebar rail dan footprint-nya harus tinggal di
  sana juga, karena kamera membaca file yang sama.
- **`scripts/layout-check.mjs` mengunci panel 320px.** Kondisi default harus tetap
  terbuka, kalau tidak gate itu merah.
- **Kanvas full-bleed tidak berubah.** Panel tetap absolut di atas kanvas; yang
  berubah hanya footprint yang dikurangkan dari lebar terlihat.
- Semua gate yang ada harus tetap hijau: `npx tsc --noEmit`, `npx eslint`,
  `npm run layout:test`, `npm run smoke`, `npm run build`.

## Approaches

1. **State lokal di `SimulationPanel`.** Paling kecil: satu `useState`, satu
   cabang render. Tapi kamera dan kartu Office Vitals tidak bisa tahu panel
   dilipat, jadi scene tetap di-frame untuk 344px dan vitals meninggalkan celah —
   persis dua hal yang membuat hasilnya terasa setengah jadi.
2. **State di `useUiStore` (dipilih).** Satu boolean + satu setter. Tiga pembaca:
   panel, kartu vitals, dan `ResponsiveFov`. Semua sudah client component, jadi
   tidak ada biaya tambahan.
3. **State di `useAgentStore`.** Ditolak: melanggar pemisahan telemetri vs
   presentasi yang sudah tertulis di `AGENT.md`, dan setiap toggle akan terlihat
   seperti update telemetri bagi subscriber lain.

## Design

### Keputusan 1 — dua konstanta baru di `hudLayout.ts`

```ts
/** Lebar rail saat panel dilipat: cukup untuk tombol logo 40px + padding. */
export const PANEL_RAIL_WIDTH = 56;

/** Ruang yang dipakai rail: 56 + 12 + 12 = 80px. */
export const PANEL_RAIL_FOOTPRINT = PANEL_RAIL_WIDTH + PANEL_GUTTER * 2;
```

`visibleSceneWidth(canvasWidth, collapsed = false)` mengurangkan
`PANEL_RAIL_FOOTPRINT` saat `collapsed`, `PANEL_FOOTPRINT` saat tidak. Parameter
opsional supaya semua pemanggil lama (dan gate) tetap sah.

Posisi `Office vitals` di `TacticalOverlay` memakai angka yang sama, bukan
literal baru: `CommandCenter` memasang
`--hud-right-offset: (collapsed ? PANEL_RAIL_FOOTPRINT : PANEL_FOOTPRINT) + PANEL_GUTTER` di `<main>`,
dan kartu vitals memakai `lg:right-[var(--hud-right-offset)]`. Kelas statis
`lg:right-[356px]`/`lg:right-[92px]` tidak dipakai karena angka itu harus satu
sumber dengan kamera, dan inline `right` akan ikut menimpa posisi di ponsel.

### Keputusan 2 — `panelCollapsed` di `useUiStore`

```ts
panelCollapsed: boolean;
togglePanelCollapsed: () => void;
```

Default `false`. Tidak masuk `UiPrefs`/`localStorage`: panel terbuka adalah
tampilan acuan, dan hydrate dari storage akan membuat render pertama (terbuka)
berbeda dari render kedua (terlipat) — persis jenis mismatch yang sudah dihindari
store ini untuk `soundEnabled`/`useModel`.

### Keputusan 3 — rail dan tombol lipat

Panel terbuka mendapat satu baris header tipis di atas `ProviderPicker`:

```
[logo 20px] Panel simulasi            [»]
```

Tinggi baris ~28px, gaya `toy-btn` untuk tombol chevron. Ini satu-satunya
tambahan visual pada kondisi terbuka; isi panel lainnya tidak bergeser selain ke
bawah sebesar baris itu.

Panel terlipat merender `aside` dengan lebar `PANEL_RAIL_WIDTH`, tanpa
`overflow-y-auto`, berisi satu tombol `toy-btn` 40x40:

- ikon `Monitor` (logo yang sama dengan kartu identitas),
- `aria-label="Buka panel simulasi"`, `aria-expanded={false}`,
- klik: `togglePanelCollapsed()` + `playClick()`.

`aside` terlipat tetap `aria-label="Simulation panel"` supaya gate dan pembaca
layar menemukan elemen yang sama. Karena `layout-check` hanya menguji kondisi
default, lebar 56px tidak bentrok dengan assertion 320px.

### Keputusan 4 — kamera dan vitals membaca boolean yang sama

- `ResponsiveFov` di `Scene.tsx` berlangganan `panelCollapsed`, meneruskannya ke
  `applyProjection(camera, width, height, collapsed)`, dan menjalankannya ulang
  saat nilai berubah (tambahkan ke dependency `useLayoutEffect`).
- `TacticalOverlay` berlangganan boolean yang sama untuk offset kanan kartu
  vitals.
- Offset-nya `footprint + PANEL_GUTTER`: 356px saat terbuka (seperti sekarang) dan
  92px saat terlipat (80 + 12). Rumusnya sama dengan kelas `lg:right-[356px]`
  hari ini, jadi satu-satunya angka baru adalah lebar rail.

### Berkas yang disentuh

| Berkas | Perubahan |
| :--- | :--- |
| `src/lib/hudLayout.ts` | `PANEL_RAIL_WIDTH`, `PANEL_RAIL_FOOTPRINT`, parameter `collapsed` di `visibleSceneWidth` |
| `src/store/useUiStore.ts` | `panelCollapsed`, `togglePanelCollapsed` (tidak dipersist) |
| `src/components/hud/SimulationPanel.tsx` | header lipat + cabang render rail |
| `src/components/hud/TacticalOverlay.tsx` | offset vitals dari CSS var yang dipasang `CommandCenter` |
| `src/components/canvas/Scene.tsx` | `applyProjection` menerima `collapsed`, `ResponsiveFov` berlangganan store |
| `src/components/CommandCenter.tsx` | memasang `--hud-right-offset` dari `panelCollapsed` |

`CommandCenter` tetap satu-satunya pemilik wrapper panel (`right-0 p-3`); ia hanya
menambahkan satu custom property di `<main>` supaya `TacticalOverlay` bisa memakai
angka yang sama tanpa duplikat literal.

## Verifikasi

- `npx tsc --noEmit` → 0, `npx eslint` → 0.
- `npm run layout:test` → hijau (kondisi default tetap terbuka, panel 320px).
- `npm run smoke` → hijau, tidak ada console error baru.
- `npm run build` → bersih.
- Bukti visual: screenshot 1440x900 kondisi terbuka lalu terlipat; rail hanya
  berisi logo, vitals menempel ke rail, office mengisi ruang baru tanpa ter-crop.

## Risiko

| Risiko | Mitigasi |
| :--- | :--- |
| Kamera tidak ikut menyesuaikan → office bergeser ke kiri saat dilipat | `ResponsiveFov` berlangganan boolean; `visibleSceneWidth` memakai footprint rail |
| Vitals menutupi rail atau menyisakan celah | Offset dihitung dari konstanta, bukan literal |
| `layout-check` merah karena panel default terlipat | Default `false`, state tidak dipersist |
| Tombol lipat tidak terjangkau keyboard | Tombol asli (`<button>`), `aria-expanded`, `aria-label` |
| Panel terbuka bergeser dari tampilan sekarang | Satu baris header saja; lebar 320px dan isi tidak berubah |

## Rollback

Hapus dua konstanta, dua field store, dan cabang render. Tidak ada data,
migrasi, atau file biner yang tersentuh.
