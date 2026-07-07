#!/usr/bin/env node
/**
 * Claude Desk — Claude Code 위에서 돌아가는 팀용 로컬 웹 앱
 * -----------------------------------------------------------
 * - 의존성 0개: Node.js 내장 모듈만 사용 (npm install 불필요)
 * - 원클릭 버튼으로 Claude Code 자동화 실행 (claude -p 헤드리스 모드)
 * - 모든 실행은 세션 기록으로 저장, 일일 리포트는 별도 보관
 * - 슬랙 알림(웹훅), 매일 아침 리포트 자동 생성 스케줄
 * - 개인 생산성: 할 일 / 캘린더 / 메모 / 집중 타이머 기록
 * - 실행: node server.js  (또는 시작하기.command / 시작하기.bat 더블클릭)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const BUTTONS_FILE = path.join(DATA_DIR, "buttons.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const TODOS_FILE = path.join(DATA_DIR, "todos.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const FOCUS_FILE = path.join(DATA_DIR, "focus.json");

const PORT = Number(process.env.PORT || 8787);
const IS_WIN = process.platform === "win32";
const MAX_LOG_EVENTS = 400;

/* ---------------------------------------------------------- *
 * 저장소 유틸
 * ---------------------------------------------------------- */
function ensureDirs() {
  for (const d of [DATA_DIR, REPORTS_DIR]) fs.mkdirSync(d, { recursive: true });
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}
function uid() { return crypto.randomBytes(8).toString("hex"); }
function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDur(a, b) {
  if (!a || !b) return "";
  const s = Math.max(0, Math.round((b - a) / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/* ---------------------------------------------------------- *
 * 기본 데이터
 * ---------------------------------------------------------- */
const DEFAULT_BUTTONS = [
  {
    id: "daily-report", builtin: true, emoji: "📋", name: "일일 리포트",
    description: "오늘의 변경사항·할 일·다음 단계를 정리한 리포트를 만듭니다.",
    prompt:
      "오늘은 {DATE}입니다. 이 프로젝트의 일일 리포트를 한국어 마크다운으로 작성해 주세요.\n" +
      "구성: 1) 최근 변경사항 요약(git 로그·상태 기반, git이 없으면 파일 구조 기준) " +
      "2) 코드 안의 TODO/FIXME 목록 3) 눈에 띄는 위험이나 개선 포인트 4) 내일 할 일 제안.\n" +
      "터미널을 모르는 팀원도 읽을 수 있게 쉬운 말로, 과장 없이 사실 위주로 써 주세요.",
    allowedTools: "Read,Glob,Grep,Bash(git log *),Bash(git status),Bash(git diff *)",
    permissionMode: "", maxTurns: 30,
  },
  {
    id: "project-tour", builtin: true, emoji: "🗺️", name: "프로젝트 한눈에 보기",
    description: "이 폴더가 무엇을 하는 프로젝트인지 쉬운 말로 설명해 줍니다.",
    prompt:
      "이 폴더의 프로젝트를 처음 보는 팀원에게 설명한다고 생각하고, " +
      "무엇을 하는 프로젝트인지, 주요 폴더와 파일은 각각 어떤 역할인지, " +
      "실행하려면 무엇이 필요한지 한국어로 친절하게 정리해 주세요. 전문용어에는 짧은 설명을 붙여 주세요.",
    allowedTools: "Read,Glob,Grep", permissionMode: "", maxTurns: 25,
  },
  {
    id: "code-review", builtin: true, emoji: "🔍", name: "최근 변경 코드 리뷰",
    description: "가장 최근 커밋의 변경사항을 검토해 문제점을 알려 줍니다.",
    prompt:
      "가장 최근 커밋의 변경사항(diff)을 검토해 주세요. " +
      "잠재적 버그, 보안 문제, 빠진 예외 처리, 헷갈리는 이름을 중심으로 보고, " +
      "심각도(높음/중간/낮음)를 붙여 한국어로 정리해 주세요. 문제가 없으면 없다고 말해 주세요.",
    allowedTools: "Read,Glob,Grep,Bash(git log *),Bash(git diff *),Bash(git show *)",
    permissionMode: "", maxTurns: 30,
  },
  {
    id: "find-todos", builtin: true, emoji: "✅", name: "할 일(TODO) 찾기",
    description: "코드 곳곳에 남아 있는 TODO와 FIXME를 모아 정리합니다.",
    prompt:
      "코드 안의 TODO, FIXME, HACK 주석을 모두 찾아 파일·위치·내용과 함께 표로 정리하고, " +
      "우선순위가 높아 보이는 것 3개를 골라 이유를 설명해 주세요. 한국어로 답해 주세요.",
    allowedTools: "Read,Glob,Grep", permissionMode: "", maxTurns: 20,
  },
  {
    id: "explain-error", builtin: true, emoji: "🚑", name: "오류 메시지 해석",
    description: "복사해 온 오류 메시지를 붙여 넣으면 원인과 해결 방법을 알려 줍니다.",
    prompt:
      "아래 사용자가 붙여 넣는 오류 메시지를 보고, 1) 무슨 뜻인지 쉬운 말로 2) 가장 흔한 원인 " +
      "3) 이 프로젝트에서 관련 있어 보이는 부분 4) 해결을 위해 할 일 순서를 한국어로 알려 주세요. " +
      "오류 메시지가 없다면 어떤 내용을 붙여 넣어야 하는지 안내해 주세요.",
    allowedTools: "Read,Glob,Grep", permissionMode: "", maxTurns: 20,
  },
];

const DEFAULT_CONFIG = {
  workspace: "",
  defaultMaxTurns: 30,
  timeoutMinutes: 15,
  // 슬랙
  slackWebhookUrl: "",
  slackNotifyRuns: false,     // 모든 작업 완료/실패 알림
  slackNotifyReports: true,   // 일일 리포트 알림
  // 자동 스케줄
  scheduleEnabled: false,
  scheduleTime: "09:00",
  scheduleDaysMode: "weekdays", // daily | weekdays
  lastScheduleDate: "",
};

function loadButtons() {
  const list = readJSON(BUTTONS_FILE, null);
  if (Array.isArray(list) && list.length) return list;
  writeJSON(BUTTONS_FILE, DEFAULT_BUTTONS);
  return DEFAULT_BUTTONS.slice();
}
function loadConfig() { return Object.assign({}, DEFAULT_CONFIG, readJSON(CONFIG_FILE, {})); }
function loadSessions() { const s = readJSON(SESSIONS_FILE, []); return Array.isArray(s) ? s : []; }
function saveSessions(list) { writeJSON(SESSIONS_FILE, list); }
function loadList(file) { const s = readJSON(file, []); return Array.isArray(s) ? s : []; }

/* ---------------------------------------------------------- *
 * 슬랙 알림 (Incoming Webhook)
 * ---------------------------------------------------------- */
function sendSlack(text) {
  const cfg = loadConfig();
  const url = (cfg.slackWebhookUrl || "").trim();
  if (!url) return Promise.resolve({ skipped: true });
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ error: "웹훅 주소가 올바른 URL이 아닙니다." }); }
    if (!/^https?:$/.test(u.protocol)) return resolve({ error: "http/https 주소만 지원합니다." });
    const mod = u.protocol === "https:" ? https : http;
    const body = JSON.stringify({ text });
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d.slice(0, 200) }));
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ error: "슬랙 응답이 없습니다 (8초 초과)." }); });
    req.write(body);
    req.end();
  });
}

