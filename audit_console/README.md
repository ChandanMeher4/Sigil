# SIGIL // BFT Validator Quorum Audit Console

The **SIGIL Validator Quorum Audit Console** provides defense operators, compliance auditors, and system administrators with real-time insight into the Post-Quantum Byzantine Fault Tolerant (PQ-BFT) consensus cluster and immutable cryptographic ledger.

---

## 🔍 Features

1. **BFT Quorum Health Telemetry**:
   - Monitors all 4 validator nodes (ports 8001–8004).
   - Displays consensus state, active round-robin proposer, block heights, and Merkle root continuity.
2. **Blockchain Ledger Explorer**:
   - Inspects blocks and entries stored in RFC 8785 Canonical JSON format.
   - Verifies inclusion proofs using binary SHA3-256 Merkle trees with RFC 9162 domain separation (`0x00` leaves, `0x01` interior nodes).
3. **Cryptographic Tamper Detection**:
   - Verifies 4 layers of chain integrity:
     1. Payload and signature hash match.
     2. Merkle root reconstruction.
     3. Canonical block header hash.
     4. Cryptographic hash continuity (`prev_hash`).
   - Flashes high-visibility security alerts if SQLite database records are tampered with.

---

## 🚀 Running the Audit Console

```bash
cd audit_console
npm install
npm run build    # Compiles to dist/ for static hosting
```

The compiled audit console can be accessed at `http://127.0.0.1:8001/console` or via the standalone Vite development server (`npm run dev`).
