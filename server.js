const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const { exec, execFile } = require('child_process');
const mammoth  = require('mammoth');
const XLSX     = require('xlsx');
const Fuse     = require('fuse.js');

const app  = express();
const PORT = 3579;
const ROOT_DIR = path.resolve(__dirname, '..');

app.set('trust proxy', true);  // trust X-Forwarded-For from proxies
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ─────────────────────────────────────────────────────────────────
const EXT_ICONS = {
  '.pdf':'📄', '.docx':'📝', '.doc':'📝', '.xlsx':'📊', '.xls':'📊',
  '.pptx':'📑', '.ppt':'📑', '.txt':'📃', '.csv':'📋',
  '.jpg':'🖼️', '.jpeg':'🖼️', '.png':'🖼️', '.gif':'🖼️',
  '.bmp':'🖼️', '.tiff':'🖼️', '.tif':'🖼️', '.webp':'🖼️',
  '.mp4':'🎬', '.avi':'🎬', '.mov':'🎬', '.mkv':'🎬',
  '.mp3':'🎵', '.wav':'🎵', '.m4a':'🎵',
  '.zip':'🗜️', '.rar':'🗜️', '.7z':'🗜️',
};

const IMG_EXTS  = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.tiff','.tif','.webp']);
const DOC_EXTS  = new Set(['.docx','.doc']);
const XLS_EXTS  = new Set(['.xlsx','.xls','.csv']);
const SKIP_DIRS = new Set(['file-chat-app','node_modules','.git','$RECYCLE.BIN','System Volume Information']);

function fmtSize(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1024**2)    return (b/1024).toFixed(1) + ' KB';
  if (b < 1024**3)    return (b/1024**2).toFixed(1) + ' MB';
  return (b/1024**3).toFixed(1) + ' GB';
}

// Vietnamese diacritic → ASCII so search ignores tone marks
function vi2ascii(s) {
  return s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

// ─── File Index ───────────────────────────────────────────────────────────────
let fileIndex  = [];
let fuseIndex  = null;
let indexReady = false;
let indexing   = false;
let lastIndexed = null;

function buildIndex(dir, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;

    const fullPath = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      buildIndex(fullPath, depth + 1);
      continue;
    }

    const ext = path.extname(ent.name).toLowerCase();
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    const nameNoExt = path.basename(ent.name, ext);
    const relPath   = path.relative(ROOT_DIR, fullPath);
    const relDir    = path.relative(ROOT_DIR, dir) || '.';

    fileIndex.push({
      id:          fileIndex.length,
      name:        ent.name,
      nameNoExt,
      nameLatin:   vi2ascii(nameNoExt),            // for fuzzy matching
      path:        fullPath,
      relativePath: relPath,
      dir:         relDir,
      dirLatin:    vi2ascii(relDir),
      ext,
      icon:        EXT_ICONS[ext] || '📁',
      size:        fmtSize(stat.size),
      sizeBytes:   stat.size,
      modified:    stat.mtime.toISOString().slice(0, 10),
      mtime:       stat.mtime.getTime(),
    });
  }
}

function rebuildIndex() {
  if (indexing) return;
  indexing   = true;
  indexReady = false;
  fileIndex  = [];
  console.log('🔍 Indexing:', ROOT_DIR);

  buildIndex(ROOT_DIR);

  // Build Fuse.js index on both original & latin fields
  fuseIndex = new Fuse(fileIndex, {
    keys: [
      { name: 'nameNoExt', weight: 3 },
      { name: 'nameLatin', weight: 3 },
      { name: 'name',      weight: 2 },
      { name: 'dirLatin',  weight: 1 },
      { name: 'dir',       weight: 1 },
    ],
    threshold:      0.4,
    distance:       200,
    minMatchCharLength: 2,
    includeScore:   true,
  });

  indexReady  = true;
  indexing    = false;
  lastIndexed = new Date().toISOString();
  console.log(`✅ Index ready: ${fileIndex.length} files`);
}

rebuildIndex();

