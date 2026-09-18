"""SIGIL Sender Tool Subsystem.

Provides:
- Document segmentation & variant generation
- Symmetric block encryption (AES-256-GCM)
- Threshold Shamir splitting of variant keys
- Broadcast container packaging (.sigil)
- Manifest generation and ledger submission
"""

from .build_container import ContainerBuilder

__all__ = ["ContainerBuilder"]
