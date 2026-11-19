# Bentuk Bot per Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setiap provider di kantor 3D punya bentuk bot yang dikenali sebagai provider itu — cangkang kepala, topper antena, emblem dada, dan warna brand — tanpa mengubah wajah, animasi, atau tinggi badan robot.

**Architecture:** Identitas adalah data. `src/lib/providerIdentity.ts` memetakan key provider (id 9Router atau id config simulasi) ke satu `ResolvedIdentity`. `src/lib/robotModel.ts` menyimpan bentuk tiap cangkang/topper/emblem sebagai `RobotPart[]` biasa, jadi `RobotParts.tsx` dan generator `.glb` merendernya lewat jalur yang sama. Rig prosedural dan mode `.glb` sama-sama membaca tabel itu; mode `.glb` menempelkan part identitas ke sendi model lewat `createPortal`.

**Tech Stack:** TypeScript, React 19, @react-three/fiber 9 (`createPortal`), three 0.187, Zustand, Node 24 type-stripping untuk test script.

**Spec:** `docs/superpowers/specs/2026-11-19-provider-bot-identity-design.md`

## Global Constraints

- Wajah dikunci: kotak mata/mulut/blush (`FACE` di `robotModel.ts`) tidak boleh bergeser. Tidak ada part cangkang yang boleh menembus kotak itu.
- `robotBounds().height` harus tetap **2.365** — tinggi badan netral. `ROBOT_HEIGHT` tidak berubah.
- `scripts/build-robot-model.mjs`, `tsconfig.json`, dan `scripts/layout-check.mjs` tidak boleh diubah.
- `src/lib/agents.ts` tidak boleh mendapat import runtime baru — hanya `import type`. `layout-check.mjs:63` mengimpornya lewat type stripping Node.
- **`src/lib/robotModel.ts` tidak boleh mendapat import runtime apa pun.** File itu diimpor langsung oleh Node (type stripping) dari `build-robot-model.mjs` dan `status-rules.mjs`. Import antar-`.ts` di sana gagal di Node tanpa ekstensi (`ERR_MODULE_NOT_FOUND`) dan gagal di tsc dengan ekstensi (`TS5097`). Hanya `import type` yang aman, dan itu **tidak** cukup untuk memakai nilai seperti `IDENTITIES`. Konsekuensi: `robotModel.ts` tidak boleh membaca tabel identitas; arah dependensi selalu `providerIdentity → robotModel` (type-only) atau `providerIdentity → robotModel` (runtime, dari modul lain).
- `RobotPart.color` menerima `PaletteKey` atau hex literal `#rrggbb`. Tidak ada gradient.
- Emblem duduk di panel `belly` (`0.5 × 0.34` di `y = 0.4`, `z = 0.253`), bukan plat baru.
- Semua perintah verifikasi harus hijau: `npm run identity:test`, `npx tsc --noEmit`, `npx eslint`, `npm run smoke`, `npm run layout:test`, `npm run build:model`, `npm run build`.
- Penamaan warna di tabel identitas adalah hex literal brand: `#5B4BE8` (codebuddy), `#4F9CF0` (antigravity), `#3B82F6` (codex), `#4285F4` (gemini), `#FF6B35` (kilocode), `#76B900` (nvidia), `#7C3AED` (nous), `#E87040` (opencode), `#F97316` (openrouter), `#D97757` (anthropic), `#10A37F` (openai), `#9AA7B4` (ollama).

## Review Focus

Hal-hal yang spec implisitkan tapi tidak dijaga test mana pun, paling mungkin menggigit pengguna, dengan test yang dipasang di task pemiliknya:

1. **Provider tak dikenal tidak boleh jadi kembar.** Dua provider asing yang berbeda harus tetap beda warna; kalau tidak, kantor menampilkan dua robot identik. → test di Task 1.
2. **Bola antena harus benar-benar hilang saat ada topper.** Kalau tidak, dua belas identitas punya bola kuning **plus** topper. → test di Task 2 (tabel) dan Task 4 (rig).
3. **Mode `.glb` tidak boleh kehilangan identitas atau menempel salah sendi.** Cangkang di ruang root akan lepas saat kepala menoleh. → cek manual `?model=on` di Task 5.
4. **Pill nama tidak boleh menabrak topper atau ter-clip.** → `npm run layout:test` di Task 6.
5. **Warna identitas harus satu sumber.** `accentColor` yang mengalir ke mug, LED monitor, dan ring seleksi tidak boleh berbeda dari warna badan bot. → test di Task 1 + Task 3.

