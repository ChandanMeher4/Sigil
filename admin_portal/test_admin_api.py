"""Tests for Admin Portal Backend API and Security Officer Authentication."""

import os
import pytest
from fastapi.testclient import TestClient
from admin_portal.api import app, DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS


@pytest.fixture
def client():
    return TestClient(app)


def test_unauthenticated_request_rejected(client):
    """Verify that unauthenticated access to protected routes is rejected with 401."""
    res = client.get("/api/admin/cluster")
    assert res.status_code == 401
    assert "detail" in res.json()


def test_login_invalid_credentials(client):
    """Verify that login fails with incorrect password."""
    res = client.post("/api/admin/login", json={
        "username": DEFAULT_ADMIN_USER,
        "password": "WrongPassword123!"
    })
    assert res.status_code == 401


def test_security_officer_login_and_authenticated_flow(client):
    """Verify login, session token issuance, authenticated access, profile retrieval, and logout."""
    # 1. Successful Login
    login_res = client.post("/api/admin/login", json={
        "username": DEFAULT_ADMIN_USER,
        "password": DEFAULT_ADMIN_PASS
    })
    assert login_res.status_code == 200
    auth_data = login_res.json()
    assert "access_token" in auth_data
    assert auth_data["role"] == "SECURITY_OFFICER"
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Authenticated Profile Query
    me_res = client.get("/api/admin/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["username"] == DEFAULT_ADMIN_USER

    # 3. Authenticated Cluster Status Query
    cluster_res = client.get("/api/admin/cluster", headers=headers)
    assert cluster_res.status_code == 200
    data = cluster_res.json()
    assert "quorum_healthy" in data
    assert "total_nodes" in data
    assert len(data["nodes"]) >= 4

    # 4. Logout
    logout_res = client.post("/api/admin/logout", headers=headers)
    assert logout_res.status_code == 200

    # 5. Revoked token rejected
    subsequent_res = client.get("/api/admin/cluster", headers=headers)
    assert subsequent_res.status_code == 401


def test_enrolled_recipients_endpoint(client):
    """Verify listing enrolled recipient identities with authentication."""
    # Login first
    login_res = client.post("/api/admin/login", json={
        "username": DEFAULT_ADMIN_USER,
        "password": DEFAULT_ADMIN_PASS
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/admin/recipients", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "recipients" in data
    assert len(data["recipients"]) >= 4
    recipient_ids = [r["id"] for r in data["recipients"]]
    assert "OFFICER_ALICE" in recipient_ids
    assert "OFFICER_BOB" in recipient_ids


def test_distributed_documents_catalog_endpoint(client):
    """Verify querying distributed document catalog."""
    login_res = client.post("/api/admin/login", json={
        "username": DEFAULT_ADMIN_USER,
        "password": DEFAULT_ADMIN_PASS
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/admin/documents", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "documents" in data
    assert isinstance(data["documents"], list)


def test_forensic_upload_and_attribute_endpoint(client, tmp_path):
    """Verify multipart PDF upload for forensic attribution."""
    import fitz

    # Create dummy single-page PDF
    pdf_path = tmp_path / "suspect.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "CONFIDENTIAL INTELLIGENCE DIRECTIVE")
    doc.save(str(pdf_path))
    doc.close()

    login_res = client.post("/api/admin/login", json={
        "username": DEFAULT_ADMIN_USER,
        "password": DEFAULT_ADMIN_PASS
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with open(str(pdf_path), "rb") as f:
        res = client.post(
            "/api/admin/forensics/upload_and_attribute",
            headers=headers,
            files={"pdf_file": ("suspect.pdf", f, "application/pdf")},
            data={"lines_per_block": 1}
        )
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "verdict" in data


def test_static_frontend_dashboard_served(client):
    """Verify that FastAPI mounts and serves the React dashboard index.html."""
    res = client.get("/")
    assert res.status_code == 200
    assert "SIGIL // Security Officer Command Console" in res.text
    assert "root" in res.text


