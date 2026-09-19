"""Unit tests for SIGIL Enterprise Zero-Cost PKI and mTLS Certificate Generator."""

import os
import shutil
import tempfile
import pytest
from cryptography import x509
from cryptography.x509.oid import ExtensionOID, ExtendedKeyUsageOID

from scripts.generate_pki import (
    create_root_ca,
    issue_node_certificate,
    build_cluster_pki,
)


@pytest.fixture
def temp_pki_dir():
    temp_dir = tempfile.mkdtemp(prefix="sigil_test_pki_")
    yield temp_dir
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_create_root_ca():
    """Verify that Root CA has correct CA:TRUE basic constraints and key usage."""
    ca_key, ca_cert = create_root_ca(days_valid=30)

    # Check issuer and subject match
    assert ca_cert.issuer == ca_cert.subject
    assert "SIGIL Root Security Authority" in ca_cert.subject.rfc4514_string()

    # Check BasicConstraints: CA:TRUE
    bc_ext = ca_cert.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS)
    assert bc_ext.value.ca is True

    # Check KeyUsage
    ku_ext = ca_cert.extensions.get_extension_for_oid(ExtensionOID.KEY_USAGE)
    assert ku_ext.value.key_cert_sign is True
    assert ku_ext.value.crl_sign is True


def test_issue_node_certificate():
    """Verify node certificate SANs and EKUs for mTLS."""
    ca_key, ca_cert = create_root_ca(days_valid=30)
    node_key, node_cert = issue_node_certificate(
        ca_key=ca_key,
        ca_cert=ca_cert,
        common_name="node-01.sigil.local",
        san_dns=["node-01", "localhost"],
        san_ips=["127.0.0.1"],
        days_valid=30,
        is_server=True,
        is_client=True,
    )

    # Check issuer matches CA subject
    assert node_cert.issuer == ca_cert.subject

    # Check not a CA
    bc_ext = node_cert.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS)
    assert bc_ext.value.ca is False

    # Check ExtendedKeyUsage contains both server and client authentication
    eku_ext = node_cert.extensions.get_extension_for_oid(ExtensionOID.EXTENDED_KEY_USAGE)
    assert ExtendedKeyUsageOID.SERVER_AUTH in eku_ext.value
    assert ExtendedKeyUsageOID.CLIENT_AUTH in eku_ext.value

    # Check SANs
    san_ext = node_cert.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
    dns_names = san_ext.value.get_values_for_type(x509.DNSName)
    assert "node-01" in dns_names
    assert "localhost" in dns_names


def test_build_cluster_pki_end_to_end(temp_pki_dir):
    """Verify end-to-end generation of cluster certificates and manifest."""
    manifest = build_cluster_pki(out_dir=temp_pki_dir, days_valid=30)

    # Verify Root CA files exist
    assert os.path.exists(manifest["ca"]["cert"])
    assert os.path.exists(os.path.join(temp_pki_dir, "ca.key"))

    # Verify Nodes 1-4
    for node_id in ["node_01", "node_02", "node_03", "node_04"]:
        assert node_id in manifest["certificates"]
        assert os.path.exists(manifest["certificates"][node_id]["cert"])
        assert os.path.exists(manifest["certificates"][node_id]["key"])

    # Verify Admin and Client
    assert "admin_portal" in manifest["certificates"]
    assert "officer_client" in manifest["certificates"]

    # Verify Manifest
    manifest_path = os.path.join(temp_pki_dir, "pki_manifest.json")
    assert os.path.exists(manifest_path)