---

### Task 1: Identitas sebagai data + gate

**Files:**
- Create: `src/lib/providerIdentity.ts`
- Create: `scripts/identity-rules.mjs`
- Modify: `package.json` (script `identity:test`)

**Interfaces:**
- Consumes: `ShellId`, `TopperId`, `EmblemId` dari `robotModel.ts` (dibuat di Task 2 — untuk Task ini, deklarasikan sebagai string union lokal sementara lalu ganti dengan `import type` di Task 2; lihat catatan di bawah).
- Produces:
  - `type IdentityId = 'default' | 'codebuddy' | 'antigravity' | 'codex' | 'gemini' | 'kilocode' | 'nvidia' | 'nous' | 'opencode' | 'openrouter' | 'anthropic' | 'openai' | 'ollama'`
  - `interface ResolvedIdentity { id: IdentityId; label: string; color: string; accent2?: string; shell: ShellId; topper: TopperId; emblem: EmblemId }`
  - `const IDENTITIES: Record<IdentityId, ProviderIdentity>`
  - `const UNKNOWN_PROVIDER_COLORS: string[]`
  - `function resolveIdentity(key: string): ResolvedIdentity`

**Catatan urutan:** Task 1 sengaja tidak bergantung pada Task 2. Di Task 1, `ShellId`/`TopperId`/`EmblemId` dideklarasikan sebagai union string di `providerIdentity.ts` sendiri dengan nilai persis seperti daftar di Task 2. Task 2 yang memindahkannya ke `robotModel.ts` dan mengganti deklarasi lokal itu dengan `import type`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `scripts/identity-rules.mjs` mengikuti pola `scripts/status-rules.mjs` (fungsi `check(label, actual, expected)`, hitung `failures`/`total`, `process.exit(failures ? 1 : 0)` di akhir).

```js
import { IDENTITIES, resolveIdentity } from '../src/lib/providerIdentity.ts';

// assertion 1 — setiap id punya entri, key asing jatuh ke default
check('semua IdentityId punya entri',
  Object.keys(IDENTITIES).sort(),
  ['antigravity','anthropic','codebuddy','codex','default','gemini',
   'kilocode','nvidia','nous','ollama','openai','opencode','openrouter']);
check('key asing -> default', resolveIdentity('apa-saja').id, 'default');

// assertion 2 — alias live 9Router
for (const [key, id] of [
  ['codebuddy-intl','codebuddy'], ['antigravity','antigravity'], ['codex','codex'],
  ['gemini','gemini'], ['kilocode','kilocode'], ['nvidia','nvidia'],
  ['nous','nous'], ['opencode','opencode'], ['openrouter','openrouter'],
]) check(`alias live ${key}`, resolveIdentity(key).id, id);

// assertion 3 — alias simulasi
for (const [key, id] of [
  ['gemini-2.5-pro','gemini'], ['claude-sonnet-4-5','anthropic'],
  ['gpt-5-1','openai'], ['llama-3-3-70b','ollama'],
]) check(`alias simulasi ${key}`, resolveIdentity(key).id, id);

// assertion 7 — satu sumber warna (identitas dikenal)
for (const id of Object.keys(IDENTITIES)) {
  if (id === 'default') continue;
  check(`warna ${id} = body`, resolveIdentity(id).color, IDENTITIES[id].body);
}

// Review Focus #1 — provider asing berbeda harus beda warna
check('dua provider asing beda -> beda warna',
  resolveIdentity('zzz-unknown').color !== resolveIdentity('qqq-unknown').color, true);
check('provider asing sama -> warna sama (tidak flicker)',
  resolveIdentity('zzz-unknown').color, resolveIdentity('zzz-unknown').color);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/identity-rules.mjs`
