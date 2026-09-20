#!/usr/bin/env python3
"""SIGIL: Post-Quantum Document Attribution & Custody Platform.

Unified Command-Line Interface (CLI).
Enables operators, developers, and judges to execute cluster operations,
demonstrations, benchmarks, adversarial attacks, and offline evidence verification.
"""

import os
import sys
import argparse
import subprocess

# Ensure repo root is on sys.path
REPO_ROOT = os.path.abspath(os.path.dirname(__file__))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def cmd_test(args):
    """Run the complete automated pytest test suite."""
    print("[*] Running SIGIL automated test suite (48 tests)...")
    cmd = [sys.executable, "-m", "pytest", "-v"]
    if args.filter:
        cmd.extend(["-k", args.filter])
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_benchmark(args):
    """Run the cryptographic performance & visual imperceptibility benchmark suite."""
    print("[*] Executing SIGIL comprehensive benchmark suite...")
    cmd = [sys.executable, os.path.join(REPO_ROOT, "demo", "benchmark_suite.py")]
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_demo(args):
    """Execute the end-to-end master demonstration."""
    if args.interactive:
        print("[*] Launching Live Interactive 4-Node Cluster Demo...")
        cmd = [sys.executable, os.path.join(REPO_ROOT, "demo", "run_live_cluster_demo.py")]
        if args.keep:
            cmd.append("--keep")
    else:
        print("[*] Executing Autonomous Master End-to-End Demonstration...")
        cmd = [sys.executable, os.path.join(REPO_ROOT, "demo", "run_demo.py")]
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_verify(args):
    """Run the Section 63 BSA offline cryptographic evidence verifier."""
    bundle_path = args.bundle or os.path.join(REPO_ROOT, "demo_data", "EVIDENCE_BUNDLE.json")
    if not os.path.exists(bundle_path):
        print(f"[!] Evidence bundle not found at: {bundle_path}")
        return 1
    print(f"[*] Verifying Evidence Bundle: {bundle_path}")
    cmd = [sys.executable, os.path.join(REPO_ROOT, "offline_verifier", "verify.py"), bundle_path]
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_pki(args):
    """Generate internal Root CA and mTLS node certificates."""
    print(f"[*] Generating Enterprise PKI in: {args.output_dir}")
    cmd = [
        sys.executable,
        os.path.join(REPO_ROOT, "scripts", "generate_pki.py"),
        "--output-dir",
        args.output_dir
    ]
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_reader(args):
    """Launch the Windows Desktop DRM Reader shell."""
    cmd = [sys.executable, os.path.join(REPO_ROOT, "desktop", "sigil_reader.py")]
    if args.file:
        cmd.append(args.file)
    print(f"[*] Starting SIGIL Reader Desktop Shell{' for ' + args.file if args.file else ''}...")
    return subprocess.run(cmd, cwd=REPO_ROOT).returncode


def cmd_admin(args):
    """Launch the Security Officer Admin Portal."""
    port = args.port or 8000
    host = args.host or "127.0.0.1"
    print(f"[*] Launching SIGIL Admin Portal on http://{host}:{port}...")
    env = os.environ.copy()
    env["PYTHONPATH"] = REPO_ROOT
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "admin_portal.api:app",
        "--host",
        host,
        "--port",
        str(port),
        "--reload"
    ]
    return subprocess.run(cmd, cwd=REPO_ROOT, env=env).returncode


