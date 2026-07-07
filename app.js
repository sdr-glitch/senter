/* ===== 센터 — AI 마케팅 멘토 ===== */
"use strict";

/* ---------- 저장소 ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("senter:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      localStorage.setItem("senter:" + key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast("⚠️ 저장 공간이 가득 찼어요. 자료실에서 안 쓰는 자료를 지워주세요.");
      return false;
    }
  },
  remove(key) { localStorage.removeItem("senter:" + key); }
};

let settings = store.get("settings", null);
let docs = store.get("docs", []);
let chats = store.get("chats", {});
let roadmapDone = store.get("roadmapDone", {});
let missions = store.get("missions", null); // {date, items:[{text,done}]}

/* ---------- 멘토(페르소나) 정의 ---------- */
const PERSONAS = [
  {
    id: "coach",
    emoji: "💡",
    name: "아이디어 코치",
    role: "마케팅 크리에이터 전문가",
    desc: "어떤 소재든 콘텐츠 각도와 후킹 멘트로 바꿔주는 선생님",
    suggestions: ["이건 계란이야", "수납 바구니로 콘텐츠 만들려면?", "오늘 청소한 거실, 콘텐츠가 될까?"],
    system: `당신은 10년차 마케팅 크리에이터 전문가이자 다정한 선생님입니다. 사용자가 어떤 소재나 아이디어를 던지면(예: "이건 계란이야"), 그것을 실제 SNS 마케팅 콘텐츠로 활용하는 방법을 가르쳐줍니다.

답변 방식:
1. 소재의 마케팅 포인트를 먼저 짚어주기 (사람들이 이 소재에서 무엇에 반응하는지)
2. 구체적인 콘텐츠 각도 3가지 제시 — 각각에 대해: 후킹 멘트(첫 문장/첫 화면 문구), 콘텐츠 형식(릴스/카드뉴스/사진 등), 왜 이 각도가 통하는지 한 줄 설명
3. 초보자가 오늘 바로 만들 수 있는 가장 쉬운 것 1개를 콕 집어 추천

전문 용어는 쓰되 반드시 쉬운 말로 풀어서 설명하세요(예: "후킹 = 스크롤을 멈추게 하는 첫 문장"). 사용자는 완전 초보입니다. 격려하되 구체적으로.`
  },
  {
    id: "knowledge",
    emoji: "📖",
    name: "지식 멘토",
    role: "내 자료 학습 멘토",
    desc: "자료실에 넣은 강의 노트·전자책을 바탕으로 대답하는 멘토",
    suggestions: ["내 자료에서 핵심만 요약해줘", "지금 나한테 제일 필요한 내용은?", "자료 내용을 실전 순서로 정리해줘"],
    system: `당신은 사용자가 구매한 유료 강의와 전자책 내용을 완벽히 소화한 개인 과외 멘토입니다. 아래 [참고 자료]에 사용자의 자료가 있습니다.

원칙:
- 질문에 답할 때 참고 자료의 내용을 최우선으로 활용하고, 어느 자료에서 나온 내용인지 언급하세요.
- 자료에 없는 내용은 일반적인 마케팅 지식으로 보완하되, "자료에는 없지만"이라고 구분해서 말하세요.
- 자료가 하나도 없으면: 자료실 탭에 강의 노트나 전자책 내용을 붙여넣으라고 안내하고, 그래도 질문에는 일반 지식으로 성실히 답하세요.
- 이론 설명으로 끝내지 말고, 항상 "그래서 지금 당장 뭘 하면 되는지" 실행 단계로 연결하세요. 사용자는 배운 것을 100% 써먹고 싶어합니다.`
  },
  {
    id: "growth",
    emoji: "🔥",
    name: "성장 멘토",
    role: "멱살 잡는 팀원",
    desc: "계정 세팅부터 성장까지 함께 뛰는 열정 멘토",
    suggestions: ["계정 세팅 뭐부터 해?", "팔로워가 안 늘어, 뭐가 문제야?", "일주일 릴스 계획 짜줘"],
    system: `당신은 사용자의 SNS 계정을 함께 키우는 열정적인 멘토 겸 팀원입니다. 스타일은 "멱살 잡고 끌고 가는" 스타일 — 다정하지만 확실하게 밀어붙입니다. 미루는 걸 허용하지 않되, 절대 비난하지 않습니다.

원칙:
- 항상 "오늘/이번 주에 할 일"을 구체적 숫자와 함께 제시 (예: "릴스 1개, 15초, 이 주제로")
- 추상적 조언 금지. "꾸준히 하세요" 대신 "이번 주 화·목·토 오후 6시에 올리세요"처럼.
- 알고리즘, 도달률, 전환율 같은 개념이 나오면 초보자 눈높이로 한 줄 설명을 곁들이기
- 사용자가 계획을 말하면 빠진 부분을 지적하고 더 나은 순서를 제안
- 답변 끝에는 가끔 "이거 하고 나서 보고해요! 🔥" 같은 팀원다운 마무리
- 체험단(레뷰, 리뷰노트, 미블, 디너의여왕, 스토리앤미디어 등 플랫폼)과 협찬 진입 조건에 대해 잘 알고 있습니다.`
  },
  {
    id: "copy",
    emoji: "✍️",
    name: "카피라이터",
    role: "글쓰기 담당 팀원",
    desc: "캡션·제목·해시태그·프로필 문구를 대신 써주는 팀원",
    suggestions: ["프로필 소개글 써줘", "이 사진에 캡션 5개 뽑아줘: 아늑한 침실 무드등", "리빙 계정 해시태그 세트 만들어줘"],
    system: `당신은 SNS 카피라이팅 전문 팀원입니다. 사용자가 소재나 상황을 주면 바로 쓸 수 있는 문구를 만들어줍니다.

원칙:
- 항상 복사해서 바로 쓸 수 있는 완성형 결과물을 제시 (여러 버전, 톤 다르게: 감성/정보/유머)
- 캡션은 첫 줄 후킹 → 본문 → 행동 유도(댓글/저장 유도) 구조로
- 해시태그는 규모 섞어서: 대형(수십만 게시물) + 중형 + 소형(니치) 조합, 왜 이렇게 섞는지 한 줄 설명
- 한국 인스타/블로그 감성에 맞는 자연스러운 한국어로. 번역투 금지.
- 사용자가 고르기 쉽게 각 버전에 짧은 라벨 붙이기 (예: [감성], [정보형], [저장유도])`
  },
  {
    id: "planner",
    emoji: "🗓️",
    name: "기획자",
    role: "전략·기획 담당 팀원",
    desc: "콘텐츠 캘린더, 벤치마킹, 수익화 전략을 짜주는 팀원",
    suggestions: ["이번 주 콘텐츠 캘린더 짜줘", "체험단 받으려면 뭐가 필요해?", "리빙 계정 벤치마킹 포인트 알려줘"],
    system: `당신은 마케팅 대행사의 전략 기획자 역할을 하는 AI 팀원입니다. 사용자의 계정을 하나의 브랜드로 보고 체계적으로 기획합니다.

원칙:
- 콘텐츠 캘린더를 짤 때는 표 형식으로: 요일 | 콘텐츠 주제 | 형식 | 목적(도달/저장/팔로우 전환)
- 수익화 로드맵을 물으면 단계별로: 팔로워 규모별 가능한 수익 모델 (체험단 → 원고료 협찬 → 광고 → 공동구매)
- 벤치마킹 방법을 구체적으로: 무엇을 보고(저장수 추정, 댓글 반응, 포맷), 무엇을 따라 하고, 무엇은 따라 하면 안 되는지
- 항상 사용자의 현재 단계(초보)에 맞는 현실적인 계획. 하루 3시간 이상 걸리는 계획 금지.
- 숫자로 말하기: 목표 팔로워, 주간 발행 수, 예상 소요 시간`
  }
];