Expected: FAIL — `Cannot find module '../src/lib/providerIdentity.ts'`

- [ ] **Step 3: Tulis `src/lib/providerIdentity.ts`**

Modul data murni, tanpa React/three. Header komentar menjelaskan: satu sumber identitas provider, dipakai adapter telemetri, seed simulasi, dan render rig.

```ts
export type IdentityId = /* daftar di Interfaces */;
export type ShellId = 'box' | 'cat' | 'arch' | 'hex' | 'pixel' | 'round' | 'manga';
export type TopperId = 'ball' | 'catface' | 'arch' | 'knot' | 'sparkle' | 'pixelK'
  | 'eye' | 'nfringe' | 'terminal' | 'router' | 'burst' | 'openai' | 'llama';
export type EmblemId = Exclude<TopperId, 'ball'> | 'none';

export interface ProviderIdentity {
  id: IdentityId;
  /** Nama tampilan. `null` di `default` -> pakai key mentah. */
  label: string | null;
  /** Warna badan utama. `null` di `default` -> hash dari key. */
  body: string | null;
  accent2?: string;
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
  /** id 9Router, id config, nama tampilan. Dicocokkan setelah dinormalisasi. */
  aliases: string[];
}

export interface ResolvedIdentity {
  id: IdentityId; label: string; color: string;
  accent2?: string; shell: ShellId; topper: TopperId; emblem: EmblemId;
}
```

Isi `IDENTITIES` sesuai tabel spec (13 entri). `default` = `{ label: null, body: null, shell: 'box', topper: 'ball', emblem: 'none', aliases: [] }`.

`UNKNOWN_PROVIDER_COLORS` = array 6 warna yang sekarang ada di `routerAdapter.ts:83`.

`normalise(key)` = lowercase + buang semua non-`[a-z0-9]`.
`resolveIdentity(key)` = cari entri yang `aliases`-nya (setelah normalisasi) memuat `normalise(key)`; tidak ketemu → `default`. Untuk `default`, `color` = `UNKNOWN_PROVIDER_COLORS[hash % length]` dengan hash persis seperti `routerAdapter.ts:91-93` (`hash = (hash * 31 + charCode) % 100_000`), dan `label` = `key`.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/identity-rules.mjs`
Expected: PASS semua, exit 0.

- [ ] **Step 5: Daftarkan script**

Di `package.json`, tambah `"identity:test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/identity-rules.mjs"` setelah `"status:test"`.

Run: `npm run identity:test`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providerIdentity.ts scripts/identity-rules.mjs package.json
git commit -m "feat(identity): provider identity table and resolver"
```

---

### Task 2: Bentuk sebagai data + amplop

**Files:**
- Modify: `src/lib/robotModel.ts`
- Modify: `src/lib/providerIdentity.ts` (ganti union lokal dengan `import type`)
- Modify: `scripts/identity-rules.mjs`

**Interfaces:**
- Consumes: `RobotPart`, `PaletteKey`, `ROBOT_COLORS`, `resolveRobotColor`, `robotBounds`, `FACE`, `ANTENNA_BALL` dari `robotModel.ts`.
- Produces:
  - `type ShellId`, `type TopperId`, `type EmblemId` (dipindah ke sini; `providerIdentity.ts` mengimpornya sebagai `import type`)
  - `const SHELLS: Record<ShellId, readonly RobotPart[]>`
  - `const TOPPERS: Record<TopperId, readonly RobotPart[]>`
  - `const EMBLEMS: Record<EmblemId, readonly RobotPart[]>`
  - `function robotPartsFor(identity: { shell: ShellId; topper: TopperId; emblem: EmblemId }): readonly RobotPart[]`
  - `function robotBounds(extraParts?: readonly RobotPart[]): RobotBounds`
  - `function identityBounds(): RobotBounds`
  - `const ROBOT_ENVELOPE_TOP: number` (root space, meter)
  - `const ROBOT_ENVELOPE_HEIGHT: number`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `scripts/identity-rules.mjs`. Test ini yang mengunci aturan "robotModel bebas import": ia mengimpor `robotModel.ts` **lebih dulu**, sebelum modul lain, dan `status-rules.mjs` tetap harus lulus.

