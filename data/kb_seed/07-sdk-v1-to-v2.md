# Upgrading the SDK from v1 to v2

## Problem

Customers on the legacy `resolveiq-sdk-js@1.x` experience intermittent
429s and 504s that don't repro on `@2.x`.

## Resolution

1. `@2.x` ships typed `uploadResumable` and a built-in retry queue —
   upgrade is recommended for all customers on supported version paths.
2. `npm install resolveiq-sdk-js@^2` — no breaking API changes, but
   *node* requirements move from >=14 to >=18.
3. The v1 endpoints are scheduled for **maintenance every Friday 04:00
   UTC** and *may* return 502 during this window; v2 endpoints are not
   affected.

## Tags

`sdk`, `v2`, `upgrade`, `resumable`, `maintenance`