let currentPersona = store.get("currentPersona", "coach");

/* ---------- 성장 로드맵 (리빙 계정 · 체험단/수익화 기준) ---------- */
const ROADMAP = [
  {
    id: "s1", title: "1단계 · 계정 기초 세팅",
    tip: "프로필은 가게의 간판이에요. 사람들이 3초 안에 '이 계정 뭐 하는 곳인지' 알 수 있어야 팔로우합니다.",
    steps: [
      "계정 컨셉 한 문장으로 정하기 (예: 원룸 자취생의 현실 살림 꿀팁)",
      "검색되기 쉬운 닉네임 정하기 (주제 키워드 포함, 예: ○○리빙, ○○의집)",
      "프로필 사진 정하기 (밝고 통일감 있는 이미지 1장)",
      "프로필 소개글 3줄 작성 (누구인지 · 무엇을 올리는지 · 팔로우하면 뭐가 좋은지)",
      "프로페셔널(크리에이터) 계정으로 전환하기 — 인사이트(통계) 보려면 필수",
      "벤치마킹할 리빙 계정 5개 찾아서 팔로우하기"
    ]
  },
  {
    id: "s2", title: "2단계 · 콘텐츠 기반 다지기",
    tip: "체험단 담당자는 계정에 들어와서 '피드 첫 화면'을 봅니다. 첫 9개 게시물이 포트폴리오예요.",
    steps: [
      "내가 꾸준히 만들 수 있는 콘텐츠 유형 2가지 정하기 (예: 살림 꿀팁 릴스 + 공간 사진)",
      "첫 9개 게시물 주제 리스트 만들기 (기획자 멘토에게 도움받기)",
      "사진/영상 찍는 기본 규칙 정하기 (밝은 낮에, 같은 보정 필터, 세로 방향)",
      "첫 게시물 3개 올리기 — 완벽하지 않아도 올리는 게 먼저!",
      "나머지 6개 채워서 피드 첫 화면 완성하기",
      "매 게시물에 캡션 + 해시태그 세트 붙이기 (카피라이터 멘토 활용)"
    ]
  },
  {
    id: "s3", title: "3단계 · 꾸준한 발행과 성장",
    tip: "알고리즘은 '꾸준히 올리고, 사람들이 반응하는 계정'을 밀어줘요. 주 3회 × 4주가 첫 목표입니다.",
    steps: [
      "발행 요일·시간 고정하기 (예: 화·목·토 저녁 6~9시)",
      "주 3회 × 4주 = 12개 발행 완주하기",
      "릴스(짧은 영상) 주 1개 이상 도전하기 — 신규 노출의 핵심",
      "매일 10분: 같은 주제 계정에 진심 댓글 5개 달기 (품앗이 아닌 진짜 소통)",
      "인사이트에서 반응 좋았던 게시물 확인하고, 그 유형 늘리기",
      "팔로워 100명 달성"
    ]
  },
  {
    id: "s4", title: "4단계 · 체험단 시작",
    tip: "체험단은 팔로워 수백 명부터도 가능해요. 블로그 병행하면 선정 확률이 크게 올라갑니다.",
    steps: [
      "체험단 플랫폼 가입하기 (레뷰, 리뷰노트, 미블, 디너의여왕, 스토리앤미디어 중 2~3곳)",
      "내 계정 소개 문구(지원용) 만들어두기 — 주제·팔로워·평균 반응 정리",
      "리빙/생활용품 카테고리 체험단 5개 지원하기 (떨어져도 계속!)",
      "첫 체험단 선정되면: 가이드라인 꼼꼼히 지켜서 정성 리뷰 올리기",
      "체험 리뷰도 내 콘텐츠 스타일로 — 광고 티 나는 계정은 성장이 멈춰요",
      "협찬 문의 받을 이메일 만들어서 프로필에 추가하기"
    ]
  },
  {
    id: "s5", title: "5단계 · 수익화 확장",
    tip: "여기부터는 '팔로워 수'보다 '내 계정을 믿는 사람 수'가 돈이 됩니다. 저장수·댓글이 높은 계정이 단가도 높아요.",
    steps: [
      "팔로워 1,000명 달성 (원고료 있는 협찬의 출발선)",
      "원고료 협찬 단가표 만들기 (기획자 멘토와 함께)",
      "돈 받는 협찬과 무료 체험단 비율 정하기",
      "공동구매/제휴 마케팅 등 다음 수익 모델 공부하기",
      "월 수익 목표 세우고 매달 결산하기"
    ]
  }
];

