"""Unit and integration tests for validator node hardening endpoints and peer config."""

import os
import io
import json
import pytest
import fitz
from fastapi.testclient import TestClient

from validator_node.consensus import load_peer_config, STATIC_PEERS
from validator_node.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_peer_config_loader(tmp_path):
    """Test loading peer topology from custom YAML and graceful fallback."""
    # 1. Custom YAML config
    custom_yaml = tmp_path / "custom_peers.yml"
    custom_yaml.write_text(
        "NODE_01:\n  url: http://192.168.1.50:8001\n  index: 1\n"
        "NODE_02:\n  url: http://192.168.1.51:8001\n  index: 2\n",
        encoding="utf-8"
    )
    loaded = load_peer_config(str(custom_yaml))
    assert "NODE_01" in loaded
    assert loaded["NODE_01"]["url"] == "http://192.168.1.50:8001"
    assert loaded["NODE_02"]["index"] == 2

    # 2. Non-existent path returns default STATIC_PEERS
    fallback = load_peer_config(str(tmp_path / "non_existent.yml"))
    assert fallback == STATIC_PEERS


def test_chain_sync_endpoint(client):
    """Test GET /api/consensus/sync returns genesis block and valid schema."""
    res = client.get("/api/consensus/sync?from_height=0")
    assert res.status_code == 200
    data = res.json()
    assert "blocks" in data
    assert data["total_returned"] >= 1
    genesis = data["blocks"][0]
    assert genesis["height"] == 0
    assert "block_hash" in genesis


def test_release_bundle_endpoint_missing_manifest(client):
    """Test /api/documents/release-bundle returns 404 for un-manifested document."""
    res = client.post("/api/documents/release-bundle", json={
        "doc_id": "NON_EXISTENT_DOC_9999",
        "session_entry_hash": "00" * 32,
        "ephemeral_ml_kem_pk": "AA==" * 32
    })
    assert res.status_code == 404
    assert "Manifest not found" in res.json()["detail"]


def test_forensics_attribute_missing_path(client):
    """Test /api/forensics/attribute rejects empty or non-existent path."""
    res = client.post("/api/forensics/attribute", json={
        "pdf_path": "non_existent_file_xyz_123.pdf"
    })
    assert res.status_code == 404


def test_forensics_upload_and_attribute(client, tmp_path):
    """Test POST /api/forensics/upload_and_attribute with uploaded PDF."""
    # Synthesize a simple 1-page PDF
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 100), "MINISTRY OF DEFENCE DIRECTIVE 2026\nConfidential memo content here.", fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()

    files = {
        "pdf_file": ("test_unmarked.pdf", io.BytesIO(pdf_bytes), "application/pdf")
    }
    data = {
        "doc_id": "TEST_DOC_UPLOAD",
        "total_blocks": 2,
        "lines_per_block": 1
    }

    res = client.post("/api/forensics/upload_and_attribute", files=files, data=data)
    assert res.status_code == 200
    result = res.json()
    assert "status" in result
    assert "file_analyzed" in result
    assert "verdict" in result
    assert result["status"] in ("NO_WATERMARK_DETECTED", "NO_SESSIONS_ON_RECORD", "ATTRIBUTED")
