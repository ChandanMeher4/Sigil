"""Admin Portal API for SIGIL Document Distribution and Governance.

Provides REST endpoints for Security Officers:
- Upload and distribute classified documents
- Manage enrolled recipient identities
- Monitor 4-node Byzantine cluster health
- Run forensic leak attribution on suspect documents
"""

import os
import json
import shutil
import tempfile
import urllib.request
import hmac
import hashlib
import time
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from crypto.pqc import MLDSA65, MLKEM768, b64_encode, b64_decode
from sender_tool.build_container import ContainerBuilder
from validator_node.consensus import load_peer_config

app = FastAPI(title="SIGIL Admin Portal API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DISTRIBUTED_DIR = os.environ.get("SIGIL_DISTRIBUTED_DIR", "data/distributed")
PRIMARY_NODE_URL = os.environ.get("SIGIL_PRIMARY_NODE_URL", "http://127.0.0.1:8001")
AUTH_SECRET = os.environ.get("SIGIL_AUTH_SECRET", "SIGIL_OFFICER_SESSION_SECRET_2026").encode("utf-8")
DEFAULT_ADMIN_USER = os.environ.get("SIGIL_ADMIN_USER", "officer_admin")
DEFAULT_ADMIN_PASS = os.environ.get("SIGIL_ADMIN_PASSWORD", "SigilAdmin2026!#")

os.makedirs(DISTRIBUTED_DIR, exist_ok=True)

# Active session tokens: token -> {"username": str, "role": str, "created_at": float}
active_sessions: Dict[str, Dict[str, Any]] = {}


def _hash_password(password: str, salt: bytes) -> str:
    """PBKDF2-HMAC-SHA256 password hash."""
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return dk.hex()


# Default officer credentials
DEFAULT_SALT = b"SIGIL_ADMIN_SALT_2026"
OFFICER_CREDENTIALS = {
    DEFAULT_ADMIN_USER: {
        "salt": DEFAULT_SALT.hex(),
        "password_hash": _hash_password(DEFAULT_ADMIN_PASS, DEFAULT_SALT),
        "role": "SECURITY_OFFICER",
        "full_name": "Chief Security Officer"
    }
}


class LoginRequest(BaseModel):
    username: str
    password: str


def get_current_officer(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Dependency: Validate Bearer session token for Security Officer actions."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required: missing or invalid Bearer token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    token = authorization.split(" ")[1].strip()
    session = active_sessions.get(token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return session


@app.post("/api/admin/login")
def admin_login(req: LoginRequest):
    """Authenticate Security Officer with username and password."""
    user_info = OFFICER_CREDENTIALS.get(req.username)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    salt = bytes.fromhex(user_info["salt"])
    input_hash = _hash_password(req.password, salt)
    if not hmac.compare_digest(input_hash, user_info["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Generate session token: HMAC(secret, username || timestamp || nonce)
    token_seed = f"{req.username}:{time.time()}:{os.urandom(16).hex()}".encode("utf-8")
    token = hmac.new(AUTH_SECRET, token_seed, hashlib.sha256).hexdigest()

    active_sessions[token] = {
        "username": req.username,
        "role": user_info["role"],
        "full_name": user_info.get("full_name", req.username),
        "created_at": time.time()
    }

    return {
        "access_token": token,
        "token_type": "bearer",
        "username": req.username,
        "role": user_info["role"],
        "full_name": user_info.get("full_name")
    }


@app.post("/api/admin/logout")
def admin_logout(officer: Dict[str, Any] = Depends(get_current_officer), authorization: Optional[str] = Header(None)):
    """Revoke Security Officer session token."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        active_sessions.pop(token, None)
    return {"status": "LOGGED_OUT"}


@app.get("/api/admin/me")
def get_current_user_profile(officer: Dict[str, Any] = Depends(get_current_officer)):
    """Return currently authenticated Security Officer profile."""
    return officer


def _get_or_create_sender_keypair():
    """Retrieve or generate the Security Officer ML-DSA-65 signing keypair."""
    keys_dir = "data/sender_keys"
    os.makedirs(keys_dir, exist_ok=True)
    sk_path = os.path.join(keys_dir, "sender_sk.bin")
    vk_path = os.path.join(keys_dir, "sender_vk.bin")

    if os.path.exists(sk_path) and os.path.exists(vk_path):
        with open(sk_path, "rb") as f: sk = f.read()
        with open(vk_path, "rb") as f: vk = f.read()
    else:
        vk, sk = MLDSA65.keygen()
        with open(sk_path, "wb") as f: f.write(sk)
        with open(vk_path, "wb") as f: f.write(vk)
    return vk, sk


@app.get("/api/admin/cluster")
def get_cluster_status(officer: Dict[str, Any] = Depends(get_current_officer)):
    """Query health, chain height, and validator telemetry from all cluster peers."""
    peers = load_peer_config()
    results = []

    for node_id, info in peers.items():
        url = info.get("url")
        status_entry = {
            "node_id": node_id,
            "url": url,
            "index": info.get("index"),
            "label": info.get("label", node_id),
            "online": False,
            "chain_height": None,
            "integrity_healthy": False,
            "error": None
        }
        try:
            req = urllib.request.Request(f"{url}/api/status")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                status_entry["online"] = True
                status_entry["chain_height"] = data.get("chain_tip", {}).get("height")
                status_entry["integrity_healthy"] = data.get("integrity_healthy", False)
        except Exception as e:
            status_entry["error"] = str(e)

        results.append(status_entry)

    online_count = sum(1 for r in results if r["online"])
    quorum_met = online_count >= 3

    return {
        "quorum_healthy": quorum_met,
        "online_nodes": online_count,
        "total_nodes": len(peers),
        "nodes": results
    }


@app.post("/api/admin/distribute")
async def distribute_document(
    pdf_file: UploadFile = File(...),
    doc_id: str = Form(...),
    recipients: str = Form(...),  # Comma-separated
    lines_per_block: int = Form(3),
    officer: Dict[str, Any] = Depends(get_current_officer)
):
    """Upload PDF, build .sigil container, register manifest, and deposit shares across cluster."""
    recipients_list = [r.strip() for r in recipients.split(",") if r.strip()]
    if not recipients_list:
        raise HTTPException(status_code=400, detail="At least one recipient ID must be provided.")

    # Save uploaded PDF to temp file
    suffix = os.path.splitext(pdf_file.filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_pdf:
        shutil.copyfileobj(pdf_file.file, tmp_pdf)
        tmp_pdf_path = tmp_pdf.name

    try:
        # Resolve recipient public keys
        recipients_map = {}
        for r_id in recipients_list:
            client_pk_file = f"data/client_keys/{r_id}_kem_pk.bin"
            if os.path.exists(client_pk_file):
                with open(client_pk_file, "rb") as f:
                    recipients_map[r_id] = f.read()
            else:
                pk, _ = MLKEM768.keygen()
                recipients_map[r_id] = pk

        _, sender_sk = _get_or_create_sender_keypair()

        # Build .sigil container and Shamir shares
        container_bytes, signed_manifest, node_shares = ContainerBuilder.build_container(
            pdf_path=tmp_pdf_path,
            doc_id=doc_id,
            recipients_map=recipients_map,
            sender_sk=sender_sk,
            lines_per_block=lines_per_block
        )

        # Save generated .sigil container
        out_file_path = os.path.join(DISTRIBUTED_DIR, f"{doc_id}.sigil")
        with open(out_file_path, "wb") as f:
            f.write(container_bytes)

        # Submit MANIFEST to primary validator node
        manifest_req = urllib.request.Request(
            f"{PRIMARY_NODE_URL}/api/manifest",
            data=json.dumps(signed_manifest).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(manifest_req, timeout=5.0) as resp:
            man_res = json.loads(resp.read().decode("utf-8"))

        # Deposit key shares across all configured peer nodes over HTTP
        peers = load_peer_config()
        deposit_report = {}
        for n_id, p_info in peers.items():
            idx = p_info.get("index")
            url = p_info.get("url")
            if idx in node_shares and url:
                shares_payload = {"doc_id": doc_id, "shares": node_shares[idx]}
                try:
                    req = urllib.request.Request(
                        f"{url}/api/key_shares",
                        data=json.dumps(shares_payload).encode("utf-8"),
                        headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(req, timeout=3.0) as s_resp:
                        res = json.loads(s_resp.read().decode("utf-8"))
                        deposit_report[n_id] = {"status": "SUCCESS", "shares": res.get("total_shares_stored")}
                except Exception as e:
                    deposit_report[n_id] = {"status": "FAILED", "error": str(e)}

        successful_deposits = sum(1 for v in deposit_report.values() if v.get("status") == "SUCCESS")

        return {
            "status": "DISTRIBUTED",
            "doc_id": doc_id,
            "filename": f"{doc_id}.sigil",
            "download_url": f"/api/admin/download/{doc_id}",
            "container_size_bytes": len(container_bytes),
            "manifest_entry_hash": man_res["entry_hash"],
            "block_height": man_res["block_height"],
            "nodes_deposited": successful_deposits,
            "deposit_report": deposit_report
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Distribution error: {str(e)}")
    finally:
        if os.path.exists(tmp_pdf_path):
            try:
                os.remove(tmp_pdf_path)
            except Exception:
                pass


@app.get("/api/admin/download/{doc_id}")
def download_sigil_file(doc_id: str, officer: Dict[str, Any] = Depends(get_current_officer)):
    """Download the encrypted .sigil container file."""
    file_path = os.path.join(DISTRIBUTED_DIR, f"{doc_id}.sigil")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Container for {doc_id} not found.")
    return FileResponse(
        path=file_path,
        filename=f"{doc_id}.sigil",
        media_type="application/octet-stream"
    )
