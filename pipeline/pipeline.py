#!/usr/bin/env python3
"""Weavelon 2 loom performance pipeline.

Commands
  ingest  --store DIR --folder-date YYYY-MM-DD --file-id ID --name NAME --modified TS FILE
          Parse one Toyota shift report and upsert it into DIR/shift_log.csv.
          Every file examined gets a row in DIR/file_register.csv.
  status  --store DIR --date YYYY-MM-DD
          Print which shifts of that date are in the store (A, B, both, none).
  config  --style-map JSON --machine JSON --settings JSON --head-groups JSON --out FILE
          Turn Google Sheets get_values responses into one config.json.
  compute --store DIR --config FILE --out data.json --notify notify.txt [--assign assignments.json] [--targets targets.json]
          Rebuild every metric from all history; write the dashboard data and the notification text.
"""
import argparse, csv, datetime as dt, hashlib, json, math, os, re, statistics as st, sys, urllib.parse
from collections import defaultdict, Counter

SHIFT_MIN = 720
DAY_MIN = 1440
KGF = 0.980665          # bar per kgf/cm2
PATM = 1.01325          # bar
REQUIRED = ['Loom', 'Style', 'RPM', 'Effic. (%)', 'Run (min)', 'Stop (min)', 'AF1', 'AF2',
            'Air flow (cfm)', 'Pick (1000pick)', 'Main pressure (run) (kgf/cm2)', 'Warp (times)']
LOG_COLS = ['date', 'shift', 'loom', 'raw_style', 'style_key', 'beam', 'run', 'stop', 'rpm', 'eff',
            'af1', 'af2', 'picks', 'cfm', 'main', 'warp', 'weft', 'file_id', 'file_name', 'ingested_at']
REG_COLS = ['checked_at', 'folder_date', 'file_id', 'file_name', 'modified', 'md5', 'date', 'shift',
            'looms', 'status', 'reason']


def decode_style(s):
    s = urllib.parse.unquote(str(s or ''))
    s = re.sub(r'\s+', ' ', s).strip(' -').upper()
    return s


def now():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).strftime('%Y-%m-%d %H:%M')


