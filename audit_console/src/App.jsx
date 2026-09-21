import React, { useState, useEffect } from 'react';
import {
  ShieldIcon,
  ServerIcon,
  ActivityIcon,
  RefreshCwIcon,
  AlertOctagonIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  LinkIcon,
  MicroscopeIcon,
  CrosshairIcon,
  ScaleIcon,
  SearchIcon,
  ZapIcon,
  TargetIcon,
} from './Icons';

const NODES = [
  { id: 'NODE_01', url: 'http://127.0.0.1:8001', shareIndex: 1, label: 'Node 01 (Primary Proposer)' },
  { id: 'NODE_02', url: 'http://127.0.0.1:8002', shareIndex: 2, label: 'Node 02 (Validator Quorum)' },
  { id: 'NODE_03', url: 'http://127.0.0.1:8003', shareIndex: 3, label: 'Node 03 (Validator Quorum)' },
  { id: 'NODE_04', url: 'http://127.0.0.1:8004', shareIndex: 4, label: 'Node 04 (Validator Quorum)' },
];

export default function App() {
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [selectedNode, setSelectedNode] = useState(NODES[0]);
  const [blocks, setBlocks] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [activeTab, setActiveTab] = useState('explorer');
  const [tamperAlert, setTamperAlert] = useState(null);
  const [proofData, setProofData] = useState(null);
  const [forensicResult, setForensicResult] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [customPdfPath, setCustomPdfPath] = useState('demo_data/alice_decrypted.pdf');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forensicError, setForensicError] = useState(null);

  const runLiveAttribution = async (path) => {
    setIsAnalyzing(true);
    setForensicError(null);
    const target = path || customPdfPath;
    try {
      const res = await fetch(`${selectedNode.url}/api/forensics/attribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_path: target }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Forensic analysis failed');
      }
      const data = await res.json();
      setForensicResult(data);
    } catch (e) {
      setForensicError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Poll node statuses
  const refreshTelemetry = async () => {
    let alertFound = null;
    const newStatuses = {};

    for (const node of NODES) {
      try {
        const res = await fetch(`${node.url}/api/status`);
        if (res.ok) {
          const data = await res.json();
          newStatuses[node.id] = { ...data, online: true };
          if (data.integrity_healthy === false) {
            alertFound = {
              nodeId: node.id,
              error: data.integrity_error || 'Merkle root / Hash chain mismatch detected!',
            };
          }
        } else {
          newStatuses[node.id] = { online: false };
        }
      } catch (e) {
        newStatuses[node.id] = { online: false };
      }
    }

    setNodeStatuses(newStatuses);
    setTamperAlert(alertFound);

    // Fetch blocks from current primary
    try {
      const bRes = await fetch(`${selectedNode.url}/api/blocks?limit=25`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBlocks(bData);
      }
    } catch (e) {
      // ignore if node offline
    }
  };

  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 3000);
    return () => clearInterval(interval);
  }, [selectedNode]);

  const viewMerkleProof = async (entryHash) => {
    try {
      const res = await fetch(`${selectedNode.url}/api/proof/${entryHash}`);
      if (res.ok) {
        const data = await res.json();
        setProofData(data);
      }
    } catch (e) {
      alert('Could not fetch proof from node');
    }
  };

  return (
    <div id="root">
      {/* Header */}
      <header className="audit-header">
        <div className="brand-wrapper">
          <div className="logo-badge">
            <ShieldIcon size={18} color="#38bdf8" />
          </div>
          <div>
            <div className="console-title">
              SIGIL AUDIT CONSOLE
              <span className="status-pill pill-purple">PQ-BFT CONSENSUS</span>
            </div>
            <div className="console-subtitle">
              Post-Quantum Blockchain &amp; Forensic Ledger Telemetry
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="status-pill pill-cyan">
            <span>FIPS 203 (ML-KEM-768) • FIPS 204 (ML-DSA-65)</span>
          </div>
          <button className="action-btn" onClick={refreshTelemetry}>
            <RefreshCwIcon size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Flashing Tamper Alarm Banner */}
      {tamperAlert && (
        <div className="alarm-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertOctagonIcon size={20} color="#f87171" />
            <div>
              <strong style={{ fontSize: '0.9rem', letterSpacing: '0.02em', color: '#f87171' }}>
                SECURITY ALARM: UNAUTHORIZED DATABASE TAMPERING DETECTED
              </strong>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Node: <strong>{tamperAlert.nodeId}</strong> — {tamperAlert.error}
              </div>
            </div>
          </div>
          <span className="status-pill pill-rose" style={{ background: '#000', borderColor: '#ef4444' }}>
            CRITICAL INTEGRITY FAULT
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Column: BFT Quorum Status */}
        <div>
          <div className="glass-panel" style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ServerIcon size={16} color="#38bdf8" />
              <span>BFT Validator Quorum</span>
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '14px', lineHeight: '1.45' }}>
              Quorum Rule: <strong>4 Nodes</strong> total, threshold requires <strong>&ge; 3 of 4</strong> ML-DSA-65 signatures.
            </p>

            {NODES.map((node) => {
              const st = nodeStatuses[node.id];
              const isOnline = st?.online;
              const isTampered = st?.integrity_healthy === false;

              return (
                <div
                  key={node.id}
                  className={`node-card ${isTampered ? 'tampered' : ''}`}
                  style={{
                    cursor: 'pointer',
                    borderColor: selectedNode.id === node.id ? '#3b82f6' : undefined,
                  }}
                  onClick={() => setSelectedNode(node)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.84rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                      {node.id}
                    </span>
                    <span className={`status-pill ${isTampered ? 'pill-rose' : isOnline ? 'pill-emerald' : 'pill-rose'}`}>
                      {isTampered ? 'TAMPERED' : isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    {node.url} (Share #{node.shareIndex})
                  </div>

                  {isOnline && (
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Chain Height:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                        #{st?.chain_tip?.height ?? 0}
                      </span>
                    </div>
                  )}

                  {isOnline && (
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '4px', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                      VK: {st?.validator_public_key?.slice(0, 24)}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="glass-panel">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ScaleIcon size={15} color="#34d399" />
              <span>Section 63 BSA Evidence Certification</span>
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#94a3b8', lineHeight: '1.45' }}>
              All documents distributed via SIGIL are cryptographically bound to the post-quantum Merkle audit tree.
              The immutable ledger provides forensic non-repudiation structured for Section 63 BSA judicial review.
            </p>
          </div>
        </div>

        {/* Right Column: Ledger Explorer & Forensic Tools */}
        <div>
          {/* Navigation Tabs */}
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
              onClick={() => setActiveTab('explorer')}
            >
              <LinkIcon size={14} />
              <span>Blockchain Ledger Explorer</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'forensics' ? 'active' : ''}`}
              onClick={() => setActiveTab('forensics')}
            >
              <MicroscopeIcon size={14} />
              <span>Forensic Leak Attribution</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'attacks' ? 'active' : ''}`}
              onClick={() => setActiveTab('attacks')}
            >
              <TargetIcon size={14} />
              <span>Adversarial Attack Sandbox</span>
            </button>
          </div>

          {/* TAB 1: BLOCKCHAIN EXPLORER */}
          {activeTab === 'explorer' && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  Committed Blocks on {selectedNode.id}
                </h3>
                <span className="status-pill pill-cyan">
                  {blocks.length} Blocks Synchronized
                </span>
              </div>

              {blocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '0.84rem' }}>
                  No blocks committed yet or node offline.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Height</th>
                      <th>Block Hash</th>
                      <th>Merkle Root</th>
                      <th>Proposer</th>
                      <th>Time (BFT Median)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b) => (
                      <tr key={b.height} style={{ cursor: 'pointer' }} onClick={() => setSelectedBlock(b)}>
                        <td style={{ color: '#38bdf8', fontWeight: 600 }}>#{b.height}</td>
                        <td title={b.block_hash}>{b.block_hash.slice(0, 12)}...{b.block_hash.slice(-6)}</td>
                        <td title={b.merkle_root}>{b.merkle_root.slice(0, 12)}...</td>
                        <td>
                          <span className="status-pill pill-purple">{b.proposer_id}</span>
                        </td>
                        <td style={{ color: '#94a3b8' }}>
                          {new Date(b.timestamp * 1000).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedBlock && (
                <div style={{ marginTop: '18px', background: '#080d17', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h4 style={{ color: '#38bdf8', fontSize: '0.88rem', fontWeight: 600 }}>Block #{selectedBlock.height} Details</h4>
                    <button className="action-btn" style={{ padding: '3px 8px', fontSize: '0.72rem' }} onClick={() => setSelectedBlock(null)}>
                      Close
                    </button>
                  </div>
                  <div style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div><strong>Full Block Hash:</strong> {selectedBlock.block_hash}</div>
                    <div><strong>Merkle Root:</strong> {selectedBlock.merkle_root}</div>
                    <div><strong>Previous Block Hash:</strong> {selectedBlock.prev_hash}</div>
                    <div><strong>Designated Proposer:</strong> {selectedBlock.proposer_id}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FORENSIC ATTRIBUTION */}
          {activeTab === 'forensics' && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MicroscopeIcon size={16} color="#38bdf8" />
                <span>Section 63 BSA Forensic Leak Attributor</span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '18px', lineHeight: '1.45' }}>
                When a leaked document is recovered, the forensic extractor measures the micro-typographic word-spacing
                shifts and tests the extracted codeword against all committed sessions on the immutable ledger.
              </p>

              <div style={{ background: '#080d17', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: '18px' }}>
                <label style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Target Leaked PDF File Path (Evaluated live via PyMuPDF glyph-spacing extractor):
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={customPdfPath}
                    onChange={(e) => setCustomPdfPath(e.target.value)}
                    placeholder="e.g. demo_data/alice_decrypted.pdf"
                    style={{
                      flex: 1,
                      background: '#040711',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '9px 12px',
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                    }}
                  />
                  <button
                    className="action-btn"
                    style={{ background: 'linear-gradient(180deg, #2563eb, #1d4ed8)', color: '#fff', borderColor: 'rgba(255,255,255,0.15)' }}
                    onClick={() => runLiveAttribution(customPdfPath)}
                    disabled={isAnalyzing}
                  >
                    <SearchIcon size={14} />
                    <span>{isAnalyzing ? 'Extracting Spacing...' : 'Run Extractor'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="action-btn"
                    style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                    onClick={() => {
                      setCustomPdfPath('demo_data/alice_decrypted.pdf');
                      runLiveAttribution('demo_data/alice_decrypted.pdf');
                    }}
                    disabled={isAnalyzing}
                  >
                    Test Alice Leaked Copy
                  </button>
                  <button
                    className="action-btn"
                    style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                    onClick={() => {
                      setCustomPdfPath('demo_data/bob_decrypted.pdf');
                      runLiveAttribution('demo_data/bob_decrypted.pdf');
                    }}
                    disabled={isAnalyzing}
                  >
                    Test Bob Leaked Copy
                  </button>
                  <button
                    className="action-btn"
                    style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                    onClick={() => {
                      setCustomPdfPath('demo_data/spliced_leak.pdf');
                      runLiveAttribution('demo_data/spliced_leak.pdf');
                    }}
                    disabled={isAnalyzing}
                  >
                    Test Spliced Collusion Copy (50/50)
                  </button>
                </div>

                {forensicError && (
                  <div style={{ marginTop: '12px', color: '#f87171', fontSize: '0.78rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', padding: '8px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangleIcon size={14} />
                    <span>{forensicError}</span>
                  </div>
                )}
              </div>

              {forensicResult && (
                <div
                  style={{
                    background: '#080d17',
                    border: `1px solid ${forensicResult.status === 'NO_WATERMARK_DETECTED' ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {forensicResult.status === 'NO_WATERMARK_DETECTED' ? (
                        <AlertTriangleIcon size={22} color="#fbbf24" />
                      ) : (
                        <CrosshairIcon size={22} color="#34d399" />
                      )}
                      <div>
                        <h4
                          style={{
                            color: forensicResult.status === 'NO_WATERMARK_DETECTED' ? '#fbbf24' : '#34d399',
                            fontSize: '0.95rem',
                            fontWeight: 700
                          }}
                        >
                          {forensicResult.status === 'NO_WATERMARK_DETECTED'
                            ? 'NO CRYPTOGRAPHIC WATERMARK DETECTED'
                            : 'FORENSIC ATTRIBUTION CONFIRMED'}
                        </h4>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Analyzed File: <code>{forensicResult.file_analyzed || customPdfPath}</code>
                        </div>
                      </div>
                    </div>
                    <span className={`status-pill ${forensicResult.status === 'NO_WATERMARK_DETECTED' ? 'pill-rose' : 'pill-emerald'}`}>
                      {forensicResult.status === 'NO_WATERMARK_DETECTED' ? 'UNMARKED DOCUMENT' : 'LIVE PYMUPDF EXTRACTION'}
                    </span>
                  </div>

                  {forensicResult.verdict && (
                    <div
                      style={{
                        background: forensicResult.status === 'NO_WATERMARK_DETECTED' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                        border: `1px solid ${forensicResult.status === 'NO_WATERMARK_DETECTED' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
                        borderRadius: '6px',
                        padding: '10px 14px',
                        fontSize: '0.78rem',
                        color: forensicResult.status === 'NO_WATERMARK_DETECTED' ? '#fde68a' : '#a7f3d0',
                        marginBottom: '14px',
                      }}
                    >
                      <strong>Forensic Verdict:</strong> {forensicResult.verdict}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.78rem', marginBottom: '14px' }}>
                    <div style={{ background: '#0e1524', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: '#64748b' }}>Identified Source:</span>
                      <div
                        style={{
                          color: forensicResult.status === 'NO_WATERMARK_DETECTED' ? '#f87171' : '#fff',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          marginTop: '2px',
                        }}
                      >
                        {forensicResult.culprit}
                      </div>
                    </div>

                    <div style={{ background: '#0e1524', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: '#64748b' }}>Codeword Correlation:</span>
                      <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}>
                        {forensicResult.matchScore}
                      </div>
                    </div>

                    <div style={{ background: '#0e1524', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: '#64748b' }}>False Accusation Probability (Hoeffding):</span>
                      <div style={{ color: '#a78bfa', fontFamily: 'var(--font-mono)', marginTop: '2px', fontSize: '0.74rem' }}>
                        p &lt; {forensicResult.p_value}
                      </div>
                    </div>

                    <div style={{ background: '#0e1524', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: '#64748b' }}>Separation Margin &amp; Validity:</span>
                      <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', marginTop: '2px' }}>
                        Margin: {forensicResult.separation_margin || 'N/A'} | {forensicResult.legalValidity}
                      </div>
                    </div>
                  </div>

                  {forensicResult.all_candidates && forensicResult.all_candidates.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                      <h5 style={{ color: '#cbd5e1', fontSize: '0.78rem', marginBottom: '8px' }}>
                        Candidate Session Correlation Breakdown across Ledger:
                      </h5>
                      <table className="data-table" style={{ fontSize: '0.76rem' }}>
                        <thead>
                          <tr>
                            <th>Recipient</th>
                            <th>Matches</th>
                            <th>Correlation</th>
                            <th>Committed Block</th>
                          </tr>
                        </thead>
                        <tbody>
                          {forensicResult.all_candidates.map((c, idx) => (
                            <tr key={idx} style={{ background: idx === 0 ? 'rgba(16,185,129,0.06)' : undefined }}>
                              <td style={{ fontWeight: 600, color: idx === 0 ? '#34d399' : '#fff' }}>
                                {c.recipient_id} {idx === 0 ? '(Top Match)' : ''}
                              </td>
                              <td>{c.matches} / {c.total_blocks}</td>
                              <td style={{ color: idx === 0 ? '#34d399' : '#38bdf8', fontWeight: 600 }}>
                                {c.match_percentage}%
                              </td>
                              <td>Block #{c.block_height}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADVERSARIAL ATTACK SANDBOX */}
          {activeTab === 'attacks' && (
            <div className="glass-panel">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TargetIcon size={16} color="#f87171" />
                <span>Adversarial Attack Sandbox (Live Threat Demonstrations)</span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '18px', lineHeight: '1.45' }}>
                Verify SIGIL's resilience against the 3 core threat vectors defined in SIH26237:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                <div style={{ background: '#080d17', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h4 style={{ color: '#f87171', fontSize: '0.86rem', fontWeight: 600 }}>Threat Vector 1: Hostile Database Admin Tampering</h4>
                    <span className="status-pill pill-rose">INSIDER THREAT</span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '10px', lineHeight: '1.4' }}>
                    An administrator with root SQLite access attempts to rewrite an access log entry or alter a block hash
                    to erase evidence of a leak.
                  </p>
                  <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    Command: python demo/attack_scripts/tamper_database.py
                    <br />
                    Result: SHA3-256 Merkle root recalculation fails &rarr; Node broadcasts Tamper Alarm.
                  </div>
                </div>

                <div style={{ background: '#080d17', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h4 style={{ color: '#fbbf24', fontSize: '0.86rem', fontWeight: 600 }}>Threat Vector 2: Direct Decryption Request Bypass</h4>
                    <span className="status-pill pill-purple">CLIENT EXTRACTION</span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '10px', lineHeight: '1.4' }}>
                    A malicious recipient reverse-engineers the daemon client and sends raw HTTP calls directly to custody nodes
                    without signing or committing to the ledger.
                  </p>
                  <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    Command: python demo/attack_scripts/bypass_client.py
                    <br />
                    Result: 403 Forbidden. Threshold key custody refuses release without verified committed block height.
                  </div>
                </div>

                <div style={{ background: '#080d17', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h4 style={{ color: '#38bdf8', fontSize: '0.86rem', fontWeight: 600 }}>Threat Vector 3: Multi-Recipient Collusion &amp; Splicing</h4>
                    <span className="status-pill pill-cyan">COLLUSION ATTACK</span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '10px', lineHeight: '1.4' }}>
                    Alice and Bob compare copies and stitch alternating paragraphs together (50% Alice, 50% Bob)
                    to evade individual attribution.
                  </p>
                  <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    Command: python demo/attack_scripts/collude_splicing.py
                    <br />
                    Result: Both colluders score ~75% correlation, while innocent baseline is ~50% (&gt; 10&sigma; statistical margin). Both are identified!
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
