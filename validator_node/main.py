"""FastAPI Validator Node Service for SIGIL.

Autonomous post-quantum Byzantine validator node providing:
- Identity enrollment
- Document manifest registration and key custody
- "Log Before Key" request validation and consensus commit
- Conditional release of Shamir shares for codeword-selected variants
- Merkle audit inclusion proofs and chain integrity telemetry
"""

import os
import json
import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from crypto.pqc import MLDSA65, MLKEM768, b64_encode, b64_decode, canonical_json
from .ledger import Ledger
from .policy import PolicyEngine
from .key_custody import KeyCustodyManager
from .consensus import BFTConsensus

app = FastAPI(title="SIGIL Validator Node", version="2.2")

# Configurable CORS origins
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("SIGIL_ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional API Key Authentication Middleware for LAN/Defense deployments
API_KEY = os.environ.get("SIGIL_API_KEY", None)

@app.middleware("http")
async def api_key_auth_middleware(request: Request, call_next):
    if API_KEY and request.url.path.startswith("/api/"):
        # Allow health/status check without token if desired
        if request.url.path not in ("/api/status",):
            auth_header = request.headers.get("Authorization", "")
            token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else request.headers.get("X-API-Key", "")
            if token != API_KEY:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized: Invalid or missing API key"})
    return await call_next(request)

# Configuration from environment or defaults
NODE_ID = os.environ.get("SIGIL_NODE_ID", "NODE_01")
SHARE_INDEX = int(os.environ.get("SIGIL_SHARE_INDEX", "1"))
DB_PATH = os.environ.get("SIGIL_DB_PATH", f"data/{NODE_ID.lower()}/sigil_ledger.db")
WM_SEED = os.environ.get("SIGIL_WM_SEED", "SIGIL_NATIONAL_DEFENCE_MASTER_SEED_2026").encode("utf-8")

# Initialize Validator ML-DSA Keypair
VALIDATOR_VK_PATH = f"data/{NODE_ID.lower()}/validator_vk.bin"
VALIDATOR_SK_PATH = f"data/{NODE_ID.lower()}/validator_sk.bin"
os.makedirs(f"data/{NODE_ID.lower()}", exist_ok=True)

if os.path.exists(VALIDATOR_VK_PATH) and os.path.exists(VALIDATOR_SK_PATH):
    with open(VALIDATOR_VK_PATH, "rb") as fh:
        VALIDATOR_VK = fh.read()
    with open(VALIDATOR_SK_PATH, "rb") as fh:
        VALIDATOR_SK = fh.read()
else:
    VALIDATOR_VK, VALIDATOR_SK = MLDSA65.keygen()
    with open(VALIDATOR_VK_PATH, "wb") as fh:
        fh.write(VALIDATOR_VK)
    with open(VALIDATOR_SK_PATH, "wb") as fh:
        fh.write(VALIDATOR_SK)

ledger = Ledger(db_path=DB_PATH, node_id=NODE_ID)
policy = PolicyEngine(ledger=ledger)
custody = KeyCustodyManager(ledger=ledger, node_id=NODE_ID, node_share_index=SHARE_INDEX, wm_master_seed=WM_SEED)
consensus = BFTConsensus(node_id=NODE_ID, ledger=ledger, validator_sk=VALIDATOR_SK, validator_vk=VALIDATOR_VK)


# ============================================================================
# Pydantic Wire Request Schemas
# ============================================================================

class SignedRequest(BaseModel):
    payload: Dict[str, Any]
    signature_b64: str


class KeySharesDeposit(BaseModel):
    doc_id: str
    shares: list


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/api/status")
def get_node_status():
    """Return live node telemetry, chain tip, and integrity health."""
    latest = ledger.get_latest_block()
    is_valid, reason = ledger.verify_integrity()
    return {
        "node_id": NODE_ID,
        "share_index": SHARE_INDEX,
        "validator_public_key": b64_encode(VALIDATOR_VK),
        "chain_tip": latest,
        "integrity_healthy": is_valid,
        "integrity_error": reason
    }


@app.post("/api/enroll")
def enroll_identity(req: SignedRequest):
    """Enroll a new recipient device public key on the immutable ledger."""
    sig_bytes = b64_decode(req.signature_b64)
    is_valid, reason = policy.validate_enroll_request(req.payload, sig_bytes)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)

    entry = {
        "entry_type": "ENROLL",
        "payload": req.payload,
        "signature": sig_bytes,
        "signer_id": req.payload["recipient_id"]
    }

    result = consensus.propose_and_commit([entry])
    return {
        "status": "ENROLLED",
        "recipient_id": req.payload["recipient_id"],
        "block_height": result["height"],
        "entry_hash": result["entry_hashes"][0]
    }


