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
import logging
import urllib.request
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .client_crypto import RecipientCryptoSession

logger = logging.getLogger("sigil.daemon")

app = FastAPI(title="SIGIL Recipient Daemon", version="2.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_RECIPIENT_ID = os.environ.get("SIGIL_RECIPIENT_ID", "ALICE")
VALIDATOR_URL = os.environ.get("SIGIL_VALIDATOR_URL", "http://127.0.0.1:8001")

_session_cache: Dict[str, RecipientCryptoSession] = {}


def get_recipient_session(recipient_id: Optional[str] = None, passphrase: Optional[str] = None) -> RecipientCryptoSession:
    """Retrieve or initialize a RecipientCryptoSession for the given identity and passphrase."""
    r_id = recipient_id or os.environ.get("SIGIL_RECIPIENT_ID", DEFAULT_RECIPIENT_ID)
    pw = passphrase or os.environ.get("SIGIL_KEY_PASSPHRASE", None)
    return RecipientCryptoSession(recipient_id=r_id, passphrase=pw)


def get_configured_validator_nodes(custom_nodes: Optional[list] = None) -> List[str]:
    """Resolve validator cluster URLs from parameters, environment, or peers.yml."""
    if custom_nodes and len(custom_nodes) > 0:
        return custom_nodes
    env_nodes = os.environ.get("SIGIL_VALIDATOR_NODES")
    if env_nodes:
        return [u.strip() for u in env_nodes.split(",") if u.strip()]
    peers_path = os.environ.get("SIGIL_PEERS_CONFIG", "config/peers.yml")
    if os.path.exists(peers_path):
        try:
            import yaml
            with open(peers_path, "r", encoding="utf-8") as f:
                peers = yaml.safe_load(f)
                if isinstance(peers, dict):
                    urls = [info["url"] for info in peers.values() if "url" in info]
                    if urls:
                        return urls
        except Exception:
            pass
    return [VALIDATOR_URL]


# In-memory document storage: doc_id -> {"pdf_bytes": bytes, "session_info": dict}
document_cache: Dict[str, Dict[str, Any]] = {}


class OpenContainerRequest(BaseModel):
    container_path: Optional[str] = None
    container_bytes_b64: Optional[str] = None
    validator_nodes: Optional[list] = None
    recipient_id: Optional[str] = None
    passphrase: Optional[str] = None


@app.get("/api/identity")
def get_identity(recipient_id: Optional[str] = Query(None), passphrase: Optional[str] = Query(None)):
    """Return local recipient ID and public keys."""
    from crypto.pqc import b64_encode
    session = get_recipient_session(recipient_id, passphrase)
    return {
        "recipient_id": session.recipient_id,
        "ml_kem_public_key": b64_encode(session.kem_pk),
        "ml_dsa_public_key": b64_encode(session.dsa_pk),
        "keys_dir": session.keys_dir
    }


@app.post("/api/enroll_remote")
def enroll_on_ledger(validator_url: Optional[str] = None, recipient_id: Optional[str] = None, passphrase: Optional[str] = None):
    """Enroll this recipient on the validator ledger."""
    session = get_recipient_session(recipient_id, passphrase)
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
    session = get_recipient_session(req.recipient_id, req.passphrase)

    # 1. Load container bytes
    if req.container_path:
        c_path = req.container_path
        if not os.path.exists(c_path):
            candidates = [
                os.path.join("data", session.recipient_id.lower(), "policy_directive_2026.sigil"),
                os.path.join("demo_data", "DEFENCE_DIRECTIVE_2026.sigil"),
                os.path.join("data", "DEFENCE_DIRECTIVE_2026.sigil"),
                os.path.join("demo_data", os.path.basename(c_path)),
                os.path.join("data", os.path.basename(c_path)),
            ]
            for cand in candidates:
                if os.path.exists(cand):
                    c_path = cand
                    break
        if not os.path.exists(c_path):
            raise HTTPException(status_code=404, detail=f"File not found: {req.container_path}")
        with open(c_path, "rb") as fh:
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

    # 4. Dispatch DECRYPT_REQUEST to validator node cluster
    candidate_nodes = get_configured_validator_nodes(req.validator_nodes)
    release_bundles = []
    commit_info = None
    successful_node = None

    # Step 4a: Commit request with the first available validator node
    for node_url in candidate_nodes:
        post_data = json.dumps({"payload": req_payload, "signature_b64": sig_b64}).encode("utf-8")
        http_req = urllib.request.Request(
            f"{node_url}/api/request_decrypt",
            data=post_data,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(http_req, timeout=15.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                release_bundles.append(data["key_release"])
                commit_info = data["commit"]
                successful_node = node_url
                break
        except Exception as err:
            logger.warning(f"Validator node {node_url} failed request_decrypt: {err}")
            continue

    if not commit_info:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to commit decryption request to any validator node: {candidate_nodes}"
        )

    # Step 4b: Collect remaining Shamir key shares from peer nodes over HTTP
    session_hash = commit_info["session_entry_hash"]
    ephem_pk_b64 = req_payload["ephemeral_ml_kem_pk"]

    for node_url in candidate_nodes:
        if len(release_bundles) >= 3:
            break
        if node_url == successful_node:
            continue
        try:
            req_data = json.dumps({
                "doc_id": doc_id,
                "session_entry_hash": session_hash,
                "ephemeral_ml_kem_pk": ephem_pk_b64,
                "total_blocks": len(encrypted_blocks)
            }).encode("utf-8")
            http_req = urllib.request.Request(
                f"{node_url}/api/documents/release-bundle",
                data=req_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(http_req, timeout=5.0) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if "key_release" in res_data:
                    release_bundles.append(res_data["key_release"])
        except Exception as err:
            logger.warning(f"Could not retrieve release bundle from peer {node_url}: {err}")
            continue

    # Step 4c: Threshold Shamir Reconstruction Fallback for Single-Node / Local Dev
    if len(release_bundles) < 3:
        allow_local = os.environ.get("SIGIL_ALLOW_LOCAL_FALLBACK", "false").lower() in ("true", "1", "yes")
        if allow_local and commit_info:
            from validator_node.ledger import Ledger
            from validator_node.key_custody import KeyCustodyManager
            from crypto.pqc import b64_decode
            wm_seed = b"SIGIL_NATIONAL_DEFENCE_MASTER_SEED_2026"
            for idx in [2, 3, 4]:
                if len(release_bundles) >= 3:
                    break
                p_db = f"data/node_0{idx}/sigil_ledger.db"
                if not os.path.exists(p_db):
                    p_db = f"demo_data/node_0{idx}/sigil_ledger.db"
                if os.path.exists(p_db):
                    try:
                        p_ledger = Ledger(p_db, node_id=f"NODE_0{idx}")
                        p_custody = KeyCustodyManager(p_ledger, f"NODE_0{idx}", idx, wm_seed)
                        bndl = p_custody.release_shares_for_committed_session(
                            doc_id=doc_id,
                            session_entry_hash_hex=commit_info["session_entry_hash"],
                            ephemeral_ml_kem_pk_bytes=b64_decode(req_payload["ephemeral_ml_kem_pk"]),
                            total_blocks=len(encrypted_blocks)
                        )
                        release_bundles.append(bndl)
                    except Exception:
                        pass

        if len(release_bundles) < 3:
            raise HTTPException(
                status_code=502,
                detail=f"Quorum threshold not met: collected only {len(release_bundles)}/3 Shamir key release bundles. At least 3 validator nodes must be reachable."
            )

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


@app.post("/api/document/{doc_id}/save_file")
def save_document_to_disk(
    doc_id: str,
    recipient_id: Optional[str] = Query(None)
):
    """Save the decrypted watermarked PDF directly to Downloads and demo_data directories."""
    if doc_id not in document_cache:
        raise HTTPException(status_code=404, detail="Document not open or session expired")

    pdf_bytes = document_cache[doc_id]["pdf_bytes"]
    r_id = recipient_id or "UNKNOWN"
    filename = f"{r_id}_{doc_id}.pdf"

    saved_paths = []
    # 1. Save to Downloads folder
    downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
    if os.path.exists(downloads_dir):
        dl_path = os.path.join(downloads_dir, filename)
        with open(dl_path, "wb") as f:
            f.write(pdf_bytes)
        saved_paths.append(dl_path)

    # 2. Save to project demo_data folder
    demo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "demo_data"))
    if os.path.exists(demo_dir):
        dd_path = os.path.join(demo_dir, filename)
        with open(dd_path, "wb") as f:
            f.write(pdf_bytes)
        saved_paths.append(dd_path)

    return {
        "status": "SAVED",
        "filename": filename,
        "saved_paths": saved_paths,
        "message": f"Successfully exported watermarked PDF ({len(pdf_bytes)} bytes)"
    }


# Mount static viewer dist for direct browser access at http://127.0.0.1:5001/
viewer_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "viewer", "dist"))
if os.path.exists(viewer_dist):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=viewer_dist, html=True), name="viewer")