/* ---------- 유틸 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg, ms = 3200) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* 간단한 마크다운 렌더러 (멘토 답변용) */
function renderMarkdown(text) {
  let src = escapeHtml(text);
  const lines = src.split("\n");
  const out = [];
  let inList = null; // "ul" | "ol" | null
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };

  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (h) {
      closeList();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    } else if (ul) {
      if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      closeList();
      out.push("<hr>");
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");

  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }
}

/* ---------- 시스템 프롬프트 구성 ---------- */
const KNOWLEDGE_CHAR_BUDGET = 60000; // 자료 주입 상한 (약 2~3만 토큰)

function buildSystemPrompt(persona) {
  const s = settings || {};
  let prompt = persona.system;

  prompt += `\n\n[사용자 정보]
- 이름: ${s.name || "(미입력)"}
- 계정 주제: ${s.topic || "리빙"}
- 주력 플랫폼: ${(s.platforms || []).join(", ") || "인스타그램"}
- 목표: ${s.goal || "체험단 협찬 → 광고 수익"}
- 경험 수준: ${s.level || "완전 초보"}

[대화 규칙]
- 반드시 한국어로 답하세요.
- 사용자는 마케팅·SNS 완전 초보입니다. 전문 용어는 쓰되 즉시 쉬운 말로 풀어주세요.
- 답변은 읽기 쉽게: 짧은 문단, 목록 활용. 너무 길지 않게 핵심 위주로.
- 사용자를 이름으로 다정하게 부르되 과하지 않게.`;

  const enabled = docs.filter(d => d.enabled);
  if (enabled.length) {
    let budget = KNOWLEDGE_CHAR_BUDGET;
    const parts = [];
    for (const d of enabled) {
      if (budget <= 0) break;
      const slice = d.content.slice(0, budget);
      parts.push(`===== 자료: ${d.title} =====\n${slice}`);
      budget -= slice.length;
    }
    prompt += `\n\n[참고 자료 — 사용자가 학습시킨 강의/전자책 내용]\n${parts.join("\n\n")}`;
    if (budget <= 0) prompt += `\n\n(참고: 자료가 많아 일부만 포함되었습니다.)`;
  }

  return prompt;
}

