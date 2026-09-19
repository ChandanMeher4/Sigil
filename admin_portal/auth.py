"""Enterprise Authentication Module for SIGIL Admin Portal.

Provides dual-tier zero-trust authentication:
1. Local PBKDF2-HMAC-SHA256 (100,000 rounds) for emergency break-glass access.
2. Active Directory / LDAP authentication (via ldap3 if configured).
3. Mutual TLS (mTLS) gateway identity assertion (via X-SSL-Client headers).
"""

import os
import hmac
import hashlib
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("sigil.auth")

# Configuration
AUTH_SECRET = os.environ.get("SIGIL_AUTH_SECRET", "SIGIL_OFFICER_SESSION_SECRET_2026").encode("utf-8")
DEFAULT_ADMIN_USER = os.environ.get("SIGIL_ADMIN_USER", "officer_admin")
DEFAULT_ADMIN_PASS = os.environ.get("SIGIL_ADMIN_PASSWORD", "SigilAdmin2026!#")
DEFAULT_SALT = b"SIGIL_ADMIN_SALT_2026"

LDAP_ENABLED = os.environ.get("SIGIL_LDAP_ENABLED", "false").strip().lower() in ("1", "true", "yes")
LDAP_SERVER = os.environ.get("SIGIL_LDAP_SERVER", "ldap://127.0.0.1:389")
LDAP_BASE_DN = os.environ.get("SIGIL_LDAP_BASE_DN", "DC=defence,DC=gov,DC=in")
LDAP_USER_DN_TEMPLATE = os.environ.get("SIGIL_LDAP_USER_DN_TEMPLATE", "CN={username},OU=Officers,DC=defence,DC=gov,DC=in")


def hash_password(password: str, salt: bytes) -> str:
    """PBKDF2-HMAC-SHA256 password hash (100,000 iterations)."""
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return dk.hex()


# Built-in officer credentials for break-glass custody
OFFICER_CREDENTIALS: Dict[str, Dict[str, Any]] = {
    DEFAULT_ADMIN_USER: {
        "salt": DEFAULT_SALT.hex(),
        "password_hash": hash_password(DEFAULT_ADMIN_PASS, DEFAULT_SALT),
        "role": "SECURITY_OFFICER",
        "full_name": "Chief Security Officer (Break-Glass Local)",
        "source": "LOCAL_KDF"
    }
}


def authenticate_ldap(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Attempt authentication against enterprise Active Directory / LDAP."""
    if not LDAP_ENABLED:
        return None

    try:
        import ldap3
        from ldap3 import Server, Connection, ALL
    except ImportError:
        logger.warning("LDAP_ENABLED is true, but 'ldap3' module is not installed. Falling back to local.")
        return None

    try:
        user_dn = LDAP_USER_DN_TEMPLATE.format(username=username)
        server = Server(LDAP_SERVER, get_info=ALL, connect_timeout=3)
        conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        if conn.bound:
            conn.unbind()
            return {
                "username": username,
                "role": "SECURITY_OFFICER",
                "full_name": f"Officer {username} (Active Directory)",
                "source": "ACTIVE_DIRECTORY"
            }
    except Exception as e:
        logger.warning(f"LDAP authentication failed for {username}: {e}")

    return None


def authenticate_local(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate using local hardened PBKDF2-HMAC-SHA256 password store."""
    user_info = OFFICER_CREDENTIALS.get(username)
    if not user_info:
        return None

    salt = bytes.fromhex(user_info["salt"])
    input_hash = hash_password(password, salt)
    if hmac.compare_digest(input_hash, user_info["password_hash"]):
        return {
            "username": username,
            "role": user_info["role"],
            "full_name": user_info.get("full_name", username),
            "source": user_info.get("source", "LOCAL_KDF")
        }
    return None


def authenticate_officer(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Dual-tier authentication: checks Active Directory / LDAP first, then local break-glass."""
    # 1. Active Directory / LDAP if enabled (except break-glass user)
    if LDAP_ENABLED and username != DEFAULT_ADMIN_USER:
        ldap_result = authenticate_ldap(username, password)
        if ldap_result:
            return ldap_result

    # 2. Local break-glass authentication
    return authenticate_local(username, password)


def authenticate_mtls(client_verify: Optional[str], client_dn: Optional[str]) -> Optional[Dict[str, Any]]:
    """Authenticate via mTLS client certificate forwarded by production reverse proxy."""
    if client_verify == "SUCCESS" and client_dn:
        # Extract Common Name (CN)
        cn = "mTLS-Officer"
        for part in client_dn.split(","):
            part = part.strip()
            if part.upper().startswith("CN="):
                cn = part[3:].strip()
                break
        return {
            "username": cn,
            "role": "SECURITY_OFFICER",
            "full_name": f"{cn} (mTLS X.509 Verified)",
            "source": "MTLS_X509"
        }
    return None
