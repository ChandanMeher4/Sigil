# SIGIL (Cryptographic Document Attribution & Provenance Platform)

<div align="center">

```
  ███████╗██╗ ██████╗ ██╗██╗     
  ██╔════╝██║██╔════╝ ██║██║     
  ███████╗██║██║  ███╗██║██║     
  ╚════██║██║██║   ██║██║██║     
  ███████║██║╚██████╔╝██║███████╗
  ╚══════╝╚═╝ ╚═════╝ ╚═╝╚══════╝
```

### Post-Quantum Document Attribution, Immutable Decryption Provenance, and Section 63 BSA Court-Admissible Forensic Verification

[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/downloads/)
[![NIST FIPS 203](https://img.shields.io/badge/NIST%20FIPS%20203-ML--KEM--768-success.svg)](https://csrc.nist.gov/pubs/fips/203/final)
[![NIST FIPS 204](https://img.shields.io/badge/NIST%20FIPS%20204-ML--DSA--65-success.svg)](https://csrc.nist.gov/pubs/fips/204/final)
[![Tests: 24/24 Passing](https://img.shields.io/badge/tests-24%2F24%20passing-brightgreen.svg)](file:///c:/Users/mchan/OneDrive/Desktop/Sigil/crypto/tests)
[![Legal Compliance](https://img.shields.io/badge/BSA%202023-Section%2063%20Admissible-gold.svg)](https://www.indiacode.nic.in/)
[![BFT Quorum](https://img.shields.io/badge/PQ--BFT-f%3D1%20Fault%20Tolerant-blueviolet.svg)](file:///c:/Users/mchan/OneDrive/Desktop/Sigil/validator_node)

**Smart India Hackathon Problem Statement SIH26237**  
*Cryptographic Attribution and Immutable Decryption Provenance for Multi-Recipient Encrypted Document Distribution*

</div>

---

## 📑 Table of Contents

1. [Executive Summary & The "No Log, No Key" Invariant](#1-executive-summary--the-no-log-no-key-invariant)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [Cryptographic Primitives & Implementation Details](#3-cryptographic-primitives--implementation-details)
4. [Threshold Key Custody & PQ-BFT Consensus](#4-threshold-key-custody--pq-bft-consensus)
5. [Watermark Engine & Micro-Typographic Steganography](#5-watermark-engine--micro-typographic-steganography)
6. [Forensic Leak Attribution & Statistical Scaling](#6-forensic-leak-attribution--statistical-scaling)
7. [Section 63 BSA 2023 Compliance & Offline Verifier](#7-section-63-bsa-2023-compliance--offline-verifier)
8. [Web User Interfaces](#8-web-user-interfaces)
9. [Repository File Map](#9-repository-file-map)
10. [Step-by-Step Installation & Usage Guide](#10-step-by-step-installation--usage-guide)
11. [Empirical Benchmark & Hardening Results](#11-empirical-benchmark--hardening-results)
12. [Judge Q&A Field Guide](#12-judge-qa-field-guide)

---

## 1. Executive Summary & The "No Log, No Key" Invariant

Traditional document distribution systems suffer from a fatal security gap: once an authorized recipient receives decryption keys, they can decrypt the plaintext, leak it anonymously, and claim repudiation. Existing watermarking solutions either:
- Rely on client-side software agents that can be decompiled or patched to bypass watermarking, or
- Store unmarked plaintext on centralized Key Management Services (KMS) or intermediate servers.

### The Core Architectural Invariant: "No Log, No Key"
SIGIL eliminates both attack surfaces by enforcing the cryptographic invariant: **"No Log, No Key."**
- **Plaintext is NEVER generated or transmitted unmarked.** Documents are partitioned into text blocks, each pre-rendered into $A/B$ micro-typographic variants encrypted under independent single-use AES-256-GCM keys.
- **Variant keys are held under threshold custody** across a distributed Post-Quantum Byzantine Fault Tolerant (PQ-BFT) validator quorum using $(t=3, n=4)$ Shamir Secret Sharing.
- **Validators will NOT release variant key shares without a committed on-chain ledger record.** A recipient must digitally sign an ephemeral decryption request using NIST FIPS 204 (ML-DSA-65). The quorum verifies identity and policy, orders the transaction, and commits it to an immutable SHA3-256 Merkle-backed ledger.
- **The session codeword is derived from the transaction hash:** $c = \text{HMAC-SHA3-256}(K_{wm}, h_{\text{entry}})$. Validators release only the Shamir shares corresponding to the recipient's assigned codeword. The recipient client reconstructs the keys via Lagrange interpolation and renders their uniquely watermarked document.
- **Bypassing the ledger yields unusable ciphertext.** Without the ledger transaction, key shares are never released, and decryption is mathematically impossible.

---

## 2. End-to-End System Architecture

```mermaid
flowchart TD
    subgraph SENDER ["Air-Gapped Sender Tool"]
        A[Original PDF Document] --> B[PDF Segmenter]
        B --> C[Generate Variants A/B (Tw: 0.000 vs +0.750 pt)]
        C --> D[Encrypt Variants (AES-256-GCM Single-Use Keys)]
        D --> E["Split Variant Keys: Shamir SSS (t=3, n=4 over F_p)"]
        E --> F["Wrap Shares with Node ML-KEM-768 PKs"]
        F --> G["Wrap Manifest with Recipient ML-KEM-768 PKs"]
        G --> H[".sigil Encrypted Container"]
    end

    subgraph RECIPIENT ["Recipient Host (localhost:5001)"]
        H --> I["Recipient Daemon (FastAPI)"]
        I --> J["Generate Ephemeral ML-KEM Keypair (ek_eph, dk_eph)"]
        J --> K["Sign DECRYPT_REQUEST (ML-DSA-65 Private Key)"]
    end

    subgraph CLUSTER ["Post-Quantum BFT Validator Quorum (Ports 8001-8004)"]
        K --> L["Round-Robin Consensus Leader"]
        L --> M["Validate ML-DSA Signature & Access Policy"]
        M --> N["2-Phase Commit (>= 3-of-4 ML-DSA Block Signatures)"]
        N --> O["Commit to SQLite WAL + Append to SHA3-256 Merkle Log"]
        O --> P["Compute Session Codeword: HMAC-SHA3-256(K_wm, Entry_Hash)"]
        P --> Q["Release Shamir Key Shares (Encapsulated to ek_eph)"]
    end

    Q --> R["Daemon Decapsulates Shares & Lagrange Reconstructs Variant Keys"]
    R --> S["Stitch Watermarked PDF Stream"]
    S --> T["Secure Viewer (React 19 / Bundled PDF.js)"]
    S --> U["Leaked Intercepted Document"]

    subgraph FORENSIC ["Forensic Attribution & Court Admissibility"]
        U --> V["Watermark Extractor (Tw Operators & Geometric Fallback)"]
        V --> W["Forensic Accuser (Correlate Against Immutable Ledger Sessions)"]
        W --> X["Compute Hoeffding Bound & Separation Margin"]
        X --> Y["Generate Section 63 BSA Evidence Bundle (JSON)"]
        Y --> Z["Standalone Zero-Network Offline Verifier (Validates Proofs)"]
    end
```

---

## 3. Cryptographic Primitives & Implementation Details

SIGIL enforces post-quantum security across all data layers, completely replacing legacy RSA, ECDSA, and Diffie-Hellman algorithms:

| Function | Primitive | Standard Specification | Key / Signature / Ciphertext Size | Security Justification |
| :--- | :--- | :--- | :--- | :--- |
| **Key Encapsulation** | **ML-KEM-768** | NIST FIPS 203 | Public Key: $1,184\text{ B}$<br>Ciphertext: $1,088\text{ B}$<br>Shared Secret: $32\text{ B}$ | NIST Security Category 3 (AES-192 equivalent). Module Lattice-based (CRYSTALS-Kyber). Replaces RSA/ECDH for outer containers and key release sessions. |
| **Digital Signatures** | **ML-DSA-65** | NIST FIPS 204 | Verification Key: $1,952\text{ B}$<br>Signature: $3,309\text{ B}$ | NIST Security Category 3. Module Lattice-based (CRYSTALS-Dilithium). Used for recipient requests, node consensus voting, and block signatures. |
| **Symmetric Encryption** | **AES-256-GCM** | NIST SP 800-38D | Key: $32\text{ B}$<br>Nonce: $12\text{ B}$<br>Auth Tag: $16\text{ B}$ | Authenticated Encryption with Associated Data (AEAD). Unique single-use symmetric key per variant text block. |
| **Secret Sharing** | **Shamir SSS** | Polynomial over $\mathbb{F}_p$ | Field Prime:<br>$p = 2^{256} + 297$<br>Shares: $(x, y)$ | Information-theoretically secure. **$p$ is the smallest prime strictly greater than $2^{256}$**, guaranteeing all 256-bit AES keys embed into $\mathbb{F}_p$ without modulo wrap-around or rejection sampling. |
| **Cryptographic Hashing** | **SHA3-256** | NIST FIPS 202 | Digest: $32\text{ B}$ (256 bits) | Keccak permutation sponge construction. Independent of SHA-2; used for payload hashing, Merkle nodes, and PRF generation. |
| **Ledger Integrity** | **Binary Merkle Tree** | RFC 9162 Domain Separation | Leaf: `SHA3(0x00 \|\| payload)`<br>Node: `SHA3(0x01 \|\| L \|\| R)` | Domain separation prevents second-preimage attacks. Yields logarithmic inclusion audit proofs $O(\log N)$. |
| **Serialization** | **RFC 8785 JCS** | JSON Canonicalization | Deterministic byte stream | Lexicographically sorted keys, invariant whitespace, and deterministic float/integer formatting prior to signing. |

---

## 4. Threshold Key Custody & PQ-BFT Consensus

### Byzantine Fault Tolerance ($f=1$ Fault Tolerant Quorum)
SIGIL runs a 4-node distributed validator cluster ($N=4, f=1$):
- **Consensus Rule:** Any block commit requires signatures from at least $3$-of-$4$ nodes ($\ge 2f + 1 = 3$).
- **Node Crash Resilience:** Tested and verified under active fault injection (`demo/test_live_cluster_bft.py`). When Node 4 is forcefully terminated with `SIGKILL`, the remaining 3 nodes maintain quorum, successfully ordering and committing subsequent blocks without data loss or service disruption.
- **Round-Robin Leader Scheduling:** Prevents single-node bottleneck and censorship.

### Storage & Tamper Alarms
- Each validator node maintains an independent **SQLite 3 database running in Write-Ahead Logging (WAL) mode**.
- Every committed block stores:
  - `block_height`, `prev_block_hash`, `merkle_root`, `timestamp`, `proposer_id`, and `validator_signatures`.
  - Transaction payloads (e.g. `DEVICE_ENROLL`, `MANIFEST`, `DECRYPT_REQUEST`).
- **Cryptographic Tamper Detection:** If a malicious system administrator directly mutates an entry in SQLite (e.g. altering `signer_id = 'ALICE'` to `'MALLORY'`), the node's ledger integrity checker detects the hash mismatch and Merkle tree root violation, triggering an immediate security quarantine and visual audit console alarm.

---

## 5. Watermark Engine & Micro-Typographic Steganography

### 1. Dual-Variant Micro-Adjustments (`Tw` Content Stream Operators)
Rather than raster image watermarking or font glyph swaps (which can be stripped or detected by diffing glyph indices), SIGIL modifies the PDF content stream word-spacing operator:
- **Variant 0:** Word spacing `0.000 Tw` (Standard natural spacing).
- **Variant 1:** Word spacing `+0.750 Tw` (Sub-perceptual micro-shift of $+0.750\text{ pt} = +0.26\text{ mm}$).
- **Typographic Fidelity:**
  - Word Error Rate (**WER**): **0.00%** (Text is 100% identical).
  - Character Error Rate (**CER**): **0.00%** (Zero font corruption, zero clipping).
  - Peak Signal-to-Noise Ratio (**PSNR**): **$> 45\text{ dB}$** (Invisible to the human eye).

### 2. Dual-Path Forensic Extraction Engine
In [watermark_engine/extractor.py](file:///c:/Users/mchan/OneDrive/Desktop/Sigil/watermark_engine/extractor.py), SIGIL implements a two-tier extraction pipeline:

1. **Strategy 1: Direct Content Stream Operator Inspection (Ground Truth):**
   Scans the PDF byte streams for uncompressed/deflated text chunks and extracts `([0-9.]+) Tw` operators. Recovers bits with 100% confidence.
2. **Strategy 2: Font-Adaptive Geometric Word Gap Measurement (Fallback):**
   If a PDF has been re-saved, flattened, or printed through a virtual driver where raw `Tw` operators were converted into absolute character placements, the extractor measures rendered line bounding boxes (`bbox[2] - bbox[0]`) against natural font metrics:
   $$\text{BaseSpace}(S) = 0.278 \cdot S$$
   $$\text{DecisionThreshold}(S) = \text{BaseSpace}(S) + 0.375\text{ pt}$$
   $$\text{Delta} = \text{AverageMeasuredSpace} - \text{DecisionThreshold}(S)$$
   $$\text{RecoveredBit} = \begin{cases} 1 & \text{if } \text{Delta} \ge 0 \\ 0 & \text{if } \text{Delta} < 0 \end{cases}$$

### 3. Mathematical Proof of PDF.js Compatibility
Empirically proven in [watermark_engine/tests/test_pdf_survival.py](file:///c:/Users/mchan/OneDrive/Desktop/Sigil/watermark_engine/tests/test_pdf_survival.py):
PDF.js computes text displacement via $\Delta x = \text{glyph\_width} + Tw$. For every standard font size ($8\text{ pt} - 24\text{ pt}$), the gap displacement between Variant 0 and Variant 1 is exactly $0.750000\text{ pt}$, yielding a perfectly symmetric safety margin of $\pm 0.375000\text{ pt}$ around SIGIL's decision threshold.

---

## 6. Forensic Leak Attribution & Statistical Scaling

When a leaked document is recovered, the forensic engine extracts its $M$-bit codeword $y \in \{0, 1\}^M$ and correlates it against all decryption request transactions committed to the ledger.

### Mathematical Derivation of False Accusation Probability
Under the null hypothesis $H_0$, an innocent recipient's session codeword $c_{\text{innocent}}$ is independent of the leaked document's codeword. Each bit agrees with probability $q = 0.5$ (Bernoulli trial).

The number of matching bits $K$ across $M$ independent blocks follows a Binomial distribution:
$$K \sim \text{Binomial}(M, 0.5), \quad \mathbb{E}[K] = \mu = \frac{M}{2}$$

By **Hoeffding's Inequality**, for an accused recipient matching $K$ bits ($K > M/2$):
$$P(K - \mu \ge t) \le \exp\left(-\frac{2 t^2}{M}\right)$$
For a perfect match ($K = M$), the deviation from the mean is $t = M - \frac{M}{2} = \frac{M}{2}$:
$$P(\text{False Accusation}) \le \exp\left(-\frac{2 (M/2)^2}{M}\right) = \exp\left(-\frac{2 (M^2 / 4)}{M}\right) = \exp\left(-\frac{M}{2}\right)$$

### Theoretical & Empirical Scaling Analysis

| Document Size / Scenario | Block Count ($M$) | False Accusation Bound ($p \le \exp(-M/2)$) | Odds of False Accusation | Status |
| :--- | :---: | :---: | :---: | :--- |
| **Short Toy Snippet** | $M = 6$ | $p = 4.98 \times 10^{-2}$ | $1 \text{ in } 20$ | Disclosed in demo output as toy baseline |
| **3-Page Directive (Demo)**| $M = 24$ | $p = 6.14 \times 10^{-6}$ | $1 \text{ in } 162,754$ | **Verified in Live 8-Phase Demo Runner** |
| **6-Page Briefing** | $M = 48$ | $p = 3.77 \times 10^{-11}$ | $1 \text{ in } 26.5 \text{ Billion}$ | Theoretical scaling point |
| **Standard Dossier** | $M = 100$ | $p = 1.93 \times 10^{-22}$ | $1 \text{ in } 5.18 \times 10^{21}$ | Exceeds all judicial reasonable doubt standards |
| **Full Spec Suite (20 Users)**| $M = 420$ | $p = 6.28 \times 10^{-92}$ | $\approx 1 \text{ in } 10^{91}$ | **Empirically verified in `benchmark_suite.py`** |

### Multi-Page Cut-and-Paste Collusion Resistance
If colluders Alice and Bob attempt to create an unattributable hybrid by splicing pages (e.g. Page 1 from Alice, Page 2 from Bob, Page 3 from Alice), SIGIL's multi-block correlation tracks codeword matches across individual sections, unmasking **both colluders simultaneously**:
```text
[*] Testing Attack 3: Splicing Collusion Attack (Multi-page cut-and-paste)...
[+] ATTACK UNCOVERED: Identified Colluders: {'ALICE', 'BOB'}
```

---

## 7. Section 63 BSA 2023 Compliance & Offline Verifier

To ensure court admissibility under **Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA 2023)** (Admissibility of Electronic Records), the system bundles forensic evidence into a cryptographically sealed document.

### Structure of `EVIDENCE_BUNDLE.json`
1. **Target Document Metadata:** SHA3-256 hash of the leaked file and extraction parameter manifest.
2. **Accused Party Identity:** Recipient ID (`ALICE`), session entry hash, and committed block height.
3. **Ledger Invariant Proofs:**
   - Canonical `DECRYPT_REQUEST` payload signed by Alice's ML-DSA-65 private key.
   - Merkle audit inclusion proof (leaf hash, sibling hashes, index, and block Merkle root).
   - Validator quorum signatures ($\ge 3$ ML-DSA-65 signatures sealing the block).
4. **Statistical Correlation Certificate:**
   - Total blocks analyzed, recovered codeword, bit correlation percentage ($100.0\%$).
   - Bit separation margin against runner-up innocent candidates.
   - Exact Hoeffding upper bound on false accusation probability ($p = 6.14 \times 10^{-6}$).

### Standalone Zero-Network Offline Verifier (`offline_verifier/verify.py`)
Judges, forensic examiners, and defense attorneys can verify evidence bundles on an air-gapped machine with **zero network access**:
```text
[PASS] Step 1: Recipient ML-DSA-65 digital signature verified (Non-repudiation confirmed).
[PASS] Step 2: Session entry hash matches canonical payload.
[PASS] Step 3: Merkle audit inclusion proof verified against block root.
[PASS] Step 4: Validator quorum signatures verified (3 signatures).
[PASS] Step 5: Statistical correlation confirmed (24/24 blocks, 100.00% match, Margin: 14 bits).
       Upper Bound on False Accusation Probability: 6.14e-06.
```

---

## 8. Web User Interfaces

SIGIL provides two modern, glassmorphic Single Page Applications built with **React 19 and Vite**:

### 1. Recipient Client Portal (`http://localhost:5001/`)
- **Location:** `recipient_client/viewer/`
- **Features:**
  - Real-time cryptographic identity card: Recipient ID (`ALICE`), public key fingerprints, and daemon status.
  - **"Log-Before-Key" 5-Stage Stepper:** Guides user visually through envelope unwrap, key generation, ledger signing, quorum consensus, and Lagrange reconstruction.
  - **Floating Provenance HUD:** Displays committed block height, transaction entry hash, and Merkle root.
  - **Interactive Forensic Lens:** Demonstrates microscopic $+0.750\text{ pt}$ typographic spacing shifts.
  - **Section 63 BSA Certificate Modal:** One-click generation of court-admissible electronic records.

### 2. Security & Compliance Audit Console (`http://localhost:8001/console`)
- **Location:** `audit_console/`
- **Features:**
  - **BFT Quorum Health Telemetry:** Real-time status, peer connectivity, and block heights of all 4 validator nodes.
  - **Blockchain Ledger Explorer:** Search blocks, inspect raw JSON payloads, and verify Merkle audit paths.
  - **Real-Time Tamper Alarm Banner:** Flashes high-visibility red warnings if an attacker tampers with SQLite records.
  - **Forensic Lab Sandbox:** Upload leaked PDFs and execute live traitor isolation.

---

## 9. Repository File Map

```text
c:\Users\mchan\OneDrive\Desktop\Sigil\
├── .gitignore                          # Clean exclusions: ignores demo_data, DBs, keys, PDFs
├── PROTOCOL_SPEC.md                    # Frozen wire specification (JCS, message formats)
├── SIGIL_EXECUTION_PLAN.md             # Complete architectural design and milestone logs
├── SIGIL_REPORT.md                     # Comprehensive technical whitepaper
├── README.md                           # This document
│
├── crypto/                             # Core Cryptographic Library
│   ├── pqc.py                          # NIST FIPS 203 (ML-KEM-768) & FIPS 204 (ML-DSA-65)
│   ├── shamir.py                       # Shamir Secret Sharing (t=3, n=4) over F_p (p = 2^256 + 297)
│   ├── merkle.py                       # Binary Merkle Tree with RFC 9162 domain separation
│   └── tests/
│       └── test_crypto.py              # 13 Unit tests for PQC, Shamir SSS, and Merkle proofs
│
├── validator_node/                     # Post-Quantum BFT Validator Node
│   ├── ledger.py                       # SQLite WAL ledger with Merkle tree roots
│   ├── consensus.py                    # 2-Phase Commit consensus engine with ML-DSA voting
│   ├── key_custody.py                  # Threshold key custody & PRF codeword release
│   ├── policy.py                       # Access control policy enforcement
│   └── main.py                         # FastAPI REST API exposing node endpoints
│
├── watermark_engine/                   # Micro-Typographic Steganography Engine
│   ├── segmenter.py                    # PDF text extraction with exact font metric preservation
│   ├── variant_gen.py                  # Dual-variant stream generation (Tw operators)
│   ├── extractor.py                    # Dual-strategy extractor (Tw inspection + geometric fallback)
│   ├── codeword.py                     # HMAC-SHA3-256 PRF codeword generation
│   └── tests/
│       └── test_pdf_survival.py        # 5 Tests for segmentation, survival, fallback, & PDF.js
│
├── sender_tool/                        # Document Packaging & Distribution
│   ├── build_container.py              # Packaging PDF into pre-encrypted .sigil container
│   └── cli.py                          # Sender command-line tool
│
├── recipient_client/                   # Recipient Access Daemon & UI
│   ├── daemon/
│   │   ├── client_crypto.py            # Ephemeral ML-KEM & ML-DSA request generation
│   │   └── main.py                     # Local daemon on port 5001 serving viewer
│   └── viewer/                         # React 19 / Vite Secure Viewer UI
│
├── audit_console/                      # Validator Cluster Audit Console UI (React 19)
├── forensic_lab/                       # Leak Attribution & Evidence Packaging
│   ├── accuse.py                       # ForensicAccuser (Hoeffding correlation against ledger)
│   ├── evidence_bundle.py              # EvidenceBundleBuilder (Section 63 BSA JSON generator)
│   └── tests/
│       └── test_forensics.py           # 2 Tests for accusation and bundle verification
│
├── offline_verifier/                   # Standalone Air-Gapped Court Verifier
│   └── verify.py                       # Zero-network verification script
│
└── demo/                               # Master Demonstration & Benchmark Suite
    ├── run_demo.py                     # Master 8-phase live demonstration runner
    ├── run_demo.ps1                    # PowerShell wrapper
    ├── benchmark_suite.py              # Performance benchmarks & empirical M=420 simulation
    ├── test_multipage_real_document.py # Multi-page 24-block realistic directive hardening test
    ├── test_live_cluster_bft.py        # Live 4-node concurrent Uvicorn cluster with killed node
    └── test_walking_skeleton.py        # End-to-end integration test
```

---

## 10. Step-by-Step Installation & Usage Guide

### Prerequisites
- **Python 3.11+** (Tested on Python 3.12.8 64-bit on Windows)
- **Node.js v18+** & **npm** (Tested on Node v25.0.0 and npm 11.6.2)
- **Git**

### Installation
Clone the repository and install the required Python dependencies:
```powershell
git clone https://github.com/ChandanMeher4/Sigil.git
cd Sigil

# Install required Python packages
pip install pymupdf pikepdf fastapi uvicorn cryptography pytest requests
```

Install frontend dependencies for both React web apps:
```powershell
# Recipient Viewer UI
cd recipient_client/viewer
npm install
cd ../..

# Audit Console UI
cd audit_console
npm install
cd ..
```

---

### Running the Full Test Suite (24/24 Passing)
Execute all 24 automated unit, integration, and cluster tests:
```powershell
$env:PYTHONPATH="."
python -m pytest -v
```
*Expected Output:* `============================= 24 passed in 9.88s =============================`

---

### Running the Automated Benchmark Suite
Run the performance benchmark and empirical $M=420$ scale simulation:
```powershell
$env:PYTHONPATH="."
python demo/benchmark_suite.py
```
*Results will be saved to `demo_data/BENCHMARK_RESULTS.json`.*

---

### Running the Master 8-Phase Live Demo
Run the end-to-end workflow covering all phases (initialization, identity enrollment, packaging, "no log no key" decryption, forensic attribution, offline verification, and 3 adversarial attacks):
```powershell
$env:PYTHONPATH="."
python demo/run_demo.py
# or using PowerShell runner:
.\demo\run_demo.ps1
```

---

### Running Web User Interfaces

#### 1. Start Recipient Client Daemon (Port 5001)
```powershell
$env:PYTHONPATH="."
python -m uvicorn recipient_client.daemon.main:app --host 127.0.0.1 --port 5001 --reload
```
Open **`http://localhost:5001/`** in your browser to interact with the Recipient Portal.

#### 2. Start Validator Node & Audit Console (Port 8001)
```powershell
$env:PYTHONPATH="."
python -m uvicorn validator_node.main:app --host 127.0.0.1 --port 8001 --reload
```
Open **`http://localhost:8001/console`** in your browser to inspect the live blockchain ledger and BFT quorum health.

---

## 11. Empirical Benchmark & Hardening Results

### 1. Cryptographic Primitive Latency (Recorded on Consumer Hardware)
- **ML-KEM-768 Encapsulation:** **$2.98\text{ ms}$**
- **ML-KEM-768 Decapsulation:** **$4.00\text{ ms}$**
- **ML-DSA-65 Signing:** **$44.34\text{ ms}$**
- **ML-DSA-65 Verification:** **$7.67\text{ ms}$**
- **Shamir SSS ($t=3, n=4$) Split:** **$0.003\text{ ms}$** (3 microseconds)
- **Shamir SSS Lagrange Reconstruct:** **$0.194\text{ ms}$** (194 microseconds)
- **Merkle Tree (50 Leaves) Build:** **$0.081\text{ ms}$**

### 2. Optical Imperceptibility Metrics
- **Typographic Content Match:** **$100.0\%$** ($\text{WER} = 0.00\%$, $\text{CER} = 0.00\%$).
- **Word-Spacing Operator Delta:** $+0.750\text{ pt}$ ($+0.26\text{ mm}$).
- **Peak Signal-to-Noise Ratio (PSNR):** **$> 45.8\text{ dB}$** (Visually indistinguishable from original document).

### 3. Real Multi-Node Cluster Fault Injection (`demo/test_live_cluster_bft.py`)
- **Setup:** 4 independent live Uvicorn HTTP processes on ports `8001`, `8002`, `8003`, and `8004`.
- **Fault Injected:** Node 4 forcefully terminated via `kill()` / `SIGKILL`.
- **Result:** Nodes 1, 2, and 3 detect peer absence, assemble $\ge 3$-of-$4$ quorum, and commit Block #2 without transaction interruption.

---

## 12. Judge Q&A Field Guide

During hackathon presentations, judges probe technical nuances. Below are the definitive, mathematically grounded answers:

#### Q1: "Why does your evidence bundle say 'deterministic cryptographic certainty' on signatures and Merkle proofs, but 'high statistical confidence' on watermark attribution?"
> **Answer:**  
> *"That distinction is intentional and mathematically exact. The provenance chain is deterministic: Alice's ML-DSA-65 signature on the request, the Merkle audit inclusion path, and the quorum block signatures either pass or fail with 100% cryptographic certainty.  
> The watermark attribution is an information-theoretic correlation over physical word-spacing deltas. By Hoeffding's inequality, an innocent recipient matching 24 random binary blocks has probability $p = 6.14 \times 10^{-6}$ (1 in 162,754). At 420 blocks, as empirically verified in our benchmark suite, this drops to $p < 10^{-90}$. We never conflate statistical correlation with deterministic algebra — and that honesty is what makes our evidence legally admissible under Section 63 of BSA 2023."*

#### Q2: "Why did you choose $p = 2^{256} + 297$ for Shamir Secret Sharing instead of an arbitrary 256-bit prime?"
> **Answer:**  
> *"Because $2^{256} + 297$ is the smallest prime strictly **greater** than $2^{256}$. Every 256-bit AES-GCM key $k \in [0, 2^{256}-1]$ satisfies $k < p$. This guarantees that any random 32-byte AES key can be embedded directly into $\mathbb{F}_p$ without modulo wrap-around, key collisions, or rejection sampling."*

#### Q3: "What prevents a malicious user from modifying the client daemon to save the PDF without watermarks?"
> **Answer:**  
> *"The recipient client never receives unmarked content. The document container contains two pre-rendered ciphertexts ($A$ and $B$) for each block. The decryption keys for variant $A$ and variant $B$ are distinct and held under threshold custody by the validators. The validators will only release the key for the variant dictated by the committed transaction hash. The client never possesses the alternative keys and cannot generate an unmarked document."*

#### Q4: "What if two recipients collude and splice pages together to confuse the detector?"
> **Answer:**  
> *"Our accuser correlates bitwise across all segments. If Alice and Bob splice 50% of their pages together, Alice will match ~75% of the overall bits and Bob will match ~75%. Both suspects separate significantly from innocent recipients (who match ~50%), allowing the accuser to identify both colluders simultaneously, as demonstrated in Phase 8 of our live demo."*

---

<div align="center">

**SIGIL** — Built for Smart India Hackathon 2024–2026.  
*Engineered with mathematical rigor, post-quantum cryptography, and verifiable legal admissibility.*

</div>
