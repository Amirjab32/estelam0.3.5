# Security Specification: Computer Shop Price Tracker

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every `/users/{userId}` document, `/users/{userId}/products/{productId}`, and `/users/{userId}/products/{productId}/history/{historyId}` belongs exclusively to `userId` (`request.auth.uid`). No cross-user reads or writes are permitted (except verified bootstrapped admin `gholamjabb@gmail.com`).
2. **Email Verification Mandate**: All reads and writes require an authenticated Firebase user with `request.auth.token.email_verified == true`.
3. **Parent Integrity (Master Gate)**:
   - A `Product` cannot exist unless `/users/{userId}` exists (`exists(...)` on create).
   - A `PriceHistoryEntry` cannot exist unless `/users/{userId}/products/{productId}` exists (or is created in the same atomic batch via `existsAfter(...)`) and belongs to `request.auth.uid`.
4. **Temporal Integrity**: `createdAt`, `updatedAt`, and `lastRefreshedAt` must equal `request.time` on creation; `updatedAt` (and `lastRefreshedAt` on price sync) must equal `request.time` on update. `createdAt`, `id`, and `ownerId` are strictly immutable after creation.
5. **Strict Schema & Boundary Guards**: Every ID (`userId`, `shopId`, `productId`, `historyId`) matches `^[a-zA-Z0-9_\-]+$` and `<= 128` chars. Every string has an explicit `.size()` limit. Prices and margins are bounded (`>= 0`, margin `<= 500`). Product `barcodes` is an optional bounded list (`<= 20` items, string elements `1..120` chars).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: Reading or writing `/users/{uid}/products/p1` with `auth == null`.
2. **Unverified email spoofing**: Authenticated token with `email: 'gholamjabb@gmail.com'` and `email_verified: false`.
3. **Cross-user IDOR read**: User B (`uid_b`) attempting `get` or `list` on `/users/uid_a/products`.
4. **Cross-user ownership spoofing**: User B attempting to create `/users/uid_b/products/p1` with `ownerId: 'uid_a'`.
5. **Shadow / ghost field injection**: Creating a product with an extra undeclared key `isAdmin: true`.
6. **ID poisoning**: Creating `/users/{uid}/products/invalid..id/with/slashes` or a 500-char ID.
7. **Resource exhaustion (DoW)**: Creating a product with a 50,000-character `name` or `notes`.
8. **Client timestamp forgery**: Creating a product with `createdAt` set to a past client timestamp instead of `request.time`.
9. **Immutable field mutation**: Updating `createdAt` or `ownerId` or `id` on an existing product.
10. **Negative price / out-of-bounds margin**: Setting `currentPriceToman: -100` or `marginPercent: 9999`.
11. **Orphaned history write**: Writing to `/users/{uid}/products/nonexistent/history/h1` when the parent product does not exist.
12. **Blanket list scraping**: Querying `/users/{uid}/products` without matching `resource.data.ownerId == request.auth.uid` or attempting cross-tenant list.
