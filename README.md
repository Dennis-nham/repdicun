# 📂 Daddy Cool AI — File Chat Assistant

Webapp React popup chat hỗ trợ tìm kiếm, đọc, dịch và quản lý tệp tin local thông minh.

## Tính năng
- 🔍 Tìm kiếm fuzzy (Fuse.js) — hỗ trợ tiếng Việt không dấu
- 💬 Chat popup với suggestion chips
- 👁 Đọc nội dung Word, Excel, ảnh trực tiếp trong chat
- 🔄 Chuyển đổi Word↔PDF
- 🌐 Dịch ngôn ngữ (12 ngôn ngữ, MyMemory API)
- 🎤 Nhập liệu bằng giọng nói (Web Speech API)
- 📁 Duyệt thư mục trực quan
- ⚙️ Tìm kiếm nâng cao (lọc ngày, dung lượng, thư mục)
- 🌙 Dark mode
- 💾 Lưu lịch sử chat (localStorage)

## Cài đặt & Chạy local

```bash
cd file-chat-app
npm install
node server.js
```

Truy cập: http://localhost:3579

## Deploy Cloudflare Pages

Frontend static được deploy tự động qua GitHub → Cloudflare Pages.

Backend (Node.js) cần chạy local hoặc trên VPS riêng.

## Công nghệ
- **Frontend**: React 18, Babel Standalone, Web Speech API
- **Backend**: Node.js, Express, Fuse.js, Mammoth, xlsx
- **Deploy**: Cloudflare Pages (frontend)