```js
import {
  ROBOT_HEIGHT, ROBOT_ENVELOPE_TOP, FACE, ROBOT_COLORS,
  SHELLS, TOPPERS, EMBLEMS, identityBounds, resolveRobotColor,
} from '../src/lib/robotModel.ts';

// assertion 8 — identitas tidak menyentuh tinggi badan
check('ROBOT_HEIGHT tetap 2.365', Math.round(ROBOT_HEIGHT * 1000) / 1000, 2.365);

// assertion 4 — tidak ada part identitas yang menembus kotak wajah
// Kotak wajah = gabungan AABB mata, mulut, dan blush, dibesarkan 5 mm.
// Shell hanya boleh berada di node 'head'; topper di 'antenna'; emblem di 'torso'.
function aabb(part) { /* center + rotatedHalfExtents(part) */ }
function overlaps(a, b) { /* AABB overlap test */ }
for (const [id, parts] of Object.entries(SHELLS)) {
  for (const part of parts) {
    check(`shell ${id}/${part.id} tidak menembus wajah`, overlaps(aabb(part), FACE_BOX), false);
  }
}

// Review Focus #2 — topper 'ball' tidak boleh punya part (bola dirender terpisah)
check('TOPPERS.ball kosong', TOPPERS.ball.length, 0);
for (const id of Object.keys(TOPPERS)) {
  if (id === 'ball') continue;
  check(`topper ${id} punya part`, TOPPERS[id].length > 0, true);
}

// assertion 5 — amplop topper dibatasi
// Setiap part topper harus muat di kotak antenna-node: x ±0.11, y 0.24..0.51, z ±0.06
check('amplop topper <= batas', topperWithinBox(), true);
check('ROBOT_ENVELOPE_TOP = 2.09', Math.round(ROBOT_ENVELOPE_TOP * 1000) / 1000, 2.09);

// assertion 6 — tidak ada dua identitas kembar
const triples = Object.values(IDENTITIES).map(i => `${i.shell}|${i.topper}|${i.body}`);
check('tidak ada identitas kembar', new Set(triples).size, triples.length);

// warna hex literal lolos resolver
check('hex literal lolos apa adanya', resolveRobotColor('#2A2A33', '#5CB8F2'), '#2A2A33');
check('palette key tetap bekerja', resolveRobotColor('cream', '#5CB8F2'), ROBOT_COLORS.cream);
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm run identity:test`
Expected: FAIL — `SHELLS is not exported` / `robotBounds is not a function` dsb.

- [ ] **Step 3: Dukung hex literal di `RobotPart.color`**

Di `robotModel.ts`:

```ts
export type HexColor = `#${string}`;
// RobotPart.color: PaletteKey | HexColor
```

Di `resolveRobotColor`, tambahkan di paling atas switch/awal fungsi:

```ts
if (key.startsWith('#')) return key;
```

dan ubah parameter menjadi `key: PaletteKey | HexColor`. Signature publik tetap `resolveRobotColor(key, accent)`.

- [ ] **Step 4: Tulis tabel bentuk**

Pindahkan `ShellId`/`TopperId`/`EmblemId` dari `providerIdentity.ts` ke `robotModel.ts`, lalu di `providerIdentity.ts` ganti dengan `import type { ShellId, TopperId, EmblemId } from './robotModel.ts';` (harus `import type` — Node mengimpornya langsung).

Tambah tiga tabel. Aturan authoring yang mengikat:

| Tabel | Node | Amplop wajib | Catatan |
| :--- | :--- | :--- | :--- |
| `SHELLS` | `head` | muat di sekitar `cranium` (0.78 × 0.6 × 0.54) | tidak boleh menembus kotak `FACE` |
| `TOPPERS` | `antenna` | x ∈ [−0.11, 0.11], y ∈ [0.24, 0.51], z ∈ [−0.06, 0.06] | `ball` = `[]` |
| `EMBLEMS` | `torso` | muat di panel `belly` 0.5 × 0.34, z ≤ 0.28 | `none` = `[]` |

Contoh kerja untuk `SHELLS.cat` (pola yang dipakai untuk semua cangkang):

```ts
cat: [
  { id: 'earL', node: 'head', shape: 'box', size: [0.16, 0.3, 0.16],
    position: [-0.26, 0.42, 0], rotation: [0, 0, 0.35], color: 'accent2' },
  { id: 'earR', node: 'head', shape: 'box', size: [0.16, 0.3, 0.16],
    position: [0.26, 0.42, 0], rotation: [0, 0, -0.35], color: 'accent2' },
],
```

`'accent2'` ditambahkan sebagai `PaletteKey` baru: `resolveRobotColor('accent2', accent)` mengembalikan `accent` (perilaku sama seperti `body`/`accent`), dan `robotPartsFor` mengabaikannya untuk identitas tanpa `accent2`. **Alternatif yang dipakai:** karena `resolveRobotColor` hanya menerima satu `accent`, part yang butuh `accent2` menulis hex literal langsung dari tabel identitas; jadi `PaletteKey` **tidak** ditambah. Pilih ini — lebih sedikit jalur.

Sisanya (`arch`, `hex`, `pixel`, `round`, `manga`, `box`) diauthor mengikuti aturan di tabel di atas. `box` = `[]` (badan default hari ini).

`TOPPERS.ball` = `[]`. `EMBLEMS.none` = `[]`. Emblem memakai `unlit: true`.

- [ ] **Step 5: `robotPartsFor`, `robotBounds(extraParts)`, `identityBounds`**

```ts
export function robotPartsFor(identity: {
  shell: ShellId; topper: TopperId; emblem: EmblemId;
}): readonly RobotPart[] {
  return [
    ...ROBOT_PARTS,
    ...SHELLS[identity.shell],
    ...TOPPERS[identity.topper],
    ...EMBLEMS[identity.emblem],
  ];
}
```

Ubah `robotBounds()` menjadi `robotBounds(extraParts: readonly RobotPart[] = [])`: loop `ROBOT_PARTS` **dan** `extraParts`. Semua pemanggil lama tetap valid (default `[]`).

```ts
export function identityBounds(): RobotBounds {
  // Union robotBounds() dengan robotBounds(part) untuk SETIAP cangkang, topper,
  // dan emblem di ketiga tabel. Tidak perlu daftar identitas: amplop yang benar
  // adalah amplop semua part yang mungkin pernah dipasang.
  const all = [...Object.values(SHELLS), ...Object.values(TOPPERS), ...Object.values(EMBLEMS)]
    .flat();
  return unionBounds([robotBounds(), robotBounds(all)]);
}
export const ROBOT_ENVELOPE_TOP = identityBounds().max[1];
export const ROBOT_ENVELOPE_HEIGHT = identityBounds().height;
```

**Kenapa tidak membaca `IDENTITIES`:** `robotModel.ts` tidak boleh mengimpor `providerIdentity.ts` (lihat Global Constraints — Node dan tsc sama-sama menolak). Menghitung amplop dari tabel bentuk justru lebih benar: provider baru yang menambah cangkang otomatis masuk amplop tanpa menyentuh dua file.

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `npm run identity:test`
Expected: PASS semua.

Kalau `ROBOT_ENVELOPE_TOP` bukan 2.09, perbaiki tinggi part topper — jangan ubah angka test. Angka itu berasal dari `ANTENNA_BALL` (root y 1.89) + batas atas topper 0.20.

- [ ] **Step 7: Buktikan model netral tidak berubah**

Run: `npm run build:model`
Expected: `✓ worker-robot.glb`, `parts 30`, `height 2.365 m`.

Run: `git diff --stat public/models/`
Expected: kosong (file identik byte-per-byte).

- [ ] **Step 8: Buktikan `robotModel.ts` tetap bisa diimpor Node**

Run: `npm run status:test`
Expected: 51/51 PASS. Script itu mengimpor `statusResolution.ts`; kalau ada yang menambah import runtime ke `robotModel.ts` di kemudian hari, gate ini yang menangkapnya lebih dulu.

Run: `npm run build:model`
Expected: lulus tanpa `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/robotModel.ts src/lib/providerIdentity.ts scripts/identity-rules.mjs
git commit -m "feat(identity): shell, topper and emblem part tables"
```

---

### Task 3: Identitas mengalir lewat telemetri

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/agents.ts`
- Modify: `src/lib/routerAdapter.ts`
- Modify: `src/store/useAgentStore.ts`