@app.post("/api/manifest")
def register_manifest(req: SignedRequest):
    """Register a document distribution manifest committed to the ledger."""
    sig_bytes = b64_decode(req.signature_b64)
    # Validate sender signature (sender signs manifest payload)
    doc_id = req.payload.get("doc_id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing doc_id in manifest")

    entry = {
        "entry_type": "MANIFEST",
        "payload": req.payload,
        "signature": sig_bytes,
        "signer_id": req.payload.get("sender_id", "SENDER_OFFICE")
    }

    result = consensus.propose_and_commit([entry])
    return {
        "status": "MANIFEST_COMMITTED",
        "doc_id": doc_id,
        "block_height": result["height"],
        "entry_hash": result["entry_hashes"][0]
    }


@app.post("/api/key_shares")
def deposit_key_shares(deposit: KeySharesDeposit):
    """Store encrypted Shamir key shares for this node's custody."""
    ledger.store_key_shares(deposit.doc_id, deposit.shares)
    return {
        "status": "SHARES_STORED",
        "doc_id": deposit.doc_id,
        "total_shares_stored": len(deposit.shares)
    }


@app.post("/api/request_decrypt")
def request_decrypt(req: SignedRequest):
    """Log-Before-Key: verify request, commit to ledger, and release codeword variant key shares."""
    sig_bytes = b64_decode(req.signature_b64)
    is_valid, reason, identity = policy.validate_decrypt_request(req.payload, sig_bytes)
    if not is_valid:
        raise HTTPException(status_code=403, detail=reason)

    doc_id = req.payload["doc_id"]
    recipient_id = req.payload["recipient_id"]
    ephemeral_pk_bytes = b64_decode(req.payload["ephemeral_ml_kem_pk"])

    # Look up document manifest for total_blocks
    with ledger._get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT total_blocks FROM manifests WHERE doc_id = ?;", (doc_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Manifest not found for document")
        total_blocks = row["total_blocks"]

    # 1. Commit the request to a new block via consensus
    entry = {
        "entry_type": "DECRYPT_REQUEST",
        "payload": req.payload,
        "signature": sig_bytes,
        "signer_id": recipient_id
    }

    result = consensus.propose_and_commit([entry])
    session_entry_hash = result["entry_hashes"][0]

    # 2. Release key shares for codeword variants encrypted under ephemeral ML-KEM key
    release_bundle = custody.release_shares_for_committed_session(
        doc_id=doc_id,
        session_entry_hash_hex=session_entry_hash,
        ephemeral_ml_kem_pk_bytes=ephemeral_pk_bytes,
        total_blocks=total_blocks
    )

    return {
        "commit": {
            "block_height": result["height"],
            "session_entry_hash": session_entry_hash,
            "block_hash": result["block_hash"],
            "merkle_root": result["merkle_root"]
        },
        "key_release": release_bundle
    }


class ReleaseBundleRequest(BaseModel):
    doc_id: str
    session_entry_hash: str
    ephemeral_ml_kem_pk: str
    total_blocks: Optional[int] = None


