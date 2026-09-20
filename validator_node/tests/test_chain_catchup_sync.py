"""Dedicated unit and integration tests for BFT Chain Catch-Up Sync Reconciliation.

Verifies:
1. A lagged node detects a higher peer chain tip, queries missing blocks, and reconciles its chain.
2. Catch-up sync verifies prev_hash continuity and rejects forked/tampered blocks.
3. Catch-up sync strictly requires at least 3-of-4 validator signatures per block.
4. A node that is already up-to-date synchronizes 0 blocks and preserves state.
"""

import os
import json
import io
import pytest
from unittest.mock import patch, MagicMock

from validator_node.ledger import Ledger
from validator_node.consensus import BFTConsensus
from crypto.pqc import b64_encode


class MockHTTPResponse:
    def __init__(self, data: dict, status: int = 200):
        self.data_bytes = json.dumps(data).encode("utf-8")
        self.status = status

    def read(self):
        return self.data_bytes

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.fixture
def sync_env(tmp_path):
    """Create two ledgers: ledger1 (leader at height 3), ledger2 (lagged at height 1)."""
    db1 = str(tmp_path / "leader_ledger.db")
    db2 = str(tmp_path / "lagged_ledger.db")

    leader = Ledger(db_path=db1, node_id="NODE_01")
    lagged = Ledger(db_path=db2, node_id="NODE_02")

    # Three valid validator signatures (threshold t=3 for n=4 BFT)
    val_sigs = {
        "NODE_01": b"sig_val_01_valid_threshold",
        "NODE_02": b"sig_val_02_valid_threshold",
        "NODE_03": b"sig_val_03_valid_threshold"
    }

    # Block 1 on both ledgers
    entry1 = {
        "entry_type": "CUSTOM_LOG",
        "payload": {"event": "GENESIS_AUDIT", "proposer": "NODE_01"},
        "signature": b"sig1",
        "signer_id": "NODE_01"
    }
    blk1_leader = leader.commit_block([entry1], proposer_id="NODE_01", validator_sigs=val_sigs, timestamp=1700000001.0)
    blk1_lagged = lagged.commit_block([entry1], proposer_id="NODE_01", validator_sigs=val_sigs, timestamp=1700000001.0)
    assert blk1_leader["block_hash"] == blk1_lagged["block_hash"], "Genesis/Block 1 must match"

    # Blocks 2 and 3 committed ONLY on leader (lagged was offline)
    entry2 = {
        "entry_type": "CUSTOM_LOG",
        "payload": {"event": "ENROLL_EVENT", "user": "BOB"},
        "signature": b"sig2",
        "signer_id": "BOB"
    }
    entry3 = {
        "entry_type": "CUSTOM_LOG",
        "payload": {"doc_id": "DOC_SECRET_01", "session": "s1"},
        "signature": b"sig3",
        "signer_id": "ALICE"
    }
    leader.commit_block([entry2], proposer_id="NODE_01", validator_sigs=val_sigs, timestamp=1700000002.0)
    leader.commit_block([entry3], proposer_id="NODE_01", validator_sigs=val_sigs, timestamp=1700000003.0)

    assert leader.get_latest_block()["height"] == 3
    assert lagged.get_latest_block()["height"] == 1

    peers_config = {
        "NODE_01": {"url": "http://node01.mock:8001", "index": 1},
        "NODE_02": {"url": "http://node02.mock:8002", "index": 2},
    }

    return {
        "leader": leader,
        "lagged": lagged,
        "peers_config": peers_config,
        "val_sigs": val_sigs
    }


def test_catchup_sync_happy_path(sync_env):
    """Lagged node detects leader height 3, fetches missing blocks 2 and 3, and reconciles."""
    leader = sync_env["leader"]
    lagged = sync_env["lagged"]

    consensus = BFTConsensus(
        node_id="NODE_02",
        ledger=lagged,
        validator_sk=b"sk_mock_02" * 4,
        validator_vk=b"vk_mock_02" * 4,
        peers=sync_env["peers_config"]
    )

    # Format blocks 2 and 3 as returned by /api/consensus/sync
    def mock_urlopen(req, *args, **kwargs):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if "/api/status" in url:
            return MockHTTPResponse({"chain_tip": {"height": 3}})
        elif "/api/consensus/sync" in url:
            # Return blocks 2 and 3 serialized directly from leader ledger
            blocks = leader.get_blocks_range(from_height=2)
            return MockHTTPResponse({"blocks": blocks, "total_returned": len(blocks)})
        raise ValueError(f"Unexpected URL: {url}")

    with patch("urllib.request.urlopen", side_effect=mock_urlopen):
        synced_count = consensus.sync_chain_from_peers()

    assert synced_count == 2, f"Expected 2 synced blocks, got {synced_count}"
    assert lagged.get_latest_block()["height"] == 3
    assert lagged.get_latest_block()["block_hash"] == leader.get_latest_block()["block_hash"], (
        "Reconciled block hash must exactly match leader's committed hash"
    )

    # Verify overall integrity of caught-up ledger
    is_valid, err = lagged.verify_integrity()
    assert is_valid is True, f"Caught-up ledger must be cryptographically intact: {err}"


