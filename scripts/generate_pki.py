"""Zero-Cost Enterprise PKI / Mutual TLS (mTLS) Certificate Generator for SIGIL.

Generates an internal Certificate Authority (Root CA) and issues signed X.509 v3
server and client certificates for BFT validator nodes, the Security Officer admin
console, and client mTLS authentication.

Usage:
    python scripts/generate_pki.py [--out-dir certs] [--days 365]
"""

import os
import sys
import argparse
import datetime
import json
import ipaddress
from typing import List, Optional

from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def generate_rsa_private_key(key_size: int = 4096) -> rsa.RSAPrivateKey:
    """Generate a high-security RSA private key."""
    return rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
    )


def save_key(key: rsa.RSAPrivateKey, path: str, passphrase: Optional[str] = None):
    """Serialize private key to PEM format."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if passphrase:
        encryption = serialization.BestAvailableEncryption(passphrase.encode("utf-8"))
    else:
        encryption = serialization.NoEncryption()

    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=encryption,
    )
    with open(path, "wb") as f:
        f.write(pem)


def save_cert(cert: x509.Certificate, path: str):
    """Serialize X.509 certificate to PEM format."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def create_root_ca(
    common_name: str = "SIGIL Root Security Authority",
    org: str = "Ministry of Defence - SIGIL Cryptographic Authority",
    country: str = "IN",
    days_valid: int = 3650,
) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    """Create a self-signed X.509 v3 Root Certificate Authority."""
    private_key = generate_rsa_private_key(4096)
    public_key = private_key.public_key()

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, country),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, org),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Zero-Trust Infrastructure"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=days_valid))
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=False,
                key_cert_sign=True,
                crl_sign=True,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(public_key),
            critical=False,
        )
    )

    cert = builder.sign(private_key, hashes.SHA256())
    return private_key, cert


def issue_node_certificate(
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
    common_name: str,
    san_dns: List[str],
    san_ips: List[str],
    days_valid: int = 365,
    is_server: bool = True,
    is_client: bool = True,
) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    """Issue a certificate signed by Root CA with SANs and client/server auth EKUs."""
    private_key = generate_rsa_private_key(2048)
    public_key = private_key.public_key()

    subject = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SIGIL Secure Network"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=days_valid))
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                key_cert_sign=False,
                crl_sign=False,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(public_key),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
    )

    # Extended Key Usage (mTLS support)
    ekus = []
    if is_server:
        ekus.append(ExtendedKeyUsageOID.SERVER_AUTH)
    if is_client:
        ekus.append(ExtendedKeyUsageOID.CLIENT_AUTH)
    if ekus:
        builder = builder.add_extension(
            x509.ExtendedKeyUsage(ekus),
            critical=False,
        )

    # Subject Alternative Names (SANs)
    alt_names = []
    for d in san_dns:
        alt_names.append(x509.DNSName(d))
    for ip in san_ips:
        try:
            alt_names.append(x509.IPAddress(ipaddress.ip_address(ip)))
        except ValueError:
            pass

    if alt_names:
        builder = builder.add_extension(
            x509.SubjectAlternativeName(alt_names),
            critical=False,
        )

    cert = builder.sign(ca_key, hashes.SHA256())
    return private_key, cert