/* ---------- Claude API 호출 (스트리밍) ---------- */
async function callClaude(personaId, messages, onDelta) {
  const persona = PERSONAS.find(p => p.id === personaId);
  const apiKey = (settings && settings.apiKey || "").trim();
  if (!apiKey) throw new Error("NO_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: (settings && settings.model) || "claude-sonnet-5",
      max_tokens: 2048,
      system: buildSystemPrompt(persona),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    })
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error?.message || ""; } catch {}
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.text) {
          full += ev.delta.text;
          onDelta(full);
        }
        if (ev.type === "error") throw new Error(ev.error?.message || "스트리밍 오류");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return full;
}

function friendlyApiError(e) {
  if (e.message === "NO_KEY") return "API 키가 아직 없어요. 설정 탭에서 키를 등록해주세요. (발급 방법 안내 버튼이 있어요)";
  if (e.status === 401) return "API 키가 올바르지 않아요. 설정 탭에서 키를 다시 확인해주세요.";
  if (e.status === 400 && /credit/i.test(e.message)) return "Anthropic 계정의 충전 금액(크레딧)이 부족해요. console.anthropic.com의 Billing에서 충전해주세요.";
  if (e.status === 429) return "잠시 요청이 몰렸어요. 30초 후에 다시 시도해주세요.";
  if (e.status === 529) return "AI 서버가 잠시 바빠요. 조금 뒤에 다시 시도해주세요.";
  if (e instanceof TypeError) return "인터넷 연결을 확인해주세요. (네트워크 오류)";
  return "오류가 발생했어요: " + e.message;
}

/* ---------- 온보딩 ---------- */
function setupChipRows() {
  $$("#ob-platforms .chip").forEach(chip => {
    chip.addEventListener("click", (e) => { e.preventDefault(); chip.classList.toggle("selected"); });
  });
  $$("#ob-level .chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      $$("#ob-level .chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
  });
}

function finishOnboarding() {
  const platforms = $$("#ob-platforms .chip.selected").map(c => c.dataset.value);
  settings = {
    name: $("#ob-name").value.trim() || "크리에이터",
    topic: $("#ob-topic").value.trim() || "리빙",
    platforms: platforms.length ? platforms : ["인스타그램"],
    goal: $("#ob-goal").value.trim() || "체험단 협찬 받기",
    level: ($("#ob-level .chip.selected") || {}).dataset?.value || "완전 초보",
    apiKey: "",
    model: "claude-sonnet-5"
  };
  store.set("settings", settings);
  $("#onboarding").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderAll();
  openKeyGuide();
}

function openKeyGuide() {
  $("#kg-key").value = (settings && settings.apiKey) || "";
  $("#key-guide").classList.remove("hidden");
}

/* ---------- 홈 탭 ---------- */
function renderHome() {
  const s = settings;
  const hour = new Date().getHours();
  const hi = hour < 6 ? "새벽까지 열정이네요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "오늘 하루 수고했어요";
  $("#home-greeting").textContent = `${hi}, ${s.name}님! 🌱`;
  $("#home-sub").textContent = `${s.topic} 계정 · 목표: ${s.goal}`;
  renderMissions();
  renderRoadmap();
}

function renderMissions() {
  const list = $("#mission-list");
  const today = new Date().toISOString().slice(0, 10);
  if (!missions || missions.date !== today || !missions.items.length) {
    list.innerHTML = `<div class="mission-empty">아직 오늘의 미션이 없어요. [미션 받기]를 눌러 멘토에게 오늘 할 일을 받아보세요!</div>`;
    return;
  }
  list.innerHTML = "";
  missions.items.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "mission-item" + (m.done ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = m.done; cb.id = "mission-" + i;
    const label = document.createElement("label");
    label.htmlFor = cb.id; label.textContent = m.text;
    cb.addEventListener("change", () => {
      m.done = cb.checked;
      store.set("missions", missions);
      div.classList.toggle("done", m.done);
      if (missions.items.every(x => x.done)) toast("🎉 오늘 미션 완료! 내일도 만나요!");
    });
    div.append(cb, label);
    list.appendChild(div);
  });
}