function notifySlackForRun(rec) {
  const cfg = loadConfig();
  if (!cfg.slackWebhookUrl) return;
  const isReport = rec.buttonId === "daily-report";
  if (isReport ? !cfg.slackNotifyReports : !cfg.slackNotifyRuns) return;
  const ok = rec.status === "완료";
  const icon = ok ? "✅" : "⚠️";
  const dur = fmtDur(rec.startedAt, rec.finishedAt);
  const cost = typeof rec.costUsd === "number" ? ` · $${rec.costUsd.toFixed(4)}` : "";
  const preview = (rec.result || "").replace(/\s+/g, " ").slice(0, 300);
  const text = `${icon} *Claude Desk* ${rec.emoji || ""} ${rec.buttonName} — ${rec.status}` +
    (dur ? ` (${dur}${cost})` : "") + (preview ? `\n> ${preview}${(rec.result || "").length > 300 ? "…" : ""}` : "");
  sendSlack(text).then((r) => {
    if (r && r.error) console.log("[슬랙] 알림 실패:", r.error);
  });
}

/* ---------------------------------------------------------- *
 * Claude Code 실행 관리
 * ---------------------------------------------------------- */
const runs = new Map(); // runId -> { record, child, listeners:Set(res), buffer:[] }
function hasActiveRun() {
  for (const [, r] of runs) if (!r.record.finishedAt) return true;
  return false;
}

