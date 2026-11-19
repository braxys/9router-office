# Panel Simulasi Bisa Dilipat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel simulasi kanan bisa dilipat menjadi rail 56px berisi tombol logo, dan dibuka kembali ke tampilan 320px yang sekarang, dengan kamera dan kartu Office Vitals mengikuti lebar yang tersisa.

**Architecture:** Satu boolean presentasi (`panelCollapsed`) di `useUiStore` memberi tahu panel, `ResponsiveFov`, dan `TacticalOverlay`. `src/lib/hudLayout.ts` tetap satu-satunya pemilik angka geometri: lebar panel, lebar rail, dan gutter. Kamera memakai `visibleSceneWidth(canvasWidth, collapsed)`; kartu vitals memakai CSS var `--hud-right-offset` yang dipasang `CommandCenter`.

**Tech Stack:** TypeScript, React 19, Next.js 16, Zustand 5, Tailwind 4, Node 24 type-stripping untuk gate non-browser.

**Spec:** `docs/superpowers/specs/2026-11-19-collapsible-sidebar-design.md`

## Global Constraints

- **State presentasi di `useUiStore`, bukan `useAgentStore`.** `AGENT.md` §6.
- **`panelCollapsed` tidak dipersist** ke `localStorage`; default `false` (terbuka).
- **Kondisi terbuka = tampilan sekarang**: lebar `PANEL_WIDTH` (320px), isi dan urutan panel tidak berubah; hanya ada satu baris header baru di atas `ProviderPicker`.
- **Rail = `PANEL_RAIL_WIDTH` 56px** berisi satu tombol logo 40x40; tidak ada teks/status lain.
- **Angka geometri hanya di `src/lib/hudLayout.ts`.** Jangan menulis 320/344/56/80/92 sebagai literal di komponen.
- **`layout-check.mjs` mengunci panel 320px**, jadi default harus terbuka dan rail tidak boleh dirender bersamaan dengan panel penuh.
- **Jangan pernah `git add -A` / `git add .`** — working tree berisi WIP pengguna (`scripts/layout-check.mjs`, `CommandCenter.tsx`, `OfficeRoom.tsx`, `Scene.tsx`, `SimulationPanel.tsx`, `TacticalOverlay.tsx`, `src/lib/hudLayout.ts`). Stage per path.
- Gate yang ada harus tetap hijau: `npx tsc --noEmit`, `npx eslint`, `npm run layout:test`, `npm run smoke`, `npm run build`.

## Review Focus

1. **Viewport tepat di `lg` (1024px).** Panel boleh dilipat; kamera harus memakai footprint rail, bukan 344px, karena di 1024 selisih 264px itu terlihat sebagai office yang bergeser. → test Task 1 (`1024, true` → 944) + verifikasi visual Task 3.
2. **Di bawah `lg`, panel tidak dirender sama sekali** (dock yang tampil). Boolean yang tersisa dari viewport lebar tidak boleh membuat kamera mengurangkan footprint panel. → test Task 1 (`1023, true` → 1023).
3. **Viewport lebih sempit dari panel.** Klamp 0 yang sudah ada harus tetap berlaku untuk kedua keadaan, jangan menghasilkan lebar negatif. → test Task 1 (`60` → 0).
4. **Kamera berubah saat panel ditoggle.** `ResponsiveFov` harus menjalankan ulang `applyProjection` ketika `panelCollapsed` berubah dan memanggil `invalidate()`; kalau tidak, `frameloop="demand"` bisa tidak pernah melukis ulang. → Task 2 Step 5.
5. **Tombol lipat dan rail harus bisa dipakai tanpa mouse.** Keduanya `<button>` asli dengan nama aksesibel, dan `aria-expanded` mencerminkan keadaan. → Task 2 Step 2–3.

---

### Task 1: Geometri dua keadaan + gate murni

**Files:**
- Modify: `src/lib/hudLayout.ts`
- Create: `scripts/hud-layout-rules.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces (di `hudLayout.ts`):
  - `LG_BREAKPOINT: 1024`, `PANEL_WIDTH: 320`, `PANEL_GUTTER: 12`, `PANEL_FOOTPRINT: 344` — tidak berubah
  - `PANEL_RAIL_WIDTH: 56`
  - `PANEL_RAIL_FOOTPRINT: 80`
  - `visibleSceneWidth(canvasWidth: number, collapsed?: boolean): number`
- Consumes: tidak ada.

- [ ] **Step 1: Tulis gate yang gagal di `scripts/hud-layout-rules.mjs`**

```js
/**
 * Truth table for the HUD geometry contract.
 *
 * Imports `src/lib/hudLayout.ts` directly (Node 24 strips types), so the camera
 * framing and the layout panel cannot drift apart without a red gate.
 *
 *   npm run layout:unit
 */
