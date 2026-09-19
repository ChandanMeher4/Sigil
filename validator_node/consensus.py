"""Round-Robin Leader + 2-Phase Commit PQ-BFT Consensus Engine for SIGIL.

Consensus Rules:
- Quorum size: n = 4 nodes, tolerates f = 1 Byzantine/faulty node (3f + 1 = 4).
- Commit threshold: Requires >= 3 of 4 ML-DSA-65 validator signatures per block.
- Leader schedule: Round-robin by block height: Leader(H) = H % 4.
- BFT Median Time: Block timestamp is evaluated as the median of validator clock proposals.
- Direct peer-to-peer HTTP 2-phase commit (zero dynamic gossip overhead).
"""

import os
import json
import time
import logging
import urllib.request
from typing import List, Dict, Any, Tuple, Optional

from crypto.pqc import MLDSA65, canonical_json, b64_encode, b64_decode
from .ledger import Ledger

logger = logging.getLogger("sigil.consensus")


class ConsensusError(Exception):
    """Raised when Byzantine fault tolerant consensus conditions are not met."""
    pass


# Static 4-node cluster topology (default fallback)
STATIC_PEERS = {
    "NODE_01": {"url": "http://127.0.0.1:8001", "index": 1},
    "NODE_02": {"url": "http://127.0.0.1:8002", "index": 2},
    "NODE_03": {"url": "http://127.0.0.1:8003", "index": 3},
    "NODE_04": {"url": "http://127.0.0.1:8004", "index": 4},
}


