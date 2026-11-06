#!/usr/bin/env python3
"""Encrypt the computed app data into the repo, rewriting only files whose content changed.

  W2_KEY=... python3 pipeline/publish.py OUT_DIR REPO_DIR STORE_DIR

OUT_DIR   has data.json and days/<YYYY-MM-DD>.json (from pipeline.py compute --days-out OUT_DIR/days)
REPO_DIR  the repo clone: writes data/data.enc.json, data/days/<date>.enc.json, state/*.enc
STORE_DIR has shift_log.csv and file_register.csv

Every encryption uses a fresh salt, so unchanged files are left alone (compared after decrypting)
to keep git history small. Snapshots no longer produced are deleted. Each written file is
decrypted again and checked against its source. Prints one JSON summary line.
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from seal import encrypt, decrypt  # noqa: E402


def put(key, src, dst, stats):
    raw = open(src, 'rb').read()
    if os.path.exists(dst):
        try:
            if decrypt(key, open(dst, 'rb').read()) == raw:
                stats['unchanged'] += 1
                return
        except Exception:
            pass
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(encrypt(key, raw))
    if decrypt(key, open(dst, 'rb').read()) != raw:
        sys.exit(f'round-trip check failed for {dst}')
    stats['written'].append(os.path.relpath(dst))


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    key = os.environ.get('W2_KEY') or sys.exit('Set W2_KEY to the app passcode.')
    out, repo, store = sys.argv[1:]
    stats = dict(written=[], unchanged=0, removed=[])
    put(key, os.path.join(out, 'data.json'), os.path.join(repo, 'data', 'data.enc.json'), stats)
    days = sorted(f[:-5] for f in os.listdir(os.path.join(out, 'days')) if f.endswith('.json'))
    for d in days:
        put(key, os.path.join(out, 'days', d + '.json'), os.path.join(repo, 'data', 'days', d + '.enc.json'), stats)
    ddir = os.path.join(repo, 'data', 'days')
    for f in os.listdir(ddir) if os.path.isdir(ddir) else []:
        if f.endswith('.enc.json') and f[:-9] not in days:
            os.remove(os.path.join(ddir, f)); stats['removed'].append(f)
    put(key, os.path.join(store, 'shift_log.csv'), os.path.join(repo, 'state', 'shift_log.enc'), stats)
    put(key, os.path.join(store, 'file_register.csv'), os.path.join(repo, 'state', 'file_register.enc'), stats)
    print(json.dumps(dict(snapshots=len(days), written=len(stats['written']), unchanged=stats['unchanged'],
                          removed=len(stats['removed']))))


if __name__ == '__main__':
    main()
