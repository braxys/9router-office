# Bentuk Bot per Provider — Design

Tanggal: 2026-11-19
Status: menunggu persetujuan

## Intent

Setiap provider punya logo dan warna ciri khas. Sekarang keempat robot di kantor
memakai satu badan identik dan hanya dibedakan warna — dari jauh keempatnya
terbaca sebagai "robot yang sama, beda cat". Yang diinginkan: sebuah bot bisa
dikenali sebagai provider tertentu dari bentuknya, bukan cuma dari warnanya.
Provider yang tidak dikenal tetap memakai badan default yang ada sekarang.

Kenapa: kantor ini adalah dashboard demo. Kalau provider tidak punya wujud,
seluruh nilai "office"-nya hilang dan yang tersisa cuma grafik batang berwarna.

## Goals

- Setiap provider yang dikenal punya identitas visual: **cangkang kepala**,
  **topper antena**, **emblem dada**, dan **warna brand**.
- Identitas terbaca di **overview**, ukuran tampilan default — bukan hanya saat
  kamera mendekat.
- Wajah robot (mata, mulut, blush) **tidak berubah satu milimeter**, sehingga
  keempat animasi status (`IDLE`/`THINKING`/`STREAMING`/`ERROR`) berjalan tanpa
  disentuh.
- Identitas adalah **data di satu tempat**, dibaca oleh rig layar dan oleh
  generator `.glb` dari modul yang sama — layar dan file model tidak boleh bisa
  berbeda.
- Provider tak dikenal, dan provider baru yang belum punya entri, otomatis dapat
  badan default tanpa perubahan kode.

## Non-goals

- Tidak mengubah aturan status, polling telemetri, atau `statusResolution.ts`.
- Tidak mengubah animasi: `WorkerRobot` dan `ModelRobot` tetap memakai spring dan
  channel yang sama.
- Tidak mengubah `WorkDesk`, `CentralHub`, `OfficeRoom`, kamera, atau HUD.
- Tidak menambah panel/kontrol baru.
- Bukan per-provider `.glb`. Satu file model netral tetap dipakai (lihat
  *Approaches*).

## Anti-goals

- Identitas yang hanya terlihat saat kamera focus.
- Wajah yang bergeser, atau robot yang duduknya meleset dari kursi.
- Tabel warna kedua yang bisa berbeda dari `accentColor` (mug, LED monitor, ring
  seleksi membaca warna itu).
- Robot yang berhenti terlihat seperti bagian dari kantor mainan pastel ini.

## Constraints

- **Wajah dikunci.** Kotak mata/mulut/blush (`FACE` di `robotModel.ts`) tidak
  boleh bergeser. Cangkang diauthor *di sekeliling* wajah itu.
- **`ROBOT_HEIGHT` adalah tinggi badan, bukan tinggi amplop.** Lihat
  *Keputusan 1* — ini load-bearing untuk `ModelRobot` dan `build:model`.
- **Hanya 4 dari 9 provider tampil.** Identitas harus jalan untuk provider mana
  pun yang naik panggung, bukan empat yang kebetulan sedang aktif.
- **Dua sumber id.** Live memakai id 9Router (`codebuddy-intl`), simulasi memakai
  id config (`gemini-2.5-pro`). Resolver harus menutup keduanya.
- `scripts/layout-check.mjs` mengimpor `src/lib/agents.ts` langsung lewat type
  stripping Node. Modul itu **tidak boleh** mendapat import runtime baru (lihat
  *Keputusan 6*).
- `src/lib/robotModel.ts` **tidak boleh** mendapat import runtime sama sekali;
  ia diimpor langsung Node dari `build-robot-model.mjs` dan `status-rules.mjs`
  (lihat *Keputusan 8*).
- `npm run typecheck`, `npm run lint`, `npm run smoke`, `npm run layout:test`,
  `npm run build:model`, dan `npm run build` harus tetap hijau.

## Approaches

1. **Identitas = part tambahan di atas badan yang sudah ada.** Cangkang, topper,
   dan emblem adalah `RobotPart[]` biasa yang ditambahkan ke node `head`,
   `antenna`, dan `torso`. Badan, wajah, dan sendi tidak berubah. *Dipilih.*