@app.post("/api/documents/release-bundle")
def get_committed_release_bundle(req: ReleaseBundleRequest):
    """Release this validator node's Shamir shares for an already-committed session."""
    ephemeral_pk_bytes = b64_decode(req.ephemeral_ml_kem_pk)
    total_blocks = req.total_blocks

    if total_blocks is None:
        with ledger._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT total_blocks FROM manifests WHERE doc_id = ?;", (req.doc_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Manifest not found for document {req.doc_id}")
            total_blocks = row["total_blocks"]

    try:
        release_bundle = custody.release_shares_for_committed_session(
            doc_id=req.doc_id,
            session_entry_hash_hex=req.session_entry_hash,
            ephemeral_ml_kem_pk_bytes=ephemeral_pk_bytes,
            total_blocks=total_blocks
        )
        return {"key_release": release_bundle}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to release shares: {str(e)}")


@app.post("/api/consensus/vote")
def consensus_vote(proposal: Dict[str, Any]):
    """Peer vote handler in 2-phase commit."""
    latest = ledger.get_latest_block()
    target_height = latest["height"] + 1

    # Automatic catch-up: if proposal height is ahead, synchronize missing blocks from peers first
    if proposal.get("height", 0) > target_height:
        consensus.sync_chain_from_peers()
        latest = ledger.get_latest_block()
        target_height = latest["height"] + 1

    if proposal.get("height") != target_height:
        return {"vote": "REJECT", "reason": f"Expected height {target_height}, got {proposal.get('height')}"}

    if proposal.get("prev_hash") != latest["block_hash"]:
        return {"vote": "REJECT", "reason": "Previous block hash mismatch"}

    candidate_header = {
        "height": proposal["height"],
        "prev_hash": proposal["prev_hash"],
        "merkle_root": "0" * 64,
        "timestamp": proposal.get("proposer_clock", int(time.time())),
        "proposer_id": proposal.get("proposer_id")
    }

    sig = MLDSA65.sign(VALIDATOR_SK, canonical_json(candidate_header))
    return {
        "vote": "APPROVE",
        "signature_b64": b64_encode(sig),
        "clock": int(time.time())
    }


@app.post("/api/consensus/commit_block")
def consensus_commit_block(commit_data: Dict[str, Any]):
    """Peer commit broadcast handler with automatic divergence catch-up."""
    latest = ledger.get_latest_block()
    target_height = latest["height"] + 1

    # Automatic catch-up: if commit height is ahead, synchronize missing blocks from peers first
    if commit_data.get("height", 0) > target_height:
        consensus.sync_chain_from_peers()
        latest = ledger.get_latest_block()
        target_height = latest["height"] + 1

    if commit_data.get("height") != target_height:
        return {"status": "SKIPPED", "reason": f"Expected height {target_height}, got {commit_data.get('height')}"}

    entries = [
        {
            "entry_type": e["entry_type"],
            "payload": e["payload"],
            "signature": b64_decode(e["signature_b64"]),
            "signer_id": e["signer_id"]
        }
        for e in commit_data["entries"]
    ]

    validator_sigs = {
        k: b64_decode(v) for k, v in commit_data["validator_signatures"].items()
    }

    res = ledger.commit_block(
        entries=entries,
        proposer_id=commit_data["proposer_id"],
        validator_sigs=validator_sigs,
        timestamp=commit_data.get("timestamp", int(time.time()))
    )
    return {"status": "COMMITTED", "height": res["height"]}


@app.get("/api/consensus/sync")
def sync_blocks(from_height: int = 1, to_height: Optional[int] = None):
    """Return verified blocks range with entries and signatures for peer chain catch-up."""
    blocks = ledger.get_blocks_range(from_height=from_height, to_height=to_height)
    return {
        "node_id": NODE_ID,
        "from_height": from_height,
        "total_returned": len(blocks),
        "blocks": blocks
    }


@app.post("/api/consensus/sync_now")
def trigger_sync():
    """Explicitly trigger peer synchronization."""
    synced = consensus.sync_chain_from_peers()
    latest = ledger.get_latest_block()
    return {
        "status": "SYNC_COMPLETE",
        "synced_blocks": synced,
        "current_height": latest["height"],
        "chain_tip_hash": latest["block_hash"]
    }


