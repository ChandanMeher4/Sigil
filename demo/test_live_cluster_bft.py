"""Hardening Test 2: Live Multi-Process 4-Node HTTP Cluster & Fault Tolerance Test.

Spawns 4 independent FastAPI Uvicorn servers on ports 8001, 8002, 8003, 8004,
validates live HTTP 2-phase commit consensus, kills Node 4 (f=1 Byzantine fault),
and proves that 3-of-4 quorum consensus survives and commits transactions seamlessly.
"""

import os
import sys
import time
import subprocess
import urllib.request
import urllib.error
import json
import shutil
import pytest

from crypto.pqc import MLDSA65, b64_encode, b64_decode, canonical_json
from recipient_client.daemon.client_crypto import RecipientCryptoSession


def wait_for_node(url: str, timeout: float = 12.0) -> bool:
    """Poll node /api/status until ready or timeout."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{url}/api/status")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("integrity_healthy") is True:
                        return True
        except Exception:
            time.sleep(0.3)
    return False


def test_live_cluster_4node_bft_and_fault_tolerance(tmp_path):
    cluster_dir = str(tmp_path / "live_cluster_data")
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", 8001)) == 0:
            pytest.skip("Cluster ports 8001-8004 are currently occupied by an active SIGIL cluster daemon.")

    os.makedirs(cluster_dir, exist_ok=True)

    processes = {}
    node_configs = [
        {"id": "NODE_01", "port": 8001, "share": 1},
        {"id": "NODE_02", "port": 8002, "share": 2},
        {"id": "NODE_03", "port": 8003, "share": 3},
        {"id": "NODE_04", "port": 8004, "share": 4},
    ]

    try:
        # 1. Spawn 4 independent FastAPI Uvicorn processes
        for cfg in node_configs:
            n_id = cfg["id"]
            port = cfg["port"]
            share = cfg["share"]
            db_file = os.path.join(cluster_dir, f"{n_id.lower()}_ledger.db")

            env = os.environ.copy()
            env["PYTHONPATH"] = "."
            env["SIGIL_NODE_ID"] = n_id
            env["SIGIL_SHARE_INDEX"] = str(share)
            env["SIGIL_DB_PATH"] = db_file
            env["SIGIL_WM_SEED"] = "LIVE_CLUSTER_TEST_SEED_2026"

            proc = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "validator_node.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                    "--log-level",
                    "warning"
                ],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            processes[n_id] = proc

        # 2. Wait for all 4 nodes to become healthy
        for cfg in node_configs:
            url = f"http://127.0.0.1:{cfg['port']}"
            is_ready = wait_for_node(url, timeout=15.0)
            assert is_ready is True, f"Node {cfg['id']} failed to start on {url}"

        # 3. Test Quorum Consensus Commit on Node 1 (All 4 nodes online)
        alice = RecipientCryptoSession(recipient_id="ALICE_LIVE_01", keys_dir=os.path.join(cluster_dir, "alice_keys"))
        enroll_payload, enroll_sig = alice.get_enroll_payload()

        post_data = json.dumps({"payload": enroll_payload, "signature_b64": enroll_sig}).encode("utf-8")
        req = urllib.request.Request(
            "http://127.0.0.1:8001/api/enroll",
            data=post_data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode("utf-8"))
            assert res["status"] == "ENROLLED"
            assert res["block_height"] == 1

        # Give 0.5s for commit broadcast to sync to peers
        time.sleep(0.5)

        # Verify that peer Node 2 also has Block 1
        req_peer = urllib.request.Request("http://127.0.0.1:8002/api/status")
        with urllib.request.urlopen(req_peer, timeout=2.0) as resp:
            st2 = json.loads(resp.read().decode("utf-8"))
            assert st2["chain_tip"]["height"] == 1, "Node 02 should have synchronized Block 1"

        # --------------------------------------------------------------------
        # 4. INJECT BYZANTINE FAULT: Terminate Node 4 (f=1 failure)
        # --------------------------------------------------------------------
        p4 = processes["NODE_04"]
        p4.terminate()
        p4.wait()
        del processes["NODE_04"]

        # Confirm Node 4 is dead
        node4_dead = False
        try:
            with urllib.request.urlopen("http://127.0.0.1:8004/api/status", timeout=1.0) as _:
                pass
        except Exception:
            node4_dead = True
        assert node4_dead is True, "Node 04 must be offline"

        # --------------------------------------------------------------------
        # 5. TEST BFT QUORUM SURVIVAL (3 of 4 nodes remaining: 1, 2, 3)
        # --------------------------------------------------------------------
        bob = RecipientCryptoSession(recipient_id="BOB_LIVE_02", keys_dir=os.path.join(cluster_dir, "bob_keys"))
        b_payload, b_sig = bob.get_enroll_payload()

        post_data_b = json.dumps({"payload": b_payload, "signature_b64": b_sig}).encode("utf-8")
        req_b = urllib.request.Request(
            "http://127.0.0.1:8001/api/enroll",
            data=post_data_b,
            headers={"Content-Type": "application/json"}
        )

        # Quorum must still succeed because 3 nodes (Node 1, 2, 3) are sufficient for 3f+1 = 4 BFT!
        with urllib.request.urlopen(req_b, timeout=5.0) as resp:
            assert resp.status == 200
            res_b = json.loads(resp.read().decode("utf-8"))
            assert res_b["status"] == "ENROLLED"
            assert res_b["block_height"] == 2, f"Expected Block 2, got {res_b['block_height']}"

        time.sleep(0.5)

        # Verify Node 3 synchronized Block 2 despite Node 4 being down!
        req_peer3 = urllib.request.Request("http://127.0.0.1:8003/api/status")
        with urllib.request.urlopen(req_peer3, timeout=2.0) as resp:
            st3 = json.loads(resp.read().decode("utf-8"))
            assert st3["chain_tip"]["height"] == 2, "Node 03 should have synchronized Block 2 under 3-node quorum"

        # --------------------------------------------------------------------
        # 6. COMMIT ANOTHER BLOCK WHILE NODE 4 IS STILL DEAD (Block 3)
        # --------------------------------------------------------------------
        charlie = RecipientCryptoSession(recipient_id="CHARLIE_LIVE_03", keys_dir=os.path.join(cluster_dir, "charlie_keys"))
        c_payload, c_sig = charlie.get_enroll_payload()
        post_data_c = json.dumps({"payload": c_payload, "signature_b64": c_sig}).encode("utf-8")
        req_c = urllib.request.Request(
            "http://127.0.0.1:8001/api/enroll",
            data=post_data_c,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req_c, timeout=5.0) as resp:
            assert resp.status == 200
            res_c = json.loads(resp.read().decode("utf-8"))
            assert res_c["block_height"] == 3, f"Expected Block 3, got {res_c['block_height']}"

        # --------------------------------------------------------------------
        # 7. RESTART NODE 4 & TEST AUTOMATIC CATCH-UP / RECONCILIATION
        # --------------------------------------------------------------------
        # Node 4 missed Block 2 and Block 3 while offline.
        # Restart Node 4 with its previous ledger state:
        env4 = os.environ.copy()
        env4["PYTHONPATH"] = "."
        env4["SIGIL_NODE_ID"] = "NODE_04"
        env4["SIGIL_SHARE_INDEX"] = "4"
        env4["SIGIL_DB_PATH"] = os.path.join(cluster_dir, "node_04_ledger.db")
        env4["SIGIL_WM_SEED"] = "LIVE_CLUSTER_TEST_SEED_2026"

        proc4_restarted = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "validator_node.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8004",
                "--log-level",
                "warning"
            ],
            env=env4,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        processes["NODE_04"] = proc4_restarted

        # Wait for Node 4 to come back online
        assert wait_for_node("http://127.0.0.1:8004", timeout=12.0) is True

        # Node 4 initially has height 1:
        with urllib.request.urlopen("http://127.0.0.1:8004/api/status", timeout=2.0) as resp:
            st4_initial = json.loads(resp.read().decode("utf-8"))
            assert st4_initial["chain_tip"]["height"] == 1, "Restarted node should initially be at height 1 before catch-up"

        # Trigger catch-up on Node 4 to synchronize missed Blocks 2 and 3 from online peers
        req_sync = urllib.request.Request(
            "http://127.0.0.1:8004/api/consensus/sync_now",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req_sync, timeout=5.0) as resp:
            sync_res = json.loads(resp.read().decode("utf-8"))
            assert sync_res["current_height"] == 3, f"Node 04 should have caught up to height 3, got {sync_res['current_height']}"

        # Now propose Block 4 across the cluster:
        # All 4 nodes are online and synchronized!
        dave = RecipientCryptoSession(recipient_id="DAVE_LIVE_04", keys_dir=os.path.join(cluster_dir, "dave_keys"))
        d_payload, d_sig = dave.get_enroll_payload()
        post_data_d = json.dumps({"payload": d_payload, "signature_b64": d_sig}).encode("utf-8")
        req_d = urllib.request.Request(
            "http://127.0.0.1:8001/api/enroll",
            data=post_data_d,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req_d, timeout=5.0) as resp:
            assert resp.status == 200
            res_d = json.loads(resp.read().decode("utf-8"))
            assert res_d["block_height"] == 4, f"Expected Block 4, got {res_d['block_height']}"

        time.sleep(0.5)

        # Query Node 1 chain tip to compare
        with urllib.request.urlopen("http://127.0.0.1:8001/api/status", timeout=2.0) as resp:
            st1_final = json.loads(resp.read().decode("utf-8"))

        # Confirm Node 4 successfully caught up to Block 4 and has identical block hash!
        with urllib.request.urlopen("http://127.0.0.1:8004/api/status", timeout=2.0) as resp:
            st4_final = json.loads(resp.read().decode("utf-8"))
            assert st4_final["chain_tip"]["height"] == 4, f"Node 04 should have caught up to height 4, got {st4_final['chain_tip']['height']}"
            assert st4_final["chain_tip"]["block_hash"] == st1_final["chain_tip"]["block_hash"], "Node 04 reconciled block hash must match leader's committed hash exactly"

    finally:
        # Clean teardown: kill all child processes
        for n_id, proc in processes.items():
            try:
                proc.terminate()
                proc.wait(timeout=2.0)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    import tempfile
    import pathlib
    with tempfile.TemporaryDirectory() as td:
        test_live_cluster_4node_bft_and_fault_tolerance(pathlib.Path(td))
        print("[+] Hardening Test 2 (Live 4-Node Cluster & BFT Fault Tolerance) PASSED cleanly!")
