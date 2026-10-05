# 📂 Trợ Lý Tìm File — File Chat Assistant

Webapp chat tìm kiếm, đọc, dịch và quản lý tệp tin nội bộ.  
Deploy tĩnh trên **Cloudflare Pages** · Backend Node.js chạy local.

🌐 **Live demo:** [repdicun.pages.dev](https://repdicun.pages.dev)

---

## ✨ Tính năng

| Tính năng | Mô tả |
|---|---|
| 🔍 **Tìm kiếm fuzzy** | Fuse.js — hỗ trợ tiếng Việt không dấu |
| 🤖 **AI Chat** | OpenAI · Groq (miễn phí) · Gemini · Mistral · Custom |
| 👁 **Đọc nội dung** | Word (.docx), Excel, ảnh, text ngay trong chat |
| 🔄 **Chuyển đổi** | Word → PDF, PDF → Word |
| 🌐 **Dịch ngôn ngữ** | 12 ngôn ngữ, MyMemory API (miễn phí) |
| 🎤 **Giọng nói** | Web Speech API — tìm file bằng lời nói |
| 📁 **Duyệt thư mục** | File browser trực quan |
| ⚙️ **Lọc nâng cao** | Ngày, dung lượng, thư mục |
| 📱 **Responsive** | Mobile full-screen, tablet, desktop |
| 🌙 **Dark mode** | Lưu localStorage |
| 🔐 **Device-aware** | Ẩn Windows-only actions trên mobile |

---

## 🚀 Chạy local

```bash
cd file-chat-app
npm install
node server.js
# → http://localhost:3579
```

---

## ☁️ Deploy Cloudflare Pages

### 1. Kết nối repo

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project**
2. Connect GitHub → chọn repo `Dennis-nham/repdicun`
3. Cấu hình build:

| Setting | Giá trị |
|---|---|
| Framework preset | `None` |
| Build command | *(để trống)* |
| Build output directory | `public` |
| Root directory | `file-chat-app` |

4. Bấm **Save and Deploy**

---

### 2. Cấu hình AI (Pages Functions — Edge)

Endpoint `/api/ai` chạy trực tiếp tại Cloudflare Edge, **không cần server local**.  
Người dùng nhập API key trong modal → key lưu `localStorage` → gửi đến Edge Worker → gọi AI provider.

**Không cần** khai báo key trong Pages Dashboard.

| Provider | Lấy key miễn phí |
|---|---|
| ⚡ Groq (khuyến nghị) | [console.groq.com/keys](https://console.groq.com/keys) |
| ✨ Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| 🤖 OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| 🌊 Mistral | [console.mistral.ai](https://console.mistral.ai) |

---

### 3. Kết nối server local qua Cloudflare Tunnel (tuỳ chọn)

Để tìm file thực từ máy tính qua internet:

```bash
# Cài cloudflared
winget install Cloudflare.cloudflared

# Tạo tunnel tạm (không cần tài khoản)
cloudflared tunnel --url http://localhost:3579
# → https://xxxx.trycloudflare.com
```

Sau đó vào **Pages → Settings → Environment variables**:

| Variable | Value |
|---|---|
| `LOCAL_API_URL` | `https://xxxx.trycloudflare.com` |

---

## 📁 Cấu trúc dự án

```
file-chat-app/
├── public/                   # Static files (Cloudflare Pages serves this)
│   ├── index.html            # React SPA (inline Babel, no build step)
│   ├── favicon_io/           # Favicon assets
│   ├── _headers              # CF Pages HTTP headers
│   └── _redirects            # SPA fallback: /* → /index.html 200
├── functions/                # Cloudflare Pages Functions
│   └── api/
│       ├── ai.js             # POST /api/ai — AI proxy (runs on Edge)
│       ├── search.js         # GET  /api/search — proxy to local server
│       ├── status.js         # GET  /api/status — proxy to local server
│       └── [[path]].js       # Catch-all proxy → LOCAL_API_URL
├── package/
│   ├── ui-kit.zip            # VNKR UI Kit source
│   └── ui-kit/ui-kit/        # Extracted source (21 React/TS components)
├── server.js                 # Node.js local backend (Express)
├── package.json
├── wrangler.toml             # Cloudflare Pages config
└── start.bat                 # Windows quick-start
```

---

## 🔌 API Endpoints

### Cloudflare Edge (hoạt động trên repdicun.pages.dev)

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/ai` | AI chat — OpenAI/Groq/Gemini/Mistral |

### Proxy → Local server (cần `LOCAL_API_URL`)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/search?q=...` | Tìm kiếm file |
| `GET` | `/api/status` | Trạng thái server |
| `GET` | `/api/stats` | Thống kê kho file |
| `POST` | `/api/open` | Mở file/thư mục |
| `POST` | `/api/read` | Đọc nội dung file |
| `POST` | `/api/refresh` | Làm mới index |
| `POST` | `/api/convert/word2pdf` | Chuyển đổi |
| `POST` | `/api/convert/pdf2word` | Chuyển đổi |

---

## 🛠 Công nghệ

| Layer | Stack |
|---|---|
| Frontend | React 18 UMD · Babel Standalone · Web Speech API |
| AI | OpenAI API · Groq · Gemini · Mistral (user-provided key) |
| Search | Fuse.js fuzzy · Vietnamese diacritic normalization |
| Edge | Cloudflare Pages Functions (V8 isolates) |
| Backend | Node.js · Express · Mammoth · xlsx · Fuse.js |
| Deploy | Cloudflare Pages (auto-deploy from GitHub) |
