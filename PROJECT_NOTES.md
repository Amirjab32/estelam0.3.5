# Project Context Map

## 1. File Map
- `src/App.tsx`: Root dashboard, 3-tier access gate (Firebase / Cloudflare PIN / Offline), dual-cloud reconciliation, filters, modals.
- `src/services/firestoreProducts.ts`: Firestore CRUD/subscriptions (`shops/main-shop`), legacy `users/{uid}` migration, quote math.
- `src/services/storageSync.ts`: LocalStorage bundle (`shop_offline_bundle_v1`), `/api/kv/*` client, tombstone merge (`deletedIds`), JSON I/O.
- `src/firebase.ts` & `firestore.rules`: Firebase init (`firebase-applet-config.json`) and email-whitelist rules (`isAuthorizedShopMember`).
- `src/hooks/useBackNavigation.ts`: Modal/detail/bulk-inquiry nav stack synced with `popstate`, PWA sentinel, Android hardware back.
- `src/utils/universalScraper.ts`: Pure-Web-API Digikala scraper (`v1`/`v2`, Cookie Jar, variant selector, 4.5s timeout, 2-round retry).
- `src/utils/clientDigikalaScraper.ts`, `digikalaScraper.ts`, `liveScraper.ts`: Client/HTML/inspect fallback scrapers.
- `src/utils/bulkTxtParser.ts` & `productNameMatcher.ts`: `.txt` URL parser & spec-aware Persian/English duplicate matcher.
- `src/utils/barcodeUtils.ts` & `barcodeScannerEngine.ts`: Persian-IME-safe 1D scanner (`AllLinear`, offline `zxing-wasm`, max 20/product).
- `src/utils/schedule.ts`, `jalali.ts`, `productFilterSort.ts`: 3-hour slots (`[0,3,6,9,12,15,18,21]`), quote rounding, Jalali helpers, sort/filter.
- `src/components/*`: `ShopHeader`, `RightDrawerMenu`, `ProductCard`, `ProductDetailModal`, `AddProductModal`, `BulkPriceInquiryView`, `ProductSortMenu`, `JalaliDateRangeFilter`, `BarcodeScannerModal`, `CameraBarcodeViewport`, `BarcodeAssigner`, `SchedulerModal`, `OfflineIndicator`, `PWAInstallButton`.
- `server.ts`: Express + Vite dev/prod server, `data/products` + `shop_bundle_v1.json` store, Cloudflare KV/scraper relay, 3h cron.
- `public/_worker.js` & `functions/api/*`: Cloudflare Pages Advanced Worker (`/api/kv/*`, `/api/store-catalog`, `/api/track-url`, `env.ASSETS`).
- `wrangler.json`, `package.json`, `vite.config.ts`, `tsconfig.json`: Cloudflare Pages, KV binding, build, PWA, and TS configs.
- `electron/main.cjs` & `capacitor.config.ts`: Electron tray app (`isQuitting` flag) and Android APK (`CapacitorHttp`).

## 2. Digikala Price Lookup System (Scraper & Variant Math)
- **DKP Parsing (`extractDkpId`)**: Normalizes Persian/Arabic digits; matches pure 3–10 digits, `dkp[-_\/]?`, `product_?id=`, `/product(s)?/`.
- **API Endpoints & Fallbacks**:
  - Primary order in `universalScraper.ts` & `public/_worker.js`: `https://api.digikala.com/product/v1/products/{dkpId}/` then `https://api.digikala.com/v2/product/{dkpId}/`.
  - `server.ts` (`POST /api/track-url`): supports Chrome `inspectHtml` snippet first; otherwise runs `scrapeDigikalaDetailed` (`maxRounds: 2`, `perRequestTimeoutMs: 4200`), falls back to `scrapeLiveDigikalaProduct`, then relays to upstream Cloudflare `/api/track-url` (`4500ms`, skipped if 404).
