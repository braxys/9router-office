This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

A 3D office where every provider reported by 9Router gets its own robot: one desk each, a comedic
performance per status, and a body shaped like the provider — head crest, antenna topper, chest
emblem and brand colour. Unknown providers fall back to the shared default body.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result. (`npm run dev`
uses port 3001 because the 9Router telemetry API expects to be reached from the dashboard's origin.)

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run identity:test # provider identity truth table (no browser)
npm run identity:render # per-part colour gate, procedural rig (needs dev server + Chrome on CDP 9223)
npm run identity:render:model # per-part colour gate, .glb rig (same prerequisites)
npm run status:test   # provider status truth table (no browser)
npm run layout:unit   # HUD geometry truth table, incl. the collapsed rail (no browser)
npm run build:model   # regenerate public/models/worker-robot.glb from robotModel.ts
npm run smoke         # page-ready + console-error probe (needs Chrome on CDP 9223)
npm run layout:test   # 15-viewport HUD layout gate (needs dev server + Chrome on CDP 9224)
```

`scripts/identity-render.mjs` is the render gate for the per-provider bots; it needs the dev server
on port 3001 and Chrome headless on CDP 9223, and is worth running on both bodies:

```bash
npm run identity:render        # procedural rig (?capture=1)
npm run identity:render:model  # .glb rig      (?capture=1&model=on)
```

See `ARCHITECTURE.md` for the data flow, the identity tables and what each gate actually proves.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
