# SIGIL // Recipient Secure Document Terminal

The **SIGIL Recipient Secure Document Terminal** is the workstation-side viewing application designed for defense officers and authorized personnel to open, decrypt, and inspect `.sigil` encrypted document containers under strict **"No Log, No Key"** cryptographic enforcement.

---

## 🛡️ Key Features

1. **Post-Quantum Cryptography (FIPS 203 & 204)**:
   - Outer container envelope is decapsulated via **NIST FIPS 203 (ML-KEM-768)**.
   - Decryption requests are signed on-device via **NIST FIPS 204 (ML-DSA-65)**.
2. **Hardware-Isolated Screen Capture Protection**:
   - Enforces Windows Win32 API `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE = 0x11)`.
   - Screenshots and screen-recording tools (OBS Studio, Zoom, Snipping Tool, Teams, PrintScreen) record only a solid black window.
3. **Log-Before-Key Custody Invariant**:
   - Keys are never stored in plaintext on disk.
   - Dual-variant text blocks are reconstructed in RAM only after a 3-of-4 PQ-BFT validator quorum commits the access request to the immutable ledger.
4. **Forensic Attribution & Section 63 BSA Evidence**:
   - Micro-typographic word-spacing modulation ($+0.750\text{ pt} / +0.26\text{ mm}$) dynamically binds the rendered document to the specific session entry hash.
   - Interactive **Forensic Watermark Lens** allows inspecting the shift matrix.
   - **Section 63 BSA Electronic Certificate** generator produces courtroom-admissible proof of electronic custody under Bharatiya Sakshya Adhiniyam, 2023.

---

## 🚀 Running the Terminal

### Option A: Via PowerShell Master Script
```powershell
.\run.ps1 -Mode reader -File "data/alice/policy_directive_2026.sigil"
```

### Option B: Direct Python Daemon & Browser Access
```powershell
# 1. Start the local daemon (Port 5001)
python -m uvicorn recipient_client.daemon.main:app --host 127.0.0.1 --port 5001

# 2. Open in your browser or desktop shell
http://127.0.0.1:5001/
```

### Option C: Developing the React Frontend
```bash
cd recipient_client/viewer
npm install
npm run dev      # Local Vite dev server on port 5173
npm run build    # Compiles to dist/ (served automatically by daemon at port 5001)
```

---

## ⚙️ Architecture & Dataflow

```
[ .sigil File ] ──> [ Local Daemon :5001 ] ──> [ ML-KEM Decapsulate K_out ]
                              │
                              ▼
                [ Sign ML-DSA-65 DECRYPT_REQUEST ]
                              │
                              ▼
           [ Commit to 4-Node BFT Quorum (:8001-:8004) ]
                              │
                              ▼
        [ Collect 3-of-4 Shamir Shares over Prime Field F_p ]
                              │
                              ▼
              [ Lagrange Interpolate Variant Keys ]
                              │
                              ▼
        [ Synthesize Watermarked In-Memory PDF Stream ]
                              │
                              ▼
            [ Hardware-Shielded Viewport (WDA_EXCLUDEFROMCAPTURE) ]
```
