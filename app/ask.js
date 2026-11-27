// W2 Looms · app/ask.js — Question search (Round Q, 28 Nov 2026): the pure parts, run under Node in tests/test_ask.py.
// One of the classic scripts index.html loads in order; they share one scope (no modules, no build step).
// A question of three words or more typed into the search ("where do I see why cost per pick went up") is matched word by
// word against every place the search knows: each tab, card, Guide heading and Working entry, with the Guide's own text
// and the Working's "In words" behind them (askRank). The search box then lists the best five first. On request, a small
// English model on the device re-ranks them by meaning (askBlend): its files are served from this site (ask/) and nothing
// typed ever leaves the device. The model's tokenizer (BERT WordPiece, lower case) and its pooling are here too, so the
// browser needs only the ONNX runtime; tests/test_ask.py pins them to the model's own tokenizer and outputs.
'use strict';

// Words that carry no meaning for finding a place in the app.
const ASK_STOP = new Set(('a an and are as at be been but by can could did do does doing for from get got had has have how i ' +
  'if in into is it its me my of on or our see show shows tell than that the their them then there these this those to ' +
  'was we were what when where which who will with would you your am any all also about each should shown ' +
  'look find open want know page tab card screen app much many go goes going give gives').split(' '));
// Words people use for what the app calls something else. Each extra word counts for less than a typed one (ASK_SYN_W).
const ASK_SYN = {
  cpp: ['cost', 'pick'], expense: ['cost'], expens: ['cost'], spend: ['cost'], costly: ['cost'],
  air: ['cfm'], cfm: ['air'], compressor: ['power', 'kwh', 'pressure'], electricity: ['power', 'kwh'], bijli: ['power'], unit: ['kwh'],
  speed: ['rpm'], fast: ['rpm'], slow: ['rpm'], stop: ['efficiency', 'stopped'], stoppage: ['efficiency', 'stopped'], idle: ['powered', 'utilisation'],
  break: ['warp'], breakage: ['warp', 'break'],
  money: ['realisation', 'profit'], earn: ['profit', 'realisation'], margin: ['profit'], loss: ['profit', 'covered'], lose: ['profit'],
  income: ['realisation'], revenue: ['realisation', 'sale'], sale: ['realisation'], sell: ['sale', 'realisation'], price: ['rate', 'sale'], rate: ['sale'],
  rise: ['moved'], increase: ['moved'], higher: ['moved'], jump: ['moved'], drop: ['moved'], fall: ['moved'], fell: ['moved'], lower: ['moved'],
  change: ['moved'], chang: ['moved'], up: ['moved'], down: ['moved'], went: ['moved'], why: ['moved'], reason: ['why', 'moved'], explain: ['working', 'guide'], formula: ['working'], calculat: ['working'],
  shrinkage: ['folding', 'shortage'], fold: ['folding'], folded: ['folding'], shortage: ['folding'],
  fabric: ['quality', 'head', 'group'], product: ['quality'], sort: ['quality'], design: ['quality'],
  history: ['trend'], time: ['trend'], graph: ['trend', 'chart'], chart: ['trend'],
  worst: ['work', 'first'], problem: ['work', 'first', 'flag'], fix: ['work', 'first', 'saving'], improve: ['saving', 'target'], save: ['saving'],
  goal: ['target'], best: ['benchmark'], benchmark: ['best'],
  breakeven: ['realisation'], missing: ['missed', 'gap'], miss: ['missed'], gap: ['missed'],
  grade: ['b'], defect: ['b', 'grade'], cut: ['piece'], stock: ['dispatch'], beam: ['warp'], yarn: ['realisation'],
  compare: ['vs', 'reference'], comparison: ['vs', 'reference'], versus: ['vs'], yesterday: ['moved'],
};
const ASK_SYN_W = 0.5;
// A card is what people usually want; a tab, a Working entry and a Guide section follow (their long text would win otherwise).
const ASK_KIND = {Card: 1, Tab: 0.9, Working: 0.75, Guide: 0.6};
const ASK_MIN_WORDS = 3;   // a box with fewer words keeps the name search alone (navMatch)
const ASK_TOP = 5;
// Fields and their weight: the place's own name counts most, its tab or group a little, the text behind it least.
const ASK_FIELDS = [['label', 3], ['sub', 1], ['text', 1]];

// One word to its stem: lower case, plural and verb endings off, so "breaks" finds "break" and "moved" finds "move".
function askStem(w) {
  w = String(w).toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}
