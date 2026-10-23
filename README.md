# Still

A mobile-first, installable calorie and macro logger built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix components, Supabase, OpenAI, USDA FoodData Central, Open Food Facts, and ZXing camera barcode decoding.

## Run locally

Requires Node.js 22+.

```sh
cd counter
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No keys are required for the explicitly labeled local demo. Use **Add food → Type → Try “200 g chicken and 100 g rice”** or load a sample day. Demo sample foods include cooked chicken, cooked rice, eggs, oats, banana, yogurt, blueberries, milk, peanut butter, and cheddar. Demo parsing is a small deterministic parser, not AI. It intentionally fails for unsupported foods rather than inventing nutrition. You can enter any product's label manually.

Open Food Facts barcode lookup is a real server integration and does not need a key. Camera and microphone require HTTPS or localhost. Visiting a laptop's plain HTTP LAN address from an iPhone does not permit camera/microphone access; use an HTTPS deployment or trusted HTTPS development tunnel.

## Enable real integrations

Fill `.env.local`, then restart Next.js. Private API keys never enter the browser bundle.

| Variable                        | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `OPENAI_API_KEY`                | Server-side audio transcription and structured food extraction        |
| `OPENAI_PARSE_MODEL`            | Structured-output-capable model; default `gpt-4.1-mini`               |
| `OPENAI_TRANSCRIBE_MODEL`       | Audio transcription model; default `gpt-4o-mini-transcribe`           |
| `USDA_API_KEY`                  | USDA FoodData Central search and food details                         |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project anon/publishable key; **never use a service-role key** |

Get a USDA key through [FoodData Central](https://fdc.nal.usda.gov/api-key-signup/). Set up an OpenAI project key using your OpenAI Platform account. Model availability can vary by project; the models are configurable. This repository has no credentials and no paid API calls were used during development.

For a complete live natural-language experience, enable **both OpenAI and USDA**. With only OpenAI, extracted food names can match cached custom foods or labeled sample foods; unmatched descriptions are rejected. The Settings sheet reports each integration's configuration status. “Configured” reports environment presence, not verified remote access.

### Supabase persistence and security

1. Create a Supabase project.
2. Enable **Authentication → Sign-in / Providers → Anonymous Sign-ins**.
3. Run `supabase/schema.sql` once in its SQL editor.
4. Add the public URL and anon key above; restart the app.

The SDK creates and persists a genuine anonymous Auth session. Every row is authorized with `auth.uid() = user_id` RLS; the installation ID is metadata only and grants no access. Server API routes verify the user's access token against Supabase Auth. A production deployment with AI enabled requires Supabase authentication. No service-role key is needed.

The initial version supports one anonymous browser identity. Its data persists through reloads, but clearing browser storage loses access to that anonymous identity. Use **Settings → Export a backup** to preserve a portable JSON copy. Optional permanent-account linking can later attach to the same anonymous user ID without changing the data schema. Account linking and backup import are not part of this release.

Before opening to a broad public audience, configure Supabase anonymous-sign-in rate limits/abuse protection and deployment-level request limits. The server includes a per-process per-user AI throttle; a distributed hosting environment should enforce an equivalent shared limit at its edge. No coaching, meal plans, notifications, payments, photos, or marketing pages are included.

## Core behavior

- **Speak:** tap once to request the microphone/start MediaRecorder; tap again to stop. Server-side transcription feeds the same parsing/matching pipeline as Type. Recordings cap at 60 seconds and stay available for playback/retry after a transcription failure. AI transcription is explicitly unavailable without its key.
- **Scan:** choosing Scan immediately requests the rear camera and starts ZXing decoding of UPC-A, UPC-E, EAN-8, or EAN-13. Tracks stop when scanning succeeds, the method changes, or the sheet closes. A typed barcode fallback is available. Open Food Facts is first, USDA exact GTIN verification is second. A missing product can be entered from its label and cached locally.
- **Type:** multi-food structured extraction, optional one-question clarification, source-backed food candidates, quantity editing, alternative search, and one Add All confirmation. The LLM never returns nutritional values.
- **Memory:** cached food matches are ranked using prior logging frequency, brand and preparation. Recipes can be saved from a confirmation or a previously logged meal. Type or say a saved recipe's name, optionally with modifications. Modified ingredients do not change the saved recipe.
- **Today/History:** totals recalculate after quantity edits or deletes. History includes a date picker, date navigation, and food/meal copy to today. Logging timestamps are UTC; each entry also stores its original local calendar day so travelling does not silently move prior meals between days.
- **Unknown nutrients:** rendered as `—`; a total is marked unknown if any included record is missing that nutrient. True zero stays zero.
- **Unit safety:** use reference nutrients × consumed/reference quantity. Mass, volume, and servings stay separate. Pieces/cups/tablespoons only convert using explicit database portions. No implicit density conversions. Ounces use a mass conversion only.

## Offline and sync

A single atomic local-storage envelope saves entries, food cache, recipes, targets, and an outbox **before** showing success. A storage failure leaves the UI unchanged and reports an error. Offline edits/deletions use queued entity upserts and tombstones. Reconnection retries them under the same Supabase user identity; failed sync keeps the queue and reports its state. Concurrent local changes made during sync are retained. The app refuses to send an existing local dataset to a different cloud identity automatically.

The service worker caches the app shell and same-origin static assets for offline reopening. API calls, audio and authenticated remote responses are never service-worker cached. An initial online visit is required. On iPhone: Safari → Share → Add to Home Screen. Safari can evict local web storage; cloud sync or exported backups provide additional durability. Multi-device simultaneous edits use last successful row write; this is not a collaborative merge system.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm start
```