async function generateMissions() {
  const btn = $("#mission-gen");
  btn.disabled = true; btn.textContent = "생성 중...";
  const today = new Date().toISOString().slice(0, 10);

  // 로드맵 진행 상황 요약
  const progress = ROADMAP.map(st => {
    const done = st.steps.filter((_, i) => roadmapDone[st.id + ":" + i]).length;
    return `${st.title}: ${done}/${st.steps.length} 완료`;
  }).join(" / ");

  const ask = `내 성장 로드맵 진행 상황: ${progress}
오늘 날짜: ${today}
지금 내 단계에 맞는 "오늘의 미션" 3개를 뽑아줘. 각 미션은 30분 안에 끝낼 수 있게 구체적으로.
반드시 아래 형식으로만 답해줘 (설명 없이):
1. (미션 내용)
2. (미션 내용)
3. (미션 내용)`;

  try {
    const text = await callClaude("growth", [{ role: "user", content: ask }], () => {});
    const items = text.split("\n")
      .map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(l => l.length > 4)
      .slice(0, 3)
      .map(t => ({ text: t, done: false }));
    if (!items.length) throw new Error("미션을 만들지 못했어요. 다시 시도해주세요.");
    missions = { date: today, items };
    store.set("missions", missions);
    renderMissions();
    toast("🎯 오늘의 미션이 도착했어요!");
  } catch (e) {
    toast("⚠️ " + friendlyApiError(e), 5000);
    if (e.message === "NO_KEY") openKeyGuide();
  } finally {
    btn.disabled = false; btn.textContent = "미션 받기";
  }
}

function renderRoadmap() {
  const wrap = $("#roadmap");
  wrap.innerHTML = "";
  let totalSteps = 0, totalDone = 0;

  ROADMAP.forEach((stage, si) => {
    const doneCount = stage.steps.filter((_, i) => roadmapDone[stage.id + ":" + i]).length;
    totalSteps += stage.steps.length;
    totalDone += doneCount;

    const el = document.createElement("div");
    el.className = "stage";
    const isOpen = store.get("stageOpen", { s1: true })[stage.id];

    const head = document.createElement("div");
    head.className = "stage-head";
    head.innerHTML = `
      <div class="stage-num">${si + 1}</div>
      <div class="stage-title">${escapeHtml(stage.title.replace(/^\d+단계 · /, ""))}</div>
      <div class="stage-count">${doneCount}/${stage.steps.length}</div>
      <div>${isOpen ? "▲" : "▼"}</div>`;
    head.addEventListener("click", () => {
      const open = store.get("stageOpen", { s1: true });
      open[stage.id] = !open[stage.id];
      store.set("stageOpen", open);
      renderRoadmap();
    });
    el.appendChild(head);

    if (isOpen) {
      const body = document.createElement("div");
      body.className = "stage-body";
      const tip = document.createElement("div");
      tip.className = "stage-tip";
      tip.textContent = "💡 " + stage.tip;
      body.appendChild(tip);

      stage.steps.forEach((step, i) => {
        const key = stage.id + ":" + i;
        const row = document.createElement("div");
        row.className = "step" + (roadmapDone[key] ? " done" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = !!roadmapDone[key];
        cb.addEventListener("change", () => {
          roadmapDone[key] = cb.checked;
          if (!cb.checked) delete roadmapDone[key];
          store.set("roadmapDone", roadmapDone);
          renderRoadmap();
        });
        const text = document.createElement("div");
        text.className = "step-text";
        text.textContent = step;
        text.addEventListener("click", () => cb.click());
        const ask = document.createElement("button");
        ask.className = "step-ask";
        ask.title = "이 항목, 멘토에게 물어보기";
        ask.textContent = "💬";
        ask.addEventListener("click", () => {
          switchTab("chat");
          selectPersona("growth");
          $("#chat-input").value = `로드맵의 "${step}" 이거 어떻게 하는지 처음부터 알려줘.`;
          $("#chat-input").focus();
        });
        row.append(cb, text, ask);
        body.appendChild(row);
      });
      el.appendChild(body);
    }
    wrap.appendChild(el);
  });

  const pct = totalSteps ? Math.round(totalDone / totalSteps * 100) : 0;
  $("#roadmap-progress").textContent = `${pct}% 진행 중`;
}

/* ---------- 채팅 탭 ---------- */
let sending = false;

function renderPersonaBar() {
  const bar = $("#persona-bar");
  bar.innerHTML = "";
  PERSONAS.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "persona-btn" + (p.id === currentPersona ? " active" : "");
    btn.innerHTML = `<span class="persona-emoji">${p.emoji}</span><span><span class="persona-name">${p.name}</span><span class="persona-role">${p.role}</span></span>`;
    btn.addEventListener("click", () => selectPersona(p.id));
    bar.appendChild(btn);
  });
}

