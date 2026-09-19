"""Unit tests for Enterprise Authentication and mTLS Gateway Integration."""

import os
import pytest
from fastapi.testclient import TestClient

from admin_portal.auth import (
    hash_password,
    authenticate_officer,
    authenticate_mtls,
    DEFAULT_ADMIN_USER,
    DEFAULT_ADMIN_PASS,
    DEFAULT_SALT,
)
from admin_portal.api import app

client = TestClient(app)


def test_hash_password_consistency():
    """Verify PBKDF2-HMAC-SHA256 produces consistent and secure hashes."""
    h1 = hash_password("SecretPass123!", DEFAULT_SALT)
    h2 = hash_password("SecretPass123!", DEFAULT_SALT)
    h3 = hash_password("DifferentPass!", DEFAULT_SALT)

    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64  # SHA-256 hex string


def test_authenticate_officer_local_success():
    """Verify valid local break-glass officer authentication."""
    user = authenticate_officer(DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS)
    assert user is not None
    assert user["username"] == DEFAULT_ADMIN_USER
    assert user["role"] == "SECURITY_OFFICER"
    assert user["source"] == "LOCAL_KDF"


def test_authenticate_officer_local_invalid_password():
    """Verify invalid password rejection."""
    user = authenticate_officer(DEFAULT_ADMIN_USER, "WrongPassword!")
    assert user is None


def test_authenticate_officer_unknown_user():
    """Verify unknown username rejection."""
    user = authenticate_officer("nonexistent_officer", "SomePassword!")
    assert user is None


def test_authenticate_mtls_success():
    """Verify mTLS client certificate header parsing."""
    verify_header = "SUCCESS"
    dn_header = "CN=Major.Sharma,OU=CyberCommand,O=MoD,C=IN"

    profile = authenticate_mtls(verify_header, dn_header)
    assert profile is not None
    assert profile["username"] == "Major.Sharma"
    assert profile["role"] == "SECURITY_OFFICER"
    assert profile["source"] == "MTLS_X509"


def test_authenticate_mtls_failure_or_missing():
    """Verify that unverified mTLS fails."""
    profile_fail = authenticate_mtls("FAILED", "CN=Untrusted")
    assert profile_fail is None

    profile_none = authenticate_mtls(None, None)
    assert profile_none is None


def test_api_mtls_gateway_bypass():
    """Verify API endpoint accepts authenticated mTLS headers directly."""
    response = client.get(
        "/api/admin/me",
        headers={
            "X-SSL-Client-Verify": "SUCCESS",
            "X-SSL-Client-DN": "CN=Col.Verma,OU=DefenceAudit,C=IN",
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "Col.Verma"
    assert data["source"] == "MTLS_X509"


def test_api_bearer_token_login_and_me():
    """Verify standard interactive login and subsequent bearer token calls."""
    login_resp = client.post(
        "/api/admin/login",
        json={"username": DEFAULT_ADMIN_USER, "password": DEFAULT_ADMIN_PASS}
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    me_resp = client.get(
        "/api/admin/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == DEFAULT_ADMIN_USER