# ---------------------------------------------------------------- parsing
def parse_file(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True))
        if len(rows) < 5:
            continue
        hdr = [(h or '').replace('\n', ' ').strip() if isinstance(h, str) else '' for h in rows[3]]
        if 'Loom' not in hdr or 'Style' not in hdr:
            continue
        period = str(rows[1][0] or '')
        missing = [c for c in REQUIRED if c not in hdr]
        if missing:
            return dict(ok=False, status='quarantined', reason='Missing columns: ' + ', '.join(missing))
        m = re.search(r'Period\((Shift|Date)\)\s*:\s*(\d{4})/(\d{2})/(\d{2})(?:\.([AB]))?\s*->\s*(\d{4})/(\d{2})/(\d{2})(?:\.([AB]))?', period)
        if not m:
            return dict(ok=False, status='quarantined', reason='Period line not recognised: ' + period[:60])
        d1 = f'{m[2]}-{m[3]}-{m[4]}'
        d2 = f'{m[6]}-{m[7]}-{m[8]}'
        if d1 != d2:
            return dict(ok=False, status='quarantined', reason=f'Period spans two dates ({d1} to {d2})')
        if m[1] == 'Date' or (m[5] == 'A' and m[9] == 'B'):
            shift = 'AB'
        elif m[5] and m[5] == m[9]:
            shift = m[5]
        else:
            return dict(ok=False, status='quarantined', reason='Unexpected shift range: ' + period[:60])
        ix = {h: i for i, h in enumerate(hdr) if h}
        def g(r, k, default=0):
            i = ix.get(k)
            v = r[i] if i is not None and i < len(r) else None
            return default if v is None else v
        out = []
        for r in rows[4:]:
            if not r or r[ix['Loom']] in (None, '') or str(r[0]).strip().lower() == 'total':
                continue
            try:
                loom = int(str(r[ix['Loom']]).strip())
            except ValueError:
                continue
            sh = shift
            sm = re.match(r'(\d{4})/(\d{2})/(\d{2})\.([AB])', str(r[0] or ''))
            if sm:
                sh = sm[4]
            run = float(g(r, 'Run (min)')); stop = float(g(r, 'Stop (min)'))
            picks = float(g(r, 'Pick (1000pick)')) * 1000
            rpm = float(g(r, 'RPM'))
            if run > 0 and rpm > 0:
                picks = rpm * run   # exact; the Pick column is rounded to 0.1 thousand
            out.append(dict(shift=sh, loom=loom, raw_style=str(g(r, 'Style', '')).strip(),
                            style_key=decode_style(g(r, 'Style', '')), beam=str(g(r, 'Beam', '') or ''),
                            run=run, stop=stop, rpm=rpm, eff=float(g(r, 'Effic. (%)')),
                            af1=float(g(r, 'AF1')), af2=float(g(r, 'AF2')), picks=picks,
                            cfm=float(g(r, 'Air flow (cfm)')), main=float(g(r, 'Main pressure (run) (kgf/cm2)')),
                            warp=float(g(r, 'Warp (times)')), weft=float(g(r, 'Weft (times)', 0))))
        if not out:
            return dict(ok=False, status='quarantined', reason='No loom rows')
        tot = sorted(x['run'] + x['stop'] for x in out)
        med = tot[len(tot) // 2]
        need = 1300 if shift == 'AB' else 650
        if med < need:
            return dict(ok=False, status='quarantined', date=d1, shift=shift,
                        reason=f'Partial shift: median run+stop {med:.0f} of {SHIFT_MIN * (2 if shift == "AB" else 1)} min')
        return dict(ok=True, date=d1, shift=shift, rows=out, sheet=ws.title)
    return dict(ok=False, status='skipped', reason='Not a Toyota shift report')


def read_csv(path, cols):
    if not os.path.exists(path):
        return []
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


def write_csv(path, cols, rows):
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow(r)


def cmd_ingest(a):
    os.makedirs(a.store, exist_ok=True)
    logp = os.path.join(a.store, 'shift_log.csv'); regp = os.path.join(a.store, 'file_register.csv')
    log = read_csv(logp, LOG_COLS); reg = read_csv(regp, REG_COLS)
    md5 = hashlib.md5(open(a.file, 'rb').read()).hexdigest()
    entry = dict(checked_at=now(), folder_date=a.folder_date, file_id=a.file_id, file_name=a.name,
                 modified=a.modified, md5=md5, date='', shift='', looms='', status='', reason='')
    if a.name.lower() in ('costing.xlsx', 'daily_production.xlsx'):
        entry.update(status='skipped', reason='Not a Toyota file')
        reg.append(entry); write_csv(regp, REG_COLS, reg); print(json.dumps(entry)); return
    try:
        p = parse_file(a.file)
    except Exception as e:  # unreadable workbook
        p = dict(ok=False, status='quarantined', reason=f'Could not open: {e}'[:200])
    if not p['ok']:
        entry.update(status=p['status'], reason=p['reason'], date=p.get('date', ''), shift=p.get('shift', ''))
        reg.append(entry); write_csv(regp, REG_COLS, reg); print(json.dumps(entry)); return
    date, shift = p['date'], p['shift']
    shifts = ['A', 'B'] if shift == 'AB' else [shift]
    entry.update(date=date, shift=shift, looms=len({r['loom'] for r in p['rows']}))
    notes = []
    if date != a.folder_date:
        notes.append(f'Header date {date} differs from folder {a.folder_date}; stored under {date}')
    # what is already stored for these shifts
    prev = [r for r in reg if r['status'] == 'ingested' and r['date'] == date and
            (r['shift'] in shifts or r['shift'] == 'AB' or shift == 'AB')]
    if any(r['md5'] == md5 for r in prev):
        entry.update(status='duplicate', reason='Same content already stored')
        reg.append(entry); write_csv(regp, REG_COLS, reg); print(json.dumps(entry)); return
    if prev:
        if date != a.folder_date:
            entry.update(status='quarantined', reason=notes[0] + ', but that shift is already stored')
            reg.append(entry); write_csv(regp, REG_COLS, reg); print(json.dumps(entry)); return
        if any(r['modified'] > a.modified for r in prev):
            entry.update(status='skipped', reason='A newer file for this shift is already stored')
            reg.append(entry); write_csv(regp, REG_COLS, reg); print(json.dumps(entry)); return
        notes.append('Replaced an earlier file for this shift')
        for r in prev:
            r['status'] = 'superseded'
    exp = shifts
    name_shift = re.search(r'(?:^|[^A-Z])([AB])(?:\.|_|\s|$)', os.path.splitext(a.name.upper())[0][-3:] + ' ')
    if shift in ('A', 'B') and name_shift and name_shift.group(1) != shift:
        notes.append(f'File name suggests shift {name_shift.group(1)}, header says {shift}')
    log = [r for r in log if not (r['date'] == date and r['shift'] in exp)]
    ts = now()
    for r in p['rows']:
        r.update(date=date, file_id=a.file_id, file_name=a.name, ingested_at=ts)
        log.append({k: r.get(k, '') for k in LOG_COLS})
    log.sort(key=lambda r: (r['date'], r['shift'], int(r['loom'])))
    write_csv(logp, LOG_COLS, log)
    entry.update(status='ingested', reason='; '.join(notes))
    reg.append(entry); write_csv(regp, REG_COLS, reg)
    print(json.dumps(entry))


def cmd_status(a):
    reg = read_csv(os.path.join(a.store, 'file_register.csv'), REG_COLS)
    have = set()
    for r in reg:
        if r['status'] == 'ingested' and r['date'] == a.date:
            have |= {'A', 'B'} if r['shift'] == 'AB' else {r['shift']}
    known = {r['file_id'] + '|' + r['modified'] for r in reg}
    print(json.dumps(dict(date=a.date, shifts=sorted(have), complete=have >= {'A', 'B'},
                          seen_files=sorted(known))))


# ---------------------------------------------------------------- config
def _values(path):
    d = json.load(open(path))
    return d.get('values', d) if isinstance(d, dict) else d


def cmd_config(a):
    sm = _values(a.style_map); mm = _values(a.machine); se = _values(a.settings); hg = _values(a.head_groups)
    style_map = {}
    for r in sm[1:]:
        if len(r) >= 2 and str(r[0]).strip() and str(r[1]).strip():
            style_map[decode_style(r[0])] = str(r[1]).strip()
    machine = {}
    for r in mm[1:]:
        if len(r) >= 3 and str(r[0]).strip():
            machine[int(float(r[0]))] = dict(width=str(int(float(r[1]))), type=str(r[2]).strip(),
                                            active=(len(r) < 4 or str(r[3]).strip().lower() != 'no'))
    settings = {}
    for r in se[1:]:
        if len(r) >= 2 and str(r[0]).strip():
            v = r[1]
            try:
                v = float(str(v).replace(',', ''))
            except ValueError:
                pass
            settings[str(r[0]).strip()] = v
    groups = [str(r[0]).strip() for r in hg[1:] if r and str(r[0]).strip()]
    json.dump(dict(style_map=style_map, machine={str(k): v for k, v in machine.items()},
                   settings=settings, head_groups=groups), open(a.out, 'w'), indent=1)
    print(f'config: {len(style_map)} style names, {len(groups)} head groups, {len(machine)} looms, {len(settings)} settings')


# ---------------------------------------------------------------- compute helpers
def pct(vals, p):
    v = sorted(vals)
    if not v:
        return None
    k = (len(v) - 1) * p / 100
    f = math.floor(k); c = math.ceil(k)
    return v[f] if f == c else v[f] + (v[c] - v[f]) * (k - f)


def mad_filter(vals):
    if len(vals) < 5:
        return vals
    med = st.median(vals); mad = st.median([abs(x - med) for x in vals])
    if mad == 0:
        return vals
    return [x for x in vals if abs(x - med) <= 3 * 1.4826 * mad]


RUN_FIELDS = ('date', 'loom', 'type', 'beam', 'run', 'stop', 'rpm', 'eff', 'erpm', 'cfm', 'apk', 'main', 'main_max',
              'picks', 'fpicks', 'panna', 'air', 'warp', 'warp_rate', 'styles')
TOP_MAX = 40   # loom-days at or better than a benchmark kept with it


def run_rec(x):
    return {k: x[k] for k in RUN_FIELDS}


def bench_runs(L, S):
    """For each benchmarked metric: the loom-days either side of the percentile, the weight of each,
    and which loom-days the outlier filter dropped. Stored so they survive after the loom-days leave
    the 60-day window the dashboard keeps."""
    spec = [('rpm', S['benchmark_pct_high'], False, lambda x: True, True),
            ('erpm', S['benchmark_pct_high'], False, lambda x: True, True),
            ('apk', S['benchmark_pct_low'], False, lambda x: bool(x['apk']), False),
            ('main_max', S['benchmark_pct_low'], False, lambda x: x['main_max'] > 0, False),
            ('main', S['benchmark_pct_low'], False, lambda x: True, False),
            ('warp_rate', 50, False, lambda x: x['warp_rate'] is not None, False)]
    out = {}
    for m, p, use_mad, keep, high in spec:
        pool = [x for x in L if keep(x)]
        if not pool:
            continue
        vals = [x[m] for x in pool]
        kept_vals = mad_filter(vals) if use_mad else vals
        lo_v, hi_v = (min(kept_vals), max(kept_vals)) if kept_vals else (None, None)
        kept = [x for x in pool if lo_v is not None and lo_v <= x[m] <= hi_v] if use_mad and len(kept_vals) < len(vals) else pool
        kept_ids = {id(x) for x in kept}
        dropped = [x for x in pool if id(x) not in kept_ids]
        s = sorted(kept, key=lambda x: (x[m], x['date'], x['loom']))
        k = (len(s) - 1) * p / 100
        f, c = math.floor(k), math.ceil(k)
        lo, hi = s[f], s[c]
        frac = k - f
        val = lo[m] if f == c else lo[m] + (hi[m] - lo[m]) * frac
        r = dict(pct=p, value=val, pos=k, of=len(s), lo=run_rec(lo), lo_w=1 - frac if f != c else 1)
        if f != c:
            r.update(hi=run_rec(hi), hi_w=frac)
        r['dropped'] = [[x['date'], x['loom']] for x in dropped]
        # the single best loom-day, and the loom-days at or better than the benchmark (best first)
        r['best'] = run_rec(s[-1] if high else s[0])
        better = [x for x in s if (x[m] >= val - 1e-9 if high else x[m] <= val + 1e-9)]
        better.sort(key=lambda x: (-x[m] if high else x[m], x['date'], x['loom']))
        r['n_better'] = len(better)
        if p != 50:
            r['top'] = [run_rec(x) for x in better[:TOP_MAX]]
        out[m] = r
    return out


def comp_work(p_kgf):
    pa = p_kgf * KGF + PATM
    return (pa / PATM) ** 0.2857 - 1


def saving(p_now, p_new, drop_kgf):
    if p_now is None or p_new is None or p_new >= p_now:
        return 0.0, 0.0
    rule = 0.07 * (p_now - p_new) * KGF
    adia = 1 - comp_work(p_new + drop_kgf) / comp_work(p_now + drop_kgf)
    return rule, adia


def load_targets(a):
    """Targets saved in the app, keyed (width, hg), and the 280 cm head groups switched to single panna."""
    targets, single = {}, set()
    if getattr(a, 'targets', None) and os.path.exists(a.targets):
        try:
            raw = json.load(open(a.targets))
        except Exception:
            raw = []
        if isinstance(raw, dict):
            raw = raw.get('documents') or raw.get('docs') or list(raw.values())
        for t in raw or []:
            if isinstance(t, dict) and isinstance(t.get('data'), dict):
                t = t['data']
            if not (isinstance(t, dict) and t.get('width') is not None and t.get('hg')):
                continue
            if t.get('single_panna'):
                single.add(t['hg'])
            else:
                targets[(str(t['width']), t['hg'])] = t
    return targets, single


def panna_of(width, hg, single):
    """280 cm looms weave two panels (double panna) unless the head group is switched to single panna.
    Each machine pick then makes two fabric picks: picks and air per 1,000 picks use fabric picks;
    RPM, CFM and warp-break rate stay on machine picks."""
    return 2 if str(width) == '280' and hg not in single else 1


def r1(x, n=1):
    return None if x is None else round(x, n)


def cmd_compute(a):
    """Latest view (data.json + notification) plus one as-of snapshot per complete day (--days-out)."""
    data = build(a)
    days_out = getattr(a, 'days_out', None)
    if days_out:
        os.makedirs(days_out, exist_ok=True)
        keep = data['complete_days'][-SNAP_DAYS:]
        for f in os.listdir(days_out):
            if f.endswith('.json') and f[:-5] not in keep:
                os.remove(os.path.join(days_out, f))
        for d in keep:
            v = build(a, as_of=d)
            v['unassigned'] = data['unassigned']   # head-group questions are always the current ones
            v['snapshots'] = keep
            v['generated_at'] = ''   # fixed, so an unchanged snapshot is not rewritten every run
            json.dump(v, open(os.path.join(days_out, d + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))


SNAP_DAYS = 60


def build(a, as_of=None):
    """Compute the app data. With as_of, use only history up to and including that date, so every
    figure (benchmarks included) is what the app would have shown on that day. Writes a.out and
    a.notify only for the latest view (as_of None)."""
    cfg = json.load(open(a.config))
    S = dict(benchmark_min_run_min=720, benchmark_min_loom_days=15, benchmark_min_dates=5, benchmark_min_looms=2,
             benchmark_pct_high=90, benchmark_pct_low=10, tol_rpm_pct=3, tol_eff_pts=5, tol_air_pct=5,
             persist_days=3, air_weight=1, line_drop_bar=0.2, warp_multiple=2, warp_min_rate=3, warp_days=3,
             pressure_rise_alert=0.2, off_alert_min=120, eff_bad_below=90)
    S.update({k: v for k, v in cfg['settings'].items() if isinstance(v, (int, float))})
    drop = S['line_drop_bar'] / KGF
    style_map = dict(cfg['style_map'])
    if a.assign and os.path.exists(a.assign):
        for x in json.load(open(a.assign)):
            if x.get('style') and x.get('head_group'):
                style_map[decode_style(x['style'])] = x['head_group']
    machine = {int(k): v for k, v in cfg['machine'].items()}
    groups = cfg['head_groups']
    targets, single = load_targets(a)

    log = read_csv(os.path.join(a.store, 'shift_log.csv'), LOG_COLS)
    reg = read_csv(os.path.join(a.store, 'file_register.csv'), REG_COLS)
    if as_of:
        log = [r for r in log if r['date'] <= as_of]
        reg = [r for r in reg if r['folder_date'] <= as_of]
    num = ['run', 'stop', 'rpm', 'eff', 'af1', 'af2', 'picks', 'cfm', 'main', 'warp', 'weft']
    for r in log:
        r['loom'] = int(r['loom'])
        for k in num:
            r[k] = float(r[k] or 0)
        r['hg'] = style_map.get(r['style_key'])
        m = machine.get(r['loom'], dict(width='?', type='?', active=True))
        r['width'] = m['width']; r['type'] = m['type']

    shifts_by_date = defaultdict(set)
    for r in log:
        shifts_by_date[r['date']].add(r['shift'])
    dates = sorted(shifts_by_date)
    complete = [d for d in dates if shifts_by_date[d] >= {'A', 'B'}]
    day_status = {d: ('complete' if d in complete else 'incomplete (shift ' + '/'.join(sorted(shifts_by_date[d])) + ' only)') for d in dates}

    # ---- loom-day-group records (complete days only)
    acc = {}
    loomday = defaultdict(lambda: dict(run=0.0, stop=0.0))
    for r in log:
        if r['date'] not in complete:
            continue
        k = (r['date'], r['loom'], r['hg'] or 'Unassigned', r['style_key'] if not r['hg'] else '')
        x = acc.setdefault(k, dict(date=r['date'], loom=r['loom'], width=r['width'], type=r['type'],
                                   hg=r['hg'] or 'Unassigned', assigned=bool(r['hg']), styles=set(), beams=Counter(),
                                   run=0.0, stop=0.0, picks=0.0, af1=0.0, af2=0.0, mainw=0.0, warp=0.0, weft=0.0,
                                   main_max=0.0))
        x['styles'].add(r['raw_style']); x['beams'][r['beam']] += r['run']
        for f in ('run', 'stop', 'picks', 'af1', 'af2', 'warp', 'weft'):
            x[f] += r[f]
        x['mainw'] += r['main'] * r['run']
        if r['run'] >= 60:
            x['main_max'] = max(x['main_max'], r['main'])
        ld = loomday[(r['date'], r['loom'])]; ld['run'] += r['run']; ld['stop'] += r['stop']
    recs = []
    for x in acc.values():
        run = x['run']
        x['rpm'] = x['picks'] / run if run else 0
        x['eff'] = 100 * run / (run + x['stop']) if run + x['stop'] else 0
        # effective RPM = RPM × efficiency = machine picks per minute of run + stop time
        x['erpm'] = x['picks'] / (run + x['stop']) if run + x['stop'] else 0
        x['cfm'] = x['af1'] / x['af2'] if x['af2'] else 0
        x['air'] = x['af1'] / 60.0
        x['panna'] = panna_of(x['width'], x['hg'], single)
        x['fpicks'] = x['picks'] * x['panna']
        x['apk'] = 1000 * x['air'] / x['fpicks'] if x['fpicks'] else None
        x['main'] = x['mainw'] / run if run else 0
        x['warp_rate'] = x['warp'] / x['picks'] * 1e5 if x['picks'] else None
        x['beam'] = x['beams'].most_common(1)[0][0] if x['beams'] else ''
        x['eligible'] = x['assigned'] and run >= S['benchmark_min_run_min'] and x['rpm'] > 0
        x['available'] = x['assigned'] and run + x['stop'] >= 720 and x['rpm'] > 0
        x['styles'] = sorted(x['styles'])
        recs.append(x)
    # powered-down per loom-day, including looms missing from a file
    util = []
    for d in complete:
        for loom, m in machine.items():
            if not m.get('active', True):
                continue
            ld = loomday.get((d, loom), dict(run=0.0, stop=0.0))
            off = max(0.0, DAY_MIN - ld['run'] - ld['stop'])
            if off < 10:
                off = 0.0
            util.append(dict(date=d, loom=loom, width=m['width'], type=m['type'], run=round(ld['run']),
                             stop=round(ld['stop']), off=round(off)))

    # ---- benchmarks per (width, hg)
    bykey = defaultdict(list)
    for x in recs:
        if x['eligible']:
            bykey[(x['width'], x['hg'])].append(x)
    bench = {}
    for k, L in bykey.items():
        nd = len({x['date'] for x in L}); nl = len({x['loom'] for x in L}); n = len(L)
        b = dict(width=k[0], hg=k[1], n=n, dates=nd, looms=nl,
                 rpm=pct([x['rpm'] for x in L], S['benchmark_pct_high']),
                 eff=pct([x['eff'] for x in L], S['benchmark_pct_high']),
                 erpm=pct([x['erpm'] for x in L], S['benchmark_pct_high']),
                 apk=pct([x['apk'] for x in L if x['apk']], S['benchmark_pct_low']),
                 main=pct([x['main'] for x in L], S['benchmark_pct_low']),
                 main_max=pct([x['main_max'] for x in L if x['main_max'] > 0] or [0], S['benchmark_pct_low']),
                 warp_med=st.median([x['warp_rate'] for x in L if x['warp_rate'] is not None] or [0]),
                 best_rpm=max(x['rpm'] for x in L), best_eff=max(x['eff'] for x in L), best_erpm=max(x['erpm'] for x in L),
                 best_apk=min((x['apk'] for x in L if x['apk']), default=None),
                 best_main_max=min([x['main_max'] for x in L if x['main_max'] > 0] or [0]) or None,
                 best_main=min(x['main'] for x in L), panna=panna_of(k[0], k[1], single))
        recent = [x for x in L if x['date'] in complete[-30:]]
        b['cur_rpm'] = st.median([x['rpm'] for x in recent]) if recent else None
        b['cur_eff'] = st.median([x['eff'] for x in recent]) if recent else None
        b['cur_apk'] = st.median([x['apk'] for x in recent if x['apk']]) if recent else None
        b['runs'] = bench_runs(L, S)
        if n >= S['benchmark_min_loom_days'] and nd >= S['benchmark_min_dates']:
            b['status'] = 'published' if nl >= S['benchmark_min_looms'] else 'single-loom'
        else:
            b['status'] = 'provisional'
        bench[k] = b
    latest = complete[-1] if complete else None
    last7 = complete[-7:]
    last14 = complete[-14:]

    # ---- quality table (latest complete day + 7-day)
    def agg(L):
        R = sum(x['run'] for x in L); P = sum(x['picks'] for x in L); FP = sum(x['fpicks'] for x in L)
        if not R or not P:
            return None
        return dict(looms=len({x['loom'] for x in L}), rpm=P / R,
                    eff=100 * R / sum(x['run'] + x['stop'] for x in L),
                    cfm=sum(x['cfm'] * x['run'] for x in L) / R,
                    apk=1000 * sum(x['air'] for x in L) / FP,
                    main_lo=min(x['main'] for x in L), main_hi=max(x['main'] for x in L),
                    warp=sum(x['warp'] for x in L) / P * 1e5, picks=FP)
    qual = []
    grp = defaultdict(list); grp7 = defaultdict(list)
    for x in recs:
        if x['run'] < 60:
            continue
        if x['date'] == latest:
            grp[(x['width'], x['type'], x['hg'])].append(x)
        if x['date'] in last7:
            grp7[(x['width'], x['type'], x['hg'])].append(x)
    for k in sorted(set(grp) | set(grp7)):
        d1 = agg(grp.get(k, [])); d7 = agg(grp7.get(k, []))
        b = bench.get((k[0], k[2]))
        qual.append(dict(width=k[0], type=k[1], hg=k[2], day=d1, week=d7,
                         bench=None if not b else dict(status=b['status'], rpm=b['rpm'], eff=b['eff'], apk=b['apk'],
                                                       n=b['n'], dates=b['dates'], looms=b['looms'])))

    # ---- KPIs per width, latest day vs prior 7
    def width_kpi(ds, w):
        L = [x for x in recs if x['date'] in ds and x['width'] == w and x['run'] > 0]
        if not L:
            return None
        R = sum(x['run'] for x in L); P = sum(x['picks'] for x in L); FP = sum(x['fpicks'] for x in L)
        U = [u for u in util if u['date'] in ds and u['width'] == w]
        return dict(picks_m=FP / 1e6 / len(ds), eff=100 * R / sum(x['run'] + x['stop'] for x in L),
                    apk=1000 * sum(x['air'] for x in L) / FP, rpm=P / R,
                    off_h=sum(u['off'] for u in U) / 60 / len(ds))
    kpis = {}
    for w in ('190', '280'):
        prior = complete[-8:-1]
        kpis[w] = dict(day=width_kpi([latest], w) if latest else None, prior=width_kpi(prior, w) if prior else None)

    # ---- pressure: floor per shift and per day
    shift_main = defaultdict(dict)   # (date, shift) -> loom -> (main, hg, width, type)
    for r in log:
        if r['run'] >= 60:
            cur = shift_main[(r['date'], r['shift'])].get(r['loom'])
            if not cur or r['main'] > cur[0]:
                shift_main[(r['date'], r['shift'])][r['loom']] = (r['main'], r['hg'] or 'Unassigned', r['width'], r['type'])
    floor_hist = []
    day_loom_main = {}
    for d in complete:
        m = {}
        for s in ('A', 'B'):
            for loom, v in shift_main.get((d, s), {}).items():
                if loom not in m or v[0] > m[loom][0]:
                    m[loom] = v
        day_loom_main[d] = m
        if m:
            top = max(m.items(), key=lambda kv: kv[1][0])
            floor_hist.append(dict(date=d, floor=top[1][0], loom=top[0], hg=top[1][1],
                                   A=max((v[0] for v in shift_main.get((d, 'A'), {}).values()), default=None),
                                   B=max((v[0] for v in shift_main.get((d, 'B'), {}).values()), default=None)))
    stair = []; setters = []
    if latest and day_loom_main.get(latest):
        m = day_loom_main[latest]
        ordered = sorted(m.items(), key=lambda kv: -kv[1][0])
        top = ordered[0][1][0]
        levels = sorted({v[0] for _, v in ordered}, reverse=True)
        for lvl in levels[1:7]:
            fixed = [dict(loom=l, hg=v[1], main=v[0]) for l, v in ordered if v[0] > lvl]
            rule, adia = saving(top, lvl, drop)
            stair.append(dict(to=lvl, looms=fixed, rule=rule, adia=adia))
        looms_sorted = [dict(loom=l, hg=v[1], main=v[0], width=v[2], type=v[3]) for l, v in ordered]
    else:
        looms_sorted = []
    # floor setters over last 14 complete days
    picks_hg = Counter(); picks_tot = 0
    for x in recs:
        if x['date'] in last14:
            picks_hg[x['hg']] += x['fpicks']; picks_tot += x['fpicks']
    held = defaultdict(list)
    for d in last14:
        m = day_loom_main.get(d, {})
        if not m:
            continue
        top = max(v[0] for v in m.values())
        at_top = {v[1] for v in m.values() if v[0] >= top - 1e-9}
        rest_all = [v[0] for v in m.values() if v[1] not in at_top]
        without_all = max(rest_all) if rest_all else top
        for hg in at_top:
            rest = [v[0] for v in m.values() if v[1] != hg]
            without = max(rest) if rest else top
            held[hg].append(dict(date=d, dp=top - without, top=top, without=without,
                                 shared=sorted(at_top - {hg}), without_all=without_all,
                                 looms=sorted([l for l, v in m.items() if v[1] == hg and v[0] > without_all],
                                              key=lambda l: -m[l][0])))
    n14 = len([d for d in last14 if day_loom_main.get(d)])
    for hg, L in held.items():
        if len(L) * 2 < n14:
            continue
        lastL = L[-1]; m = day_loom_main[lastL['date']]
        target = lastL['without'] if lastL['dp'] > 1e-9 else lastL['without_all']
        rule, adia = saving(lastL['top'], target, drop)
        hl = lastL['looms'] or [l for l, v in m.items() if v[1] == hg and v[0] >= lastL['top'] - 1e-9]
        lastL = dict(lastL, without=target)
        w = m[hl[0]][2]; t = m[hl[0]][3]
        own = [x['main'] for x in recs if x['hg'] == hg and x['width'] == w and x['type'] == t and x['run'] >= 60]
        best = pct(own, 25) if own else None
        others = defaultdict(list)
        for x in recs:
            if x['hg'] == hg and x['width'] == w and x['type'] != t and x['run'] >= 60:
                others[x['type']].append(x['main'])
        share = 100 * picks_hg[hg] / picks_tot if picks_tot else 0
        names = ', '.join(f"{l} ({m[l][0]:.2f})" for l in hl[:4])
        if best is not None and best <= lastL['without'] + 1e-9:
            rec, why = 'Fix settings', (f"{hg} has run at {best:.2f} kgf/cm² or lower on {w} cm {t} looms, at or below the "
                                        f"{lastL['without']:.2f} the floor needs without it. Bring down loom {names}.")
        elif any(st.median(v) <= lastL['without'] for v in others.values()):
            tt = min(others, key=lambda k: st.median(others[k]))
            rec, why = 'Move to other looms', (f"{hg} runs at a median {st.median(others[tt]):.2f} on {w} cm {tt} looms, "
                                               f"below the {lastL['without']:.2f} floor. Check capacity there.")
        elif share < 10:
            rec, why = 'Run in batches', (f"No loom has run {hg} below {lastL['without']:.2f}; it is {share:.1f}% of picks, "
                                          f"so grouping it in a fixed window limits the high setpoint to that time.")
        else:
            rec, why = 'Your call', (f"No loom has run {hg} below {lastL['without']:.2f} and it is {share:.1f}% of picks.")
        if L[-1]['dp'] <= 1e-9 and L[-1]['shared']:
            why += f" It shares the top with {', '.join(L[-1]['shared'])}; the saving needs both brought down."
        setters.append(dict(hg=hg, days=len(L), of=n14, dp=lastL['top'] - target, alone=L[-1]['dp'],
                            shared=L[-1]['shared'], floor=lastL['top'], without=lastL['without'],
                            looms=[dict(loom=l, main=m[l][0]) for l in hl], rule=rule, adia=adia, share=share,
                            rec=rec, why=why))
    setters.sort(key=lambda s: -s['dp'])

    # ---- warp list
    def hg_week_median(w, hg):
        v = [x['warp_rate'] for x in recs if x['width'] == w and x['hg'] == hg and x['date'] in last14 and
             x['run'] >= 60 and x['warp_rate'] is not None]
        return st.median(v) if v else None
    warp_list = []
    looms_hist = defaultdict(list)
    for x in recs:
        if x['run'] >= 60 and x['assigned']:
            looms_hist[x['loom']].append(x)
    for loom, L in looms_hist.items():
        L = sorted(L, key=lambda x: x['date'])
        cur_hg = L[-1]['hg']
        L5 = [x for x in L if x['hg'] == cur_hg][-5:]
        med = hg_week_median(L5[-1]['width'], cur_hg) if L5 else None
        if med is None:
            continue
        lim = max(S['warp_multiple'] * med, S['warp_min_rate'])
        bad = [x for x in L5 if (x['warp_rate'] or 0) > lim]
        if len(bad) >= min(S['warp_days'], len(L5)) and len(L5) >= min(3, len(complete)) and bad:
            warp_list.append(dict(loom=loom, width=L5[-1]['width'], type=L5[-1]['type'], hg=cur_hg,
                                  rate=st.mean(x['warp_rate'] for x in bad), median=med, days=len(bad), of=len(L5),
                                  beams=sorted({x['beam'] for x in bad if x['beam']}),
                                  last=L5[-1]['warp_rate'], eff=L5[-1]['eff']))
    warp_list.sort(key=lambda x: -(x['rate'] / (x['median'] or 1)))
    warp_looms = {w['loom'] for w in warp_list}
    # worst warp looms over the last 7 days, for context on the warp page
    warp_top = []
    for loom, L in looms_hist.items():
        L7 = [x for x in L if x['date'] in last7 and x['warp_rate'] is not None]
        if not L7:
            continue
        P = sum(x['picks'] for x in L7)
        if P <= 0:
            continue
        warp_top.append(dict(loom=loom, hg=L7[-1]['hg'], width=L7[-1]['width'], type=L7[-1]['type'],
                             rate=sum(x['warp'] for x in L7) / P * 1e5, days=len(L7),
                             beams=sorted({x['beam'] for x in L7 if x['beam']}), eff=st.mean(x['eff'] for x in L7)))
    warp_top.sort(key=lambda x: -x['rate'])
    warp_top = warp_top[:15]
    width_med = {}
    for w in ('190', '280'):
        v = [x['warp_rate'] for x in recs if x['width'] == w and x['date'] in last14 and x['run'] >= 60 and x['warp_rate'] is not None]
        width_med[w] = st.median(v) if v else None
    warp_quality = []
    for w in ('190', '280'):
        for hg in {x['hg'] for x in recs if x['width'] == w and x['assigned']}:
            m = hg_week_median(w, hg)
            if m and width_med[w] and m > 2 * width_med[w] and m > S['warp_min_rate'] / 2:
                warp_quality.append(dict(width=w, hg=hg, median=m, width_median=width_med[w]))
    warp_quality.sort(key=lambda x: (x['width'], -x['median']))

    # ---- loom priority (settings work)
    priority = {'190': [], '280': []}
    for loom, L in looms_hist.items():
        L = sorted(L, key=lambda x: x['date'])
        cur_hg = L[-1]['hg']; w = L[-1]['width']
        b = bench.get((w, cur_hg))
        if not b or not b['rpm'] or not b['apk']:
            continue
        days = [x for x in L if x['hg'] == cur_hg and x['date'] in last7 and x['available']]
        if not days:
            continue
        off = dict(rpm=[], eff=[], air=[])
        for x in days:
            avail = x['run'] + x['stop']
            bench_picks = b['rpm'] * b['eff'] / 100 * avail
            lost_rpm = max(0, b['rpm'] - x['rpm']) * x['run']
            lost_eff = max(0, x['rpm'] * (S['eff_bad_below'] / 100 * avail - x['run']))
            if x['rpm'] < b['rpm'] * (1 - S['tol_rpm_pct'] / 100):
                off['rpm'].append((x, lost_rpm / bench_picks if bench_picks else 0))
            if x['eff'] < S['eff_bad_below']:
                off['eff'].append((x, lost_eff / bench_picks if bench_picks else 0))
            if x['apk'] and x['apk'] > b['apk'] * (1 + S['tol_air_pct'] / 100):
                off['air'].append((x, S['air_weight'] * (x['apk'] - b['apk']) / b['apk']))
        metrics = []; score = 0.0
        for mk, items in off.items():
            if len(items) < min(S['persist_days'], len(days)) or len(items) < min(S['persist_days'], len(last7)):
                continue
            wr = [x['warp_rate'] for x, _ in items if x['warp_rate'] is not None]
            hmed = hg_week_median(w, cur_hg)
            beamy = loom in warp_looms or (wr and hmed and st.mean(wr) > 1.5 * hmed and st.mean(wr) > S['warp_min_rate'])
            if mk == 'eff' and beamy:
                metrics.append(dict(metric='eff', days=len(items), of=len(days), likely_beam=True,
                                    value=st.mean(x['eff'] for x, _ in items), bench=S['eff_bad_below'], score=0))
                continue
            s = sum(v for _, v in items)
            val = st.mean((x['rpm'] if mk == 'rpm' else x['eff'] if mk == 'eff' else x['apk']) for x, _ in items)
            ref = b['rpm'] if mk == 'rpm' else S['eff_bad_below'] if mk == 'eff' else b['apk']
            metrics.append(dict(metric=mk, days=len(items), of=len(days), value=val, bench=ref, score=s))
            score += s
        if score > 0:
            priority[w].append(dict(loom=loom, hg=cur_hg, type=L[-1]['type'], width=w, score=score,
                                    metrics=metrics, bench_status=b['status'], main=L[-1]['main']))
    for w in priority:
        priority[w].sort(key=lambda p: -p['score'])
        for i, p in enumerate(priority[w]):
            p['rank'] = i + 1

    # ---- unassigned names
    unassigned = {}
    for r in log:
        if not r['hg'] and (r['style_key'] or r['run'] > 0):
            u = unassigned.setdefault(r['style_key'], dict(style=r['style_key'], raw=set(), looms=set(), first=r['date'], last=r['date'], run=0.0))
            u['raw'].add(r['raw_style']); u['looms'].add(r['loom']); u['first'] = min(u['first'], r['date'])
            u['last'] = max(u['last'], r['date']); u['run'] += r['run']
    unassigned = [dict(style=u['style'], raw=sorted(u['raw']), looms=sorted(u['looms']), first=u['first'],
                       last=u['last'], run_h=round(u['run'] / 60, 1)) for u in unassigned.values()]

    # ---- alerts
    alerts = []
    def alert(level, scope, msg):
        alerts.append(dict(level=level, scope=scope, msg=msg))
    for d in dates:
        if d not in complete:
            alert('Critical', 'Data', f"{d}: only shift {'/'.join(sorted(shifts_by_date[d]))} received")
    latest_reg_date = max([r['folder_date'] for r in reg] or [''])
    for r in reg:
        if r['status'] == 'quarantined' and r['folder_date'] >= (complete[-7] if len(complete) >= 7 else ''):
            alert('Critical', 'Data', f"{r['file_name']} ({r['folder_date']}) not used: {r['reason']}")
        if r['status'] == 'ingested' and r['reason']:
            alert('Info', 'Data', f"{r['file_name']}: {r['reason']}")
    if len(floor_hist) >= 2:
        a_, b_ = floor_hist[-2], floor_hist[-1]
        if b_['hg'] != a_['hg']:
            alert('Critical', 'Floor', f"Floor pressure now set by loom {b_['loom']} ({b_['hg']}) at {b_['floor']:.2f} kgf/cm², "
                                       f"was loom {a_['loom']} ({a_['hg']}) at {a_['floor']:.2f}")
        prior = [f['floor'] for f in floor_hist[-15:-1]]
        if len(prior) >= 3 and b_['floor'] - st.median(prior) >= S['pressure_rise_alert']:
            alert('Critical', 'Floor', f"Floor pressure {b_['floor']:.2f} is {b_['floor'] - st.median(prior):.2f} above its recent median")
    if latest:
        rises = []
        for loom, v in day_loom_main.get(latest, {}).items():
            prior = [day_loom_main[d][loom][0] for d in complete[-15:-1] if loom in day_loom_main.get(d, {})]
            if len(prior) >= 3 and v[0] - st.median(prior) >= S['pressure_rise_alert']:
                rises.append((v[0] - st.median(prior), loom, v))
        for rise, loom, v in sorted(rises, reverse=True):
            alert('Warning', 'Loom', f"Loom {loom} ({v[1]}): main pressure {v[0]:.2f}, up {rise:.2f} on its recent median")
        for u in util:
            if u['date'] == latest and u['off'] > S['off_alert_min']:
                alert('Info', 'Loom', f"Loom {u['loom']} powered down {u['off']} min")
        for x in recs:
            if x['date'] != latest or x['run'] < 60:
                continue
            hist = [y['cfm'] for y in looms_hist.get(x['loom'], []) if y['date'] < latest and y['hg'] == x['hg']][-30:]
            if len(hist) >= 5 and x['cfm'] > 1.5 * st.median(hist):
                alert('Info', 'Loom', f"Loom {x['loom']}: CFM {x['cfm']:.1f}, over 1.5× its usual {st.median(hist):.1f} (check for a leak or bad reading)")
        # day on day per quality-width
        for (w, hg), b in bench.items():
            dayL = [x for x in recs if x['date'] == latest and x['width'] == w and x['hg'] == hg and x['run'] >= 60]
            prevD = complete[-8:-1]
            prevL = [x for x in recs if x['date'] in prevD and x['width'] == w and x['hg'] == hg and x['run'] >= 60]
            if not dayL or len({x['date'] for x in prevL}) < 3:
                continue
            A1 = agg(dayL); A0 = agg(prevL)
            if A1['rpm'] < A0['rpm'] * (1 - S['tol_rpm_pct'] / 100):
                alert('Warning', 'Quality', f"{hg} {w} cm: RPM {A1['rpm']:.0f} vs {A0['rpm']:.0f} 7-day mean")
            if A1['eff'] < A0['eff'] - S['tol_eff_pts']:
                alert('Warning', 'Quality', f"{hg} {w} cm: efficiency {A1['eff']:.1f}% vs {A0['eff']:.1f}% 7-day mean")
            if A1['apk'] > A0['apk'] * (1 + S['tol_air_pct'] / 100):
                alert('Warning', 'Quality', f"{hg} {w} cm: air {A1['apk']:.1f} vs {A0['apk']:.1f} ft³/1000 picks 7-day mean")
        # week on week
        if len(complete) >= 14:
            W1, W0 = complete[-7:], complete[-14:-7]
            for (w, hg), b in bench.items():
                L1 = [x for x in recs if x['date'] in W1 and x['width'] == w and x['hg'] == hg and x['run'] >= 60]
                L0 = [x for x in recs if x['date'] in W0 and x['width'] == w and x['hg'] == hg and x['run'] >= 60]
                if not L1 or not L0:
                    continue
                A1 = agg(L1); A0 = agg(L0)
                if A1['rpm'] < A0['rpm'] * 0.98:
                    alert('Warning', 'Quality', f"{hg} {w} cm: RPM down week on week ({A0['rpm']:.0f} → {A1['rpm']:.0f})")
                if A1['eff'] < A0['eff'] - 3:
                    alert('Warning', 'Quality', f"{hg} {w} cm: efficiency down week on week ({A0['eff']:.1f}% → {A1['eff']:.1f}%)")
                if A1['apk'] > A0['apk'] * 1.03:
                    alert('Warning', 'Quality', f"{hg} {w} cm: air up week on week ({A0['apk']:.1f} → {A1['apk']:.1f})")
    if unassigned:
        alert('Warning', 'Data', f"{len(unassigned)} style name(s) need a head group")
    order = {'Critical': 0, 'Warning': 1, 'Info': 2}
    alerts.sort(key=lambda x: order[x['level']])

    # ---- trends per (width, hg)
    trends = defaultdict(lambda: defaultdict(dict))
    for (w, t, hg) in {(x['width'], x['type'], x['hg']) for x in recs}:
        pass
    for d in complete:
        bykw = defaultdict(list)
        for x in recs:
            if x['date'] == d and x['run'] >= 60:
                bykw[(x['width'], x['hg'])].append(x)
        for (w, hg), L in bykw.items():
            A = agg(L)
            trends[w][hg][d] = dict(rpm=r1(A['rpm'], 0), eff=r1(A['eff']), apk=r1(A['apk']),
                                    main=r1(max(x['main'] for x in L), 2), warp=r1(A['warp'], 2))

    # ---- stop-time air estimate (within-loom slope of CFM on stop/run, per width)
    slope = {}
    for w in ('190', '280'):
        byl = defaultdict(list)
        for r in log:
            if r['width'] == w and r['run'] >= 300 and r['hg']:
                byl[(r['loom'], r['hg'])].append((r['stop'] / r['run'], r['cfm']))
        D = []
        for L in byl.values():
            if len(L) < 2:
                continue
            mx = st.mean(p[0] for p in L); my = st.mean(p[1] for p in L)
            D += [(p[0] - mx, p[1] - my) for p in L]
        sxx = sum(a_ * a_ for a_, _ in D)
        slope[w] = dict(q_stop=(sum(a_ * c for a_, c in D) / sxx) if sxx else None, n=len(D))

    # ---- utilisation summary per loom (last 7)
    util7 = defaultdict(lambda: dict(run=0, stop=0, off=0, days=0))
    for u in util:
        if u['date'] in last7:
            z = util7[u['loom']]; z['run'] += u['run']; z['stop'] += u['stop']; z['off'] += u['off']; z['days'] += 1
    loom_hg_latest = {}
    for x in sorted(recs, key=lambda x: (x['date'], x['run'])):
        loom_hg_latest[x['loom']] = x['hg']

    def clean(o):
        if isinstance(o, float):
            return round(o, 4)
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple, set)):
            return [clean(v) for v in o]
        return o

    data = dict(
        generated_at=now(), latest=latest, days=[dict(date=d, status=day_status[d]) for d in dates],
        complete_days=complete, settings=S, head_groups=groups,
        kpis=kpis, quality=qual,
        benchmarks=sorted(bench.values(), key=lambda b: (b['width'], b['hg'])),
        priority=priority, warp=warp_list, warp_quality=warp_quality, warp_top=warp_top,
        pressure=dict(floor=floor_hist, looms=looms_sorted, stair=stair, setters=setters,
                      line_drop_kgf=drop, compressor_min=(floor_hist[-1]['floor'] + drop) if floor_hist else None),
        util=[u for u in util if u['date'] in complete[-60:]], util7={str(k): v for k, v in util7.items()}, loom_hg=loom_hg_latest,
        machine={str(k): v for k, v in machine.items()},
        trends=trends, alerts=alerts, unassigned=unassigned, stop_air=slope,
        loomdays=[dict(date=x['date'], loom=x['loom'], hg=x['hg'], width=x['width'], type=x['type'],
                       run=x['run'], stop=x['stop'], rpm=x['rpm'], eff=x['eff'], erpm=x['erpm'], cfm=x['cfm'], apk=x['apk'],
                       main=x['main'], main_max=x['main_max'], picks=x['picks'], fpicks=x['fpicks'], panna=x['panna'], air=x['air'],
                       warp=x['warp'], warp_rate=x['warp_rate'], beam=x['beam'],
                       styles=x['styles'], eligible=x['eligible']) for x in sorted(recs, key=lambda x: (x['date'], x['loom']))
                  if x['date'] in complete[-60:]],
        files=reg[-60:], as_of=as_of, panna=dict(single=sorted(single), default_280=2),
    )
    data = clean(data)
    if as_of:
        return data
    data['snapshots'] = complete[-SNAP_DAYS:]
    json.dump(data, open(a.out, 'w'), ensure_ascii=False, separators=(',', ':'))

    # ---- notification text (latest day only; RPM, efficiency, CFM, pressure vs benchmark and target)
    def num(v):
        try:
            return float(v) if v not in (None, '') else None
        except (TypeError, ValueError):
            return None
    act = dict(rpm=[], eff=[], cfm=[], press=[])
    if latest:
        for x in recs:
            if x['date'] != latest or x['run'] < 60:
                continue
            if x['eff'] < S['eff_bad_below']:
                lost = max(0, S['eff_bad_below'] / 100 * (x['run'] + x['stop']) - x['run']) * x['rpm']
                act['eff'].append((lost, f"{x['loom']} {x['eff']:.0f}%"))
            if not x['assigned']:
                continue
            b = bench.get((x['width'], x['hg'])); t = targets.get((x['width'], x['hg']), {})
            if not b:
                continue
            tr, tc, tm = num(t.get('rpm')), num(t.get('cfm')), num(t.get('main'))
            refs = [r for r in (b['rpm'], tr) if r and x['rpm'] < r * (1 - S['tol_rpm_pct'] / 100)]
            if refs:
                ref = max(refs)
                act['rpm'].append(((ref - x['rpm']) * x['run'], f"{x['loom']} {x['rpm']:.0f} vs {ref:.0f}"))
            cb = b['apk'] * x['panna'] * x['rpm'] / 1000 if b['apk'] else None   # benchmark air is per fabric pick
            refs = [r for r in (cb, tc) if r and x['cfm'] > r * (1 + S['tol_air_pct'] / 100)]
            if refs:
                ref = min(refs)
                act['cfm'].append((x['cfm'] - ref, f"{x['loom']} +{x['cfm'] - ref:.1f}"))
            pb = b.get('main_max') or b.get('main')
            refs = [r for r in (pb, tm) if r and x['main_max'] > r + 0.1]
            if refs:
                ref = min(refs)
                act['press'].append((x['main_max'] + (x['main_max'] - ref) / 100, f"{x['loom']} {x['main_max']:.2f} vs {ref:.2f}"))
    L = []
    if latest:
        L.append(f"W2 looms · {dt.date.fromisoformat(latest).strftime('%d %b')} · shifts A+B")
        for w in ('190', '280'):
            k = kpis[w]['day']; p = kpis[w]['prior']
            if not k:
                continue
            Lw = [x for x in recs if x['date'] == latest and x['width'] == w and x['run'] > 0]
            R = sum(x['run'] for x in Lw); AIR = sum(x['air'] for x in Lw)
            de = f" ({k['eff'] - p['eff']:+.1f} vs prior avg)" if p else ''
            L.append(f"{w} cm: eff {k['eff']:.1f}%{de} · RPM {k['rpm']:.0f} · avg {AIR / R:.1f} CFM · total {AIR / 1440:.0f} CFM")
        if floor_hist:
            f = floor_hist[-1]
            L.append(f"Floor pressure {f['floor']:.2f} kgf/cm² · loom {f['loom']} ({f['hg']})")
        names = dict(eff=f"Eff below {S['eff_bad_below']:.0f}%", rpm='RPM low', cfm='CFM over (excess CFM)', press='Pressure over (kgf/cm²)')
        for mk in ('eff', 'rpm', 'cfm', 'press'):
            items = sorted(act[mk], key=lambda z: -z[0])
            if items:
                L.append(f"{names[mk]}: {len(items)} looms · " + ', '.join(z[1] for z in items[:4]))
    crit = [x for x in alerts if x['level'] == 'Critical']
    if crit:
        L.append('Flags: ' + ' | '.join(x['msg'] for x in crit[:3]))
    if warp_list:
        wl = warp_list[0]
        L.append(f"Warp: loom {wl['loom']} {wl['hg']} {wl['rate']:.1f}/100k picks ({wl['rate'] / (wl['median'] or 1):.1f}× median)")
    if unassigned:
        L.append(f"{len(unassigned)} name(s) need a head group: " + ', '.join(u['style'] for u in unassigned[:3]))
    open(a.notify, 'w').write('\n'.join(L))
    print('\n'.join(L))
    return data


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('ingest'); p.add_argument('--store', required=True); p.add_argument('--folder-date', required=True)
    p.add_argument('--file-id', required=True); p.add_argument('--name', required=True); p.add_argument('--modified', default='')
    p.add_argument('file')
    p = sp.add_parser('status'); p.add_argument('--store', required=True); p.add_argument('--date', required=True)
    p = sp.add_parser('config'); p.add_argument('--style-map', required=True); p.add_argument('--machine', required=True)
    p.add_argument('--settings', required=True); p.add_argument('--head-groups', required=True); p.add_argument('--out', required=True)
    p = sp.add_parser('compute'); p.add_argument('--store', required=True); p.add_argument('--config', required=True)
    p.add_argument('--out', required=True); p.add_argument('--notify', required=True); p.add_argument('--assign')
    p.add_argument('--targets'); p.add_argument('--days-out', help='folder for one as-of snapshot per complete day')
    a = ap.parse_args()
    dict(ingest=cmd_ingest, status=cmd_status, config=cmd_config, compute=cmd_compute)[a.cmd](a)


if __name__ == '__main__':
    main()
