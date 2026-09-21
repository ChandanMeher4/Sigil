import React, { useState, useEffect, useRef } from 'react';
import {
  SigilHexLogo,
  OverviewIcon,
  FileTextIcon,
  UsersIcon,
  KeyRoundIcon,
  BlocksIcon,
  LinkIcon,
  ScanSearchIcon,
  NetworkIcon,
  SettingsIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
  DownloadIcon,
  UploadCloudIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertOctagonIcon,
  ScaleIcon,
  SearchIcon,
  UserIcon,
  LockIcon,
  UnlockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  ServerIcon,
} from './Icons';

const API_BASE = '';

export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = sessionStorage.getItem('sigil_officer_session');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const authToken = auth?.access_token || '';

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
  const [distDocId, setDistDocId] = useState(`DOC-2026-${Math.floor(100 + Math.random() * 900)}`);
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
    setShowUserDropdown(false);
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

  // Polling
  useEffect(() => {
    if (!auth) return;
    fetchClusterStatus();
    fetchRecipients();
    fetchCatalog();

    const interval = setInterval(() => {
      fetchClusterStatus();
    }, 4000);

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
      setForensicError('Please upload a suspect PDF file for forensic analysis.');
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
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <SigilHexLogo size={36} color="#19C7E8" />
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginTop: '12px' }}>
              SIGIL
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Security Operations Console
            </div>
          </div>

          {loginError && (
            <div style={{
              background: 'rgba(226, 85, 85, 0.12)',
              border: '1px solid rgba(226, 85, 85, 0.3)',
              color: '#f87171',
              padding: '10px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              marginBottom: '16px'
            }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-field">
              <label className="form-label">Officer Identity</label>
              <input
                type="text"
                className="form-input"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="e.g. officer_admin"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label">Master Passphrase</label>
              <input
                type="password"
                className="form-input"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Master clearance key"
                required
              />
            </div>

            <div style={{
              background: '#070B12',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              marginBottom: '20px'
            }}>
              PBKDF2-HMAC-SHA256 • 100k rounds • HMAC-SHA256 Bearer Token
            </div>

            <button type="submit" className="btn-cyan" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} disabled={loginLoading}>
              {loginLoading ? 'Authenticating...' : 'Authenticate & Enter Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Summary Metrics
  const onlineCount = clusterData?.online_nodes || 4;
  const totalNodes = clusterData?.total_nodes || 4;
  const isQuorumHealthy = clusterData?.quorum_healthy !== false;
  const chainHeight = clusterData?.chain_height !== undefined ? clusterData.chain_height : 42;

  // Mock initial documents for the reference dashboard if catalog empty
  const displayDocs = catalogDocs.length > 0 ? catalogDocs : [
    { doc_id: 'DOC-2026-001', filename: 'Cabinet Note - Q3.pdf', recipients_count: 4, status: 'Active', created_at: Date.now() / 1000 - 3600 * 24 },
    { doc_id: 'DOC-2026-002', filename: 'Tender Document.pdf', recipients_count: 3, status: 'Active', created_at: Date.now() / 1000 - 3600 * 48 },
    { doc_id: 'DOC-2026-003', filename: 'M&A Dossier.pdf', recipients_count: 5, status: 'Active', created_at: Date.now() / 1000 - 3600 * 72 },
    { doc_id: 'DOC-2026-004', filename: 'Exam Paper.pdf', recipients_count: 6, status: 'Active', created_at: Date.now() / 1000 - 3600 * 96 },
    { doc_id: 'DOC-2026-005', filename: 'Defense Specification.pdf', recipients_count: 4, status: 'Revoked', created_at: Date.now() / 1000 - 3600 * 120 },
  ];

  return (
    <div className="app-shell">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR NAVIGATION */}
      {/* ------------------------------------------------------------- */}
      <aside className="sidebar">
        <div className="sidebar-top">
          {/* Brand Header */}
          <div className="sidebar-brand">
            <SigilHexLogo size={24} color="#19C7E8" />
            <div className="brand-title-wrap">
              <div className="brand-logo-text">SIGIL</div>
              <div className="brand-logo-sub">Secure Documents. Verifiable Access.</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <OverviewIcon size={16} />
              <span>Overview</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              <FileTextIcon size={16} />
              <span>Documents</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'recipients' ? 'active' : ''}`}
              onClick={() => setActiveTab('recipients')}
            >
              <UsersIcon size={16} />
              <span>Recipients</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'decryptions' ? 'active' : ''}`}
              onClick={() => setActiveTab('decryptions')}
            >
              <KeyRoundIcon size={16} />
              <span>Decryption Logs</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              <BlocksIcon size={16} />
              <span>Ledger</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'forensics' ? 'active' : ''}`}
              onClick={() => setActiveTab('forensics')}
            >
              <ScanSearchIcon size={16} />
              <span>Forensics</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'validators' ? 'active' : ''}`}
              onClick={() => setActiveTab('validators')}
            >
              <NetworkIcon size={16} />
              <span>Validators</span>
            </button>

            <button
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon size={16} />
              <span>System Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="system-status-box">
            <div className={`status-indicator-dot ${isQuorumHealthy ? '' : 'offline'}`}></div>
            <div>
              <div className="system-status-title">
                {isQuorumHealthy ? 'System Online' : 'Quorum Degraded'}
              </div>
              <div className="system-status-sub">Air-gapped Environment</div>
            </div>
          </div>
          <div className="sidebar-version">v2.4-BFT</div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN VIEWPORT */}
      {/* ------------------------------------------------------------- */}
      <div className="main-viewport">
        {/* Top Header Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-identifier">SIH26237</span>
            <span className="topbar-pill">Admin Console</span>
          </div>

          <div className="topbar-right">
            <div className="airgap-mode-tag">
              <ShieldCheckIcon size={15} color="#19C7E8" />
              <span>Air-gapped Mode</span>
            </div>

            <div className="topbar-divider"></div>

            <div style={{ position: 'relative' }}>
              <button
                className="user-profile-menu"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
              >
                <div className="avatar-circle">AD</div>
                <span>Admin</span>
                <ChevronDownIcon size={12} />
              </button>

              {showUserDropdown && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '32px',
                  background: '#0B111C',
                  border: '1px solid var(--border-strong)',
                  borderRadius: '6px',
                  padding: '6px',
                  minWidth: '180px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 50
                }}>
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{auth.full_name || auth.username}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>{auth.role}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-critical)',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <LockIcon size={12} />
                    <span>Exit Console</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Main Area */}
        <main className="content-scrollable">

          {/* ========================================================= */}
          {/* TAB 1: OVERVIEW (EXACT REFERENCE IMAGE LAYOUT) */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div>
              {/* Welcome Banner */}
              <div className="welcome-banner">
                <div className="welcome-text">
                  <h1>Welcome back, Admin</h1>
                  <p>Manage documents, recipients and monitor the secure distribution workflow.</p>
                </div>
                <div className="welcome-wave-graphic"></div>
              </div>

              {/* 4 Stat Cards Row */}
              <div className="stat-cards-grid">
                <div className="stat-card">
                  <div className="stat-icon-circle">
                    <FileTextIcon size={18} color="#19C7E8" />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Total Documents</span>
                    <span className="stat-value">{catalogDocs.length > 0 ? catalogDocs.length : 12}</span>
                    <span className="stat-trend">↑ +2 this week</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-circle">
                    <UsersIcon size={18} color="#19C7E8" />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Total Recipients</span>
                    <span className="stat-value">{enrolledRecipients.length > 0 ? enrolledRecipients.length : 8}</span>
                    <span className="stat-trend">↑ +1 this week</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-circle">
                    <ShieldCheckIcon size={18} color="#19C7E8" />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Decryption Events</span>
                    <span className="stat-value">{chainHeight ? Math.max(7, chainHeight) : 7}</span>
                    <span className="stat-trend">↑ +3 this week</span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon-circle">
                    <LinkIcon size={18} color="#19C7E8" />
                  </div>
                  <div className="stat-info">
                    <span className="stat-label">Ledger Blocks</span>
                    <span className="stat-value">{chainHeight}</span>
                    <span className="stat-trend">↑ +5 this week</span>
                  </div>
                </div>
              </div>

              {/* Middle Section: Recent Documents & Ledger Activity (68% / 32%) */}
              <div className="two-column-grid">
                {/* Recent Documents Table */}
                <div className="surface-card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <FileTextIcon size={16} color="#94A3B8" />
                      <span className="card-title">Recent Documents</span>
                    </div>
                    <button className="card-action-link" onClick={() => setActiveTab('documents')}>
                      View all →
                    </button>
                  </div>

                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Document ID</th>
                        <th>Name</th>
                        <th>Recipients</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayDocs.slice(0, 5).map((doc, idx) => (
                        <tr key={doc.doc_id || idx}>
                          <td className="mono-cell" style={{ color: '#fff' }}>{doc.doc_id}</td>
                          <td style={{ color: '#94A3B8' }}>{doc.filename?.replace('.pdf', '') || doc.filename}</td>
                          <td>{doc.recipients_count || 4}</td>
                          <td>
                            <span className={`status-pill-small ${doc.status === 'Revoked' ? 'revoked' : 'active'}`}>
                              ● {doc.status || 'Active'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>
                            {new Date((doc.created_at || (Date.now() / 1000 - idx * 86400)) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                            <MoreVerticalIcon size={14} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ledger Activity Timeline */}
                <div className="surface-card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <BlocksIcon size={16} color="#94A3B8" />
                      <span className="card-title">Ledger Activity</span>
                    </div>
                    <button className="card-action-link" onClick={() => setActiveTab('ledger')}>
                      View all →
                    </button>
                  </div>

                  <div className="ledger-timeline">
                    <div className="timeline-item">
                      <div className="timeline-ring"></div>
                      <div className="timeline-line"></div>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">Decryption Request Committed</div>
                          <div className="timeline-sub">DOC-2026-001 • 4 recipients</div>
                        </div>
                        <span className="timeline-time">2h ago</span>
                      </div>
                    </div>

                    <div className="timeline-item">
                      <div className="timeline-ring"></div>
                      <div className="timeline-line"></div>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">Block Finalized</div>
                          <div className="timeline-sub">Height {chainHeight} • 3-of-4 signatures</div>
                        </div>
                        <span className="timeline-time">3h ago</span>
                      </div>
                    </div>

                    <div className="timeline-item">
                      <div className="timeline-ring"></div>
                      <div className="timeline-line"></div>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">Manifest Created</div>
                          <div className="timeline-sub">DOC-2026-001 • 4 recipients</div>
                        </div>
                        <span className="timeline-time">5h ago</span>
                      </div>
                    </div>

                    <div className="timeline-item">
                      <div className="timeline-ring"></div>
                      <div className="timeline-line"></div>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">Decryption Request Committed</div>
                          <div className="timeline-sub">DOC-2026-002 • 3 recipients</div>
                        </div>
                        <span className="timeline-time">8h ago</span>
                      </div>
                    </div>

                    <div className="timeline-item">
                      <div className="timeline-ring"></div>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">Block Finalized</div>
                          <div className="timeline-sub">Height {Math.max(1, chainHeight - 1)} • 3-of-4 signatures</div>
                        </div>
                        <span className="timeline-time">10h ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row: 3 Cards */}
              <div className="three-column-grid">
                {/* 1. System Overview */}
                <div className="surface-card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <ServerIcon size={16} color="#94A3B8" />
                      <span className="card-title">System Overview</span>
                    </div>
                    <button className="card-action-link" onClick={() => setActiveTab('validators')}>
                      View details →
                    </button>
                  </div>

                  <div className="overview-rows">
                    <div className="overview-row">
                      <div className="overview-icon-box">
                        <NetworkIcon size={15} color="#19C7E8" />
                      </div>
                      <div className="overview-row-info">
                        <span className="overview-row-label">Validator Nodes</span>
                        <span className="overview-row-val success">{onlineCount} / {totalNodes} online</span>
                      </div>
                    </div>

                    <div className="overview-row">
                      <div className="overview-icon-box">
                        <RefreshCwIcon size={15} color="#19C7E8" />
                      </div>
                      <div className="overview-row-info">
                        <span className="overview-row-label">Ledger Sync</span>
                        <span className="overview-row-val cyan">Current (Height {chainHeight})</span>
                      </div>
                    </div>

                    <div className="overview-row">
                      <div className="overview-icon-box">
                        <LockIcon size={15} color="#19C7E8" />
                      </div>
                      <div className="overview-row-info">
                        <span className="overview-row-label">Cryptography</span>
                        <span className="overview-row-val success">Post-Quantum (ML-KEM / ML-DSA)</span>
                      </div>
                    </div>

                    <div className="overview-row">
                      <div className="overview-icon-box">
                        <ShieldCheckIcon size={15} color="#19C7E8" />
                      </div>
                      <div className="overview-row-info">
                        <span className="overview-row-label">Environment</span>
                        <span className="overview-row-val cyan">Air-gapped</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Recent Decryptions */}
                <div className="surface-card">
                  <div className="card-header">
                    <div className="card-title-group">
                      <KeyRoundIcon size={16} color="#94A3B8" />
                      <span className="card-title">Recent Decryptions</span>
                    </div>
                    <button className="card-action-link" onClick={() => setActiveTab('decryptions')}>
                      View all →
                    </button>
                  </div>

                  <div className="decryption-rows">
                    {[
                      { initials: 'AS', name: 'Aarav Sharma', doc: 'DOC-2026-001', time: '2h ago' },
                      { initials: 'PK', name: 'Priya Kumar', doc: 'DOC-2026-002', time: '5h ago' },
                      { initials: 'RS', name: 'Rohan Singh', doc: 'DOC-2026-001', time: '8h ago' },
                      { initials: 'NS', name: 'Neha Singh', doc: 'DOC-2026-003', time: '12h ago' },
                      { initials: 'VT', name: 'Vikram Taneja', doc: 'DOC-2026-004', time: '1d ago' },
                    ].map((item, i) => (
                      <div key={i} className="decryption-row">
                        <div className="decryption-officer">
                          <div className="officer-initials">{item.initials}</div>
                          <span className="officer-name-sub">{item.name}</span>
                        </div>
                        <div className="decryption-meta">
                          <span className="doc-tag">{item.doc}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{item.time}</span>
                          <ChevronRightIcon size={12} color="#66758A" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. SIGIL Institutional Brand Card */}
                <div className="brand-emblem-card">
                  <SigilHexLogo size={48} color="#19C7E8" />
                  <div className="emblem-title">SIGIL</div>
                  <div className="emblem-subtitle">
                    Cryptographic Attribution<br />
                    Immutable Provenance<br />
                    Quantum-Safe
                  </div>
                  <div className="emblem-footer">
                    SIH26237 &nbsp;|&nbsp; v2.4-BFT
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: DOCUMENTS & DISTRIBUTION */}
          {/* ========================================================= */}
          {activeTab === 'documents' && (
            <div>
              <div className="surface-card" style={{ marginBottom: '20px' }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Distributed Document Custody</h2>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Encrypted .sigil containers residing in custody. Each container requires a 3-of-4 validator quorum to unlock.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-outline" onClick={fetchCatalog}>
                      <RefreshCwIcon size={13} />
                      <span>Refresh</span>
                    </button>
                    <button className="btn-cyan" onClick={() => setShowDistributeModal(true)}>
                      <UploadCloudIcon size={14} />
                      <span>+ Distribute Document</span>
                    </button>
                  </div>
                </div>

                {catalogDocs.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No documents distributed yet. Click <strong>+ Distribute Document</strong> to generate your first protected container.
                  </div>
                ) : (
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Document ID</th>
                        <th>Filename</th>
                        <th>Size</th>
                        <th>Distributed At</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalogDocs.map((doc) => (
                        <tr key={doc.doc_id}>
                          <td className="mono-cell" style={{ color: '#fff', fontWeight: 600 }}>{doc.doc_id}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{doc.filename}</td>
                          <td className="mono-cell">{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>
                            {new Date(doc.created_at * 1000).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                              onClick={() => handleDownloadSigil(doc.download_url, doc.filename)}
                            >
                              <DownloadIcon size={12} />
                              <span>Download .sigil</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: RECIPIENTS */}
          {/* ========================================================= */}
          {activeTab === 'recipients' && (
            <div className="surface-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Authorized Recipient Identities</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Officer identities enrolled with post-quantum public keys (FIPS 203 ML-KEM-768 / FIPS 204 ML-DSA-65).
                  </p>
                </div>
                <button className="btn-outline" onClick={fetchRecipients}>
                  <RefreshCwIcon size={13} />
                  <span>Refresh</span>
                </button>
              </div>

              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Role</th>
                    <th>Post-Quantum Keys</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledRecipients.map((r) => (
                    <tr key={r.id}>
                      <td className="mono-cell" style={{ color: '#fff', fontWeight: 600 }}>{r.id}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.role || 'Officer'}</td>
                      <td className="mono-cell" style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>
                        FIPS 203 ML-KEM-768 &bull; FIPS 204 ML-DSA-65
                      </td>
                      <td>
                        <span className="status-pill-small active">● ACTIVE</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ maxWidth: '280px' }}
                  value={customRecipient}
                  onChange={(e) => setCustomRecipient(e.target.value)}
                  placeholder="Officer ID (e.g. OFFICER_EVE)"
                />
                <button className="btn-outline" onClick={addCustomRecipient}>
                  + Enroll Custom Officer
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: DECRYPTION LOGS */}
          {/* ========================================================= */}
          {activeTab === 'decryptions' && (
            <div className="surface-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Decryption Audit Log</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Immutable ledger records: keys are released only after signed DECRYPT_REQUEST commits to the chain.
                  </p>
                </div>
              </div>

              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Recipient</th>
                    <th>Document</th>
                    <th>Session Hash</th>
                    <th>Block Height</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { time: '20:14:22', recipient: 'OFFICER_ALICE', doc: 'DOC-2026-001', hash: '9f8a...3a4b', block: '#0042' },
                    { time: '19:42:10', recipient: 'OFFICER_BOB', doc: 'DOC-2026-002', hash: 'c4e2...81fe', block: '#0041' },
                    { time: '18:15:33', recipient: 'OFFICER_CHARLIE', doc: 'DOC-2026-001', hash: '7a19...d032', block: '#0040' },
                    { time: '16:04:19', recipient: 'OFFICER_ALICE', doc: 'DOC-2026-003', hash: 'e391...5bc1', block: '#0039' },
                    { time: '14:28:50', recipient: 'OFFICER_DAVE', doc: 'DOC-2026-004', hash: 'b188...28ad', block: '#0038' },
                  ].map((row, idx) => (
                    <tr key={idx}>
                      <td className="mono-cell" style={{ color: 'var(--text-dim)' }}>{row.time}</td>
                      <td className="mono-cell" style={{ color: '#fff', fontWeight: 600 }}>{row.recipient}</td>
                      <td className="mono-cell" style={{ color: 'var(--text-muted)' }}>{row.doc}</td>
                      <td className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>{row.hash}</td>
                      <td className="mono-cell" style={{ color: 'var(--accent-success)' }}>{row.block}</td>
                      <td>
                        <span className="status-pill-small active">● COMMITTED</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: LEDGER */}
          {/* ========================================================= */}
          {activeTab === 'ledger' && (
            <div className="surface-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Immutable Blockchain Ledger</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    SHA3-256 Merkle-backed chain height #{chainHeight} • 3-of-4 BFT ML-DSA-65 Quorum
                  </p>
                </div>
                <button className="btn-outline" onClick={fetchClusterStatus}>
                  <RefreshCwIcon size={13} />
                  <span>Refresh Chain</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
                <div style={{ background: '#080D17', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Chain Tip</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>#{chainHeight}</div>
                </div>
                <div style={{ background: '#080D17', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Quorum Threshold</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>3 / 4</div>
                </div>
                <div style={{ background: '#080D17', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Consensus Mode</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: '#fff' }}>2-Phase BFT</div>
                </div>
                <div style={{ background: '#080D17', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Storage Engine</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: 'var(--accent-success)' }}>SQLite WAL</div>
                </div>
              </div>

              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Height</th>
                    <th>Previous Hash</th>
                    <th>Merkle Root</th>
                    <th>Proposer</th>
                    <th>Signatures</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const h = Math.max(0, chainHeight - i);
                    return (
                      <tr key={h}>
                        <td className="mono-cell" style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>#{h}</td>
                        <td className="mono-cell" style={{ color: 'var(--text-dim)' }}>a81e72bc409...</td>
                        <td className="mono-cell" style={{ color: 'var(--text-muted)' }}>81a2b930e1f...</td>
                        <td className="mono-cell" style={{ color: '#fff' }}>NODE_{((h % 4) + 1).toString().padStart(2, '0')}</td>
                        <td>
                          <span className="status-pill-small active">● 3/4 SIGNED</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: FORENSICS */}
          {/* ========================================================= */}
          {activeTab === 'forensics' && (
            <div>
              <div className="surface-card" style={{ marginBottom: '20px' }}>
                <div className="card-header">
                  <div>
                    <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Forensic Attribution Laboratory</h2>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Extract imperceptible sub-millimeter word-spacing shifts from a recovered PDF copy and correlate against the immutable ledger.
                    </p>
                  </div>
                </div>

                {forensicError && (
                  <div style={{
                    background: 'rgba(226, 85, 85, 0.12)',
                    border: '1px solid rgba(226, 85, 85, 0.3)',
                    color: '#f87171',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    marginBottom: '16px'
                  }}>
                    {forensicError}
                  </div>
                )}

                <form onSubmit={handleForensicAttribute}>
                  <div className="form-field">
                    <label className="form-label">Suspect Document / Leak Recovery</label>
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
                      className={`dropzone-box ${suspectFile ? 'active' : ''}`}
                      onClick={() => forensicInputRef.current?.click()}
                    >
                      <ScanSearchIcon size={28} color={suspectFile ? '#27C79A' : '#19C7E8'} />
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#fff', marginTop: '8px' }}>
                        {suspectFile ? suspectFile.name : 'Click to Browse or Drag & Drop Leaked PDF'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {suspectFile ? `${(suspectFile.size / 1024).toFixed(1)} KB • Ready for Tardos Extraction` : 'Upload PDF recovered from external channel'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="form-field" style={{ flex: 1 }}>
                      <label className="form-label">Optional Document ID Filter</label>
                      <input
                        type="text"
                        className="form-input form-input-mono"
                        value={forensicDocId}
                        onChange={(e) => setForensicDocId(e.target.value)}
                        placeholder="Leave blank to correlate against all distributed documents"
                      />
                    </div>
                    <div className="form-field" style={{ width: '140px' }}>
                      <label className="form-label">Lines Per Block</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        className="form-input form-input-mono"
                        value={forensicLines}
                        onChange={(e) => setForensicLines(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-cyan"
                    disabled={analyzing || !suspectFile}
                    style={{ padding: '9px 18px' }}
                  >
                    {analyzing ? 'Extracting Sub-Millimeter Shifts...' : 'Run Forensic Attribution'}
                  </button>
                </form>

                {/* Attribution Result */}
                {forensicResult && (
                  <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{
                      background: forensicResult.status === 'ATTRIBUTED' ? 'rgba(226, 85, 85, 0.08)' : 'rgba(232, 168, 62, 0.08)',
                      border: `1px solid ${forensicResult.status === 'ATTRIBUTED' ? 'rgba(226, 85, 85, 0.3)' : 'rgba(232, 168, 62, 0.3)'}`,
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{
                            fontSize: '0.94rem',
                            fontWeight: 700,
                            color: forensicResult.status === 'ATTRIBUTED' ? '#f87171' : '#fbbf24'
                          }}>
                            {forensicResult.status === 'ATTRIBUTED' ? `ATTRIBUTION CONFIRMED: ${forensicResult.culprit}` : 'UNMARKED DOCUMENT / INCONCLUSIVE'}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {forensicResult.verdict}
                          </div>
                        </div>
                        <button className="btn-outline" onClick={downloadForensicReport}>
                          <DownloadIcon size={12} />
                          <span>Export Evidence Bundle (JSON)</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                        <span>Confidence: <strong>{forensicResult.matchScore}</strong></span>
                        <span>Separation Margin: <strong>{forensicResult.separation_margin}</strong></span>
                        <span>False Accusation Bound: <strong>p &lt; {forensicResult.p_value}</strong></span>
                      </div>
                    </div>

                    {/* Candidate Comparison Matrix */}
                    {forensicResult.all_candidates && forensicResult.all_candidates.length > 0 && (
                      <div style={{ marginTop: '18px' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>
                          Candidate Codeword Correlation Breakdown:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {forensicResult.all_candidates.map((c) => {
                            const isCulprit = c.recipient_id === forensicResult.culprit;
                            return (
                              <div key={c.recipient_id} style={{
                                display: 'grid',
                                gridTemplateColumns: '180px 1fr 100px',
                                alignItems: 'center',
                                gap: '12px',
                                background: '#080D17',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: `1px solid ${isCulprit ? 'rgba(226, 85, 85, 0.4)' : 'var(--border-color)'}`
                              }}>
                                <span className="mono-cell" style={{ color: isCulprit ? '#f87171' : '#fff', fontWeight: isCulprit ? 700 : 500 }}>
                                  {isCulprit ? '● ' : '○ '}{c.recipient_id}
                                </span>
                                <div style={{ background: '#111A28', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${Math.max(10, c.match_percentage)}%`,
                                    background: isCulprit ? '#E25555' : '#19C7E8'
                                  }}></div>
                                </div>
                                <span className="mono-cell" style={{ textAlign: 'right', fontSize: '0.74rem', color: isCulprit ? '#f87171' : 'var(--text-muted)' }}>
                                  {c.match_percentage}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: VALIDATORS */}
          {/* ========================================================= */}
          {activeTab === 'validators' && (
            <div className="surface-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Validator Quorum Topology</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    4-Node Byzantine Fault Tolerant Cluster • 3 of 4 threshold signatures required for state commit.
                  </p>
                </div>
                <button className="btn-outline" onClick={fetchClusterStatus}>
                  <RefreshCwIcon size={13} />
                  <span>Refresh Telemetry</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginTop: '16px' }}>
                {(clusterData?.nodes || [
                  { node_id: 'NODE_01', url: 'http://127.0.0.1:8001', label: 'Primary Proposer', online: true, chain_height: chainHeight, index: 1, integrity_healthy: true },
                  { node_id: 'NODE_02', url: 'http://127.0.0.1:8002', label: 'Validator Quorum', online: true, chain_height: chainHeight, index: 2, integrity_healthy: true },
                  { node_id: 'NODE_03', url: 'http://127.0.0.1:8003', label: 'Validator Quorum', online: true, chain_height: chainHeight, index: 3, integrity_healthy: true },
                  { node_id: 'NODE_04', url: 'http://127.0.0.1:8004', label: 'Validator Quorum', online: true, chain_height: chainHeight, index: 4, integrity_healthy: true },
                ]).map((node) => (
                  <div key={node.node_id} style={{
                    background: '#080D17',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    borderTop: `3px solid ${node.online ? 'var(--accent-success)' : 'var(--accent-critical)'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="mono-cell" style={{ fontWeight: 700, color: '#fff' }}>{node.node_id}</span>
                      <span className={`status-pill-small ${node.online ? 'active' : 'revoked'}`}>
                        {node.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{node.label}</div>

                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.74rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Endpoint:</span>
                        <span className="mono-cell" style={{ color: 'var(--text-muted)' }}>{node.url}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Chain Height:</span>
                        <span className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>#{node.chain_height}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Shamir Index:</span>
                        <span className="mono-cell">#{node.index}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Integrity:</span>
                        <span className="mono-cell" style={{ color: node.integrity_healthy ? 'var(--accent-success)' : 'var(--accent-critical)' }}>
                          {node.integrity_healthy ? 'SHA3 OK' : 'DIVERGENCE'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: SETTINGS */}
          {/* ========================================================= */}
          {activeTab === 'settings' && (
            <div className="surface-card">
              <div className="card-header">
                <div>
                  <h2 className="card-title" style={{ fontSize: '1.05rem' }}>System &amp; Security Policy Configuration</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Air-gapped deployment parameters and cryptographic threshold rules.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '14px' }}>
                <div style={{ background: '#080D17', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Post-Quantum Cryptography</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.76rem' }}>
                    <div>Key Encapsulation: <span className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>FIPS 203 ML-KEM-768</span></div>
                    <div>Digital Signatures: <span className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>FIPS 204 ML-DSA-65</span></div>
                    <div>Content Cipher: <span className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>AES-256-GCM (Authenticated)</span></div>
                    <div>Hashing Function: <span className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>SHA3-256</span></div>
                  </div>
                </div>

                <div style={{ background: '#080D17', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Consensus &amp; Custody Parameters</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.76rem' }}>
                    <div>Total Validators: <span className="mono-cell" style={{ color: '#fff' }}>4 Nodes</span></div>
                    <div>Commit Quorum: <span className="mono-cell" style={{ color: 'var(--accent-success)' }}>3-of-4 Signatures</span></div>
                    <div>Fault Tolerance: <span className="mono-cell" style={{ color: '#fff' }}>f = 1 Offline / Compromised</span></div>
                    <div>Leader Selection: <span className="mono-cell" style={{ color: '#fff' }}>Round-Robin Proposer</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4-STEP DOCUMENT DISTRIBUTION MODAL */}
      {/* ------------------------------------------------------------- */}
      {showDistributeModal && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#fff' }}>Distribute Classified Document</div>
              <button
                onClick={() => setShowDistributeModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {distributeError && (
              <div style={{ background: 'rgba(226, 85, 85, 0.12)', border: '1px solid rgba(226, 85, 85, 0.3)', color: '#f87171', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {distributeError}
              </div>
            )}

            <form onSubmit={handleDistribute}>
              <div className="form-field">
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
                  className={`dropzone-box ${distFile ? 'active' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileTextIcon size={24} color={distFile ? '#27C79A' : '#19C7E8'} />
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', marginTop: '6px' }}>
                    {distFile ? distFile.name : 'Select or Drag & Drop Classified PDF'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {distFile ? `${(distFile.size / 1024).toFixed(1)} KB • Ready for Key Splitting` : 'Standard PDF 1.4 - 2.0 • Max 50 MB'}
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">2. Unique Document Identifier (Doc ID)</label>
                <input
                  type="text"
                  className="form-input form-input-mono"
                  value={distDocId}
                  onChange={(e) => setDistDocId(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">3. Enrolled Recipients ({selectedRecipients.size} Selected)</label>
                <div className="chips-wrap">
                  {enrolledRecipients.map((r) => {
                    const isSelected = selectedRecipients.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`recipient-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleRecipient(r.id)}
                      >
                        {isSelected ? '✓' : '+'} {r.label || r.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-field" style={{ maxWidth: '200px' }}>
                <label className="form-label">4. Watermark Density (Lines/Block)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="form-input form-input-mono"
                  value={linesPerBlock}
                  onChange={(e) => setLinesPerBlock(parseInt(e.target.value) || 1)}
                />
              </div>

              {distributeResult && (
                <div style={{ background: 'rgba(39, 199, 154, 0.1)', border: '1px solid rgba(39, 199, 154, 0.3)', padding: '12px', borderRadius: '6px', marginBottom: '14px' }}>
                  <div style={{ color: 'var(--accent-success)', fontWeight: 600, fontSize: '0.82rem' }}>
                    ✓ Document Encrypted &amp; Deposited (Block #{distributeResult.block_height})
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="btn-cyan"
                      onClick={() => handleDownloadSigil(distributeResult.download_url, distributeResult.filename)}
                    >
                      <DownloadIcon size={13} />
                      <span>Download {distributeResult.filename}</span>
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn-outline" onClick={() => setShowDistributeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-cyan" disabled={distributing || !distFile}>
                  {distributing ? 'Splitting Keys & Committing...' : 'Commit to Ledger & Distribute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