def test_catchup_sync_rejects_insufficient_signatures(sync_env):
    """Catch-up sync aborts if a missing block has fewer than 3-of-4 validator signatures."""
    lagged = sync_env["lagged"]
    leader = sync_env["leader"]

    consensus = BFTConsensus(
        node_id="NODE_02",
        ledger=lagged,
        validator_sk=b"sk_mock_02" * 4,
        validator_vk=b"vk_mock_02" * 4,
        peers=sync_env["peers_config"]
    )

    import copy
    b2 = leader.get_blocks_range(from_height=2, to_height=2)[0]
    # Only 2 signatures (less than 3 required for BFT quorum)
    block_with_insufficient_sigs = copy.deepcopy(b2)
    block_with_insufficient_sigs["validator_signatures"] = {
        "NODE_01": b64_encode(b"sig1"),
        "NODE_02": b64_encode(b"sig2")
    }

    def mock_urlopen(req, *args, **kwargs):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if "/api/status" in url:
            return MockHTTPResponse({"chain_tip": {"height": 3}})
        elif "/api/consensus/sync" in url:
            return MockHTTPResponse({"blocks": [block_with_insufficient_sigs], "total_returned": 1})
        raise ValueError(f"Unexpected URL: {url}")

    with patch("urllib.request.urlopen", side_effect=mock_urlopen):
        synced_count = consensus.sync_chain_from_peers()

    # Must reject the block with insufficient signatures
    assert synced_count == 0
    assert lagged.get_latest_block()["height"] == 1, "Height must remain at 1 after rejecting invalid block"


def test_catchup_sync_rejects_prev_hash_mismatch(sync_env):
    """Catch-up sync aborts if a missing block prev_hash does not chain to local tip."""
    import copy
    lagged = sync_env["lagged"]
    leader = sync_env["leader"]

    consensus = BFTConsensus(
        node_id="NODE_02",
        ledger=lagged,
        validator_sk=b"sk_mock_02" * 4,
        validator_vk=b"vk_mock_02" * 4,
        peers=sync_env["peers_config"]
    )

    b2 = leader.get_blocks_range(from_height=2, to_height=2)[0]
    # Fabricated / forked prev_hash
    tampered_b2 = copy.deepcopy(b2)
    tampered_b2["prev_hash"] = "deadbeef" * 8  # Forked prev_hash

    def mock_urlopen(req, *args, **kwargs):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if "/api/status" in url:
            return MockHTTPResponse({"chain_tip": {"height": 3}})
        elif "/api/consensus/sync" in url:
            return MockHTTPResponse({"blocks": [tampered_b2], "total_returned": 1})
        raise ValueError(f"Unexpected URL: {url}")

    with patch("urllib.request.urlopen", side_effect=mock_urlopen):
        synced_count = consensus.sync_chain_from_peers()

    assert synced_count == 0
    assert lagged.get_latest_block()["height"] == 1, "Height must remain at 1 after rejecting forked block"


def test_catchup_sync_already_up_to_date(sync_env):
    """When node height >= peer height, sync_chain_from_peers immediately returns 0."""
    leader = sync_env["leader"]

    consensus = BFTConsensus(
        node_id="NODE_01",
        ledger=leader,
        validator_sk=b"sk_mock_01" * 4,
        validator_vk=b"vk_mock_01" * 4,
        peers=sync_env["peers_config"]
    )

    def mock_urlopen(req, *args, **kwargs):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if "/api/status" in url:
            # Peer is at height 1, but we are at height 3
            return MockHTTPResponse({"chain_tip": {"height": 1}})
        raise ValueError(f"Unexpected URL: {url}")

    with patch("urllib.request.urlopen", side_effect=mock_urlopen):
        synced_count = consensus.sync_chain_from_peers()

    assert synced_count == 0
    assert leader.get_latest_block()["height"] == 3
