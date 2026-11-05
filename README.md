# Weavelon 2 Loom Performance

Phone-friendly dashboard of RPM, efficiency, CFM, pressure and warp breaks for the Toyota airjet looms at Hanuman Weavelon Unit 2.

- **App:** `index.html`, served by GitHub Pages. Install on iPhone with Safari → Share → Add to Home Screen.
- **Data:** `data/data.enc.json`, rebuilt by the daily scheduled task. Everything in `data/` and `state/` is encrypted with the app passcode because this repo is public.
- **Pipeline:** `pipeline/pipeline.py` parses the Toyota shift reports and computes the dashboard data; `seal.py` encrypts and decrypts.
- **Backend for edits:** `apps-script/Code.gs` runs in the W2 Loom Performance Config Sheet and stores targets and head-group answers in its *App targets* and *App assignments* tabs. The copy here has the passcode removed.
