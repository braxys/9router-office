# Simulation Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan kontrol simulasi dari bar bawah 1080px ke panel ramping 320px di sisi kanan, yang mendorong (bukan menimpa) scene 3D.

**Architecture:** `CommandCenter` berubah dari `relative` + layer `absolute` menjadi `flex` dua kolom: kolom scene (melebar) dan `<aside>` panel (320px tetap). Di bawah breakpoint `lg` panel disembunyikan dan kontrol kembali ke bar bawah. Isi panel dipecah jadi komponen fokus: `ProviderPicker`, `CameraMenu`, `MoodGrid`, `MoodLog`, plus footer aksi.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, zustand, lucide-react. Verifikasi lewat CDP headless Chrome (`scripts/layout-check.mjs`, `scripts/smoke.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-18-simulation-side-panel-design.md`

## Global Constraints

- Panel lebar tetap **320px**, hanya tampil pada `lg` (≥1024px) ke atas.
- Scene **menyempit**, tidak tertimpa panel.
- Urutan isi panel: Pilih Provider → Kamera → Mood → Mood Changes → Footer.
- Shortcut keyboard `1`–`4` tetap berfungsi.
- Memicu mood tetap otomatis menyalakan `simulationMode`.
- Kartu **Office Vitals** tetap di kanan-atas; **Robot Spotlight** tetap di kiri-bawah.
- Warna/permukaan wajib pakai token yang ada (`toy-card`, `toy-btn`, `toy-scroll`, `text-ink*`, `candy-*`, `card-*`) — jangan hardcode warna baru.
- Tidak mengubah `src/lib/*` (telemetri, status, kamera) maupun komponen canvas.

## Review Focus

- **Viewport pendek (1280×600):** panel lebih tinggi dari layar. Harapan: panel bisa di-scroll (`toy-scroll` + `max-h`), bukan terpotong tanpa akses.
- **Breakpoint 1023px vs 1024px:** panel muncul/hilang. Harapan: tidak ada keadaan di mana kontrol tidak bisa diakses sama sekali, dan tidak ada dua salinan kontrol yang tampil bersamaan.
- **Canvas resize:** saat panel muncul, canvas menyempit dan R3F harus re-render tanpa distorsi atau canvas hitam. Harapan: keempat robot tetap terlihat.
- **Target klik kecil:** tombol mood 2×2 di panel sempit. Harapan: tetap ≥40px tinggi dan bisa diklik tanpa salah pencet tombol sebelah.
- **`prefers-reduced-motion`:** animasi panel/pop tombol tidak boleh jadi satu-satunya penanda status.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/components/hud/SimulationPanel.tsx` | **Create.** Komponen panel kanan; merangkai sub-komponen + footer aksi. |
| `src/components/hud/ProviderPicker.tsx` | **Create.** Daftar provider + pilih agent. |
| `src/components/hud/CameraMenu.tsx` | **Create.** 3 tombol kamera berlabel. |
| `src/components/hud/MoodGrid.tsx` | **Create.** Grid 2×2 tombol mood + toggle Only/Everyone. |
| `src/components/hud/ControlDock.tsx` | **Modify.** Tetap dipakai sebagai bar bawah untuk `< lg`; hapus bagian "Pick a robot" (pindah ke ProviderPicker). |
| `src/components/hud/TacticalOverlay.tsx` | **Modify.** `MoodLogCard` dipakai ulang di panel; `RobotSpotlightCard` tetap. |
| `src/components/CommandCenter.tsx` | **Modify.** Layout `flex` dua kolom + breakpoint. |
| `scripts/layout-check.mjs` | **Modify.** Tambah asersi khusus panel (tidak menimpa Vitals/Spotlight, tidak ter-clip). |

---

### Task 1: Pecah isi dock jadi komponen panel yang bisa dipakai ulang

**Files:**
- Create: `src/components/hud/ProviderPicker.tsx`
- Create: `src/components/hud/CameraMenu.tsx`
- Create: `src/components/hud/MoodGrid.tsx`
- Test: `scripts/layout-check.mjs` (dipakai ulang; tidak ada unit test runner di proyek)

**Interfaces:**
- Consumes: `useAgentStore` (`agents`, `selectedAgentId`, `selectAgent`, `setStatus`, `setAllStatuses`, `simulationMode`, `setSimulationMode`), `MANUAL_STATUSES`/`STATUS_META` dari `@/lib/agents`, `requestCamera` dari `@/lib/cameraBus`, `playClick`/`playToggle` dari `@/lib/audio`.
- Produces:
  - `export function ProviderPicker(): JSX.Element` — tanpa props.
  - `export function CameraMenu(): JSX.Element` — tanpa props.
  - `export function MoodGrid({ compact }: { compact?: boolean }): JSX.Element` — `compact` memakai grid 2×2 dan menyembunyikan teks hint ekspresi.

- [ ] **Step 1: Buat `ProviderPicker`**

Pindahkan blok "Pick a robot" dari `ControlDock` (baris ~291–334) apa adanya ke komponen baru, dengan judul `Pilih provider`. Pertahankan: titik warna `agent.accentColor`, nama, pill status, `aria-pressed`, `selectAgent` + `playClick`.

- [ ] **Step 2: Buat `CameraMenu`**

Tiga tombol selebar penuh, satu per baris, berisi ikon + label teks: `Overview`, `Hub`, `Fokus robot`. Sumber data tetap `CAMERA_ACTIONS` (pindahkan konstanta itu dari `ControlDock` ke `CameraMenu`, ekspor bila perlu). Klik → `requestCamera(preset)` + `playClick()`.

- [ ] **Step 3: Buat `MoodGrid`**

Pindahkan logika `trigger`, `broadcast`, `flash`, dan effect `flash` dari `ControlDock`. Saat `compact`, grid `grid-cols-2`; hint ekspresi pindah ke `title` (tidak dirender sebagai teks).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/components/hud/ProviderPicker.tsx src/components/hud/CameraMenu.tsx src/components/hud/MoodGrid.tsx
git commit -m "refactor(hud): extract provider, camera and mood controls"
```

---

### Task 2: Rangkai `SimulationPanel` dan pasang layout dua kolom

**Files:**
- Create: `src/components/hud/SimulationPanel.tsx`
- Modify: `src/components/CommandCenter.tsx`
- Modify: `src/components/hud/ControlDock.tsx`

**Interfaces:**
- Consumes: `ProviderPicker`, `CameraMenu`, `MoodGrid` (Task 1), `MoodLogCard` dari `TacticalOverlay`.
- Produces: `export function SimulationPanel(): JSX.Element`.

- [ ] **Step 1: Buat `SimulationPanel`**

`<aside>` lebar `w-[320px]` `shrink-0`, `toy-card`, `max-h-[calc(100dvh-2rem)]`, `overflow-y-auto toy-scroll`. Isi berurutan: `ProviderPicker`, `CameraMenu`, `MoodGrid compact`, `MoodLogCard`, lalu footer berisi Pause/Resume + Reset (pindahkan handler dari `ControlDock` header) dan `SoundToggle` + `ModelToggle`.

- [ ] **Step 2: Ubah `CommandCenter` jadi flex dua kolom**

Ganti `<main className="relative ...">` + layer `absolute` menjadi:

```tsx
<main className="flex h-dvh w-full overflow-hidden bg-office-sky">
  <div className="relative min-w-0 flex-1">
    {/* Scene, toy-dots, TacticalOverlay, RobotSpotlightCard (kiri-bawah) */}
  </div>
  <div className="hidden shrink-0 p-3 lg:block">
    <SimulationPanel />
  </div>
</main>
```

Bar bawah (`ControlDock`) hanya dirender di bawah `lg`: bungkus dengan `lg:hidden`. Kartu `MoodLogCard` **tidak lagi** dirender di kolom scene (sudah pindah ke panel).

- [ ] **Step 3: Sesuaikan `ControlDock`**

Hapus blok "Pick a robot" dan grup tombol kamera (sudah pindah). Sisakan: header (judul + Pause/Resume + Reset), grid mood, footer hint. Pastikan tetap dipakai hanya untuk `< lg`.

- [ ] **Step 4: Cek visual di 1280×800 dan 1600×1000**

Run: `npm run layout:test`
Expected: tidak ada `OVERLAP`, tidak ada `CLIPPED`.

- [ ] **Step 5: Commit**

```bash
git add src/components/hud/SimulationPanel.tsx src/components/CommandCenter.tsx src/components/hud/ControlDock.tsx
git commit -m "feat(hud): move simulation controls into a right side panel"
```

---

### Task 3: Perluas regression test untuk panel

**Files:**
- Modify: `scripts/layout-check.mjs`

**Interfaces:**
- Consumes: DOM dari Task 2.
- Produces: tidak ada ekspor; menambah asersi.

- [ ] **Step 1: Tambah asersi panel**

Di probe, tambahkan:
- `panelVisible` — `aside` ada dan `offsetParent !== null`.
- `panelOverlapsVitals` — panel vs kartu "Office vitals" harus `false`.
- `panelOverlapsSpotlight` — panel vs kartu "Robot spotlight" harus `false`.
- `panelClipped` — elemen di dalam panel dengan `scrollWidth > clientWidth + 1` harus `0` (kecuali elemen ber-`overflow-x-auto`).
- `dockVisible` — `aria-label="Simulation mode control dock"` terlihat.

- [ ] **Step 2: Tambah asersi breakpoint**

Assertion: pada lebar ≥1024 `panelVisible === true` dan `dockVisible === false`; pada lebar <1024 `panelVisible === false` dan `dockVisible === true`. Ini yang mencegah dua salinan kontrol tampil bersamaan.

- [ ] **Step 3: Tambah viewport pendek**

Tambahkan `{ w: 1280, h: 600 }` ke `VIEWPORTS` untuk menangkap kasus panel lebih tinggi dari layar.

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `npm run layout:test`
Expected: semua viewport `PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/layout-check.mjs
git commit -m "test(hud): assert side panel never overlaps or clips"
```

---

### Task 4: Verifikasi perilaku dan screenshot

**Files:**
- Tidak ada perubahan kode.

- [ ] **Step 1: Smoke test interaksi**

Run: `npm run smoke` (Chrome harus hidup di CDP port 9224)
Expected: keempat mood terklik, bubble error muncul, tidak ada console error.

- [ ] **Step 2: Screenshot 4 viewport**

Ambil screenshot di 1280×800, 1440×900, 1600×1000, 1920×1080. Periksa manual: keempat robot terlihat, panel tidak menutupi meja Antigravity, Office Vitals utuh di kanan-atas.

- [ ] **Step 3: Cek breakpoint di 1023px**

Screenshot di 1023×800. Expected: panel hilang, bar bawah muncul, tidak ada elemen terpotong.

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: keduanya sukses.

- [ ] **Step 5: Commit (bila ada perbaikan)**

```bash
git add -A
git commit -m "fix(hud): polish side panel layout"
```
