# Hanuman Weavelon 2 · Loom Performance

Phone- and laptop-friendly dashboard of RPM, efficiency, CFM, pressure and warp breaks for the Toyota airjet looms at Hanuman Weavelon Unit 2.

- **App:** `index.html`, served by GitHub Pages. Install on iPhone with Safari → Share → Add to Home Screen.
- **Data:** `data/data.enc.json`, rebuilt by the daily scheduled task. Everything in `data/` and `state/` is encrypted with the app passcode because this repo is public.
- **Pipeline:** `pipeline/pipeline.py` parses the Toyota shift reports and computes the dashboard data; `seal.py` encrypts and decrypts.
- **Backend for edits:** `apps-script/Code.gs` runs in the W2 Loom Performance Config Sheet and stores targets and head-group answers in its *App targets* and *App assignments* tabs. The copy here has the passcode removed.

## Conventions
- **Double panna:** 280 cm looms weave two panels, so picks and air per 1,000 picks use fabric picks (machine picks × 2). RPM, CFM, pressure and warp-break rate stay on machine readings. A 280 cm head group can be switched to single panna in the app; the switch is saved as an `App targets` row whose id starts `panna__`, and `app_tabs.py targets` passes it to the pipeline as `single_panna`.
- **Benchmarks:** 90th percentile for RPM, 10th for air and pressure, all history, no outlier filter. Each benchmark also carries its single best loom-day (`runs.<metric>.best`) and the loom-days at or better than it (`runs.<metric>.top`, up to 40).
- **Effective RPM:** RPM × efficiency ÷ 100 = machine picks ÷ (run + stop) minutes. Benchmarked like RPM (90th percentile, `runs.erpm`), best = highest loom-day, target = 93% of the target RPM (no separate entry). Data from before the pipeline computed it gets it derived in the app from the loom-days kept on the page.
- **Best:** shown wherever benchmark and target are — tables, the CFM / Effective RPM / Pressure charts (green dot), and a "To best" reference mode on those three tabs. Action lists still flag only against benchmark and target.
- **Trends:** no Trends tab. Quality, CFM, Effective RPM, Pressure, Utilisation and Warp breaks each have a Trend card for one head group or one loom (↗ beside a loom or head group in any table loads it), and "View all trends" opens every metric for it in the panel. Loom periods: 7 days or since the last head-group changeover; head-group periods: 7, 14 or 30 days; default 7. Points use the same loom-day records and formulas as the tables. Reference lines are always the latest benchmark, best and target (from data.enc.json, even when the date picker shows an earlier day). `#trends` links open the Quality tab, which now holds the drift alerts.
- **Main pressure:** compared on the day max only; the run-weighted average is no longer shown as a benchmark.
