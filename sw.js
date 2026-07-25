/* 센터(Senter) 서비스 워커 — 오프라인에서도 열리는 설치형 앱 수준으로.
   전략 (버전 불일치 방지가 핵심):
   - 핵심 파일(HTML/JS/CSS)은 "네트워크 우선": 온라인이면 항상 최신 세트를 함께 받아 캐시 갱신,
     오프라인일 때만 캐시 폴백 → 구 HTML + 신 JS 조합(흰 화면 사고)이 생기지 않음.
   - vendor·아이콘은 "캐시 우선"(내용이 사실상 불변).
   - 외부 요청(RSS·AI)은 건드리지 않음. */
const CACHE = "senter-v5";
const CORE = ["./", "./index.html", "./app.js", "./style.css", "./studio.html", "./office3d.html", "./manifest.json"];
const STATIC = [
  "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js", "./vendor/jszip.min.js", "./vendor/three.min.js",
  "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.concat(STATIC))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCore(url) {
  const path = url.pathname.replace(/\/$/, "/index.html");
  return CORE.some((c) => path.endsWith(c.replace("./", "/")));
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isCore(url)) {
    // 네트워크 우선: 성공 시 캐시 갱신, 실패(오프라인) 시 캐시 폴백
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 정적 자원: 캐시 우선 + 뒤에서 갱신
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
