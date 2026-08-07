# Why am I seeing a 429 on /auth/token?

## Problem

Calls to `POST /auth/token` begin returning `429 Too Many Requests` even
though usage curves look well below the documented rate limit.

## Resolution

1. The `/auth/token` endpoint shares a 3-minute sliding window of **30**
   requests *per IP*, not per user — multiple users behind corporate NAT
   share the budget.
2. Use the **refresh-token flow** (`grant_type=refresh_token`) instead of
   re-exchanging the username/password on every token expiry.
3. If you legitimately need >30 logins per 3 min from one IP (e.g. CI
   matrix), open a support ticket — we'll raise the IP allowance or switch
   you to a service-account flow.
4. The v1 endpoint has a stricter limit; **upgrade to `/v2/auth/token`**
   which exposes the same authorisation surface at a 10× higher budget.

## Tags

`429`, `auth-token`, `rate-limit`, `v2`, `refresh-token`