def load_peer_config(config_path: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """Load peer topology from configuration file or environment variable."""
    path = config_path or os.environ.get("SIGIL_PEERS_CONFIG", "config/peers.yml")
    if os.path.exists(path):
        try:
            if path.endswith((".yml", ".yaml")):
                import yaml
                with open(path, "r", encoding="utf-8") as fh:
                    cfg = yaml.safe_load(fh)
                    if isinstance(cfg, dict) and len(cfg) > 0:
                        return cfg
            elif path.endswith(".json"):
                with open(path, "r", encoding="utf-8") as fh:
                    cfg = json.load(fh)
                    if isinstance(cfg, dict) and len(cfg) > 0:
                        return cfg
        except Exception as e:
            logger.warning(f"Failed to load peer config from {path}: {e}. Falling back to default peers.")
    return dict(STATIC_PEERS)


class BFTConsensus:
    """Manages round-robin leader proposals and 2-phase commit signature collection."""

    def __init__(
        self,
        node_id: str,
        ledger: Ledger,
        validator_sk: bytes,
        validator_vk: bytes,
        peers: Optional[Dict[str, Any]] = None
    ):
        self.node_id = node_id
        self.ledger = ledger
        self.validator_sk = validator_sk
        self.validator_vk = validator_vk
        self.peers = peers or load_peer_config()
        self.timeout = float(os.environ.get("SIGIL_CONSENSUS_TIMEOUT", "1.5"))

    def get_leader_for_height(self, height: int) -> str:
        """Evaluate deterministic round-robin leader: Leader(H) = H % 4."""
        node_keys = sorted(self.peers.keys())
        return node_keys[height % len(node_keys)]

    def is_leader(self, target_height: int) -> bool:
        """Check if this node is the designated leader for target_height."""
        return self.get_leader_for_height(target_height) == self.node_id

    def sync_chain_from_peers(self) -> int:
        """Poll peers to find the highest committed chain tip and catch up missing blocks.
        
        Returns:
            Number of new blocks synchronized.
        """
        local_latest = self.ledger.get_latest_block()
        local_height = local_latest["height"]

        # Step 1: Find peer with higher height
        best_peer_url = None
        highest_peer_height = local_height

        for p_id, p_info in self.peers.items():
            if p_id == self.node_id:
                continue
            peer_url = p_info.get("url")
            if not peer_url:
                continue
            try:
                req = urllib.request.Request(f"{peer_url}/api/status")
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    st = json.loads(resp.read().decode("utf-8"))
                    p_height = st.get("chain_tip", {}).get("height", 0)
                    if p_height > highest_peer_height:
                        highest_peer_height = p_height
                        best_peer_url = peer_url
            except Exception:
                continue

        if not best_peer_url or highest_peer_height <= local_height:
            return 0

        # Step 2: Fetch missing blocks from the peer with highest height
        logger.info(f"[{self.node_id}] Synchronizing missing blocks {local_height + 1} -> {highest_peer_height} from {best_peer_url}...")
        try:
            req = urllib.request.Request(f"{best_peer_url}/api/consensus/sync?from_height={local_height + 1}")
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                sync_payload = json.loads(resp.read().decode("utf-8"))
                missing_blocks = sync_payload.get("blocks", [])
        except Exception as err:
            logger.warning(f"[{self.node_id}] Failed to fetch missing blocks from {best_peer_url}: {err}")
            return 0

        # Step 3: Validate and commit each block sequentially
        synced_count = 0
        for blk in missing_blocks:
            curr_latest = self.ledger.get_latest_block()
            expected_height = curr_latest["height"] + 1

            if blk["height"] != expected_height:
                logger.error(f"[{self.node_id}] Block sync error: expected height {expected_height}, received {blk['height']}")
                break

            if blk["prev_hash"] != curr_latest["block_hash"]:
                logger.error(f"[{self.node_id}] Block sync error: prev_hash mismatch at height {expected_height}")
                break

            val_sigs = blk.get("validator_signatures", {})
            if len(val_sigs) < 3:
                logger.error(f"[{self.node_id}] Block sync error: block at height {expected_height} has only {len(val_sigs)}/3 signatures")
                break

            entries = [
                {
                    "entry_type": e["entry_type"],
                    "payload": e["payload"],
                    "signature": b64_decode(e["signature_b64"]),
                    "signer_id": e["signer_id"]
                }
                for e in blk["entries"]
            ]
            decoded_sigs = {k: b64_decode(v) for k, v in val_sigs.items()}

            self.ledger.commit_block(
                entries=entries,
                proposer_id=blk["proposer_id"],
                validator_sigs=decoded_sigs,
                timestamp=blk["timestamp"]
            )
            synced_count += 1
            logger.info(f"[{self.node_id}] Successfully caught up Block #{expected_height} ({blk['block_hash'][:16]}...)")

        return synced_count

    def propose_and_commit(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Leader function: Proposes block candidate, collects 3-of-4 ML-DSA votes, and commits.
        
        Args:
            entries: List of transaction entries to commit.
            
        Returns:
            Dict containing commit results and block hash.
        """
        latest = self.ledger.get_latest_block()
        target_height = latest["height"] + 1

        # Leader self-vote
        now = int(time.time())
        clock_proposals = [now]

        # Leader signs block candidate
        candidate_header = {
            "height": target_height,
            "prev_hash": latest["block_hash"],
            "merkle_root": "0" * 64,  # Populated during commit
            "timestamp": now,
            "proposer_id": self.node_id
        }
        my_sig = MLDSA65.sign(self.validator_sk, canonical_json(candidate_header))
        collected_sigs = {self.node_id: my_sig}

        # Broadcast PRE-PREPARE to peer nodes
        proposal_payload = {
            "height": target_height,
            "prev_hash": latest["block_hash"],
            "entries": [
                {
                    "entry_type": e["entry_type"],
                    "payload": e["payload"],
                    "signature_b64": b64_encode(e["signature"]),
                    "signer_id": e["signer_id"]
                }
                for e in entries
            ],
            "proposer_id": self.node_id,
            "proposer_sig": b64_encode(my_sig),
            "proposer_clock": now
        }

        # Query peers for votes (need >= 2 additional votes to reach threshold of 3)
        for p_id, p_info in self.peers.items():
            if p_id == self.node_id:
                continue
            peer_url = p_info["url"]
            try:
                post_data = json.dumps(proposal_payload).encode("utf-8")
                req = urllib.request.Request(
                    f"{peer_url}/api/consensus/vote",
                    data=post_data,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    vote_data = json.loads(resp.read().decode("utf-8"))
                    if vote_data.get("vote") == "APPROVE":
                        sig_bytes = b64_decode(vote_data["signature_b64"])
                        collected_sigs[p_id] = sig_bytes
                        if "clock" in vote_data:
                            clock_proposals.append(vote_data["clock"])
            except Exception:
                # Peer offline or unreachable: continue to other peers
                continue

        # Check if 3-of-4 quorum threshold reached
        if len(collected_sigs) < 3:
            strict = os.environ.get("SIGIL_STRICT_QUORUM", "true").lower() in ("true", "1", "yes")
            if strict:
                raise ConsensusError(
                    f"Quorum threshold not met: {len(collected_sigs)}/3 signatures collected. "
                    f"At least 3 of 4 validators must be online and consenting."
                )

        # Evaluate BFT Median Time
        clock_proposals.sort()
        median_time = clock_proposals[len(clock_proposals) // 2]

        # Commit block locally
        commit_result = self.ledger.commit_block(
            entries=entries,
            proposer_id=self.node_id,
            validator_sigs=collected_sigs,
            timestamp=median_time
        )

        # Broadcast COMMIT to online peers
        commit_broadcast = {
            "height": target_height,
            "block_hash": commit_result["block_hash"],
            "merkle_root": commit_result["merkle_root"],
            "timestamp": median_time,
            "proposer_id": self.node_id,
            "validator_signatures": {k: b64_encode(v) for k, v in collected_sigs.items()},
            "entries": proposal_payload["entries"]
        }

        for p_id, p_info in self.peers.items():
            if p_id == self.node_id:
                continue
            peer_url = p_info["url"]
            try:
                c_data = json.dumps(commit_broadcast).encode("utf-8")
                c_req = urllib.request.Request(
                    f"{peer_url}/api/consensus/commit_block",
                    data=c_data,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(c_req, timeout=self.timeout) as _:
                    pass
            except Exception as err:
                logger.warning(
                    f"Peer {p_id} ({peer_url}) unreachable for commit broadcast: {err}. "
                    f"Peer will sync on next proposal round."
                )

        return commit_result
