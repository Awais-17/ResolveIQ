# Resolving 504 errors on cloud-storage uploads

## Problem

Customers uploading files ≥ 100 MB to **Cloud Storage** intermittently see
`HTTP 504 Gateway Timeout`. The upload starts, transfers most of the payload,
then the connection times out before completion.

## Resolution

1. **Verify your bucket region matches your client region.** Cross-region
   uploads have a higher baseline latency that compounds on large files.
2. **Use resumable uploads.** Set `uploadType=resumable` and chunk the
   payload into 8 MB parts. The SDK exposes this via `Storage.uploadResumable`.
3. **Retry with exponential backoff.** Retry on 504 and 502 with a max of 5
   attempts and `800ms, 1.6s, 3.2s, 6.4s, 12.8s` backoff.
4. **Confirm your network MTU.** Path-MTU discovery issues on some ISPs cause
   the final chunk to never ack — enable TCP keepalive on the upload socket.

## Tags

`upload`, `504`, `storage`, `latency`, `resumable`
