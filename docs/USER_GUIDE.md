# SIGIL User & Security Officer Guide

> **SIGIL**: Post-Quantum Air-Gapped Leak-Traceable Document Distribution System  
> Designed for Smart India Hackathon (SIH26237) & Government/Defense Environments.

---

## 1. Roles & Terminology

- **Security Officer (Sender)**: Authorizes, segments, and distributes classified PDF directives to enrolled officers.
- **Recipient Officer**: Receives `.sigil` encrypted document containers, authorizes decryption via the local daemon/viewer, and reviews the content.
- **Validator Quorum**: 4 departmental nodes (IT, Security, Legal, CVO) that run Byzantine Fault Tolerant consensus to commit access records before key release.

---

## 2. Security Officer Workflow: Distributing a Document

### Step 1: Enroll Recipient Officers
Ensure the recipients are registered on the cluster:
```powershell
python -m recipient_client.daemon.main --enroll
```
Or via the daemon's `/api/enroll_remote` endpoint.

### Step 2: Package and Distribute
Run the sender CLI:
```powershell
python -m sender_tool.cli distribute `
  --pdf "docs/ClassifiedDirective.pdf" `
  --doc-id "DEFENCE_DIRECTIVE_2026" `
  --recipients "ALICE,BOB,CHARLIE" `
  --node-url "http://127.0.0.1:8001" `
  --peers-config "config/peers.yml" `
  --output "DEFENCE_DIRECTIVE_2026.sigil"
```

What happens under the hood:
1. Document is segmented into text and geometry blocks.
2. Dual variants ($Variant_0, Variant_1$) are synthesized with sub-pixel spacing shifts ($+0.75\text{ pt} / +0.26\text{ mm}$).
3. Variant keys are split into 3-of-4 Shamir secret shares.
4. Shares are distributed directly to each validator node over HTTP (`/api/key_shares`).
5. A signed `MANIFEST` transaction is committed to the blockchain.
6. The encrypted `.sigil` container is generated and ready to distribute via email, pen drive, or internal file share.

---

## 3. Recipient Officer Workflow: Opening a `.sigil` File

### Step 1: Start the Recipient Client or Native Reader
Launch the recipient terminal via PowerShell or direct executable:
```powershell
# Option A: Windows Native Reader with WDA_EXCLUDEFROMCAPTURE Hardware DRM
.\run.ps1 -Mode reader -File "data/alice/policy_directive_2026.sigil"

# Option B: Recipient Web Terminal (Local Daemon on Port 5001)
$env:PYTHONPATH="."
python -m uvicorn recipient_client.daemon.main:app --host 127.0.0.1 --port 5001
```
Open **`http://127.0.0.1:5001/`** in your browser to interact with the Recipient Secure Terminal.

### Step 2: Open and Authorize
Open the document via the Recipient Terminal web interface or API:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/open_document" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"container_path": "data/alice/policy_directive_2026.sigil", "recipient_id": "OFFICER_ALICE", "passphrase": ""}'
```

What happens under the hood:
1. **Passphrase Unlock**: Recipient's ML-DSA-65 and ML-KEM-768 private keys are unlocked from AES-256-GCM storage.
2. **Outer Unwrapping**: Outer container key $K_{out}$ is decapsulated via ML-KEM-768.
3. **Log-Before-Key**: Recipient signs a `DECRYPT_REQUEST` with their ML-DSA-65 key.
4. **BFT Quorum**: The request is committed to the blockchain by 3 of 4 validator nodes.
5. **Key Release**: Each validator node releases only the Shamir share corresponding to the recipient's assigned codeword variant.
6. **In-Memory Assembly**: The PDF is decrypted and assembled strictly in RAM and streamed to the viewer.

---

## 4. Leak Attribution & Forensics

If an unauthorized leak (e.g. photo, print scan, or leaked PDF) is discovered:

1. Open the Audit Console or execute the forensic attribution endpoint:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8001/api/forensics/attribute" `
     -Method POST `
     -ContentType "application/json" `
     -Body '{"pdf_path": "path/to/leaked_document.pdf"}'
   ```
2. The forensic lab extracts the geometric inter-word spacing shifts across all blocks.
3. The extracted bitstream is correlated against every committed session on the immutable ledger.
4. **Statistical Gating**: Attribution is only confirmed if $p < 0.01$ and correlation $\ge 75\%$, providing courtroom-admissible evidence under Section 63 of Bharatiya Sakshya Adhiniyam, 2023.