const TOOL_KO = {
  Read: "파일 읽는 중", Write: "파일 만드는 중", Edit: "파일 고치는 중", MultiEdit: "파일 고치는 중",
  Bash: "명령 실행 중", Glob: "파일 찾는 중", Grep: "코드 검색 중",
  WebSearch: "웹 검색 중", WebFetch: "웹 페이지 읽는 중",
  TodoWrite: "작업 계획 세우는 중", Task: "하위 작업 진행 중", NotebookEdit: "노트북 수정 중",
};

function sanitizeFlagValue(v) {
  return String(v || "").replace(/[\r\n"'`$\\;|&<>]/g, "").trim();
}

function claudeArgs({ allowedTools, permissionMode, maxTurns, resume }) {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  const tools = sanitizeFlagValue(allowedTools);
  if (tools) args.push("--allowedTools", tools);
  const pm = sanitizeFlagValue(permissionMode);
  if (pm && ["acceptEdits", "plan", "dontAsk"].includes(pm)) args.push("--permission-mode", pm);
  const mt = Number(maxTurns);
  if (Number.isFinite(mt) && mt > 0) args.push("--max-turns", String(Math.min(mt, 200)));
  const rs = sanitizeFlagValue(resume);
  if (rs) args.push("--resume", rs);
  return args; // 프롬프트는 stdin으로 전달 (따옴표 문제 원천 차단)
}

function pushEvent(run, ev) {
  ev.t = Date.now();
  run.buffer.push(ev);
  if (run.record.log.length < MAX_LOG_EVENTS) run.record.log.push(ev);
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of run.listeners) { try { res.write(payload); } catch {} }
}

function finishRun(run, status, extra = {}) {
  const rec = run.record;
  rec.status = status;
  rec.finishedAt = Date.now();
  Object.assign(rec, extra);
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === rec.id);
  if (idx >= 0) sessions[idx] = rec; else sessions.unshift(rec);
  saveSessions(sessions);
  if (rec.buttonId === "daily-report" && status === "완료" && rec.result) {
    const file = path.join(REPORTS_DIR, `${todayStr()}_${rec.id}.md`);
    const head = `# 일일 리포트 (${todayStr()})\n\n`;
    try { fs.writeFileSync(file, head + rec.result, "utf8"); } catch {}
  }
  notifySlackForRun(rec);
  pushEvent(run, { type: "done", status, result: rec.result || "", costUsd: rec.costUsd, numTurns: rec.numTurns, sessionId: rec.claudeSessionId });
  for (const res of run.listeners) { try { res.end(); } catch {} }
  run.listeners.clear();
  setTimeout(() => runs.delete(rec.id), 5 * 60 * 1000);
}