// ─── Scoring layer on top of Fuse ────────────────────────────────────────────
function search(query, limit = 20, extFilter = null) {
  if (!fuseIndex || !query.trim()) return [];

  const qLatin = vi2ascii(query);

  // 1. Fuse fuzzy search on latin query
  let fuseResults = fuseIndex.search(qLatin, { limit: limit * 4 });

  // Also search original query in case it has no diacritics to strip
  if (qLatin !== query.toLowerCase()) {
    const fuseOrig = fuseIndex.search(query, { limit: limit * 2 });
    // Merge, deduplicate by id
    const seen = new Set(fuseResults.map(r => r.item.id));
    for (const r of fuseOrig) {
      if (!seen.has(r.item.id)) { fuseResults.push(r); seen.add(r.item.id); }
    }
  }

  // 2. Boost: exact substring match in name
  const qL = qLatin.toLowerCase();
  fuseResults = fuseResults.map(r => {
    let boost = 0;
    const n = r.item.nameLatin;
    if (n === qL)            boost = 1.0;
    else if (n.startsWith(qL)) boost = 0.6;
    else if (n.includes(qL))   boost = 0.3;
    // Combined score: fuse score is 0=perfect, 1=worst, so we invert
    r._final = (1 - (r.score || 0)) + boost;
    return r;
  });

  fuseResults.sort((a, b) => b._final - a._final);

  // 3. Extension filter
  if (extFilter) {
    const exts = extFilter.split(',').map(e => e.trim().toLowerCase());
    fuseResults = fuseResults.filter(r => exts.includes(r.item.ext));
  }

  return fuseResults.slice(0, limit).map(r => ({
    ...r.item,
    score: Math.round(r._final * 60 + 40),   // display 40-100
  }));
}

// ─── API: Search ──────────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const q        = (req.query.q   || '').trim();
  const limit    = Math.min(parseInt(req.query.limit) || 20, 50);
  const extFilter= req.query.ext  || null;
  const dateFrom = req.query.dateFrom || null;  // YYYY-MM-DD
  const dateTo   = req.query.dateTo   || null;
  const sizeMin  = req.query.sizeMin  ? parseInt(req.query.sizeMin) * 1024 : null; // KB→bytes
  const sizeMax  = req.query.sizeMax  ? parseInt(req.query.sizeMax) * 1024 : null;
  const dirFilter= req.query.dir  || null;

  if (!q) return res.json({ results: [], total: 0, indexSize: fileIndex.length });

  let results = search(q, limit * 3, extFilter); // get extra for post-filter

  // Apply advanced filters
  if (dateFrom || dateTo || sizeMin !== null || sizeMax !== null || dirFilter) {
    results = results.filter(f => {
      if (dateFrom && f.modified < dateFrom) return false;
      if (dateTo   && f.modified > dateTo)   return false;
      if (sizeMin !== null && f.sizeBytes < sizeMin) return false;
      if (sizeMax !== null && f.sizeBytes > sizeMax) return false;
      if (dirFilter && !f.dir.toLowerCase().includes(dirFilter.toLowerCase())) return false;
      return true;
    });
  }

  results = results.slice(0, limit);
  res.json({ results, total: results.length, indexSize: fileIndex.length });
});

// ─── API: Status ──────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    ready: indexReady,
    indexing,
    fileCount: fileIndex.length,
    lastIndexed,
    isLocal: isLocalRequest(req),   // client-side can read this to adjust UI
  });
});

// ─── API: Refresh index ───────────────────────────────────────────────────────
app.post('/api/refresh', (req, res) => {
  if (indexing) return res.json({ message: 'Đang lập chỉ mục, vui lòng chờ...' });
  setImmediate(rebuildIndex);
  res.json({ message: 'Đã bắt đầu lập chỉ mục lại...' });
});

