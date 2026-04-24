# Phase 1 Validation Checklist

## A) Firestore Rules Coverage for Affected Collections

- [x] A1. `users/{uid}/integration_sync/{doc}` owner read/write allowed
- [x] A2. `users/{uid}/samsara_oauth_pending/{doc}` owner read/write allowed
- [x] A3. `users/{uid}/samsara_sync_requests/{doc}` owner read/write allowed
- [x] A4. `users/{uid}/samsara_cache/{doc}` owner read/write allowed
- [x] A5. `users/{uid}/documents/{doc}` owner read/write allowed
- [x] A6. `users/{uid}/ifta_records/{doc}` owner read/write allowed
- [x] A7. Non-owner access denied for each collection above

## B) Samsara Token Metadata Round-Trip (Frontend/Backend)

- [x] B1. Backend callback stores both camelCase and snake_case token fields
- [x] B2. Frontend token health reads camelCase fields
- [x] B3. Frontend token health reads snake_case fields
- [x] B4. Frontend sync cursor preview reads both `cursor` and `cursors` map

## C) OAuth Callback Redirect Behavior

- [x] C1. Provider error -> error redirect
- [x] C2. Missing params -> error redirect
- [x] C3. Invalid state -> error redirect
- [x] C4. Token exchange failure -> token_exchange redirect
- [x] C5. Success with allowed origin -> success redirect to allowed origin
- [x] C6. Success with disallowed origin -> success redirect to canonical origin
- [x] C7. Expired state redirect origin sanitized to allow-list/canonical

## Execution Notes

- Validation runner: `node scripts/validation/phase1-validation-runner.js`
- Result artifact: `scripts/validation/phase1-validation-results.json`

## Last Execution Summary

- Date: 2026-04-23
- Total checks: 25
- Pass: 25
- Fail: 0
- Failing check: None
