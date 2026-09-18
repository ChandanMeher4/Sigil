# SIGIL Protocol & Wire Specification (v2.1)
## Cryptographic Attribution and Immutable Decryption Provenance

**Status:** FROZEN  
**Hash Algorithm:** SHA3-256 (NIST FIPS 202)  
**Key Encapsulation:** ML-KEM-768 (NIST FIPS 203)  
**Digital Signatures:** ML-DSA-65 (NIST FIPS 204)  
**Symmetric Encryption:** AES-256-GCM (NIST SP 800-38D)  
**Secret Sharing:** Shamir SSS ($t=3, n=4$) over $\mathbb{F}_p$ with $p = 2^{256} + 297$ (smallest prime strictly $> 2^{256}$, guaranteeing all 256-bit AES keys embed into $\mathbb{F}_p$ with zero truncation, zero collision, and zero rejection sampling)  

---

## 1. Canonical Serialization Rules
1. All JSON payloads subjected to digital signing or hashing must follow **RFC 8785 (JSON Canonicalization Scheme - JCS)**:
   - UTF-8 encoding with no BOM.
   - Keys sorted lexicographically by Unicode code point.
   - No insignificant whitespace (no indent, no space after `:` or `,`).
   - Floats/integers formatted deterministically.
2. Binary fields inside JSON strings are encoded as standard Base64 (`RFC 4648`).
3. Hashes are represented as 64-character lowercase hex strings when stringified, or 32 raw bytes when stored in SQLite `BLOB`.

---

## 2. Core Wire Message Formats

### 2.1 Identity Enrollment (`ENROLL`)
Submitted by a recipient device during initial on-boarding.

#### Request Payload (`ENROLL_REQUEST`):
```json
{
  "type": "ENROLL",
  "recipient_id": "RECIPIENT_ALICE_01",
  "ml_kem_public_key": "<base64_encoded_1184_bytes>",
  "ml_dsa_public_key": "<base64_encoded_1952_bytes>",
  "timestamp": 1773880000,
  "device_fingerprint": "<hex_sha3_256>"
}
```
- **Signature:** Recipient signs `SHA3-256(canonical(ENROLL_REQUEST))` using their ML-DSA-65 private key.
- **Entry Hash:** $h_{enroll} = \text{SHA3-256}(0x00 \parallel \text{canonical}(payload) \parallel signature)$.

---

### 2.2 Document Distribution Manifest (`MANIFEST`)
Submitted by the document sender before releasing the encrypted container.

#### Request Payload (`MANIFEST_REQUEST`):
```json
{
  "type": "MANIFEST",
  "doc_id": "DOC_CABINET_2026_001",
  "container_hash": "<hex_sha3_256_of_encrypted_container>",
  "authorized_recipients": [
    "RECIPIENT_ALICE_01",
    "RECIPIENT_BOB_02",
    "RECIPIENT_CHARLIE_03"
  ],
  "total_blocks": 420,
  "expiry": 1773966400,
  "quota_per_recipient": 5,
  "timestamp": 1773880100
}
```
- **Signature:** Sender signs `SHA3-256(canonical(MANIFEST_REQUEST))` with sender's ML-DSA-65 private key.
- **Invariant:** Locks the authorized recipient list. Quorum nodes will reject any decryption request for this document from a recipient not in this list.

---

### 2.3 Decryption Request (`DECRYPT_REQUEST`)
Submitted by the recipient client to the BFT quorum to initiate decryption.

#### Request Payload (`DECRYPT_REQUEST_PAYLOAD`):
```json
{
  "type": "DECRYPT_REQUEST",
  "doc_id": "DOC_CABINET_2026_001",
  "recipient_id": "RECIPIENT_ALICE_01",
  "session_nonce": "<hex_32_bytes_random>",
  "ephemeral_ml_kem_pk": "<base64_encoded_1184_bytes>",
  "timestamp": 1773880200
}
```
- **Signature:** Recipient signs `SHA3-256(canonical(DECRYPT_REQUEST_PAYLOAD))` using their registered ML-DSA-65 private key.
- **Entry Hash:** $h_{session} = \text{SHA3-256}(0x00 \parallel \text{canonical}(payload) \parallel signature)$.
- **Non-Repudiation Invariant:** Binds the specific ephemeral ML-KEM key to the recipient's long-term identity and the session nonce.

---

### 2.4 Quorum Key Release (`KEY_RELEASE`)
Returned by each validator node $i \in \{1, 2, 3, 4\}$ **only after** the `DECRYPT_REQUEST` is committed in a block.

#### Codeword Derivation:
For block index $j \in \{0, \dots, M-1\}$:
$$c_j = \text{HMAC-SHA3-256}(K_{wm\_seed}, h_{session} \parallel j.to\_bytes(4, 'big'))[0] \pmod 2$$