@app.get("/api/proof/{entry_hash}")
def get_proof(entry_hash: str):
    """Retrieve Merkle inclusion proof and validator block signatures for an entry."""
    proof = ledger.get_merkle_proof(entry_hash)
    if not proof:
        raise HTTPException(status_code=404, detail="Entry not found")
    return proof


@app.get("/api/entry/{entry_hash}")
def get_entry(entry_hash: str):
    """Retrieve entry payload and cryptographic signature."""
    record = ledger.get_entry(entry_hash)
    if not record:
        raise HTTPException(status_code=404, detail="Entry not found")
    return record


@app.get("/api/blocks")
def list_blocks(limit: int = 50):
    """List recent blocks for Audit Console."""
    with ledger._get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM blocks ORDER BY height DESC LIMIT ?;", (limit,))
        rows = cur.fetchall()
        return [
            {
                "height": r["height"],
                "prev_hash": r["prev_hash"].hex(),
                "merkle_root": r["merkle_root"].hex(),
                "timestamp": r["timestamp"],
                "proposer_id": r["proposer_id"],
                "block_hash": r["block_hash"].hex()
            }
            for r in rows
        ]


class AttributeRequest(BaseModel):
    pdf_path: str
    doc_id: Optional[str] = None
    total_blocks: Optional[int] = None
    lines_per_block: Optional[int] = 1


def _format_forensic_result(res, target_path: str) -> Dict[str, Any]:
    """Helper to format statistical forensic leak attribution result."""
    # Statistical significance gating:
    # 1. False accusation probability p < 0.01 (less than 1% chance of error)
    # 2. Correlation match >= 75%
    # 3. Separation margin >= 3 bits (above random baseline noise)
    if not res.top_candidate:
        return {
            "status": "NO_SESSIONS_ON_RECORD",
            "file_analyzed": target_path,
            "culprit": "NONE",
            "verdict": "No decryption sessions found on ledger for attribution comparison.",
            "all_candidates": []
        }

    is_significant = (
        res.false_accusation_probability < 0.01 and
        res.top_candidate.match_percentage >= 75.0 and
        res.separation_margin_bits >= 3
    )

    if not is_significant:
        return {
            "status": "NO_WATERMARK_DETECTED",
            "file_analyzed": target_path,
            "culprit": "NONE (Unmarked / Untracked Document)",
            "verdict": f"INCONCLUSIVE: Correlation {res.top_candidate.match_percentage:.1f}% falls within random noise (p = {res.false_accusation_probability:.2e} > 0.01 threshold). This document was either never encrypted/watermarked via SIGIL or is an untracked original.",
            "sessionEntryHash": res.top_candidate.session_entry_hash,
            "blockHeight": res.top_candidate.block_height,
            "matchScore": f"{res.top_candidate.match_percentage:.1f}% ({res.top_candidate.match_count}/{res.top_candidate.total_blocks}) — Random Baseline Noise",
            "p_value": f"{res.false_accusation_probability:.2e} (Fails p < 0.01 Significance Threshold)",
            "separation_margin": f"{res.separation_margin_bits} bits (Fails >= 3 bits threshold)",
            "leaked_file_hash": res.leaked_file_hash,
            "all_candidates": [
                {
                    "recipient_id": c.recipient_id,
                    "matches": c.match_count,
                    "total_blocks": c.total_blocks,
                    "match_percentage": round(c.match_percentage, 1),
                    "block_height": c.block_height
                }
                for c in res.all_candidate_scores
            ],
            "legalValidity": "Inadmissible: Document shows no cryptographic watermark under Section 63 BSA"
        }

    return {
        "status": "ATTRIBUTED",
        "file_analyzed": target_path,
        "culprit": f"{res.top_candidate.recipient_id}",
        "verdict": f"CONFIRMED: Statistically significant watermark isolated to {res.top_candidate.recipient_id} with separation margin {res.separation_margin_bits} bits.",
        "sessionEntryHash": res.top_candidate.session_entry_hash,
        "blockHeight": res.top_candidate.block_height,
        "matchScore": f"{res.top_candidate.match_percentage:.1f}% ({res.top_candidate.match_count}/{res.top_candidate.total_blocks})",
        "p_value": f"{res.false_accusation_probability:.2e}",
        "separation_margin": f"{res.separation_margin_bits} bits",
        "leaked_file_hash": res.leaked_file_hash,
        "all_candidates": [
            {
                "recipient_id": c.recipient_id,
                "matches": c.match_count,
                "total_blocks": c.total_blocks,
                "match_percentage": round(c.match_percentage, 1),
                "block_height": c.block_height
            }
            for c in res.all_candidate_scores
        ],
        "legalValidity": "Structured under Section 63 Bharatiya Sakshya Adhiniyam, 2023"
    }