**Interfaces:**
- Consumes: `resolveIdentity`, `IdentityId` dari Task 1.
- Produces: `AgentTelemetry.identity: IdentityId`; `AgentConfig.identity: IdentityId` (dan `accentColor` **dihapus** dari `AgentConfig`).

- [ ] **Step 1: Ubah tipe**

`src/lib/types.ts`:
- `AgentTelemetry` tambah `identity: IdentityId` (import `type { IdentityId } from './providerIdentity'`).
- `AgentConfig`: hapus `accentColor`, tambah `identity: IdentityId`.

- [ ] **Step 2: `agents.ts` — hanya `import type`**

Ganti `accentColor: '#5CB8F2'` dst. dengan `identity: 'gemini' | 'anthropic' | 'openai' | 'ollama'` berurutan. Tambahkan `import type { IdentityId } from './providerIdentity';` — **type-only**, jangan pernah import runtime.

- [ ] **Step 3: `routerAdapter.ts` — satu sumber warna**

Hapus `PROVIDER_META`, `UNKNOWN_PROVIDER_COLORS`, dan `metaFor`. Ganti `interface ProviderMeta` dengan pemakaian langsung:

```ts
const identity = resolveIdentity(row.provider);
// ...
name: identity.label,
accentColor: identity.color,
identity: identity.id,
```

- [ ] **Step 4: `useAgentStore.ts` — seed mengisi keduanya**

Di `buildInitialAgents()`, `import { resolveIdentity } from '@/lib/providerIdentity';` lalu:

```ts
const identity = resolveIdentity(config.identity);
return {
  ...,
  accentColor: identity.color,
  identity: identity.id,
};
```

- [ ] **Step 5: Verifikasi**

Run: `npx tsc --noEmit`
Expected: 0 error. Kalau ada pemakai `AgentConfig.accentColor` yang tertinggal, itu bug — perbaiki di sini.

Run: `npm run layout:test`
Expected: lulus. Ini yang membuktikan `agents.ts` masih bisa diimpor Node tanpa resolver runtime.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/agents.ts src/lib/routerAdapter.ts src/store/useAgentStore.ts
git commit -m "refactor(identity): carry provider identity on telemetry"
```

---

### Task 4: Rig prosedural

**Files:**
- Modify: `src/components/canvas/RobotParts.tsx`
- Modify: `src/components/canvas/WorkerRobot.tsx`

**Interfaces:**
- Consumes: `robotPartsFor` dari Task 2; `ResolvedIdentity` dari Task 1.
- Produces: `<RobotParts node={RobotNodeId} identity={ResolvedIdentity} accent={string} />`; `<AntennaTopper identity={ResolvedIdentity} status={AgentStatus} />` diekspor dari `RobotParts.tsx`.

- [ ] **Step 1: `RobotParts` menerima identitas**

Ubah prop `accent: string` tetap ada (dipakai `resolveRobotColor`), tambah `identity: ResolvedIdentity`. Ganti sumber part:

```ts
const parts = useMemo(
  () => robotPartsFor(identity).filter((part) => part.node === node),
  [identity, node],
);
```

`identity` stabil per agent (objek dari store), jadi `useMemo` tidak akan thrash.

- [ ] **Step 2: `AntennaTopper` menggantikan bola**

Tambah di `RobotParts.tsx`:

```tsx
/**
 * Topper antena: bola kuning (identitas default) atau tanda provider.
 * Denyutnya sama untuk keduanya, supaya provider mana pun tetap hidup.
 */
