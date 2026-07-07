#!/usr/bin/env node
/**
 * 트렌드 뷰어 — 센터(Senter)의 로컬 리서치 도구
 * ------------------------------------------------
 * - 의존성 0개: Node.js 내장 모듈만 사용 (npm install 불필요)
 * - 관심 키워드의 최신 뉴스(구글 뉴스 RSS)와 실시간 급상승 검색어(구글 트렌드 RSS)를 한 화면에
 * - 회사/프록시 네트워크 지원 (HTTPS_PROXY 환경변수 자동 인식)
 * - 실행: 시작하기.command(맥) / 시작하기.bat(윈도우) 더블클릭, 또는 node server.js
 */

const http = require("http");
const https = require("https");
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const KEYWORDS_FILE = path.join(DATA_DIR, "keywords.json");
const PORT = Number(process.env.PORT || 8799);

/* ---------- 저장소 ---------- */
function ensureDirs() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadKeywords() {
  try { const v = JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf8")); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveKeywords(list) {
  const tmp = KEYWORDS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
  fs.renameSync(tmp, KEYWORDS_FILE);
}

/* ---------- 외부 요청 (프록시 지원) ---------- */
function fetchUrl(urlStr, redirects = 3) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error("잘못된 주소")); }
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || "";
    const headers = { "User-Agent": "Mozilla/5.0 (TrendViewer; local tool)", "Accept": "*/*" };

    const onResponse = (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(fetchUrl(new URL(res.headers.location, u).href, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", c => { data += c; if (data.length > 3e6) { res.destroy(); reject(new Error("응답이 너무 큽니다")); } });
      res.on("end", () => resolve(data));
    };

    if (proxy && u.protocol === "https:") {
      // HTTPS_PROXY를 통한 CONNECT 터널
      let p;
      try { p = new URL(proxy); } catch { return reject(new Error("프록시 주소 오류")); }
      const sock = net.connect(Number(p.port) || 80, p.hostname, () => {
        let auth = "";
        if (p.username) {
          const cred = decodeURIComponent(p.username) + ":" + decodeURIComponent(p.password || "");
          auth = `Proxy-Authorization: Basic ${Buffer.from(cred).toString("base64")}\r\n`;
        }
        sock.write(`CONNECT ${u.hostname}:443 HTTP/1.1\r\nHost: ${u.hostname}:443\r\n${auth}\r\n`);
      });
      let head = "";
      const onData = (chunk) => {
        head += chunk.toString("utf8");
        if (!head.includes("\r\n\r\n")) return;
        sock.removeListener("data", onData);
        if (!/^HTTP\/1\.[01] 200/.test(head)) { sock.destroy(); return reject(new Error("프록시 연결 거부")); }
        const secure = tls.connect({ socket: sock, servername: u.hostname }, () => {
          const req = https.request({
            createConnection: () => secure,
            host: u.hostname, path: u.pathname + u.search, headers, timeout: 12000
          }, onResponse);
          req.on("error", reject);
          req.on("timeout", () => { req.destroy(); reject(new Error("시간 초과")); });
          req.end();
        });
        secure.on("error", reject);
      };
      sock.on("data", onData);
      sock.on("error", reject);
      sock.setTimeout(12000, () => { sock.destroy(); reject(new Error("프록시 시간 초과")); });
    } else {
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.get(u, { headers, timeout: 12000 }, onResponse);
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("시간 초과")); });
    }
  });
}

/* ---------- RSS 파싱 (정규식 기반, 의존성 0) ---------- */
function unescapeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "").trim();
}
function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
}
function parseItems(xml, max = 10) {
  const items = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < max) {
    const b = m[0];
    items.push({
      title: pick(b, "title"),
      link: pick(b, "link"),
      source: pick(b, "source"),
      date: pick(b, "pubDate"),
      traffic: pick(b, "ht:approx_traffic")
    });
  }
  return items.filter(i => i.title);
}

/* ---------- HTTP 서버 ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", c => { d += c; if (d.length > 1e5) { reject(new Error("본문 과대")); req.destroy(); } });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;
  try {
    if (p === "/api/keywords" && req.method === "GET") return sendJSON(res, 200, loadKeywords());
    if (p === "/api/keywords" && req.method === "POST") {
      const b = await readBody(req);
      const word = String(b.word || "").trim().slice(0, 30);
      if (!word) return sendJSON(res, 400, { error: "키워드를 입력해주세요." });
      const list = loadKeywords();
      if (list.some(k => k.word === word)) return sendJSON(res, 400, { error: "이미 있는 키워드예요." });
      if (list.length >= 12) return sendJSON(res, 400, { error: "키워드는 12개까지예요. 안 쓰는 것을 지워주세요." });
      list.push({ id: Date.now().toString(36), word });
      saveKeywords(list);
      return sendJSON(res, 200, list);
    }
    if (p.startsWith("/api/keywords/") && req.method === "DELETE") {
      const id = p.split("/").pop();
      const list = loadKeywords().filter(k => k.id !== id);
      saveKeywords(list);
      return sendJSON(res, 200, list);
    }

    if (p === "/api/news") {
      const q = (u.searchParams.get("q") || "").trim().slice(0, 30);
      if (!q) return sendJSON(res, 400, { error: "q 필요" });
      try {
        const base = process.env.TV_NEWS_BASE || "https://news.google.com/rss/search";
        const xml = await fetchUrl(`${base}?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`);
        return sendJSON(res, 200, { ok: true, items: parseItems(xml, 8) });
      } catch (e) {
        return sendJSON(res, 200, { ok: false, items: [], note: "뉴스를 가져오지 못했어요 (" + e.message + "). 인터넷 연결을 확인해주세요." });
      }
    }

    if (p === "/api/trending") {
      // 구글 트렌드 실시간 급상승 (한국). 구글이 주소를 바꿀 수 있어 후보를 순서대로 시도
      const candidates = [
        process.env.TV_TRENDING_URL,
        "https://trends.google.com/trending/rss?geo=KR",
        "https://trends.google.co.kr/trends/trendingsearches/daily/rss?geo=KR"
      ].filter(Boolean);
      for (const url of candidates) {
        try {
          const xml = await fetchUrl(url);
          const items = parseItems(xml, 12);
          if (items.length) return sendJSON(res, 200, { ok: true, items });
        } catch { /* 다음 후보 */ }
      }
      return sendJSON(res, 200, {
        ok: false, items: [],
        note: "실시간 급상승을 가져오지 못했어요. 구글이 주소를 바꿨거나 네트워크가 막혀 있을 수 있어요 — 아래 키워드별 뉴스는 정상 작동합니다."
      });
    }

    // 정적 파일
    let file = p === "/" ? "/index.html" : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(ROOT, "public", file);
    if (full.startsWith(path.join(ROOT, "public")) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
      return fs.createReadStream(full).pipe(res);
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("페이지를 찾을 수 없습니다.");
  } catch (e) {
    sendJSON(res, 500, { error: "서버 오류: " + e.message });
  }
});

ensureDirs();
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log("");
  console.log("  ┌────────────────────────────────────────────┐");
  console.log("  │  📈 트렌드 뷰어가 실행 중입니다            │");
  console.log(`  │  브라우저에서 열기:  ${url}     │`);
  console.log("  │  종료하려면 이 창을 닫으세요               │");
  console.log("  └────────────────────────────────────────────┘");
  console.log("");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const { spawn } = require("child_process");
    const child = spawn(opener, process.platform === "win32" ? ["", url] : [url], { shell: process.platform === "win32", stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {}
});
