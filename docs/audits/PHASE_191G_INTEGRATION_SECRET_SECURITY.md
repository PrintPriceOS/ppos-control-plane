# Phase 191G: Integration Secret Security & Encryption

## 1. Single-Reveal Secret Policy
- API Key secrets (`phsec_...`) and Webhook signing secrets (`whsec_...`) are returned **ONCE** at creation time.
- Subsequent GET or list endpoints return masked strings (`••••••••••••••••`).

## 2. Encryption at Rest
- Secrets stored in `secret_ciphertext` use **AES-256-GCM** encryption with unique IVs and authentication tags.
- Lookup hashes (`key_hash`) use **SHA-256** one-way hashing for API authentication validation.

## 3. Rotation & Revocation
- Credentials can be rotated via `POST /credentials/rotate`, marking the old key as `ROTATED` and generating a new active key.
- Revocation via `DELETE /credentials/:id` permanently marks keys as `REVOKED`.

## 4. Audit Log Redaction
- Audit event payloads mask all `rawSecret`, `password`, `token`, and `authorization` attributes.