2. **Siluet penuh per provider** — badan dan kepala sendiri-sendiri. Ditolak:
   tiap bentuk butuh anchor mata/mulut/antena sendiri, `FACE` jadi per-provider,
   dan keempat animasi harus divalidasi ulang per varian. Biayanya jauh lebih
   besar daripada nilai tambahnya pada ukuran 44 px.
3. **Emblem saja** — badan default, logo ditempel di dada. Ditolak: di ukuran
   overview emblem dada tidak terbaca sama sekali (sudah dibuktikan di mockup),
   jadi hasilnya nol untuk tujuan utamanya.

**Kenapa 1 menang:** ia menjawab "bentuk" tanpa menyentuh rig. Karena identitas
adalah data part, satu provider bisa dinaikkan ke siluet penuh nanti (approach 2)
tanpa mengubah arsitektur.

### Hierarki keterbacaan (hasil pengukuran mockup, bukan asumsi)

Di 44 px — ukuran overview asli — yang bertahan, dari paling kuat:

| Peringkat | Isyarat | Kenapa |
| :--- | :--- | :--- |
| 1 | **Warna badan** | Bidang warna terbesar; satu-satunya isyarat yang bertahan di 26 px. |
| 2 | **Fitur siluet yang berani** | Telinga kucing, arch, poni. Perubahan outline ≥ 15% lebar kepala. Chamfer halus **tidak** terbaca. |
| 3 | **Topper antena** | Terisolasi di langit-langit latar, jadi kontras — tapi butuh amplop lebih besar dari bola sekarang. |
| 4 | **Emblem dada** | Detail untuk focus shot saja. |

Konsekuensi desain: fitur siluet berani **hanya dipakai untuk provider yang
logonya memang punya bentuk luar khas**. Provider yang tidak (Gemini, NVIDIA,
OpenRouter, dan semua provider ber-cangkang `box`) mengandalkan warna + topper,
dan itu diterima secara sadar — bukan diklaim sebagai "kebaca dari jauh".

## Design

### Keputusan 1 — tinggi: badan vs amplop (menutup temuan reviewer #1)

`ROBOT_HEIGHT` (`robotModel.ts:529`) dipakai sebagai faktor skala di
`ModelRobot.tsx:157` dan diasersi `build-robot-model.mjs:267,322` supaya model
netral setinggi rig. Kalau `robotBounds()` ikut menyatukan part identitas,
`ROBOT_HEIGHT` naik ke ~2.46 m dan dua hal rusak: `build:model` gagal (model
netral tidak punya part identitas), dan `ModelRobot` men-scale badan netral
sebesar 1.04× sehingga pinggul naik ~16 mm dari kursi — persis anti-goal, dan
hanya di mode `.glb`.

**Karena itu dua angka, bukan satu:**

```ts
/** Tinggi BADAN netral. Tidak berubah: 2.365 m. Dipakai skala .glb. */
export const ROBOT_HEIGHT = robotBounds().height;

/** Amplop tertinggi semua identitas. Dipakai HANYA untuk anchor UI. */
export const ROBOT_ENVELOPE = identityBounds();
export const ROBOT_ENVELOPE_HEIGHT = ROBOT_ENVELOPE.height; // ~2.46 m
```

- `robotBounds()` **tidak berubah sama sekali** — tetap badan + geometri runtime
  (termasuk `ANTENNA_BALL`), jadi `build:model` dan `ModelRobot` tetap 1:1.
- `identityBounds()` baru: union `robotBounds()` dengan seluruh part
  `SHELLS`/`TOPPERS`/`EMBLEMS`. Ia hanya dipakai `Scene` untuk anchor pill dan
  `identity:test` untuk gate amplop. **Ia tidak membaca `IDENTITIES`** — lihat
  *Keputusan 8*.
- **`build-robot-model.mjs` benar-benar tidak berubah** dan `npm run build:model`
  harus menghasilkan file yang identik. Itu masuk daftar verifikasi.

### Keputusan 2 — warna part, dan gradient dibuang (menutup #2)

`RobotPart.color` sekarang `PaletteKey`. Dua lubang: gradient tidak punya jalur
render, dan `#2A2A33` bukan palette key (`ROBOT_COLORS.ink` = `#3a4a58`).

**Keputusan:**