def build_cluster_pki(out_dir: str = "certs", days_valid: int = 365) -> dict:
    """Generate complete PKI infrastructure for 4 BFT nodes, admin portal, and client."""
    os.makedirs(out_dir, exist_ok=True)
    manifest = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "out_dir": os.path.abspath(out_dir),
        "certificates": {},
    }

    # 1. Root CA
    ca_key, ca_cert = create_root_ca()
    ca_key_path = os.path.join(out_dir, "ca.key")
    ca_cert_path = os.path.join(out_dir, "ca.crt")
    save_key(ca_key, ca_key_path)
    save_cert(ca_cert, ca_cert_path)
    manifest["ca"] = {
        "cert": ca_cert_path,
        "fingerprint_sha256": ca_cert.fingerprint(hashes.SHA256()).hex(),
    }

    # 2. Validator Nodes (NODE_01 to NODE_04)
    nodes = [
        {"id": "node_01", "dns": ["node-01", "localhost", "sigil-node-01"], "port": 8001},
        {"id": "node_02", "dns": ["node-02", "localhost", "sigil-node-02"], "port": 8002},
        {"id": "node_03", "dns": ["node-03", "localhost", "sigil-node-03"], "port": 8003},
        {"id": "node_04", "dns": ["node-04", "localhost", "sigil-node-04"], "port": 8004},
    ]

    for n in nodes:
        key, cert = issue_node_certificate(
            ca_key=ca_key,
            ca_cert=ca_cert,
            common_name=f"{n['id']}.cluster.sigil.local",
            san_dns=n["dns"],
            san_ips=["127.0.0.1", "0.0.0.0"],
            days_valid=days_valid,
            is_server=True,
            is_client=True,
        )
        kpath = os.path.join(out_dir, f"{n['id']}.key")
        cpath = os.path.join(out_dir, f"{n['id']}.crt")
        save_key(key, kpath)
        save_cert(cert, cpath)
        manifest["certificates"][n["id"]] = {
            "key": kpath,
            "cert": cpath,
            "fingerprint_sha256": cert.fingerprint(hashes.SHA256()).hex(),
            "sans": n["dns"] + ["127.0.0.1"],
        }

    # 3. Security Officer Admin Console
    adm_key, adm_cert = issue_node_certificate(
        ca_key=ca_key,
        ca_cert=ca_cert,
        common_name="admin.sigil.local",
        san_dns=["admin-portal", "localhost", "sigil-admin-portal"],
        san_ips=["127.0.0.1"],
        days_valid=days_valid,
        is_server=True,
        is_client=False,
    )
    adm_kpath = os.path.join(out_dir, "admin_portal.key")
    adm_cpath = os.path.join(out_dir, "admin_portal.crt")
    save_key(adm_key, adm_kpath)
    save_cert(adm_cert, adm_cpath)
    manifest["certificates"]["admin_portal"] = {
        "key": adm_kpath,
        "cert": adm_cpath,
        "fingerprint_sha256": adm_cert.fingerprint(hashes.SHA256()).hex(),
    }

    # 4. Officer Client mTLS Certificate
    cli_key, cli_cert = issue_node_certificate(
        ca_key=ca_key,
        ca_cert=ca_cert,
        common_name="security-officer-workstation.sigil.local",
        san_dns=["officer-client"],
        san_ips=["127.0.0.1"],
        days_valid=days_valid,
        is_server=False,
        is_client=True,
    )
    cli_kpath = os.path.join(out_dir, "officer_client.key")
    cli_cpath = os.path.join(out_dir, "officer_client.crt")
    save_key(cli_key, cli_kpath)
    save_cert(cli_cert, cli_cpath)
    manifest["certificates"]["officer_client"] = {
        "key": cli_kpath,
        "cert": cli_cpath,
        "fingerprint_sha256": cli_cert.fingerprint(hashes.SHA256()).hex(),
    }

    # Save manifest
    manifest_path = os.path.join(out_dir, "pki_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIGIL Enterprise PKI / mTLS Certificate Generator")
    parser.add_argument("--out-dir", default="certs", help="Output directory for generated keys and certificates")
    parser.add_argument("--days", type=int, default=365, help="Validity period in days for entity certificates")
    args = parser.parse_args()

    print(f"[+] Initializing SIGIL Enterprise Zero-Cost PKI Generation...")
    print(f"    Target directory: {args.out_dir}")
    print(f"    Validity: {args.days} days")

    m = build_cluster_pki(args.out_dir, args.days)
    print(f"[+] Root CA Certificate generated:")
    print(f"    Path: {m['ca']['cert']}")
    print(f"    SHA-256 Fingerprint: {m['ca']['fingerprint_sha256']}")
    print(f"[+] Issued {len(m['certificates'])} entity certificates (Nodes 1-4, Admin, Officer Client).")
    print(f"[+] Manifest written to: {os.path.join(args.out_dir, 'pki_manifest.json')}")
    print("[SUCCESS] All mTLS certificates created successfully.")