function selectPersona(id) {
  currentPersona = id;
  store.set("currentPersona", id);
  renderPersonaBar();
  renderChat();
}

function renderChat() {
  const persona = PERSONAS.find(p => p.id === currentPersona);
  $("#chat-persona-name").textContent = `${persona.emoji} ${persona.name}`;
  $("#chat-persona-desc").textContent = persona.desc;

  const box = $("#chat-messages");
  box.innerHTML = "";
  const history = chats[currentPersona] || [];

  if (!history.length) {
    box.innerHTML = `<div class="chat-welcome"><span class="persona-emoji">${persona.emoji}</span>${escapeHtml(persona.desc)}<br>아래 추천 질문을 눌러보거나, 자유롭게 말을 걸어보세요!</div>`;
  } else {
    history.forEach(m => box.appendChild(makeMsgEl(m.role, m.content)));
  }

  const sug = $("#chat-suggestions");
  sug.innerHTML = "";
  if (history.length < 2) {
    persona.suggestions.forEach(q => {
      const b = document.createElement("button");
      b.className = "suggestion";
      b.textContent = q;
      b.addEventListener("click", () => { $("#chat-input").value = q; sendChat(); });
      sug.appendChild(b);
    });
  }

  const enabled = docs.filter(d => d.enabled).length;
  $("#chat-kb-note").textContent = enabled
    ? `📚 자료실의 자료 ${enabled}개를 참고해서 대답해요`
    : (currentPersona === "knowledge" ? "📚 자료실에 자료를 추가하면 그 내용을 바탕으로 대답해요" : "");

  box.scrollTop = box.scrollHeight;
}

function makeMsgEl(role, content, extraClass = "") {
  const div = document.createElement("div");
  div.className = `msg ${role} ${extraClass}`.trim();
  if (role === "assistant") div.innerHTML = renderMarkdown(content);
  else div.textContent = content;
  return div;
}

async function sendChat(presetText) {
  if (sending) return;
  const input = $("#chat-input");
  const text = (presetText || input.value).trim();
  if (!text) return;

  if (!(settings.apiKey || "").trim()) {
    openKeyGuide();
    return;
  }

  sending = true;
  $("#chat-send").disabled = true;
  input.value = "";
  input.style.height = "auto";

  const history = chats[currentPersona] = chats[currentPersona] || [];
  history.push({ role: "user", content: text });
  store.set("chats", chats);
  renderChat();

  const box = $("#chat-messages");
  const liveEl = makeMsgEl("assistant", "", "typing");
  box.appendChild(liveEl);
  box.scrollTop = box.scrollHeight;

  try {
    // 최근 20개 메시지만 전송 (비용 절약)
    const recent = history.slice(-20);
    const full = await callClaude(currentPersona, recent, (partial) => {
      liveEl.innerHTML = renderMarkdown(partial);
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
      if (nearBottom) box.scrollTop = box.scrollHeight;
    });
    liveEl.classList.remove("typing");
    history.push({ role: "assistant", content: full });
    store.set("chats", chats);
  } catch (e) {
    liveEl.remove();
    box.appendChild(makeMsgEl("assistant", "", "error")).textContent = "⚠️ " + friendlyApiError(e);
    history.pop(); // 실패한 질문은 히스토리에서 제거하지 않고 남길 수도 있지만, 재전송 편의를 위해 입력창에 복원
    $("#chat-input").value = text;
    store.set("chats", chats);
    if (e.message === "NO_KEY") openKeyGuide();
  } finally {
    sending = false;
    $("#chat-send").disabled = false;
    box.scrollTop = box.scrollHeight;
  }
}

/* ---------- 자료실 탭 ---------- */
function docsTotalSize() {
  return docs.reduce((sum, d) => sum + d.content.length, 0);
}