export function AntennaTopper({ identity, status }: {
  identity: ResolvedIdentity; status: AgentStatus;
}) {
  const group = useRef<THREE.Group>(null);
  const isError = status === 'ERROR';
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * (isError ? 12 : 2.6)) * (isError ? 0.18 : 0.07);
    group.current.scale.setScalar(s);
  });
  return (
    <group ref={group}>
      {identity.topper === 'ball' ? (
        <mesh position={ANTENNA_BALL.position}>
          <sphereGeometry args={[ANTENNA_BALL.radius, ANTENNA_BALL.segments, ANTENNA_BALL.segments]} />
          <meshLambertMaterial color={ROBOT_COLORS.yellow} />
        </mesh>
      ) : (
        <RobotParts node="antenna" identity={identity} accent={identity.color} />
      )}
    </group>
  );
}
```

Angka pulse disalin persis dari `WorkerRobot.tsx:264` yang sekarang.

- [ ] **Step 3: `WorkerRobot` memakai `AntennaTopper`**

- Hapus `antennaBall` ref dan blok `if (antennaBall.current) { ... }` di `useFrame`.
- Hapus `<mesh ref={antennaBallRef} position={ANTENNA_BALL.position}>…</mesh>` dari `RobotHead`; ganti dengan `<AntennaTopper identity={identity} status={status} />`.
- Hapus prop `antennaBallRef` dari `RobotHeadProps`.
- Tambah `identity: ResolvedIdentity` ke `WorkerRobotProps` dan teruskan ke setiap `<RobotParts>` dan ke `RobotHead`.
- `ANTENNA_BALL` tetap diimpor oleh `RobotParts.tsx`, bukan `WorkerRobot.tsx`.

- [ ] **Step 4: Verifikasi**

Run: `npx tsc --noEmit` → 0.
Run: `npx eslint src/components/canvas` → 0.

- [ ] **Step 5: Cek visual**

Jalankan dev server, buka `http://localhost:3001`, screenshot overview.
Expected: empat robot punya cangkang berbeda; **tidak ada** bola kuning pada provider yang punya topper; provider default tetap punya bola kuning.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/RobotParts.tsx src/components/canvas/WorkerRobot.tsx
git commit -m "feat(identity): per-provider shell and antenna topper in the rig"
```

---

### Task 5: Mode `.glb` tetap punya identitas

**Files:**
- Modify: `src/components/canvas/ModelRobot.tsx`

**Interfaces:**
- Consumes: `createPortal` dari `@react-three/fiber`; `RobotParts`, `AntennaTopper` dari Task 4; `ResolvedIdentity`.
- Produces: `ModelRobotProps` mendapat `identity: ResolvedIdentity`.

- [ ] **Step 1: Cari sendi saat render, bukan di effect**

Ganti `joints` ref + `useEffect` (`ModelRobot.tsx:208-233`) dengan `useMemo` atas `instance`:

```ts
const joints = useMemo(() => ({
  torso: instance.getObjectByName('torso') ?? null,
  head: instance.getObjectByName('head') ?? null,
  antenna: instance.getObjectByName('antenna') ?? null,
  armL: instance.getObjectByName('armL') ?? null,
  armR: instance.getObjectByName('armR') ?? null,
}), [instance]);
```

`useFrame` membaca `joints` langsung (bukan `joints.current`). Alasan: portal butuh objek container **saat render**; objek ini stabil selama `instance` tidak berubah, dan animasi tetap memutasi properti lewat `useFrame`, bukan React state.

`rest` dihitung sebagai `useMemo` biasa (dua angka).

- [ ] **Step 2: Sembunyikan bola netral**

Di `useMemo` `instance` (setelah traverse pewarnaan), tambah:

```ts
if (identity.topper !== 'ball') {
  const ball = copy.getObjectByName('antennaBall');
  if (ball) ball.visible = false;
}
```

Tambah `identity` ke dependency array `useMemo`.

- [ ] **Step 3: Portal part identitas ke sendi**

Di JSX, setelah `<primitive object={instance} />`:

```tsx
{joints.head && createPortal(
  <RobotParts node="head" identity={identity} accent={identity.color} />, joints.head)}
{joints.antenna && createPortal(
  <AntennaTopper identity={identity} status={status} />, joints.antenna)}
{joints.torso && createPortal(
  <RobotParts node="torso" identity={identity} accent={identity.color} />, joints.torso)}