function startRun({ button, prompt, resume, cwdOverride, scheduled }) {
  const cfg = loadConfig();
  const cwd = cwdOverride || cfg.workspace || ROOT;
  if (!fs.existsSync(cwd)) {
    return { error: `작업 폴더를 찾을 수 없습니다: ${cwd}\n설정 탭에서 폴더 경로를 확인해 주세요.` };
  }
  const finalPrompt = String(prompt || button?.prompt || "").replace(/\{DATE\}/g, todayStr());
  if (!finalPrompt.trim()) return { error: "실행할 내용(프롬프트)이 비어 있습니다." };

  const runId = uid();
  const record = {
    id: runId,
    buttonId: button ? button.id : resume ? "resume" : "custom",
    buttonName: (button ? button.name : resume ? "이어서 대화" : "직접 요청") + (scheduled ? " (자동)" : ""),
    emoji: button ? button.emoji : resume ? "💬" : "✏️",
    prompt: finalPrompt, cwd,
    startedAt: Date.now(), finishedAt: null,
    status: "진행 중", result: "", costUsd: null, numTurns: null,
    claudeSessionId: resume || null, log: [],
  };
  const run = { record, child: null, listeners: new Set(), buffer: [] };
  runs.set(runId, run);

  const args = claudeArgs({
    allowedTools: button?.allowedTools,
    permissionMode: button?.permissionMode,
    maxTurns: button?.maxTurns || cfg.defaultMaxTurns,
    resume,
  });

  let child;
  try {
    child = spawn(IS_WIN ? "claude.cmd" : "claude", args, { cwd, shell: false, env: process.env, windowsHide: true });
  } catch (e) {
    runs.delete(runId);
    return { error: "Claude Code를 실행할 수 없습니다. 설치 상태를 확인해 주세요. (" + e.message + ")" };
  }
  run.child = child;
  pushEvent(run, { type: "status", text: "Claude에게 작업을 전달했습니다…" });

  child.stdin.write(finalPrompt);
  child.stdin.end();

  const timeoutMs = Math.max(1, Number(cfg.timeoutMinutes) || 15) * 60 * 1000;
  const killer = setTimeout(() => {
    try { child.kill(); } catch {}
    pushEvent(run, { type: "status", text: "시간이 너무 오래 걸려 작업을 중단했습니다." });
  }, timeoutMs);

  let lineBuf = "", stderrBuf = "";
  child.stdout.on("data", (chunk) => {
    lineBuf += chunk.toString("utf8");
    let nl;
    while ((nl = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, nl).trim();
      lineBuf = lineBuf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      handleStreamEvent(run, ev);
    }
  });
  child.stderr.on("data", (c) => { stderrBuf += c.toString("utf8"); if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000); });
  child.on("error", (e) => {
    clearTimeout(killer);
    const msg = e.code === "ENOENT"
      ? "이 컴퓨터에서 Claude Code를 찾을 수 없습니다.\n관리자에게 README의 **최초 1회 설정**(Claude Code 설치 + 로그인)을 요청해 주세요."
      : "Claude Code 실행 오류: " + e.message;
    finishRun(run, "실패", { result: msg });
  });
  child.on("close", (code) => {
    clearTimeout(killer);
    if (run.record.status !== "완료" && run.record.status !== "실패") {
      if (run.record.result) finishRun(run, "완료");
      else finishRun(run, "실패", {
        result:
          (stderrBuf.trim() ? "오류 메시지:\n" + stderrBuf.trim() + "\n\n" : "") +
          "작업이 결과 없이 종료되었습니다 (종료 코드 " + code + ").\n" +
          "• Claude Code에 로그인이 되어 있는지\n• 작업 폴더 경로가 올바른지 확인해 주세요.",
      });
    }
  });

  return { runId, record };
}

