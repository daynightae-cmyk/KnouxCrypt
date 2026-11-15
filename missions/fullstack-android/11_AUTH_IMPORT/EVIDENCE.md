# EVIDENCE — TASK 11 — Authenticator Import

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `8b36d8d`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED + RULES DEVICE_VERIFIED (1 instrumented test) — UI DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

- `OtpAuthParser` / `OtpMigrationParser` in `:core:security`: strict `otpauth://totp` parsing
  (issuer from label or query, Base32 re-encoded canonically, 10–64 byte secrets, SHA1/SHA256/SHA512,
  6/8 digits, 15–120 s period) and a hand-written, bounded protobuf decoder for the published
  Google Authenticator export (`version=1`, batch id/index/size ≤ 10 pages, ≤ 100 accounts,
  unknown fields skipped by wire type, every length checked before use). HOTP, MD5, unknown
  digits and malformed payloads return typed refusals — never conversions.
- `AuthImportScreen` (`auth_import`, unlock-gated): paste link, pick a QR image (ZXing, local,
  downscaled), or scan with CameraX (runtime permission, typed denial state). Preview lists each
  account with algorithm/digits/period, flags existing issuer+account pairs and offers Skip or
  Replace per item; nothing is written until the explicit Import button. Multi-page migration
  batches are accumulated by batch id and only offered once every page is present. A lock clears
  the preview (which holds secrets).
- Commit path: `SecretRepository.saveBatch` runs inside one `withAuthorizedMutation` and one Room
  `@Upsert` collection transaction — all chosen accounts or none; a lock before the write leaves the
  vault unchanged. Records use the existing KNC/TOTP payload and AAD; no new store, no new crypto.
- Authenticator screen exposes “Import accounts (QR / backup)”. No network permission exists.

## Verification

| Check | Result |
|---|---|
| JVM suite | **196 tests, 0 failures** (security 90, data 89, app 17); new: `OtpImportTest` 9, `PasswordImportBatchTest` 4 |
| Instrumented (itel S686LN, Android 15) | **11/11 PASS** including `AuthImportRoomTest.importedBatchIsAtomicEncryptedAndReadable` |
| Lint | 0 errors (18 warnings + 1 hint app, 10 warnings core:data) |
| APK | clean build **19,683,839 bytes**, SHA-256 `0509758ae4b81b004465b38867cfb62336ed90816b76a16fb95a6b286c7fd4f0` |
| Install / launch | “Installed on 1 device”, cold start alive, crash buffer empty |

## Not verified / limits

Camera preview, picker flow, permission dialog, RTL layout and the preview/confirm interaction are
**DEVICE_UNVERIFIED** (no owner fingerprint for the unlocked screen during this pass). Migration
support is TOTP-only and limited to the published contract; batch order is assumed to be page-index
based. No audit, no fuzzing, no release claim.