```

Portal, bukan penempatan di ruang root: cangkang harus ikut saat kepala menoleh (±0.3 rad), tilt ERROR (π/4), dan antena bergoyang.

- [ ] **Step 4: Verifikasi**

Run: `npx tsc --noEmit` → 0. Run: `npx eslint src/components/canvas` → 0.

Buka `http://localhost:3001/?model=on`. Putar kamera dan picu `ERROR` + `THINKING`.
Expected: cangkang dan topper menempel di kepala/antena dan ikut bergerak; tidak ada bola kuning ganda; tidak ada error konsol.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ModelRobot.tsx
git commit -m "feat(identity): portal identity parts onto the .glb joints"
```

---

### Task 6: Scene — teruskan identitas, jaga jarak pill

**Files:**
- Modify: `src/components/canvas/Scene.tsx`

**Interfaces:**
- Consumes: `ROBOT_ENVELOPE_TOP` dari Task 2; `resolveIdentity` dari Task 1; `DESK_SEAT` dari `WorkDesk`.
- Produces: `AgentNode` meneruskan `identity` ke `WorkDesk`? **Tidak** — hanya ke `WorkerRobot`/`ModelRobot`.

- [ ] **Step 1: Baca identitas dari store**

Di `AgentNode`, tambah selector sempit seperti yang lain:

```ts
const identityId = useAgentStore((s) => s.agents.find((a) => a.id === id)?.identity ?? 'default');
const identity = useMemo(() => resolveIdentity(identityId), [identityId]);
```

Teruskan `identity={identity}` ke `<WorkerRobot>` (dua tempat: langsung dan di dalam `fallback`) dan ke `<ModelRobot>`.

- [ ] **Step 2: Anchor pill dari amplop**

Ganti `position={[0, 2.45, -0.3]}` pada `<Html>` dengan:

```ts
const PILL_Y = DESK_SEAT.y + ROBOT_ENVELOPE_TOP + 0.085;
```

dihitung sebagai konstanta modul (bukan per render). Komentar wajib menjelaskan: `0.085` adalah celah yang hari ini menghasilkan `2.45` ketika amplop = badan; kalau topper tumbuh, pill naik sendiri.

- [ ] **Step 3: Verifikasi**

Run: `npx tsc --noEmit` → 0. Run: `npx eslint` → 0.
Run: `npm run layout:test`
Expected: lulus, tidak ada pill ter-clip.

Kalau gagal: **jangan** turunkan `PILL_Y`. Pangkas amplop topper (Task 2 Step 4) ke tinggi 0.14 dan ulangi `npm run identity:test`.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/Scene.tsx
git commit -m "feat(identity): thread identity through the scene and lift the name pill"
```

---

### Task 7: Verifikasi menyeluruh

**Files:** tidak ada perubahan kode kecuali perbaikan yang ditemukan.

- [ ] **Step 1: Jalankan semua gate**

```
npm run identity:test
npx tsc --noEmit
npx eslint
npm run layout:test
npm run build:model
npm run build
```

Expected: semuanya hijau. `build:model` harus tetap `parts 30`, `height 2.365`, dan `git diff public/models/` kosong.

- [ ] **Step 2: Smoke dengan empat status**

Run: `npm run smoke`
Expected: empat status lolos, `canvasNonBlank: true`, zero page/console errors.

- [ ] **Step 3: Screenshot bukti**

Ambil dua screenshot 1600×1000: `?capture=1` (prosedural) dan `?capture=1&model=on`.
Expected di keduanya: empat provider terlihat berbeda bentuk, bukan empat robot kembar.

- [ ] **Step 4: Perbarui dokumentasi**

- `ARCHITECTURE.md` §2 "Shared character rig": tambah paragraf bahwa identitas adalah data di `providerIdentity.ts` + `robotModel.ts`, dan sebutkan pemisahan `ROBOT_HEIGHT` (badan) vs `ROBOT_ENVELOPE_TOP` (amplop).
- `TASKS.md`: tambah fase baru dengan ringkasan hasil dan angka verifikasi.
- `README.md`: sebutkan `npm run identity:test` di daftar perintah.

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md TASKS.md README.md
git commit -m "docs: record the provider identity layer"
```