1. `RobotPart.color` menjadi `PaletteKey | HexColor` (`#rrggbb`). Satu baris di
   `resolveRobotColor`: kalau diawali `#`, kembalikan apa adanya. Generator sudah
   memanggil fungsi itu, jadi ikut benar tanpa perubahan.
2. **Gradient dihapus dari desain.** Gradient dua-stop pada blok rigid butuh
   vertex colour atau shader — biaya nyata, dan pada 44 px yang terbaca adalah
   *hue*, bukan gradasinya. Diganti `accent2?: HexColor`: warna brand kedua yang
   dipakai satu part cangkang tertentu (telinga CodeBuddy, arch Antigravity).
   Hasilnya **lebih terbaca** daripada gradient, dengan nol biaya render.
3. `accentColor` yang beredar ke `WorkDesk`/`ProviderPicker`/`TacticalOverlay`/
   `CentralHub`/ring seleksi = `identity.body` (warna utama). Satu hex kanonik,
   tidak ada tebakan "stop mana".
4. Warna yang bukan palette key ditulis sebagai hex literal di tabel identitas.
   `nous` memakai `#2A2A33` untuk poni (bukan `ROBOT_COLORS.ink`), dan itu
   eksplisit — bukan salah kutip.

### Keputusan 3 — bola antena diganti, bukan ditambah (menutup #3)

Topper adalah **pengganti** bola, jadi bola harus bisa hilang:

- `WorkerRobot` merender `ANTENNA_BALL` hanya bila `topper === 'ball'`.
- Channel pulse pindah dari `antennaBallRef` ke `topperGroupRef` yang membungkus
  topper apa pun, sehingga provider mana pun tetap punya denyut antena.
- Di jalur `.glb`, model netral membawa mesh bernama `antennaBall`. `ModelRobot`
  menyembunyikannya (`getObjectByName('antennaBall').visible = false`) bila
  identitas punya topper non-`ball`. Tanpa ini, dua belas identitas akan punya
  bola kuning **plus** topper, dan mode `.glb` tidak akan pernah sama dengan rig
  prosedural.

### Keputusan 4 — part identitas menempel ke sendi `.glb` lewat portal (menutup #4)

Reviewer benar: `RobotEffects` bukan preseden yang tepat — ia dirender di ruang
root sebagai saudara clone, bukan di sendi yang bergerak. Menempelkan cangkang di
ruang root akan membuatnya terlepas saat kepala menoleh ±0.3 rad, tilt ERROR
π/4, dan antena bergoyang — tepat saat kamera focus.

**Keputusan:** pakai `createPortal` dari `@react-three/fiber`. Target portal
adalah objek sendi yang **sudah** dicari `ModelRobot` (`getObjectByName('head')`
dsb). Pencarian itu dipindah dari `useEffect` ke `useMemo` atas `instance` yang
sudah stabil — membaca objek saat render tidak melanggar aturan, dan animasi
tetap memutasi lewat ref seperti sekarang. Tidak ada duplikasi kode
geometri/material `RobotParts`.

### Keputusan 5 — provider tak dikenal tetap punya warna hash (menutup #5)

Perilaku sekarang (`routerAdapter.ts:83-97`) sengaja memberi warna stabil dan
berbeda per provider tak dikenal supaya dua provider asing tidak jadi kembar.
Itu dipertahankan:

```ts
export interface ProviderIdentity {
  /** Warna badan utama; `null` = turunkan dari key lewat hash. */
  body: string | null;
  ...
}
export interface ResolvedIdentity extends ProviderIdentity {
  /** Selalu terisi: `body`, atau warna hash untuk identitas default. */
  color: string;
}
export function resolveIdentity(key: string): ResolvedIdentity;
```

- `IDENTITIES.default.body === null`, dan `UNKNOWN_PROVIDER_COLORS` **pindah** ke
  `providerIdentity.ts` sehingga palet hash tetap satu sumber.
- Assertion 7 jadi presisi: untuk semua identitas **selain** `default`,
  `resolveIdentity(alias).color === body`; untuk key asing, `color` sama dengan
  hasil hash yang sekarang.

### Keputusan 6 — `agents.ts` tetap bebas import runtime (menutup #6)

`layout-check.mjs:63` mengimpor `../src/lib/agents.ts` lewat type stripping Node.
Hari ini itu aman karena satu-satunya import di sana `import type`. Import
runtime akan menuntut ekstensi eksplisit (ditolak `moduleResolution: bundler`) dan
`layout:test` mati saat load.