function handleStreamEvent(run, ev) {
  const rec = run.record;
  if (ev.type === "system" && ev.subtype === "init") {
    if (ev.session_id) rec.claudeSessionId = ev.session_id;
    pushEvent(run, { type: "status", text: "작업을 시작했습니다." });
    return;
  }
  if (ev.type === "assistant" && ev.message && Array.isArray(ev.message.content)) {
    for (const block of ev.message.content) {
      if (block.type === "text" && block.text) {
        pushEvent(run, { type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        const ko = TOOL_KO[block.name] || `${block.name} 사용 중`;
        let detail = "";
        const inp = block.input || {};
        if (inp.file_path) detail = path.basename(String(inp.file_path));
        else if (inp.pattern) detail = String(inp.pattern).slice(0, 60);
        else if (inp.command) detail = String(inp.command).slice(0, 60);
        else if (inp.query) detail = String(inp.query).slice(0, 60);
        pushEvent(run, { type: "tool", text: ko + (detail ? " · " + detail : "") });
      }
    }
    return;
  }
  if (ev.type === "result") {
    rec.result = typeof ev.result === "string" ? ev.result : rec.result;
    rec.costUsd = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : rec.costUsd;
    rec.numTurns = typeof ev.num_turns === "number" ? ev.num_turns : rec.numTurns;
    if (ev.session_id) rec.claudeSessionId = ev.session_id;
    finishRun(run, ev.is_error ? "실패" : "완료");
  }
}

/* ---------------------------------------------------------- *
 * 일일 리포트 자동 스케줄
 * 앱이 켜져 있는 동안 30초마다 확인. 지정 시간이 지났고 오늘 아직
 * 안 만들었다면 자동 생성 (앱이 꺼져 있었다면 다음에 켤 때 생성).
 * ---------------------------------------------------------- */
function checkSchedule() {
  const cfg = loadConfig();
  if (!cfg.scheduleEnabled || !cfg.scheduleTime) return;
  const now = new Date();
  const today = todayStr(now);
  if (cfg.lastScheduleDate === today) return;
  if (cfg.scheduleDaysMode === "weekdays" && (now.getDay() === 0 || now.getDay() === 6)) return;
  const m = String(cfg.scheduleTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return;
  const target = Number(m[1]) * 60 + Number(m[2]);
  if (now.getHours() * 60 + now.getMinutes() < target) return;
  if (hasActiveRun()) return; // 다른 작업 중이면 다음 체크 때 재시도
  cfg.lastScheduleDate = today;
  writeJSON(CONFIG_FILE, cfg);
  const btn = loadButtons().find((b) => b.id === "daily-report");
  if (!btn) return;
  console.log(`[스케줄] ${today} 일일 리포트 자동 생성 시작`);
  const r = startRun({ button: btn, scheduled: true });
  if (r.error) console.log("[스케줄] 실행 실패:", r.error);
}

/* ---------------------------------------------------------- *
 * 상태 점검
 * ---------------------------------------------------------- */
function healthCheck() {
  const cfg = loadConfig();
  const out = {
    node: process.version, claudeInstalled: false, claudeVersion: "",
    workspace: cfg.workspace || ROOT,
    scheduleEnabled: !!cfg.scheduleEnabled, scheduleTime: cfg.scheduleTime,
    slackConfigured: !!cfg.slackWebhookUrl,
  };
  try {
    const r = spawnSync(IS_WIN ? "claude.cmd" : "claude", ["--version"], { encoding: "utf8", timeout: 8000, windowsHide: true });
    if (r.status === 0 && r.stdout) { out.claudeInstalled = true; out.claudeVersion = r.stdout.trim(); }
  } catch {}
  return out;
}

/* ---------------------------------------------------------- *
 * 개인 생산성 CRUD (할 일 / 일정 / 메모 / 집중 기록)
 * ---------------------------------------------------------- */
const PERSONAL = {
  todos:  { file: TODOS_FILE,  create: ["text", "due"],           update: ["text", "due", "done"] },
  events: { file: EVENTS_FILE, create: ["title", "date", "time"], update: ["title", "date", "time"] },
  notes:  { file: NOTES_FILE,  create: ["title", "body"],         update: ["title", "body"] },
};

function personalCreate(kind, body) {
  const def = PERSONAL[kind];
  const item = { id: uid(), createdAt: Date.now() };
  for (const k of def.create) item[k] = clampField(kind, k, body[k]);
  if (kind === "todos") {
    if (!item.text) return { error: "할 일 내용을 입력해 주세요." };
    item.done = false;
  }
  if (kind === "events") {
    if (!item.title) return { error: "일정 제목을 입력해 주세요." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) return { error: "날짜 형식이 올바르지 않습니다." };
  }
  if (kind === "notes") {
    if (!item.title && !item.body) return { error: "메모 내용을 입력해 주세요." };
    item.updatedAt = Date.now();
  }
  const list = loadList(def.file);
  list.unshift(item);
  writeJSON(def.file, list);
  return { item, list };
}
function personalUpdate(kind, id, body) {
  const def = PERSONAL[kind];
  const list = loadList(def.file);
  const item = list.find((x) => x.id === id);
  if (!item) return { error: "항목을 찾을 수 없습니다." };
  for (const k of def.update) if (k in body) item[k] = k === "done" ? !!body[k] : clampField(kind, k, body[k]);
  if (kind === "notes") item.updatedAt = Date.now();
  if (kind === "events" && !/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) return { error: "날짜 형식이 올바르지 않습니다." };
  writeJSON(def.file, list);
  return { item, list };
}
function personalDelete(kind, id) {
  const def = PERSONAL[kind];
  const list = loadList(def.file).filter((x) => x.id !== id);
  writeJSON(def.file, list);
  return { list };
}
function clampField(kind, key, val) {
  let v = String(val ?? "").trim();
  if (key === "body") return v.slice(0, 50000);
  if (key === "text" || key === "title") return v.slice(0, 300);
  if (key === "date" || key === "due") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  if (key === "time") return /^\d{1,2}:\d{2}$/.test(v) ? v : "";
  return v.slice(0, 300);
}

function focusStats() {
  const map = readJSON(FOCUS_FILE, {});
  const today = todayStr();
  const t = map[today] || { count: 0, minutes: 0 };
  let weekCount = 0, weekMinutes = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const rec = map[todayStr(d)];
    if (rec) { weekCount += rec.count || 0; weekMinutes += rec.minutes || 0; }
  }
  return { today: t, week: { count: weekCount, minutes: weekMinutes } };
}

/* ---------------------------------------------------------- *
 * 대시보드 요약
 * ---------------------------------------------------------- */
function summary() {
  const today = todayStr();
  const todos = loadList(TODOS_FILE);
  const open = todos.filter((t) => !t.done);
  const topTodos = open
    .slice()
    .sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1)
    .slice(0, 3)
    .map((t) => ({ id: t.id, text: t.text, due: t.due }));
  const events = loadList(EVENTS_FILE)
    .filter((e) => e.date === today)
    .sort((a, b) => (a.time || "99:99") < (b.time || "99:99") ? -1 : 1)
    .map((e) => ({ title: e.title, time: e.time }));
  let lastReport = null;
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md")).sort().reverse();
    if (files[0]) lastReport = { file: files[0], date: files[0].slice(0, 10) };
  } catch {}
  return { openTodos: open.length, topTodos, eventsToday: events, focus: focusStats().today, lastReport };
}

