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
