import React, { useState, useEffect, useRef } from 'react';

const API_BASE = '';

export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = sessionStorage.getItem('sigil_officer_session');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState('cluster');
  
  // Auth state
  const [loginUser, setLoginUser] = useState('officer_admin');
  const [loginPass, setLoginPass] = useState('SigilAdmin2026!#');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Cluster state
  const [clusterData, setClusterData] = useState(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Distribution state
  const [distFile, setDistFile] = useState(null);
  const [distDocId, setDistDocId] = useState(`DOC_DEFENSE_${Math.floor(1000 + Math.random() * 9000)}`);
  const [enrolledRecipients, setEnrolledRecipients] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState(new Set(['OFFICER_ALICE', 'OFFICER_BOB']));
  const [customRecipient, setCustomRecipient] = useState('');
  const [linesPerBlock, setLinesPerBlock] = useState(3);
  const [distributing, setDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [distributeError, setDistributeError] = useState('');

  // Forensics state
  const [suspectFile, setSuspectFile] = useState(null);
  const [forensicDocId, setForensicDocId] = useState('');
  const [forensicLines, setForensicLines] = useState(3);
  const [analyzing, setAnalyzing] = useState(false);
  const [forensicResult, setForensicResult] = useState(null);
  const [forensicError, setForensicError] = useState('');

  // Catalog state
  const [catalogDocs, setCatalogDocs] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const fileInputRef = useRef(null);
  const forensicInputRef = useRef(null);

  // Helper: authenticated headers
  const getAuthHeaders = () => {
    if (!auth?.access_token) return {};
    return { 'Authorization': `Bearer ${auth.access_token}` };
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(err.detail || 'Invalid username or password');
      }
      const data = await res.json();
      setAuth(data);
      sessionStorage.setItem('sigil_officer_session', JSON.stringify(data));
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      if (auth?.access_token) {
        await fetch(`${API_BASE}/api/admin/logout`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
    } catch (e) {
      // Ignore
    }
    setAuth(null);
    sessionStorage.removeItem('sigil_officer_session');
  };

  // Query cluster health
  const fetchClusterStatus = async () => {
    if (!auth) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/cluster`, { headers: getAuthHeaders() });
      if (res.status === 401) { handleLogout(); return; }
      if (res.ok) {
        const data = await res.json();
        setClusterData(data);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch cluster health:', err);
    }
  };

  // Query enrolled recipients
  const fetchRecipients = async () => {
    if (!auth) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/recipients`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEnrolledRecipients(data.recipients || []);
      }
    } catch (err) {
      console.error('Failed to fetch recipients:', err);
    }
  };

  // Query document catalog
  const fetchCatalog = async () => {
    if (!auth) return;
    setCatalogLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/documents`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCatalogDocs(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents catalog:', err);
    } finally {
      setCatalogLoading(false);
    }
  };

  // Initial & periodic polling
  useEffect(() => {
    if (!auth) return;
    fetchClusterStatus();
    fetchRecipients();
    fetchCatalog();

    const interval = setInterval(() => {
      fetchClusterStatus();
    }, 3500);

    return () => clearInterval(interval);
  }, [auth]);

  // Recipient chip toggle
  const toggleRecipient = (rId) => {
    const next = new Set(selectedRecipients);
    if (next.has(rId)) {
      if (next.size > 1) next.delete(rId);
    } else {
      next.add(rId);
    }
    setSelectedRecipients(next);
  };

  const addCustomRecipient = (e) => {
    e.preventDefault();
    if (customRecipient.trim()) {
      const formatted = customRecipient.trim().toUpperCase().replace(/\s+/g, '_');
      setSelectedRecipients(prev => new Set([...prev, formatted]));
      setCustomRecipient('');
    }
  };

  // Document distribution submit
  const handleDistribute = async (e) => {
    e.preventDefault();
    if (!distFile) {
      setDistributeError('Please select a classified PDF document to distribute.');
      return;
    }
    if (selectedRecipients.size === 0) {
      setDistributeError('At least one recipient identity must be selected.');
      return;
    }

    setDistributing(true);
    setDistributeError('');
    setDistributeResult(null);

    const formData = new FormData();
    formData.append('pdf_file', distFile);
    formData.append('doc_id', distDocId.trim());
    formData.append('recipients', Array.from(selectedRecipients).join(','));
    formData.append('lines_per_block', linesPerBlock.toString());

    try {
      const res = await fetch(`${API_BASE}/api/admin/distribute`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Distribution failed' }));
        throw new Error(err.detail || 'Distribution failed');
      }
      const data = await res.json();
      setDistributeResult(data);
      fetchCatalog();
      fetchClusterStatus();
    } catch (err) {
      setDistributeError(err.message);
    } finally {
      setDistributing(false);
    }
  };

  // Forensic attribution submit
  const handleForensicAttribute = async (e) => {
    e.preventDefault();
    if (!suspectFile) {
      setForensicError('Please upload a suspect leaked PDF file for forensic analysis.');
      return;
    }

    setAnalyzing(true);
    setForensicError('');
    setForensicResult(null);

    const formData = new FormData();
    formData.append('pdf_file', suspectFile);
    if (forensicDocId.trim()) {
      formData.append('doc_id', forensicDocId.trim());
    }
    formData.append('lines_per_block', forensicLines.toString());

    try {
      const res = await fetch(`${API_BASE}/api/admin/forensics/upload_and_attribute`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Forensic analysis failed' }));
        throw new Error(err.detail || 'Forensic analysis failed');
      }
      const data = await res.json();
      setForensicResult(data);
    } catch (err) {
      setForensicError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Export forensic certificate as JSON
  const downloadForensicReport = () => {
    if (!forensicResult) return;
    const blob = new Blob([JSON.stringify(forensicResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SIGIL_FORENSIC_CERTIFICATE_${forensicResult.culprit || 'UNMARKED'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Authenticated file download for .sigil containers
  const handleDownloadSigil = async (downloadUrl, filename) => {
    try {
      const separator = downloadUrl.includes('?') ? '&' : '?';
      const url = `${API_BASE}${downloadUrl}${separator}token=${encodeURIComponent(authToken || '')}`;
      const res = await fetch(url, {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename || 'document.sigil';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(`Could not download container: ${err.message}`);
    }
  };

  // Render: Login Screen if unauthenticated
  if (!auth) {
    return (
      <div>
        <div className="classification-banner">
          RESTRICTED // SIH26237 DEFENSE CUSTODY // POST-QUANTUM FORENSIC LEDGER
        </div>
        <div className="login-wrapper">
          <div className="login-card fade-in">
            <div className="login-header">
              <div className="login-logo">Σ</div>
              <h1 className="brand-title" style={{ fontSize: '1.4rem' }}>SIGIL Command Console</h1>
              <p className="brand-subtitle" style={{ marginTop: '4px' }}>Security Officer Authentication</p>
            </div>

            {loginError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.84rem',
                marginBottom: '18px'
              }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Officer Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="e.g. officer_admin"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Passphrase / Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Enter officer master passphrase"
                  required
                />
              </div>

              <div style={{
                background: 'rgba(6, 182, 212, 0.05)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.74rem',
                color: 'var(--text-dim)',
                marginBottom: '20px',
                fontFamily: 'var(--font-mono)'
              }}>
                AUTH PROTOCOL: PBKDF2-HMAC-SHA256 (100,000 rounds) + HMAC-SHA256 Session Tokens
              </div>

              <button type="submit" className="btn-primary" disabled={loginLoading}>
                {loginLoading ? 'Authenticating...' : 'Access Command Console →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Calculate cluster summary
  const onlineCount = clusterData?.online_nodes || 0;
  const totalNodes = clusterData?.total_nodes || 4;
  const isQuorumHealthy = clusterData?.quorum_healthy || false;

  return (
    <div>
      {/* Top Classification Banner */}
      <div className="classification-banner">
        RESTRICTED // SIH26237 DEFENSE CUSTODY // POST-QUANTUM FORENSIC LEDGER // TOP SECRET
      </div>

      {/* Navigation Header */}
      <header className="nav-header">
        <div className="brand-section">
          <div className="brand-logo">Σ</div>
          <div>
            <div className="brand-title">SIGIL Command Console</div>
            <div className="brand-subtitle">
              <span className={`status-dot ${isQuorumHealthy ? 'online' : 'offline'}`} style={{ marginRight: '6px' }}></span>
              {isQuorumHealthy ? `${onlineCount}/${totalNodes} NODES ONLINE • BFT QUORUM HEALTHY` : 'QUORUM DEGRADED'}
            </div>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'cluster' ? 'active' : ''}`}
            onClick={() => setActiveTab('cluster')}
          >
            Cluster Health
          </button>
          <button
            className={`tab-btn ${activeTab === 'distribute' ? 'active' : ''}`}
            onClick={() => setActiveTab('distribute')}
          >
            Distribute Document
          </button>
          <button
            className={`tab-btn ${activeTab === 'forensics' ? 'active' : ''}`}
            onClick={() => setActiveTab('forensics')}
          >
            Forensic Attribution
          </button>
          <button
            className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => { setActiveTab('catalog'); fetchCatalog(); }}
          >
            Catalog ({catalogDocs.length})
          </button>
        </nav>

        <div className="user-profile-badge">
          <div className="officer-info">
            <div className="officer-name">{auth.full_name || auth.username}</div>
            <div className="officer-role">{auth.role}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Log Out">
            Exit
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-container">

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: CLUSTER HEALTH & TELEMETRY */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'cluster' && (
          <div className="fade-in">
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 className="panel-title">4-Node Byzantine Fault Tolerant Cluster</h2>
                  <p className="panel-description">
                    Pure network consensus over HTTP. Tolerates up to f=1 offline or compromised node without loss of liveness.
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={fetchClusterStatus}
                    className="chip-btn"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--cyan)' }}
                  >
                    ↻ Refresh Telemetry
                  </button>
                  {lastRefreshed && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      Last poll: {lastRefreshed}
                    </div>
                  )}
                </div>
              </div>

              {/* BFT Gauge Bar */}
              <div style={{
                background: '#090e17',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Byzantine Quorum Threshold
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#fff', marginTop: '2px' }}>
                    3 of 4 Signatures Required (3f + 1 = 4)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{
                    background: isQuorumHealthy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isQuorumHealthy ? 'var(--emerald)' : 'var(--crimson)',
                    border: `1px solid ${isQuorumHealthy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '700'
                  }}>
                    {isQuorumHealthy ? '✓ QUORUM OPERATIONAL' : '⚠ QUORUM HALTED'}
                  </span>
                </div>
              </div>

              {/* 4-Node Cards Grid */}
              <div className="cluster-grid">
                {clusterData?.nodes?.map((node) => (
                  <div
                    key={node.node_id}
                    className={`node-card ${node.online ? 'healthy' : 'down'}`}
                  >
                    <div className="node-header">
                      <div>
                        <div className="node-title">{node.node_id}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{node.label}</div>
                      </div>
                      <span className={`node-badge ${node.online ? 'online' : 'offline'}`}>
                        {node.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    <div className="node-meta-row">
                      <span className="meta-key">Endpoint</span>
                      <span className="meta-val">{node.url}</span>
                    </div>
                    <div className="node-meta-row">
                      <span className="meta-key">Chain Height</span>
                      <span className="meta-val">
                        {node.chain_height !== null ? `Block #${node.chain_height}` : '—'}
                      </span>
                    </div>
                    <div className="node-meta-row">
                      <span className="meta-key">Shamir Share</span>
                      <span className="meta-val">Index #{node.index}</span>
                    </div>
                    <div className="node-meta-row">
                      <span className="meta-key">Integrity</span>
                      <span className="meta-val" style={{ color: node.integrity_healthy ? 'var(--emerald)' : 'var(--crimson)' }}>
                        {node.integrity_healthy ? 'SHA3 Chain OK' : (node.online ? 'Corrupted' : 'Unreachable')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: DISTRIBUTE DOCUMENT */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'distribute' && (
          <div className="fade-in">
            <div className="glass-panel">
              <h2 className="panel-title">Classified Document Distribution Portal</h2>
              <p className="panel-description">
                Splits PDF encryption key into Shamir 3-of-4 shares, deposits them across the BFT cluster, and produces a protected .sigil container.
              </p>

              {distributeError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '20px'
                }}>
                  {distributeError}
                </div>
              )}

              <form onSubmit={handleDistribute}>
                {/* PDF File Dropzone */}
                <div className="form-group">
                  <label className="form-label">1. Classified Source PDF</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setDistFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className="dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="dropzone-icon">📄</div>
                    <div className="dropzone-text">
                      {distFile ? distFile.name : 'Click to Browse or Drag & Drop Classified PDF'}
                    </div>
                    <div className="dropzone-hint">
                      {distFile ? `${(distFile.size / 1024).toFixed(1)} KB • Ready for Watermarking` : 'Standard PDF 1.4 - 2.0 • Max 50 MB'}
                    </div>
                  </div>
                </div>

                {/* Document Identifier */}
                <div className="form-group">
                  <label className="form-label">2. Unique Document Identifier (Doc ID)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={distDocId}
                    onChange={(e) => setDistDocId(e.target.value)}
                    placeholder="e.g. DOC_DEFENSE_DIRECTIVE_2026"
                    required
                  />
                </div>

                {/* Enrolled Recipients Picker */}
                <div className="form-group">
                  <label className="form-label">
                    3. Authorized Enrolled Recipients ({selectedRecipients.size} Selected)
                  </label>
                  <div className="chips-container">
                    {enrolledRecipients.map((r) => {
                      const isSelected = selectedRecipients.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`chip-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleRecipient(r.id)}
                        >
                          <span>{isSelected ? '✓' : '+'}</span>
                          <span>{r.label}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>({r.role})</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Add Custom Recipient */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ maxWidth: '280px', padding: '6px 10px', fontSize: '0.8rem' }}
                      value={customRecipient}
                      onChange={(e) => setCustomRecipient(e.target.value)}
                      placeholder="Add other Officer ID (e.g. OFFICER_EVE)"
                    />
                    <button
                      type="button"
                      onClick={addCustomRecipient}
                      className="chip-btn"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    >
                      + Add Recipient
                    </button>
                  </div>
                </div>

                {/* Watermarking Density */}
                <div className="form-group" style={{ maxWidth: '320px' }}>
                  <label className="form-label">4. Watermark Density (Lines per Block)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-input"
                    value={linesPerBlock}
                    onChange={(e) => setLinesPerBlock(parseInt(e.target.value) || 1)}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Recommended: 3 lines/block for optimal leak tracing SNR.
                  </div>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={distributing || !distFile}
                >
                  {distributing ? 'Encrypting with ML-KEM-768 & Depositing Shares...' : '⚡ Generate .sigil Container & Commit to Ledger'}
                </button>
              </form>

              {/* Distribution Results Card */}
              {distributeResult && (
                <div style={{
                  marginTop: '28px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '10px',
                  padding: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'var(--emerald)', fontWeight: '700', fontSize: '1.05rem' }}>
                        ✓ Document Successfully Encrypted & Distributed
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Manifest registered at Block #{distributeResult.block_height} • {distributeResult.nodes_deposited}/4 Nodes Deposited
                      </div>
                    </div>
                    <a
                      href={`${API_BASE}${distributeResult.download_url}?token=${encodeURIComponent(authToken || '')}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadSigil(distributeResult.download_url, distributeResult.filename);
                      }}
                      download={distributeResult.filename}
                      className="btn-primary"
                      style={{ width: 'auto', padding: '10px 20px', background: 'var(--emerald)', cursor: 'pointer' }}
                    >
                      ⬇ Download {distributeResult.filename}
                    </a>
                  </div>

                  <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#090e17', padding: '10px 14px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Container Size</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#fff' }}>
                        {(distributeResult.container_size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div style={{ background: '#090e17', padding: '10px 14px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Manifest Entry Hash</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--cyan)' }}>
                        {distributeResult.manifest_entry_hash?.slice(0, 16)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: FORENSIC LEAK ATTRIBUTION */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'forensics' && (
          <div className="fade-in">
            <div className="glass-panel">
              <h2 className="panel-title">Forensic Leak Attribution Laboratory</h2>
              <p className="panel-description">
                Extract imperceptible sub-millimeter word spacing shifts from a leaked suspect PDF and correlate against all ledger session entries.
              </p>

              {forensicError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '20px'
                }}>
                  {forensicError}
                </div>
              )}

              <form onSubmit={handleForensicAttribute}>
                {/* Upload Suspect PDF */}
                <div className="form-group">
                  <label className="form-label">1. Suspect Leaked Document / Photo Scan</label>
                  <input
                    type="file"
                    ref={forensicInputRef}
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSuspectFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className="dropzone"
                    onClick={() => forensicInputRef.current?.click()}
                  >
                    <div className="dropzone-icon">🔍</div>
                    <div className="dropzone-text">
                      {suspectFile ? suspectFile.name : 'Upload Suspect Leaked PDF File'}
                    </div>
                    <div className="dropzone-hint">
                      {suspectFile ? `${(suspectFile.size / 1024).toFixed(1)} KB • Ready for Tardos Extraction` : 'Upload PDF intercepted from external leak source'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Optional: Filter by Document ID</label>
                    <input
                      type="text"
                      className="form-input"
                      value={forensicDocId}
                      onChange={(e) => setForensicDocId(e.target.value)}
                      placeholder="Leave blank to match against latest distributed document"
                    />
                  </div>
                  <div className="form-group" style={{ width: '160px' }}>
                    <label className="form-label">Lines Per Block</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="form-input"
                      value={forensicLines}
                      onChange={(e) => setForensicLines(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={analyzing || !suspectFile}
                  style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)' }}
                >
                  {analyzing ? 'Extracting Sub-Millimeter Shifts & Calculating Tardos Scores...' : '🔬 Analyze Watermark & Attribute Culprit'}
                </button>
              </form>

              {/* Forensic Analysis Results */}
              {forensicResult && (
                <div style={{ marginTop: '28px' }} className="fade-in">
                  
                  {/* Verdict Banner */}
                  {forensicResult.status === 'ATTRIBUTED' ? (
                    <div className="verdict-banner attributed">
                      <div className="verdict-icon">🚨</div>
                      <div style={{ flex: 1 }}>
                        <div className="verdict-title red">
                          LEAK CONFIRMED: ATTRIBUTED TO {forensicResult.culprit}
                        </div>
                        <div className="verdict-sub">
                          {forensicResult.verdict}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                          <span>Confidence: <strong>{forensicResult.matchScore}</strong></span>
                          <span>Separation Margin: <strong>{forensicResult.separation_margin}</strong></span>
                          <span>P(False Accusation): <strong>{forensicResult.p_value}</strong></span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="verdict-banner unmarked">
                      <div className="verdict-icon">ℹ️</div>
                      <div style={{ flex: 1 }}>
                        <div className="verdict-title amber">
                          NO WATERMARK DETECTED / INCONCLUSIVE
                        </div>
                        <div className="verdict-sub">
                          {forensicResult.verdict}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Candidate Correlation Bar Chart */}
                  {forensicResult.all_candidates && forensicResult.all_candidates.length > 0 && (
                    <div style={{
                      background: '#090e17',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '20px',
                      marginTop: '20px'
                    }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
                        Candidate Correlation Analysis
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Statistical correlation of extracted word shifts against each officer's assigned Tardos codeword.
                      </p>

                      <div className="chart-container">
                        {forensicResult.all_candidates.map((cand) => {
                          const isTop = cand.recipient_id === forensicResult.culprit;
                          return (
                            <div key={cand.recipient_id} className="chart-row">
                              <div className="chart-label" style={{ color: isTop ? '#f87171' : 'var(--text-main)' }}>
                                {isTop ? '🔴 ' : '⚪ '}{cand.recipient_id}
                              </div>
                              <div className="chart-bar-bg">
                                <div
                                  className={`chart-bar-fill ${isTop ? 'culprit' : 'innocent'}`}
                                  style={{ width: `${Math.max(10, cand.match_percentage)}%` }}
                                ></div>
                              </div>
                              <div className="chart-score" style={{ color: isTop ? '#f87171' : 'var(--text-muted)' }}>
                                {cand.match_percentage}% ({cand.matches}/{cand.total_blocks})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Legal Validity Proof Card */}
                  <div className="legal-card">
                    <div className="legal-header">
                      <span>⚖</span>
                      <span>Legal Admissibility Proof (Section 63 Bharatiya Sakshya Adhiniyam, 2023)</span>
                    </div>
                    <div className="legal-body">
                      <div><strong>Ledger Block Height:</strong> #{forensicResult.blockHeight || 'N/A'}</div>
                      <div><strong>Session Entry Hash:</strong> <code style={{ fontFamily: 'var(--font-mono)' }}>{forensicResult.sessionEntryHash || 'N/A'}</code></div>
                      <div><strong>Analyzed File SHA-256:</strong> <code style={{ fontFamily: 'var(--font-mono)' }}>{forensicResult.leaked_file_hash || 'N/A'}</code></div>
                      <div style={{ marginTop: '6px' }}><strong>Statutory Verdict:</strong> {forensicResult.legalValidity}</div>
                    </div>
                    <div style={{ marginTop: '12px', textAlign: 'right' }}>
                      <button onClick={downloadForensicReport} className="chip-btn" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--emerald)' }}>
                        ⬇ Download Signed Forensic Certificate (JSON)
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: DOCUMENT CATALOG */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'catalog' && (
          <div className="fade-in">
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 className="panel-title">Distributed Document Catalog</h2>
                  <p className="panel-description">
                    Encrypted .sigil containers residing in custody. Each container requires 3-of-4 node quorum to unlock.
                  </p>
                </div>
                <button onClick={fetchCatalog} className="chip-btn">
                  ↻ Refresh Catalog
                </button>
              </div>

              {catalogDocs.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-dim)',
                  fontSize: '0.9rem'
                }}>
                  No documents distributed yet. Use the <strong>Distribute Document</strong> tab to generate your first container.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Document ID</th>
                      <th>Filename</th>
                      <th>Container Size</th>
                      <th>Distribution Timestamp</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogDocs.map((doc) => (
                      <tr key={doc.doc_id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          {doc.doc_id}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {doc.filename}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {(doc.size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                          {new Date(doc.created_at * 1000).toLocaleString()}
                        </td>
                        <td>
                          <a
                            href={`${API_BASE}${doc.download_url}?token=${encodeURIComponent(authToken || '')}`}
                            onClick={(e) => {
                              e.preventDefault();
                              handleDownloadSigil(doc.download_url, doc.filename);
                            }}
                            download={doc.filename}
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                          >
                            ⬇ Download .sigil
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
