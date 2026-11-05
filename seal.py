#!/usr/bin/env python3
"""Encrypt / decrypt files for the Weavelon 2 loom performance app.

The repo is public, so every data file is stored encrypted with the app passcode.
Format (JSON): {"v":1, "iter":N, "salt":b64, "iv":b64, "gz":true, "ct":b64}
Key = PBKDF2-HMAC-SHA256(passcode, salt, iter) -> 32 bytes; cipher = AES-256-GCM.
The browser decrypts the same format with WebCrypto (see index.html).

Usage
  W2_KEY=... python3 seal.py encrypt IN OUT
  W2_KEY=... python3 seal.py decrypt IN OUT
"""
import base64, gzip, hashlib, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 250000


def _key(passcode, salt, it):
    return hashlib.pbkdf2_hmac('sha256', passcode.encode('utf-8'), salt, it, 32)


def encrypt(passcode, raw):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(_key(passcode, salt, ITER)).encrypt(iv, gzip.compress(raw, 9, mtime=0), None)
    b = lambda x: base64.b64encode(x).decode('ascii')
    return json.dumps({'v': 1, 'iter': ITER, 'salt': b(salt), 'iv': b(iv), 'gz': True, 'ct': b(ct)}).encode('ascii')


def decrypt(passcode, sealed):
    o = json.loads(sealed)
    d = lambda k: base64.b64decode(o[k])
    raw = AESGCM(_key(passcode, d('salt'), int(o['iter']))).decrypt(d('iv'), d('ct'), None)
    return gzip.decompress(raw) if o.get('gz') else raw


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in ('encrypt', 'decrypt'):
        sys.exit(__doc__)
    key = os.environ.get('W2_KEY', '')
    if not key:
        sys.exit('Set W2_KEY to the app passcode.')
    with open(sys.argv[2], 'rb') as f:
        data = f.read()
    out = encrypt(key, data) if sys.argv[1] == 'encrypt' else decrypt(key, data)
    with open(sys.argv[3], 'wb') as f:
        f.write(out)


if __name__ == '__main__':
    main()