All 21 automated tests pass. Tests cover local save durability/failed-write rollback, nutrient scaling, verified serving/piece conversions, rejected density assumptions, unknown nutrients, ounces, local date boundaries and DST, nonmutating recipe add/set/remove operations, and totals after edits/deletions. Browser checks cover demo multi-food confirmation, recalculation after editing, recipe saving/modification, persistence across reload, History, manual custom-food entry and mobile/light/dark layouts.

The production build and TypeScript checks pass. Offline reopening and offline edits surviving reload were verified in the browser. A live Open Food Facts lookup for UPC/EAN `3017620422003` returned Nutella with a 100 g nutrition basis.

Real OpenAI/USDA responses, Supabase RLS against a provisioned project, and physical iPhone camera/microphone behavior require credentials/hardware and remain deployment acceptance checks. The integration routes are implemented; these live checks are not represented as passed.

## Key files

- `app/page.tsx`: Today, History, editing, targets, export
- `components/food-sheet.tsx`: food matching, confirmation, recipes, manual labels
- `components/scanner.tsx`, `components/voice.tsx`: real camera and audio capture
- `lib/nutrition.ts`: pure scaling, totals, units, local dates and recipe changes
- `lib/store.ts`: local durability, anonymous session and retryable sync
- `app/api/*`, `lib/providers.ts`: server-side integration interfaces
- `supabase/schema.sql`: schema and RLS
- `public/sw.js`, `public/manifest.webmanifest`: install/offline support

Integration references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [audio transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [USDA API](https://fdc.nal.usda.gov/api-guide/), [Open Food Facts product API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v2/products/get-product-by-code/), [Supabase anonymous auth](https://supabase.com/docs/guides/auth/auth-anonymous).

## Ingredient-by-ingredient meals and lookup cost

In Add food, search a food name or type a measured ingredient such as `150 g blueberries`. Review the record and quantity, then choose **Add another ingredient**. Previous ingredients remain in the meal; calories and all three macros update as quantities change. The draft is saved on this device and resumes after closing/reloading. Select **Save as a reusable meal**, name it, and either save/log today or choose **Save meal only**. Saved meals have a searchable list; saving meals also caches their ingredient records. Duplicate names are rejected so a recipe is not silently overwritten. A saved recipe can be logged and modified without changing its original ingredients. Each weight is entered manually until a real scale connection is implemented and tested; no decorative Bluetooth controls are included.

Food-name search, barcode lookup, cached foods, saved meals and simple numeric descriptions do not use OpenAI. `lib/simple-parse.ts` handles explicit quantities and units deterministically; complex prose falls through to the structured AI parser. USDA search defaults to generic Foundation/SR Legacy/FNDDS records; branded search is available when a brand is supplied or generic search has no compatible match. Food name and preparation must match before repeat-use frequency affects ranking. Generic raw foods rank above unrequested dried/sweetened/processed alternatives. Database record links and reference quantities appear on confirmation cards.

USDA nutrition lookups use the free FoodData Central API (a free data.gov key is still required); the documented default limit is 1,000 requests/hour/IP. USDA search and details request 24-hour Next.js server data caching. Confirmed foods and recipe ingredients remain in the local persistent food cache for repeat use. Open Food Facts is a public barcode data source. Hosting, storage and optional OpenAI usage have separate costs; this app makes no promise of a zero-cost production deployment. No paid nutrition API is required.

**Current unconfigured local preview:** blueberries and the other small built-in sample-food list still use explicitly labeled demo records. A real USDA API key is required to search the full USDA catalog; no missing nutrients are invented. The Bluetooth scale discussion does not mean an actual iPhone/scale connection has been implemented.

### Budget scale research (October 22, 2026)

RENPHO Calibra / ES-SNG01 is a lower-cost candidate than premium coffee scales. US listings are roughly $20–$30; retail prices and the model shipped must be checked before buying. RENPHO documents its ES-SNG01-W food scale at https://renpho.com/pages/009. An independent ES-SNG01 protocol implementation documents live/stable gram notifications at https://github.com/Eim-make/renpho-ble/blob/main/docs/protocol.md; its remote tare write channel remains untested. This is research evidence, not a supported or hardware-verified integration. Physical tare can still be used. iPhone PWA Bluetooth restrictions remain; a native CoreBluetooth bridge would be needed for our intended seamless iPhone experience.


## Deploy to Netlify

Import `conspicious54/counter` from GitHub into Netlify. The repository root is the application root.

- Build command: `npm run build`
- Publish directory: `.next`
- Node.js: 22
- Next.js is detected automatically and deployed with Netlify's OpenNext adapter, including the server API routes. Do not use static export or an SPA catch-all redirect.
- Add the variables in `.env.example` through Netlify's environment settings, then redeploy. Never commit `.env.local`.
- Without credentials the published app runs in labeled local/demo mode; barcode lookup is live. Data remains in that browser until Supabase is configured.

Open the deployed HTTPS address in iPhone Safari, then Share → Add to Home Screen.