function renderLibrary() {
  const list = $("#lib-list");
  list.innerHTML = "";
  if (!docs.length) {
    list.innerHTML = `<div class="lib-empty">아직 자료가 없어요.<br>강의 노트나 전자책 내용을 추가하면 멘토들이 훨씬 똑똑해져요! 📚</div>`;
  }
  docs.forEach(d => {
    const item = document.createElement("div");
    item.className = "lib-item" + (d.enabled ? "" : " off");

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    toggle.title = d.enabled ? "멘토가 이 자료를 참고 중" : "꺼짐 (참고 안 함)";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = d.enabled;
    cb.addEventListener("change", () => {
      d.enabled = cb.checked;
      store.set("docs", docs);
      renderLibrary();
      renderChat();
    });
    const slider = document.createElement("span");
    slider.className = "toggle-slider";
    toggle.append(cb, slider);

    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = d.title;

    const meta = document.createElement("div");
    meta.className = "lib-meta";
    meta.textContent = `${(d.content.length / 1000).toFixed(1)}천 자`;

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️"; editBtn.title = "수정";
    editBtn.addEventListener("click", () => editDoc(d));

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️"; delBtn.title = "삭제";
    delBtn.addEventListener("click", () => {
      if (!confirm(`"${d.title}" 자료를 삭제할까요?`)) return;
      docs = docs.filter(x => x.id !== d.id);
      store.set("docs", docs);
      renderLibrary();
      renderChat();
    });

    item.append(toggle, title, meta, editBtn, delBtn);
    list.appendChild(item);
  });

  const total = docsTotalSize();
  const budget = KNOWLEDGE_CHAR_BUDGET;
  const enabledSize = docs.filter(d => d.enabled).reduce((s, d) => s + d.content.length, 0);
  let note = `전체 ${(total / 1000).toFixed(0)}천 자 저장됨`;
  if (enabledSize > budget) note += ` · ⚠️ 켜진 자료가 많아 한 번에 ${(budget / 1000).toFixed(0)}천 자까지만 참고돼요. 지금 필요한 자료만 켜두는 걸 추천!`;
  $("#lib-usage").textContent = note;
}

function addDocByPaste() {
  const title = prompt("자료 이름을 정해주세요 (예: 인스타 강의 3강 노트)");
  if (title === null) return;
  const content = prompt("자료 내용을 붙여넣어 주세요 (노션에서 복사한 내용 등)");
  if (content === null || !content.trim()) return;
  docs.push({ id: Date.now() + "", title: title.trim() || "이름 없는 자료", content: content.trim(), enabled: true });
  if (store.set("docs", docs)) toast("📚 자료가 추가됐어요!");
  renderLibrary();
  renderChat();
}

function editDoc(d) {
  const title = prompt("자료 이름", d.title);
  if (title === null) return;
  const content = prompt("자료 내용 (수정해서 확인을 누르세요)", d.content.slice(0, 2000) + (d.content.length > 2000 ? "\n...(내용이 길어 앞부분만 표시. 수정하면 전체가 이 내용으로 바뀌어요. 취소를 누르면 원본 유지)" : ""));
  d.title = title.trim() || d.title;
  if (content !== null && !content.includes("...(내용이 길어 앞부분만 표시")) d.content = content;
  store.set("docs", docs);
  renderLibrary();
}

function addDocsByFiles(files) {
  let added = 0;
  const tasks = Array.from(files).map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "").trim();
      if (content) {
        docs.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), title: file.name.replace(/\.(txt|md|markdown)$/i, ""), content, enabled: true });
        added++;
      }
      resolve();
    };
    reader.onerror = () => resolve();
    reader.readAsText(file);
  }));
  Promise.all(tasks).then(() => {
    if (added) {
      store.set("docs", docs);
      toast(`📚 자료 ${added}개가 추가됐어요!`);
      renderLibrary();
      renderChat();
    } else {
      toast("⚠️ 읽을 수 있는 텍스트 파일이 없었어요. (.txt / .md 파일만 지원)");
    }
  });
}

/* ---------- 설정 탭 ---------- */
function renderSettings() {
  const s = settings;
  $("#set-key").value = s.apiKey || "";
  $("#set-model").value = s.model || "claude-sonnet-5";
  $("#set-name").value = s.name || "";
  $("#set-topic").value = s.topic || "";
  $("#set-platforms").value = (s.platforms || []).join(", ");
  $("#set-goal").value = s.goal || "";
  $("#set-level").value = s.level || "";
}

function saveSettings() {
  settings.apiKey = $("#set-key").value.trim();
  settings.model = $("#set-model").value;
  settings.name = $("#set-name").value.trim() || "크리에이터";
  settings.topic = $("#set-topic").value.trim() || "리빙";
  settings.platforms = $("#set-platforms").value.split(",").map(x => x.trim()).filter(Boolean);
  settings.goal = $("#set-goal").value.trim();
  settings.level = $("#set-level").value.trim();
  store.set("settings", settings);
  renderKeyStatus();
  renderHome();
  const note = $("#set-saved");
  note.classList.remove("hidden");
  setTimeout(() => note.classList.add("hidden"), 2000);
}

function renderKeyStatus() {
  const el = $("#key-status");
  if ((settings.apiKey || "").trim()) {
    el.textContent = "🟢 AI 연결됨";
    el.classList.add("ok");
  } else {
    el.textContent = "⚪ AI 미연결 — 설정에서 키 등록";
    el.classList.remove("ok");
  }
  el.style.cursor = "pointer";
  el.onclick = () => { switchTab("settings"); };
}

