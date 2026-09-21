# SIGIL // Security Officer Command Console

The **Security Officer Command Console** is the administrative portal (`http://127.0.0.1:8000/`) for defense document authorities, enabling classified document distribution, live cluster monitoring, and forensic leak attribution.

---

## 🛡️ Core Functional Modules

1. **Dashboard & Quorum Health**:
   - 4-Node PQ-BFT cluster telemetry (proposer index, block height, hash parity).
   - Real-time ledger activity monitor showing recent blocks and committed entries.
2. **Classified Document Distribution**:
   - Upload any sensitive PDF directive.
   - Configure recipient clearances (`OFFICER_ALICE`, `OFFICER_BOB`, etc.) and text block segmentation parameters.
   - 1-click execution: segments text, pre-renders dual micro-typographic variants ($A/B$), splits keys via Shamir Secret Sharing ($t=3, n=4$), and deposits shares across the cluster.
   - Outputs the sealed `.sigil` container.
3. **Forensic Attribution Laboratory**:
   - Upload suspect PDFs or photos recovered from external channels or leaks.
   - The watermark extractor measures sub-pixel spacing shifts ($Tw$) across all text lines.
   - Evaluates bitwise correlation against every committed session on the ledger.
   - Displays a candidate correlation matrix and statistical confidence rating ($p < 10^{-6}$).
   - Exports Section 63 BSA legal evidence certificates.
4. **Document Catalog & Ledger Records**:
   - Access history of distributed manifests, block heights, and container sizes.

---

## 🚀 Development & Build

```bash
cd admin_portal/frontend
npm install
npm run dev      # Local Vite dev server on port 5173
npm run build    # Compiles to dist/ (served by FastAPI at http://127.0.0.1:8000/)
```