**Keputusan:**

- `AGENT_CONFIGS` **melepas** `accentColor` dan mendapat `identity: IdentityId`
  (string literal). `IdentityId` masuk lewat `import type`, jadi tetap erased.
- `buildInitialAgents()` di `useAgentStore.ts` (bundled, ekstensi tidak masalah)
  memanggil `resolveIdentity(config.identity)` dan mengisi `identity` **dan**
  `accentColor` pada `AgentTelemetry`.
- `tsconfig.json` dan `layout-check.mjs` tidak disentuh.

### Keputusan 7 — assertion "outline kepala" dibuang (menutup #7)

Reviewer benar: `default`, `anthropic`, dan `ollama` juga ber-cangkang `box`, jadi
assertion itu gagal di hari pertama atau daftar pengecualiannya membengkak sampai
tak menguji apa pun. Itu percobaan mengubah penilaian visual menjadi test.

**Keputusan:** assertion diganti dengan yang mekanis dan bermakna — **tidak ada
dua identitas dengan triple `(shell, topper, color)` yang identik.** Aturan
"fitur siluet berani hanya untuk logo yang punya bentuk khas" tetap ada sebagai
panduan authoring di dokumen ini, bukan sebagai test.

### Keputusan 8 — `robotModel.ts` wajib bebas import runtime

Ditemukan saat menulis rencana, lalu dibuktikan dengan Node dan `tsc` sungguhan.

`robotModel.ts` diimpor **langsung oleh Node** (type stripping) dari
`build-robot-model.mjs` dan `status-rules.mjs`. Hari ini ia nol import. Begitu ia
butuh nilai dari modul lain:

- `import { X } from './providerIdentity'` → Node: `ERR_MODULE_NOT_FOUND`
- `import { X } from './providerIdentity.ts'` → `tsc`: `TS5097` (butuh
  `allowImportingTsExtensions`, artinya mengubah `tsconfig.json`)
- `import type { X } from './does-not-exist'` → Node **jalan** (import type
  dihapus total), `tsc` yang menangkap. Jadi hanya `import type` yang aman — dan
  itu tidak bisa dipakai untuk membaca nilai seperti `IDENTITIES`.

**Keputusan:** `identityBounds()` menghitung union dari **ketiga tabel bentuk**,
bukan dari daftar identitas:

```ts
const all = [...Object.values(SHELLS), ...Object.values(TOPPERS), ...Object.values(EMBLEMS)].flat();
```

Ini bukan kompromi — hasilnya lebih benar: provider baru yang menambah cangkang
otomatis masuk amplop tanpa menyentuh dua file. Arah dependensi yang sah:
`providerIdentity → robotModel` (runtime, dari modul yang di-bundle Next) dan
`providerIdentity → robotModel` (type-only, untuk `ShellId` dkk).
`robotModel → providerIdentity` **tidak pernah**.

Gate: `npm run status:test` dan `npm run build:model` sama-sama mengimpor
`robotModel.ts`; keduanya merah kalau aturan ini dilanggar.

### Sumber identitas — `src/lib/providerIdentity.ts` (baru)

Modul data murni, tanpa React/three, supaya Node bisa mengimpornya langsung
(seperti `robotModel.ts`).

```ts
export type IdentityId =
  | 'default' | 'codebuddy' | 'antigravity' | 'codex' | 'gemini'
  | 'kilocode' | 'nvidia' | 'nous' | 'opencode' | 'openrouter'
  | 'anthropic' | 'openai' | 'ollama';

export interface ProviderIdentity {
  id: IdentityId;
  label: string;
  /** Warna utama. `null` = hash dari key. */
  body: string | null;
  /** Warna brand kedua untuk satu part cangkang. */
  accent2?: string;
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
  /** id 9Router, id config, nama tampilan — dicocokkan setelah dinormalisasi. */
  aliases: string[];
}
```

`resolveIdentity(key)` menormalkan (lowercase, buang non-alfanumerik) lalu
mencocokkan `aliases`. Tidak ketemu → identitas `default` dengan warna hash.
Selalu mengembalikan objek; tidak pernah `undefined`.

**Tabel identitas** (warna mengikuti brand asli dari registry 9Router):

