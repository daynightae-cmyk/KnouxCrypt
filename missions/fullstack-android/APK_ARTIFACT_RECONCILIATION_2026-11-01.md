# APK artifact reconciliation — 2026-11-01

## The discrepancy

Four mission evidence rows (TASK 13, 19, 23, 28) recorded a clean debug APK of
**19,712,121 bytes** while carrying three *different* SHA-256 values:

| Mission | Recorded size | Recorded SHA-256 |
|---|---|---|
| 13 KEY DETAILS | 19,712,121 (unverified) | `99fd9daa219d2f1bd4ab7c52dc84a8f9c7b118f1538db6674f9e769f03bfb6de` |
| 19 DIGITAL SIGNATURE | 19,712,121 (unverified) | `4f48d6d0a44e0440d55c850a56dea265ab77e7fe2729d0778dacbc8907fa2057` |
| 23 FINGERPRINT VERIFY | ~~19,712,121~~ → **19,782,143** | `e03a0baf4de7144b5dc3da09a4e2721b64616e31b4e8e53bb0f1065ca69437ef` |
| 28 PUBLIC KEY QR | ~~19,712,121~~ → **19,782,143** | `e03a0baf4de7144b5dc3da09a4e2721b64616e31b4e8e53bb0f1065ca69437ef` |

Identical sizes across three different builds were never a real measurement
anomaly: it was a **documentation error**. The size line was copied forward from
the TASK 13 row into the later rows instead of being re-measured, while the
SHA-256 was measured each time.

## Direct measurement (the reproducible part)

The artifact that is still on disk from the TASK 23/28 build was measured twice
with independent tools at `native-android/app/build/outputs/apk/debug/app-debug.apk`:

```
$ sha256sum app/build/outputs/apk/debug/app-debug.apk
e03a0baf4de7144b5dc3da09a4e2721b64616e31b4e8e53bb0f1065ca69437ef
$ stat -c '%s' app/build/outputs/apk/debug/app-debug.apk
19782143
```

The hash matches the recorded value exactly, so the recorded *hash* was correct
and identifies the installed, cold-start-verified artifact. The recorded *size*
was wrong by 70,022 bytes. **19,782,143 bytes / `e03a0baf…437ef` is the
authoritative pair for the last device-installed build before TASK 16.**

The TASK 13 and TASK 19 outputs were overwritten by later builds, so their sizes
cannot be recovered; those rows now say so instead of quoting a number that was
never measured for them.

## Consequences for claims

1. No build was ever "the same size with a different hash"; there is no
   unexplained non-determinism to investigate in the recorded data.
2. The size of a debug APK is not a stable identity across code changes, so
   future evidence rows record **SHA-256 first** and the byte size only when it
   is measured from the same file that was installed.
3. Any new claim of a *verified artifact* must quote a hash measured after the
   final `:app:clean :app:assembleDebug` of the commit being reported, and the
   size measured from that same file.
4. Byte-for-byte reproducibility was then **measured directly**: two separate
   `:app:clean :app:assembleDebug` runs of the same TASK 16 working tree produced
   identical size **and** identical hash —

   ```
   19930079  c3d05d8863df3222c103a2de6bc72979814fa161a368977da9139604bae7a84d   build 1
   19930079  c3d05d8863df3222c103a2de6bc72979814fa161a368977da9139604bae7a84d   build 2
   ```

   So this build pipeline is deterministic on this machine, and a differing hash
   can only mean differing inputs (as it did above). Reproducibility across
   *different* machines or after dependency refresh is still a TASK 45 question.
