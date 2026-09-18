"""Local Recipient Daemon Service for SIGIL.

Runs locally on recipient workstation (Port 5001):
- Manages recipient ML-KEM-768 and ML-DSA-65 keys in local secure storage
- Connects to Validator Quorum on closed LAN
- Submits signed DECRYPT_REQUEST transactions
- Collects and decrypts quorum key shares
- Assembles watermarked PDF in memory
- Feeds pristine PDF streams directly to local React/PDF.js viewer
"""

import os
import io
import json
import urllib.request
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .client_crypto import RecipientCryptoSession

app = FastAPI(title="SIGIL Recipient Daemon", version="2.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECIPIENT_ID = os.environ.get("SIGIL_RECIPIENT_ID", "RECIPIENT_ALICE_01")
VALIDATOR_URL = os.environ.get("SIGIL_VALIDATOR_URL", "http://127.0.0.1:8001")

session = RecipientCryptoSession(recipient_id=RECIPIENT_ID)

# In-memory document storage: doc_id -> {"pdf_bytes": bytes, "session_info": dict}
document_cache: Dict[str, Dict[str, Any]] = {}


class OpenContainerRequest(BaseModel):
    container_path: Optional[str] = None
    container_bytes_b64: Optional[str] = None
    validator_nodes: Optional[list] = None


@app.get("/api/identity")
def get_identity():
    """Return local recipient ID and public keys."""
    from crypto.pqc import b64_encode
    return {
        "recipient_id": RECIPIENT_ID,
        "ml_kem_public_key": b64_encode(session.kem_pk),
        "ml_dsa_public_key": b64_encode(session.dsa_pk),
        "keys_dir": session.keys_dir
    }


@app.post("/api/enroll_remote")
def enroll_on_ledger(validator_url: Optional[str] = None):
    """Enroll this recipient on the validator ledger."""
    v_url = validator_url or VALIDATOR_URL
    payload, sig_b64 = session.get_enroll_payload()

    req_data = json.dumps({"payload": payload, "signature_b64": sig_b64}).encode("utf-8")
    req = urllib.request.Request(
        f"{v_url}/api/enroll",
        data=req_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        res_json = json.loads(resp.read().decode("utf-8"))
        return res_json


@app.post("/api/open_document")
def open_document(req: OpenContainerRequest):
    """Open and decrypt a .sigil container file via Log-Before-Key protocol."""
    # 1. Load container bytes
    if req.container_path:
        if not os.path.exists(req.container_path):
            raise HTTPException(status_code=404, detail=f"File not found: {req.container_path}")
        with open(req.container_path, "rb") as fh:
            c_bytes = fh.read()
    elif req.container_bytes_b64:
        from crypto.pqc import b64_decode
        c_bytes = b64_decode(req.container_bytes_b64)
    else:
        raise HTTPException(status_code=400, detail="Must provide container_path or container_bytes_b64")

    # 2. Unwrap outer container key K_out
    try:
        doc_id, doc_meta, encrypted_blocks = session.unwrap_container(c_bytes)
    except Exception as e:
        raise HTTPException(status_code=403, detail=f"Failed to unwrap container: {str(e)}")

    # 3. Build canonical DECRYPT_REQUEST and sign with recipient's ML-DSA-65 key
    req_payload, sig_b64, eph_dk = session.create_decrypt_request(doc_id)

    # 4. Dispatch to validator node (or quorum)
    nodes = req.validator_nodes or [VALIDATOR_URL]
    release_bundles = []
    commit_info = None

    for node_url in nodes:
        post_data = json.dumps({"payload": req_payload, "signature_b64": sig_b64}).encode("utf-8")
        http_req = urllib.request.Request(
            f"{node_url}/api/request_decrypt",
            data=post_data,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(http_req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                release_bundles.append(data["key_release"])
                commit_info = data["commit"]
        except Exception as err:
            raise HTTPException(status_code=502, detail=f"Validator node {node_url} failed: {str(err)}")

    # 5. Reconstruct keys from Shamir shares, decrypt blocks, and assemble watermarked PDF
    try:
        pdf_bytes = session.reconstruct_and_assemble(
            doc_id=doc_id,
            doc_meta=doc_meta,
            encrypted_blocks=encrypted_blocks,
            release_bundles=release_bundles,
            ephemeral_dk_bytes=eph_dk
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document assembly failed: {str(e)}")

    # 6. Cache decrypted PDF
    document_cache[doc_id] = {
        "pdf_bytes": pdf_bytes,
        "commit_info": commit_info,
        "doc_id": doc_id
    }

    return {
        "status": "DECRYPTED_SUCCESS",
        "doc_id": doc_id,
        "session_entry_hash": commit_info["session_entry_hash"],
        "block_height": commit_info["block_height"],
        "block_hash": commit_info["block_hash"],
        "render_url": f"/api/document/{doc_id}/render"
    }


@app.get("/api/document/{doc_id}/render")
def render_document(doc_id: str):
    """Stream decrypted watermarked PDF directly to viewer."""
    if doc_id not in document_cache:
        raise HTTPException(status_code=404, detail="Document not open or session expired")
    pdf_bytes = document_cache[doc_id]["pdf_bytes"]
    return Response(content=pdf_bytes, media_type="application/pdf")


@app.get("/api/document/{doc_id}/info")
def get_document_info(doc_id: str):
    """Retrieve session provenance and tamper verification info for the viewer security badge."""
    if doc_id not in document_cache:
        raise HTTPException(status_code=404, detail="Document not open")
    return document_cache[doc_id]["commit_info"]


# Mount static viewer dist for direct browser access at http://127.0.0.1:5001/
viewer_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "viewer", "dist"))
if os.path.exists(viewer_dist):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=viewer_dist, html=True), name="viewer")

