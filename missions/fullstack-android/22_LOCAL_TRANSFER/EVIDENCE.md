# EVIDENCE — TASK 22 — Local Transfer

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `c0b2941`
Classification: **PROTOCOL SOURCE_IMPLEMENTED + JVM_TESTED · TRANSPORT BLOCKED — NO SIMULATED TRANSFER**

## Status, stated plainly

**The transport is BLOCKED and nothing has ever been transferred.** No Bluetooth or Wi-Fi Direct
channel in this build has moved a byte, so no transfer has completed, and the screen refuses to
pretend otherwise. What *is* implemented and verified is the part that can be proven without a radio:
the KTX1 session protocol.

## What works

**`TransferProtocol` (KTX1) — `:core:security`, 9 JVM tests.** A framed session protocol over any
duplex byte pipe:

- **Framing** — `type(1) | length(2) | payload`. A length field is two bytes, so the largest frame a
  hostile peer can declare is 65 535 bytes and the parser waits for the rest instead of allocating
  what it is told; `frame()` itself refuses anything larger.
- **Handshake** — each side sends a clear HELLO carrying a fresh session id, an ephemeral X25519
  public key and a name. The direction keys are HKDF-SHA-256 over the X25519 shared secret, salted by
  the session id and bound to a hash of both HELLOs. The role is decided by comparing the two
  ephemeral public keys, so the derivation is symmetric, argument-order independent, and mirrored:
  A's send key is B's receive key, and the two direction keys are never equal.
- **Replay and ordering** — one key per direction, a 64-bit sequence inside every GCM nonce *and*
  inside the AAD together with the frame type and the stream offset. An older sequence is `REPLAY`, a
  gap is `OUT_OF_ORDER`, and a reinterpreted frame type or offset is `TAMPERED`.
- **Ciphertext only** — every payload-bearing frame is AES-256-GCM. The only clear bytes are the
  public handshake values.
- **Peer identity** — each side presents its long-term X25519 identity *inside* the encrypted channel;
  if the observed fingerprint is not the one the user confirmed, the session aborts with
  `IDENTITY_MISMATCH` before a payload byte moves. Identity reuse is the TASK 16 recipient model, not a
  second key system.
- **Truncation and resume** — an END frame carries the byte count and the SHA-256 of the stream, and an
  OFFER carries `totalBytes`/`offset`/`digestHex`, so a restart resumes at an authenticated offset and
  a stream that ends short of its declaration is rejected. An offer resuming past its own end is
  refused at parse time.

**`LocalTransferScreen` (route `local_transfer`, catalog `BLOCKED`)** follows the approved reference —
selected package, nearby device, connection method, transfer details, primary action, the two
secondary actions and the footer line — and every panel tells the truth:

- Only a file whose first four bytes are a KNOUX container magic (`KSR1`, `KNF1`/`KNF2`, `KNC1`/`KNC2`)
  is accepted as a package; anything else is named as not-a-package, because plaintext must never be
  what goes on the wire.
- The Bluetooth panel reports the adapter's actual state and then says this build declares no
  `BLUETOOTH_CONNECT` permission and ships no RFCOMM channel, so no peer list is read. The Wi-Fi
  Direct panel reports whether the feature exists and that the build does not implement the group
  owner path.
- "Prepare Secure Transfer" cannot succeed: it reports the specific reason it is blocked (no usable
  transport, no sealed package selected, no verified recipient, or no real radio ever tested).
- A permanent BLOCKED panel states what would unblock it and that no transfer has completed in this build.

## Why the transport was left blocked rather than written

A Bluetooth RFCOMM channel can be typed out, but in this session it could not be compiled against a
device, granted a permission, paired with a second handset, or observed moving a single byte. Shipping
it as a "working transfer" is precisely the simulated success the mission forbids. An earlier draft of
a service layer that ran the protocol over an injected channel was **deleted rather than committed**,
because its frame buffering and transcript handling had not been proven; the protocol core that
remains is the part with tests behind it.

Lint also caught a real defect in the first probe: it read `BluetoothAdapter.getBondedDevices()` and
`BluetoothDevice.getName()`, both of which require `BLUETOOTH_CONNECT` that the app does not declare —
a guaranteed `SecurityException` at runtime. The fix was to stop touching those APIs at all rather
than to ask the owner for a permission that currently buys nothing.

## Verification

| Check | Result |
|---|---|
| JVM | **305 tests, 0 failures** (security 161, data 127, app 17); new `TransferProtocolTest` 9 |
| Protocol cases | frame round trip · partial frame waits · declared length cannot over-allocate · hello carries session id/key/name · unsupported version refused · truncated hello refused · key agreement mirrored and order-independent · per-direction keys differ · replay refused · gap refused · tampered record refused · record invalid at another offset · record invalid as another frame type · different session id gives different keys · offer/accept/end round trips · offset beyond total refused · implausible digest length refused · long names truncated |
| Lint | 0 errors (after removing the unpermitted Bluetooth calls) |
| APK | clean build **20,208,607 bytes**, SHA-256 `1bd895ddea7a0f3ee27ae976feeddfd63d0b419e31976a5a6f5b99b1ec038af8` |
| Instrumented | none — there is no transport to instrument, and no handset was attached |

## Not verified / limits

- **No end-to-end transfer exists.** The protocol has never run over a real link, so latency, MTU,
  reconnection behaviour, pairing UX and radio permission flows are all unknown, not merely untested.
- KTX1 provides no forward secrecy against a peer that later reveals its long-term identity key, no
  certificate-based trust, and no out-of-band channel other than the fingerprint the user compares.
- Discovery is not implemented: no BLE advertising, no Wi-Fi Direct group owner, no NSD (which would
  need the INTERNET permission this app deliberately does not hold).
- The resume contract is defined and parsed but no implementation consumes it yet.
- No independent security review. **AUDIT_PENDING.**

## Exact owner action required

Two KNOUX handsets, physically present and paired, with a real channel implemented and its permission
declared (`BLUETOOTH_CONNECT` for RFCOMM, or `NEARBY_WIFI_DEVICES` for Wi-Fi Direct). Until then TASK 22
stays BLOCKED by design, and the app says so on screen.