import {
  LG_BREAKPOINT,
  PANEL_FOOTPRINT,
  PANEL_GUTTER,
  PANEL_RAIL_FOOTPRINT,
  PANEL_RAIL_WIDTH,
  PANEL_WIDTH,
  visibleSceneWidth,
} from '../src/lib/hudLayout.ts';

let failures = 0;
let total = 0;

function check(label, actual, expected) {
  total += 1;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) {
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual  : ${JSON.stringify(actual)}`);
  }
}

console.log('\n--- panel geometry ---\n');

check('panel width', PANEL_WIDTH, 320);
check('panel gutter', PANEL_GUTTER, 12);
check('panel footprint', PANEL_FOOTPRINT, 344);
check('rail width', PANEL_RAIL_WIDTH, 56);
check('rail footprint', PANEL_RAIL_FOOTPRINT, 80);

console.log('\n--- visible scene width ---\n');

check('expanded by default', visibleSceneWidth(1600), 1600 - PANEL_FOOTPRINT);
check('expanded explicitly', visibleSceneWidth(1600, false), 1600 - PANEL_FOOTPRINT);
check('collapsed gives the panel back', visibleSceneWidth(1600, true), 1600 - PANEL_RAIL_FOOTPRINT);
check('exactly lg, expanded', visibleSceneWidth(LG_BREAKPOINT), LG_BREAKPOINT - PANEL_FOOTPRINT);
check('exactly lg, collapsed', visibleSceneWidth(LG_BREAKPOINT, true), LG_BREAKPOINT - PANEL_RAIL_FOOTPRINT);
check('below lg ignores the panel', visibleSceneWidth(LG_BREAKPOINT - 1), LG_BREAKPOINT - 1);
check('below lg ignores the rail too', visibleSceneWidth(LG_BREAKPOINT - 1, true), LG_BREAKPOINT - 1);
check('a viewport narrower than the panel clamps to zero', visibleSceneWidth(60), 0);
check('a narrow viewport with the rail clamps to zero too', visibleSceneWidth(60, true), 0);
check('zero passes through', visibleSceneWidth(0), 0);
check('NaN passes through', Number.isNaN(visibleSceneWidth(NaN)), true);

if (failures > 0) {
  console.error(`\n${failures}/${total} failed`);
  process.exit(1);
}
console.log(`\n${total}/${total} passed`);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hud-layout-rules.mjs`

Expected: gagal karena `PANEL_RAIL_WIDTH`, `PANEL_RAIL_FOOTPRINT`, dan parameter `collapsed` belum ada (import bernilai `undefined`, assertion rail FAIL).

- [ ] **Step 3: Tambah konstanta dan parameter di `src/lib/hudLayout.ts`**

Sesudah `PANEL_FOOTPRINT`:

```ts
/** The rail left behind when the panel is collapsed: one 40px logo + padding. */
export const PANEL_RAIL_WIDTH = 56;

/** Total horizontal space the collapsed rail occupies: 56 + 12 + 12 = 80px. */
export const PANEL_RAIL_FOOTPRINT = PANEL_RAIL_WIDTH + PANEL_GUTTER * 2;
```

Ganti `visibleSceneWidth` (dan doc comment-nya) menjadi:

```ts
export function visibleSceneWidth(canvasWidth: number, collapsed = false): number {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) return canvasWidth;
  if (canvasWidth < LG_BREAKPOINT) return canvasWidth;
  const footprint = collapsed ? PANEL_RAIL_FOOTPRINT : PANEL_FOOTPRINT;
  return Math.max(0, canvasWidth - footprint);
}
```

- [ ] **Step 4: Jalankan gate, pastikan lulus**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hud-layout-rules.mjs`

Expected: `16/16 passed`.

- [ ] **Step 5: Daftarkan script npm**

Di `package.json`, setelah `layout:test`:

```json
    "layout:unit": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hud-layout-rules.mjs",
```

Run: `npm run layout:unit` → `passed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hudLayout.ts scripts/hud-layout-rules.mjs package.json
git commit -m "feat(hud): give the panel a collapsed footprint in the shared geometry"
```

---

### Task 2: State lipat, rail, kamera, dan Office Vitals

**Files:**
- Modify: `src/store/useUiStore.ts`
- Modify: `src/components/hud/SimulationPanel.tsx`
- Modify: `src/components/CommandCenter.tsx`
- Modify: `src/components/hud/TacticalOverlay.tsx`
- Modify: `src/components/canvas/Scene.tsx`

**Interfaces:**
- Consumes: `PANEL_RAIL_WIDTH`, `PANEL_RAIL_FOOTPRINT`, `PANEL_FOOTPRINT`, `PANEL_GUTTER`, `visibleSceneWidth(width, collapsed)` dari Task 1.
- Produces:
  - `useUiStore.panelCollapsed: boolean`, `useUiStore.togglePanelCollapsed(): void`
  - `aside[aria-label="Simulation panel"]` dengan lebar 320px (terbuka) atau 56px (terlipat)
  - tombol ber-`aria-label="Lipat panel simulasi"` / `"Buka panel simulasi"`

- [ ] **Step 1: Tambah state di `src/store/useUiStore.ts`**

Di `interface UiStore`, tepat sebelum `setFlash`:

```ts
  /**
   * Whether the simulation side panel is folded into its logo rail.
   *
   * Presentation only, and deliberately not persisted: the panel starts open so
   * the server render and the first client render agree, and so `layout-check`
   * keeps measuring the 320px panel it asserts.
   */
  panelCollapsed: boolean;
  togglePanelCollapsed: () => void;
```

Di aksi, sebelum `setSoundEnabled`:

```ts
  togglePanelCollapsed: () => set((state) => ({ panelCollapsed: !state.panelCollapsed })),
```

Dan di objek state awal (setelah `flash: null`): `panelCollapsed: false,`.

- [ ] **Step 2: Render rail terlipat di `src/components/hud/SimulationPanel.tsx`**

Import tambahan:

```ts
import { ChevronsRight, Monitor, Pause, Play, RotateCcw } from 'lucide-react';
import { useUiStore } from '@/store/useUiStore';
import { playClick, playConfirm, playToggle } from '@/lib/audio';
import { PANEL_RAIL_WIDTH, PANEL_WIDTH } from '@/lib/hudLayout';
```

Di badan komponen, sebelum `return`:

```ts
  const collapsed = useUiStore((s) => s.panelCollapsed);
  const togglePanelCollapsed = useUiStore((s) => s.togglePanelCollapsed);
```

Sisipkan cabang rail **sebelum** `return` panel penuh:

```tsx
  if (collapsed) {
    return (
      <aside
        aria-label="Simulation panel"
        className="toy-card flex shrink-0 flex-col items-center p-2"
        style={{ width: PANEL_RAIL_WIDTH }}
      >
        <button
          type="button"
          onClick={() => {
            togglePanelCollapsed();
            playClick();
          }}
          aria-label="Buka panel simulasi"
          aria-expanded={false}
          className="toy-btn flex h-10 w-10 cursor-pointer items-center justify-center"
        >
          <Monitor className="h-5 w-5 text-candy-blue" strokeWidth={2.4} aria-hidden />
        </button>
      </aside>
    );
  }
```

- [ ] **Step 3: Tambah baris header lipat di panel penuh**

Kembalikan `SimulationPanel` ke `return` biasa, lalu sisipkan baris ini sebagai anak pertama `<aside>` (sebelum `<ProviderPicker />`):

```tsx
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-candy-blue/20">
          <Monitor className="h-3.5 w-3.5 text-candy-blue" strokeWidth={2.4} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-[10px] font-extrabold tracking-wide text-ink-dim uppercase">
          Panel simulasi
        </p>
        <button
          type="button"
          onClick={() => {
            togglePanelCollapsed();
            playClick();
          }}
          aria-label="Lipat panel simulasi"
          aria-expanded
          className="toy-btn flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-ink"
        >
          <ChevronsRight className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden />
        </button>
      </div>
```

Hapus import `ChevronsLeft` bila tidak terpakai — eslint akan menandainya.

- [ ] **Step 4: Pasang `--hud-right-offset` di `src/components/CommandCenter.tsx`**

Import:

```ts
import { PANEL_FOOTPRINT, PANEL_GUTTER, PANEL_RAIL_FOOTPRINT } from '@/lib/hudLayout';
import { useUiStore } from '@/store/useUiStore';
import type { CSSProperties } from 'react';
```

Di badan komponen:

```ts
  const panelCollapsed = useUiStore((s) => s.panelCollapsed);
```

Pada `<main>`:

```tsx
    <main
      className="relative flex h-dvh w-full overflow-hidden bg-office-sky"
      style={
        {
          '--hud-right-offset': `${
            (panelCollapsed ? PANEL_RAIL_FOOTPRINT : PANEL_FOOTPRINT) + PANEL_GUTTER
          }px`,
        } as CSSProperties
      }
    >
```

- [ ] **Step 5: Pakai var itu di `src/components/hud/TacticalOverlay.tsx`**

Ganti kelas wrapper vitals

```
"pointer-events-none absolute top-4 right-4 z-20 sm:top-5 sm:right-5 lg:right-[356px]"
```

menjadi

```
"pointer-events-none absolute top-4 right-4 z-20 sm:top-5 sm:right-5 lg:right-[var(--hud-right-offset)]"
```

Perbarui komentar di atasnya: offset datang dari `CommandCenter`, yaitu
`footprint + gutter` (356px terbuka, 92px terlipat), jadi kartu tetap 12px dari
panel/rail alih-alih menutupinya.

- [ ] **Step 6: Kamera membaca keadaan lipat di `src/components/canvas/Scene.tsx`**

- Import `useUiStore` (bila belum ada di file itu).
- `applyProjection(camera, canvasWidth, height, collapsed)` meneruskan `collapsed` ke `visibleSceneWidth(canvasWidth, collapsed)`; komentarnya menyebut dua footprint.
- `ResponsiveFov`:

```tsx
function ResponsiveFov() {
  const { camera, size, invalidate } = useThree();
  const panelCollapsed = useUiStore((s) => s.panelCollapsed);

  useLayoutEffect(() => {
    applyProjection(camera, size.width, size.height, panelCollapsed);
    invalidate();
  }, [camera, size.width, size.height, panelCollapsed, invalidate]);

  return null;
}
```

Tidak ada pemanggil `applyProjection` lain; kalau `tsc` menemukan satu, teruskan
`false` agar kondisi default tidak berubah.

- [ ] **Step 7: Type-check, lint, dan gate layout**

Run: `npx tsc --noEmit` → 0.
Run: `npx eslint` → 0 error.
Run: `npm run layout:unit` → `passed`.
Run: `npm run layout:test` → 15/15 (butuh dev server 3001 + Chrome CDP 9224; kondisi default tetap terbuka).

- [ ] **Step 8: Commit**

```bash
git add src/store/useUiStore.ts src/components/hud/SimulationPanel.tsx src/components/CommandCenter.tsx src/components/hud/TacticalOverlay.tsx src/components/canvas/Scene.tsx
git commit -m "feat(hud): collapse the simulation panel into a logo rail"
```

---

### Task 3: Verifikasi visual menyeluruh + dokumentasi

**Files:**
- Modify: `AGENT.md`
- Modify: `TASKS.md`

**Interfaces:**
- Consumes: semua dari Task 1–2.
- Produces: tidak ada kode baru.

- [ ] **Step 1: Sapu gate**

```
npx tsc --noEmit
npx eslint
npm run layout:unit
npm run layout:test
npm run smoke
npm run build
```

Expected: semuanya exit 0.

- [ ] **Step 2: Bukti visual dua keadaan**

Dev server di 3001. Di 1440x900, ambil screenshot kondisi terbuka, klik
`button[aria-label="Lipat panel simulasi"]`, ambil screenshot lagi.

Periksa:

- rail hanya berisi tombol logo, lebarnya 56px, menempel di gutter kanan;
- kartu Office Vitals berhenti ±12px dari rail, tidak menutupinya;
- office mengisi ruang yang dilepas panel dan tetap di tengah area terlihat
  (tidak ter-crop ke kiri);
- klik logo mengembalikan panel 320px persis seperti sebelum dilipat.

- [ ] **Step 3: Perbarui `AGENT.md`**

Di §6 butir presentation state, tambah satu kalimat: panel simulasi bisa
dilipat, `panelCollapsed` tinggal di `useUiStore` dan tidak dipersist; lebar rail
serta footprint-nya ada di `src/lib/hudLayout.ts` dan dibaca kamera.

- [ ] **Step 4: Perbarui `TASKS.md`**

Tambah catatan singkat di akhir fase aktif: panel bisa dilipat jadi rail 56px,
kamera memakai `visibleSceneWidth(canvasWidth, collapsed)`, dan gate barunya
`npm run layout:unit`.

- [ ] **Step 5: Commit**

```bash
git add AGENT.md TASKS.md
git commit -m "docs(hud): document the collapsible simulation panel"
```

---

## Rollback

Hapus `panelCollapsed`/`togglePanelCollapsed`, cabang rail, baris header, CSS var
`--hud-right-offset`, parameter `collapsed`, dan dua konstanta rail. Tidak ada
data atau file biner yang perlu dipulihkan. Commit per task bisa dibalik satu per
satu dengan `git revert`.
