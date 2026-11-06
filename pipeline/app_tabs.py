#!/usr/bin/env python3
"""Read the web app's tabs in the Config Sheet from saved Sheets get_values responses.

  targets  RESPONSE.json OUT.json   'App targets'!A1:G -> JSON array for pipeline.py --targets
                                    (rows whose id starts panna__ become {"width","hg","single_panna":true})
  pending  RESPONSE.json            'App assignments'!A1:F -> one JSON line per pending row:
                                    {"row": sheet row number, "style", "head_group", "is_new"}
A response may be the raw tool result ({"range","values"}) or a wrapper holding it as text.
"""
import json, sys


def values(path):
    o = json.load(open(path))
    for _ in range(3):
        if isinstance(o, dict) and 'values' in o:
            return o['values']
        if isinstance(o, list) and o and isinstance(o[0], dict) and 'text' in o[0]:
            o = json.loads(o[0]['text']); continue
        if isinstance(o, dict) and isinstance(o.get('text'), str):
            o = json.loads(o['text']); continue
        if isinstance(o, list):
            return o
        break
    return []


def num(v):
    try:
        return float(str(v).replace(',', '')) if str(v).strip() != '' else None
    except ValueError:
        return None


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'targets' and len(sys.argv) == 4:
        out = []
        for r in values(sys.argv[2])[1:]:
            r = list(r) + [''] * (7 - len(r))
            if str(r[0]).strip().startswith('panna__') and str(r[1]).strip() and str(r[2]).strip():
                # a 280 cm head group switched to single panna in the app (default is double panna)
                out.append({'width': str(r[1]).strip(), 'hg': str(r[2]).strip(), 'single_panna': True})
                continue
            if str(r[1]).strip() and str(r[2]).strip():
                out.append({'width': str(r[1]).strip(), 'hg': str(r[2]).strip(), 'cfm': num(r[3]), 'rpm': num(r[4]), 'main': num(r[5])})
        json.dump(out, open(sys.argv[3], 'w'))
        print(f'targets: {sum(1 for t in out if not t.get("single_panna"))}, single panna: {sum(1 for t in out if t.get("single_panna"))}')
    elif cmd == 'pending' and len(sys.argv) == 3:
        for i, r in enumerate(values(sys.argv[2])[1:], start=2):
            r = list(r) + [''] * (6 - len(r))
            if str(r[3]).strip().lower() == 'pending' and str(r[1]).strip():
                print(json.dumps({'row': i, 'style': str(r[0]), 'head_group': str(r[1]).strip(),
                                  'is_new': str(r[2]).strip().upper() == 'TRUE'}, ensure_ascii=False))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