#### Node Release Response (`NODE_KEY_RELEASE`):
```json
{
  "doc_id": "DOC_CABINET_2026_001",
  "session_entry_hash": "<hex_h_session>",
  "block_height": 42,
  "validator_id": "VALIDATOR_NODE_01",
  "shares": [
    {
      "block_idx": 0,
      "variant": 0,
      "share_index": 1,
      "encrypted_share": "<base64_aes_gcm_ciphertext_and_tag>"
    },
    ...
    {
      "block_idx": 419,
      "variant": 1,
      "share_index": 1,
      "encrypted_share": "<base64_aes_gcm_ciphertext_and_tag>"
    }
  ],
  "ephemeral_capsule": "<base64_encoded_1088_bytes_ml_kem_ciphertext>"
}
```
- **Security Invariant:** Each share is encrypted under a shared secret encapsulated to `ephemeral_ml_kem_pk`. Only the session that signed the request can decrypt the shares.

---

## 3. Blockchain & Consensus Wire Specification

### 3.1 Block Header
```json
{
  "height": 42,
  "prev_hash": "<hex_sha3_256_32_bytes>",
  "merkle_root": "<hex_sha3_256_32_bytes>",
  "timestamp": 1773880205,
  "proposer_id": "VALIDATOR_NODE_01"
}
```
- **Block Hash:** $H_{block} = \text{SHA3-256}(\text{canonical}(BlockHeader))$.
- **Consensus Requirement:** A block is valid if and only if it carries valid ML-DSA-65 signatures over $H_{block}$ from at least **$\ge 3$ of the 4** registered validator nodes.

### 3.2 Binary Merkle Tree
- **Leaf Hashing:** $\text{leaf\_hash} = \text{SHA3-256}(0x00 \parallel \text{entry\_bytes})$
- **Node Hashing:** $\text{node\_hash} = \text{SHA3-256}(0x01 \parallel \text{left\_child} \parallel \text{right\_child})$
- **Odd Node Handling:** If a level has an odd number of nodes, the last node is promoted to the next level without re-hashing (RFC 6962 compliant).

---

## 4. Container File Format (`.sigil`)

A `.sigil` container is a single binary file with the following layout:

```
+-------------------------------------------------------------+
| MAGIC BYTES: 'S', 'I', 'G', 'I', 'L', 0x01 (6 bytes)        |
+-------------------------------------------------------------+
| DOC ID LENGTH: uint16 (2 bytes)                             |
| DOC ID: UTF-8 string                                        |
+-------------------------------------------------------------+
| MANIFEST JSON LENGTH: uint32 (4 bytes)                      |
| MANIFEST JSON + SENDER SIGNATURE (Variable bytes)           |
+-------------------------------------------------------------+
| RECIPIENT CAPSULES SECTION:                                 |
| - NUM RECIPIENTS: uint16                                    |
| - For each recipient:                                       |
|     RECIPIENT ID LENGTH: uint16                             |
|     RECIPIENT ID: UTF-8 string                              |
|     ML-KEM CIPHERTEXT: 1088 bytes                           |
|     WRAPPED K_out: 48 bytes (AES-256-GCM + 16-byte tag)     |
+-------------------------------------------------------------+
| ENCRYPTED VARIANT BLOCKS (Under K_out + k(j, b)):           |
| - TOTAL BLOCKS: uint32                                      |
| - For block j in 0..M-1:                                    |
|     VARIANT 0 CIPHERTEXT LENGTH: uint32                     |
|     VARIANT 0 AES-GCM (Nonce 12B + Ciphertext + Tag 16B)   |
|     VARIANT 1 CIPHERTEXT LENGTH: uint32                     |
|     VARIANT 1 AES-GCM (Nonce 12B + Ciphertext + Tag 16B)   |
+-------------------------------------------------------------+
```

---

## 5. Evidence Bundle Format (`EVIDENCE_BUNDLE.json`)

Output by `forensic_lab` and verified by `offline_verifier`:

```json
{
  "version": "sigil-evidence-v1",
  "leaked_document": {
    "file_name": "leaked_cabinet_note.pdf",
    "sha3_256": "<hex_hash>",
    "total_blocks_analyzed": 420
  },
  "recovered_codeword": {
    "codeword_bits": "01101001...",
    "extraction_confidence": 0.998
  },
  "attribution": {
    "accused_recipient_id": "RECIPIENT_ALICE_01",
    "matching_score": 309,
    "total_blocks": 420,
    "match_percentage": 73.57,
    "innocent_highest_score": 225,
    "separation_margin_bits": 84,
    "false_accusation_probability_bound": "< 1e-20"
  },
  "session_provenance": {
    "session_entry_hash": "<hex_hash>",
    "decrypt_request_payload": { ... },
    "recipient_ml_dsa_signature": "<base64_3309_bytes>",
    "recipient_ml_dsa_public_key": "<base64_1952_bytes>"
  },
  "ledger_proof": {
    "block_height": 42,
    "block_hash": "<hex_hash>",
    "block_timestamp": 1773880205,
    "merkle_root": "<hex_hash>",
    "merkle_inclusion_proof": [
      { "position": "right", "hash": "<hex_sibling_hash>" },
      ...
    ],
    "validator_signatures": [
      { "validator_id": "NODE_01", "signature": "<base64_3309_bytes>", "public_key": "<base64_1952_bytes>" },
      { "validator_id": "NODE_02", "signature": "<base64_3309_bytes>", "public_key": "<base64_1952_bytes>" },
      { "validator_id": "NODE_03", "signature": "<base64_3309_bytes>", "public_key": "<base64_1952_bytes>" }
    ]
  }
}
```
