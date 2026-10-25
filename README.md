# Still

A mobile-first, installable calorie and macro logger built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix components, Supabase, OpenAI, USDA FoodData Central, Open Food Facts, and ZXing camera barcode decoding.

## Run locally

Requires Node.js 22+.

```sh
cd macro-tracker
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Set the server keys below for live food search and voice. There are no sample-food fallbacks or demo controls. Saved foods and manual nutrition-label entry remain available offline.

For a personal deployment, set `COUNTER_ACCESS_CODE` to a long random secret instead of configuring Supabase. Enter it once in the app; an HttpOnly, Secure, SameSite session cookie lasts 180 days. Changing the code revokes existing sessions. Logs remain in device storage; export backups from Settings. This mode does not provide cloud sync. The access code protects paid AI calls; per-process throttling is a secondary limit, not distributed abuse protection.

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

The SDK creates and persists a genuine anonymous Auth session. Every row is authorized with `auth.uid() = user_id` RLS; the installation ID is metadata only and grants no access. Server API routes verify the user's access token against Supabase Auth. A production deployment with AI enabled requires either personal access (`COUNTER_ACCESS_CODE`) or Supabase authentication. No service-role key is needed.

The initial version supports one anonymous browser identity. Its data persists through reloads, but clearing browser storage loses access to that anonymous identity. Use **Settings → Export a backup** to preserve a portable JSON copy. Optional permanent-account linking can later attach to the same anonymous user ID without changing the data schema. Account linking and backup import are not part of this release.

Before opening to a broad public audience, configure Supabase anonymous-sign-in rate limits/abuse protection and deployment-level request limits. The server includes a per-process per-user AI throttle; a distributed hosting environment should enforce an equivalent shared limit at its edge. No coaching, meal plans, notifications, payments, photos, or marketing pages are included.

## Core behavior

- **Speak:** Add Food opens the microphone automatically (subject to device permission); a natural pause finishes the recording. Manual stop remains available. Server-side transcription feeds the same parsing/matching pipeline as Type. Recordings cap at 60 seconds and stay available for playback/retry after a transcription failure. AI transcription is explicitly unavailable without its key.
- **Scan:** choosing Scan immediately requests the rear camera and starts ZXing decoding of UPC-A, UPC-E, EAN-8, or EAN-13. Tracks stop when scanning succeeds, the method changes, or the sheet closes. A typed barcode fallback is available. Open Food Facts is first, USDA exact GTIN verification is second. A missing product can be entered from its label and cached locally.
- **Type:** multi-food structured extraction, optional one-question clarification, source-backed food candidates, quantity editing, alternative search, and one Add All confirmation. The parsing model never returns nutrition values; a separate, clearly labeled AI estimate is used automatically when no matching food record is found.
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

All 26 automated tests pass. Tests cover local save durability/failed-write rollback, nutrient scaling, verified serving/piece conversions, rejected density assumptions, unknown nutrients, ounces, local date boundaries and DST, nonmutating recipe add/set/remove operations, and totals after edits/deletions. Browser checks cover demo multi-food confirmation, recalculation after editing, recipe saving/modification, persistence across reload, History, manual custom-food entry and mobile/light/dark layouts.

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

In Add food, search a food name or type a measured ingredient such as `150 g blueberries`. Review the record and quantity, then choose **Add another ingredient**. Previous ingredients remain in the meal; calories and all three macros update as quantities change. The draft is saved on this device and resumes after closing/reloading. Select **Save as a reusable meal**, name it, and either save/log today or choose **Save meal only**. Saved meals have a searchable list; saving meals also caches their ingredient records. Duplicate names are rejected so a recipe is not silently overwritten. A saved recipe can be logged and modified without changing its original ingredients. Gram-based ingredients now include Weigh with scale. The ENS-C551S-SUS decoder was verified against physical 25.0 g readings on a Mac; the native app is now signed, installed and launched on the paired iPhone; end-to-end user verification is pending. See native-ios/README.md.

Food-name search, barcode lookup, cached foods, saved meals and simple numeric descriptions do not use OpenAI. `lib/simple-parse.ts` handles explicit quantities and units deterministically; complex prose falls through to the structured AI parser. USDA search defaults to generic Foundation/SR Legacy/FNDDS records; branded search is available when a brand is supplied or generic search has no compatible match. Food name and preparation must match before repeat-use frequency affects ranking. Generic raw foods rank above unrequested dried/sweetened/processed alternatives. Database record links and reference quantities appear on confirmation cards.

USDA nutrition lookups use the free FoodData Central API (a free data.gov key is still required); the documented default limit is 1,000 requests/hour/IP. USDA search and details request 24-hour Next.js server data caching. Confirmed foods and recipe ingredients remain in the local persistent food cache for repeat use. Open Food Facts is a public barcode data source. Hosting, storage and optional OpenAI usage have separate costs; this app makes no promise of a zero-cost production deployment. No paid nutrition API is required.

**Current unconfigured local preview:** blueberries and the other small built-in sample-food list still use explicitly labeled demo records. A real USDA API key is required to search the full USDA catalog; no missing nutrients are invented. The native iPhone bridge source and desktop Web Bluetooth transport are implemented; physical iPhone signing, installation and launch succeeded; end-to-end user verification is pending.

### Budget scale research (October 22, 2026)

RENPHO Calibra / ES-SNG01 is a lower-cost candidate than premium coffee scales. US listings are roughly $20–$30; retail prices and the model shipped must be checked before buying. RENPHO documents its ES-SNG01-W food scale at https://renpho.com/pages/009. An independent ES-SNG01 protocol implementation documents live/stable gram notifications at https://github.com/Eim-make/renpho-ble/blob/main/docs/protocol.md; its remote tare write channel remains untested. This is research evidence, not a supported or hardware-verified integration. Physical tare can still be used. iPhone PWA Bluetooth restrictions remain; a native CoreBluetooth bridge would be needed for our intended seamless iPhone experience.

## Etekcity ENS-C551S-SUS automatic weighing

Select a gram-based ingredient, choose **Weigh with scale**, connect, physically tare an empty plate, and select **Start automatic weight**. Fresh stable positive gram notifications update only that ingredient. **Keep weight & stop tracking** locks it before confirming the meal. Ounce/volume modes, unsupported packets, checksum errors, negative weights, and stale/preselection readings are rejected. No remote tare commands are sent.

Use Chrome/Edge on desktop with Web Bluetooth, or build the native iPhone shell in `native-ios/Counter.xcodeproj`. Safari's PWA does not expose the bridge and shows an explicit explanation. The native app loads https://dumbcount.netlify.app/ and restricts the bridge to that main-frame HTTPS origin. It disconnects when backgrounded.

Hardware evidence: physical scale discovery, FFF0/FFF1 subscription and stable 25.0 g capture were verified from a Mac on October 22, 2026. The 16-byte measurement has a modulo-256 byte sum of 255, signed little-endian tenths of grams at bytes 11–12, gram unit code 2 at byte 13, media 0 at byte 14, and stable flag 1 at byte 15. Only this observed layout is accepted. Both simulator and signed physical-device builds pass. The native app was installed and launched on the paired physical iPhone on October 22, 2026 using an existing development signing identity. Physical iPhone automatic-entry confirmation by the user is pending.

## Voice verification

OpenAI transcription and structured parsing verified with real API requests. Personal access uses signed expiring cookies; credentials stay server-side. Native Etekcity weighing was verified on the physical iPhone. Selecting Weigh connects automatically in Counter and arms fresh stable gram readings on connection. Tap Use weight, then confirm the food once.


## Restaurant / unknown-food fallback

Food matching tries saved database/custom foods, then USDA generic/branded search. An empty match automatically calls the authenticated `/api/estimate` route with `gpt-4.1-mini` (optional `OPENAI_ESTIMATE_MODEL` override). API outages remain visible errors rather than pretending the database had no result. An existing exact AI estimate can be reused offline. When online, matching database records take priority over saved AI estimates.

Estimates are visibly labeled **AI estimate** in confirmation, Today/History, and editing. Assumptions, model, reference portion and generation time persist with the food. Restaurant dish customizations stay in one food description; unspecified restaurant quantities use one standard menu portion. Estimates are approximate model knowledge, not live-verified or official menu facts. No web-search tool fee is incurred.

Cost controls: a 500-output-token cap per estimate, no estimate call for database hits, a bounded seven-day in-process cache with in-flight deduplication, and persistent reuse of confirmed foods on the device. The in-process cache may reset across serverless instances/redeploys; device food memory is the durable cache. New estimates need connectivity. The existing personal/Supabase authentication and API throttle protect the paid endpoint.

Reference quantities are 100 g, 100 ml, or one stated serving/piece/cup/etc. Only known mass units convert to grams. A serving-only estimate never manufactures a serving-to-gram conversion. Missing nutrients stay null, and totals preserve that unknown state. Tests cover automatic fallback, real-food priority, exact cached reuse, restaurant/portion separation, nutrient scaling, missing nutrients, invalid outputs and database outages.


## Barcode nutrition and camera light

The scanner has a Flash on/off control backed by ZXing's real camera torch constraint. It is enabled only when the active camera exposes torch controls. Camera tracks and torch are stopped when a scan succeeds or the scanner closes. Browser/device capability still determines flashlight availability; physical iPhone torch operation needs a hardware check.

Barcode lookup accepts both per-100 g/ml and per-serving Open Food Facts values, numeric strings, explicit serving weights/volumes, and kJ energy. Serving-only data remains serving-based instead of assuming grams. An identified product with missing macros proceeds to USDA exact GTIN matches; unrelated barcode search hits cannot supply facts. Missing nutrients can be filled from another record of the same barcode only when reference bases or an explicit serving conversion are compatible. Source provenance is shown for combined records. USDA parsing includes Atwater calorie nutrient IDs and label nutrients with verified gram serving sizes.

Incomplete saved products are rechecked online rather than cached forever. Missing fields stay explicitly unknown; a record without any nutrition cannot be logged as if complete. The confirmation offers label completion with known values/name prefilled or an optional clearly labeled AI estimate. A corrected custom label is saved for repeat scanning. Neither missing database records nor AI estimates are represented as verified nutrition facts.

### Nutrition label camera

Scan → **Scan nutrition label**, or use the same button in the missing-product form. Photograph the full nutrition panel including serving size. Counter sends a resized photo to the authenticated `/api/label` route, reads only calories, protein, total carbohydrate and total fat, and prefills an editable review form. It never estimates missing label values. Explicit serving grams/mL are retained for quantity scaling; no density is inferred. Confirmed custom foods keep their barcode for repeat scans. Photos are not stored by Counter. `OPENAI_LABEL_MODEL` defaults to `gpt-4.1-mini`; the existing server-only OpenAI key and personal-session protection apply. Label reading requires connectivity; manual entry remains available.

### Fast food entry

The entry sheet uses one description field with voice and barcode actions. Exact saved food/meal phrases resolve locally. Confirmed AI estimates reuse only the exact description/brand/preparation/unit key, after checking saved verified foods first; they remain labeled estimates. New foods still use database matching before estimation. Search skips portion-detail requests for complete gram/ounce records, batches needed USDA details through `/foods`, and uses a bounded 15-minute process cache with in-flight deduplication. Failed requests are never cached.

Microphone controls distinguish opening, listening, stopped/finalizing, and transcribing. Stop updates the UI and releases capture tracks immediately, before awaiting MediaRecorder’s final data event. Capture emits 250 ms chunks; final audio is still retained on transcription failure. Browser regression verified with injected two-second getUserMedia and stop-event delays: opening/stopped indicators appear while those operations are still pending, and retry remains available after a simulated transcription failure. These are simulated hardware tests, not iPhone latency measurements.