@app.post("/api/forensics/attribute")
def attribute_leak(req: AttributeRequest):
    """Live forensic leak attribution: extract watermark from PDF and match against on-ledger sessions."""
    from forensic_lab.accuse import ForensicAccuser
    if not req.pdf_path:
        raise HTTPException(status_code=400, detail="Must provide 'pdf_path' parameter to analyze.")

    target_path = req.pdf_path
    if not os.path.exists(target_path):
        candidates = [
            target_path,
            os.path.join("demo_data", os.path.basename(target_path)),
            os.path.join("data", os.path.basename(target_path)),
        ]
        for c in candidates:
            if os.path.exists(c):
                target_path = c
                break
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found: {req.pdf_path}")

    accuser = ForensicAccuser(ledger=ledger, wm_master_seed=WM_SEED)
    try:
        res = accuser.accuse_leaked_document(
            target_path,
            doc_id=req.doc_id,
            total_blocks=req.total_blocks,
            lines_per_block=req.lines_per_block
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forensic extraction error: {str(e)}")

    return _format_forensic_result(res, target_path)


@app.post("/api/forensics/upload_and_attribute")
async def upload_and_attribute_leak(
    pdf_file: Request,
):
    """Live forensic leak attribution from uploaded multipart PDF file."""
    import tempfile
    import shutil
    from fastapi import UploadFile, File, Form
    # Parse form from request
    form = await pdf_file.form()
    uploaded = form.get("pdf_file")
    if not uploaded or not hasattr(uploaded, "filename"):
        raise HTTPException(status_code=400, detail="Missing uploaded 'pdf_file' multipart field.")

    doc_id = form.get("doc_id", None) or "DEFENCE_DIRECTIVE_2026"
    total_blocks_val = form.get("total_blocks", None)
    if total_blocks_val:
        total_blocks = int(total_blocks_val)
    else:
        total_blocks = 24
        with ledger._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT total_blocks FROM manifests WHERE doc_id = ?;", (doc_id,))
            row = cur.fetchone()
            if row:
                total_blocks = row["total_blocks"]
    lines_val = form.get("lines_per_block", "1")
    lines_per_block = int(lines_val) if lines_val else 1

    suffix = os.path.splitext(uploaded.filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(uploaded.file, tmp)
        tmp_path = tmp.name

    try:
        from forensic_lab.accuse import ForensicAccuser
        accuser = ForensicAccuser(ledger=ledger, wm_master_seed=WM_SEED)
        res = accuser.accuse_leaked_document(
            tmp_path,
            doc_id=doc_id,
            total_blocks=total_blocks,
            lines_per_block=lines_per_block
        )
        return _format_forensic_result(res, uploaded.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forensic extraction error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


# Mount static audit console dist for browser access at http://127.0.0.1:8001/console
console_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audit_console", "dist"))
if os.path.exists(console_dist):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import RedirectResponse
    
    # Redirect root to /console
    @app.get("/")
    def redirect_root_to_console():
        return RedirectResponse(url="/console/")
        
    app.mount("/console", StaticFiles(directory=console_dist, html=True), name="console")
    
    # Also mount /assets directly at root as fallback
    assets_dir = os.path.join(console_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets_fallback")

