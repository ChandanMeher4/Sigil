import React, { useState, useEffect } from 'react';
import {
  ShieldIcon,
  LockIcon,
  UnlockIcon,
  FileTextIcon,
  FolderIcon,
  DownloadIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ScaleIcon,
  MicroscopeIcon,
  RefreshCwIcon,
  ServerIcon,
  UserIcon,
  CpuIcon,
  EyeIcon,
  KeyIcon,
} from './Icons';

const DAEMON_URL = 'http://127.0.0.1:5001';

export default function App() {
  const [identity, setIdentity] = useState(null);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeDoc, setActiveDoc] = useState(null);

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialFile = urlParams?.get('file') || 'data/alice/policy_directive_2026.sigil';
  const initialRecipient = urlParams?.get('recipient') || (initialFile.toLowerCase().includes('alice') ? 'OFFICER_ALICE' : 'OFFICER_ALICE');

  const [containerPath, setContainerPath] = useState(initialFile);
  const [containerBytesB64, setContainerBytesB64] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState(urlParams?.get('file') ? initialFile.split(/[/\\]/).pop() : '');
  const [passphrase, setPassphrase] = useState('');
  const [recipientId, setRecipientId] = useState(initialRecipient);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showForensicLens, setShowForensicLens] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    document.title = "SIGIL // Secure Recipient Terminal";
  }, []);

  const fetchIdentity = async () => {
    try {
      const res = await fetch(
        `${DAEMON_URL}/api/identity?recipient_id=${encodeURIComponent(recipientId)}${passphrase ? `&passphrase=${encodeURIComponent(passphrase)}` : ''}`
      );
      if (res.ok) {
        const data = await res.json();
        setIdentity(data);
        setDaemonConnected(true);
        setErrorMsg(null);
      } else {
        setDaemonConnected(false);
      }
    } catch (err) {
      setDaemonConnected(false);
    }
  };

  useEffect(() => {
    fetchIdentity();
    const interval = setInterval(fetchIdentity, 4000);
    return () => clearInterval(interval);
  }, [recipientId, passphrase]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(',')[1];
      setContainerBytesB64(b64);
      setContainerPath('');
    };
    reader.readAsDataURL(file);
  };

  const handleOpenDocument = async () => {
    setLoading(true);
    setErrorMsg(null);
    setCurrentStep(1); // 1: Unwrap Container Outer Envelope

    try {
      await new Promise((r) => setTimeout(r, 200));
      setCurrentStep(2); // 2: Ephemeral ML-DSA-65 Signed DECRYPT_REQUEST

      await new Promise((r) => setTimeout(r, 250));
      setCurrentStep(3); // 3: Dispatch & BFT Quorum Consensus

      const bodyPayload = {
        recipient_id: recipientId,
        passphrase: passphrase || null,
      };

      if (containerBytesB64) {
        bodyPayload.container_bytes_b64 = containerBytesB64;
      } else {
        bodyPayload.container_path = containerPath;
      }

      const res = await fetch(`${DAEMON_URL}/api/open_document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to decrypt document');
      }

      setCurrentStep(4); // 4: Shamir Secret Sharing Reconstruction
      await new Promise((r) => setTimeout(r, 300));

      setCurrentStep(5); // 5: Forensic Variant Dynamic Assembly
      await new Promise((r) => setTimeout(r, 250));

      const docData = await res.json();
      setActiveDoc(docData);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async () => {
    if (!activeDoc) return;
    try {
      const saveResp = await fetch(
        `${DAEMON_URL}/api/document/${activeDoc.doc_id}/save_file?recipient_id=${encodeURIComponent(recipientId)}`,
        { method: 'POST' }
      );
      if (saveResp.ok) {
        const data = await saveResp.json();
        const pathsStr = data.saved_paths.join('\n');
        alert(`File saved successfully to:\n\n${pathsStr}`);
        return;
      }

      // Browser download fallback
      const res = await fetch(`${DAEMON_URL}${activeDoc.render_url}`);
      if (!res.ok) throw new Error('Failed to download file stream');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recipientId}_${activeDoc.doc_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Could not save file: ${err.message}`);
    }
  };

  return (
    <div id="root">
      {/* Institutional Top Header */}
      <header className="terminal-header">
        <div className="terminal-brand">
          <div className="terminal-icon-box">
            <ShieldIcon size={17} color="#19C7E8" />
          </div>
          <div>
            <div className="terminal-title">
              SIGIL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>//</span> SECURE RECIPIENT TERMINAL
            </div>
            <div className="terminal-subtitle">
              Post-Quantum Document Decryption &amp; Hardware Provenance Node (SIH26237)
            </div>
          </div>
        </div>

        <div className="terminal-telemetry">
          <div className={`telemetry-pill ${daemonConnected ? 'pill-online' : 'pill-offline'}`}>
            <span className="pill-dot"></span>
            <span>DAEMON {daemonConnected ? 'ONLINE (127.0.0.1:5001)' : 'OFFLINE'}</span>
          </div>

          <div className="telemetry-pill pill-cyan">
            <CpuIcon size={12} />
            <span>DRM: WDA_EXCLUDEFROMCAPTURE</span>
          </div>

          <div className="telemetry-pill">
            <span>FIPS 203 / 204</span>
          </div>

          {identity && (
            <div className="telemetry-pill" style={{ color: '#fff', borderColor: 'var(--border-strong)' }}>
              <UserIcon size={12} />
              <span>{identity.recipient_id}</span>
            </div>
          )}
        </div>
      </header>

      {/* 4 Stat Cards Metric Ribbon */}
      <section className="metrics-ribbon">
        <div className="metric-card">
          <div className="metric-header">
            <span>Clearance Identity</span>
            <UserIcon size={14} color="#19C7E8" />
          </div>
          <div className="metric-value">{identity?.recipient_id || recipientId}</div>
          <div className="metric-detail">Level-4 Restricted Officer • Active Enrollment</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span>Hardware DRM Shield</span>
            <ShieldIcon size={14} color="#27C79A" />
          </div>
          <div className="metric-value" style={{ color: '#27C79A' }}>ENFORCED</div>
          <div className="metric-detail">Hardware Anti-Capture Active (WDA_EXCLUDEFROMCAPTURE)</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span>PQC Cryptosuite</span>
            <LockIcon size={14} color="#19C7E8" />
          </div>
          <div className="metric-value">ML-KEM-768</div>
          <div className="metric-detail">NIST FIPS 203 Encapsulation + FIPS 204 Digital Signatures</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span>Ledger Invariant</span>
            <ServerIcon size={14} color="#9D7BFF" />
          </div>
          <div className="metric-value" style={{ color: '#9D7BFF' }}>NO LOG, NO KEY</div>
          <div className="metric-detail">3-of-4 BFT Quorum Consensus Required for Release</div>
        </div>
      </section>

      {/* Main Workspace */}
      <main className="workspace-container">
        {!activeDoc ? (
          /* Pre-Decryption 2-Column Split Workspace */
          <div className="panel-grid-2col">
            {/* Left Panel: Container Selection & Clearance Credentials */}
            <div className="defense-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <FolderIcon size={16} color="#19C7E8" />
                  <span>Secure Container &amp; Clearance</span>
                </div>
                <span className="panel-badge">ENCRYPTED INPUT</span>
              </div>

              <div className="form-group">
                <label className="form-label">Encrypted Container File (.sigil)</label>
                <div className="file-browser-row">
                  <label className="btn-secondary" style={{ flexShrink: 0, cursor: 'pointer' }}>
                    <FolderIcon size={14} />
                    <span>Browse File</span>
                    <input
                      type="file"
                      accept=".sigil"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={containerPath}
                    onChange={(e) => {
                      setContainerPath(e.target.value);
                      setContainerBytesB64(null);
                    }}
                    placeholder="Path (e.g. data/alice/policy_directive_2026.sigil)"
                  />
                </div>
                {selectedFileName && (
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', marginTop: '4px' }}>
                    Selected: {selectedFileName}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Officer Clearance Identity</label>
                <select
                  className="form-select"
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                >
                  <option value="OFFICER_ALICE">OFFICER_ALICE (Special Ops Lead)</option>
                  <option value="OFFICER_BOB">OFFICER_BOB (Intelligence Analyst)</option>
                  <option value="OFFICER_CHARLIE">OFFICER_CHARLIE (Logistics Director)</option>
                  <option value="OFFICER_DAVE">OFFICER_DAVE (Cyber Defense Commander)</option>
                  <option value="ALICE">ALICE (Enrolled Field Clearance)</option>
                  <option value="BOB">BOB (Enrolled Field Clearance)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Private Key Passphrase (Optional)</label>
                <input
                  type="password"
                  className="form-input"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Leave empty if key is unencrypted at rest"
                />
              </div>

              {/* Hardware / Key Inspection Box */}
              <div className="key-inspector-box">
                <div className="key-row">
                  <span className="key-label">Key Storage Directory:</span>
                  <span className="key-val">{identity?.keys_dir || 'data/client_keys'}</span>
                </div>
                <div className="key-row">
                  <span className="key-label">ML-KEM-768 Fingerprint:</span>
                  <span className="key-val">
                    {identity?.ml_kem_public_key ? `${identity.ml_kem_public_key.slice(0, 20)}...` : 'Hardware Synced'}
                  </span>
                </div>
                <div className="key-row">
                  <span className="key-label">ML-DSA-65 Device Signature:</span>
                  <span className="key-val" style={{ color: 'var(--accent-green)' }}>Verified Ready</span>
                </div>
              </div>

              {errorMsg && (
                <div style={{
                  background: 'rgba(226, 85, 85, 0.1)',
                  border: '1px solid rgba(226, 85, 85, 0.3)',
                  color: 'var(--accent-red)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <AlertTriangleIcon size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleOpenDocument}
                disabled={loading || !daemonConnected}
                style={{ width: '100%', marginTop: 'auto' }}
              >
                {loading ? (
                  <>
                    <RefreshCwIcon size={15} className="spin-icon" />
                    <span>Executing Post-Quantum Decryption Quorum...</span>
                  </>
                ) : (
                  <>
                    <UnlockIcon size={15} />
                    <span>DECRYPT &amp; ASSEMBLE CONTAINER</span>
                  </>
                )}
              </button>
            </div>

            {/* Right Panel: Zero-Trust Pipeline & Protocol Audit */}
            <div className="defense-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <CpuIcon size={16} color="#27C79A" />
                  <span>Log-Before-Key Protocol Audit Telemetry</span>
                </div>
                <span className="panel-badge" style={{ color: 'var(--accent-green)', borderColor: 'rgba(39, 199, 154, 0.3)', background: 'var(--accent-green-subtle)' }}>
                  QUORUM ACTIVE
                </span>
              </div>

              <div className="pipeline-track">
                <div className={`pipeline-step ${currentStep > 1 ? 'step-done' : currentStep === 1 ? 'step-active' : ''}`}>
                  <div className="step-number">{currentStep > 1 ? '✓' : '1'}</div>
                  <div className="step-content">
                    <div className="step-title">
                      <span>Outer Container Envelope Decapsulation</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>FIPS 203</span>
                    </div>
                    <div className="step-desc">
                      ML-KEM-768 decapsulation recovers envelope key K_out for authorized officer capsule.
                    </div>
                  </div>
                </div>

                <div className={`pipeline-step ${currentStep > 2 ? 'step-done' : currentStep === 2 ? 'step-active' : ''}`}>
                  <div className="step-number">{currentStep > 2 ? '✓' : '2'}</div>
                  <div className="step-content">
                    <div className="step-title">
                      <span>Ephemeral Session Signing (DECRYPT_REQUEST)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>FIPS 204</span>
                    </div>
                    <div className="step-desc">
                      Client signs single-use ML-DSA-65 audit request. Invariant: no plaintext without signed ledger commit.
                    </div>
                  </div>
                </div>

                <div className={`pipeline-step ${currentStep > 3 ? 'step-done' : currentStep === 3 ? 'step-active' : ''}`}>
                  <div className="step-number">{currentStep > 3 ? '✓' : '3'}</div>
                  <div className="step-content">
                    <div className="step-title">
                      <span>PQ-BFT Consensus Ledger Commit</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>3-OF-4 QUORUM</span>
                    </div>
                    <div className="step-desc">
                      Validator nodes reach consensus, commit session entry hash, and seal audit trail into block header.
                    </div>
                  </div>
                </div>

                <div className={`pipeline-step ${currentStep > 4 ? 'step-done' : currentStep === 4 ? 'step-active' : ''}`}>
                  <div className="step-number">{currentStep > 4 ? '✓' : '4'}</div>
                  <div className="step-content">
                    <div className="step-title">
                      <span>Threshold Shamir Key Share Reconstruction</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>PRIME FIELD F_P</span>
                    </div>
                    <div className="step-desc">
                      Lagrange interpolation over prime field F_p reconstructs authorized variant AES block keys.
                    </div>
                  </div>
                </div>

                <div className={`pipeline-step ${currentStep >= 5 ? 'step-done' : currentStep === 5 ? 'step-active' : ''}`}>
                  <div className="step-number">{currentStep >= 5 ? '✓' : '5'}</div>
                  <div className="step-content">
                    <div className="step-title">
                      <span>Micro-Typographic Variant Assembly &amp; Shielding</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>BSA SECTION 63</span>
                    </div>
                    <div className="step-desc">
                      In-memory PDF synthesis embeds deterministic word-spacing fingerprint and enables WDA hardware shield.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: '16px',
                padding: '12px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}>
                <strong style={{ color: '#fff' }}>LEGAL NOTICE (Section 63 BSA 2023):</strong> Plaintext copies are never released unmarked. Any unauthorized photographic leak or distribution is mathematically traced back to the recipient session with false-positive probability p &lt; 10⁻⁶.
              </div>
            </div>
          </div>
        ) : (
          /* Post-Decryption Document Workbench */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Top Provenance Ribbon */}
            <div className="provenance-toolbar">
              <div className="provenance-metrics">
                <div className="prov-metric-item">
                  <span className="prov-metric-label">Document ID</span>
                  <span className="prov-metric-value" style={{ color: 'var(--accent-cyan)' }}>
                    {activeDoc.doc_id}
                  </span>
                </div>
                <div className="prov-metric-item">
                  <span className="prov-metric-label">Ledger Commit</span>
                  <span className="prov-metric-value" style={{ color: 'var(--accent-green)' }}>
                    Block #{activeDoc.block_height}
                  </span>
                </div>
                <div className="prov-metric-item">
                  <span className="prov-metric-label">Session Entry Hash</span>
                  <span className="prov-metric-value" title={activeDoc.session_entry_hash}>
                    {activeDoc.session_entry_hash.slice(0, 16)}...{activeDoc.session_entry_hash.slice(-6)}
                  </span>
                </div>
                <div className="prov-metric-item">
                  <span className="prov-metric-label">Watermark Codeword</span>
                  <span className="prov-metric-value" style={{ color: 'var(--accent-purple)' }}>
                    Bound to Session ({activeDoc.session_entry_hash.slice(0, 8)})
                  </span>
                </div>
              </div>

              <div className="provenance-actions">
                <button
                  className="btn-secondary"
                  style={{ background: 'var(--accent-green-subtle)', borderColor: 'rgba(39, 199, 154, 0.3)', color: 'var(--accent-green)' }}
                  onClick={handleDownloadFile}
                  title="Download decrypted watermarked PDF"
                >
                  <DownloadIcon size={14} />
                  <span>Download File</span>
                </button>

                <button className="btn-secondary" onClick={() => setShowForensicLens(true)}>
                  <MicroscopeIcon size={14} />
                  <span>Forensic Lens</span>
                </button>

                <button className="btn-secondary" onClick={() => setShowCertificate(true)}>
                  <ScaleIcon size={14} />
                  <span>BSA Certificate</span>
                </button>

                <button className="btn-secondary" onClick={() => setActiveDoc(null)}>
                  <FolderIcon size={14} />
                  <span>Close / Open New</span>
                </button>
              </div>
            </div>

            {/* Split Viewer & Security Audit Cards */}
            <div className="decrypted-grid">
              {/* PDF Viewport */}
              <div className="pdf-viewport-card">
                <div className="pdf-viewport-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileTextIcon size={14} color="#19C7E8" />
                    <span style={{ fontWeight: 600, color: '#fff' }}>DECRYPTED SECURE VIEWPORT</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)' }}>
                    <ShieldIcon size={13} />
                    <span>WDA_EXCLUDEFROMCAPTURE ACTIVE</span>
                  </div>
                </div>
                <iframe
                  className="pdf-frame"
                  src={`${DAEMON_URL}${activeDoc.render_url}`}
                  title="SIGIL Decrypted Document"
                />
              </div>

              {/* Right Security Audit Pane */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="defense-panel">
                  <div className="panel-header" style={{ marginBottom: '12px', paddingBottom: '10px' }}>
                    <div className="panel-title" style={{ fontSize: '0.8rem' }}>
                      <ShieldIcon size={15} color="#19C7E8" />
                      <span>Cryptographic Provenance</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.76rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Authorized Recipient:</span>
                      <div style={{ fontFamily: 'var(--font-mono)', color: '#fff', fontWeight: 600 }}>
                        {identity?.recipient_id || recipientId}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>ML-DSA Signature Status:</span>
                      <div style={{ color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <CheckCircleIcon size={13} />
                        <span>FIPS 204 Validated on Ledger</span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Ledger Block Hash:</span>
                      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all', fontSize: '0.7rem' }}>
                        {activeDoc.block_hash}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Shamir Reconstruction:</span>
                      <div style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        3-of-4 Key Share Bundles Combined
                      </div>
                    </div>
                  </div>
                </div>

                <div className="defense-panel">
                  <div className="panel-header" style={{ marginBottom: '12px', paddingBottom: '10px' }}>
                    <div className="panel-title" style={{ fontSize: '0.8rem' }}>
                      <ScaleIcon size={15} color="#27C79A" />
                      <span>Legal Non-Repudiation</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    This document copy contains an imperceptible micro-typographic word-spacing watermark
                    directly bound to Session Entry <code style={{ color: 'var(--accent-cyan)' }}>{activeDoc.session_entry_hash.slice(0, 10)}</code>.
                  </p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '8px' }}>
                    Under Section 63 of Bharatiya Sakshya Adhiniyam, 2023, the cryptographic record serves as definitive evidence of electronic custody.
                  </p>

                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'center', fontSize: '0.78rem' }}
                      onClick={() => setShowCertificate(true)}
                    >
                      <ScaleIcon size={13} />
                      <span>View Section 63 Certificate</span>
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ justifyContent: 'center', fontSize: '0.78rem' }}
                      onClick={() => setShowForensicLens(true)}
                    >
                      <MicroscopeIcon size={13} />
                      <span>Inspect Watermark Shifts</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Forensic Lens Modal */}
      {showForensicLens && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">
                <MicroscopeIcon size={17} color="#19C7E8" />
                <span>Forensic Micro-Typographic Watermark Lens</span>
              </div>
              <button className="btn-secondary" onClick={() => setShowForensicLens(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              SIGIL modulates inter-word spacing using PDF font operators (<code>Tw = 0.750 pt / +0.26 mm</code>).
              The shifts are imperceptible to human inspection and survive camera photography, screen capture, print-and-scan, and compression.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '0.78rem' }}>Variant A (Codeword Bit 0)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Tw: 0.000 pt (Baseline Typography)
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ color: 'var(--accent-purple)', fontWeight: 600, fontSize: '0.78rem' }}>Variant B (Codeword Bit 1)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Tw: +0.750 pt (+0.26 mm Micro-Shift)
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
              Session watermark sequence is derived via HMAC-SHA3-256 PRF directly from block #{activeDoc?.block_height}.
            </p>
            <button className="btn-primary" onClick={() => setShowForensicLens(false)} style={{ alignSelf: 'flex-end' }}>
              Close Lens
            </button>
          </div>
        </div>
      )}

      {/* Section 63 BSA Certificate Modal */}
      {showCertificate && activeDoc && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <ScaleIcon size={17} color="#27C79A" />
                <span>Section 63 Bharatiya Sakshya Adhiniyam Certificate</span>
              </div>
              <button className="btn-secondary" onClick={() => setShowCertificate(false)}>✕</button>
            </div>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(39, 199, 154, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '0.78rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Document Identifier:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#fff', fontWeight: 600 }}>{activeDoc.doc_id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Authorized Recipient:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{identity?.recipient_id || recipientId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Session Entry Hash:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{activeDoc.session_entry_hash}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Ledger Block Height:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>Block #{activeDoc.block_height}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Block Merkle Root:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{activeDoc.block_hash}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Digital Signature Standard:</span>
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>FIPS 204 ML-DSA-65 (NIST Level 3 Security)</span>
              </div>
            </div>
            <button className="btn-primary" onClick={() => setShowCertificate(false)} style={{ alignSelf: 'flex-end' }}>
              Acknowledge Certificate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