- **Redirects & Cookie Jar**:
  - Uses `redirect: 'manual'` (max 5 hops resolving `301/302/307/308` `Location` via `new URL`), Chrome 131 desktop UA, `Referer: https://www.digikala.com/`.
  - `mergeSetCookiesIntoJar` strips `Expires=` comma dates before splitting multi-cookie headers and removes `deleted`/empty cookies.
  - Caches cookie pairs in memory for 5 min (`COOKIE_CACHE_TTL_MS` / `WORKER_COOKIE_TTL_MS = 300000`) to avoid cold DigiCDN 307 challenges.
- **Timeouts & Retries**:
  - `4500ms` per-request `AbortController` timeout (`4200ms` in `server.ts` `/api/track-url`), `maxRounds: 2` with `300ms * round` backoff.
  - Clears jar/cache on retry round, HTTP `403`/`429`, or HTML WAF `200` response; stops immediately if both endpoints return JSON `404`.
- **Cheapest Same-Color & Same-Size Variant**:
  - Merges `[default_variant, ...variants]` deduplicated by `v.id`.
  - Keeps only marketable in-stock variants (`status === 'marketable'`, `has_stock !== false`, `marketable_stock > 0`) strictly matching `default_variant.color.id` and `default_variant.size.id`.
  - Sorts candidates by: lowest `genuinePriceToman` -> non-discounted first -> `default_variant.id` -> lowest `sellingToman`.
- **Non-Discounted Price & History**:
  - Converts Rials to Tomans via `Math.round(rial / 10)`. Prioritizes `rrp_price` over `selling_price` (`genuinePriceToman = rrpToman > 0 ? rrpToman : sellingToman`).
  - Detects discounts via `is_incredible`, `is_promotion`, `discount_percent > 0`, or `sellingToman < rrpToman`. Zero fake fluctuations; history appends only on real price change.
- **Unified Customer Quote Formula**:
  - `Math.round((price * (1 + margin / 100)) / 1000) * 1000` (default margin `8%`, clamped `[0, 500]`) synced across `firestoreProducts.ts`, `schedule.ts`, `server.ts`, and `public/_worker.js`.

## 3. Cloudflare Pages, Worker, KV & Build Configuration
- **`wrangler.json`**: `name: "estelam-005"`, `compatibility_date: "2026-11-14"`, `pages_build_output_dir: "./dist"`, KV binding `SHOP_KV` (`id: "88f503c4afc64199b29ed32ad68de0e8"`) under both production root and `env.preview`.
- **Advanced Mode Worker (`public/_worker.js`)**:
  - Vite copies `public/_worker.js` to `dist/_worker.js`, overriding `functions/api/*` on Pages; intercepts `/api/*` and serves SPA via `env.ASSETS.fetch(request)`.
  - `resolveShopKv(env)` checks `env.SHOP_KV` first, then scans any KV-capable binding; keys: `shop_bundle_v1` and `shop_pin_auth_v1`.
- **Build & Server Scripts (`package.json`, `server.ts`)**:
  - `"type": "module"`, `"dev": "tsx server.ts"`, `"start": "tsx server.ts"`, `"build": "vite build"`, `"lint": "tsc --noEmit"`, `"bundle:electron-server": "node scripts/bundle-electron-server.mjs"`; `firebase` pinned to `13.3.0` and `esbuild` at `^0.28.0` for clean `npm install` with `vite@^8.3.0` & `tsx`.
  - `server.ts` mounts Vite `middlewareMode` in dev (with `/@vite/client` stub when `DISABLE_HMR=true`), serves `dist/` in prod, skips auto-start if `SHOP_MANUAL_START=1` (Electron), and relays `/api/kv/*` to `https://estelam-005.pages.dev` (`CLOUDFLARE_RELAY=false` disables).