// Text to its stems: words of letters (and 190 / 280, the loom widths), stop words out. "B grade" keeps its "b".
function askTerms(text, keepStop) {
  const out = [];
  const t = String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/break[\s-]*even/g, 'breakeven');   // one word, so it is not a warp break
  for (const m of t.matchAll(/[a-z]+|190|280/g)) {
    const w = m[0];
    if (!keepStop && (ASK_STOP.has(w) || (w.length < 2 && w !== 'b'))) continue;
    out.push(askStem(w));
  }
  return out;
}
const askWordCount = (q) => String(q || '').trim().split(/\s+/).filter(Boolean).length;
const askIsQuestion = (q) => askWordCount(q) >= ASK_MIN_WORDS && askTerms(q).length > 0;
// A question's terms with their weights: each typed word 1, each word it stands for ASK_SYN_W (never lowering a typed word).
function askQuery(q) {
  const w = new Map();
  for (const t of askTerms(q)) w.set(t, 1);
  for (const t of [...w.keys()]) for (const s of ASK_SYN[t] || []) { const st = askStem(s); if (!w.has(st)) w.set(st, ASK_SYN_W); }
  return w;
}
// Ranks ITEMS (each {label, sub}; TEXT(it) the text behind it) for the question Q, best first, BM25 over the three fields
// added up by their weights. An item that matches no term is left out. Ties keep the items' own order (tab order).
function askRank(items, q, text = () => '', k1 = 1.2, b = 0.6) {
  const qw = askQuery(q);
  if (!qw.size) return [];
  const docs = items.map((it) => {
    const tf = new Map(); let len = 0;
    for (const [f, wt] of ASK_FIELDS) {
      const terms = askTerms(f === 'text' ? text(it) : it[f]);
      len += terms.length * wt;
      for (const t of terms) tf.set(t, (tf.get(t) || 0) + wt);
    }
    return {it, tf, len};
  });
  const N = docs.length, avg = docs.reduce((n, d) => n + d.len, 0) / (N || 1) || 1;
  const df = new Map();
  for (const t of qw.keys()) df.set(t, docs.filter((d) => d.tf.has(t)).length);
  const out = [];
  docs.forEach((d, i) => {
    let s = 0;
    for (const [t, wq] of qw) {
      const f = d.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += wq * idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.len / avg));
    }
    if (s > 0) out.push({it: d.it, s: s * (ASK_KIND[d.it.k] || 0.8), i});
  });
  return out.sort((x, y) => y.s - x.s || x.i - y.i);
}

// ---------------------------------------------------------------- the model's tokenizer (BERT WordPiece, uncased)
// The text the model reads for a place: its name, where it is and the start of its text.
const askDoc = (it, text) => [it.label, it.sub, String(text || '').slice(0, 400)].filter(Boolean).join('. ');
const wpPunct = (c) => { const n = c.codePointAt(0); return (n >= 33 && n <= 47) || (n >= 58 && n <= 64) || (n >= 91 && n <= 96) || (n >= 123 && n <= 126) || /\p{P}/u.test(c); };
// BERT's basic split: clean, lower case, accents off, split on spaces and around every punctuation mark.
function wpBasic(text) {
  const t = String(text || '').replace(/[\u0000�]|\p{Cc}/gu, (c) => /[\t\n\r]/.test(c) ? ' ' : '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  const out = [];
  for (const w of t.split(/\s+/).filter(Boolean)) {
    let cur = '';
    for (const c of w) { if (wpPunct(c)) { if (cur) out.push(cur); out.push(c); cur = ''; } else cur += c; }
    if (cur) out.push(cur);
  }
  return out;
}
// Text to the model's token ids: [CLS] word pieces [SEP], at most MAX tokens. VOCAB maps a piece to its id.
function wpEncode(text, vocab, max = 128) {
  const ids = [vocab['[CLS]']], unk = vocab['[UNK]'];
  for (const w of wpBasic(text)) {
    if (ids.length >= max - 1) break;
    if (w.length > 100) { ids.push(unk); continue; }
    const pieces = []; let s = 0, bad = false;
    while (s < w.length) {
      let e = w.length, hit = null;
      while (s < e) { const sub = (s ? '##' : '') + w.slice(s, e); if (sub in vocab) { hit = vocab[sub]; break; } e--; }
      if (hit == null) { bad = true; break; }
      pieces.push(hit); s = e;
    }
    for (const p of bad ? [unk] : pieces) { if (ids.length >= max - 1) break; ids.push(p); }
  }
  ids.push(vocab['[SEP]']);
  return ids;
}
// The model's output for one text (T tokens × DIM numbers) to one unit-length vector: the mean over the tokens.
function askPool(data, T, dim) {
  const v = new Float32Array(dim);
  for (let t = 0; t < T; t++) for (let j = 0; j < dim; j++) v[j] += data[t * dim + j];
  let n = 0;
  for (let j = 0; j < dim; j++) { v[j] /= T; n += v[j] * v[j]; }
  n = Math.sqrt(n) || 1;
  for (let j = 0; j < dim; j++) v[j] /= n;
  return v;
}
const askDot = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };
// The final order once the model has read the question: meaning first (cosine with the question, 0.75), the word match
// second (scaled to the best word score, 0.25). An item the model has not read yet keeps its word score only; one whose
// meaning is far from the question (cosine under ASK_MIN_COS) and that matches no word is left out. COS: id → cosine.
const ASK_MIN_COS = 0.2;
function askBlend(ranked, items, cos, wCos = 0.75) {
  const top = ranked.length ? ranked[0].s : 0, ws = new Map(ranked.map((r) => [r.it.id, top ? r.s / top : 0]));
  const out = items.map((it, i) => {
    const c = cos.get(it.id), w = ws.get(it.id) || 0;
    if (!w && (c == null || c < ASK_MIN_COS)) return null;
    return {it, s: c == null ? (1 - wCos) * w : wCos * Math.max(c, 0) + (1 - wCos) * w, i};
  }).filter(Boolean);
  return out.sort((x, y) => y.s - x.s || x.i - y.i);
}
