<#
.SYNOPSIS
    SIGIL Turnkey PowerShell Orchestrator.
.DESCRIPTION
    One-click runner for SIGIL cluster, tests, benchmarks, demonstrations,
    Windows DRM reader, and offline evidence verification.
.PARAMETER Mode
    Execution mode: demo, cluster, test, benchmark, verify, reader, attack, stop.
.EXAMPLE
    .\run.ps1
    .\run.ps1 -Mode cluster
    .\run.ps1 -Mode test
    .\run.ps1 -Mode stop
#>

[CmdletBinding()]
param(
    [ValidateSet("demo", "cluster", "test", "benchmark", "verify", "reader", "attack", "stop", "menu")]
    [string]$Mode = "menu",
    [string]$File = "",
    [string]$Scenario = "tamper"
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptRoot
$env:PYTHONPATH = $ScriptRoot

function Show-Header {
    Write-Host ''
    Write-Host '============================================================================' -ForegroundColor Cyan
    Write-Host '   ____ ___ ____ ___ _     ' -ForegroundColor Cyan
    Write-Host '  / ___|_ _/ ___|_ _| |    ' -ForegroundColor Cyan
    Write-Host '  \___ \| | |  _ | || |    ' -ForegroundColor Cyan
    Write-Host '   ___) | | |_| || || |___ ' -ForegroundColor Cyan
    Write-Host '  |____/___\____|___|_____|' -ForegroundColor Cyan
    Write-Host '  Post-Quantum Document Attribution and Custody Platform (SIH26237)' -ForegroundColor Yellow
    Write-Host '============================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Check-Prerequisites {
    try {
        $pyVersion = python --version 2>&1
        Write-Host "[OK] Python Environment: $pyVersion" -ForegroundColor Green
    } catch {
        Write-Error 'Python 3.11+ is required but not found in PATH.'
        exit 1
    }
}

function Run-Cluster {
    Show-Header
    Check-Prerequisites
    Write-Host '[*] Launching Live 4-Node BFT Cluster + Security Officer Console...' -ForegroundColor Cyan
    Write-Host '[*] Console URL: http://127.0.0.1:8000/ (admin / Officer_Secure_2026!)' -ForegroundColor Yellow
    Write-Host '[*] Validator Nodes: http://127.0.0.1:8001 through 8004' -ForegroundColor Yellow
    Write-Host '[*] Press Ctrl+C or run .\run.ps1 -Mode stop to shut down.' -ForegroundColor Gray
    Write-Host ''
    python demo/run_live_cluster_demo.py --keep
}

function Run-Demo {
    Show-Header
    Check-Prerequisites
    Write-Host '[*] Running Autonomous 8-Phase Master SIH26237 Evaluation Demo...' -ForegroundColor Cyan
    Write-Host ''
    python demo/run_demo.py
}

function Run-Tests {
    Show-Header
    Check-Prerequisites
    Write-Host '[*] Running All 53 Automated Unit, Integration and Hardening Tests...' -ForegroundColor Cyan
    Write-Host ''
    pytest -v
}

function Run-Benchmark {
    Show-Header
    Check-Prerequisites
    Write-Host '[*] Running Performance and Micro-Typographic Imperceptibility Benchmarks...' -ForegroundColor Cyan
    Write-Host ''
    python demo/benchmark_suite.py
}

function Run-Verify {
    Show-Header
    Check-Prerequisites
    $bundle = if ($File) { $File } else { 'demo_data/EVIDENCE_BUNDLE.json' }
    Write-Host "[*] Verifying Section 63 BSA Evidence Bundle Offline ($bundle)..." -ForegroundColor Cyan
    Write-Host ''
    python offline_verifier/verify.py $bundle
}

function Run-Reader {
    Show-Header
    Check-Prerequisites
    $target = if ($File) { $File } else { 'demo_data/DEFENCE_DIRECTIVE_2026.sigil' }
    Write-Host "[*] Starting Windows Native DRM Reader for: $target" -ForegroundColor Cyan
    Write-Host '[*] Hardware anti-capture protection (WDA_EXCLUDEFROMCAPTURE) active.' -ForegroundColor Yellow
    Write-Host ''
    python desktop/sigil_reader.py $target
}

function Run-Attack {
    Show-Header
    Check-Prerequisites
    Write-Host "[*] Running Adversarial Attack Simulation: $Scenario" -ForegroundColor Cyan
    Write-Host ''
    python sigil.py attack $Scenario
}

function Stop-Cluster {
    Write-Host '[*] Stopping any active SIGIL validator nodes and admin console...' -ForegroundColor Yellow
    $killed = 0
    $procs = Get-Process python -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($p in $procs) {
            try {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)").CommandLine
                if ($cmd -match "uvicorn" -or $cmd -match "validator_node" -or $cmd -match "admin_portal") {
                    Stop-Process -Id $p.Id -Force
                    $killed++
                }
            } catch {
                # Continue if process already exited
            }
        }
    }
    if ($killed -gt 0) {
        Write-Host "[OK] Cleanly terminated $killed background SIGIL server process(es)." -ForegroundColor Green
    } else {
        Write-Host '[i] No active SIGIL server processes were running.' -ForegroundColor Gray
    }
}

function Show-Menu {
    Show-Header
    Check-Prerequisites
    Write-Host 'Select an action to execute:' -ForegroundColor White
    Write-Host '  [1] Live 4-Node BFT Cluster and Admin Console (Interactive Web UI)' -ForegroundColor Cyan
    Write-Host '  [2] Master 8-Phase Evaluation Demo (Autonomous End-to-End)' -ForegroundColor White
    Write-Host '  [3] Run Full Automated Test Suite (53 Passing Tests)' -ForegroundColor White
    Write-Host '  [4] Run Cryptographic and Visual Benchmarks (FIPS 203/204 and PSNR)' -ForegroundColor White
    Write-Host '  [5] Standalone Offline Evidence Verifier (Section 63 BSA)' -ForegroundColor White
    Write-Host '  [6] Launch Native Windows DRM Reader (Hardware Screen Shield)' -ForegroundColor White
    Write-Host '  [7] Run Adversarial Attacks (Tampering, Bypass, Splicing)' -ForegroundColor White
    Write-Host '  [8] Stop All Running Background Nodes' -ForegroundColor Yellow
    Write-Host '  [Q] Quit' -ForegroundColor Gray
    Write-Host ''
    $choice = Read-Host 'Enter option [1-8, Q]'

    switch ($choice) {
        '1' { Run-Cluster }
        '2' { Run-Demo }
        '3' { Run-Tests }
        '4' { Run-Benchmark }
        '5' { Run-Verify }
        '6' { Run-Reader }
        '7' { Run-Attack }
        '8' { Stop-Cluster }
        'Q' { exit 0 }
        'q' { exit 0 }
        default { Write-Host '[!] Invalid option.' -ForegroundColor Red }
    }
}

# Entrypoint routing
switch ($Mode) {
    'menu'      { Show-Menu }
    'cluster'   { Run-Cluster }
    'demo'      { Run-Demo }
    'test'      { Run-Tests }
    'benchmark' { Run-Benchmark }
    'verify'    { Run-Verify }
    'reader'    { Run-Reader }
    'attack'    { Run-Attack }
    'stop'      { Stop-Cluster }
}