- **Vite & TypeScript (`vite.config.ts`, `tsconfig.json`)**:
  - `VitePWA` (`autoUpdate`, `maximumFileSizeToCacheInBytes: 5MB`, `globPatterns` incl. `wasm`, `navigateFallbackDenylist: [/^\/api\//, /^\/_worker\.js/]`, `/api/*` `NetworkOnly`, Google Fonts `CacheFirst`, Digikala images `StaleWhileRevalidate`).
  - `optimizeDeps.exclude: ['zxing-wasm']`, `DISABLE_HMR` watch/hmr guards, `@/*` alias -> `./*`; `tsconfig.json` uses `ES2022`/`ESNext`, `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`, `noEmit: true`.

## 4. Auth Failover, Catalog Export, Scheduler & Offline
- **Storage Failover (`auto` | `firebase` | `cloudflare` | `offline`)**: Firebase primary (3-strike hysteresis) -> Cloudflare KV (salted SHA-256 PIN in `KV_PIN_KEY`; fallback `env.SHOP_PIN || '1405'`) -> `offline-dirty` cache; merges by newest `updatedAt` + `deletedIds`.
- **`GET /api/store-catalog` Security (`public/_worker.js`)**: Requires `env.STORE_SYNC_SECRET` (`503` if unset) via `X-Sync-Secret` or `Authorization: Bearer` checked with SHA-256 `constantTimeEqual` (`401` on fail). Excludes deleted items, strips `shopCostToman`, `notes`, `barcodes`, `lastPriceToman`, `histories`, and outputs whitelisted product fields + `deletedIds` + `lastSyncedAt`.
- **3-Hour Scheduler & Bulk TXT**: Cron hours `[0,3,6,9,12,15,18,21]` polled every 20s in `server.ts`/Electron tray (or client slot check on PWA/Android). `BulkPriceInquiryView` runs sequential queue (concurrency `1`, `950ms` delay) with spec-aware duplicate flagging.
- **Offline & Scanner Rules**: Zero-CDN `zxing-wasm` via `?url`; Android uses `CapacitorHttp`; 1D-only scanner reads `KeyboardEvent.code` first for Persian IME safety.

## RED_LINES
1. **Digikala Scraper Lock**: Never change `v1`->`v2` endpoint order, `redirect: 'manual'` + comma-safe Cookie Jar + 5m cache, `4500ms`/`4200ms` timeouts + 2-round backoff, same-color/same-size cheapest seller logic, or `rrp_price` non-discounted priority with zero artificial fluctuations.
2. **Unified 1,000-Toman Rounding**: Keep `Math.round((price * (1 + margin / 100)) / 1000) * 1000` (default `8%`, max `500%`) identical across `firestoreProducts.ts`, `schedule.ts`, `server.ts`, and `public/_worker.js`.
3. **Store Catalog Security**: Never weaken `GET /api/store-catalog` `env.STORE_SYNC_SECRET` (`503`/`401`) or SHA-256 `constantTimeEqual` auth, and never expose stripped confidential fields (`shopCostToman`, `notes`, `barcodes`, `lastPriceToman`, `histories`) or deleted items.
4. **Cloudflare Pages & Worker Lock**: Never replace `wrangler.json` (`name: "estelam-005"`, `pages_build_output_dir: "./dist"`, `SHOP_KV` ID `88f503c4afc64199b29ed32ad68de0e8` in prod & `preview`) or `public/_worker.js` Advanced Mode routing + `env.ASSETS` fallback with defaults.
5. **Build, PWA & TS Config Lock**: Never overwrite `package.json` scripts (`tsx server.ts`, `vite build`, `bundle:electron-server`), `vite.config.ts` (`VitePWA` `/api/` `NetworkOnly` & `navigateFallbackDenylist`, `zxing-wasm` exclude, `DISABLE_HMR`), or `tsconfig.json` (`allowImportingTsExtensions`, `@/*` alias) with AI Studio defaults.
6. **Firestore, Relay & Offline Guard**: Preserve `isAuthorizedShopMember()` email whitelist & `hasOnly` rules in `firestore.rules`, `server.ts` Cloudflare relay (`estelam-005.pages.dev`) + `SHOP_MANUAL_START` Electron guard, and zero-CDN `zxing-wasm` 1D-only scanning.

