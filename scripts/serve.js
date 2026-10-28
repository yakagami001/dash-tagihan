// Server statis lokal untuk preview folder docs/ (tanpa dependensi). Pakai: node scripts/serve.js [port]
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "docs"), port = Number(process.argv[2]) || 5500;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(root, rel.endsWith("/") ? rel + "index.html" : rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`Preview: http://localhost:${port}`));