// ─── Helper: detect if request is from the local machine ─────────────────────
function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// ─── API: Open file / folder ──────────────────────────────────────────────────
app.post('/api/open', (req, res) => {
  let { filePath, openFolder } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

  // Remote clients (LAN / mobile) cannot open files on the server's OS
  if (!isLocalRequest(req)) {
    return res.status(403).json({
      error: 'Chức năng mở file chỉ hoạt động khi truy cập từ chính máy chủ (localhost).\nTừ thiết bị khác hãy dùng nút ĐỌC để xem nội dung.',
      remoteOnly: true,
    });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const target = openFolder
    ? path.dirname(resolved)
    : resolved;

  exec(`start "" "${target}"`, { shell: 'cmd.exe' }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─── API: Read / preview file ─────────────────────────────────────────────────
app.get('/api/read', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const ext = path.extname(resolved).toLowerCase();

  try {
    // ── Images ──
    if (IMG_EXTS.has(ext)) {
      const buf  = fs.readFileSync(resolved);
      const b64  = buf.toString('base64');
      const mime = { '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp' }[ext] || 'image/jpeg';
      return res.json({ type: 'image', data: `data:${mime};base64,${b64}` });
    }

    // ── Plain text / CSV ──
    if (ext === '.txt' || ext === '.csv') {
      const text = fs.readFileSync(resolved, 'utf8');
      return res.json({ type: 'text', content: text.slice(0, 8000) });
    }

    // ── Word .docx / .doc ──
    if (ext === '.docx' || ext === '.doc') {
      try {
        const result = await mammoth.extractRawText({ path: resolved });
        const text = result.value || '(Không có nội dung text)';
        return res.json({ type: 'text', content: text.slice(0, 8000) });
      } catch {
        // .doc (Word 97-2003) không hỗ trợ đọc trực tiếp
        return res.json({ type: 'binary', message: 'File .doc cũ (Word 97-2003) không hỗ trợ xem trực tiếp.\nHãy dùng nút MỞ để mở bằng Microsoft Word.' });
      }
    }

    // ── Excel .xlsx / .xls ──
    if (XLS_EXTS.has(ext)) {
      const wb = XLSX.readFile(resolved, { sheetRows: 60 });
      const lines = [];
      for (const name of wb.SheetNames.slice(0, 3)) {
        lines.push(`=== Sheet: ${name} ===`);
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
        lines.push(csv.slice(0, 3000));
      }
      return res.json({ type: 'text', content: lines.join('\n') });
    }

    // ── PDF → text via pdftotext if available, else note ──
    if (ext === '.pdf') {
      return res.json({
        type: 'pdf',
        message: 'Hãy dùng nút MỞ để xem PDF bằng trình đọc PDF hoặc trình duyệt.',
        path: resolved,
      });
    }

    return res.json({ type: 'binary', message: 'Loại tệp này không hỗ trợ xem trực tiếp. Hãy dùng nút MỞ.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Copy path to clipboard (server-side via clip.exe) ──────────────────
app.post('/api/copypath', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
  exec(`echo ${filePath.trim()}| clip`, { shell: 'cmd.exe' }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ─── API: Convert DOCX → PDF using Word COM (Windows) ────────────────────────
app.post('/api/convert/word2pdf', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

  if (!isLocalRequest(req)) {
    return res.status(403).json({
      error: 'Chuyển đổi file chỉ hỗ trợ khi truy cập từ chính máy chủ (localhost).',
      remoteOnly: true,
    });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const outPath = resolved.replace(/\.(docx?|doc)$/i, '.pdf');

  // Use PowerShell + Word COM to save as PDF
  const ps = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open('${resolved.replace(/\\/g, '\\\\')}')
$doc.SaveAs([ref] '${outPath.replace(/\\/g, '\\\\')}', [ref] 17)
$doc.Close()
$word.Quit()
Write-Output 'OK'
`.trim();

  exec(`powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
    { timeout: 60000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: 'Cần cài Microsoft Word để chuyển đổi.\n' + stderr });
      res.json({ success: true, outPath });
    }
  );
});

// ─── API: Convert PDF → DOCX using LibreOffice (if installed) ────────────────
app.post('/api/convert/pdf2word', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

  if (!isLocalRequest(req)) {
    return res.status(403).json({
      error: 'Chuyển đổi file chỉ hỗ trợ khi truy cập từ chính máy chủ (localhost).',
      remoteOnly: true,
    });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const outDir  = path.dirname(resolved);
  const loPath1 = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
  const loPath2 = 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe';
  const loExe   = fs.existsSync(loPath1) ? loPath1 : fs.existsSync(loPath2) ? loPath2 : null;

  if (!loExe) {
    return res.status(400).json({
      error: 'LibreOffice chưa được cài đặt.\nTải tại: https://www.libreoffice.org/download/',
      needInstall: true,
    });
  }

  exec(`"${loExe}" --headless --convert-to docx "${resolved}" --outdir "${outDir}"`,
    { timeout: 120000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: stderr || err.message });
      const outPath = resolved.replace(/\.pdf$/i, '.docx');
      res.json({ success: true, outPath });
    }
  );
});

// ─── API: List directory tree (for browse panel) ─────────────────────────────
app.get('/api/tree', (req, res) => {
  const dirPath = req.query.path || ROOT_DIR;
  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(path.resolve(ROOT_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  let entries;
  try { entries = fs.readdirSync(resolved, { withFileTypes: true }); } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const children = entries
    .filter(e => !SKIP_DIRS.has(e.name))
    .map(e => {
      const fp  = path.join(resolved, e.name);
      const ext = path.extname(e.name).toLowerCase();
      let sz = null;
      try { sz = fmtSize(fs.statSync(fp).size); } catch {}
      return {
        name: e.name,
        path: fp,
        isDir: e.isDirectory(),
        ext,
        icon: e.isDirectory() ? '📁' : (EXT_ICONS[ext] || '📄'),
        size: sz,
      };
    })
    .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));

  res.json({ path: resolved, children });
});

// ─── API: Stats ───────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const byExt = {};
  let totalSize = 0;
  for (const f of fileIndex) {
    byExt[f.ext] = (byExt[f.ext] || 0) + 1;
    totalSize += f.sizeBytes;
  }
  const topExts = Object.entries(byExt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, count]) => ({ ext, count, icon: EXT_ICONS[ext] || '📁' }));

  res.json({
    total: fileIndex.length,
    totalSize: fmtSize(totalSize),
    topExts,
    lastIndexed,
  });
});

// ─── API: AI Chat (proxy — key stays on client, never stored) ────────────────
// Supports OpenAI, Groq, Google Gemini, Mistral, any OpenAI-compatible endpoint.
// The client sends: { message, history, fileContext, provider, model, apiKey, baseUrl }
// The server acts as a proxy so API keys are not exposed in browser network logs
// to other LAN users (the key travels only on the loopback / LAN encrypted path).
app.post('/api/ai', async (req, res) => {
  const { message, history = [], fileContext = '', provider = 'openai',
          model, apiKey, baseUrl } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'Thiếu API key.' });
  if (!message) return res.status(400).json({ error: 'Thiếu message.' });

  // ── Build provider config ──────────────────────────────────────────────────
  const PROVIDERS = {
    openai:   { url: 'https://api.openai.com/v1/chat/completions',        defaultModel: 'gpt-4o-mini',         authHeader: `Bearer ${apiKey}` },
    groq:     { url: 'https://api.groq.com/openai/v1/chat/completions',   defaultModel: 'llama-3.1-8b-instant', authHeader: `Bearer ${apiKey}` },
    mistral:  { url: 'https://api.mistral.ai/v1/chat/completions',        defaultModel: 'mistral-small-latest', authHeader: `Bearer ${apiKey}` },
    gemini:   { url: `https://generativelanguage.googleapis.com/v1beta/models/${model||'gemini-1.5-flash'}:generateContent?key=${apiKey}`, defaultModel: 'gemini-1.5-flash', authHeader: null },
    custom:   { url: baseUrl || '', defaultModel: model || 'gpt-4o-mini', authHeader: `Bearer ${apiKey}` },
  };

  const cfg = PROVIDERS[provider] || PROVIDERS.openai;
  const endpoint = new URL(cfg.url);
  const chosenModel = model || cfg.defaultModel;

  // ── System prompt: gives AI context about the file manager ────────────────
  const systemPrompt = `Bạn là trợ lý AI thông minh tích hợp trong ứng dụng quản lý file nội bộ "Trợ Lý Tìm File".
Nhiệm vụ chính: giúp người dùng tìm kiếm, quản lý và làm việc với kho tài liệu.
Kho tài liệu gồm file PDF, Word, Excel, hình ảnh scan và video.
Trả lời bằng tiếng Việt, ngắn gọn, thực dụng.
Khi người dùng muốn tìm file, hãy trả về JSON action để app xử lý:
{"action":"search","query":"<từ khóa>","ext":"<đuôi hoặc rỗng>"}
Khi người dùng hỏi thông tin chung, trả lời bình thường.
Context file hiện tại (nếu có): ${fileContext || 'không có'}`;

  // ── Build messages array ───────────────────────────────────────────────────
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  try {
    let responseText = '';

    if (provider === 'gemini') {
      // ── Gemini REST format ─────────────────────────────────────────────────
      const body = JSON.stringify({
        contents: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      });
      const data = await httpsPost(endpoint, body, {
        'Content-Type': 'application/json',
      });
      responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // ── OpenAI-compatible format ───────────────────────────────────────────
      const body = JSON.stringify({
        model: chosenModel,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      });
      const data = await httpsPost(endpoint, body, {
        'Content-Type': 'application/json',
        'Authorization': cfg.authHeader,
      });
      if (data.error) return res.status(400).json({ error: data.error.message || JSON.stringify(data.error) });
      responseText = data?.choices?.[0]?.message?.content || '';
    }

    res.json({ reply: responseText, model: chosenModel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: HTTPS POST returning parsed JSON ─────────────────────────────────
function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + (url.search || ''),
      method:   'POST',
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = lib.request(options, res2 => {
      let raw = '';
      res2.on('data', c => raw += c);
      res2.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Invalid JSON response: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('AI request timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Fallback ─────────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const lanIPs = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) lanIPs.push(iface.address);
    }
  }
  console.log(`\n🚀 File Chat App  →  http://localhost:${PORT}  (máy chủ)`);
  if (lanIPs.length) console.log(`🌐 Truy cập từ LAN  →  http://${lanIPs[0]}:${PORT}`);
  console.log(`📂 Root: ${ROOT_DIR}\n`);
  exec(`start http://localhost:${PORT}`, { shell: 'cmd.exe' });
});