def cmd_attack(args):
    """Run adversarial security attacks to demonstrate tamper resistance."""
    attack_type = args.scenario
    if attack_type == "tamper":
        db_path = args.db or os.path.join(REPO_ROOT, "demo_data", "node_01", "sigil_ledger.db")
        print(f"[*] Running Hostile DB Tampering Attack on copy of: {db_path}")
        temp_db = os.path.join(REPO_ROOT, "demo_data", "temp_attack_tamper.db")
        import shutil
        shutil.copy2(db_path, temp_db)
        try:
            cmd = [sys.executable, os.path.join(REPO_ROOT, "demo", "attack_scripts", "tamper_database.py"), temp_db]
            res = subprocess.run(cmd, cwd=REPO_ROOT).returncode
        finally:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        return res

    elif attack_type == "bypass":
        container = args.container or os.path.join(REPO_ROOT, "demo_data", "DEFENCE_DIRECTIVE_2026.sigil")
        print(f"[*] Running Client Logging Bypass Attack on: {container}")
        cmd = [sys.executable, os.path.join(REPO_ROOT, "demo", "attack_scripts", "bypass_client.py"), container, args.recipient]
        return subprocess.run(cmd, cwd=REPO_ROOT).returncode

    elif attack_type == "collude":
        alice_pdf = os.path.join(REPO_ROOT, "demo_data", "alice_decrypted.pdf")
        bob_pdf = os.path.join(REPO_ROOT, "demo_data", "bob_decrypted.pdf")
        db_path = os.path.join(REPO_ROOT, "demo_data", "node_01", "sigil_ledger.db")
        print("[*] Running 2-Recipient Splicing Collusion Attack...")
        cmd = [
            sys.executable,
            os.path.join(REPO_ROOT, "demo", "attack_scripts", "collude_splicing.py"),
            alice_pdf,
            bob_pdf,
            "DEFENCE_DIRECTIVE_2026",
            db_path
        ]
        res = subprocess.run(cmd, cwd=REPO_ROOT).returncode
        colluded_file = os.path.join(REPO_ROOT, "colluded_spliced_leak.pdf")
        if os.path.exists(colluded_file):
            os.remove(colluded_file)
        return res

    else:
        print(f"[!] Unknown attack scenario: {attack_type}")
        return 1


def main():
    parser = argparse.ArgumentParser(
        prog="sigil",
        description="SIGIL: Post-Quantum Document Attribution & Custody Platform"
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available subcommands")

    # test
    p_test = subparsers.add_parser("test", help="Run the automated test suite")
    p_test.add_argument("-k", "--filter", help="Expression to filter tests by keyword")
    p_test.set_defaults(func=cmd_test)

    # benchmark
    p_bench = subparsers.add_parser("benchmark", help="Run cryptographic & visual benchmarks")
    p_bench.set_defaults(func=cmd_benchmark)

    # demo
    p_demo = subparsers.add_parser("demo", help="Run master system demonstrations")
    p_demo.add_argument("--interactive", action="store_true", help="Launch live interactive 4-node cluster demo")
    p_demo.add_argument("--keep", action="store_true", help="Keep nodes running after interactive demo completes")
    p_demo.set_defaults(func=cmd_demo)

    # verify
    p_verify = subparsers.add_parser("verify", help="Verify Section 63 BSA evidence bundle offline")
    p_verify.add_argument("bundle", nargs="?", default=None, help="Path to EVIDENCE_BUNDLE.json")
    p_verify.set_defaults(func=cmd_verify)

    # pki
    p_pki = subparsers.add_parser("pki", help="Generate internal Root CA and mTLS certificates")
    p_pki.add_argument("--output-dir", default="certs", help="Output directory for generated certs")
    p_pki.set_defaults(func=cmd_pki)

    # reader
    p_reader = subparsers.add_parser("reader", help="Launch native Windows DRM desktop reader")
    p_reader.add_argument("file", nargs="?", default=None, help="Path to .sigil container file")
    p_reader.set_defaults(func=cmd_reader)

    # admin
    p_admin = subparsers.add_parser("admin", help="Start Security Officer Admin Portal")
    p_admin.add_argument("--host", default="127.0.0.1", help="Binding host")
    p_admin.add_argument("--port", type=int, default=8000, help="Port to bind")
    p_admin.set_defaults(func=cmd_admin)

    # attack
    p_attack = subparsers.add_parser("attack", help="Execute adversarial attack simulations")
    p_attack.add_argument("scenario", choices=["tamper", "bypass", "collude"], help="Attack scenario to execute")
    p_attack.add_argument("--db", default=None, help="Custom database path for tamper scenario")
    p_attack.add_argument("--container", default=None, help="Custom container path for bypass scenario")
    p_attack.add_argument("--recipient", default="ALICE", help="Recipient ID for bypass scenario")
    p_attack.set_defaults(func=cmd_attack)

    args = parser.parse_args()

    if not args.subcommand:
        parser.print_help()
        sys.exit(0)

    code = args.func(args)
    sys.exit(code or 0)


if __name__ == "__main__":
    main()
