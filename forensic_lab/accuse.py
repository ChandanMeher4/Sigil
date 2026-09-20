"""Forensic Accusation Engine for Leaked Document Attribution.

Inspects leaked PDF documents, recovers embedded word-spacing codewords,
correlates them against on-ledger decryption sessions, and attributes the leak
to the responsible recipient with mathematical false-accusation bounds.
"""

import math
import hashlib
import json
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional

from watermark_engine.extractor import WatermarkExtractor
from watermark_engine.codeword import generate_codeword_bits
from validator_node.ledger import Ledger


@dataclass
class CandidateScore:
    recipient_id: str
    session_entry_hash: str
    block_height: int
    match_count: int
    total_blocks: int
    match_percentage: float
    expected_codeword: List[int]


@dataclass
class AccusationResult:
    leaked_file_hash: str
    total_blocks_analyzed: int
    recovered_codeword: List[int]
    top_candidate: CandidateScore
    runner_up: Optional[CandidateScore]
    separation_margin_bits: int
    false_accusation_probability: float
    all_candidate_scores: List[CandidateScore]


class ForensicAccuser:
    """Attributes leaked documents by correlating extracted watermarks with ledger sessions."""

    def __init__(self, ledger: Ledger, wm_master_seed: bytes):
        self.ledger = ledger
        self.wm_master_seed = wm_master_seed

    def accuse_leaked_document(
        self,
        leaked_pdf_path_or_bytes: Any,
        doc_id: str,
        total_blocks: int,
        lines_per_block: int = 3
    ) -> AccusationResult:
        """Analyze leaked PDF, correlate with on-ledger sessions for doc_id, and produce an attribution report.
        
        Args:
            leaked_pdf_path_or_bytes: Path or bytes of the leaked document.
            doc_id: Expected document ID.
            total_blocks: Expected block count M.
            lines_per_block: Lines per block.
            
        Returns:
            AccusationResult dataclass with scores, confidence, and false-accusation bounds.
        """
        # 1. Compute leaked file hash
        if isinstance(leaked_pdf_path_or_bytes, (bytes, bytearray)):
            file_bytes = bytes(leaked_pdf_path_or_bytes)
        else:
            with open(leaked_pdf_path_or_bytes, "rb") as f:
                file_bytes = f.read()
        leaked_hash = hashlib.sha3_256(file_bytes).hexdigest()

        # 2. Extract codeword from leaked document
        recovered_cw, confidences = WatermarkExtractor.extract_from_pdf(
            file_bytes,
            total_expected_blocks=total_blocks,
            lines_per_block=lines_per_block
        )

        # 3. Query all DECRYPT_REQUEST sessions for this document from the ledger
        with self.ledger._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT entry_hash, block_height, signer_id, payload FROM entries "
                "WHERE entry_type = 'DECRYPT_REQUEST' AND payload LIKE ? ORDER BY block_height ASC;",
                (f'%"{doc_id}"%',)
            )
            sessions = cur.fetchall()

        if not sessions:
            return AccusationResult(
                leaked_file_hash=leaked_hash,
                total_blocks_analyzed=total_blocks,
                recovered_codeword=recovered_cw,
                top_candidate=None,
                runner_up=None,
                separation_margin_bits=0,
                false_accusation_probability=1.0,
                all_candidate_scores=[]
            )

        candidate_scores: List[CandidateScore] = []

        # 4. Score every candidate session
        for row in sessions:
            entry_h = row["entry_hash"]
            r_id = row["signer_id"]
            b_height = row["block_height"]

            # Derive expected session codeword: c = PRF(K_wm, entry_hash)
            expected_cw = generate_codeword_bits(self.wm_master_seed, entry_h, total_blocks)

            # Count matching bits
            matches = sum(1 for j in range(total_blocks) if expected_cw[j] == recovered_cw[j])
            pct = (matches / total_blocks) * 100.0

            candidate_scores.append(CandidateScore(
                recipient_id=r_id,
                session_entry_hash=entry_h.hex(),
                block_height=b_height,
                match_count=matches,
                total_blocks=total_blocks,
                match_percentage=pct,
                expected_codeword=expected_cw
            ))

        # Deduplicate candidates by recipient_id, keeping the highest match score per recipient
        recipient_best: Dict[str, CandidateScore] = {}
        for cand in candidate_scores:
            if cand.recipient_id not in recipient_best or cand.match_count > recipient_best[cand.recipient_id].match_count:
                recipient_best[cand.recipient_id] = cand

        # Also populate authorized recipients from the document's manifest if they didn't decrypt
        authorized_recipients = []
        with self.ledger._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT payload FROM entries WHERE entry_type = 'MANIFEST' AND payload LIKE ? ORDER BY rowid DESC LIMIT 1;",
                (f'%"{doc_id}"%',)
            )
            mrow = cur.fetchone()
            if mrow:
                try:
                    mpay = json.loads(mrow["payload"]) if isinstance(mrow["payload"], str) else mrow["payload"]
                    authorized_recipients = mpay.get("authorized_recipients", [])
                except Exception:
                    pass

        for auth_r in authorized_recipients:
            if auth_r not in recipient_best:
                # Innocent non-decrypting officer: pseudo expected codeword to measure random baseline
                pseudo_h = hashlib.sha3_256(f"INNOCENT_{auth_r}_{doc_id}".encode()).digest()
                exp_cw = generate_codeword_bits(self.wm_master_seed, pseudo_h, total_blocks)
                m_count = sum(1 for j in range(total_blocks) if exp_cw[j] == recovered_cw[j])
                pct = (m_count / total_blocks) * 100.0
                recipient_best[auth_r] = CandidateScore(
                    recipient_id=auth_r,
                    session_entry_hash=pseudo_h.hex(),
                    block_height=0,
                    match_count=m_count,
                    total_blocks=total_blocks,
                    match_percentage=pct,
                    expected_codeword=exp_cw
                )

        # Sort deduplicated candidates descending by match count
        candidate_scores = list(recipient_best.values())
        candidate_scores.sort(key=lambda s: s.match_count, reverse=True)
        top_cand = candidate_scores[0]
        runner_up = candidate_scores[1] if len(candidate_scores) > 1 else None

        runner_up_score = runner_up.match_count if runner_up else (total_blocks // 2)
        separation_margin = top_cand.match_count - runner_up_score

        # Bound false accusation probability using Hoeffding's Inequality:
        # Under random innocent hypothesis (p=0.5):
        # P(S >= top_score) <= exp(-2 * (top_score - M/2)^2 / M)
        delta_from_mean = max(0, top_cand.match_count - (total_blocks / 2.0))
        exponent = -2.0 * (delta_from_mean ** 2) / float(total_blocks)
        false_prob = math.exp(exponent) if exponent > -700 else 1e-300

        return AccusationResult(
            leaked_file_hash=leaked_hash,
            total_blocks_analyzed=total_blocks,
            recovered_codeword=recovered_cw,
            top_candidate=top_cand,
            runner_up=runner_up,
            separation_margin_bits=separation_margin,
            false_accusation_probability=false_prob,
            all_candidate_scores=candidate_scores
        )
