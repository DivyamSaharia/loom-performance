# ask/: the question search's model (Round Q, 28 Nov 2026)

Served as is by the public site; loaded by the browser only when someone taps "Understand my question" in the search (app/nav.js, Round Q). No data, no rates, nothing of the plant's.

| File | What | From | Licence | sha256 |
|---|---|---|---|---|
| `model_quantized.onnx` | all-MiniLM-L6-v2 sentence model, int8 | huggingface.co/Xenova/all-MiniLM-L6-v2 (`onnx/model_quantized.onnx`, main, matches Hugging Face's own LFS sha256) | Apache-2.0 (sentence-transformers/all-MiniLM-L6-v2) | afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1 |
| `tokenizer.json` | its WordPiece vocabulary (the app reads `model.vocab`) | the same repository, `tokenizer.json` | Apache-2.0 | da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0 |
| `ort.wasm.bundle.min.mjs` | ONNX Runtime Web 1.31.1, CPU (WebAssembly) build | npm `onnxruntime-web@1.31.1`, `dist/` | MIT (Microsoft) | 51bd7168175767324ab0acfcfc4ca94a096a3826e3ebac9ccc4f195eb865f8dd |
| `ort-wasm-simd-threaded.wasm` | its WebAssembly binary | the same package | MIT (Microsoft) | 4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d |

The browser keeps these in its storage under `w2-ask-v1` (not the service worker's copy, which is re-made on every publish). **If any file here changes, change `ASK_CACHE` and the sizes in `ASK_FILES` (app/nav.js) in the same commit**, so devices fetch the new files. `tests/test_ask.py` checks the sizes and the sha256 above.

Checked on 28 Nov 2026: `wpEncode` (app/ask.js) gives the same token ids as the model's own tokenizer (transformers.js 4.3.2) on six test sentences, and `askPool` over this runtime's output matches transformers.js's mean-pooled, normalised vectors (cosine 0.988–1.000).
