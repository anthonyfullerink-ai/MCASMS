#!/usr/bin/env python3
"""
MissedCallAutoText - Developer License Issuing & Revocation CLI Tool
Author: Developer Tooling
Price Point: $49.99 Lifetime License Generation & Revocation
"""

import argparse
import hmac
import hashlib
import binascii
import json
import time
import sys

SECRET_KEY = b"MCAT_SECRET_PROD_KEY_2026"
KEY_PREFIX = "MCAT-"

def generate_key(customer_name: str, days_valid: int = 0) -> str:
    """Generates a cryptographically signed license key."""
    expiry_timestamp = 0 if days_valid == 0 else int(time.time() + (days_valid * 86400))
    payload_str = f"{customer_name}|{expiry_timestamp}|{int(time.time())}"
    payload_hex = binascii.hexlify(payload_str.encode('utf-8')).decode('utf-8').upper()
    
    # Calculate HMAC-SHA256 signature
    sig = hmac.new(SECRET_KEY, payload_hex.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    sig_short = sig[:8] # 8 character signature
    
    # Format key as MCAT-<PAYLOAD_HEX>-<SIG_SHORT>
    raw_key = f"{KEY_PREFIX}{payload_hex}-{sig_short}"
    return raw_key

def verify_key(license_key: str) -> dict:
    """Verifies a license key signature and decodes payload."""
    clean_key = license_key.strip().upper()
    if not clean_key.startswith(KEY_PREFIX):
        return {"valid": False, "error": "Invalid prefix"}
    
    parts = clean_key[len(KEY_PREFIX):].split("-")
    if len(parts) < 2:
        return {"valid": False, "error": "Invalid format"}
    
    payload_hex, expected_sig = parts[0], parts[1]
    calculated_sig = hmac.new(SECRET_KEY, payload_hex.encode('utf-8'), hashlib.sha256).hexdigest().upper()[:len(expected_sig)]
    
    if calculated_sig != expected_sig:
        return {"valid": False, "error": "Signature mismatch"}
    
    try:
        payload_bytes = binascii.unhexlify(payload_hex)
        fields = payload_bytes.decode('utf-8').split("|")
        customer_name = fields[0] if len(fields) > 0 else "Unknown"
        expiry_ts = int(fields[1]) if len(fields) > 1 else 0
        
        is_expired = 0 < expiry_ts < time.time()
        
        return {
            "valid": not is_expired,
            "key": clean_key,
            "customer": customer_name,
            "type": "LIFETIME ($49.99)" if expiry_ts == 0 else f"VALID_UNTIL_{expiry_ts}",
            "expired": is_expired
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="MissedCallAutoText License Generator & Revoker Tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Issue Command
    issue_parser = subparsers.add_parser("issue", help="Issue a new $49.99 License Key")
    issue_parser.add_argument("--name", required=True, help="Customer or Business Name")
    issue_parser.add_argument("--days", type=int, default=0, help="Days valid (0 = Lifetime)")

    # Verify Command
    verify_parser = subparsers.add_parser("verify", help="Verify a License Key")
    verify_parser.add_argument("--key", required=True, help="License Key to verify")

    # Revoke Command
    revoke_parser = subparsers.add_parser("revoke", help="Revoke a License Key into manifest JSON")
    revoke_parser.add_argument("--key", required=True, help="License Key to revoke")
    revoke_parser.add_argument("--output", default="revoked_licenses.json", help="Manifest JSON output file")

    args = parser.parse_args()

    if args.command == "issue":
        key = generate_key(args.name, args.days)
        print("\n==========================================")
        print("  MISSEDCALLAUTOTEXT LICENSE ISSUED ($49.99)")
        print("==========================================")
        print(f"Customer Name: {args.name}")
        print(f"License Type : {'LIFETIME' if args.days == 0 else f'{args.days} Days'}")
        print(f"License Key  : {key}")
        print("==========================================\n")

    elif args.command == "verify":
        res = verify_key(args.key)
        print(json.dumps(res, indent=2))

    elif args.command == "revoke":
        manifest = []
        try:
            with open(args.output, "r") as f:
                manifest = json.load(f)
        except Exception:
            manifest = []
        
        if args.key.upper() not in manifest:
            manifest.append(args.key.upper())
            with open(args.output, "w") as f:
                json.dump(manifest, f, indent=2)
            print(f"License key {args.key} added to revocation manifest '{args.output}'.")
        else:
            print(f"License key {args.key} is already revoked.")

if __name__ == "__main__":
    main()