| id | cangkang | topper | emblem | warna utama | accent2 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `codebuddy` | `cat` (telinga) | `catface` | `catface` | `#5B4BE8` | `#2FD4C4` |
| `antigravity` | `arch` | `arch` | `arch` | `#4F9CF0` | `#F5B73D` |
| `codex` | `hex` | `knot` | `knot` | `#3B82F6` | — |
| `gemini` | `box` | `sparkle` | `sparkle` | `#4285F4` | — |
| `kilocode` | `pixel` | `pixelK` | `pixelK` | `#FF6B35` | — |
| `nvidia` | `box` | `eye` | `eye` | `#76B900` | — |
| `nous` | `manga` (poni) | `nfringe` | `nfringe` | `#7C3AED` | `#2A2A33` |
| `opencode` | `round` | `terminal` | `terminal` | `#E87040` | — |
| `openrouter` | `box` | `router` | `router` | `#F97316` | — |
| `anthropic` | `box` | `burst` | `burst` | `#D97757` | — |
| `openai` | `hex` | `openai` | `openai` | `#10A37F` | — |
| `ollama` | `box` | `llama` | `llama` | `#9AA7B4` | — |
| `default` | `box` | `ball` | — | `null` (hash) | — |

Yang diputuskan, bukan tersisa:

- **Nous** mempertahankan poni manga, tapi `#2A2A33` bukan hitam pekat — tetap
  terbaca sebagai tinta, bukan lubang hitam di kantor pastel.
- **OpenCode tidak memakai cangkang terminal gelap.** Kepala `round` sudah unik
  di set ini; badan tetap oranye brand.
- **Codex dan OpenRouter dipisah** lewat siluet (heksagon vs kotak) dan warna
  (`#3B82F6` vs `#F97316`), bukan lewat emblem yang mirip.
- **`ollama`** memakai emblem wajah llama dengan palet batu netral. Pilihan sadar,
  bukan kelalaian.

### Bentuk — `src/lib/robotModel.ts`

Tambah tiga tabel part, semuanya `RobotPart[]` biasa supaya `RobotParts.tsx` dan
generator tidak perlu tahu bedanya:

```ts
export const SHELLS: Record<ShellId, RobotPart[]>;   // node: 'head'
export const TOPPERS: Record<TopperId, RobotPart[]>; // node: 'antenna'
export const EMBLEMS: Record<EmblemId, RobotPart[]>; // node: 'torso'
export function robotPartsFor(identity: ResolvedIdentity): RobotPart[];
export function identityBounds(): RobotBounds;
```

- Cangkang **menambah**, tidak mengganti. `cranium` tetap ada; telinga, arch,
  poni, dan chamfer adalah blok tambahan di sekelilingnya. Ini yang membuat satu
  file `.glb` netral tetap valid untuk semua identitas.
- **Emblem duduk di panel `belly`** (`0.5 × 0.34` di `y = 0.4`, `z = 0.253`) —
  panel krem itu sudah jadi latar badge, jadi emblem tidak butuh plat baru dan
  tidak bertabrakan dengan `bowTie` (`y = 0.76`) maupun `nameBadge` (`x = 0.2`).
  Emblem dirender `unlit` supaya warnanya tidak kusam, seperti `nameBadgeStripe`.
- Wajah tidak disentuh; sebuah test memastikan tidak ada part cangkang yang
  menembus kotak `FACE`.
- `ball` memakai angka `ANTENNA_BALL` yang sekarang, sehingga provider tak dikenal
  identik dengan robot hari ini.

### Identitas menempel di telemetri, bukan ditebak saat render

`AgentTelemetry` mendapat `identity: IdentityId`. `routerAdapter.metaFor()`
mengisinya dari id provider; `buildInitialAgents()` mengisinya dari
`AGENT_CONFIGS`. Render path tidak pernah mencocokkan string.

### Berkas yang disentuh