/* ---------------------------------------------------------- *
 * HTTP 서버
 * ---------------------------------------------------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".md": "text/markdown; charset=utf-8" };

function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2e6) { reject(new Error("본문이 너무 큽니다")); req.destroy(); } });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;

  try {
    /* ---- 상태/요약 ---- */
    if (p === "/api/health") return sendJSON(res, 200, healthCheck());
    if (p === "/api/summary") return sendJSON(res, 200, summary());

    /* ---- 자동화 버튼 ---- */
    if (p === "/api/buttons" && req.method === "GET") return sendJSON(res, 200, loadButtons());
    if (p === "/api/buttons" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.name || !b.prompt) return sendJSON(res, 400, { error: "이름과 요청 내용은 필수입니다." });
      const list = loadButtons();
      const fields = {
        name: String(b.name).slice(0, 60),
        emoji: String(b.emoji || "⚡").slice(0, 4),
        description: String(b.description || "").slice(0, 200),
        prompt: String(b.prompt).slice(0, 8000),
        allowedTools: String(b.allowedTools || "Read,Glob,Grep").slice(0, 500),
        permissionMode: String(b.permissionMode || ""),
        maxTurns: Number(b.maxTurns) || 30,
      };
      if (b.id) {
        const i = list.findIndex((x) => x.id === b.id);
        if (i < 0) return sendJSON(res, 404, { error: "버튼을 찾을 수 없습니다." });
        list[i] = Object.assign({}, list[i], fields);
      } else {
        list.push(Object.assign({ id: uid(), builtin: false }, fields));
      }
      writeJSON(BUTTONS_FILE, list);
      return sendJSON(res, 200, list);
    }
    if (p.startsWith("/api/buttons/") && req.method === "DELETE") {
      const id = p.split("/").pop();
      let list = loadButtons();
      if (id === "daily-report") return sendJSON(res, 400, { error: "일일 리포트 버튼은 삭제할 수 없습니다." });
      list = list.filter((x) => x.id !== id);
      writeJSON(BUTTONS_FILE, list);
      return sendJSON(res, 200, list);
    }

    /* ---- 설정 ---- */
    if (p === "/api/config" && req.method === "GET") return sendJSON(res, 200, loadConfig());
    if (p === "/api/config" && req.method === "POST") {
      const b = await readBody(req);
      const cfg = loadConfig();
      if (typeof b.workspace === "string") cfg.workspace = b.workspace.trim();
      if (b.defaultMaxTurns) cfg.defaultMaxTurns = Math.min(200, Math.max(1, Number(b.defaultMaxTurns) || 30));
      if (b.timeoutMinutes) cfg.timeoutMinutes = Math.min(120, Math.max(1, Number(b.timeoutMinutes) || 15));
      if (typeof b.slackWebhookUrl === "string") {
        const url = b.slackWebhookUrl.trim();
        if (url && !/^https?:\/\//.test(url)) return sendJSON(res, 400, { error: "웹훅 주소는 http(s)://로 시작해야 합니다." });
        cfg.slackWebhookUrl = url;
      }
      if (typeof b.slackNotifyRuns === "boolean") cfg.slackNotifyRuns = b.slackNotifyRuns;
      if (typeof b.slackNotifyReports === "boolean") cfg.slackNotifyReports = b.slackNotifyReports;
      if (typeof b.scheduleEnabled === "boolean") cfg.scheduleEnabled = b.scheduleEnabled;
      if (typeof b.scheduleTime === "string") {
        if (!/^\d{1,2}:\d{2}$/.test(b.scheduleTime.trim())) return sendJSON(res, 400, { error: "시간은 09:00 형식으로 입력해 주세요." });
        cfg.scheduleTime = b.scheduleTime.trim();
        cfg.lastScheduleDate = ""; // 시간을 바꾸면 오늘 다시 실행될 수 있게 초기화
      }
      if (typeof b.scheduleDaysMode === "string" && ["daily", "weekdays"].includes(b.scheduleDaysMode)) cfg.scheduleDaysMode = b.scheduleDaysMode;
      if (cfg.workspace && !fs.existsSync(cfg.workspace)) {
        return sendJSON(res, 400, { error: "해당 폴더를 찾을 수 없습니다: " + cfg.workspace });
      }
      writeJSON(CONFIG_FILE, cfg);
      return sendJSON(res, 200, cfg);
    }

    /* ---- 슬랙 테스트 ---- */
    if (p === "/api/slack/test" && req.method === "POST") {
      const cfg = loadConfig();
      if (!cfg.slackWebhookUrl) return sendJSON(res, 400, { error: "먼저 웹훅 주소를 저장해 주세요." });
      const r = await sendSlack("👋 *Claude Desk* 테스트 알림입니다. 연동이 잘 되었어요!");
      if (r.error) return sendJSON(res, 502, { error: "슬랙 전송 실패: " + r.error });
      if (r.status && r.status >= 300) return sendJSON(res, 502, { error: `슬랙이 오류를 반환했습니다 (HTTP ${r.status}). 웹훅 주소를 확인해 주세요.` });
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- 실행 ---- */
    if (p === "/api/run" && req.method === "POST") {
      const b = await readBody(req);
      let button = null;
      if (b.buttonId) {
        button = loadButtons().find((x) => x.id === b.buttonId);
        if (!button) return sendJSON(res, 404, { error: "버튼을 찾을 수 없습니다." });
      }
      let cwdOverride = null;
      if (b.resume) {
        const prev = loadSessions().find((s) => s.claudeSessionId === b.resume);
        if (prev) cwdOverride = prev.cwd;
      }
      const r = startRun({ button, prompt: b.prompt, resume: b.resume || null, cwdOverride });
      if (r.error) return sendJSON(res, 400, { error: r.error });
      return sendJSON(res, 200, { runId: r.runId });
    }
    if (p.startsWith("/api/stream/")) {
      const runId = p.split("/").pop();
      const run = runs.get(runId);
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      if (!run) {
        res.write(`data: ${JSON.stringify({ type: "done", status: "알 수 없음", result: "실행 정보를 찾을 수 없습니다. 세션 기록 탭을 확인해 주세요." })}\n\n`);
        return res.end();
      }
      for (const ev of run.buffer) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (run.record.finishedAt) return res.end();
      run.listeners.add(res);
      req.on("close", () => run.listeners.delete(res));
      return;
    }
    if (p === "/api/stop" && req.method === "POST") {
      const b = await readBody(req);
      const run = runs.get(b.runId);
      if (run && run.child) { try { run.child.kill(); } catch {} }
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- 세션 기록 ---- */
    if (p === "/api/sessions" && req.method === "GET") {
      const q = (u.searchParams.get("q") || "").toLowerCase();
      let list = loadSessions();
      for (const [, run] of runs) {
        if (!run.record.finishedAt && !list.find((s) => s.id === run.record.id)) list = [run.record, ...list];
      }
      if (q) list = list.filter((s) => (s.buttonName + " " + s.prompt + " " + (s.result || "")).toLowerCase().includes(q));
      const slim = list.map((s) => ({ id: s.id, emoji: s.emoji, buttonId: s.buttonId, buttonName: s.buttonName, startedAt: s.startedAt, finishedAt: s.finishedAt, status: s.status, costUsd: s.costUsd, numTurns: s.numTurns, preview: (s.result || s.prompt || "").slice(0, 120) }));
      return sendJSON(res, 200, slim);
    }
    if (p.startsWith("/api/sessions/") && req.method === "GET") {
      const id = p.split("/").pop();
      const live = runs.get(id);
      if (live) return sendJSON(res, 200, live.record);
      const s = loadSessions().find((x) => x.id === id);
      if (!s) return sendJSON(res, 404, { error: "세션을 찾을 수 없습니다." });
      return sendJSON(res, 200, s);
    }

    /* ---- 리포트 ---- */
    if (p === "/api/reports" && req.method === "GET") {
      let files = [];
      try { files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md")).sort().reverse(); } catch {}
      return sendJSON(res, 200, files.map((f) => ({ file: f, date: f.slice(0, 10) })));
    }
    if (p.startsWith("/api/reports/") && req.method === "GET") {
      const f = decodeURIComponent(p.split("/").pop());
      if (!/^[\w.\-]+\.md$/.test(f)) return sendJSON(res, 400, { error: "잘못된 파일 이름입니다." });
      const full = path.join(REPORTS_DIR, f);
      if (!full.startsWith(REPORTS_DIR) || !fs.existsSync(full)) return sendJSON(res, 404, { error: "리포트를 찾을 수 없습니다." });
      return sendJSON(res, 200, { file: f, content: fs.readFileSync(full, "utf8") });
    }

    /* ---- 개인 생산성: 할 일 / 일정 / 메모 ---- */
    const pm = p.match(/^\/api\/(todos|events|notes)(?:\/([\w-]+))?$/);
    if (pm) {
      const kind = pm[1], id = pm[2];
      if (!id && req.method === "GET") return sendJSON(res, 200, loadList(PERSONAL[kind].file));
      if (!id && req.method === "POST") {
        const r = personalCreate(kind, await readBody(req));
        return r.error ? sendJSON(res, 400, { error: r.error }) : sendJSON(res, 200, r.list);
      }
      if (id && req.method === "PUT") {
        const r = personalUpdate(kind, id, await readBody(req));
        return r.error ? sendJSON(res, 400, { error: r.error }) : sendJSON(res, 200, r.list);
      }
      if (id && req.method === "DELETE") {
        return sendJSON(res, 200, personalDelete(kind, id).list);
      }
    }

    /* ---- 집중 타이머 기록 ---- */
    if (p === "/api/focus" && req.method === "GET") return sendJSON(res, 200, focusStats());
    if (p === "/api/focus" && req.method === "POST") {
      const b = await readBody(req);
      const minutes = Math.min(240, Math.max(1, Number(b.minutes) || 25));
      const map = readJSON(FOCUS_FILE, {});
      const today = todayStr();
      const t = map[today] || { count: 0, minutes: 0 };
      t.count += 1; t.minutes += minutes;
      map[today] = t;
      writeJSON(FOCUS_FILE, map);
      return sendJSON(res, 200, focusStats());
    }

    /* ---- 정적 파일 ---- */
    let file = p === "/" ? "/index.html" : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(PUBLIC_DIR, file);
    if (full.startsWith(PUBLIC_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
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
loadButtons();
setInterval(checkSchedule, 30 * 1000);
setTimeout(checkSchedule, 3 * 1000);

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log("");
  console.log("  ┌──────────────────────────────────────────────┐");
  console.log("  │  Claude Desk 가 실행 중입니다                │");
  console.log(`  │  브라우저에서 열기:  ${url}       │`);
  console.log("  │  종료하려면 이 창을 닫으세요                 │");
  console.log("  └──────────────────────────────────────────────┘");
  console.log("");
  const opener = process.platform === "darwin" ? "open" : IS_WIN ? "start" : "xdg-open";
  try {
    const child = spawn(opener, IS_WIN ? ["", url] : [url], { shell: IS_WIN, stdio: "ignore", detached: true });
    child.on("error", () => {}); // 브라우저를 못 열어도 서버는 계속 동작
    child.unref();
  } catch {}
});