function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, apiKey: "" }, // 보안을 위해 키는 제외
    docs, chats, roadmapDone, missions
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `senter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📦 백업 파일이 다운로드됐어요. (API 키는 보안상 제외)");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data.settings) throw new Error("형식이 올바르지 않아요");
      const keepKey = settings.apiKey;
      settings = { ...data.settings, apiKey: keepKey };
      docs = data.docs || [];
      chats = data.chats || {};
      roadmapDone = data.roadmapDone || {};
      missions = data.missions || null;
      store.set("settings", settings);
      store.set("docs", docs);
      store.set("chats", chats);
      store.set("roadmapDone", roadmapDone);
      store.set("missions", missions);
      renderAll();
      toast("📥 백업을 불러왔어요!");
    } catch (e) {
      toast("⚠️ 백업 파일을 읽을 수 없어요: " + e.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- 탭 전환 ---------- */
function switchTab(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".tab-panel").forEach(p => p.classList.add("hidden"));
  $("#tab-" + name).classList.remove("hidden");
  if (name === "chat") renderChat();
  if (name === "library") renderLibrary();
  if (name === "settings") renderSettings();
  if (name === "home") renderHome();
}

/* ---------- 렌더 전체 ---------- */
function renderAll() {
  renderKeyStatus();
  renderHome();
  renderPersonaBar();
  renderChat();
  renderLibrary();
  renderSettings();
}

/* ---------- 이벤트 바인딩 ---------- */
function bindEvents() {
  // 탭
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // 온보딩
  $("#ob-done").addEventListener("click", finishOnboarding);

  // API 키 안내
  $("#kg-save").addEventListener("click", () => {
    const key = $("#kg-key").value.trim();
    if (key && !key.startsWith("sk-ant-")) {
      if (!confirm("키가 보통 sk-ant- 로 시작하는데, 입력한 값이 달라요. 그래도 저장할까요?")) return;
    }
    settings.apiKey = key;
    store.set("settings", settings);
    $("#key-guide").classList.add("hidden");
    renderKeyStatus();
    renderSettings();
    if (key) toast("🟢 AI가 연결됐어요! 이제 멘토와 대화할 수 있어요.");
  });
  $("#kg-later").addEventListener("click", () => $("#key-guide").classList.add("hidden"));
  $("#set-key-guide").addEventListener("click", openKeyGuide);

  // 아이디어 변환기
  const ideaGo = () => {
    const v = $("#idea-input").value.trim();
    if (!v) { $("#idea-input").focus(); return; }
    switchTab("chat");
    selectPersona("coach");
    $("#idea-input").value = "";
    sendChat(`이건 ${v}(이)야. 마케팅 콘텐츠로 어떻게 활용하면 좋을까?`);
  };
  $("#idea-go").addEventListener("click", ideaGo);
  $("#idea-input").addEventListener("keydown", e => { if (e.key === "Enter") ideaGo(); });

  // 미션
  $("#mission-gen").addEventListener("click", generateMissions);

  // 채팅
  $("#chat-send").addEventListener("click", () => sendChat());
  const chatInput = $("#chat-input");
  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendChat();
    }
  });
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
  });
  $("#chat-clear").addEventListener("click", () => {
    if (!confirm("이 멘토와의 대화를 모두 지울까요?")) return;
    chats[currentPersona] = [];
    store.set("chats", chats);
    renderChat();
  });

  // 자료실
  $("#lib-add-paste").addEventListener("click", addDocByPaste);
  $("#lib-add-file").addEventListener("click", () => $("#lib-file-input").click());
  $("#lib-file-input").addEventListener("change", e => {
    if (e.target.files.length) addDocsByFiles(e.target.files);
    e.target.value = "";
  });

  // 설정
  $("#set-save").addEventListener("click", saveSettings);
  $("#set-export").addEventListener("click", exportBackup);
  $("#set-import").addEventListener("click", () => $("#set-import-input").click());
  $("#set-import-input").addEventListener("change", e => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = "";
  });
  $("#set-reset").addEventListener("click", () => {
    if (!confirm("정말 모든 데이터(설정, 자료, 대화, 진행 상황)를 지울까요? 되돌릴 수 없어요.")) return;
    if (!confirm("마지막 확인이에요. 전체 초기화할까요?")) return;
    Object.keys(localStorage).filter(k => k.startsWith("senter:")).forEach(k => localStorage.removeItem(k));
    location.reload();
  });
}

/* ---------- 시작 ---------- */
function init() {
  setupChipRows();
  bindEvents();
  if (!settings) {
    $("#onboarding").classList.remove("hidden");
  } else {
    $("#app").classList.remove("hidden");
    renderAll();
  }
}

init();