| Berkas | Perubahan |
| :--- | :--- |
| `src/lib/providerIdentity.ts` | **baru** — tabel identitas, resolver, palet hash, warna |
| `src/lib/robotModel.ts` | tabel shell/topper/emblem, `robotPartsFor`, `identityBounds`, hex di `RobotPart.color` |
| `src/lib/types.ts` | `AgentTelemetry.identity`; `AgentConfig.identity` (tanpa `accentColor`) |
| `src/lib/routerAdapter.ts` | isi `identity` + warna dari resolver; hapus palet hash lokal |
| `src/lib/agents.ts` | `identity` per config; **tanpa import runtime** |
| `src/store/useAgentStore.ts` | seed mengisi `identity` + `accentColor` dari resolver |
| `src/components/canvas/RobotParts.tsx` | prop `identity` |
| `src/components/canvas/WorkerRobot.tsx` | teruskan `identity`; bola kondisional; pulse pindah ke grup topper |
| `src/components/canvas/ModelRobot.tsx` | portal part identitas ke sendi; sembunyikan `antennaBall` |
| `src/components/canvas/Scene.tsx` | teruskan `identity`; anchor pill dari `ROBOT_ENVELOPE_HEIGHT` |
| `scripts/identity-rules.mjs` | **baru** — truth table identitas |

`scripts/build-robot-model.mjs`, `tsconfig.json`, dan
`scripts/layout-check.mjs` **tidak berubah**.

### Anchor pill

Pill nama di `Scene` sekarang di `y = 2.45`; `ROBOT_ENVELOPE_HEIGHT` ≈ 2.46 m
berarti topper bisa menyentuhnya. Pill naik ke `y = 2.62`. `npm run layout:test`
wajib lulus; kalau pill ter-clip di viewport pendek, fallback-nya: pill tetap
`2.45` dan amplop topper dipangkas ke 0.14 m.

### Gate — `npm run identity:test`

Assertion yang dijalankan terhadap kode shipping, bukan salinan:

1. Setiap `IdentityId` punya entri; `resolveIdentity('apa-saja')` → `default`.
2. Alias live (`codebuddy-intl`, `antigravity`, `codex`, `gemini`, `kilocode`,
   `nvidia`, `nous`, `opencode`, `openrouter`) memetakan ke id yang benar.
3. Alias simulasi (`gemini-2.5-pro`, `claude-sonnet-4-5`, `gpt-5-1`,
   `llama-3-3-70b`) memetakan ke `gemini`, `anthropic`, `openai`, `ollama`.
4. **Wajah utuh:** tidak ada part shell/topper/emblem yang menembus kotak `FACE`.
5. **Amplop:** setiap identitas ≤ `IDENTITY_ENVELOPE`, dan `identityBounds()`
   dihitung dari tabel bentuk (bukan dari daftar identitas).
6. **Tidak ada kembar:** tidak ada dua identitas dengan triple
   `(shell, topper, color)` identik.
7. **Satu sumber warna:** `resolveIdentity(alias).color === body` untuk semua
   identitas selain `default`; untuk key asing, `color` sama dengan hash.
8. **Badan tidak bergeser:** `robotBounds().height === 2.365` — bukti bahwa
   identitas tidak menyentuh tinggi badan.

### Yang sengaja dibiarkan ke builder

- Bentuk persis tiap cangkang (koordinat blok). Yang mengikat hanya: tidak
  menembus wajah, muat amplop, dan fitur siluetnya berani kalau logonya punya.
- Jumlah blok per cangkang; 3–8 blok per identitas sudah cukup.
- Urutan pengerjaan dan pembagian commit.

## Risiko

| Risiko | Mitigasi |
| :--- | :--- |
| Pill ter-clip setelah anchor naik | `layout:test`; fallback amplop topper 0.14 m |
| Cangkang menutupi wajah dari sudut miring | test kotak wajah + cek visual dari 4 sudut kamera |
| Mode `.glb` kehilangan identitas | portal ke sendi + sembunyikan `antennaBall`; diverifikasi dengan `?model=on` |
| Identitas tak terbaca di overview | hierarki warna > siluet > topper > emblem; verifikasi di screenshot 1600×1000 |
| Warna brand mengubah mood kantor | `nous` tinta bukan hitam, `ollama` netral; semua warna dicek di latar pastel |

## Verifikasi

`npm run identity:test` → semua assertion, `npx tsc --noEmit` → 0,
`npx eslint` → 0, `npm run smoke` → empat status tanpa error konsol,
`npm run layout:test` → lulus, `npm run build:model` → output identik,
`npm run build` → bersih, plus dua screenshot overview: prosedural dan
`?model=on`, keduanya menunjukkan empat provider berbeda bentuk.
