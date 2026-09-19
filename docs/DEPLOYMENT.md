# SIGIL On-Premise LAN Deployment Guide

> **Target Audience**: Government & Defense IT System Administrators  
> **Environment**: Closed LAN / Air-Gapped Network / Ministry Data Center  
> **Licensing & Cost**: 100% Free and Open Source

---

## 1. Architectural Overview

SIGIL deploys a **4-node Byzantine Fault Tolerant (BFT) post-quantum validator cluster** across independent departmental servers. Decryption keys are split via Shamir's Secret Sharing ($t=3, n=4$), requiring at least 3 distinct departments to authorize any document access.

```
                    +------------------------------+
                    | Internal Ministry LAN        |
                    | (e.g., 192.168.1.0/24)       |
                    +---------------+--------------+
                                    |
     +-----------------+------------+------------+-----------------+
     |                 |                         |                 |
+----+----+       +----+----+               +----+----+       +----+----+
| Node 01 |       | Node 02 |               | Node 03 |       | Node 04 |
| IT Dept |       | Security|               | Legal   |       | Audit   |
| :8001   |       | :8002   |               | :8003   |       | :8004   |
+---------+       +---------+               +---------+       +---------+
```

---

## 2. Deployment Options

### Option A: Docker Compose (Recommended for Server Rooms)

#### Prerequisites
- Docker Engine & Docker Compose installed on the host machine(s).

#### Steps
1. Clone or copy the SIGIL repository to the server.
2. Edit `config/peers_docker.yml` if nodes reside on separate physical servers, or use default bridge configuration.
3. Launch the 4-node validator cluster:
   ```bash
   docker-compose up -d
   ```
4. Verify cluster health:
   ```bash
   curl http://localhost:8001/api/status
   curl http://localhost:8002/api/status
   curl http://localhost:8003/api/status
   curl http://localhost:8004/api/status
   ```
   Each endpoint should return `"integrity_healthy": true`.

---

### Option B: Bare-Metal Windows / PowerShell Deployment

#### Prerequisites
- Python 3.11+ 64-bit on each validator node workstation/server.
- Run `pip install -r requirements.txt`.

#### Multi-Machine LAN Topology Setup
1. Assign static IP addresses to each node machine:
   - Node 1 (IT Dept): `192.168.1.101`
   - Node 2 (Security): `192.168.1.102`
   - Node 3 (Legal): `192.168.1.103`
   - Node 4 (CVO/Audit): `192.168.1.104`

2. Edit `config/peers.yml`:
   ```yaml
   NODE_01:
     url: "http://192.168.1.101:8001"
     index: 1
     label: "IT Department Server"
   NODE_02:
     url: "http://192.168.1.102:8001"
     index: 2
     label: "Security Officer Workstation"
   NODE_03:
     url: "http://192.168.1.103:8001"
     index: 3
     label: "Legal Department Server"
   NODE_04:
     url: "http://192.168.1.104:8001"
     index: 4
     label: "CVO / Audit Office Server"
   ```

3. Start each node on its respective machine:
   **Node 1**:
   ```powershell
   $env:PYTHONPATH="."
   $env:SIGIL_NODE_ID="NODE_01"
   $env:SIGIL_SHARE_INDEX="1"
   $env:SIGIL_PEERS_CONFIG="config/peers.yml"
   python -m uvicorn validator_node.main:app --host 0.0.0.0 --port 8001
   ```

   **Node 2**:
   ```powershell
   $env:PYTHONPATH="."
   $env:SIGIL_NODE_ID="NODE_02"
   $env:SIGIL_SHARE_INDEX="2"
   $env:SIGIL_PEERS_CONFIG="config/peers.yml"
   python -m uvicorn validator_node.main:app --host 0.0.0.0 --port 8001
   ```

   **Node 3**:
   ```powershell
   $env:PYTHONPATH="."
   $env:SIGIL_NODE_ID="NODE_03"
   $env:SIGIL_SHARE_INDEX="3"
   $env:SIGIL_PEERS_CONFIG="config/peers.yml"
   python -m uvicorn validator_node.main:app --host 0.0.0.0 --port 8001
   ```

   **Node 4**:
   ```powershell
   $env:PYTHONPATH="."
   $env:SIGIL_NODE_ID="NODE_04"
   $env:SIGIL_SHARE_INDEX="4"
   $env:SIGIL_PEERS_CONFIG="config/peers.yml"
   python -m uvicorn validator_node.main:app --host 0.0.0.0 --port 8001
   ```

---

## 3. Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `SIGIL_NODE_ID` | Identifier of this validator node (`NODE_01` to `NODE_04`) | `NODE_01` |
| `SIGIL_SHARE_INDEX` | Shamir share polynomial evaluation index ($x \in \{1,2,3,4\}$) | `1` |
| `SIGIL_PEERS_CONFIG` | Path to peers YAML configuration file | `config/peers.yml` |
| `SIGIL_DB_PATH` | Path to node SQLite blockchain ledger | `data/{node_id}/sigil_ledger.db` |
| `SIGIL_STRICT_QUORUM` | Refuse commits if fewer than 3 signatures collected | `true` |
| `SIGIL_API_KEY` | Shared secret token for protecting API endpoints over LAN | None (open LAN) |
| `SIGIL_ALLOWED_ORIGINS` | Comma-separated CORS allowed origins | `*` |
| `SIGIL_WM_SEED` | Master seed for deterministic variant generation | National Directive Seed |

---

## 4. Verification and Health Checks

To verify cluster consensus health:
```powershell
# Run the automated live cluster Byzantine test
python -m pytest demo/test_live_cluster_bft.py -v
```
