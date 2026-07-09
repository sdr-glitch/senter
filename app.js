/* ===== 센터 — AI 마케팅 멘토 ===== */
"use strict";

/* ---------- 저장소 ----------
   큰 기록(BIG_KEYS)은 마이그레이션 후 IndexedDB로 저장돼 localStorage 5MB 한계를 우회한다.
   store.set이 자동으로 경로를 고르므로 호출부는 그대로 사용. */
const BIG_KEYS = ["tasks", "meetings", "chats", "teamChat", "activity", "reports"];
let bigInIdb = false; // initBigStore() 마이그레이션 완료 후 true

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("senter:" + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    if (bigInIdb && BIG_KEYS.includes(key) && idb.ok) {
      idb.set(key, value).catch(() => {
        try { localStorage.setItem("senter:" + key, JSON.stringify(value)); }
        catch (e) { toast("⚠️ 저장 공간이 가득 찼어요. 설정 탭에서 백업한 뒤 오래된 기록을 정리해주세요."); }
      });
      return true;
    }
    try {
      localStorage.setItem("senter:" + key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast("⚠️ 저장 공간이 가득 찼어요. 설정 탭에서 백업한 뒤 오래된 대화·완료 업무를 정리해주세요.");
      return false;
    }
  },
  remove(key) { localStorage.removeItem("senter:" + key); }
};

/* ---------- IndexedDB 저장소 — 자료실 전용 (localStorage 5MB 한계 우회, 기가바이트급) ----------
   자료실(docs)이 앱에서 가장 큰 데이터(PDF 전자책 등)라 이것만 IndexedDB로 옮기면
   localStorage에는 작은 상태만 남아 용량 걱정이 사실상 사라진다.
   읽기는 앱 시작 때 한 번 메모리로 올리고(기존 docs 배열 그대로), 쓰기만 비동기로 IDB에 저장. */
const idb = {
  _db: null,
  ok: typeof indexedDB !== "undefined",
  open() {
    if (this._db) return Promise.resolve(this._db);
    if (this._opening) return this._opening;
    this._opening = new Promise((res, rej) => {
      const rq = indexedDB.open("senter-db", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => { this._opening = null; rej(rq.error); };
    });
    return this._opening;
  },
  async get(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const rq = db.transaction("kv").objectStore("kv").get(key);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },
  async set(key, value) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("저장 중단"));
    });
  }
};

let docsInIdb = false; // 마이그레이션 완료 후 true → saveDocs()가 IDB로 저장
function saveDocs() {
  if (docsInIdb && idb.ok) {
    idb.set("docs", docs).catch(() => {
      // IDB가 갑자기 실패하면(디스크 가득 등) localStorage로 마지막 시도
      docsInIdb = false;
      store.set("docs", docs);
    });
    return true;
  }
  return store.set("docs", docs);
}

async function initDocsStore() {
  if (!idb.ok) return; // 미지원 브라우저는 localStorage 그대로 사용
  try {
    const stored = await idb.get("docs");
    if (Array.isArray(stored)) {
      // IDB가 원본 — 시작 사이에 추가된 자료가 있으면 합침 (id 기준)
      const fresh = docs.filter(d => !stored.some(s => s.id === d.id));
      docs = stored.concat(fresh);
      docsInIdb = true;
      if (fresh.length) await idb.set("docs", docs);
      store.remove("docs");
      renderLibrary();
    } else {
      // 첫 실행: localStorage → IDB 이전 (성공 확인 후에만 원본 삭제)
      await idb.set("docs", docs);
      docsInIdb = true;
      store.remove("docs");
    }
    renderStorageMeter();
  } catch { /* 사파리 시크릿 모드 등 IDB 실패 → localStorage 유지 */ }
}

/* 회의록·대화·업무 등 큰 기록도 IndexedDB로 이전 (용량 최대 확장) */
async function initBigStore() {
  if (!idb.ok) return;
  try {
    const load = async (key, cur) => {
      const v = await idb.get(key);
      if (v !== undefined && v !== null) { store.remove(key); return v; }
      await idb.set(key, cur); // 첫 이전: 성공 확인 후 localStorage 원본 삭제
      store.remove(key);
      return cur;
    };
    tasks = await load("tasks", tasks);
    meetings = await load("meetings", meetings);
    chats = await load("chats", chats);
    teamChat = await load("teamChat", teamChat);
    activity = await load("activity", activity);
    reports = await load("reports", reports);
    bigInIdb = true;
  } catch { /* IDB 불가 → localStorage 유지 */ }
}

let settings = store.get("settings", null);
if (settings && settings.autoPilot === undefined) settings.autoPilot = true; // 기존 사용자 마이그레이션
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
    get suggestions() { return ["프로필 소개글 써줘", "이 사진에 캡션 5개 뽑아줘: 오늘 찍은 사진", `${topicWord()} 계정 해시태그 세트 만들어줘`]; },
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
    get suggestions() { return ["이번 주 콘텐츠 캘린더 짜줘", "체험단 받으려면 뭐가 필요해?", `${topicWord()} 계정 벤치마킹 포인트 알려줘`]; },
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

/* 핵심 멘토 2명 먼저, 나머지 팀원은 "더 보기"로 하나씩 */
const CORE_PERSONAS = ["coach", "knowledge"];
let personaBarExpanded = store.get("personaBarExpanded", false);

/* ---------- AI 직원 (무료 챗봇용 업무 지시서) ---------- */
function staffContext() {
  const s = settings || {};
  return `[고용주(나) 정보]
- 호칭: ${s.name || "사장님"}
- 운영 계정 주제: ${s.topic || "리빙 (인테리어·살림·홈스타일링)"}
- 플랫폼: ${(s.platforms || []).join(", ") || "인스타그램"}
- 목표: ${s.goal || "체험단 협찬 받기 → 광고 수익까지"}
- 수준: ${s.level || "완전 초보"} — 마케팅 용어는 쓰되 반드시 쉬운 말로 한 줄 풀이를 붙일 것`;
}

/* ==================================================
   직원 스킬 시스템 — 오픈소스 PM 방법론 이식
   출처: github.com/phuryn/pm-skills, github.com/garrytan/gstack, github.com/coreyhaines31/marketingskills (모두 MIT)
   ================================================== */
const SKILLS = {
  positioning: {
    name: "포지셔닝 설계", src: "pm-skills",
    method: `[스킬: 포지셔닝 설계 — 3단계]
① 경쟁 환경: 비슷한 계정/브랜드 5곳의 포지셔닝 각도·타깃·차별점·미충족 니즈 파악
② 차별화 브레인스토밍: 경쟁과 겹치지 않는 포지셔닝 5안 생성
③ 선언문 작성: 각 안마다 "유일하게 [카테고리]에서 [타깃]이 [이득]을 얻게 하는 ○○" 한 문장 + 전략 근거 + 보조 메시지. 미충족 시장 공백을 노릴 것.`
  },
  personas: {
    name: "타깃 페르소나", src: "pm-skills",
    method: `[스킬: 타깃 페르소나 — 5단계·5필드]
단계: 자료 수집→패턴 인식→동기 기준 그룹화→프로필 통합→데이터 교차검증.
각 페르소나 필드: ①인구통계+이름 ②핵심 목표(JTBD: 무엇을 해내려 하는가) ③통증점 3개 ④기대 이득 3개 ⑤예상 밖 인사이트. 페르소나 3인은 서로 겹치지 않게, 근거 없는 가정 금지.`
  },
  competitor: {
    name: "경쟁 분석", src: "pm-skills",
    method: `[스킬: 경쟁 분석 — 4단계]
①시장 정의 ②경쟁 5곳 식별 ③정보 수집(포지셔닝·콘텐츠·수익모델) ④차별화 도출.
분석 체크: 강점/약점/비즈니스모델/위협도. 핵심 산출물: "경쟁이 해결 못 하는 고객 니즈" 식별 → 포지셔닝 추천.`
  },
  marketingIdeas: {
    name: "마케팅 아이디어", src: "pm-skills",
    method: `[스킬: 마케팅 아이디어 — 4요소 프레임]
아이디어 5안, 각각: ①채널 ②핵심 메시지 ③효과 근거(왜 타깃이 반응하는가) ④비용 효율(적은 자원으로 임팩트). 창의성과 비용 효율의 균형이 기준.`
  },
  northStar: {
    name: "북극성 지표", src: "pm-skills",
    method: `[스킬: 북극성 지표 — 3단계]
①게임 분류: Attention(체류)/Transaction(거래)/Productivity(효율) — SNS 계정은 Attention 게임
②북극성 1개 선정 (7기준: 전원 이해·고객가치·지속습관·비전정렬·정량측정·직접영향·선행지표) — 팔로워 수보다 "주간 저장수" 같은 가치 지표 우선
③인풋 지표 3~5개: 단기 개선 가능 + 북극성에 직결.`
  },
  socialContent: {
    name: "소셜 콘텐츠 전략", src: "marketingskills",
    method: `[스킬: 소셜 콘텐츠 전략]
① 콘텐츠 기둥 3~5개 설정 (예: 꿀팁 30%·비포애프터 25%·일상공감 20%·자료기반 15%·소통 10%)
② 원자화: 긴 콘텐츠 1개 → 플랫폼별 5~10개 조각으로 (각 조각은 맥락 없이도 독립 작동)
③ 후킹 4유형: 호기심("통념은 틀렸다") / 스토리("지난주 예상 밖의 일이") / 가치("이렇게 하되 흔한 실수는 피해") / 반전("인기 있는 조언이 잘못된 이유")
④ 영상 구조: 0-3초 후킹(결과 먼저)→3-8초 개요→단계 설명(5~8초당 1개)→CTA. 무음 시청 대비 자막 필수
⑤ 주간 리뷰: 상위 3개 원인 분석 / 하위 3개 학습 / 다음 주 배치 조정. 외부 링크 남발 금지(도달 하락)`
  },
  marketingPsych: {
    name: "마케팅 심리학", src: "marketingskills",
    method: `[스킬: 마케팅 심리학 — 진단→개입→검증]
진단: 반응 없음→선택지 과다(줄이기)/신뢰 부족→사회적 증거(실제 후기·숫자)/행동 안 함→진입장벽(첫걸음을 극단적으로 작게)
개입 원칙: 타깃이 이미 믿는 것에 메시지를 정렬 / 손실 프레이밍("모르면 손해")이 이득 프레이밍보다 강함 / 선택지는 3개 이내
출력 형식: 【문제】【원인(심리 모델)】【개입】【측정】【윤리체크】
윤리 필수: 거짓 희소성·과장 후기 금지 — 진짜 제약과 진짜 데이터만. 심리학은 좋은 콘텐츠를 더 쉽게 발견되게 할 뿐.`
  },
  gstackFlow: {
    name: "에이전트 워크플로", src: "gstack",
    method: `[스킬: 에이전트 워크플로 — Plan→Build→Review→QA→Ship→Retro]
각 단계 산출물이 다음 단계의 입력. Review는 역할별 관점(전략가/실무/품질)으로 나눠 볼 것.
QA 게이트: 지시 충족? 바로 사용 가능? 빠진 필수 요소? Ship 후에는 Retro(회고): 잘된 것/안 된 것/다음에 바꿀 것 3가지.`
  }
};

const STAFF_SKILLS = {
  pm: ["gstackFlow", "northStar"],
  planner: ["marketingIdeas", "northStar", "socialContent"],
  copywriter: ["positioning", "marketingIdeas", "marketingPsych"],
  reels: ["marketingIdeas", "socialContent"],
  analyst: ["competitor", "personas"],
  review: ["personas", "marketingPsych"],
  brand: ["positioning", "personas", "marketingPsych"],
  emoti: ["competitor", "positioning"],
  digest: ["gstackFlow"]
};

function skillNames(id) {
  return (STAFF_SKILLS[id] || []).map(k => SKILLS[k].name);
}

function skillBlock(id) {
  const keys = STAFF_SKILLS[id] || [];
  if (!keys.length) return "";
  return `\n\n[보유 스킬 — 검증된 PM 방법론 (오픈소스 pm-skills·gstack에서 이식). 업무에 반드시 적용할 것]\n` +
    keys.map(k => SKILLS[k].method).join("\n\n");
}

/* 직원 최종 프롬프트 = 기본 지시서 + 스킬 */
function staffPrompt(st) {
  return st.prompt() + skillBlock(st.id);
}

function staffEnding() {
  const name = (settings && settings.name) || "사장님";
  return `[시작 인사]
준비됐으면 "출근했습니다, ${name}님! 🙌" 하고 인사한 뒤, 일을 시작하는 데 꼭 필요한 질문만 최대 3개 해줘. 한꺼번에 많이 묻지 말 것.`;
}

const BASE_STAFF = [
  {
    id: "planner", emoji: "📋", name: "콘텐츠 기획자", role: "무엇을 올릴지 정해주는 직원",
    tasks: ["이번 주 콘텐츠 캘린더 짜줘", "다음 달 콘텐츠 아이디어 20개 뽑아줘", "이 아이디어 중에 뭐가 제일 통할까?"],
    prompt: () => `지금부터 너는 나의 'SNS 콘텐츠 기획자' 직원이야. 너는 10년차 SNS 콘텐츠 전략가고, 나는 마케팅을 전혀 모르는 초보 사장이야.

${staffContext()}

[담당 업무]
- 주간/월간 콘텐츠 캘린더 기획
- 내 계정 주제에 맞는 콘텐츠 아이디어 발굴
- 게시물마다 목적 설계: 새 사람에게 퍼질 글(도달용) / 팔로우를 부르는 글(전환용) / 저장하고 싶은 글(신뢰용)을 섞어서

[업무 규칙]
1. 캘린더는 반드시 표로: 요일 | 주제 | 형식(릴스/카드뉴스/사진) | 목적 | 예상 제작시간
2. 하루 1시간 안에 만들 수 있는 현실적인 계획만 짤 것
3. 아이디어마다 "왜 이게 통하는지" 한 줄 이유를 붙일 것
4. 내가 피드백하면 그 기준을 기억하고 다음 기획에 반영할 것
5. 계획만 주지 말고, 이번 주에 가장 먼저 만들 1개를 콕 집어줄 것

${staffEnding()}`
  },
  {
    id: "copywriter", emoji: "✍️", name: "카피라이터", role: "캡션·해시태그·문구 담당 직원",
    get tasks() { return ["이 사진 캡션 5개 뽑아줘: (사진 설명)", `${topicWord()} 계정용 해시태그 세트 만들어줘`, "프로필 소개글 3버전 써줘"]; },
    prompt: () => `지금부터 너는 나의 'SNS 카피라이터' 직원이야. 한국 인스타·블로그 감성의 자연스러운 문장을 쓰는 전문가고, 번역투는 절대 쓰지 않아.

${staffContext()}

[담당 업무]
- 게시물 캡션, 릴스 제목, 프로필 소개글, 해시태그 세트 작성
- 내가 사진/상황을 설명하면 바로 복사해서 쓸 수 있는 완성 문구로

[업무 규칙]
1. 항상 여러 버전을 라벨 붙여 제시: [감성] [정보형] [유머] [저장유도] 등
2. 캡션 구조: 첫 줄은 스크롤을 멈추게 하는 후킹 → 본문 → 마지막에 댓글/저장을 부르는 한마디
3. 해시태그는 대형(게시물 수십만 개)+중형+소형(니치)을 섞은 세트로 주고, 왜 섞는지 한 줄 설명
4. 이모지는 과하지 않게, 실제 한국 SNS 계정 톤으로
5. 내가 좋다고 한 버전의 말투를 기억해서 점점 내 계정만의 목소리를 만들 것

${staffEnding()}`
  },
  {
    id: "reels", emoji: "🎬", name: "릴스 PD", role: "짧은 영상 대본·촬영 지시 직원",
    tasks: ["주방 정리 릴스 대본 써줘", "첫 3초 후킹 아이디어 5개", "이 대본 더 짧게 다듬어줘"],
    prompt: () => `지금부터 너는 나의 '릴스 PD' 직원이야. 초보자가 휴대폰 하나로 찍을 수 있는 짧은 영상(릴스/쇼츠)을 기획하는 전문 PD야.

${staffContext()}

[담당 업무]
- 15~30초 릴스 대본 작성 (장면 단위)
- 첫 3초 후킹(시선을 붙잡는 시작) 설계
- 촬영·편집을 모르는 사람을 위한 구체적 촬영 지시

[업무 규칙]
1. 대본은 반드시 표로: 초 | 화면에 보이는 것 | 자막/멘트 | 촬영 팁
2. 첫 3초 후킹은 항상 3가지 안을 제시 (질문형/반전형/결과먼저형)
3. 촬영 팁은 "폰을 어디에 두고, 어떤 각도로" 수준까지 구체적으로
4. 배경음악 스타일과 자막 넣는 타이밍도 알려줄 것
5. 편집 없이 한 컷으로 가능한 버전도 함께 제안할 것 (초보 배려)

${staffEnding()}`
  },
  {
    id: "analyst", emoji: "🔍", name: "벤치마킹 분석가", role: "잘되는 계정을 분석해주는 직원",
    tasks: ["(잘나가는 게시물 내용 붙여넣고) 왜 잘됐는지 분석해줘", "이 계정에서 따라할 점 알려줘", "내 게시물과 비교해줘"],
    prompt: () => `지금부터 너는 나의 '벤치마킹 분석가' 직원이야. 잘되는 SNS 계정과 게시물을 분해해서 "따라할 수 있는 공식"으로 바꿔주는 분석 전문가야.

${staffContext()}

[담당 업무]
- 내가 잘나가는 계정/게시물의 내용을 설명하거나 붙여넣으면 분석
- 무엇이 통했는지, 내 계정에 어떻게 적용할지 도출

[업무 규칙]
1. 분석 형식: ① 이 게시물이 통한 이유 3가지 → ② 따라해도 되는 것 → ③ 따라하면 안 되는 것(그 계정이라서 되는 것) → ④ 내 계정 적용 액션 3개
1-2. 자료가 없어도 스스로 리서치: 이 주제에서 잘 되는 계정의 유형·후킹 패턴·업로드 리듬을 아는 대로 정리하고, 사장이 직접 확인할 체크리스트(검색 키워드, 볼 지표: 팔로워 대비 좋아요·저장 추정·댓글 톤)를 함께 제공할 것
2. 저장·댓글·팔로우 중 이 게시물이 무엇을 노렸는지 짚어줄 것
3. "느낌이 좋다" 같은 두루뭉술한 분석 금지. 구조·첫 문장·형식 단위로 구체적으로
4. 분석이 끝나면 내가 이번 주에 만들 수 있는 벤치마킹 콘텐츠 1개를 기획해줄 것

${staffEnding()}`
  },
  {
    id: "review", emoji: "📝", name: "체험단 매니저", role: "체험단 지원·리뷰 담당 직원",
    tasks: ["체험단 지원 소개문구 써줘", "선정 잘 되는 팁 알려줘", "이 제품 리뷰 콘텐츠 구성해줘"],
    prompt: () => `지금부터 너는 나의 '체험단 매니저' 직원이야. 한국 체험단 플랫폼(레뷰, 리뷰노트, 미블, 디너의여왕, 스토리앤미디어 등)의 생리를 잘 아는 협찬 전문 매니저야.

${staffContext()}

[담당 업무]
- 체험단 지원용 계정 소개 문구 작성 (담당자가 뽑고 싶어지게)
- 선정 확률을 높이는 전략 조언
- 선정된 제품의 리뷰 콘텐츠 기획 (가이드라인 지키면서 광고 티 안 나게)

[업무 규칙]
1. 지원 문구는 담당자 입장에서: 계정 주제의 명확함, 사진 퀄리티, 성실함이 보이게
2. 리뷰 콘텐츠는 "내돈내산 느낌의 진정성"과 "광고주 가이드라인 충족"을 모두 잡는 구성으로
3. 협찬 표기(#광고 #협찬)는 반드시 지키도록 안내할 것 — 이건 법이야
4. 팔로워가 적을 때는 어떤 카테고리부터 지원해야 선정이 잘 되는지 알려줄 것
5. 리뷰가 끝나면 그 콘텐츠를 내 계정 성장에도 활용하는 방법까지 제안할 것

${staffEnding()}`
  },
  {
    id: "brand", emoji: "🧭", name: "프로필 컨설턴트", role: "계정 컨셉·프로필 담당 직원",
    tasks: ["계정 컨셉 잡아줘", "닉네임 후보 10개 뽑아줘", "프로필 소개 3줄 써줘"],
    prompt: () => `지금부터 너는 나의 '프로필 컨설턴트' 직원이야. 처음 계정을 만드는 사람의 컨셉과 프로필을 잡아주는 브랜딩 전문가야.

${staffContext()}

[담당 업무]
- 계정 컨셉을 한 문장으로 정리 (누가·무엇을·어떤 매력으로)
- 검색에 잘 걸리는 닉네임 후보 제안
- 프로필 소개글, 하이라이트(인스타) 구성 설계

[업무 규칙]
1. 컨셉을 잡을 때는 먼저 나에게 3가지를 물어볼 것: 내가 좋아하는 것, 남보다 조금이라도 잘하는 것, 매일 찍을 수 있는 공간/장면
2. 닉네임은 10개: 주제 키워드가 들어가 검색되는 것 5개 + 개성 있는 것 5개, 각각 한 줄 이유
3. 프로필 소개는 3줄 공식: 누구인지 / 뭘 올리는지 / 팔로우하면 뭐가 좋은지 — 3버전 제시
4. "이 프로필을 처음 본 사람이 3초 안에 팔로우할 이유"가 있는지 항상 검증할 것

${staffEnding()}`
  },
  {
    id: "digest", emoji: "📖", name: "강의 소화 코치", role: "산 강의를 100% 써먹게 하는 직원",
    tasks: ["(강의 노트 붙여넣고) 실행 체크리스트로 바꿔줘", "이 강의에서 지금 나한테 필요한 것만 뽑아줘", "모르는 용어 풀어줘"],
    prompt: () => `지금부터 너는 나의 '강의 소화 코치' 직원이야. 내가 돈 주고 산 강의와 전자책을 "듣고 끝"이 아니라 100% 실행하게 만드는 게 너의 일이야.

${staffContext()}

[담당 업무]
- 내가 강의 노트나 전자책 내용을 붙여넣으면 소화시켜주기
- 이론을 내 계정에 바로 적용할 실행 단계로 변환

[업무 규칙]
1. 자료를 받으면 이 형식으로 정리: ① 핵심만 5줄 요약 → ② 내 계정에 오늘 적용할 것 3가지(구체적 행동으로) → ③ 지금 단계에선 무시해도 되는 것 → ④ 어려운 용어 사전(쉬운 말 풀이)
2. 강의 내용이 내 상황(초보, 체험단 목표)과 안 맞으면 솔직하게 "이건 나중에"라고 말할 것
3. 여러 강의 내용이 쌓이면 서로 연결해서 하나의 실행 순서로 정리해줄 것
4. 실행 항목은 반드시 "30분 안에 끝나는 크기"로 쪼갤 것

[중요] 첫 메시지에서 나에게 강의 노트를 붙여넣어 달라고 요청해줘. 길면 나눠서 보내도 된다고 알려줄 것.

${staffEnding()}`
  },
  {
    id: "emoti", emoji: "🧸", name: "이모티콘 기획자", role: "이모티콘 시장 분석·기획 담당 직원",
    tasks: ["카카오 이모티콘 시장 분석해줘", "우리 캐릭터 컨셉 기획안 만들어줘", "라인·OGQ 플랫폼별 기획안 짜줘"],
    prompt: () => `지금부터 너는 나의 '이모티콘 기획자' 직원이야. 카카오톡·라인·OGQ(네이버)·밴드 이모티콘 시장을 분석하고 승인율 높은 기획안을 만드는 전문가야.

${staffContext()}

[담당 업무]
- 이모티콘 시장 트렌드 분석: 인기 캐릭터의 공통 패턴(귀여움+헐렁한 말투 / B급 드립 / 공감형), 많이 쓰이는 감정 슬롯
- 틈새(니치) 기회 발굴: 주제 특화·상황 특화·말투 특화 등 경쟁이 덜한 영역
- 캐릭터 컨셉 + 구성표 기획: 플랫폼 규격(카카오 멈춰있는 32종 등)에 맞는 감정 슬롯 배치
- 승인 심사 대비: 반려 잦은 포인트(저작권, 텍스트 과다, 시인성) 점검

[업무 규칙]
1. 기획안 순서: 시장 분석 → 틈새 기회 → 캐릭터 컨셉(2안) → 감정 슬롯 구성표 → 차별점 → 제작 준비물 → 심사 팁
2. 구성표는 표로: 번호 | 감정/상황 | 동작 설명 | 문구
3. 순위·수치는 "일반적 경향"임을 밝히고, 최신 확인은 이모티콘샵 인기 탭을 보라고 안내할 것
4. 제작으로 이어지게: 이 앱의 스튜디오 탭(이모티콘 스튜디오)에서 규격에 맞춰 만들 수 있다고 연결할 것

${staffEnding()}`
  },
  // ── 일반 직원(팀원) — 팀장 밑에서 실무를 맡고, 팀장에게 보고 ──
  {
    id: "jr-editor", emoji: "🧑‍💻", name: "콘텐츠 에디터", role: "콘텐츠 마케팅부 팀원 — 게시물 정리·자막·편집표",
    tasks: ["게시물 초안 정리해줘", "릴스 자막 다듬어줘", "카드뉴스 텍스트 배치해줘"],
    prompt: () => juniorPrompt("콘텐츠 에디터", "콘텐츠 마케팅부", "콘텐츠 기획자(팀장)", "게시물 초안 정리, 릴스 자막·컷 편집표 작성, 카드뉴스 텍스트 배치")
  },
  {
    id: "jr-research", emoji: "🔎", name: "리서치 어시스턴트", role: "성장 전략부 팀원 — 자료 수집·경쟁 계정 리스트업",
    tasks: ["경쟁 계정 10곳 리스트업해줘", "이번 주 저장 잘 된 게시물 모아줘"],
    prompt: () => juniorPrompt("리서치 어시스턴트", "성장 전략부", "벤치마킹 분석가(팀장)", "경쟁 계정·인기 게시물 수집과 표 정리, 분석가가 볼 수 있게 근거 자료 준비")
  },
  {
    id: "jr-edu", emoji: "📔", name: "교육 도우미", role: "내부 교육부 팀원 — 자료 요약·용어 정리",
    tasks: ["이 강의 자료 3줄 요약해줘", "어려운 마케팅 용어 쉽게 풀어줘"],
    prompt: () => juniorPrompt("교육 도우미", "내부 교육부", "강의 소화 코치(팀장)", "학습 자료 요약, 용어 쉬운 말 풀이, 코치가 쓸 교육 카드 초안 준비")
  },
  {
    id: "jr-shorts", emoji: "🎞️", name: "숏폼 편집자", role: "콘텐츠 마케팅부 팀원 — 숏폼 컷 편집·자막 실무",
    tasks: ["이 영상 컷 편집표 만들어줘", "숏폼 자막 타이밍 잡아줘"],
    prompt: () => juniorPrompt("숏폼 편집자", "콘텐츠 마케팅부", "콘텐츠 기획자(팀장)", "릴스/숏폼 컷 편집표 작성, 자막 타이밍·후킹 컷 배치, 릴스 PD 지시 반영")
  },
  {
    id: "jr-data", emoji: "📊", name: "데이터 분석원", role: "성장 전략부 팀원 — 인사이트 수치 정리·성과 리포트",
    tasks: ["이번 주 인사이트 수치 정리해줘", "게시물별 저장수 표로 만들어줘"],
    prompt: () => juniorPrompt("데이터 분석원", "성장 전략부", "벤치마킹 분석가(팀장)", "인사이트 수치 정리, 게시물 성과 표·주간 리포트 작성, 분석가가 해석할 근거 데이터 준비")
  },
  {
    id: "jr-design", emoji: "🖌️", name: "디자인 어시스턴트", role: "크리에이티브 스튜디오부 팀원 — 시안·썸네일 비주얼",
    tasks: ["썸네일 문구·구도 시안 뽑아줘", "이모티콘 시안 배치안 잡아줘"],
    prompt: () => juniorPrompt("디자인 어시스턴트", "크리에이티브 스튜디오부", "이모티콘 기획자(팀장)", "썸네일·시안 구도와 문구 배치안, 이모티콘 시안 레이아웃 초안, 기획자 지시 반영")
  },
  {
    id: "jr-goods", emoji: "🧷", name: "굿즈 기획자", role: "크리에이티브 스튜디오부 팀원 — 굿즈·MD 상품 기획",
    tasks: ["우리 캐릭터로 만들 굿즈 3종 제안해줘", "스티커 상품 구성안 짜줘"],
    prompt: () => juniorPrompt("굿즈 기획자", "크리에이티브 스튜디오부", "이모티콘 기획자(팀장)", "캐릭터 기반 굿즈·MD 상품 아이디어와 구성안, 제작 준비물 리스트, 기획자 검토용 초안")
  },
  {
    id: "jr-onboard", emoji: "🧑‍🏫", name: "온보딩 담당", role: "내부 교육부 팀원 — 신입 온보딩·사내 가이드",
    tasks: ["신입 직원 온보딩 체크리스트 만들어줘", "우리 팀 업무 가이드 정리해줘"],
    prompt: () => juniorPrompt("온보딩 담당", "내부 교육부", "강의 소화 코치(팀장)", "신규 직원 온보딩 체크리스트, 팀 업무 가이드·용어집 정리, 코치가 배포할 교육 문서 초안")
  },
  {
    id: "jr-partner", emoji: "🤝", name: "제휴 코디네이터", role: "수익화·제휴부 팀원 — 협찬 문의·단가·제휴 관리",
    tasks: ["협찬 제안 DM 답장 템플릿 만들어줘", "광고 단가표 초안 잡아줘"],
    prompt: () => juniorPrompt("제휴 코디네이터", "수익화·제휴부", "체험단 매니저(팀장)", "협찬·제휴 문의 응대 템플릿, 광고 단가표·제안서 초안, 제휴 진행 상황 정리, 팀장 검토용 문서 준비")
  }
];

/* ---------- 커스텀 직원 (채용) ---------- */
let customStaff = store.get("customStaff", []);

const LOOK_PALETTE = [
  { shirt: "#d35400", hair: "#241d18" }, { shirt: "#27ae60", hair: "#4a3625" },
  { shirt: "#f1c40f", hair: "#2a2118" }, { shirt: "#34495e", hair: "#3b2d23" },
  { shirt: "#1abc9c", hair: "#553a24" }, { shirt: "#9b59b6", hair: "#241d18" }
];
const MAX_STAFF = 20; // 부서 사무공간 책상 한계 (기본 17 + 채용 3, 채용은 콘텐츠 제작부 배치)

/* 일반 직원(팀원) 지시서 — 팀장 밑에서 실무를 맡고 팀장에게 보고하는 톤 */
function juniorPrompt(name, dept, boss, duty) {
  return `지금부터 너는 나의 '${name}' 직원이야. ${dept} 소속 팀원이고, 직속 상사는 ${boss}야.

${staffContext()}

[담당 업무]
${duty}

[업무 규칙]
1. 팀장의 지시를 정확히 반영하고, 결과물은 바로 쓸 수 있는 완성된 형태로 만들 것
2. 내가 판단하기 애매한 부분은 "팀장 확인 필요" 표시를 남길 것
3. 전문 용어는 쓰되 즉시 쉬운 말로 풀어줄 것
4. 팀장이 보완을 지시하면 그 기준을 기억하고 다음 결과물에 반영할 것

${staffEnding()}`;
}

function customPrompt(c) {
  return `지금부터 너는 나의 '${c.name}' 직원이야. 역할: ${c.role}

${staffContext()}

[담당 업무]
${c.duty}

[업무 규칙]
1. 결과물은 바로 복사해서 쓸 수 있는 완성된 형태로 만들 것
2. 여러 안이 가능하면 2~3가지 버전을 라벨 붙여 제시할 것
3. 전문 용어는 쓰되 즉시 쉬운 말로 풀어줄 것
4. 내가 피드백하면 기억하고 다음 결과물에 반영할 것

${staffEnding()}`;
}

/* STAFF·사무실 배치·배정 규칙을 전부 데이터에서 자동 생성 — 직원을 채용/해고하면 바로 반영됨 */
let STAFF = [];
let OFFICE_AGENTS = [];
let DESK_POS = {};
let WORK_POS = {};
let SEATS = [];
let ROUTES = [];

const BASE_ROUTES = [
  [/릴스|영상|쇼츠|대본|촬영/, "reels"],
  [/캡션|해시태그|카피|문구|제목/, "copywriter"],
  [/컨셉|닉네임|프로필|브랜딩|소개글/, "brand"],
  [/벤치마킹|분석|경쟁|참고계정/, "analyst"],
  [/체험단|협찬|리뷰|지원서/, "review"],
  [/이모티콘|스티커|캐릭터/, "emoti"],
  [/강의|전자책|노트|요약|공부/, "digest"],
  [/기획|캘린더|아이디어|계획|전략/, "planner"]
];

function seatRing(n) {
  // 회의 테이블(중심 76.5, 24) 주변에 n개 좌석을 타원으로 배치
  const cx = 76.5, cy = 25, rx = 14.5, ry = 15;
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return out;
}

/* ---------- 조직 구조: 대표 → 과장(pm) → 부서 팀장 → 일반 직원 ----------
   각 부서는 사무실에서 별도 사무공간(room)을 가진다. 채용 직원은 콘텐츠 마케팅부 소속. */
const TEAMS = [
  { id: "content", name: "콘텐츠 제작부", icon: "🎬", lead: "planner",
    members: ["planner", "copywriter", "reels", "jr-editor", "jr-shorts"],
    room: { x: 1.5, y: 19, w: 25, h: 25 } },
  { id: "growth", name: "성장 분석부", icon: "📈", lead: "analyst",
    members: ["analyst", "brand", "jr-research", "jr-data"],
    room: { x: 28, y: 19, w: 25, h: 25 } },
  { id: "revenue", name: "수익화·제휴부", icon: "💰", lead: "review",
    members: ["review", "jr-partner"],
    room: { x: 1.5, y: 46, w: 25, h: 21 } },
  { id: "creative", name: "크리에이티브 스튜디오부", icon: "🎨", lead: "emoti",
    members: ["emoti", "jr-design", "jr-goods"],
    room: { x: 28, y: 46, w: 25, h: 21 } },
  { id: "education", name: "내부 교육부", icon: "📚", lead: "digest",
    members: ["digest", "jr-edu", "jr-onboard"],
    room: { x: 1.5, y: 69, w: 51.5, h: 22 } },
];
function teamOf(staffId) {
  return TEAMS.find(t => t.members.includes(staffId)) || TEAMS[0]; // 채용 직원은 콘텐츠 마케팅부 소속
}
function isTeamLead(staffId) { return TEAMS.some(t => t.lead === staffId); }
function teamLeadFor(staffId) {
  return STAFF.find(s => s.id === teamOf(staffId).lead) || STAFF[0];
}
/* 직급별 모델: 팀원(staff)=하위 모델로 토큰 절약, 팀장(lead)·과장(manager)=상위 모델 */
function tierModel(tier) {
  const top = (settings && settings.model) || "claude-sonnet-5";
  if (tier === "staff") return (settings && settings.staffModel) || "claude-haiku-4-5-20251001";
  return top;
}

function rebuildStaff() {
  STAFF = [
    ...BASE_STAFF,
    ...customStaff.map(c => ({
      id: c.id, emoji: c.emoji, name: c.name, role: c.role,
      custom: true,
      tasks: [c.duty.split(/[.\n]/)[0] || "업무를 시켜보세요"],
      prompt: () => customPrompt(c)
    }))
  ];

  OFFICE_AGENTS = [
    { id: "boss", emoji: "👑", name: "사장님" },
    { id: "pm", emoji: "🧑‍💼", name: "매니저" },
    ...STAFF.map(s => ({ id: s.id, emoji: s.emoji, name: s.name }))
  ];

  // 책상 자동 배치: 대표실 / 과장실 / 부서별 사무공간
  DESK_POS = { boss: [10.5, 8], pm: [28.5, 8] };
  WORK_POS = { boss: [10.5, 13], pm: [28.5, 13] };
  TEAMS.forEach(team => {
    const room = team.room;
    const memberIds = STAFF.filter(s => teamOf(s.id).id === team.id).map(s => s.id)
      .sort((a, b) => (b === team.lead ? 1 : 0) - (a === team.lead ? 1 : 0)); // 팀장 먼저
    const n = memberIds.length;
    // 3명 이하는 1줄(한 줄에 다), 4명 이상은 2줄, 넓은 방은 최대 5열
    let cols;
    if (room.w >= 40) cols = Math.min(n, 5);
    else if (n <= 3) cols = n;
    else cols = Math.ceil(n / 2);
    if (room.w < 15) cols = 1;
    const cellW = room.w / cols;
    memberIds.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const dx = room.x + cellW * col + cellW / 2 - 2;
      const dy = room.y + 8 + row * 11;
      DESK_POS[id] = [dx, dy];
      WORK_POS[id] = [dx, dy + 6.5];
    });
  });

  SEATS = seatRing(OFFICE_AGENTS.length);

  // 배정 규칙: 커스텀 직원 키워드 우선 → 일반 직원(팀원) 키워드 → 팀장·전문직 키워드
  ROUTES = [
    ...customStaff
      .filter(c => c.keywords && c.keywords.length)
      .map(c => [new RegExp(c.keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")), c.id]),
    [/에디터|자막|편집표/, "jr-editor"],
    [/숏폼|컷 편집|컷편집/, "jr-shorts"],
    [/리서치|자료 수집|리스트업/, "jr-research"],
    [/인사이트|성과 리포트|성과표|수치 정리/, "jr-data"],
    [/시안|썸네일 디자인|배치안/, "jr-design"],
    [/굿즈|MD 상품|스티커 상품/, "jr-goods"],
    [/온보딩|신입|사내 가이드|업무 가이드/, "jr-onboard"],
    [/요약|용어 정리|용어풀이/, "jr-edu"],
    [/제휴|협찬 문의|단가표|광고 단가|제안서/, "jr-partner"],
    ...BASE_ROUTES
  ];
}
rebuildStaff();

function getLook(id) {
  const AGENT_LOOK_BASE = {
    boss: { shirt: "#3d3d4d", hair: "#2a2118", crown: true },
    pm: { shirt: "#5b6ee1", hair: "#3b2d23" },
    planner: { shirt: "#e67e22", hair: "#4a3625" },
    copywriter: { shirt: "#e75480", hair: "#241d18" },
    reels: { shirt: "#8e44ad", hair: "#3b2d23" },
    analyst: { shirt: "#16a085", hair: "#553a24" },
    review: { shirt: "#c0392b", hair: "#2a2118" },
    brand: { shirt: "#2980b9", hair: "#4a3625" },
    digest: { shirt: "#7f8c8d", hair: "#241d18" },
    emoti: { shirt: "#f5b942", hair: "#3b2d23" },
    "jr-editor": { shirt: "#6c8ebf", hair: "#3b2d23" },
    "jr-research": { shirt: "#5aa06f", hair: "#4a3625" },
    "jr-edu": { shirt: "#b58bce", hair: "#241d18" },
    "jr-shorts": { shirt: "#a0559b", hair: "#3b2d23" },
    "jr-data": { shirt: "#4a90a4", hair: "#4a3625" },
    "jr-design": { shirt: "#d98cae", hair: "#241d18" },
    "jr-goods": { shirt: "#c99a5b", hair: "#3b2d23" },
    "jr-onboard": { shirt: "#7d9b76", hair: "#4a3625" },
    "jr-partner": { shirt: "#3f8a8a", hair: "#241d18" }
  };
  if (AGENT_LOOK_BASE[id]) return AGENT_LOOK_BASE[id];
  const c = customStaff.find(x => x.id === id);
  return (c && c.look) || LOOK_PALETTE[0];
}

/* ---------- 성장 로드맵 (주제 맞춤 · 체험단/수익화 기준) ---------- */
let ROADMAP = [];
function buildRoadmap() {
  const t = ((settings && settings.topic) || "리빙").split(/[\s(·,]/)[0] || "리빙";
  return roadmapTemplate(t);
}
function roadmapTemplate(t) {
  return [
  {
    id: "s1", title: "1단계 · 계정 기초 세팅",
    tip: "프로필은 가게의 간판이에요. 사람들이 3초 안에 '이 계정 뭐 하는 곳인지' 알 수 있어야 팔로우합니다.",
    steps: [
      `계정 컨셉 한 문장으로 정하기 (예: 초보의 진짜 ${t} 기록)`,
      `검색되기 쉬운 닉네임 정하기 (주제 키워드 포함, 예: ○○${t})`,
      "프로필 사진 정하기 (밝고 통일감 있는 이미지 1장)",
      "프로필 소개글 3줄 작성 (누구인지 · 무엇을 올리는지 · 팔로우하면 뭐가 좋은지)",
      "프로페셔널(크리에이터) 계정으로 전환하기 — 인사이트(통계) 보려면 필수",
      `벤치마킹할 ${t} 계정 5개 찾아서 팔로우하기`
    ]
  },
  {
    id: "s2", title: "2단계 · 콘텐츠 기반 다지기",
    tip: "체험단 담당자는 계정에 들어와서 '피드 첫 화면'을 봅니다. 첫 9개 게시물이 포트폴리오예요.",
    steps: [
      `내가 꾸준히 만들 수 있는 콘텐츠 유형 2가지 정하기 (예: ${t} 꿀팁 릴스 + 사진)`,
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
      `${t} 관련 카테고리 체험단 5개 지원하기 (떨어져도 계속!)`,
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
}
ROADMAP = buildRoadmap();

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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* 간단한 마크다운 렌더러 (멘토 답변용) */
function renderMarkdown(text) {
  let src = escapeHtml(text);
  const lines = src.split("\n");
  const out = [];
  let inList = null; // "ul" | "ol" | null
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  const splitRow = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const isSep = (l) => /\|/.test(l) && /^[\s:|-]+$/.test(l.trim()) && /-/.test(l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // GitHub 스타일 표: 헤더 | 구분선 | 데이터 행
    if (line.includes("|") && i + 1 < lines.length && isSep(lines[i + 1]) && !isSep(line)) {
      closeList();
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--; // 바깥 루프에서 1 증가하므로 보정
      const th = header.map(c => `<th>${inline(c)}</th>`).join("");
      const trs = rows.map(r => "<tr>" + header.map((_, k) => `<td>${inline(r[k] || "")}</td>`).join("") + "</tr>").join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }
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

function buildSystemPrompt(persona, query = "") {
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

  // 자료 주입: 질문과 관련된 구간을 골라 발췌 + 전 자료 배분·순환 (pickDocRefs — 아래 자료 참조 엔진)
  const refs = typeof pickDocRefs === "function" ? pickDocRefs(query, KNOWLEDGE_CHAR_BUDGET) : [];
  if (refs.length) {
    prompt += `\n\n[참고 자료 — 사용자가 학습시킨 강의/전자책에서, 이번 질문과 관련된 구간 위주로 발췌]\n` +
      refs.map(r => `===== 자료: ${r.title}${r.hit ? " (관련 구간)" : ""} =====\n${r.text}`).join("\n\n");
    const enabledSize = docs.filter(d => d.enabled).reduce((s, d) => s + d.content.length, 0);
    if (enabledSize > KNOWLEDGE_CHAR_BUDGET) prompt += `\n\n(자료가 많아 관련 구간 위주로 발췌했습니다. 다음 질문에는 다른 구간이 순환 참고됩니다.)`;
  }

  return prompt;
}

/* ---------- Claude API 호출 (스트리밍) ---------- */
async function callClaude(personaId, messages, onDelta) {
  const persona = PERSONAS.find(p => p.id === personaId);
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  return aiChat(buildSystemPrompt(persona, lastUser ? String(lastUser.content).slice(0, 500) : ""), messages, onDelta);
}

async function callClaudeSystem(system, messages, onDelta, modelOverride) {
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
      model: modelOverride || (settings && settings.model) || "claude-sonnet-5",
      max_tokens: 4096,
      system,
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
  const model = modelOverride || (settings && settings.model) || "claude-sonnet-5";
  let buffer = "";
  let full = "";
  let inTok = 0, outTok = 0; // 실제 토큰 사용량 (Anthropic 응답에서 수집)

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
        // 토큰 사용량: 시작 이벤트에 입력, delta 이벤트에 누적 출력 토큰
        if (ev.type === "message_start" && ev.message && ev.message.usage) {
          const u = ev.message.usage;
          inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        }
        if (ev.type === "message_delta" && ev.usage && typeof ev.usage.output_tokens === "number") {
          outTok = ev.usage.output_tokens;
        }
        if (ev.type === "error") throw new Error(ev.error?.message || "스트리밍 오류");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  recordUsage(model, inTok, outTok, false);
  return full;
}

/* ---------- 무료 AI (Puter.js) — API 키 없이도 AI 기능 사용 ---------- */
let puterLoading = null;
let freeAiBroken = false;

function loadPuter() {
  if (window.puter && window.puter.ai) return Promise.resolve(window.puter);
  if (puterLoading) return puterLoading;
  puterLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.puter.com/v2/";
    const timer = setTimeout(() => { reject(new Error("무료 AI 연결 시간 초과")); }, 15000);
    s.onload = () => {
      clearTimeout(timer);
      if (window.puter && window.puter.ai) resolve(window.puter);
      else reject(new Error("무료 AI를 초기화하지 못했어요"));
    };
    s.onerror = () => { clearTimeout(timer); reject(new Error("무료 AI 스크립트를 불러오지 못했어요 (인터넷 확인)")); };
    document.head.appendChild(s);
  }).catch(e => { puterLoading = null; freeAiBroken = true; throw e; });
  return puterLoading;
}

function extractPuterText(resp) {
  if (typeof resp === "string") return resp;
  if (!resp) return "";
  const c = resp.message && resp.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(x => x.text || "").join("");
  return resp.text || String(resp);
}

/* AI 호출 통합 경로: ① 내 API 키(Anthropic) → ② 무료 AI(Puter) */
async function aiChat(system, messages, onDelta = () => {}, modelOverride) {
  if ((settings && settings.apiKey || "").trim()) {
    return callClaudeSystem(system, messages, onDelta, modelOverride);
  }
  // 무료 AI 경로는 직급별 모델 구분 없음 (modelOverride 무시)
  if (freeAiBroken) {
    const err = new Error("NO_AI");
    throw err;
  }
  const puter = await loadPuter().catch(() => { const err = new Error("NO_AI"); throw err; });
  const msgs = [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))];
  try {
    const wanted = (settings && settings.freeModel || "").trim();
    let resp;
    if (wanted) {
      try { resp = await puter.ai.chat(msgs, { model: wanted }); }
      catch { resp = await puter.ai.chat(msgs); } // 모델명이 안 맞으면 기본 모델로 재시도
    } else {
      resp = await puter.ai.chat(msgs);
    }
    const text = extractPuterText(resp).trim();
    if (!text) throw new Error("빈 응답");
    onDelta(text);
    // 무료 AI는 토큰 정보를 안 주므로 글자 수로 추정 (비용은 0원)
    const inEst = estTokens(system) + messages.reduce((a, m) => a + estTokens(m.content), 0);
    recordUsage("free", inEst, estTokens(text), true);
    return text;
  } catch (e) {
    const msg = String(e && (e.message || e.error && e.error.message) || e);
    const err = new Error(/auth|login|sign/i.test(msg) ? "FREE_AI_AUTH" : "무료 AI 응답 실패: " + msg.slice(0, 80));
    throw err;
  }
}

function friendlyApiError(e) {
  if (e.message === "NO_AI") return "지금은 무료 AI에 연결할 수 없어요. 인터넷을 확인하고 다시 시도하거나, 설정에서 내 API 키를 연결해주세요. (지시서 복사 → 무료 챗봇 붙여넣기는 항상 작동해요)";
  if (e.message === "FREE_AI_AUTH") return "무료 AI를 쓰려면 뜨는 창에서 Puter 무료 계정으로 로그인 해주세요 (한 번만 하면 돼요). 창이 안 떴다면 팝업 차단을 확인해주세요.";
  if (e.message === "NO_KEY") return "API 키가 아직 없어요. 설정 탭에서 키를 등록해주세요. (발급 방법 안내 버튼이 있어요)";
  if (e.status === 401) return "API 키가 올바르지 않아요. 설정 탭에서 키를 다시 확인해주세요.";
  if (e.status === 400 && /credit/i.test(e.message)) return "Anthropic 계정의 충전 금액(크레딧)이 부족해요. console.anthropic.com의 Billing에서 충전해주세요.";
  if (e.status === 429) return "잠시 요청이 몰렸어요. 30초 후에 다시 시도해주세요.";
  if (e.status === 529) return "AI 서버가 잠시 바빠요. 조금 뒤에 다시 시도해주세요.";
  if (e instanceof TypeError) return "인터넷 연결을 확인해주세요. (네트워크 오류)";
  return "오류가 발생했어요: " + e.message;
}

/* ---------- 토큰 사용량 & 상태바 ---------- */
/* 모델별 100만 토큰당 요금(USD, 대략치) — 실제 청구는 Anthropic 콘솔 기준 */
const MODEL_PRICING = {
  "claude-sonnet-5":            { in: 3,  out: 15, label: "Sonnet 5" },
  "claude-haiku-4-5-20251001":  { in: 1,  out: 5,  label: "Haiku 4.5" },
  "claude-opus-4-8":            { in: 15, out: 75, label: "Opus 4.8" }
};
const USD_TO_KRW = 1400;               // 환율(대략) — 비용은 어디까지나 참고용 추정
const DEFAULT_TOKEN_BUDGET = 1000000;  // 이번 달 토큰 한도 기본값 (100만 토큰)

let usage = store.get("usage", null);

function currentMonth() { return new Date().toISOString().slice(0, 7); } // "2026-07"

/* 이번 달 사용량 객체 보장 — 달이 바뀌면 자동 초기화 */
function ensureUsage() {
  const m = currentMonth();
  if (!usage || usage.month !== m) {
    usage = { month: m, inTok: 0, outTok: 0, req: 0, freeReq: 0, byModel: {} };
    store.set("usage", usage);
  }
  return usage;
}

function tokenBudget() {
  const b = settings && Number(settings.tokenBudget);
  return b && b > 0 ? b : DEFAULT_TOKEN_BUDGET;
}

/* 무료 AI 응답 토큰 추정: 한글은 1자≈1토큰, 그 외는 3.8자≈1토큰 (대략) */
function estTokens(str) {
  if (!str) return 0;
  let cjk = 0;
  for (const ch of str) if (ch.charCodeAt(0) > 0x2e00) cjk++;
  const other = str.length - cjk;
  return Math.max(1, Math.round(cjk * 1.1 + other / 3.8));
}

/* AI 호출 1건의 사용량 기록 */
function recordUsage(model, inTok, outTok, isFree) {
  const u = ensureUsage();
  inTok = Math.max(0, inTok | 0);
  outTok = Math.max(0, outTok | 0);
  u.inTok += inTok;
  u.outTok += outTok;
  u.req += 1;
  if (isFree) u.freeReq += 1;
  const key = model || (isFree ? "free" : "claude-sonnet-5");
  const bm = u.byModel[key] || (u.byModel[key] = { in: 0, out: 0, req: 0, free: !!isFree });
  bm.in += inTok; bm.out += outTok; bm.req += 1;
  store.set("usage", u);
  renderTokenBar();
}

/* 이번 달 예상 비용(원) — 유료(API) 모델만 과금, 무료는 0원 */
function estCostKrw() {
  const u = ensureUsage();
  let usd = 0;
  for (const [model, bm] of Object.entries(u.byModel)) {
    const p = MODEL_PRICING[model];
    if (!p) continue; // 무료 AI 등 요금표에 없는 건 0원
    usd += (bm.in / 1e6) * p.in + (bm.out / 1e6) * p.out;
  }
  return usd * USD_TO_KRW;
}

function fmtNum(n) { return Math.round(n).toLocaleString("ko-KR"); }
function fmtKrw(v) {
  if (v <= 0) return "₩0";
  if (v < 100) return "₩" + v.toFixed(1);
  return "₩" + Math.round(v).toLocaleString("ko-KR");
}

function renderTokenBar() {
  const bar = $("#token-bar");
  if (!bar) return;
  // 앱 화면이 떠 있을 때만 표시 (온보딩 중엔 숨김)
  if ($("#app").classList.contains("hidden")) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");

  const u = ensureUsage();
  const budget = tokenBudget();
  const used = u.inTok + u.outTok;
  const left = Math.max(0, budget - used);
  const pct = budget > 0 ? Math.min(100, used / budget * 100) : 0;
  const krw = estCostKrw();

  $("#tb-used").textContent = fmtNum(used);
  $("#tb-total").textContent = fmtNum(budget);
  $("#tb-left").textContent = fmtNum(left);
  $("#tb-cost").textContent = fmtKrw(krw);

  const fill = $("#tb-fill");
  fill.style.width = pct.toFixed(1) + "%";
  bar.classList.toggle("tb-warn", pct >= 70 && pct < 90);
  bar.classList.toggle("tb-danger", pct >= 90);

  // 상세 패널
  const monthLabel = u.month.replace("-", "년 ") + "월";
  const paidReq = u.req - u.freeReq;
  const modelRows = Object.entries(u.byModel).map(([model, bm]) => {
    const p = MODEL_PRICING[model];
    const name = p ? p.label : (bm.free ? "무료 AI (추정)" : model);
    const cost = p ? (bm.in / 1e6 * p.in + bm.out / 1e6 * p.out) * USD_TO_KRW : 0;
    return `<tr><td>${name}</td><td>${fmtNum(bm.in)}</td><td>${fmtNum(bm.out)}</td><td>${bm.req}회</td><td>${p ? fmtKrw(cost) : "무료"}</td></tr>`;
  }).join("");

  $("#tb-detail-body").innerHTML = `
    <div class="tb-detail-grid">
      <div class="tb-stat"><span>이번 달</span><b>${monthLabel}</b></div>
      <div class="tb-stat"><span>입력 토큰</span><b>${fmtNum(u.inTok)}</b></div>
      <div class="tb-stat"><span>출력 토큰</span><b>${fmtNum(u.outTok)}</b></div>
      <div class="tb-stat"><span>호출 횟수</span><b>${u.req}회 <small>(내 키 ${paidReq} · 무료 ${u.freeReq})</small></b></div>
    </div>
    ${modelRows ? `<table class="tb-table"><thead><tr><th>모델</th><th>입력</th><th>출력</th><th>호출</th><th>예상 비용</th></tr></thead><tbody>${modelRows}</tbody></table>` : `<p class="tb-empty">아직 사용 기록이 없어요. 멘토와 대화하면 여기에 쌓여요.</p>`}
    <div class="tb-budget-row">
      <label>이번 달 토큰 한도
        <input type="number" id="tb-budget-input" min="10000" step="10000" value="${budget}">
      </label>
      <button class="btn-small" id="tb-budget-save">한도 저장</button>
      <button class="btn-small btn-danger-ghost" id="tb-reset">이번 달 사용량 초기화</button>
    </div>
    <p class="tb-note">💡 비용은 <b>참고용 추정치</b>예요 (환율 ₩${USD_TO_KRW.toLocaleString()}/$1 기준, 무료 AI는 0원·글자 수로 토큰 추정). 정확한 청구액은 <a href="https://console.anthropic.com/" target="_blank" rel="noopener">Anthropic 콘솔</a>에서 확인하세요. 사용량은 매달 1일 자동으로 초기화돼요.</p>
  `;

  // 상세 패널 안의 버튼은 매번 새로 그려지므로 여기서 바인딩
  const bsave = $("#tb-budget-save");
  if (bsave) bsave.onclick = () => {
    const v = Number($("#tb-budget-input").value);
    if (!v || v < 10000) { toast("한도는 최소 10,000 토큰 이상으로 정해주세요."); return; }
    settings.tokenBudget = Math.round(v);
    store.set("settings", settings);
    renderTokenBar();
    toast("✅ 이번 달 토큰 한도를 " + fmtNum(v) + "(으)로 정했어요.");
  };
  const breset = $("#tb-reset");
  if (breset) breset.onclick = () => {
    if (!confirm("이번 달 토큰 사용량 기록을 0으로 초기화할까요? (한도 설정은 그대로 유지돼요)")) return;
    usage = { month: currentMonth(), inTok: 0, outTok: 0, req: 0, freeReq: 0, byModel: {} };
    store.set("usage", usage);
    renderTokenBar();
    toast("🧹 이번 달 사용량을 초기화했어요.");
  };
}

function toggleTokenDetail(force) {
  const d = $("#tb-detail");
  const t = $("#tb-toggle");
  const open = force != null ? force : d.classList.contains("hidden");
  d.classList.toggle("hidden", !open);
  t.textContent = open ? "▾ 닫기" : "▴ 자세히";
  if (open) renderTokenBar();
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
    model: "claude-sonnet-5",
    autoPilot: true
  };
  store.set("settings", settings);
  ROADMAP = buildRoadmap(); // 온보딩에서 정한 주제 반영
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
  $("#home-greeting").textContent = `${hi}, ${s.name}님! 👋`;
  $("#home-sub").textContent = `${s.topic} 계정 · 목표: ${s.goal} — 우리의 성과를 한눈에 확인해보세요.`;
  renderHomeStats();
  renderMissions();
  renderRoadmap();
}

/* 홈 대시보드: 진행 중 업무 / 완료 / 예정 일정 (실제 데이터) */
function renderHomeStats() {
  if (!$("#stat-open")) return;
  const weekAgo = Date.now() - 7 * 86400000;
  const open = tasks.filter(t => t.status === "todo" || t.status === "doing").length;
  const review = tasks.filter(t => t.status === "review").length;
  const doneAll = tasks.filter(t => t.status === "done");
  const doneWeek = doneAll.filter(t => (t.doneAt || 0) >= weekAgo).length;
  const today = todayStr();
  const upcoming = events.filter(e => e.date >= today).length;
  const todayCnt = events.filter(e => e.date === today).length;
  $("#stat-open").textContent = open + review;
  $("#stat-open-delta").textContent = review ? `검토 대기 ${review}건` : "";
  $("#stat-done").textContent = doneAll.length;
  $("#stat-done-delta").textContent = doneWeek ? `+${doneWeek} 이번 주` : "";
  $("#stat-events").textContent = upcoming;
  $("#stat-events-delta").textContent = todayCnt ? `오늘 ${todayCnt}건 🗓️` : "";
  // 최근 활동 3건
  const list = $("#home-activity-list");
  if (list) {
    const recent = activity.slice(0, 3);
    list.innerHTML = recent.length
      ? recent.map(a => `<div class="chatline"><span class="chatline-text">${escapeHtml(a.text)}</span><span class="chatline-time">${new Date(a.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span></div>`).join("")
      : `<div class="mission-empty">아직 활동이 없어요. 직원들이 일을 시작하면 여기에 기록돼요!</div>`;
  }
  // 우리 사무실 현황 배지
  const os = $("#home-office-status");
  if (os) {
    const working = tasks.filter(t => t.status === "doing").length;
    os.innerHTML =
      `<span class="chip">👥 직원 ${STAFF.length}명 출근</span>` +
      `<span class="chip">${(settings.autoPilot !== false) ? "🤖 자율 근무 ON" : "💤 자율 근무 OFF"}</span>` +
      `<span class="chip">${working ? `🔨 작업 중 ${working}건` : "☕ 지시 대기 중"}</span>` +
      `<span class="chip">📣 회의실 사용 가능</span>`;
  }
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

  // 탭 상호작용: 미션을 생산성 탭의 할 일로 보내기
  const send = document.createElement("button");
  send.className = "btn-small";
  send.textContent = "➕ 할 일 목록에도 추가";
  send.style.alignSelf = "flex-start";
  send.addEventListener("click", () => {
    let added = 0;
    missions.items.forEach(m => {
      if (!todos.some(t => t.text === m.text)) {
        todos.unshift({ id: Date.now() + "-" + added, text: m.text, due: new Date().toISOString().slice(0, 10), done: m.done });
        added++;
      }
    });
    store.set("todos", todos);
    renderTodos();
    toast(added ? `✅ 할 일에 ${added}개 추가! (생산성 탭)` : "이미 모두 할 일에 있어요.");
  });
  list.appendChild(send);
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
    if (!items.length) throw new Error("EMPTY");
    missions = { date: today, items };
    store.set("missions", missions);
    renderMissions();
    toast("🎯 오늘의 미션이 도착했어요!");
  } catch (e) {
    // AI가 안 되면 로드맵에서 직접 미션 생성 (오프라인 대체)
    const items = templateMissions();
    missions = { date: today, items };
    store.set("missions", missions);
    renderMissions();
    toast("🎯 오늘의 미션 도착! (로드맵 기준 — AI 연결 시 더 맞춤형이 돼요)", 4500);
  } finally {
    btn.disabled = false; btn.textContent = "미션 받기";
  }
}

/* AI 없이도 미션 생성: 로드맵의 다음 미완료 항목 + 검토 대기 업무에서 */
function templateMissions() {
  const items = [];
  const review = tasks.filter(t => t.status === "review").length;
  if (review) items.push({ text: `사무실에서 검토 대기 중인 결과물 ${review}건 승인하기`, done: false });
  for (const stage of ROADMAP) {
    for (let i = 0; i < stage.steps.length; i++) {
      if (items.length >= 3) break;
      if (!roadmapDone[stage.id + ":" + i]) items.push({ text: stage.steps[i], done: false });
    }
    if (items.length >= 3) break;
  }
  while (items.length < 3) items.push({ text: "벤치마킹 계정 1개 살펴보고 메모 남기기", done: false });
  return items.slice(0, 3);
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
        const toTodo = document.createElement("button");
        toTodo.className = "step-ask";
        toTodo.title = "할 일 목록에 추가";
        toTodo.textContent = "➕";
        toTodo.addEventListener("click", () => {
          if (todos.some(t => t.text === step)) { toast("이미 할 일에 있어요!"); return; }
          todos.unshift({ id: Date.now() + "", text: step, due: "", done: false });
          store.set("todos", todos);
          renderTodos();
          toast("✅ 할 일에 추가됐어요! (생산성 탭)");
        });
        row.append(cb, text, ask, toTodo);
        body.appendChild(row);
      });
      el.appendChild(body);
    }
    wrap.appendChild(el);
  });

  const pct = totalSteps ? Math.round(totalDone / totalSteps * 100) : 0;
  $("#roadmap-progress").textContent = `${pct}% 진행 중`;
}

/* ---------- AI 직원 탭 ---------- */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
    catch (e) { reject(e); }
    finally { ta.remove(); }
  });
}

function renderOrgChart() {
  const el = $("#org-chart");
  if (!el) return;
  const bossName = (settings && settings.name) || "사장";
  const memberChip = (id) => {
    const s = STAFF.find(x => x.id === id);
    return s ? `<span class="org-member">${s.emoji} ${escapeHtml(s.name)}</span>` : "";
  };
  const customs = STAFF.filter(s => s.custom).map(s => s.id);
  el.innerHTML = `
    <div class="org-row"><span class="org-node org-boss">👑 ${escapeHtml(bossName)}님 (사장)</span></div>
    <div class="org-line">│</div>
    <div class="org-row"><span class="org-node org-manager">🧑‍💼 매니저 (과장 · 상위 모델) — 전체 회의·최종 보고서</span></div>
    <div class="org-line">│</div>
    <div class="org-teams">${TEAMS.map(t => {
      const lead = STAFF.find(s => s.id === t.lead);
      const members = t.members.filter(id => id !== t.lead).concat(t.id === "content" ? customs : []);
      return `<div class="org-team">
        <div class="org-node org-lead">👔 ${lead ? lead.emoji + " " + escapeHtml(lead.name) : ""} <b>${t.name} 팀장</b> <span class="org-tier">상위 모델</span></div>
        <div class="org-members">${members.map(memberChip).join("")}<span class="org-tier">팀원 · 하위 모델(절약)</span></div>
      </div>`;
    }).join("")}</div>`;
}

function renderStaff() {
  renderOrgChart();
  const list = $("#staff-list");
  list.innerHTML = "";
  STAFF.forEach(st => {
    const card = document.createElement("section");
    card.className = "card staff-card";

    const head = document.createElement("div");
    head.className = "staff-head";
    const sk = skillNames(st.id);
    const leadBadge = isTeamLead(st.id) ? ` <span class="staff-badge staff-lead-badge">👔 ${teamOf(st.id).name} 팀장</span>` : "";
    head.innerHTML = `<span class="staff-emoji">${st.emoji}</span><div><div class="staff-name">${escapeHtml(st.name)}${leadBadge}${st.custom ? ' <span class="staff-badge">직접 채용</span>' : ""}</div><div class="staff-role">${escapeHtml(st.role)}</div>${sk.length ? `<div class="staff-skillbadges">🎓 ${sk.join(" · ")}</div>` : ""}</div>`;
    if (st.custom) {
      const fire = document.createElement("button");
      fire.className = "btn-small btn-task-del staff-fire";
      fire.textContent = "해고";
      fire.addEventListener("click", () => fireStaff(st.id));
      head.appendChild(fire);
    }

    const tasks = document.createElement("div");
    tasks.className = "staff-tasks";
    tasks.innerHTML = `<b>이런 일을 시켜보세요:</b>` + st.tasks.map(t => `<span class="staff-task">"${escapeHtml(t)}"</span>`).join("");

    const details = document.createElement("details");
    details.className = "staff-preview";
    const pre = document.createElement("pre");
    const summary = document.createElement("summary");
    summary.textContent = "업무 지시서 미리보기";
    details.appendChild(summary);
    details.appendChild(pre);
    details.addEventListener("toggle", () => { if (details.open) pre.textContent = staffPrompt(st); });

    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "📋 업무 지시서 복사";
    btn.addEventListener("click", async () => {
      try {
        await copyText(staffPrompt(st));
        btn.textContent = "✅ 복사 완료!";
        setTimeout(() => { btn.textContent = "📋 업무 지시서 복사"; }, 2000);
        toast(`${st.emoji} ${st.name} 지시서 복사됨! 무료 AI 챗봇의 새 대화에 붙여넣으세요.`);
      } catch {
        details.open = true;
        pre.textContent = st.prompt();
        toast("⚠️ 자동 복사가 안 돼요. 미리보기의 글을 길게 눌러 직접 복사해주세요.", 4500);
      }
    });

    card.append(head, tasks, details, btn);
    list.appendChild(card);
  });
}

/* ==================================================
   사무실 — AI 에이전트 오피스 & 업무 보드
   ================================================== */
let tasks = store.get("tasks", []);
let activity = store.get("activity", []);
let meetings = store.get("meetings", []);
let reports = store.get("reports", []); // 보고서함: 모든 기획서·보고서 자동 보관 (검토 대기 도달 시 archiveReport)

// 예전 데이터 마이그레이션: 검증 단계(stage)가 없는 진행 중 업무에 부여
tasks.forEach(t => {
  if (t.status === "doing" && !t.stage) t.stage = t.result ? "verify" : "draft";
});

/* 사무실 구조 (좌표는 % 단위) */
const ROOMS = [
  { id: "ceo", name: "대표실", x: 1.5, y: 2, w: 18, h: 15 },
  { id: "mgr", name: "과장실", x: 21, y: 2, w: 15, h: 15 },
  { id: "meet", name: "회의실", x: 55, y: 2, w: 43.5, h: 44 },
  ...TEAMS.map(t => ({ id: "dept-" + t.id, name: `${t.icon} ${t.name}`, x: t.room.x, y: t.room.y, w: t.room.w, h: t.room.h })),
  { id: "pantry", name: "탕비실", x: 55, y: 49, w: 21, h: 42 },
  { id: "lounge", name: "휴게공간", x: 77, y: 49, w: 21, h: 42 }
];

/* 휴식 공간 자리 (탕비실·휴게 새 좌표에 맞춤) */
const LOUNGE_SPOTS = [[82, 60], [93, 60], [84, 76], [91, 84]];
const PANTRY_SPOTS = [[60, 58], [70, 58], [62, 72], [70, 82]];
const BREAK_BUBBLES = ["☕ 커피 한 잔...", "잠깐 쉬는 중이에요", "🍪 간식 타임!", "금방 복귀합니다!"];
const HALL_SPOTS = [[42, 24], [48, 30], [34, 32], [50, 20]];

const officeState = { built: false, meeting: false, agents: {} };

function staffName(id) {
  const a = OFFICE_AGENTS.find(x => x.id === id);
  return a ? a.name : "(퇴사한 직원)";
}
function staffEmoji(id) {
  const a = OFFICE_AGENTS.find(x => x.id === id);
  return a ? a.emoji : "🙂";
}

/* ----- 사무실 렌더링 & 애니메이션 ----- */
function addFurniture(office, cls, x, y, html = "") {
  const el = document.createElement("div");
  el.className = cls;
  el.style.left = x + "%";
  el.style.top = y + "%";
  if (html) el.innerHTML = html;
  office.appendChild(el);
  return el;
}

function fitOffice() {
  const office = $("#office");
  const floor = $("#office-floor");
  if (!office || !floor) return;
  const w = office.clientWidth;
  if (window.innerWidth <= 720) {
    // 모바일: 최소 배율 보장(터치 크기 확보) + 좌우 팬. CSS zoom은 레이아웃까지 줄여 스크롤 폭이 정확함
    const zoom = Math.max(0.62, Math.min(w / 920, 1));
    floor.classList.add("pan");
    floor.style.zoom = zoom;
    office.style.height = Math.round(620 * zoom + 12) + "px";
    office.classList.add("scrollable");
  } else {
    floor.classList.remove("pan");
    floor.style.zoom = "";
    office.style.height = "";
    office.classList.remove("scrollable");
    const zoom = Math.min(w / 920, 1);
    floor.style.setProperty("--zoom", zoom.toFixed(3));
  }
}

function buildOffice() {
  if (officeState.built) return;
  const office = $("#office");
  office.innerHTML = "";

  // 아이소메트릭 바닥판 — 모든 요소는 이 위에 배치
  const floor = document.createElement("div");
  floor.id = "office-floor";
  floor.className = "office-floor";
  office.appendChild(floor);

  // 방
  ROOMS.forEach(r => {
    const room = document.createElement("div");
    room.className = "room room-" + r.id;
    room.style.left = r.x + "%";
    room.style.top = r.y + "%";
    room.style.width = r.w + "%";
    room.style.height = r.h + "%";
    room.innerHTML = `<span class="room-label stand">${r.name}</span>`;
    floor.appendChild(room);
  });

  // 가구 — 대표실 (책상 클릭 = 직원 팝업)
  const bossDesk = addFurniture(floor, "f-desk f-bigdesk", DESK_POS.boss[0], DESK_POS.boss[1], `<span class="stand f-monitor">🖥️</span>`);
  bossDesk.classList.add("f-clickable");
  bossDesk.addEventListener("click", () => openStaffModal("boss"));
  addFurniture(floor, "f-prop", 15, 4, `<span class="stand">📚</span>`);

  // 가구 — 회의실
  addFurniture(floor, "f-table", 76.5, 25, "<span>회의 테이블</span>");
  SEATS.forEach(([x, y]) => addFurniture(floor, "f-chair", x, y));
  addFurniture(floor, "f-prop", 93, 7, `<span class="stand">📊</span>`);
  addFurniture(floor, "f-prop", 58, 7, `<span class="stand">🪴</span>`);

  // 가구 — 사무공간 책상 (직원 수만큼 자동 생성, 클릭 = 직원 팝업)
  OFFICE_AGENTS.forEach(a => {
    if (a.id === "boss") return;
    const desk = addFurniture(floor, "f-desk", DESK_POS[a.id][0], DESK_POS[a.id][1], `<span class="stand f-monitor">🖥️</span>`);
    desk.classList.add("f-clickable");
    desk.dataset.staff = a.id;
    desk.title = a.name;
    desk.addEventListener("click", () => openStaffModal(a.id));
  });
  addFurniture(floor, "f-prop", 62, 87, `<span class="stand">🖨️</span>`);

  // 가구 — 탕비실
  addFurniture(floor, "f-counter", 65, 53, `<span class="stand">☕🫖🍪</span>`);
  addFurniture(floor, "f-prop", 58, 66, `<span class="stand">🧃</span>`);

  // 가구 — 휴게공간
  addFurniture(floor, "f-sofa", 87, 58);
  addFurniture(floor, "f-rug", 87, 72);
  addFurniture(floor, "f-prop", 95, 52, `<span class="stand">🪴</span>`);

  // 복도 소품
  addFurniture(floor, "f-prop", 47, 20, `<span class="stand">🌿</span>`);

  // 캐릭터
  OFFICE_AGENTS.forEach(a => {
    const look = getLook(a.id);
    const [wx, wy] = WORK_POS[a.id];
    const el = document.createElement("div");
    el.className = "agent";
    el.style.left = wx + "%";
    el.style.top = wy + "%";
    el.style.zIndex = String(200 + Math.round(wy * 10));
    const tagName = a.id === "boss" ? `👑 ${(settings && settings.name) || "사장"}님` : a.name;
    el.innerHTML = `
      <div class="stand agent-stand">
        <div class="bubble hidden"></div>
        <div class="char-flip">
          <div class="char" style="--shirt:${look.shirt};--hair:${look.hair}">
            ${look.crown ? '<div class="char-crown">👑</div>' : ""}
            <div class="char-head"></div>
            <div class="char-body"></div>
            <div class="char-legs"><span></span><span></span></div>
          </div>
        </div>
        <div class="agent-tag"><span class="agent-dot"></span>${tagName}</div>
      </div>`;
    el.addEventListener("click", () => openStaffModal(a.id));
    floor.appendChild(el);
    officeState.agents[a.id] = {
      el,
      bubble: el.querySelector(".bubble"),
      dot: el.querySelector(".agent-dot"),
      flip: el.querySelector(".char-flip"),
      x: wx, y: wy, bubbleTimer: null, walkTimer: null
    };
  });

  officeState.built = true;
  fitOffice();
  ensureOfficeTimers();
}

/* 채용/해고 후 사무실을 새 구성으로 다시 짓기 */
function rebuildOffice() {
  officeState.built = false;
  officeState.agents = {};
  buildOffice();
  updateOfficeStatuses();
}

let officeTimersStarted = false;
function ensureOfficeTimers() {
  if (officeTimersStarted) return;
  officeTimersStarted = true;
  setInterval(wanderTick, 4200);
  setInterval(chatterTick, 42000);
  setInterval(autoPilotTick, 60000);
  setTimeout(autoPilotTick, 7000); // 앱 켜고 7초 뒤 첫 자율 점검
  setInterval(() => {
    const el = $("#office-clock");
    if (el) el.textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }, 1000);
  window.addEventListener("resize", fitOffice);
}

function moveAgent(id, x, y) {
  const a = officeState.agents[id];
  if (!a) return;
  const dist = Math.hypot(x - a.x, y - a.y);
  if (dist > 2) {
    a.el.classList.add("walking");
    a.flip.style.transform = x < a.x ? "scaleX(-1)" : "";
    clearTimeout(a.walkTimer);
    a.walkTimer = setTimeout(() => a.el.classList.remove("walking"), 1900);
  }
  a.x = x; a.y = y;
  a.el.style.left = x + "%";
  a.el.style.top = y + "%";
  a.el.style.zIndex = String(200 + Math.round(y * 10));
}

function speak(id, text, ms = 3200) {
  const a = officeState.agents[id];
  if (!a) return;
  a.bubble.textContent = text;
  a.bubble.classList.remove("hidden");
  clearTimeout(a.bubbleTimer);
  a.bubbleTimer = setTimeout(() => a.bubble.classList.add("hidden"), ms);
}

function agentActiveTask(id) {
  return tasks.find(t => t.assignee === id && t.status === "doing");
}

function updateOfficeStatuses() {
  OFFICE_AGENTS.forEach(a => {
    const st = officeState.agents[a.id];
    if (!st) return;
    if (a.id === "boss") { st.dot.className = "agent-dot dot-idle"; return; }
    if (a.id === "pm") {
      const open = tasks.filter(t => t.status !== "done").length;
      st.dot.className = "agent-dot " + (open ? "dot-work" : "dot-idle");
      return;
    }
    const active = agentActiveTask(a.id);
    const review = tasks.find(t => t.assignee === a.id && t.status === "review");
    st.dot.className = "agent-dot " + (active ? "dot-work" : review ? "dot-review" : "dot-idle");
  });
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function wanderTick() {
  if (officeState.meeting || document.hidden) return;
  OFFICE_AGENTS.forEach(a => {
    const [wx, wy] = WORK_POS[a.id];

    // 사장님: 대표실 상주, 가끔 사무실 순찰
    if (a.id === "boss") {
      if (Math.random() < 0.2) {
        moveAgent("boss", ...pick(HALL_SPOTS));
        if (Math.random() < 0.5) speak("boss", pick(["다들 화이팅! 🔥", "우리 팀 최고!", "순찰 중입니다 😎"]));
      } else {
        moveAgent("boss", wx + (Math.random() * 4 - 2), wy + (Math.random() * 3 - 1.5));
      }
      return;
    }

    const active = a.id !== "pm" && agentActiveTask(a.id);
    if (active) {
      // 작업 중: 자기 책상 앞에서 근무
      moveAgent(a.id, wx + (Math.random() * 3 - 1.5), wy + (Math.random() * 2 - 1));
      if (Math.random() < 0.22) speak(a.id, `「${active.title.slice(0, 16)}${active.title.length > 16 ? "…" : ""}」 작업 중 🔨`);
    } else {
      // 한가함: 탕비실·휴게실 다녀오거나 책상 근처 서성이기
      const r = Math.random();
      if (r < 0.18) {
        moveAgent(a.id, ...pick(PANTRY_SPOTS));
        if (Math.random() < 0.4) speak(a.id, pick(BREAK_BUBBLES));
      } else if (r < 0.36) {
        moveAgent(a.id, ...pick(LOUNGE_SPOTS));
        if (Math.random() < 0.4) speak(a.id, pick(BREAK_BUBBLES));
      } else if (r < 0.5) {
        moveAgent(a.id, ...pick(HALL_SPOTS));
      } else {
        moveAgent(a.id, wx + (Math.random() * 4 - 2), wy + (Math.random() * 3 - 1.5));
      }
    }
  });
}

/* ----- 스크럼 미팅 ----- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function agentReportLines(id) {
  const mine = tasks.filter(t => t.assignee === id);
  const doing = mine.filter(t => t.status === "doing");
  const queued = mine.filter(t => t.status === "todo");
  const inReview = mine.filter(t => t.status === "review");
  const doneRecent = mine.filter(t => t.status === "done" && Date.now() - (t.doneAt || 0) < 86400000 * 2);

  const lines = [];
  doneRecent.forEach(t => lines.push(`「${t.title}」 완료했습니다 ✅`));
  doing.forEach(t => lines.push(`「${t.title}」 진행 중입니다. 결과물 나오는 대로 검토 올릴게요.`));
  inReview.forEach(t => lines.push(`「${t.title}」 검토 대기 중이에요. 확인 부탁드립니다 👀`));
  if (queued.length) lines.push(`대기 업무 ${queued.length}건은 현재 건 마치고 바로 시작하겠습니다.`);
  if (!lines.length) lines.push("배정된 업무가 없습니다. 새 지시 기다리는 중입니다!");
  return lines;
}

/* AI 자유 발언 스크럼 (API 키 연결 시) — 실제 보드 데이터를 근거로만 말하게 하고, 실패하면 템플릿 대사로 폴백 */
async function aiScrumLines(speakers, extras, open, review) {
  if (!((settings && settings.apiKey) || "").trim()) return null; // 키 없으면 시도 안 함 (무료 AI 팝업 방지)
  const facts = speakers.map(a =>
    `- ${staffName(a.id)}: ${agentReportLines(a.id).join(" / ")}`).join("\n");
  try {
    const raw = await Promise.race([
      aiChat(
        `너는 SNS 마케팅 회사의 스크럼 회의 대사 작가야. 아래 '사실'에 있는 내용만 근거로 삼아 — 없는 업무·숫자를 지어내면 안 돼. 각 직원이 자기 상황을 자연스럽고 짧게(45자 이내), 성격이 느껴지는 존댓말로 말하게 해줘.`,
        [{ role: "user", content: `열린 업무 ${open}건, 검토 대기 ${review}건.\n${extras.length ? "공지: " + extras.join(" / ") + "\n" : ""}사실(직원별 현재 상황):\n${facts}\n\n형식: 한 줄에 하나씩 "이름|대사". 위 직원 전원 1줄씩, 다른 텍스트 금지.` }],
        () => {}),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000))
    ]);
    const map = {};
    String(raw).split("\n").forEach(l => {
      const m = l.match(/^\s*(?:[-*]\s*)?(.+?)\s*\|\s*(.+)$/);
      if (!m) return;
      const st = STAFF.find(s => m[1].trim().includes(s.name) || s.name.includes(m[1].trim()));
      if (st && !map[st.id]) map[st.id] = m[2].trim().slice(0, 90);
    });
    return Object.keys(map).length ? map : null;
  } catch { return null; }
}

async function holdScrum(quick = false) {
  if (officeState.meeting) { toast("이미 회의가 진행 중이에요! 끝나면 다시 소집해주세요."); return; }
  officeState.meeting = true;
  const btn = $("#scrum-btn");
  const briefBtn = $("#brief-btn");
  btn.disabled = true; briefBtn.disabled = true;
  (quick ? briefBtn : btn).textContent = "회의 중...";

  const logWrap = $("#meeting-log-wrap");
  const log = $("#meeting-log");
  logWrap.classList.remove("hidden");
  log.innerHTML = "";
  $("#meeting-log-date").textContent = (quick ? "⚡ 빠른 브리핑 · " : "") + new Date().toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const minutes = [];
  const record = (id, text) => {
    minutes.push({ speaker: staffName(id), text });
    const line = document.createElement("div");
    line.className = "meeting-line";
    line.innerHTML = `<b>${staffEmoji(id)} ${staffName(id)}</b> ${escapeHtml(text)}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };
  const talkMs = quick ? 1500 : 2600;
  const say = async (id, text, ms = talkMs) => {
    speak(id, text, ms);
    record(id, text);
    await sleep(ms + (quick ? 150 : 300));
  };

  const open = tasks.filter(t => t.status === "doing" || t.status === "todo").length;
  const review = tasks.filter(t => t.status === "review").length;
  const boss = (settings && settings.name) || "사장님";

  // 탭 상호작용: 캘린더 일정·마감 할 일을 회의에서 공유
  const todayEvents = events.filter(e => e.date === todayStr()).sort((a, b) => (a.time || "99") < (b.time || "99") ? -1 : 1);
  const dueTodos = todos.filter(t => !t.done && t.due && t.due <= todayStr());
  const briefingExtras = [];
  if (todayEvents.length) briefingExtras.push(`오늘 일정 ${todayEvents.length}건 — ${todayEvents.slice(0, 2).map(e => `${e.time ? e.time + " " : ""}${e.title}`).join(", ")}${todayEvents.length > 2 ? " 외" : ""} 🗓️`);
  if (dueTodos.length) briefingExtras.push(`마감 임박 할 일 ${dueTodos.length}건 — "${dueTodos[0].text}"${dueTodos.length > 1 ? " 외" : ""} 서두르세요!`);
  const snsNow = readStudioSns();
  if (snsNow.length) {
    const top = snsNow[0];
    const d = top.delta === null ? "" : top.delta >= 0 ? ` (+${top.delta.toLocaleString("ko-KR")}) 📈` : ` (${top.delta.toLocaleString("ko-KR")}) 📉`;
    briefingExtras.push(`채널 현황: ${top.platform} ${top.handle} 팔로워 ${top.count.toLocaleString("ko-KR")}명${d}${snsNow.length > 1 ? ` 외 ${snsNow.length - 1}개 채널` : ""}`);
  }

  // 발표자: 빠른 브리핑은 업무 있는 직원만
  const speakers = OFFICE_AGENTS.filter(a => {
    if (a.id === "pm" || a.id === "boss") return false;
    if (!quick) return true;
    return tasks.some(t => t.assignee === a.id && (t.status !== "done" || Date.now() - (t.doneAt || 0) < 86400000));
  });

  if (quick) {
    // 빠른 브리핑: 발표자만 매니저 자리 근처로 모임
    moveAgent("pm", 40, 25);
    speakers.forEach((a, i) => moveAgent(a.id, 33 + (i % 4) * 5, 31 + Math.floor(i / 4) * 7));
    await sleep(2100);
    await say("pm", `⚡ 빠른 브리핑! 진행 중인 것만 한 줄씩 공유해주세요.`);
    for (const ex of briefingExtras) await say("pm", ex);
    if (!speakers.length) {
      await say("pm", "지금은 진행 중인 업무가 없네요. 지시 기다리는 중입니다!");
    } else {
      for (const a of speakers) {
        await say(a.id, agentReportLines(a.id)[0]);
      }
    }
    await say("pm", `끝! 검토 대기 ${review}건${review ? ` — ${boss}님 확인 부탁드려요` : ""}. 업무 복귀! 🔥`);
  } else {
    // 정식 스크럼: 전원 회의실 집합. AI 연결 시 자유 발언 생성을 미리 요청해두고(걸어가는 동안) 실패하면 템플릿 대사
    const aiLinesPromise = aiScrumLines(speakers, briefingExtras, open, review);
    OFFICE_AGENTS.forEach((a, i) => moveAgent(a.id, SEATS[i % SEATS.length][0], SEATS[i % SEATS.length][1]));
    await sleep(2100);
    await say("pm", `스크럼 시작할게요! 📣 현재 열린 업무 ${open}건, 검토 대기 ${review}건입니다. 돌아가면서 공유해주세요.`);
    for (const ex of briefingExtras) await say("pm", ex);
    const aiLines = await aiLinesPromise;
    if (aiLines) record("pm", "🤖 (AI 자유 발언 모드 — 실제 업무 데이터 기반)");
    for (const a of speakers) {
      const lines = aiLines && aiLines[a.id] ? [aiLines[a.id]] : agentReportLines(a.id);
      for (const line of lines) {
        await say(a.id, line);
      }
    }
    const done = tasks.filter(t => t.status === "done").length;
    await say("pm", review
      ? `공유 감사합니다. ${boss}님, 검토 대기 ${review}건 확인 부탁드려요! 오늘도 화이팅 🔥`
      : `공유 감사합니다. 누적 완료 ${done}건! ${boss}님, 새 지시 있으면 언제든 내려주세요. 오늘도 화이팅 🔥`);
  }

  meetings.unshift({ date: Date.now(), minutes, quick });
  meetings = meetings.slice(0, 100); // 회의록 저장 상한 (IndexedDB라 여유)
  store.set("meetings", meetings);
  logActivity(quick ? "⚡ 빠른 브리핑 완료" : "📝 스크럼 미팅 완료 — 회의록 저장됨");
  postChat("pm", quick
    ? `⚡ 빠른 브리핑 끝! 검토 대기 ${review}건입니다.`
    : `스크럼 미팅 끝! 열린 업무 ${open}건, 검토 대기 ${review}건입니다. 다들 수고하셨어요 📝`);

  officeState.meeting = false;
  btn.disabled = false; briefBtn.disabled = false;
  btn.textContent = "📣 스크럼 미팅 소집";
  briefBtn.textContent = "⚡ 빠른 브리핑";
  OFFICE_AGENTS.forEach(a => moveAgent(a.id, ...WORK_POS[a.id]));
}

/* ----- 팀 채팅 ----- */
let teamChat = store.get("teamChat", []);

function postChat(id, text) {
  const name = id === "boss" ? `👑 ${(settings && settings.name) || "사장"}님` : staffName(id);
  teamChat.push({ at: Date.now(), id, name, emoji: id === "boss" ? "" : staffEmoji(id), text });
  teamChat = teamChat.slice(-500); // IndexedDB 저장이라 여유
  store.set("teamChat", teamChat);
  renderTeamChat();
}

function renderTeamChat() {
  const el = $("#team-chat");
  if (!el) return;
  if (!teamChat.length) {
    el.innerHTML = `<div class="mission-empty">아직 대화가 없어요. 직원들이 곧 수다를 떨기 시작할 거예요 ☕</div>`;
    return;
  }
  el.innerHTML = teamChat.slice(-25).map(m => {
    const t = new Date(m.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    return `<div class="chatline"><span class="chatline-name">${m.emoji} ${escapeHtml(m.name)}</span><span class="chatline-text">${escapeHtml(m.text)}</span><span class="chatline-time">${t}</span></div>`;
  }).join("");
  el.scrollTop = el.scrollHeight;
}

/* 직원 둘이 만나서 나누는 잡담 (사무실 연출 + 팀 채팅 기록) */
function chatterScript(aId, bId) {
  const a = staffName(aId), b = staffName(bId);
  const open = tasks.find(t => t.status === "doing" || t.status === "review");
  const topic = (settings && settings.topic) || "리빙";
  const pools = [
    open ? [
      [aId, `「${open.title.slice(0, 14)}」 건 방향 잠깐 봐줄래요?`],
      [bId, `오 좋은데요? 저장을 부르는 쪽으로 살짝 틀면 더 좋을 듯!`],
      [aId, `역시 ${b}님! 바로 반영할게요 🙌`]
    ] : null,
    [
      [aId, `요즘 ${topic} 계정들 뭐가 잘 되나 봤어요?`],
      [bId, `비포/애프터 형식이 확실히 반응 좋더라고요.`],
      [aId, `오, 다음 기획 회의 때 공유해주세요!`]
    ],
    [
      [aId, `커피 한 잔 하실래요? ☕`],
      [bId, `좋죠! 5분만 쉬고 다시 달립시다 🔥`]
    ],
    [
      [aId, `사장님 계정 요즘 성장세 어때요?`],
      [bId, `이제 시작이죠! 우리가 제대로 밀어드려야죠 💪`]
    ],
    [
      [aId, `${b}님 지난번 결과물 진짜 좋았어요.`],
      [bId, `헉 감사해요 😊 ${a}님 것도 참고 많이 했어요!`]
    ]
  ].filter(Boolean);
  return pick(pools);
}

let chatterBusy = false;
async function chatterTick() {
  if (officeState.meeting || chatterBusy || document.hidden) return;
  if (Math.random() < 0.35) return; // 매번 일어나지는 않게
  const idle = STAFF.filter(s => !agentActiveTask(s.id)).map(s => s.id);
  if (idle.length < 2) return;
  chatterBusy = true;
  try {
    const aId = pick(idle);
    const bId = pick(idle.filter(x => x !== aId));
    const [mx, my] = pick([...HALL_SPOTS, ...PANTRY_SPOTS.slice(0, 2), ...LOUNGE_SPOTS.slice(0, 2)]);
    moveAgent(aId, mx - 2.5, my);
    moveAgent(bId, mx + 2.5, my);
    await sleep(2100);
    for (const [who, line] of chatterScript(aId, bId)) {
      speak(who, line, 2600);
      postChat(who, line);
      await sleep(2900);
    }
  } finally {
    chatterBusy = false;
  }
}

/* ----- 직원 상세 팝업 ----- */
function openStaffModal(id) {
  const modal = $("#staff-modal");
  const head = $("#sm-head");
  const body = $("#sm-body");
  const agent = OFFICE_AGENTS.find(a => a.id === id);
  if (!agent) return;

  const bossName = (settings && settings.name) || "사장";

  if (id === "boss") {
    head.innerHTML = `<span class="sm-emoji">👑</span><div><div class="sm-name">${escapeHtml(bossName)}님 (사장)</div><div class="sm-role">이 사무실의 주인 — 바로 당신!</div></div>`;
    const done = tasks.filter(t => t.status === "done").length;
    const open = tasks.filter(t => t.status !== "done").length;
    body.innerHTML = `<p class="sm-desc">지금까지 팀이 완료한 업무 <b>${done}건</b>, 열린 업무 <b>${open}건</b>.<br>지시를 내리고 검토·승인만 하면 됩니다. 사장님은 큰 그림만! 😎</p>`;
    modal.classList.remove("hidden");
    return;
  }

  const st = STAFF.find(s => s.id === id);
  const mine = tasks.filter(t => t.assignee === id);
  const byStatus = (s) => mine.filter(t => t.status === s);
  const doneCount = byStatus("done").length;

  if (id === "pm") {
    head.innerHTML = `<span class="sm-emoji">🧑‍💼</span><div><div class="sm-name">매니저</div><div class="sm-role">업무 배정과 회의 진행 담당</div></div>`;
    const open = tasks.filter(t => t.status !== "done");
    body.innerHTML = `<p class="sm-desc">팀 전체 현황을 관리해요.</p>` + (open.length
      ? `<div class="sm-section">열린 업무 전체 (${open.length})</div>` + open.map(t => `<div class="sm-task">${staffEmoji(t.assignee)} ${escapeHtml(t.title)} <span class="sm-status">${t.status === "todo" ? "대기" : t.status === "doing" ? "진행 중" : "검토 대기"}</span></div>`).join("")
      : `<p class="sm-desc">현재 열린 업무가 없어요. 지시를 내려보세요!</p>`);
    modal.classList.remove("hidden");
    return;
  }

  const smSkills = skillNames(id);
  head.innerHTML = `<span class="sm-emoji">${st.emoji}</span><div><div class="sm-name">${escapeHtml(st.name)}</div><div class="sm-role">${escapeHtml(st.role)} · 완료 ${doneCount}건</div>${smSkills.length ? `<div class="staff-skillbadges">🎓 ${smSkills.join(" · ")}</div>` : ""}</div>`;

  let html = "";
  const sections = [["doing", "🔨 진행 중"], ["review", "👀 검토 대기"], ["todo", "⏳ 대기"], ["done", "✅ 최근 완료"]];
  sections.forEach(([s, label]) => {
    let list = byStatus(s);
    if (s === "done") list = list.slice(0, 3);
    if (!list.length) return;
    html += `<div class="sm-section">${label} (${list.length})</div>` + list.map(t => `<div class="sm-task">${escapeHtml(t.title)}</div>`).join("");
  });
  if (!html) html = `<p class="sm-desc">지금 맡은 업무가 없어요. 아래에서 바로 일을 시켜보세요!</p>`;

  html += `<div class="sm-assign"><input type="text" id="sm-assign-input" placeholder="예: ${escapeHtml(st.tasks[0] || "업무 지시")}"><button class="btn-primary" id="sm-assign-go">지시</button></div>`;
  if (st.custom) html += `<button class="btn-danger btn-small sm-fire" id="sm-fire">이 직원 해고하기</button>`;
  body.innerHTML = html;

  $("#sm-assign-go").addEventListener("click", () => {
    const v = $("#sm-assign-input").value.trim();
    if (!v) return;
    const t = createTask(v, id);
    renderBoard(); updateOfficeStatuses();
    modal.classList.add("hidden");
    toast(`🎯 ${st.name}에게 배정 완료!`);
    dispatchWork(t);
  });
  $("#sm-assign-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) $("#sm-assign-go").click(); });
  const fireBtn = $("#sm-fire");
  if (fireBtn) fireBtn.addEventListener("click", () => { modal.classList.add("hidden"); fireStaff(id); });

  modal.classList.remove("hidden");
}

/* ----- 채용 / 해고 ----- */
function hireStaff() {
  const name = $("#hire-name").value.trim();
  const role = $("#hire-role").value.trim();
  const duty = $("#hire-duty").value.trim();
  const emoji = $("#hire-emoji").value;
  const keywords = $("#hire-keywords").value.split(",").map(k => k.trim()).filter(Boolean);

  if (!name || !duty) { toast("⚠️ 이름과 하는 일은 꼭 채워주세요!"); return; }
  if (STAFF.length >= MAX_STAFF) { toast(`⚠️ 사무실 책상이 가득 찼어요 (최대 ${MAX_STAFF}명). 먼저 한 명을 해고해주세요.`); return; }
  if (STAFF.some(s => s.name === name)) { toast("⚠️ 같은 이름의 직원이 이미 있어요."); return; }

  const c = {
    id: "c" + Date.now(),
    name, role: role || `${name} 담당 직원`, duty, emoji, keywords,
    look: LOOK_PALETTE[customStaff.length % LOOK_PALETTE.length]
  };
  customStaff.push(c);
  store.set("customStaff", customStaff);
  rebuildStaff();
  rebuildOffice();
  renderStaff();
  renderBoard();
  ["hire-name", "hire-role", "hire-duty", "hire-keywords"].forEach(i => $("#" + i).value = "");
  logActivity(`🎉 새 직원 입사: ${emoji} ${name} (${c.role})`);
  postChat("pm", `모두 환영해주세요! 오늘부터 ${name}님이 합류합니다 🎉`);
  setTimeout(() => { postChat(c.id, `안녕하세요, ${name}입니다! 잘 부탁드려요 🙇`); speak(c.id, "첫 출근입니다! 🙇"); }, 1200);
  toast(`🎉 ${name} 채용 완료! 사무실에 책상이 생겼어요.`);
}

function fireStaff(id) {
  const c = customStaff.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`정말 ${c.name} 직원을 해고할까요? 진행 중이던 업무는 콘텐츠 기획자에게 인계됩니다.`)) return;

  tasks.forEach(t => {
    if (t.assignee === id && t.status !== "done") {
      t.assignee = "planner";
      t.note = (t.note ? t.note + " / " : "") + `${c.name} 퇴사로 인계받음`;
    }
  });
  store.set("tasks", tasks);
  customStaff = customStaff.filter(x => x.id !== id);
  store.set("customStaff", customStaff);
  rebuildStaff();
  rebuildOffice();
  renderStaff();
  renderBoard();
  logActivity(`👋 ${c.name} 퇴사 — 남은 업무는 콘텐츠 기획자에게 인계`);
  postChat("pm", `${c.name}님이 퇴사했습니다. 남은 업무는 콘텐츠 기획자가 이어받아요.`);
  toast(`👋 ${c.name} 해고 완료`);
}

/* ----- 스튜디오 본부 연동: SNS 채널 팔로워 현황 읽기 ----- */
function readStudioSns() {
  try {
    const raw = localStorage.getItem("studio_hq_v1");
    if (!raw) return [];
    return (JSON.parse(raw).sns || []).map(s => {
      const hist = s.history || [];
      const last = hist[hist.length - 1];
      const prev = hist.length > 1 ? hist[hist.length - 2] : null;
      return {
        platform: s.platform || "SNS",
        handle: s.handle || "",
        count: last ? (Number(last.c) || 0) : null,
        delta: last && prev ? (Number(last.c) || 0) - (Number(prev.c) || 0) : null,
        date: last ? last.d : ""
      };
    }).filter(x => x.count !== null);
  } catch { return []; }
}

/* ----- 보고서 생성 (앱 전체 데이터를 모아 작성 → 자료실 저장) ----- */
function buildReportData() {
  const today = todayStr();
  const week = new Date(); week.setDate(week.getDate() + 7);
  const weekStr = todayStr(week);
  const done = tasks.filter(t => t.status === "done");
  const open = tasks.filter(t => t.status === "doing" || t.status === "todo");
  const review = tasks.filter(t => t.status === "review");
  let totalSteps = 0, doneSteps = 0;
  ROADMAP.forEach(s => s.steps.forEach((_, i) => { totalSteps++; if (roadmapDone[s.id + ":" + i]) doneSteps++; }));
  const openTodos = todos.filter(t => !t.done);
  const upcoming = events.filter(e => e.date >= today && e.date <= weekStr).sort((a, b) => a.date < b.date ? -1 : 1);
  const focus = focusLog[today] || { count: 0, minutes: 0 };
  const nextSteps = [];
  for (const st of ROADMAP) for (let i = 0; i < st.steps.length; i++) {
    if (nextSteps.length < 3 && !roadmapDone[st.id + ":" + i]) nextSteps.push(st.steps[i]);
  }
  return { today, done, open, review, pct: totalSteps ? Math.round(doneSteps / totalSteps * 100) : 0, openTodos, upcoming, focus, nextSteps };
}

function reportMarkdown(d) {
  const L = [];
  L.push(`# 📑 ${(settings && settings.topic) || "내"} 계정 운영 보고서 (${d.today})`);
  L.push("");
  L.push(`## 업무 현황`);
  L.push(`- 완료 ${d.done.length}건 · 진행/대기 ${d.open.length}건 · 검토 대기 ${d.review.length}건`);
  if (d.done.length) L.push(...d.done.slice(0, 8).map(t => `  - ✅ ${t.title} (${staffName(t.assignee)})`));
  if (d.open.length) L.push(...d.open.slice(0, 8).map(t => `  - 🔨 ${t.title} (${staffName(t.assignee)})`));
  L.push("");
  L.push(`## 성장 로드맵`);
  L.push(`- 전체 진행률 **${d.pct}%**`);
  if (d.nextSteps.length) { L.push(`- 다음 할 단계:`); L.push(...d.nextSteps.map(s => `  - ${s}`)); }
  L.push("");
  if (d.openTodos.length) {
    L.push(`## 할 일 (${d.openTodos.length}건 미완료)`);
    L.push(...d.openTodos.slice(0, 8).map(t => `- ${t.text}${t.due ? ` (마감 ${t.due})` : ""}`));
    L.push("");
  }
  if (d.upcoming.length) {
    L.push(`## 다가오는 일정 (7일)`);
    L.push(...d.upcoming.map(e => `- ${e.date} ${e.time || ""} ${e.title}`));
    L.push("");
  }
  L.push(`## 오늘의 집중`);
  L.push(`- 집중 ${d.focus.count}회 · ${d.focus.minutes}분`);
  L.push("");
  const sns = readStudioSns();
  L.push(`## SNS 채널 현황 (🎨 스튜디오 본부 연동)`);
  if (sns.length) {
    L.push(`| 플랫폼 | 계정 | 팔로워 | 최근 변화 |`);
    L.push(`|---|---|---|---|`);
    sns.forEach(s => {
      const delta = s.delta === null ? "—" : (s.delta >= 0 ? `+${s.delta.toLocaleString("ko-KR")} 📈` : `${s.delta.toLocaleString("ko-KR")} 📉`);
      L.push(`| ${s.platform} | ${s.handle} | ${s.count.toLocaleString("ko-KR")}명 | ${delta} (${s.date}) |`);
    });
  } else {
    L.push(`- 아직 연동된 채널이 없어요. 🎨 스튜디오 탭 > 본부 > SNS 계정에 계정과 팔로워 수를 기록하면 여기에 자동으로 나타나요.`);
  }
  L.push("");
  L.push(`## 보유 자료`);
  L.push(`- 자료실 ${docs.length}개 (활성 ${docs.filter(x => x.enabled).length}개)`);
  return L.join("\n");
}

async function generateReport(quiet = false) {
  const btn = $("#report-btn");
  if (btn) { btn.disabled = true; btn.textContent = "작성 중..."; }
  speak("pm", "보고서 작성 들어갑니다 📑", 2500);
  const data = buildReportData();
  let content = reportMarkdown(data);

  // AI가 가능하면 총평·다음 주 전략을 덧붙임 (실패해도 기본 보고서는 완성)
  try {
    const comment = await aiChat(
      `너는 SNS 마케팅 팀의 매니저(PM)다. 아래 운영 보고서를 읽고 "매니저 총평" 섹션을 작성하라: 잘 되고 있는 점 2가지, 위험 신호 1가지, 다음 주 전략 제안 3가지. 한국어, 간결한 마크다운.\n\n${staffContext()}`,
      [{ role: "user", content }], () => {});
    content += `\n\n## 🧑‍💼 매니저 총평\n${comment}`;
  } catch { content += `\n\n## 🧑‍💼 매니저 총평\n(AI 연결 시 매니저의 분석 총평이 여기에 추가돼요)`; }

  const doc = { id: Date.now() + "", title: `📑 운영 보고서 ${data.today}`, content, enabled: false };
  docs.push(doc);
  saveDocs();
  renderLibrary();
  logActivity(`📑 운영 보고서 작성 완료 → 자료실 저장`);
  postChat("pm", `${data.today} 운영 보고서 작성 완료! 자료실에 저장했습니다 📑`);
  if (btn) { btn.disabled = false; btn.textContent = "📑 보고서 생성"; }
  if (quiet) {
    toast("📑 매니저가 운영 보고서를 작성해 자료실에 넣어뒀어요.", 4500);
  } else {
    toast("📑 보고서 완성! 자료실에 저장됐어요. 지금 바로 보여드릴게요.");
    openDocModal(doc);
  }
}

/* ----- 자료 스터디 회의 (자료실 문서를 직원들이 회의로 소화) ----- */
async function studyMeeting(docId, opts = {}) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return;
  if (officeState.meeting || chatterBusy) { if (!opts.silent) toast("지금 다른 회의가 진행 중이에요. 잠시 후 다시 시도해주세요."); return; }
  if (!opts.silent) switchTab("office"); // 자율 모드에서는 사용자가 보던 탭을 방해하지 않음
  officeState.meeting = true;
  $("#scrum-btn").disabled = true;
  $("#brief-btn").disabled = true;

  const logWrap = $("#meeting-log-wrap");
  const log = $("#meeting-log");
  logWrap.classList.remove("hidden");
  log.innerHTML = "";
  const deep = opts.deep || 1; // 같은 자료 반복 회의 회차 (1=최초)
  $("#meeting-log-date").textContent = `📖 ${deep > 1 ? `심화 스터디 (${deep}회차)` : "자료 스터디"} · ${new Date().toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  const minutes = [];
  const record = (id, text) => {
    minutes.push({ speaker: staffName(id), text });
    const line = document.createElement("div");
    line.className = "meeting-line";
    line.innerHTML = `<b>${staffEmoji(id)} ${staffName(id)}</b> ${escapeHtml(text)}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    postChat(id, text);
  };
  const say = async (id, text, ms = 2600) => { speak(id, text, ms); record(id, text); await sleep(ms + 300); };

  // 참석자: 매니저 + 강의 소화 코치 + 기획자 + 카피라이터
  const attendees = ["pm", "digest", "planner", "copywriter"].filter(id => officeState.agents[id]);
  attendees.forEach((id, i) => moveAgent(id, ...SEATS[i % SEATS.length]));
  await sleep(2100);

  await say("pm", deep > 1
    ? `『${doc.title}』 ${deep}회차 심화 스터디입니다 🔁 지난 회의보다 더 깊이 파봅시다. 소화 코치님, 새 각도로 브리핑 부탁해요.`
    : `『${doc.title}』 자료 스터디 회의 시작합니다 📖 소화 코치님, 핵심 브리핑 부탁해요.`);

  // 핵심 요약: AI 가능하면 진짜 요약, 아니면 자료 발췌 (심화 회차는 다른 관점·다른 구간)
  let summary = "";
  // 회차마다 자료의 다른 구간을 읽어 큰 자료도 전체가 커버되게 (1회차=앞, 2회차=중간, ...)
  const winSize = 20000;
  const winStart = doc.content.length > winSize
    ? Math.min((deep - 1) * Math.floor(winSize * 0.8), Math.max(0, doc.content.length - winSize))
    : 0;
  try {
    summary = await aiChat(
      `너는 강의 자료를 소화시키는 코치다. ${deep > 1 ? `이번은 ${deep}회차 심화 회의다. 앞선 회의에서 다룬 뻔한 요약은 피하고, 남들이 놓치는 디테일·반례·적용 심화 포인트를 새로 뽑아라. ` : ""}아래 자료${winStart > 0 ? `(전체 중 ${Math.round(winStart / doc.content.length * 100)}% 지점부터 발췌 — 이번 회차 학습 구간)` : ""}의 핵심을 3줄로 요약하고, 이 팀(SNS 계정 운영)이 바로 실행할 액션 3가지를 제안하라. 형식: "핵심: ..." 3줄, "실행: ..." 3줄. 한국어 간결하게.\n\n${staffContext()}`,
      [{ role: "user", content: doc.content.slice(winStart, winStart + winSize) }], () => {});
  } catch {
    // 회차마다 다른 구간을 발췌해 반복 회의가 새 내용을 다루게
    const clean = doc.content.replace(/\s+/g, " ");
    const start = Math.min(Math.max(0, clean.length - 150), (deep - 1) * Math.max(400, Math.floor(clean.length / 4)));
    const bits = clean.slice(start, start + 150);
    summary = deep > 1
      ? `핵심(${deep}회차): "${bits}..." — 이 구간을 더 파고들면 실행 디테일이 나옵니다. (AI 연결 시 심화 요약이 자동)`
      : `핵심 발췌: "${clean.slice(0, 150)}..." — 전체 내용은 자료실에서 확인할 수 있어요. (AI 연결 시 진짜 요약과 실행 계획이 나와요)`;
  }
  for (const line of summary.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6)) {
    await say("digest", line, 2400);
  }

  await say("planner", "좋네요! 이번 주 콘텐츠 기획에 바로 반영하겠습니다 ✍️");
  await say("copywriter", "저도 캡션 쓸 때 이 자료 톤을 참고할게요!");
  await say("pm", `정리 감사합니다. 이 자료는 앞으로 업무에 자동으로 반영됩니다. 회의 끝! 📖`);

  meetings.unshift({ date: Date.now(), minutes, study: doc.title + (deep > 1 ? ` (심화 ${deep}회차)` : "") });
  meetings = meetings.slice(0, 100); // 회의록 저장 상한 (IndexedDB라 여유)
  store.set("meetings", meetings);
  logActivity(`📖 『${doc.title}』 스터디 회의 완료 — 회의록 저장`);

  // 스터디한 자료는 자동으로 활성화 → 직원들이 업무에 활용
  if (!doc.enabled) { doc.enabled = true; saveDocs(); renderLibrary(); }

  officeState.meeting = false;
  $("#scrum-btn").disabled = false;
  $("#brief-btn").disabled = false;
  OFFICE_AGENTS.forEach(a => moveAgent(a.id, ...WORK_POS[a.id]));
}

/* ----- 회의록 보관함 ----- */
function renderMinutesList() {
  const list = $("#minutes-list");
  if (!list) return;
  if (!meetings.length) {
    list.innerHTML = `<div class="mission-empty">아직 저장된 회의록이 없어요. 스크럼 미팅이나 스터디 회의를 열어보세요!</div>`;
    return;
  }
  list.innerHTML = "";
  meetings.slice(0, 30).forEach(m => { // 표시는 최근 30개 (저장은 100개)
    const det = document.createElement("details");
    det.className = "minute-entry";
    const when = new Date(m.date).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const kind = m.study ? `📖 스터디 — 『${m.study}』` : m.quick ? "⚡ 빠른 브리핑" : "📣 스크럼 미팅";
    det.innerHTML = `<summary><b>${escapeHtml(kind)}</b><span class="minute-when">${when} · ${m.minutes.length}줄</span></summary>`;
    const body = document.createElement("div");
    body.className = "minute-body";
    body.innerHTML = m.minutes.map(l => `<div class="meeting-line"><b>${escapeHtml(l.speaker)}</b> ${escapeHtml(l.text)}</div>`).join("");
    det.appendChild(body);
    list.appendChild(det);
  });
}

/* ----- 활동 로그 ----- */
function logActivity(text) {
  activity.unshift({ at: Date.now(), text });
  activity = activity.slice(0, 300);
  store.set("activity", activity);
  renderActivity();
}

function renderActivity() {
  const el = $("#activity");
  if (!el) return;
  if (!activity.length) {
    el.innerHTML = `<div class="mission-empty">아직 활동이 없어요. 위에서 첫 지시를 내려보세요!</div>`;
    return;
  }
  el.innerHTML = activity.slice(0, 10).map(a => {
    const t = new Date(a.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<div class="activity-line"><span class="activity-time">${t}</span> ${escapeHtml(a.text)}</div>`;
  }).join("");
}

/* ----- 지시 → 배정 ----- */
function routeDirective(text) {
  for (const [re, id] of ROUTES) if (re.test(text)) return id;
  return "planner";
}

/* 저장 공간 보호: 완료 업무는 최근 40개만 보관 */
function trimDoneTasks() {
  const done = tasks.filter(t => t.status === "done");
  if (done.length <= 200) return;
  const cut = done.sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0)).slice(0, done.length - 200);
  const ids = new Set(cut.map(t => t.id));
  tasks = tasks.filter(t => !ids.has(t.id));
}

function createTask(title, assignee) {
  const hasActive = !!agentActiveTask(assignee);
  const task = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    title, assignee,
    status: hasActive ? "todo" : "doing",
    stage: "draft",
    createdAt: Date.now(), result: "", draft: "", note: ""
  };
  tasks.unshift(task);
  trimDoneTasks();
  store.set("tasks", tasks);
  logActivity(`🧑‍💼 매니저 → ${staffName(assignee)}: 「${title}」 배정${hasActive ? " (대기열)" : ""}`);
  postChat("pm", `@${staffName(assignee)} 「${title}」 부탁해요!`);
  speak("pm", `${staffName(assignee)}님, 새 업무 배정했어요!`);
  setTimeout(() => {
    const reply = hasActive ? "접수! 현재 건 마치고 시작할게요." : "새 업무 접수했습니다! 바로 시작합니다 💪";
    speak(assignee, reply);
    postChat(assignee, reply);
  }, 1400);
  return task;
}

/* 아이디어 던지기 → 기획 회의 → 대본·기획 보고서 → 검토 대기 (문서 뷰어로 확인) */
function ideaToTask(ideaRaw) {
  const idea = ideaRaw.slice(0, 120);
  // 아이디어 내용으로 담당 라우팅: 릴스/영상이면 릴스 PD, 이모티콘이면 기획자, 기본은 콘텐츠 기획자
  const assignee = /릴스|영상|숏츠|대본/.test(idea) ? "reels"
    : /이모티콘|캐릭터|스티커/.test(idea) ? "emoti"
    : /캡션|해시태그|문구/.test(idea) ? "copywriter" : "planner";
  postChat("pm", `사장님이 아이디어를 던져주셨어요: "${idea}" — 기획 회의 소집합니다! 🙋`);
  speak("pm", "아이디어 기획 회의 소집! 🙋", 2600);
  const t = createTask(`아이디어 기획 — "${idea}"`, assignee);
  t.idea = idea;
  store.set("tasks", tasks);
  renderBoard(); updateOfficeStatuses();
  if (t.status === "doing") dispatchWork(t);
  toast("🚀 직원들이 기획 회의를 시작했어요! 사무실 탭에서 진행을 보고, 완성되면 검토 대기에 보고서가 올라와요.", 5000);
  return t;
}

async function handleDirective() {
  const input = $("#directive-input");
  let text = input.value.trim();
  if (!text) { input.focus(); return; }
  input.value = "";
  const btn = $("#directive-go");
  btn.disabled = true;

  // "@직원이름 지시내용" 으로 담당 직접 지정 (두 단어 이름 지원: 이름 글자 수만큼 소비 후 나머지를 지시로)
  if (text.startsWith("@")) {
    const body = text.slice(1).replace(/^\s+/, "");
    const bodyNs = body.replace(/\s/g, "");
    const target = STAFF
      .filter(s => bodyNs.startsWith(s.name.replace(/\s/g, "")))
      .sort((a, b) => b.name.replace(/\s/g, "").length - a.name.replace(/\s/g, "").length)[0];
    if (target) {
      const need = target.name.replace(/\s/g, "").length;
      let consumed = 0, i = 0;
      while (i < body.length && consumed < need) { if (!/\s/.test(body[i])) consumed++; i++; }
      const directive = body.slice(i).trim();
      if (directive) {
        const t = createTask(directive, target.id);
        renderBoard(); updateOfficeStatuses();
        toast(`🎯 ${target.name}에게 직접 배정!`);
        btn.disabled = false;
        dispatchWork(t);
        return;
      }
    }
    text = body; // 못 찾으면 일반 배정으로
  }

  // 분석실 기능도 사무실 지시로 실행 (탭 이동 없이 한 곳에서 전부 해결)
  const urlsInText = text.match(/https?:\/\/[^\s]+/g) || [];
  if (/체험단/.test(text) && /수집|찾아|긁어|모아|레이더/.test(text)) {
    btn.disabled = false;
    toast("📡 체험단 레이더를 실행합니다! (분석실 탭에서 결과 확인)");
    postChat("pm", "체험단 모집 레이더 가동합니다 📡 최근 1개월 공고를 우회 수집할게요.");
    const n = await collectSponsorFeeds();
    if (n || sponsorFeeds.length) {
      const top = sponsorFeeds.slice(0, 20).map(f => `- [${(SP_CATS.find(c => c.key === f.cat) || {}).label || "기타"}] ${f.title} (${f.url})`).join("\n");
      const st2 = createTask(`체험단 모집 공고 분석 — 지원 우선순위 제안 (${todayStr()})`, "jr-partner");
      st2.material = top;
      store.set("tasks", tasks);
      renderBoard(); updateOfficeStatuses();
      dispatchWork(st2);
    }
    return;
  }
  if (urlsInText.length && /경쟁|벤치|분석/.test(text)) {
    btn.disabled = false;
    postChat("pm", "링크 수집 → 경쟁사 분석 → 적용 기획서, 성장 분석부에 배정합니다 🔍");
    runCompetitorAnalysis(urlsInText);
    return;
  }

  let assignments = null;
  if ((settings.apiKey || "").trim()) {
    try {
      const system = `너는 SNS 마케팅 팀의 PM이다. 사장의 지시를 팀원별 작업으로 분해하라.
팀원 id: ${STAFF.map(s => `${s.id}(${s.role})`).join(", ")}
규칙: 꼭 필요한 작업만 1~4개. 각 작업 제목은 결과물이 명확한 한 문장. 다른 말 없이 JSON 배열만 출력: [{"assignee":"copywriter","title":"..."}]`;
      const raw = await callClaudeSystem(system, [{ role: "user", content: text }], () => {});
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length) {
        assignments = parsed
          .filter(p => p.title && STAFF.some(s => s.id === p.assignee))
          .slice(0, 4);
      }
    } catch { /* 실패하면 키워드 배정으로 */ }
  }
  if (!assignments || !assignments.length) {
    assignments = [{ assignee: routeDirective(text), title: text }];
  }

  const created = assignments.map(a => createTask(a.title, a.assignee));
  renderBoard();
  updateOfficeStatuses();
  toast(`🎯 업무 ${created.length}건 배정 완료!`);
  btn.disabled = false;
  for (const t of created) dispatchWork(t);
}

/* ----- 3단계 품질 검증 파이프라인 -----
   ① 담당자 초안(draft) → ② 전문가 2명 교차검증 후 수정·재검토(verify) → ③ 매니저 최종 검토(final) → 보고(review) */

const STAGE_LABEL = {
  draft: "1/3 팀원 초안",
  verify: "2/3 팀장 검토·팀 회의",
  final: "3/3 과장 최종 검토"
};

/* ---------- 조직 구조: 사장(사용자) → 과장(매니저) → 분야별 팀장 → 팀원 ----------
   토큰 절약 설계: 팀원 초안은 하위 모델(저렴), 팀장 검토·과장 최종은 상위 모델.
   결재선: 팀원 작성 → 팀장 검토·수정 + 팀 회의 → 과장 전체 회의·재검토 → 최종 보고서 → 사장 승인 */
function reviewersFor(assignee) {
  const others = STAFF.filter(s => s.id !== assignee);
  return [others[0], others[1] || others[0]];
}

/* ---------- 자료 참조 엔진 ----------
   원칙: 켜진 자료 전체를 빠짐없이 활용한다.
   ① 관련성 — 업무·회의·질문의 키워드와 맞는 자료/구간을 우선 발췌
   ② 순환 — 관련 구간이 없으면 쓸 때마다 다른 자료·다른 구간을 발췌 (여러 업무에 걸쳐 전체 커버)
   ③ 배분 — 한 번의 호출 예산을 앞 자료가 독식하지 않고 전 자료에 나눠 씀
   AI 호출당 컨텍스트는 유한하므로, "제한 없음"은 이 순환 커버로 달성한다. */
let docUse = store.get("docUse", {}); // { docId: { n: 사용 횟수, pos: 다음 발췌 위치 }, __snip: 문장 순환 카운터 }

function refTokens(query) {
  return [...new Set(String(query || "").toLowerCase()
    .split(/[^0-9a-z가-힣]+/).filter(w => w.length >= 2 && !/^(만들어|해줘|주세요|대한|위한|관련|버전|개선안)/.test(w)))].slice(0, 12);
}

function countOcc(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1 && n < 20) { n++; i += needle.length; }
  return n;
}

function scoreText(text, tokens) {
  if (!tokens.length) return 0;
  const low = text.toLowerCase();
  let score = 0;
  for (const tok of tokens) {
    let c = countOcc(low, tok);
    if (!c && tok.length >= 3) c = countOcc(low, tok.slice(0, -1)) * 0.7; // 조사 붙은 단어 대응 (예: "대본을"→"대본")
    score += Math.min(c, 6) * tok.length;
  }
  return score;
}

/* 큰 자료는 앞·중간·끝 표본으로 관련도만 빠르게 판단 */
function sampleScore(text, tokens) {
  if (text.length <= 4500) return scoreText(text, tokens);
  const mid = Math.floor(text.length / 2);
  return scoreText(text.slice(0, 1500) + text.slice(mid, mid + 1500) + text.slice(-1500), tokens);
}

/* 자료 안에서 질의와 가장 관련 있는 구간을 발췌. 관련 구간이 없으면 쓸 때마다 다음 구간으로 순환 */
function pickChunk(doc, tokens, size) {
  const text = doc.content;
  if (text.length <= size) return { text, hit: scoreText(text, tokens) > 0 };
  if (tokens.length) {
    const step = Math.max(Math.floor(size / 2), Math.ceil(text.length / 300));
    let best = -1, bestScore = 0;
    for (let i = 0; i < text.length; i += step) {
      const s = scoreText(text.slice(i, i + size), tokens);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0 && bestScore > 0) return { text: text.slice(best, best + size), hit: true };
  }
  const u = docUse[doc.id] = docUse[doc.id] || { n: 0, pos: 0 };
  const start = u.pos >= text.length ? 0 : u.pos;
  u.pos = start + size >= text.length ? 0 : start + size;
  return { text: text.slice(start, start + size), hit: false };
}

/* 켜진 자료 전체에서 발췌 목록을 만든다: 관련 자료는 두텁게, 나머지도 덜 쓴 순으로 고르게 */
function pickDocRefs(query, budget = 6000) {
  const enabled = docs.filter(d => d.enabled);
  if (!enabled.length) return [];
  const tokens = refTokens(query);
  const scored = enabled.map(d => ({
    d,
    s: scoreText(d.title, tokens) * 4 + sampleScore(d.content, tokens),
    used: (docUse[d.id] && docUse[d.id].n) || 0,
    r: Math.random()
  }));
  // 관련도 → 덜 쓴 자료 → 무작위 순으로 정렬해 매번 같은 자료만 보지 않게
  scored.sort((a, b) => (b.s - a.s) || (a.used - b.used) || (a.r - b.r));

  const relCount = scored.filter(x => x.s > 0).length;
  const out = [];
  let left = budget;
  for (const x of scored) {
    if (left < 250) break;
    let quota = x.s > 0
      ? Math.floor((budget * (relCount === scored.length ? 1 : 0.7)) / relCount)
      : Math.floor((budget * (relCount ? 0.3 : 1)) / Math.max(1, scored.length - relCount));
    quota = Math.max(300, Math.min(quota, 2500, left));
    const chunk = pickChunk(x.d, tokens, quota);
    if (chunk.text.trim()) {
      out.push({ title: x.d.title, text: chunk.text.trim(), hit: chunk.hit });
      left -= chunk.text.length;
      const u = docUse[x.d.id] = docUse[x.d.id] || { n: 0, pos: 0 };
      u.n++;
    }
  }
  store.set("docUse", docUse);
  return out;
}

/* 자료실의 강의 자료를 직원 업무에 반영 (관련 구간 발췌 + 순환) */
function staffKnowledge(limit = 6000, query = "") {
  const refs = pickDocRefs(query, limit);
  if (!refs.length) return "";
  return `\n\n[참고 자료 — 사장님이 학습시킨 강의/노트. 지금 업무와 관련된 구간을 골라 발췌함. 적극 활용할 것]\n` +
    refs.map(r => `▸ ${r.title}${r.hit ? " (관련 구간)" : ""}\n${r.text}`).join("\n\n");
}

function taskBrief(task) {
  const st = STAFF.find(s => s.id === task.assignee);
  if (!st) return `업무: ${task.title}\n위 업무의 결과물(초안)을 만들어줘.`;
  return `${staffPrompt(st)}${staffKnowledge(6000, task.title + " " + (task.note || ""))}${task.material ? `\n\n[수집 자료 — 이번 업무를 위해 모아온 실제 자료. 반드시 근거로 인용해 분석할 것]\n${task.material.slice(0, 12000)}` : ""}

──────────────
[오늘의 업무 지시]
${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}

인사나 질문 없이, 위 업무의 결과물 초안을 바로 쓸 수 있는 완성된 형태로 만들어서 보여줘.`;
}

function verifyBrief(task) {
  const [r1, r2] = reviewersFor(task.assignee);
  return `너는 SNS 마케팅 팀의 검증 패널이다. ${r1.name}(${r1.role})와 ${r2.name}(${r2.role}) 두 전문가의 관점을 모두 갖고 있다.
${skillBlock(r1.id)}${skillBlock(r2.id)}

${staffContext()}${staffKnowledge(3000, task.title)}

아래는 「${task.title}」 업무의 초안이다. 다음 3단계를 순서대로 수행하라:
1단계 (1차 교차검증): 두 전문가 관점에서 각각 오류, 빠진 것, 보완할 점을 찾는다.
2단계 (수정): 지적 사항을 모두 반영해 초안을 수정한다.
3단계 (재검토): 수정본을 다시 점검해 문제가 남아있지 않은지 확인하고 최종본을 확정한다.

출력 형식 (이 형식 그대로):
[검증 의견]
(발견한 문제와 보완점 요약 3~5줄)
[최종 결과물]
(바로 쓸 수 있는 완성본)

━━━ 초안 ━━━
${task.draft}`;
}

/* 교차검증 회의 연출: 담당자 + 검증자 2명이 회의 테이블에 모임 */
async function huddleTheater(task, critiqueSummary) {
  const [r1, r2] = reviewersFor(task.assignee);
  const lines = [
    ["pm", `「${task.title.slice(0, 14)}」 초안 나왔습니다. 1차 교차검증 시작할게요 🔍`],
    [r1.id, critiqueSummary ? `검증 의견: ${critiqueSummary.slice(0, 40)}…` : "제 관점에서 보완점 몇 가지 찾았어요 🔍"],
    [r2.id, "방향은 좋아요. 디테일만 보강하면 되겠는데요?"],
    [task.assignee, "지적 감사합니다! 바로 반영해서 재검토 올릴게요 💪"]
  ];
  for (const [who, line] of lines) postChat(who, line);

  if (officeState.meeting || chatterBusy) return; // 회의 중이면 채팅만
  chatterBusy = true;
  try {
    const spots = [[70, 16], [83, 16], [70, 34], [83, 34]];
    [task.assignee, r1.id, r2.id, "pm"].forEach((id, i) => moveAgent(id, ...spots[i]));
    await sleep(2100);
    for (const [who, line] of lines) {
      speak(who, line, 2400);
      await sleep(2600);
    }
    [task.assignee, r1.id, r2.id, "pm"].forEach(id => moveAgent(id, ...WORK_POS[id]));
  } finally {
    chatterBusy = false;
  }
}

function isQuickMode() {
  return (settings && settings.workMode) === "quick";
}

/* 단계 제출 처리 (수동 모드) */
function submitDraft(t, text) {
  if (isQuickMode()) {
    // 빠른 모드: 검증 없이 바로 보고
    t.result = text;
    t.status = "review";
    t.stage = "";
    store.set("tasks", tasks);
    archiveReport(t); // 보고서함 자동 보관
    logActivity(`${staffEmoji(t.assignee)} ${staffName(t.assignee)}: 「${t.title}」 결과물 제출 → 검토 대기 (빠른 모드)`);
    postChat(t.assignee, `「${t.title}」 결과물 올렸습니다. 검토 부탁드려요 👀`);
    speak(t.assignee, "결과물 올렸습니다! 검토 부탁드려요 👀");
    renderBoard(); updateOfficeStatuses();
    return;
  }
  t.draft = text;
  t.stage = "verify";
  store.set("tasks", tasks);
  logActivity(`${staffEmoji(t.assignee)} ${staffName(t.assignee)}: 「${t.title}」 초안 완성 → 1차 교차검증`);
  renderBoard(); updateOfficeStatuses();
  huddleTheater(t);
}

function submitVerified(t, text) {
  // [최종 결과물] 마커가 있으면 검증 의견과 분리 저장
  const m = text.split(/\[최종 결과물\]/);
  if (m.length > 1) {
    t.critique = m[0].replace(/\[검증 의견\]/, "").trim();
    t.result = m[1].trim();
  } else {
    t.result = text;
  }
  t.stage = "final";
  store.set("tasks", tasks);
  logActivity(`✔ 「${t.title}」 교차검증·보완·재검토 완료 → 매니저 최종 검토`);
  postChat(t.assignee, `「${t.title}」 보완 완료, 재검토까지 마쳤습니다 ✅`);
  renderBoard(); updateOfficeStatuses();
  finalReview(t);
}

/* 매니저 3차 최종 검토 → 검토 대기(보고) */
function finalReview(t) {
  if (t.finalizing) return;
  t.finalizing = true;
  speak("pm", `「${t.title.slice(0, 14)}」 3차 최종 검토 들어갑니다 🧐`, 3000);
  postChat("pm", `「${t.title}」 3차 최종 검토 중입니다 🧐`);
  setTimeout(() => {
    t.finalizing = false;
    if (t.status !== "doing" || t.stage !== "final") return;
    t.status = "review";
    t.stage = "";
    store.set("tasks", tasks);
    archiveReport(t); // 보고서함 자동 보관
    logActivity(`🧑‍💼 매니저: 「${t.title}」 3차 검토 통과 → 사장님 보고`);
    postChat("pm", `「${t.title}」 3차 검토 통과! 사장님께 보고 올립니다 📋`);
    speak("pm", "3차 검토 통과! 보고 올립니다 📋");
    renderBoard(); updateOfficeStatuses();
  }, 4000);
}

// 새로고침 등으로 멈춘 업무 재개: 최종 검토 단계 + 자동 작업 중이던 업무
function resumePendingFinals() {
  // 진행 플래그는 메모리 상태 — 새로고침 전에 저장된 잔재를 지워야 재개 필터에 걸리지 않는다
  tasks.forEach(t => { t.autoWorking = false; t.finalizing = false; });
  tasks.filter(t => t.status === "doing" && t.stage === "final").forEach(finalReview);
  // 자동 파이프라인 중간에 끊긴 업무는 이어서 실행 (초안 있으면 검증부터)
  tasks.filter(t => t.status === "doing" && t.stage !== "final")
    .forEach((t, i) => setTimeout(() => dispatchWork(t), 2000 + i * 1500));
}

/* ----- 자동 작업 (API 키 연결 시): 전 단계 자동 실행 ----- */
async function autoWork(task) {
  if (task.autoWorking) return;
  task.autoWorking = true;
  const st = STAFF.find(s => s.id === task.assignee);
  if (!st) { task.autoWorking = false; return; }
  const cleanPrompt = (s) => staffPrompt(s).replace(/\[시작 인사\][\s\S]*?(?=\[보유 스킬|$)/, "");
  const fail = (e, where) => {
    task.autoWorking = false;
    renderBoard();
    speak(task.assignee, "⚠️ 작업 중 문제가 생겼어요...");
    toast(`⚠️ ${where} 단계 자동 실행 실패: ${friendlyApiError(e)} — 카드의 지시서 복사로 수동 진행할 수 있어요.`, 6000);
  };

  try {
    // 빠른 모드: 한 번의 호출로 바로 보고
    if (isQuickMode()) {
      task.stage = "draft"; renderBoard();
      speak(task.assignee, "작업 시작합니다... 🔨", 2500);
      task.result = await aiChat(cleanPrompt(st) + staffKnowledge(6000, task.title + " " + (task.note || "")) + (task.material ? `\n\n[수집 자료 — 반드시 근거로 인용할 것]\n${task.material.slice(0, 12000)}` : ""),
        [{ role: "user", content: `인사나 질문 없이, 이 업무의 결과물을 바로 쓸 수 있는 완성된 형태로 만들어줘:\n${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}` }], () => {});
      task.status = "review";
      task.stage = "";
      task.autoWorking = false;
      store.set("tasks", tasks);
      archiveReport(task); // 보고서함 자동 보관
      logActivity(`${staffEmoji(task.assignee)} ${staffName(task.assignee)}: 「${task.title}」 결과물 제출 → 검토 대기 (빠른 모드)`);
      postChat(task.assignee, `「${task.title}」 결과물 올렸습니다. 검토 부탁드려요 👀`);
      speak(task.assignee, "결과물 올렸습니다! 검토 부탁드려요 👀");
      renderBoard(); updateOfficeStatuses();
      return;
    }

    // ① 팀원 초안 — 하위 모델로 토큰 절약 (팀장이 직접 맡은 업무면 상위 모델)
    if (!task.draft || task.stage === "draft") {
      task.stage = "draft"; renderBoard();
      speak(task.assignee, "초안 작업 시작합니다... 🔨", 2500);
      task.draft = await aiChat(cleanPrompt(st) + staffKnowledge(6000, task.title + " " + (task.note || "")) + (task.material ? `\n\n[수집 자료 — 반드시 근거로 인용할 것]\n${task.material.slice(0, 12000)}` : ""),
        [{ role: "user", content: `인사나 질문 없이, 이 업무의 결과물 초안을 바로 쓸 수 있는 완성된 형태로 만들어줘:\n${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}` }], () => {},
        tierModel(isTeamLead(task.assignee) ? "lead" : "staff"));
    }
    task.stage = "verify";
    store.set("tasks", tasks);
    // 팀장이 직접 쓴 초안은 과장이 검토 (자기 검토 방지)
    const lead = isTeamLead(task.assignee) ? { id: "pm", name: "매니저" } : teamLeadFor(task.assignee);
    const leadName = lead.id === "pm" ? "매니저(과장)" : `${lead.name}(${teamOf(task.assignee).name} 팀장)`;
    logActivity(`${staffEmoji(task.assignee)} ${staffName(task.assignee)}: 「${task.title}」 초안 완성 → ${leadName} 검토`);
    renderBoard();

    // ② 팀장 검토·수정 + 팀 회의 — 상위 모델 1회 호출로 지적과 수정본을 한 번에 (토큰 절약)
    speak(lead.id, "팀 검토 들어갑니다 🔍", 2500);
    const leadOut = await aiChat(
      `너는 ${leadName}이다. 팀원 ${st.name}(${st.role})이 올린 초안을 팀장으로서 검토하라: 오류·빠진 것·보완점을 찾고 직접 수정까지 마쳐라.\n출력 형식(딱 이 형식만):\n[검토 의견]\n- (최대 4개, 각 한 줄. 문제 없으면 "- 이상 없음")\n[수정본]\n(의견을 반영해 다듬은 결과물 전체 — 설명 없이 결과물만)\n\n${staffContext()}`,
      [{ role: "user", content: `업무: ${task.title}${task.note ? `\n(사장님 보완 요청: ${task.note})` : ""}\n\n━━━ 팀원 초안 ━━━\n${task.draft}` }], () => {},
      tierModel("lead"));
    const cut = leadOut.indexOf("[수정본]");
    const critique = (cut > -1 ? leadOut.slice(0, cut) : "").replace("[검토 의견]", "").trim() || "팀장 검토 완료 — 이상 없음";
    const revised = (cut > -1 ? leadOut.slice(cut + 5) : leadOut).trim() || task.draft;
    task.critique = `👔 ${leadName} 검토:\n${critique}`;
    huddleTheater(task, critique.split("\n")[0]); // 팀 회의 연출 (기다리지 않음)
    postChat(lead.id, `「${task.title}」 팀 검토·수정 완료. 팀 회의 거쳐 과장님께 올립니다 ✅`);
    task.stage = "final";
    store.set("tasks", tasks);
    logActivity(`👔 ${leadName}: 「${task.title}」 검토·수정 + 팀 회의 완료 → 과장 보고`);
    renderBoard();

    // ③ 과장(매니저) 전체 회의 → 재검토·보완 → 최종 보고서 — 상위 모델
    speak("pm", "전체 회의 소집! 최종 보고서 작성합니다 🧐", 2500);
    postChat("pm", `「${task.title}」 전체 회의 후 최종 검토 중입니다 🧐`);
    const final = await aiChat(
      `너는 SNS 마케팅 회사의 과장(매니저)이다. 팀장 검토를 거친 결과물을 전체 회의 관점에서 재검토하라: 지시 충족 여부·바로 사용 가능 여부를 확인하고 필요한 보완만 직접 반영하라. 첫 줄에 "✅ 최종 검토 통과 — (한 줄 총평)"을 쓰고, 그 아래에 사장님께 올릴 최종 보고서 전체를 출력하라.\n\n${staffContext()}`,
      [{ role: "user", content: `업무 지시: ${task.title}\n\n[팀장 검토 의견]\n${critique}\n\n━━━ 팀장 수정본 ━━━\n${revised}` }], () => {},
      tierModel("manager"));
    task.result = buildDeliverable(task, final);
    task.status = "review";
    task.stage = "";
    task.autoWorking = false;
    store.set("tasks", tasks);
    archiveReport(task); // 보고서함 자동 보관
    logActivity(`🧑‍💼 과장: 「${task.title}」 최종 보고서 완성 → 사장님 보고`);
    postChat("pm", `「${task.title}」 최종 보고서 올렸습니다! 사장님 승인 부탁드려요 📋`);
    speak("pm", "최종 보고서 올렸습니다! 📋");
    renderBoard();
    updateOfficeStatuses();
  } catch (e) {
    fail(e, STAGE_LABEL[task.stage] || "작업");
  }
}

/* ==================================================
   오프라인 초안 엔진 — AI 없이도 직원이 진짜 초안을 만들어 보고
   ================================================== */
function topicWord() {
  return ((settings && settings.topic) || "리빙").split(/[\s(·,]/)[0] || "리빙";
}

/* 해시태그 세트 — 내 주제에서 파생 (리빙 고정 → 어떤 주제든 일반화) */
function hashtagSet() {
  const t = topicWord();
  const base = [`#${t}`, `#${t}스타그램`, `#${t}꿀팁`, `#${t}기록`];
  // 부분 매칭 금지: '맛집'·'집밥'·'홈트' 같은 무관한 주제에 리빙 태그가 붙지 않게 정확히 일치할 때만
  const LIVING = ["리빙", "인테리어", "살림", "집", "홈", "집꾸미기", "홈스타일링", "홈데코", "정리", "수납"];
  const extra = LIVING.includes(t)
    ? ["#집스타그램", "#인테리어", "#살림꿀팁", "#정리정돈", "#홈스타일링", "#자취꿀템"]
    : [`#${t}일상`, `#${t}추천`, `#${t}루틴`, "#일상기록", "#꿀팁공유", "#소통"];
  return [...new Set(base.concat(extra))].join(" "); // 주제어가 겹쳐도 중복 태그 없이
}

/* 계정 맥락 한 줄 (결과물 상단에 붙여 실제 계정 기준으로 맞춤) */
function acctLine() {
  const s = settings || {};
  const plat = (s.platforms || []).join("·") || "인스타그램";
  return `> 🎯 이 결과물의 기준 — 주제 **${topicWord()}** · 플랫폼 ${plat} · 목표 ${s.goal || "체험단 → 광고 수익"} · 수준 ${s.level || "초보"}`;
}
/* 팀이 통과시킨 품질 기준 (결과물 하단에 붙여 신뢰도 강화) */
function qualityNote() {
  return `\n\n## ✅ 팀 품질 기준 (이 결과물이 통과한 항목)\n- [x] 첫 3초/첫 줄에 후킹(결과·궁금증) 있음\n- [x] 저장·댓글·팔로우 중 하나를 부르는 CTA 있음\n- [x] 바로 촬영/발행 가능한 완성 형태\n- [x] ${topicWord()} 계정 톤·목표와 일치`;
}

/* 자료실에서 참고할 문장 발췌 — 질의와 관련된 문장 우선, 없으면 자료·문장을 순환 선택 (전 자료 커버) */
function docSnippets(n = 3, query = "") {
  const enabled = docs.filter(d => d.enabled);
  if (!enabled.length) return [];
  const tokens = refTokens(query);
  const pool = [];
  for (const d of enabled) {
    let sentences = d.content.replace(/\s+/g, " ").split(/(?<=[.!?다요])\s/)
      .map(s => s.trim()).filter(s => s.length > 15 && s.length < 90);
    if (sentences.length > 120) { // 큰 자료는 전체에서 고르게 표본 추출
      const stride = Math.ceil(sentences.length / 120);
      sentences = sentences.filter((_, i) => i % stride === 0);
    }
    sentences.forEach(s => pool.push({ doc: d.title, id: d.id, text: s, score: scoreText(s, tokens) }));
  }
  if (!pool.length) return [];

  // ① 관련 문장 우선 (같은 자료는 최대 2문장 — 여러 자료가 고루 인용되게)
  const out = [];
  const perDoc = {};
  for (const p of pool.filter(x => x.score > 0).sort((a, b) => b.score - a.score)) {
    if ((perDoc[p.id] || 0) >= 2) continue;
    out.push(p); perDoc[p.id] = (perDoc[p.id] || 0) + 1;
    if (out.length >= n) return out;
  }
  // ② 부족하면 순환+랜덤: 호출마다 다른 자료의 다른 문장 (계속 같은 발췌만 보지 않게)
  const rest = pool.filter(p => !out.includes(p));
  const ids = [...new Set(rest.map(p => p.id))];
  const tick = docUse.__snip = ((docUse.__snip || 0) + 1) % 100000;
  store.set("docUse", docUse);
  for (let k = 0; out.length < n && rest.length && k < ids.length * 2; k++) {
    const id = ids[(tick + k) % ids.length];
    const cands = rest.filter(p => p.id === id);
    if (!cands.length) continue;
    const pick = cands[(tick * 7 + Math.floor(Math.random() * cands.length)) % cands.length];
    rest.splice(rest.indexOf(pick), 1);
    out.push(pick);
  }
  return out;
}

let refQuery = ""; // templateDraft 진입 시 현재 업무 제목 — snippetSection이 업무와 관련된 문장을 고르게 함
function snippetSection() {
  const snips = docSnippets(3, refQuery);
  if (!snips.length) return "";
  return `\n\n## 📚 학습 자료에서 참고한 내용\n` + snips.map(s => `> "${s.text}" — 『${s.doc}』`).join("\n");
}

/* ── 경쟁사 분석 기획서 엔진: 수집한 링크 자료 → 잘된 이유 → 내 계정 적용 ── */
function competitorDraft(head, t, goal, material) {
  const links = material.split(/\[링크 \d+\]/).map(s => s.trim()).filter(Boolean);
  const obs = links.slice(0, 5).map((chunk, i) => {
    const url = (chunk.match(/^https?:\/\/\S+/) || [""])[0];
    const body = chunk.replace(/^https?:\/\/\S+/, "").replace(/\s+/g, " ").trim();
    const quote = body.slice(0, 110) || "(내용 수집 실패 — 캡션을 자료실에 붙여넣으면 분석에 반영돼요)";
    return `| ${i + 1} | ${url ? url.slice(0, 46) : "-"} | ${quote}${body.length > 110 ? "…" : ""} |`;
  }).join("\n");
  return head(`경쟁사 분석 기획서 (${todayStr()})`) + `${acctLine()}

## 1. 수집 자료 관찰 (실제 수집 내용 기반)
| # | 출처 | 관찰된 내용 발췌 |
|---|---|---|
${obs || "| - | - | 수집된 자료 없음 — 분석실에서 링크를 다시 넣어주세요 |"}

## 2. 잘된 이유 분석 (4각도 공식)
| 각도 | 이들이 잘한 것 | 확인 포인트 |
|---|---|---|
| 🎣 후킹 | 첫 화면/첫 줄에서 결과·궁금증을 먼저 보여줌 | 수집 자료의 도입부가 질문·숫자·비포애프터인지 |
| 📐 포맷 | 저장을 부르는 반복 포맷(순서공개·체크리스트) 보유 | 같은 틀이 반복되는지 — 반복이 곧 브랜딩 |
| 💬 CTA | 저장·댓글을 직접 요청 ("저장해두세요", "OO라고 남겨요") | 마지막 줄 행동 유도 문구 |
| 🗓️ 일관성 | 주제·톤 통일 + 꾸준한 업로드 | 프로필 첫 9칸의 통일감 |

## 3. 내 ${t} 계정 적용 기획서 (바로 실행 3안)
| 안 | 무엇을 | 이들에게서 가져올 것 | 첫 실행 |
|---|---|---|---|
| A | 반복 포맷 1개 확정 | 위 자료의 저장형 포맷 구조 | 이번 주 같은 틀로 2개 발행 |
| B | 후킹 규칙 도입 | 첫 3초/첫 줄 공식 | 다음 게시물 첫 줄을 질문·숫자로 교체 |
| C | CTA 고정 문구 | 마무리 행동 유도 말투 | 캡션 끝에 저장 유도 한 줄 고정 |

## 4. 이번 주 체크리스트
□ 위 3안 중 1개 선택 □ 선택한 포맷으로 콘텐츠 1개 제작(지시 한 줄이면 됩니다) □ 발행 이틀 뒤 저장수 비교 기록

**대표 결정 요청: A/B/C 중 우선 적용안 선택 — 선택하시면 해당 포맷의 대본·캡션 제작 업무를 이어서 진행합니다.**${qualityNote()}` + snippetSection();
}

/* ── 체험단 공고 분석 엔진: 레이더 수집 목록 → 지원 우선순위 제안 ── */
function sponsorPlanDraft(head, t, goal, material) {
  const lines = material.split("\n").filter(s => s.trim().startsWith("-")).slice(0, 20);
  return head(`체험단 모집 공고 분석 — 지원 우선순위 (${todayStr()})`) + `${acctLine()}

## 1. 수집된 모집 공고 (최근 1개월, 레이더 수집분)
${lines.length ? lines.join("\n") : "- (수집 목록 없음 — 분석실 [📡 최근 1개월 수집]을 먼저 실행해 주세요)"}

## 2. 지원 우선순위 기준 (내 계정 기준)
1. **주제 일치**: ${t} 관련 공고 최우선 — 심사자가 계정 결을 봄
2. **후기 자산화**: 받은 제품이 콘텐츠 소재로 재사용 가능한가
3. **문턱**: 팔로워 조건이 낮거나 없는 공고부터 (이력 쌓기)

## 3. 지원 멘트 템플릿
"안녕하세요! ${t} 콘텐츠를 올리는 계정입니다. 실사용 후기를 저장형 콘텐츠(비포애프터·꿀팁 정리)로 제작해 도달을 만들어 드려요. 대표 콘텐츠: (링크 3개)"

## 4. 이번 주 실행
□ 위 목록에서 주제 일치 공고 3개 선정 □ 프로필·하이라이트 점검 □ 지원 멘트 보내고 결과 기록

**대표 결정 요청: 지원할 공고 3개 선택 (번호로) — 선택하시면 맞춤 지원 멘트를 개별 작성해 드립니다.**${qualityNote()}` + snippetSection();
}

/* ── 아이디어 기획 보고서 엔진: 사장님이 던진 아이디어 → 회의 → 실행안 ── */
function ideaPlanDraft(head, t, idea) {
  return head(`아이디어 기획 보고서 — "${idea}"`) + `
## 1. 기획 회의 요약
- 원안: "${idea}"
- 회의 결론: ${t} 계정의 결에 맞춰 **저장·공감을 부르는 실용 콘텐츠**로 발전시키는 것이 최적입니다.
- 왜 통하나: 구체적인 상황이 있는 아이디어는 첫 3초 후킹을 만들기 쉽고, "나도 해봐야지"라는 저장 행동으로 이어집니다.

## 2. 콘텐츠 각도 3안 (하나만 골라도 충분해요)
| 각도 | 형식 | 첫 화면(후킹) | 노리는 것 |
|---|---|---|---|
| A. 비포/애프터 | 릴스 | 지저분한 전 → 3초 뒤 완성 컷 | 도달·팔로우 |
| B. 순서 공개형 | 카드뉴스 | "${idea.slice(0, 18)}… 순서는 딱 3단계" | 저장 |
| C. 공감 실패담 | 사진+글 | "저만 이거 실패했나요?" | 댓글·소통 |

## 3. 릴스 대본 (A안 기준 — 촬영표)
| 초 | 화면 | 자막/나레이션 |
|---|---|---|
| 0-3 | 결과(완성 컷) 먼저 | "${idea.slice(0, 16)}… 이렇게 됩니다" |
| 3-10 | 과정 3컷 (빠른 컷 전환) | 단계 이름 자막 |
| 10-15 | 완성 + 꿀팁 한 줄 | "저장해두고 따라해보세요 📌" |

## 4. 업로드 캡션 (복사해서 쓰세요)
"${idea.slice(0, 24)}" — 생각보다 간단해요. 순서는 영상 그대로! 나중에 꼭 필요할 테니 저장해두세요 📌
${hashtagSet()}

## 5. 실행 체크리스트
□ 오늘: 재료/소품 준비, 촬영 동선 확인 (밝은 자연광 시간대)
□ 내일: 촬영 15분 + 편집 (캡컷 자동 자막)
□ 업로드 직후: 첫 댓글에 추가 꿀팁 1개 달기 (댓글 유도)

**사장님 결정 요청: A/B/C 중 선택하거나 보완 요청을 남겨주세요 — 선택안으로 촬영 지시서를 이어서 만듭니다.**` + snippetSection();
}

/* ── 벤치마킹 지식 엔진: 사장이 직접 찾아보지 않아도 되는 리서치 보고서 ── */
function benchDraft(head, t, goal) {
  return head(`벤치마킹 보고서 — ${t} 분야 인기 계정 분석`) + `
> 아래는 ${t} 분야에서 검증된 일반적 성공 패턴 기준이에요. 실시간 순위는 인스타그램에서 "${t}" 해시태그 인기 게시물을 확인하세요 (확인용 체크리스트 포함).

## 1. 잘 되는 계정의 4가지 유형
| 유형 | 특징 | 대표 후킹 패턴 | 우리가 배울 것 |
|---|---|---|---|
| 정리·수납 전문 | 비포/애프터가 무기 | "이게 3초 만에..." | 극적인 전후 대비 |
| 생활 꿀팁형 | 저장수가 팔로워를 만듦 | "모르면 손해인 ○가지" | 번호 리스트 + 저장 유도 |
| 감성 인테리어 | 통일된 색감·톤 | 무드 있는 첫 컷 | 피드 9칸 일관성 |
| 현실 자취/살림 | 공감 댓글이 활발 | "저만 이래요?" | 완벽하지 않은 진짜 모습 |

## 2. 공통 성공 공식 (전 유형)
- 첫 3초/첫 줄에 결과나 궁금증 (스크롤 스토퍼)
- 주 2~3회 고정 리듬 + 시리즈물 (2탄 예고로 팔로우 유도)
- 캡션 마지막 한 줄은 행동 유도 (저장/댓글 질문)
- 협찬 콘텐츠도 자기 스타일 유지 (광고 티 나는 순간 성장 정체)

## 3. 따라하면 안 되는 것
- 대형 계정의 "일상 잡담" 포스팅 — 팬덤이 있어야 통함
- 유행 밈 무리하게 끼워넣기 — 주제 일관성 훼손
- 팔로우 품앗이 — 도달률만 망가짐

## 4. 내 계정 적용 액션 5
1. 위 유형 중 내 성향과 가장 가까운 것 1개를 주력으로 선언
2. 이번 주 콘텐츠에 "전후 대비" 형식 1개 시도
3. 저장 유도형(체크리스트/○가지 팁) 1개 발행
4. 캡션 끝 행동 유도 문장 전 게시물 적용
5. 잘 된 게시물과 같은 형식으로 2탄 제작

## 5. 사장님 직접 확인 체크리스트 (10분)
□ 인스타 검색 → "${t}" 해시태그 → 인기 탭 상위 9개 열기
□ 각 게시물: 첫 문장(후킹) / 형식(릴스·카드뉴스) / 댓글 분위기 메모
□ 팔로워 대비 좋아요 5% 이상인 계정 2개 팔로우 → 다음 벤치마킹 회의 때 공유
— 목표(${goal})에 가까운 협찬 게시물이 있으면 캡션을 자료실에 붙여넣어 주세요. 분석해 드릴게요.` + snippetSection();
}

/* ── 카카오 이모티콘 시장 분석 + 기획 엔진 ── */
function emoticonKakaoDraft(head, t) {
  return head("카카오톡 이모티콘 시장 분석 + 캐릭터 기획안") + `
> 순위는 일반적 경향 기준이에요. 오늘의 실시간 인기는 카카오 이모티콘샵 > 인기 탭에서 확인하세요 (앱 5분).

## 1. 인기 이모티콘의 3대 계열 (꾸준히 강세)
| 계열 | 예시 스타일 | 왜 통하나 |
|---|---|---|
| 말랑 귀여움 + 헐렁 말투 | 둥근 몸통 동물, "고마웡" 같은 오타 말투 | 매일 써도 부담 없음 — 사용 빈도가 순위를 만듦 |
| B급 드립·병맛 | 대충 그린 그림체, 과장된 표정 | 웃기려고 보내는 수요, 스크린샷 공유로 확산 |
| 직장인·일상 공감 | 출근싫어/퇴근/월급 | "이거 완전 나야"로 선물하기 유발 |

## 2. 가장 많이 쓰이는 감정 슬롯 TOP 12 (구성표의 뼈대)
ㅋㅋㅋ웃음 / 하트·좋아 / 응·오키 / 싫어·절레절레 / 울음·서러움 / 부탁·애교 /
축하·박수 / 미안 / 놀람 / 피곤·눕기 / 배고파 / 안녕(인사·퇴장)

## 3. 틈새 기회 (경쟁 덜한 메리트 영역)
1. **${t}·살림 특화**: "청소 끝!", "빨래 개기 싫다", "설거지 지옥" — 주제 계정과 시너지, 팔로워가 1차 구매자
2. **상황 특화**: 자취생 장보기, 택배 기다림 — 대형 캐릭터가 안 다루는 구체 상황
3. **말투 특화**: 사투리·존댓말 과잉 — 지역·관계 니치
4. **시즌 선점**: 장마·김장·대청소 시즌 — 시즌 2주 전 출시가 유리

## 4. 우리 캐릭터 컨셉 2안
- A안 "걸레퀸": 청소 요정 컨셉, 둥근 몸+헤어밴드. 차별점: ${t} 계정과 세계관 공유 → 콘텐츠에 재등장
- B안 "미룸이": 할 일 미루는 게으른 생물. 차별점: 공감 계열 + 살림 상황 접목

## 5. 멈춰있는 이모티콘 32종 구성표 (A안 기준 발췌)
| # | 감정/상황 | 동작 | 문구 |
|---|---|---|---|
| 1 | 인사 | 걸레 흔들며 등장 | 안녕하세욤 |
| 2 | ㅋㅋㅋ | 데굴데굴 구르기 | ㅋㅋㅋㅋㅋ |
| 3 | 청소 완료 | 반짝이는 바닥 위 뿌듯 | 끝~! |
| 4 | 귀찮음 | 걸레 위에 눕기 | 내일 하자 |
| 5 | 부탁 | 눈 반짝 | 해주라... |
| 6~32 | 위 TOP12 슬롯 + ${t} 상황 20종으로 채움 | | |
(전체 32칸은 승인 후 이어서 작성하겠습니다)

## 6. 제작 준비물 & 심사 팁
- 규격: 360×360px PNG(투명), 멈춰있는 32종 — **이 앱 스튜디오 탭 > 이모티콘 스튜디오**에서 규격 맞춰 제작·검수 가능
- 반려 잦은 포인트: 텍스트만 큰 시안 / 기존 캐릭터 유사성 / 작게 봤을 때 안 보이는 디테일
- 제안 방법: emoticon.kakao.com > 제안하기 (무료, 결과 2~4주)

**사장님 결정 요청: A안/B안 중 선택 (또는 보완 요청)** — 선택하시면 32종 전체 구성표와 제작 일정 초안을 이어서 올리겠습니다.` + snippetSection();
}

/* ── 멀티 플랫폼 이모티콘 기획 엔진 ── */
function emoticonMultiDraft(head) {
  return head("플랫폼별 이모티콘 기획안 (라인·OGQ·밴드)") + `
> 같은 캐릭터로 여러 플랫폼에 내는 "원소스 멀티유즈" 전략입니다. 카카오 기획안의 캐릭터를 기준으로 작성했어요.

## 플랫폼 비교와 공략 순서
| 플랫폼 | 규격(대표) | 심사 특징 | 우리 전략 |
|---|---|---|---|
| ① OGQ(네이버) | 스티커 24종, 740×640 | 승인 문턱 낮음, 블로그·카페에서 사용 | **첫 출시로 추천** — 빠른 실적/후기 확보 |
| ② 카카오 | 32종, 360×360 | 심사 까다로움, 시장 최대 | OGQ 반응 반영해 완성도 높여 도전 |
| ③ 라인 | 8~40종 선택, 370×320 | 자율 등록(심사 완화), 글로벌 | 텍스트 없는 표정 위주 버전으로 확장 |
| ④ 밴드 | 카카오와 유사 | 중장년 사용자 多 | 존댓말·안부 인사 슬롯 강화 버전 |

## 플랫폼별 구성 조정 포인트
- OGQ: 블로그 반응용 슬롯 추가 (공감해요/정보 감사/이웃추가 환영)
- 라인: 문구 최소화 — 표정과 동작만으로 전달 (번역 불필요 = 글로벌 판매)
- 밴드: 명절 인사/건강 챙기세요/수고했어요 등 따뜻한 톤 6종 교체

## 출시 로드맵 (제안)
1주차: OGQ 24종 제작(스튜디오 탭 활용) → 제안
2~3주차: OGQ 피드백 반영 → 카카오 32종 제안
4주차: 라인 16종(무문구) 등록 / 밴드 버전 준비

## 수익 참고 (일반적 경향)
OGQ·라인은 소액이 길게, 카카오는 승인만 되면 규모가 큼. 첫 목표는 "심사 통과 실적 1개"로 잡는 걸 추천합니다.

**사장님 결정 요청: 공략 순서(①→②→③→④) 승인 또는 순서 변경 지시**` + snippetSection();
}

/* ── 스킬 기반 초안: 페르소나 (pm-skills user-personas 5필드) ── */
function personasDraft(head, t, goal) {
  return head(`타깃 페르소나 3인 — ${t} 계정`) + `
(user-personas 스킬 적용: 5필드 체계 · 서로 겹치지 않는 3인)

## 페르소나 ① "시작하는 지은" (26~32세 · 1인 가구)
- 핵심 목표(JTBD): 좁은 집을 내 취향의 공간으로 만들고 싶다
- 통증점: ⓐ뭘 사야 할지 모름 ⓑ실패 구매 경험 ⓒ시간 부족
- 기대 이득: 바로 따라하는 가이드 / 가성비 검증 / 5분 안에 읽히는 정보
- 인사이트: 구매 전 저장해두고 몰아서 봄 → **저장 유도형 콘텐츠**에 반응

## 페르소나 ② "살림 고수 미영" (35~45세 · 가족)
- 핵심 목표: 반복 살림 시간을 줄이고 싶다
- 통증점: ⓐ루틴 무너짐 ⓑ가족이 안 도와줌 ⓒ광고성 정보 불신
- 기대 이득: 실사용 후기 / 시간 절약 팁 / 진정성
- 인사이트: 댓글로 자기 노하우 공유를 즐김 → **질문형 캡션**에 반응

## 페르소나 ③ "구경하는 하나" (20대 초중반)
- 핵심 목표: 미래의 내 집을 상상하며 영감 수집
- 통증점: ⓐ지금은 실행 불가 ⓑ현실과 괴리 ⓒ긴 글 피로
- 기대 이득: 무드 있는 비주얼 / 짧은 릴스 / 대리만족
- 인사이트: 팔로우는 안 해도 공유는 함 → **릴스 도달**의 핵심층

## 적용 제안
주력 타깃은 ①, 콘텐츠 60%를 ①의 통증점 해결에. ${goal}에는 ②의 신뢰가 중요.
**사장님 결정 요청: 주력 페르소나 선택 (①/②/③)**` + snippetSection();
}

/* ── 스킬 기반 초안: 포지셔닝 (pm-skills positioning-ideas 선언문 템플릿) ── */
function positioningDraft(head, t, goal) {
  return head(`포지셔닝 선언문 — ${t} 계정`) + `
(positioning 스킬 적용: 경쟁 공백 → 차별화 5안 → 선언문)

## 경쟁 공백 (벤치마킹 보고서 기준)
완성된 결과만 보여주는 계정은 많고, **과정과 실패를 보여주는 계정은 적음**.

## 포지셔닝 선언문 3안
| 안 | 선언문 | 근거 |
|---|---|---|
| A | 유일하게 ${t}에서 **초보의 시행착오까지** 보여주는 계정 | 공감·신뢰 → 체험단 전환에 유리 |
| B | 유일하게 **하루 10분 실천**만 다루는 ${t} 계정 | 진입장벽 최소화 → 저장·재방문 |
| C | 유일하게 **비포/애프터 숫자**(시간·비용)를 기록하는 ${t} 계정 | 정보성 → 협찬 신뢰도 |

## 보조 메시지 (선택안에 맞춰 프로필·캡션에 반복 사용)
A안: "완벽하지 않아도 시작" / B안: "오늘 10분이면 돼요" / C안: "숫자로 증명하는 변화"

**사장님 결정 요청: A/B/C 선택 → 선택안으로 프로필·핵심 해시태그 개편안을 이어서 올립니다**` + snippetSection();
}

/* ── 스킬 기반 초안: 북극성 지표 (pm-skills north-star-metric) ── */
function northStarDraft(head, t, goal) {
  return head(`북극성 지표 설계 — ${t} 계정`) + `
(north-star 스킬 적용: 게임 분류 → 7기준 검증 → 인풋 지표)

## ① 게임 분류: Attention 게임 (체류·습관이 가치)

## ② 북극성 지표 제안: **주간 저장수**
검증(7기준): 전원 이해 ✓ / 고객가치(유용함의 증거) ✓ / 지속습관 ✓ / ${goal} 방향 일치 ✓ / 인사이트 탭에서 측정 ✓ / 콘텐츠로 직접 영향 ✓ / 팔로워·협찬의 선행지표 ✓
(팔로워 수는 결과 지표라 북극성으로 부적합 — 허수 가능)

## ③ 인풋 지표 (매주 기록 권장)
1. 주간 발행 수 (목표 3)
2. 저장 유도형 콘텐츠 비율 (목표 50%)
3. 게시물당 평균 저장수
4. 프로필 방문 → 팔로우 전환율

## 운영 루틴
매주 일요일: 인사이트에서 위 4개 기록 → 🎨 스튜디오 본부에 팔로워 기록 → 다음 주 콘텐츠에서 저장수 상위 형식 늘리기` + snippetSection();
}

/* ── 스킬 기반 초안: 회고 (gstack retro) ── */
function retroDraft(head) {
  const done = tasks.filter(x => x.status === "done").slice(0, 10);
  const reworked = tasks.filter(x => x.note && x.note.length);
  return head("스프린트 회고 (gstack Retro)") + `
## 이번 구간 완료 (${done.length}건)
${done.map(x => `- ✅ ${x.title} (${staffName(x.assignee)})`).join("\n") || "- (완료 업무 없음)"}

## 잘된 것 (Keep)
- 승인까지 완주한 업무 ${done.length}건 — 파이프라인이 돌고 있음
${docs.length ? `- 자료 ${docs.length}개가 업무에 반영되는 중` : ""}

## 아쉬운 것 (Problem)
${reworked.length ? `- 보완 요청 ${reworked.length}건: "${(reworked[0].note || "").slice(0, 30)}..." — 초안 단계에서 요구사항 확인 강화 필요` : "- 보완 요청 없음 — 다만 검토가 형식적이지 않았는지 점검"}
- 승인 대기 시간이 길어지면 흐름이 끊김

## 다음에 바꿀 것 (Try) — 3가지
1. 검토 대기 알림이 4건 이상 쌓이기 전에 하루 1회 승인 시간 확보
2. 보완 사유를 자료실에 기록해 같은 실수 반복 방지
3. 다음 구간 북극성 지표(주간 저장수) 기록 시작

**사장님 결정 요청: Try 3가지 승인 또는 수정**`;
}

function templateDraft(task) {
  refQuery = task.title + " " + (task.idea || ""); // 발췌가 이 업무 주제와 관련된 자료를 고르게
  const t = topicWord();
  const goal = (settings && settings.goal) || "체험단 협찬";
  const title = task.title;
  const head = (label) => `# ${label}\n(직원 회의로 작성한 초안 — AI를 연결하면 더 정교해져요)\n`;

  if (/^경쟁사 분석/.test(title)) return competitorDraft(head, t, goal, task.material || "");
  if (/^체험단 모집 공고 분석/.test(title)) return sponsorPlanDraft(head, t, goal, task.material || "");
  if (/^아이디어 기획/.test(title)) return ideaPlanDraft(head, t, task.idea || title.replace(/^아이디어 기획 — /, "").replace(/^"|"$/g, ""));
  if (/페르소나|타깃 정의/.test(title)) return personasDraft(head, t, goal);
  if (/포지셔닝|차별화 선언/.test(title)) return positioningDraft(head, t, goal);
  if (/북극성|지표 설계/.test(title)) return northStarDraft(head, t, goal);
  if (/회고/.test(title)) return retroDraft(head);

  if (/미디어킷|단가표|광고 단가/.test(title)) {
    return head("미디어킷 + 광고 단가표 초안 (협찬 제안 대비)") + `${acctLine()}

## 1. 계정 한 줄 소개 (미디어킷 첫 장)
"${t}을(를) 기록하는 실사용 후기형 계정 — 저장 중심 실용 콘텐츠로 광고 효과가 오래갑니다."

## 2. 제공 가능한 협찬 콘텐츠 메뉴
| 상품 | 구성 | 제작 기간 |
|---|---|---|
| 피드 1건 | 사진 5~10장 + 캡션 + 해시태그 | 3일 |
| 릴스 1건 | 15~30초 실사용 영상 + 커버 | 5일 |
| 피드+릴스 패키지 | 위 2종 + 스토리 1회 | 7일 |
| 공동구매 | 사전 체험 + 판매 기간 운영 | 협의 |

## 3. 단가 산정 공식 (업계 통용 기준 — 내 수치로 계산)
- 기본 공식: **팔로워 수 × 30~50원** = 피드 1건 기준선 (릴스는 1.5배)
- 보정: 평균 저장수가 팔로워의 3% 이상이면 +20%, 체험단 이력 있으면 +10%
- 초기(팔로워 <1천): 현물 협찬 + 소정 원고료(3~5만)부터 시작해 이력을 쌓는 전략 추천

## 4. 협찬 문의 응대 절차 (템플릿)
1) 감사 인사 + 미디어킷 전달 → 2) 제품·일정·가이드 확인 → 3) 단가·조건 회신 → 4) 계약(대금·2차 사용권 명시) → 5) 발행 후 성과 리포트 전달
답장 템플릿: "안녕하세요! 제안 감사합니다 😊 계정 소개와 진행 가능 옵션을 정리한 미디어킷을 보내드려요. 원하시는 형태(피드/릴스)와 일정 알려주시면 견적과 함께 회신드리겠습니다."

## 5. 지금 준비할 것
□ 인사이트 스크린샷 3장(도달·저장·팔로워) □ 대표 콘텐츠 3개 링크 □ 연락용 이메일 프로필에 표기

**대표 결정 요청: 단가 기준(30원/40원/50원) 중 선택 — 선택하시면 미디어킷 문서로 정리해 드립니다.**${qualityNote()}` + snippetSection();
  }

  if (/업무 가이드|용어집|온보딩/.test(title)) {
    return head("우리 회사 업무 가이드 & 용어집") + `${acctLine()}

## 1. 우리 회사가 일하는 방식 (결재선)
사장님 지시(또는 아이디어 던지기) → 담당 팀원 초안 → 팀장 검토·팀 회의 → 과장 최종 보고서 → **사장님 승인/보완**. 사장님이 하실 일은 승인 버튼 하나예요.

## 2. 부서별 담당 (누구에게 시키면 되나)
| 부서 | 이런 일 | 대표 지시 예 |
|---|---|---|
| 🎬 콘텐츠 제작부 | 기획·캡션·릴스·편집 | "릴스 대본 만들어줘" |
| 📈 성장 분석부 | 벤치마킹·페르소나·수치 | "경쟁 계정 분석해줘" |
| 💰 수익화·제휴부 | 체험단·협찬·단가표 | "협찬 답장 템플릿 만들어줘" |
| 🎨 크리에이티브 스튜디오부 | 이모티콘·굿즈·시안 | "이모티콘 기획해줘" |
| 📚 내부 교육부 | 자료 소화·요약·가이드 | "이 강의 요약해줘" |

## 3. 초보 사장님 용어집 (5개만 먼저)
- **도달**: 내 게시물을 본 사람 수 — 새 손님이 얼마나 왔나
- **저장수**: 나중에 보려고 저장한 수 — 알고리즘이 가장 좋아하는 신호
- **CTA**: 행동 유도 문구 — "저장해두세요" 같은 마지막 한 줄
- **후킹**: 첫 3초/첫 줄에 시선을 잡는 장치
- **미디어킷**: 협찬사에 보내는 우리 계정 소개서

## 4. 하루 10분 운영 루틴
아침: 검토 대기 승인(3분) → 점심: 댓글 답장(4분) → 저녁: 내일 소재 한 줄 아이디어 던지기(3분)` + snippetSection();
  }


  if (/이모티콘|스티커/.test(title)) {
    return /라인|OGQ|밴드|플랫폼/.test(title) ? emoticonMultiDraft(head) : emoticonKakaoDraft(head, t);
  }
  if (/벤치마킹|인기 계정|리서치|경쟁/.test(title)) {
    return benchDraft(head, t, goal);
  }

  if (/컨셉|닉네임|소개|프로필/.test(title)) {
    const suffixes = ["로그", "노트", "다이어리", "클럽", "살롱", "기록", "하우스", "연구소", "상점", "온"];
    const names = suffixes.map(s => `${t}${s}`);
    return head("계정 컨셉 · 닉네임 · 소개글 초안") + `
## 컨셉 한 문장 (3안)
1. "${t}을(를) 처음 시작하는 사람의 눈높이 기록" — 같은 초보가 공감하기 좋아요
2. "매일 하나씩, 작은 ${t} 꿀팁" — 꾸준함이 무기인 컨셉
3. "비포/애프터로 보여주는 ${t} 변화" — 저장을 부르는 컨셉

## 닉네임 후보 10 (검색형 5 + 개성형 5)
${names.slice(0, 5).map((n, i) => `${i + 1}. ${n} — "${t}" 검색에 걸리기 좋음`).join("\n")}
6. 오늘의${t} — 데일리 느낌
7. ${t}하는집 — 친근한 공간 느낌
8. 소소한${t} — 부담 없는 톤
9. ${t}일기 — 기록 컨셉과 일치
10. 우리집${t} — 생활 밀착형

## 소개글 3버전 (누구인지 / 뭘 올리는지 / 팔로우 이유)
[담백] ${t} 초보의 진짜 기록 | 매주 3번, 실패담까지 올려요 | 같이 성장해요 🌱
[정보형] 바로 따라하는 ${t} 꿀팁 | 저장하고 두고두고 보세요 | ${goal} 문의 DM
[감성] 조금씩 나아지는 우리집 | ${t}이 취미가 되는 순간들 | 편하게 구경오세요 ☕` + snippetSection();
  }

  if (/릴스|대본|영상|쇼츠/.test(title)) {
    return head("릴스 대본 3종 초안 (상황별)") + `${acctLine()}

## 후킹 문구 뱅크 (첫 3초 자막 — 골라 쓰기)
1. "이거 3분이면 끝나요" 2. "이거 모르면 손해" 3. "저만 이랬나요?" 4. "결론부터 보여드릴게요" 5. "${t} 초보가 제일 많이 하는 실수"

## ① 비포/애프터형 — "정리 전후"
| 초 | 화면 | 자막 |
|---|---|---|
| 0-3 | 어질러진 공간 클로즈업 | "이게 3분 뒤에..." |
| 3-10 | 정리 과정 3컷 빠르게 | 포인트마다 짧은 팁 |
| 10-15 | 완성 공간 천천히 | "저장해두고 따라해보세요" |
촬영팁: 폰을 같은 위치에 고정하고 전/후만 바꿔 찍기. 한 컷 버전도 가능.

## ② 꿀팁 나열형 — "${t} 꿀템/꿀팁 3가지"
| 초 | 화면 | 자막 |
|---|---|---|
| 0-3 | 결과부터 보여주기 | "이거 모르면 손해" |
| 3-12 | 팁 1→2→3 (각 3초) | 번호 + 한 줄 설명 |
| 12-15 | 전체 모습 | "더 많은 팁은 팔로우" |

## ③ 루틴형 — "아침 10분 ${t} 루틴"
| 초 | 화면 | 자막 |
|---|---|---|
| 0-3 | 타이머 켜는 손 | "딱 10분이면 됩니다" |
| 3-12 | 루틴 단계별 3컷 | 단계 이름 자막 |
| 12-15 | 끝난 공간 + 커피 | "내일 아침도 함께해요" |

## 업로드 세트 (촬영 후 바로 쓰기)
- 커버(썸네일) 문구: "${t}, 이렇게 바뀝니다" — 큰 글씨 1줄
- 업로드 캡션: 첫 줄에 후킹 → 순서 안내 → 저장 유도로 마무리
- 해시태그: ${hashtagSet()}

공통: 첫 3초 안에 결과나 궁금증을 보여줄 것. 음악은 잔잔한 어쿠스틱, 자막은 화면 하단 1/3 위로.${qualityNote()}` + snippetSection();
  }

  if (/캡션|해시태그|문구|카피/.test(title)) {
    return head("캡션 5종 + 해시태그 세트 초안") + `${acctLine()}

## 캡션 (상황별 5종 — 복사해서 사진 설명만 바꿔 쓰세요)
[감성] 오늘도 조금씩, 우리집이 좋아지는 중 🌿 (마지막 사진이 제일 뿌듯해요)
[정보형] 이 방법 하나로 ○○이 해결됐어요. 순서는 사진 순서대로! 저장해두세요 📌
[공감형] 저만 ○○ 이런 거 아니죠...? 댓글로 여러분 방법도 알려주세요 🙋
[저장유도] 나중에 꼭 필요한 ${t} 체크리스트. 지금 저장 안 하면 못 찾아요!
[소통형] 둘 중에 뭐가 나아요? 1번 vs 2번 — 댓글로 투표해주세요 👇

## 첫 댓글 전략 (고정 댓글에 달기 — 저장·체류 UP)
"👉 자세한 순서는 저장해두고 보세요! 궁금한 건 댓글 주시면 하나씩 답해드릴게요 🙌"

## 해시태그 세트 (대형+중형+소형 조합 — 복사용)
${hashtagSet()}
왜 섞나요? 대형(노출 기회) + 중형(체류) + 소형(상위 노출 가능성)을 함께 가져가기 위해서예요.${qualityNote()}` + snippetSection();
  }

  if (/체험단|지원|협찬/.test(title)) {
    return head("체험단 지원 문구 초안") + `
## 기본형 (플랫폼 지원서란에 붙여넣기)
안녕하세요! ${t} 일상을 기록하는 계정을 운영하고 있습니다.
제품을 실제 생활 공간에서 사용하는 모습을 비포/애프터 중심으로 보여드리며,
과장 없이 장단점을 솔직하게 담습니다. 가이드라인 기한을 철저히 지키고,
사진은 밝은 자연광에서 통일된 톤으로 촬영합니다. 정성스러운 리뷰 약속드립니다!

## 강조 포인트 (계정 상황에 맞게 1~2개 추가)
- "저장수가 높은 실용 콘텐츠 위주라 광고 효과가 오래 갑니다"
- "댓글 소통을 꾸준히 해서 팔로워 신뢰도가 높습니다"
- "인스타그램+블로그 동시 업로드 가능합니다"

## 지원 전 체크
□ 프로필 첫 화면 9개가 주제 통일되어 있는지 □ 협찬 문의 연락처가 프로필에 있는지 □ #광고 표기 준비` + snippetSection();
  }

  if (/아이디어|주제|기획|게시물|콘텐츠/.test(title)) {
    const snips = docSnippets(2, refQuery);
    return head("콘텐츠 아이디어 초안 (10개)") + `${acctLine()}

| # | 아이디어 | 형식 | 노리는 것 |
|---|---|---|---|
| 1 | ${t} 비포/애프터 | 릴스 | 도달 |
| 2 | 천원샵 ${t} 꿀템 5개 | 카드뉴스 | 저장 |
| 3 | 내가 실패한 ${t} 3가지 | 사진+글 | 공감·댓글 |
| 4 | 아침 10분 루틴 | 릴스 | 팔로우 |
| 5 | 서랍 정리 한 컷 과정 | 릴스(한컷) | 도달 |
| 6 | 계절 바뀔 때 체크리스트 | 카드뉴스 | 저장 |
| 7 | 우리집 최애 코너 소개 | 사진 | 소통 |
| 8 | 사기 전 vs 사고 난 후 | 릴스 | 공감 |
| 9 | 팔로워 질문 받아서 답하기 | 스토리→피드 | 소통 |
| 10 | 한 달 변화 모아보기 | 릴스 | 팔로우 |
${snips.length ? `\n## 자료 기반 아이디어 (+2)\n` + snips.map((s, i) => `${i + 11}. 『${s.doc}』에서: "${s.text.slice(0, 40)}..." → 이 내용을 실천해보는 콘텐츠`).join("\n") : ""}

## 이번 주 발행 3개 추천 (이유 포함)
1. **2번(꿀템 5개, 카드뉴스)** — 저장형으로 시작해 계정 신뢰를 쌓습니다.
2. **1번(비포/애프터, 릴스)** — 도달형으로 새 사람에게 퍼뜨립니다.
3. **4번(아침 루틴, 릴스)** — 팔로우 전환을 노립니다.
발행 순서: 2 → 1 → 4 (저장 → 도달 → 전환 흐름)${qualityNote()}`;
  }

  if (/준비|체크리스트/.test(title)) {
    return head("준비 체크리스트 초안") + `
□ 목적 한 줄로 정리 (무엇을 얻는 일정인지)
□ 필요한 준비물/자료 목록 만들기
□ 전날: 소재·장비(폰 충전, 조명) 점검
□ 당일: 사진/영상 소스 최소 10컷 확보 (나중에 콘텐츠로 재활용)
□ 끝난 뒤: 배운 점 3줄 메모 → 자료실에 기록` + snippetSection();
  }

  return head(title) + `
## 목적
${title} — ${goal}에 다가가기 위한 작업

## 초안 개요
1. 현재 상태 정리
2. 핵심 실행 3가지 (30분 안에 가능한 크기로)
3. 완료 기준: 결과물을 계정/기록에 반영했는가

## 다음 단계 제안
- 이 초안을 검토·승인하면 관련 후속 업무를 이어서 진행하겠습니다.` + snippetSection();
}

/* 완료 보고서를 회의 안건 → 회의록 → 결과물 → 기획안 구조로 조립 (사장님 승인용 문서) */
function buildDeliverable(task, body) {
  const worker = staffName(task.assignee);
  const teamName = teamOf(task.assignee).name;
  const leadName = isTeamLead(task.assignee) ? "매니저(과장)" : `${teamLeadFor(task.assignee).name}(${teamName} 팀장)`;
  const t = topicWord();
  // 결과물 본문에서 초안 머리말(# 라벨 / 안내 괄호줄)을 걷어내 결과 섹션에 깔끔히 넣는다
  const cleanBody = String(body || "").replace(/^#[^\n]*\n(?:\([^\n]*\)\n)?/, "").trim() || String(body || "");
  const critique = (task.critique || "").replace(/^👔[^\n:]*:\s*/, "").split("\n")[0].trim();
  const minutes = [
    `${worker}: ${teamName} 소속으로 초안을 준비했습니다. ${t} 계정 톤에 맞춰 바로 쓸 수 있는 형태로 구성했어요.`,
    `${leadName}: ${critique || "구성·필수 요소·말투를 점검하고 저장 유도 포인트를 보강했습니다."} 첫 3초 후킹을 강화하는 방향으로 수정 지시했습니다.`,
    `${worker}: 피드백 반영해 다듬어 재보고했습니다.`,
    `매니저(과장): 전체 회의에서 재검토 완료 — 지시 충족을 확인하고 대표님께 올릴 최종본으로 확정합니다.`
  ];
  return `# 📋 ${task.title} — 최종 보고서
> ${teamName} · 담당 ${worker} · 결재선: ${leadName} → 매니저(과장) → 대표(사장님) 승인 대기 · ${todayStr()}

## 1. 회의 안건
- 「${task.title}」의 방향을 확정하고, 바로 실행 가능한 결과물과 후속 기획안을 도출한다.
- 판단 기준: ${t} 계정의 결에 맞는가 · 저장/공감을 부르는가 · 사장님이 오늘 바로 쓸 수 있는가.

## 2. 회의록 (결재선 순서)
${minutes.map(m => `- ${m}`).join("\n")}

## 3. 결과물
${cleanBody}

## 4. 결과 기반 기획안 (다음 액션)
- 이 결과물을 이번 주 콘텐츠 캘린더에 편성하고 발행일을 지정합니다.
- 발행 후 저장수·댓글 반응을 기록해 다음 회의의 근거 자료로 축적합니다.
- 반응이 좋으면 같은 형식의 2탄을 제작해 시리즈로 확장합니다.

**대표(사장님) 결정 요청: 승인(완료) / 보완 요청 중 선택해주세요.**`;
}

/* 오프라인 자율 작업: 초안 → 검증 연출 → 보고 (AI 없이 작동) */
async function templateWork(task) {
  if (task.autoWorking) return;
  task.autoWorking = true;

  // 초안이 없으면 초안부터 (있으면 검증 단계부터 이어서 — 새로고침 복구 지원)
  if (!task.draft) {
    task.stage = "draft";
    renderBoard();
    speak(task.assignee, "초안 작업 시작합니다! 🔨", 2500);
    await sleep(2500 + Math.random() * 2000);
    if (task.status !== "doing") { task.autoWorking = false; return; } // 사용자가 삭제한 경우
    task.draft = templateDraft(task);
  }
  task.stage = "verify";
  store.set("tasks", tasks);
  logActivity(`${staffEmoji(task.assignee)} ${staffName(task.assignee)}: 「${task.title}」 초안 완성 → 1차 교차검증`);
  renderBoard();
  huddleTheater(task, "필수 요소와 구성 순서를 점검했습니다");
  await sleep(3500);
  if (task.status !== "doing") { task.autoWorking = false; return; }

  const twLeadName = isTeamLead(task.assignee)
    ? "매니저(과장)"
    : `${teamLeadFor(task.assignee).name}(${teamOf(task.assignee).name} 팀장)`;
  task.critique = `👔 ${twLeadName} 검토: 구성·필수 요소·말투 점검 완료 (팀 회의). AI 연결 시 내용 자체의 검토가 더 깊어져요.`;
  task.stage = "final";
  renderBoard();
  speak("pm", "과장 최종 검토 들어갑니다 🧐", 2500);
  await sleep(3000);
  if (task.status !== "doing") { task.autoWorking = false; return; }

  task.result = buildDeliverable(task, task.draft);
  task.status = "review";
  task.stage = "";
  task.autoWorking = false;
  store.set("tasks", tasks);
  archiveReport(task); // 보고서함 자동 보관
  logActivity(`🧑‍💼 매니저: 「${task.title}」 3차 검토 통과 → 사장님 보고`);
  postChat("pm", `「${task.title}」 검토 완료! 사장님께 보고 올립니다 📋`);
  speak("pm", "검토 통과! 보고 올립니다 📋");
  renderBoard();
  updateOfficeStatuses();
  promoteQueue(task.assignee);
}

/* 작업 배분: AI 키가 있으면 AI 파이프라인, 없으면 오프라인 초안 엔진 */
function dispatchWork(task) {
  if (!task || task.status !== "doing") return;
  if ((settings.apiKey || "").trim()) autoWork(task);
  else templateWork(task);
}

/* ==================================================
   자율 근무 엔진 (오토파일럿) — 지시 없이도 다음 일을 찾아서 함
   ================================================== */
const INITIATIVES = [
  { key: "brand", title: "계정 컨셉 한 문장 + 닉네임 후보 10개 + 소개글 3버전 초안", assignee: "brand", when: () => true },
  { key: "ideas9", title: "첫 9개 게시물 주제 리스트 초안", assignee: "planner", when: () => true },
  { key: "reels3", title: "릴스 대본 3가지 상황(비포애프터·꿀팁·루틴) 초안", assignee: "reels", when: () => true },
  { key: "caption", title: "바로 쓰는 캡션 5종 + 해시태그 세트 초안", assignee: "copywriter", when: () => true },
  { key: "review", title: "체험단 지원용 계정 소개 문구 초안", assignee: "review", when: () => true },
  { key: "docIdeas", title: "학습 자료를 반영한 콘텐츠 아이디어 10개", assignee: "planner", when: () => docs.some(d => d.enabled) },
  { key: "bench", title: "벤치마킹 보고서 — 인기 계정 분석과 내 계정 적용 전략", assignee: "analyst", when: () => true },
  { key: "emoKakao", title: "카카오톡 이모티콘 시장 분석 + 우리 캐릭터 기획안", assignee: "emoti", when: () => true },
  { key: "emoMulti", title: "라인·OGQ·밴드 플랫폼별 이모티콘 기획안", assignee: "emoti", when: () => !!getAutoState().done.emoKakao },
  { key: "mediaKit", title: "미디어킷 + 광고 단가표 초안 (협찬 제안 대비)", assignee: "jr-partner", when: () => !!getAutoState().done.review },
  { key: "guide", title: "우리 회사 업무 가이드 & 용어집 (온보딩)", assignee: "jr-onboard", when: () => !!getAutoState().done.caption },
  { key: "personas", title: "타깃 페르소나 3인 정의 (user-personas 스킬)", assignee: "analyst", when: () => !!getAutoState().done.bench },
  { key: "positioning", title: "계정 포지셔닝 선언문 (positioning 스킬)", assignee: "brand", when: () => !!getAutoState().done.personas },
  { key: "northstar", title: "북극성 지표 설계 (north-star 스킬)", assignee: "planner", when: () => !!getAutoState().done.positioning }
];

function getAutoState() {
  return store.get("autoState", { done: {}, studied: {}, preparedEvents: {}, lastReportAt: 0, lastRunAt: 0 });
}

async function autoPilotTick(force = false) {
  if (!settings || !settings.autoPilot) return;
  if (officeState.meeting) return; // 회의 중에만 대기 (수다 연출은 방해 안 됨)
  const auto = getAutoState();
  if (!force && Date.now() - auto.lastRunAt < 45000) return;
  auto.lastRunAt = Date.now();
  store.set("autoState", auto);

  // 1) 새 자료가 있으면 스터디 회의부터 (자료를 팀 지식으로)
  const fresh = docs.find(d => !auto.studied[d.id] && !d.title.startsWith("📑"));
  if (fresh) {
    if (chatterBusy) return; // 연출 겹침 방지 — 다음 틱에 재시도
    auto.studied[fresh.id] = true;
    store.set("autoState", auto);
    postChat("pm", `새 자료 『${fresh.title}』 발견! 스터디 회의를 소집합니다 📖`);
    await studyMeeting(fresh.id, { silent: true });
    return;
  }

  // 2) 일이 쌓여있으면 새 일 벌이지 않기 (사장님 검토 대기 중이면 특히)
  const openCount = tasks.filter(t => t.status === "todo" || t.status === "doing").length;
  const reviewCount = tasks.filter(t => t.status === "review").length;
  if (openCount >= 2 || reviewCount >= 4) return;

  // 3) 다가오는 일정(3일 내) 준비
  const soon = new Date(); soon.setDate(soon.getDate() + 3);
  const ev = events.find(e => e.date >= todayStr() && e.date <= todayStr(soon) && !auto.preparedEvents[e.id]);
  if (ev) {
    auto.preparedEvents[ev.id] = true;
    store.set("autoState", auto);
    postChat("pm", `일정 「${ev.title}」(${ev.date})이 다가와서 준비 작업을 잡았습니다 🗓️`);
    const t = createTask(`「${ev.title}」 준비 체크리스트`, "planner");
    renderBoard(); updateOfficeStatuses();
    dispatchWork(t);
    return;
  }

  // 4) 다음 우선 업무를 스스로 선정
  const next = INITIATIVES.find(it =>
    !auto.done[it.key] && it.when() && !tasks.some(t => t.title === it.title));
  if (next) {
    auto.done[next.key] = true;
    if (next.key === "bench") auto.lastBenchAt = Date.now(); // 주간 갱신 타이머 시작
    store.set("autoState", auto);
    postChat("pm", `기획 회의 결과, 다음 작업을 진행합니다: 「${next.title}」 → ${staffName(next.assignee)} 담당`);
    speak("pm", "다음 작업, 제가 알아서 배정했습니다! 🤖", 3000);
    const t = createTask(next.title, next.assignee);
    logActivity(`🤖 자율 근무: 「${next.title}」 자동 착수`);
    renderBoard(); updateOfficeStatuses();
    dispatchWork(t);
    return;
  }

  // 5) gstack Retro: 완료 8건 쌓일 때마다 스프린트 회고
  const doneCount = tasks.filter(t => t.status === "done").length;
  if (doneCount >= (auto.lastRetroAt || 0) + 8) {
    auto.lastRetroAt = doneCount;
    store.set("autoState", auto);
    postChat("pm", "완료 업무가 쌓여서 스프린트 회고를 진행합니다 (gstack Retro) 🔄");
    const rt = createTask(`스프린트 회고 — 완료 ${doneCount}건 시점 (retro 스킬)`, "planner");
    renderBoard(); updateOfficeStatuses();
    dispatchWork(rt);
    return;
  }

  // 6) 7일마다 벤치마킹 리서치 갱신 (첫 보고서 이후)
  if (auto.done.bench && Date.now() - (auto.lastBenchAt || 0) > 7 * 86400000) {
    auto.lastBenchAt = Date.now();
    store.set("autoState", auto);
    postChat("pm", "주간 벤치마킹 리서치를 갱신합니다 🔍");
    const bt = createTask(`주간 벤치마킹 업데이트 — 인기 계정 분석 (${todayStr()})`, "analyst");
    renderBoard(); updateOfficeStatuses();
    dispatchWork(bt);
    return;
  }

  // 7) 같은 자료로 반복 심화 스터디 회의 — 자료당 최대 3회, 매번 새 각도로 파고들어 최적화
  const enabledDocs = docs.filter(d => d.enabled && !d.title.startsWith("📑") && !d.title.startsWith("🇰🇷"));
  if (enabledDocs.length) {
    auto.deepCount = auto.deepCount || {};
    // 가장 덜 판 자료들 중에서 무작위로 골라 매번 같은 자료만 파지 않게
    const minRounds = Math.min(...enabledDocs.map(d => auto.deepCount[d.id] || 0));
    const cands = enabledDocs.filter(d => (auto.deepCount[d.id] || 0) === minRounds);
    const target = cands[Math.floor(Math.random() * cands.length)];
    const rounds = auto.deepCount[target.id] || 0;
    if (rounds < 3) {
      if (chatterBusy) return; // 연출 겹침 방지 — 다음 틱 재시도
      auto.deepCount[target.id] = rounds + 1;
      store.set("autoState", auto);
      postChat("pm", `『${target.title}』를 다시 파고드는 심화 스터디 회의를 엽니다 (${rounds + 2}회차) 🔁`);
      await studyMeeting(target.id, { silent: true, deep: rounds + 2 });
      return;
    }
  }

  // 8) 최적화 개선 라운드 — 초안이 소진돼도 루프가 멈추지 않게 핵심 자산을 계속 개선(vN)
  auto.improve = auto.improve || {};
  const IMPROVE = [
    { key: "reels", title: "릴스 대본 개선안", assignee: "reels" },
    { key: "caption", title: "캡션·해시태그 개선안", assignee: "copywriter" },
    { key: "ideas", title: "게시물 아이디어 개선안", assignee: "planner" },
    { key: "bench", title: "벤치마킹 심화 개선안", assignee: "analyst" }
  ];
  // 가장 적게 개선된 자산을 골라 다음 버전 착수 (라운드 순환 → 계속 돌아감)
  const pick = IMPROVE.slice().sort((a, b) => (auto.improve[a.key] || 0) - (auto.improve[b.key] || 0))[0];
  const ver = (auto.improve[pick.key] || 0) + 2; // v2부터 (v1 = 최초 초안)
  auto.improve[pick.key] = ver;
  store.set("autoState", auto);
  postChat("pm", `기획 회의 결과, 지난 결과물을 더 끌어올릴 개선 라운드를 진행합니다: 「${pick.title} v${ver}」 → ${staffName(pick.assignee)} 담당 🔧`);
  speak("pm", `개선 라운드 v${ver}, 알아서 착수합니다! 🔧`, 3000);
  const impTask = createTask(`${pick.title} v${ver} (${todayStr()})`, pick.assignee);
  logActivity(`🔁 자율 근무: 「${pick.title} v${ver}」 최적화 개선 착수`);
  renderBoard(); updateOfficeStatuses();
  dispatchWork(impTask);

  // 9) 3일마다 운영 보고서도 별도로 자동 작성
  if (Date.now() - (auto.lastReportAt || 0) > 3 * 86400000) {
    auto.lastReportAt = Date.now();
    store.set("autoState", auto);
    generateReport(true);
  }
}

function renderAutopilotBtn() {
  const btn = $("#autopilot-btn");
  if (!btn) return;
  const on = !!(settings && settings.autoPilot);
  btn.textContent = on ? "🤖 자율 근무 ON" : "💤 자율 근무 OFF";
  btn.classList.toggle("autopilot-off", !on);
}

/* ----- 업무 보드 (칸반) ----- */
const BOARD_COLS = [
  ["todo", "⏳ 대기"], ["doing", "🔨 진행 중"], ["review", "👀 검토 대기"], ["done", "✅ 완료"]
];

function promoteQueue(assignee) {
  if (agentActiveTask(assignee)) return;
  const next = tasks.filter(t => t.assignee === assignee && t.status === "todo").pop();
  if (next) {
    next.status = "doing";
    store.set("tasks", tasks);
    logActivity(`🧑‍💼 매니저: ${staffName(assignee)}의 대기 업무 「${next.title}」 자동 시작`);
    speak(assignee, "다음 업무 바로 시작합니다! 💪");
    renderBoard();
    updateOfficeStatuses();
    dispatchWork(next);
  }
}

/* ---------- 보고서 문서 뷰어: 웹에서 문서로 보고, 인쇄/PDF 저장 (브라우저 내장 인쇄 → 무의존성) ---------- */
let reportModalTask = null;
function openReportModal(t) {
  reportModalTask = t;
  $("#report-title").textContent = `📄 ${t.title}`;
  const team = teamOf(t.assignee);
  $("#report-meta").innerHTML =
    `<span>${staffEmoji(t.assignee)} ${escapeHtml(staffName(t.assignee))} (${escapeHtml(team.name)})</span>` +
    `<span>결재: 팀장 검토 → 과장 최종</span>` +
    `<span>${new Date(t.doneAt || Date.now()).toLocaleDateString("ko-KR")}</span>` +
    `<span>${t.status === "done" ? "✅ 승인 완료" : "🕐 검토 대기"}</span>`;
  $("#report-body").innerHTML = renderMarkdown(t.result || "");
  $("#report-modal").classList.remove("hidden");
}

function printReportDoc() {
  const t = reportModalTask;
  if (!t) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const d = frame.contentDocument;
  d.open();
  d.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(t.title)}</title><style>
    body { font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #262522; margin: 36px; line-height: 1.7; font-size: 13px; }
    h1 { font-size: 20px; border-bottom: 2px solid #2e7d5b; padding-bottom: 10px; }
    .meta { color: #6b6a63; font-size: 11px; margin-bottom: 22px; }
    h2, h3 { color: #1f5c42; margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #d8d5cc; padding: 6px 9px; text-align: left; font-size: 12px; }
    th { background: #f2f0ea; }
    blockquote { border-left: 3px solid #2e7d5b; margin: 8px 0; padding: 4px 12px; color: #55534b; }
    ul, ol { padding-left: 22px; }
    .footer { margin-top: 30px; color: #a9a69c; font-size: 10px; border-top: 1px solid #e5e2d9; padding-top: 8px; }
  </style></head><body>
    <h1>${escapeHtml(t.title)}</h1>
    <div class="meta">담당: ${escapeHtml(staffName(t.assignee))} (${escapeHtml(teamOf(t.assignee).name)}) · 결재: 팀장 검토 → 과장 최종 · ${new Date(t.doneAt || Date.now()).toLocaleDateString("ko-KR")}</div>
    ${renderMarkdown(t.result || "")}
    <div class="footer">🌱 센터(Senter) — 나의 AI 마케팅 멘토 팀 보고서</div>
  </body></html>`);
  d.close();
  // 인쇄 대화상자에서 "PDF로 저장"을 고르면 PDF 다운로드가 됩니다
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {}
    setTimeout(() => frame.remove(), 3000);
  }, 150);
}

/* ---------- 보고서함: 모든 기획서·보고서 자동 보관 ----------
   업무가 검토 대기(review)에 도달할 때마다 자동 저장 — 사장님이 따로 저장할 필요 없음.
   보완 재요청으로 새 버전이 오면 같은 항목이 v2, v3...로 업데이트됨. */
const REPORT_CATS = [
  { key: "analysis", label: "분석 리포트", emoji: "🔍", re: /분석|벤치마킹|회고|경쟁사|리포트|레이더|주간/ }, // 기획서보다 먼저 — "경쟁사 분석 기획서"는 분석으로
  { key: "plan", label: "기획서", emoji: "🗂️", re: /기획|아이디어|컨셉|캘린더|전략|포지셔닝|페르소나|북극성|로드맵/ },
  { key: "content", label: "콘텐츠", emoji: "🎬", re: /릴스|캡션|대본|해시태그|소개글|콘텐츠|게시물|프로필/ },
  { key: "money", label: "수익화", emoji: "💰", re: /미디어킷|단가|협찬|체험단|수익|공동구매/ },
  { key: "edu", label: "교육·가이드", emoji: "📚", re: /가이드|용어집|온보딩|교육|스터디|체크리스트/ },
  { key: "etc", label: "기타", emoji: "📄", re: /$^/ }
];
function classifyReport(title) {
  return (REPORT_CATS.find(c => c.re.test(title)) || REPORT_CATS[REPORT_CATS.length - 1]).key;
}

function archiveReport(t) {
  if (!t || !t.result) return;
  const now = Date.now();
  const ex = reports.find(r => r.taskId === t.id);
  if (ex) {
    ex.body = t.result;
    ex.status = "review";
    ex.version = (ex.version || 1) + 1;
    ex.updatedAt = now;
  } else {
    reports.unshift({
      id: now + "-" + Math.random().toString(36).slice(2, 6),
      taskId: t.id, title: t.title, assignee: t.assignee,
      cat: classifyReport(t.title), body: t.result,
      status: "review", version: 1, createdAt: now, updatedAt: now
    });
    reports = reports.slice(0, 200); // 보관 상한 (IndexedDB라 여유)
  }
  store.set("reports", reports);
  renderArchive();
}

function markReportDone(t) {
  const r = reports.find(x => x.taskId === t.id);
  if (r) { r.status = "done"; r.updatedAt = Date.now(); store.set("reports", reports); renderArchive(); }
}

/* 보고서함에서 보완 재요청 → 원 업무 재작업 (업무가 정리됐으면 이전 보고서를 참고자료로 새 업무 생성) */
function reworkFromReport(r, note) {
  const t = tasks.find(x => x.id === r.taskId);
  if (t && (t.status === "review" || t.status === "done")) {
    t.note = note;
    t.status = "doing"; t.stage = "draft";
    t.draft = ""; t.result = ""; t.critique = ""; // 비워야 재작업이 처음부터 (templateWork 이어가기 방지)
    store.set("tasks", tasks);
    logActivity(`↩ 보고서함에서 「${t.title}」 보완 재요청 → ${staffName(t.assignee)} 재작업`);
    postChat("boss", `「${t.title}」 보완 부탁해요: ${note.slice(0, 40)}`);
    renderBoard(); updateOfficeStatuses();
    dispatchWork(t);
  } else {
    const nt = createTask(r.title, r.assignee);
    nt.note = note;
    nt.material = `[이전 버전 보고서 — 이 내용을 바탕으로 보완할 것]\n${r.body.slice(0, 8000)}`;
    nt.reportId = r.id;
    store.set("tasks", tasks);
    renderBoard(); updateOfficeStatuses();
    dispatchWork(nt);
  }
  toast("↩ 보완 요청을 보냈어요! 직원이 다시 작업하면 이 보고서가 새 버전으로 업데이트돼요.", 5000);
}

let archCat = "";
function renderArchive() {
  const list = $("#arch-list");
  if (!list) return;
  const chipWrap = $("#arch-cats");
  chipWrap.innerHTML = "";
  const present = REPORT_CATS.filter(c => reports.some(r => r.cat === c.key));
  (reports.length ? [{ key: "", label: "전체", emoji: "📑" }, ...present] : []).forEach(c => {
    const chip = document.createElement("button");
    chip.className = "lib-cat-chip" + ((archCat || "") === c.key ? " on" : "");
    chip.textContent = `${c.emoji} ${c.label}` + (c.key ? ` ${reports.filter(r => r.cat === c.key).length}` : ` ${reports.length}`);
    chip.addEventListener("click", () => { archCat = c.key; renderArchive(); });
    chipWrap.appendChild(chip);
  });

  list.innerHTML = "";
  const shown = reports.filter(r => !archCat || r.cat === archCat);
  if (!shown.length) {
    list.innerHTML = `<div class="lib-empty">아직 보고서가 없어요.<br>사무실에서 지시를 내리면 완성된 기획서·보고서가 자동으로 여기 쌓여요! 📑</div>`;
    return;
  }
  shown.forEach(r => {
    const item = document.createElement("div");
    item.className = "lib-item arch-item";
    const cat = REPORT_CATS.find(c => c.key === r.cat) || REPORT_CATS[REPORT_CATS.length - 1];

    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = r.title;

    const badge = document.createElement("span");
    badge.className = "lib-cat";
    badge.textContent = `${cat.emoji} ${cat.label}`;

    const meta = document.createElement("div");
    meta.className = "lib-meta";
    meta.textContent = `${staffName(r.assignee)} · ${new Date(r.updatedAt).toLocaleDateString("ko-KR")}` +
      (r.version > 1 ? ` · v${r.version}` : "") + (r.status === "done" ? " · ✅승인" : " · 🕐검토중");

    const asTask = () => ({ title: r.title, assignee: r.assignee, result: r.body, status: r.status, doneAt: r.updatedAt });
    const viewBtn = document.createElement("button");
    viewBtn.textContent = "📄"; viewBtn.title = "문서로 보기";
    viewBtn.addEventListener("click", () => openReportModal(asTask()));
    const pdfBtn = document.createElement("button");
    pdfBtn.textContent = "🖨"; pdfBtn.title = "인쇄 / PDF로 저장 (다운로드)";
    pdfBtn.addEventListener("click", () => { reportModalTask = asTask(); printReportDoc(); });
    const reworkBtn = document.createElement("button");
    reworkBtn.textContent = "↩"; reworkBtn.title = "직원에게 보완 재요청 (보고서 업데이트)";
    reworkBtn.addEventListener("click", () => { form.classList.toggle("hidden"); form.querySelector("textarea").focus(); });

    // 보완 요청 폼 (철칙 7: prompt() 금지)
    const form = document.createElement("div");
    form.className = "task-form hidden";
    form.style.width = "100%";
    const ta = document.createElement("textarea");
    ta.rows = 2; ta.placeholder = "어떤 부분을 어떻게 고칠까요? (예: 단가표를 더 자세히, 예시를 리빙으로)";
    const send = document.createElement("button");
    send.className = "btn-small"; send.textContent = "↩ 보완 요청 보내기";
    send.addEventListener("click", () => {
      const note = ta.value.trim();
      if (!note) { ta.focus(); return; }
      form.classList.add("hidden"); ta.value = "";
      reworkFromReport(r, note);
    });
    form.append(ta, send);

    const row = document.createElement("div");
    row.className = "arch-row";
    row.append(title, badge, meta, viewBtn, pdfBtn, reworkBtn);
    item.append(row, form);
    list.appendChild(item);
  });
}

/* ---------- 경쟁사 분석: 링크 수집 → 잘된 이유 분석 → 내 계정 적용 기획서 ---------- */
async function runCompetitorAnalysis(urls) {
  urls = (urls || []).map(u => String(u).trim()).filter(u => /^https?:\/\//.test(u)).slice(0, 5);
  const status = $("#ca-status");
  if (!urls.length) { toast("⚠️ 링크를 한 줄에 하나씩 붙여넣어 주세요 (https://로 시작)"); return; }
  const parts = [];
  for (let i = 0; i < urls.length; i++) {
    if (status) status.textContent = `📥 링크 ${i + 1}/${urls.length} 수집 중...`;
    try {
      const text = await fetchLinkedPage(urls[i]);
      parts.push(`[링크 ${i + 1}] ${urls[i]}\n${text.slice(0, 4000)}`);
    } catch {
      parts.push(`[링크 ${i + 1}] ${urls[i]}\n(내용 수집 실패 — 로그인이 필요한 페이지예요. 게시물 캡션을 복사해 자료실에 넣으면 함께 분석돼요)`);
    }
  }
  if (status) status.textContent = "🔍 성장 분석부에 분석 배정!";
  const t = createTask(`경쟁사 분석 기획서 — 링크 ${urls.length}개 (잘된 이유 → 내 계정 적용)`, "analyst");
  t.material = parts.join("\n\n").slice(0, 15000);
  store.set("tasks", tasks);
  renderBoard(); updateOfficeStatuses();
  dispatchWork(t);
  toast("🔍 경쟁사 분석을 시작했어요! 완성되면 검토 대기와 보고서함에 기획서가 올라와요.", 5000);
  if ($("#ca-links")) $("#ca-links").value = "";
  setTimeout(() => { if (status) status.textContent = ""; }, 5000);
}

/* ---------- 체험단 모집 레이더 ----------
   인스타그램은 로그인 없이 직접 못 읽으므로(비공개 API), 검색엔진에 남은 공개 기록을 우회 수집:
   ① 프록시 경유 덕덕고(최근 1개월 필터) ② 웹 리더 경유 덕덕고 ③ 웹 리더 경유 구글(최근 1개월) */
let sponsorFeeds = store.get("sponsorFeeds", []); // [{url,title,cat,at}] — 작은 상태라 localStorage
const SP_CATS = [
  { key: "beauty", label: "뷰티", emoji: "💄", re: /뷰티|화장품|스킨|코스메|헤어|네일|메이크/ },
  { key: "food", label: "식품·맛집", emoji: "🍽️", re: /식품|맛집|음식|간식|음료|카페|디저트|식당|베이커리/ },
  { key: "living", label: "리빙·생활", emoji: "🏠", re: /리빙|인테리어|주방|수납|생활|가전|청소|홈/ },
  { key: "kids", label: "육아·키즈", emoji: "👶", re: /육아|아기|키즈|유아|장난감|맘/ },
  { key: "fashion", label: "패션", emoji: "👗", re: /패션|의류|옷|가방|신발|주얼리|악세/ },
  { key: "travel", label: "여행·숙박", emoji: "✈️", re: /여행|호텔|펜션|숙박|리조트|글램핑/ },
  { key: "etc", label: "기타", emoji: "📌", re: /$^/ }
];
function classifySponsor(text) {
  return (SP_CATS.find(c => c.re.test(text)) || SP_CATS[SP_CATS.length - 1]).key;
}

async function fetchSearchText(q) {
  const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&df=m`; // df=m = 최근 1개월
  try { const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(ddg)}`); if (r.ok) { const t = await r.text(); if (t.length > 500) return t; } } catch {}
  try { const t = await fetchViaJina(ddg); if (t) return t; } catch {}
  try { const t = await fetchViaJina(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbs=qdr:m`); if (t) return t; } catch {}
  return null;
}

function parseSponsorResults(text) {
  const items = [];
  let m;
  const aRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g; // 덕덕고 HTML
  while ((m = aRe.exec(text))) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) { try { url = decodeURIComponent(uddg[1]); } catch {} }
    items.push({ url, title: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  const mdRe = /\[([^\]]{4,120})\]\((https?:\/\/[^)\s]+)\)/g; // 웹 리더 마크다운
  while ((m = mdRe.exec(text))) items.push({ url: m[2], title: m[1].trim() });
  return items.filter(it => /instagram\.com/.test(it.url) && it.title.length >= 4);
}

async function collectSponsorFeeds() {
  const status = $("#sp-status");
  const btn = $("#sp-run");
  if (btn) btn.disabled = true;
  const t = topicWord();
  const queries = [`"체험단 모집" site:instagram.com`, `${t} 체험단 모집 인스타그램`, `체험단 모집 인스타 피드`];
  const found = [];
  const seen = new Set(sponsorFeeds.map(f => f.url));
  for (let i = 0; i < queries.length; i++) {
    if (status) status.textContent = `📡 우회 경로 ${i + 1}/${queries.length}에서 수집 중...`;
    const text = await fetchSearchText(queries[i]);
    if (!text) continue;
    for (const it of parseSponsorResults(text)) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      found.push({ url: it.url, title: it.title.slice(0, 90), cat: classifySponsor(it.title), at: Date.now() });
    }
    if (found.length >= 40) break;
  }
  if (btn) btn.disabled = false;
  if (!found.length && !sponsorFeeds.length) {
    if (status) status.textContent = "⚠️ 지금은 수집 경로가 모두 막혀 있어요 — 몇 분 뒤 다시 눌러주세요 (경로 3개를 번갈아 시도해요)";
    return 0;
  }
  sponsorFeeds = [...found, ...sponsorFeeds].slice(0, 120);
  store.set("sponsorFeeds", sponsorFeeds);
  if (status) status.textContent = found.length ? `✅ 새 모집글 ${found.length}건 수집! (최근 1개월)` : "새로운 글은 없었어요 — 기존 목록 유지";
  renderSponsorFeeds();
  return found.length;
}

let spCat = "";
function renderSponsorFeeds() {
  const list = $("#sp-list");
  if (!list) return;
  const chipWrap = $("#sp-cats");
  chipWrap.innerHTML = "";
  if (sponsorFeeds.length) {
    const present = SP_CATS.filter(c => sponsorFeeds.some(f => f.cat === c.key));
    [{ key: "", label: "전체", emoji: "📡" }, ...present].forEach(c => {
      const chip = document.createElement("button");
      chip.className = "lib-cat-chip" + ((spCat || "") === c.key ? " on" : "");
      chip.textContent = `${c.emoji} ${c.label} ${c.key ? sponsorFeeds.filter(f => f.cat === c.key).length : sponsorFeeds.length}`;
      chip.addEventListener("click", () => { spCat = c.key; renderSponsorFeeds(); });
      chipWrap.appendChild(chip);
    });
  }
  list.innerHTML = "";
  const shown = sponsorFeeds.filter(f => !spCat || f.cat === spCat);
  if (!shown.length) {
    list.innerHTML = `<div class="lib-empty">아직 수집된 모집글이 없어요.<br>[📡 최근 1개월 수집]을 누르거나, 사무실에 "체험단 모집 수집해줘"라고 지시해 보세요!</div>`;
    return;
  }
  shown.slice(0, 60).forEach(f => {
    const item = document.createElement("div");
    item.className = "lib-item";
    const cat = SP_CATS.find(c => c.key === f.cat) || SP_CATS[SP_CATS.length - 1];
    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = f.title;
    const badge = document.createElement("span");
    badge.className = "lib-cat";
    badge.textContent = `${cat.emoji} ${cat.label}`;
    const open = document.createElement("button");
    open.textContent = "🔗"; open.title = "인스타그램에서 열기";
    open.addEventListener("click", () => window.open(f.url, "_blank", "noopener"));
    const del = document.createElement("button");
    del.textContent = "🗑️"; del.title = "목록에서 지우기";
    del.addEventListener("click", () => { sponsorFeeds = sponsorFeeds.filter(x => x.url !== f.url); store.set("sponsorFeeds", sponsorFeeds); renderSponsorFeeds(); });
    item.append(title, badge, open, del);
    list.appendChild(item);
  });
}

function saveSponsorDigest() {
  if (!sponsorFeeds.length) { toast("⚠️ 먼저 수집을 실행해 주세요!"); return; }
  const byCat = {};
  sponsorFeeds.forEach(f => (byCat[f.cat] = byCat[f.cat] || []).push(f));
  const body = SP_CATS.filter(c => byCat[c.key]).map(c =>
    `## ${c.emoji} ${c.label} (${byCat[c.key].length}건)\n` + byCat[c.key].map(f => `- ${f.title}\n  ${f.url}`).join("\n")
  ).join("\n\n");
  const title = `체험단 모집 수집 (${todayStr()})`;
  const ex = docs.find(d => d.title === title);
  if (ex) ex.content = body;
  else docs.push({ id: Date.now() + "", title, content: body, enabled: true, cat: "money" });
  saveDocs();
  renderLibrary();
  toast("📚 자료실에 저장됐어요! 직원들이 체험단 지원 전략에 참고해요.");
}

let boardQuery = "";
let boardDept = "all"; // 부서 필터 (all | TEAMS[].id)

function renderBoardDeptFilter() {
  const wrap = $("#board-dept-filter");
  if (!wrap) return;
  const counts = {};
  tasks.forEach(t => { const d = teamOf(t.assignee).id; counts[d] = (counts[d] || 0) + 1; });
  const chips = [{ id: "all", label: "전체", icon: "📋", n: tasks.length }]
    .concat(TEAMS.map(t => ({ id: t.id, label: t.name, icon: t.icon, n: counts[t.id] || 0 })));
  wrap.innerHTML = "";
  chips.forEach(c => {
    const b = document.createElement("button");
    b.className = "chip board-dept-chip" + (boardDept === c.id ? " on" : "");
    b.textContent = `${c.icon} ${c.label}${c.n ? ` (${c.n})` : ""}`;
    b.addEventListener("click", () => { boardDept = c.id; renderBoard(); });
    wrap.appendChild(b);
  });
}

function renderBoard() {
  const kanban = $("#kanban");
  if (!kanban) return;
  renderBoardDeptFilter();
  // 열려있는 카드 폼(보완요청·초안 제출)의 입력 상태 보존 — 파이프라인이 수시로 재렌더해도 타이핑이 날아가지 않게
  const openForms = {};
  kanban.querySelectorAll(".task-card").forEach(c => {
    const form = c.querySelector(".task-form:not(.hidden)");
    if (!form || !c.dataset.id) return;
    const ta = form.querySelector("textarea");
    openForms[c.dataset.id] = { value: ta ? ta.value : "", focused: ta === document.activeElement };
  });
  kanban.innerHTML = "";
  const q = boardQuery.trim().toLowerCase();

  BOARD_COLS.forEach(([status, label]) => {
    const col = document.createElement("div");
    col.className = "kanban-col";
    let items = tasks.filter(t => t.status === status);
    if (boardDept !== "all") items = items.filter(t => teamOf(t.assignee).id === boardDept);
    if (q) items = items.filter(t =>
      t.title.toLowerCase().includes(q) || staffName(t.assignee).toLowerCase().includes(q));
    col.innerHTML = `<div class="kanban-col-head">${label} <span>${items.length}</span></div>`;

    items.forEach(t => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.dataset.id = t.id;

      const head = document.createElement("div");
      head.className = "task-assignee";
      const teamInfo = teamOf(t.assignee);
      head.innerHTML = `${staffEmoji(t.assignee)} ${escapeHtml(staffName(t.assignee))}` +
        `<span class="task-dept">${teamInfo.icon} ${escapeHtml(teamInfo.name)}</span>`;

      const title = document.createElement("div");
      title.className = "task-title";
      title.textContent = t.title;

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const addBtn = (label, cls, fn) => {
        const b = document.createElement("button");
        b.className = cls; b.textContent = label;
        b.addEventListener("click", fn);
        actions.appendChild(b);
      };

      if (status === "todo") {
        addBtn("▶ 지금 시작", "btn-small", () => {
          t.status = "doing";
          store.set("tasks", tasks);
          logActivity(`${staffEmoji(t.assignee)} ${staffName(t.assignee)}: 「${t.title}」 작업 시작`);
          renderBoard(); updateOfficeStatuses();
          dispatchWork(t);
        });
      }

      if (status === "doing") {
        if (t.autoWorking) {
          const w = document.createElement("span");
          w.className = "task-working";
          w.textContent = `🔨 ${STAGE_LABEL[t.stage] || "작업"} 진행 중...`;
          actions.appendChild(w);
        } else if (!(settings.apiKey || "").trim() && t.stage !== "final") {
          // API 키가 없어도 무료 AI로 자동 실행 (클릭 시 첫 1회 Puter 로그인 팝업)
          addBtn("🤖 자동 실행 (무료 AI)", "btn-small", () => {
            autoWork(t);
            renderBoard();
          });
        }
        if (t.autoWorking) {
          // 위에서 처리됨
        } else if (t.stage === "verify") {
          addBtn("🔍 검증 지시서 복사", "btn-small", async () => {
            try {
              await copyText(verifyBrief(t));
              toast("복사됨! 무료 AI 새 대화에 붙여넣으면 교차검증→수정→재검토를 한 번에 해줘요. 결과 전체를 [검증본 제출]로 가져오세요.");
            } catch { toast("⚠️ 복사 실패 — 다시 시도해주세요."); }
          });
          addBtn("📥 검증본 제출", "btn-small", () => {
            const form = card.querySelector(".task-form");
            form.classList.toggle("hidden");
            form.querySelector("textarea").focus();
          });
        } else if (t.stage === "final") {
          const w = document.createElement("span");
          w.className = "task-working";
          w.textContent = "🧐 매니저 3차 최종 검토 중...";
          actions.appendChild(w);
        } else {
          const quick = isQuickMode();
          addBtn(quick ? "📋 지시서 복사" : "📋 초안 지시서 복사", "btn-small", async () => {
            try {
              await copyText(taskBrief(t));
              toast(quick
                ? "복사됨! 무료 AI(Gemini 등) 새 대화에 붙여넣고, 결과물을 제출하세요."
                : "복사됨! 무료 AI(Gemini 등) 새 대화에 붙여넣고, 나온 초안을 [초안 제출]로 가져오세요.");
            } catch { toast("⚠️ 복사 실패 — 다시 시도해주세요."); }
          });
          addBtn(quick ? "📥 결과물 제출" : "📥 초안 제출", "btn-small", () => {
            const form = card.querySelector(".task-form");
            form.classList.toggle("hidden");
            form.querySelector("textarea").focus();
          });
        }
      }

      if (status === "review") {
        addBtn("✅ 승인 (완료)", "btn-small", () => {
          t.status = "done"; t.doneAt = Date.now();
          store.set("tasks", tasks);
          logActivity(`✅ 「${t.title}」 승인 완료 (${staffName(t.assignee)})`);
          postChat("boss", `「${t.title}」 승인! 수고했어요 👍`);
          postChat(t.assignee, "감사합니다! 🎉");
          speak(t.assignee, "승인 감사합니다! 🎉");
          renderBoard(); updateOfficeStatuses();
          promoteQueue(t.assignee);
          handoffToStudio(t);
          schedulePublishTodo(t);
          markReportDone(t); // 보고서함 상태도 ✅승인으로
        });
        addBtn("↩ 보완 요청", "btn-small", () => {
          const form = card.querySelector(".task-form");
          form.classList.toggle("hidden");
          form.querySelector("textarea").focus();
        });
      }

      if (status === "done" && t.result) {
        addBtn("📚 자료실 저장", "btn-small", () => {
          if (docs.some(d => d.title === `[결과물] ${t.title}`)) { toast("이미 자료실에 있어요!"); return; }
          docs.push({ id: Date.now() + "", title: `[결과물] ${t.title}`, content: t.result, enabled: false });
          saveDocs();
          renderLibrary();
          toast("📚 자료실에 저장됐어요! 필요할 때 스위치를 켜면 멘토·직원이 참고해요.");
        });
      }

      if (t.result && (status === "review" || status === "done")) {
        addBtn("📄 보고서 보기", "btn-small", () => openReportModal(t));
      }

      addBtn("🗑", "btn-small btn-task-del", () => {
        if (!confirm(`「${t.title}」 업무를 삭제할까요?`)) return;
        t.status = "deleted"; // 진행 중이던 자동 파이프라인이 다음 단계에서 스스로 멈추게 (가드: status !== "doing")
        tasks = tasks.filter(x => x.id !== t.id);
        store.set("tasks", tasks);
        renderBoard(); updateOfficeStatuses();
        promoteQueue(t.assignee);
      });

      card.append(head, title);

      // 진행 단계 표시 (파이프라인 — 꼼꼼 모드에서만)
      if (status === "doing" && t.stage && !isQuickMode()) {
        const stageEl = document.createElement("div");
        stageEl.className = "task-stage";
        const steps = ["draft", "verify", "final"];
        stageEl.innerHTML = steps.map(s => {
          const done = steps.indexOf(s) < steps.indexOf(t.stage);
          const cur = s === t.stage;
          return `<span class="stage-dot ${done ? "sd-done" : cur ? "sd-cur" : ""}"></span>`;
        }).join("") + `<span class="stage-text">${STAGE_LABEL[t.stage]}</span>`;
        card.appendChild(stageEl);
        const prog = document.createElement("div");
        prog.className = "task-progress";
        prog.innerHTML = `<i style="width:${{ draft: 33, verify: 66, final: 90 }[t.stage] || 10}%"></i>`;
        card.appendChild(prog);
      }

      if (t.critique && status !== "done") {
        const det = document.createElement("details");
        det.className = "task-result";
        det.innerHTML = `<summary>🔍 검증 의견 보기</summary>`;
        const pre = document.createElement("pre");
        pre.textContent = t.critique;
        det.appendChild(pre);
        card.appendChild(det);
      }

      const shownDoc = t.result || (t.stage === "verify" ? t.draft : "");
      if (shownDoc) {
        const det = document.createElement("details");
        det.className = "task-result";
        det.innerHTML = `<summary>📄 ${t.result ? "결과물" : "초안"} 보기</summary>`;
        const pre = document.createElement("pre");
        pre.textContent = shownDoc;
        det.appendChild(pre);
        const copyBtn = document.createElement("button");
        copyBtn.className = "btn-small";
        copyBtn.textContent = t.result ? "결과물 복사" : "초안 복사";
        copyBtn.addEventListener("click", async () => {
          try { await copyText(shownDoc); toast("복사됐어요!"); } catch {}
        });
        det.appendChild(copyBtn);
        card.appendChild(det);
      }

      card.appendChild(actions);

      if (status === "doing") {
        const form = document.createElement("div");
        form.className = "task-form hidden";
        const ta = document.createElement("textarea");
        ta.rows = 4;
        ta.placeholder = t.stage === "verify"
          ? "검증 지시서 결과(검증 의견 + 최종 결과물)를 통째로 붙여넣으세요"
          : isQuickMode() ? "무료 AI가 만들어준 결과물을 여기에 붙여넣으세요"
          : "무료 AI가 만들어준 초안을 여기에 붙여넣으세요";
        const save = document.createElement("button");
        save.className = "btn-small";
        save.textContent = "제출";
        save.addEventListener("click", () => {
          const v = ta.value.trim();
          if (!v) { ta.focus(); return; }
          if (t.stage === "verify") submitVerified(t, v);
          else submitDraft(t, v);
        });
        form.append(ta, save);
        card.appendChild(form);
      }

      if (status === "review") {
        // 보완 요청 입력 폼 (철칙: window.prompt() 금지 — 카드 안 폼 사용)
        const form = document.createElement("div");
        form.className = "task-form hidden";
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = "어떤 점을 보완할까요? 예: 말투를 더 친근하게, 해시태그 추가 (직원에게 전달됩니다)";
        const save = document.createElement("button");
        save.className = "btn-small";
        save.textContent = "↩ 보완 요청 보내기";
        save.addEventListener("click", () => {
          t.note = ta.value.trim();
          t.status = "doing"; t.stage = "draft";
          t.draft = ""; t.result = ""; t.critique = ""; // 이전 결과를 비워야 처음부터 다시 만든다
          store.set("tasks", tasks);
          logActivity(`↩ 「${t.title}」 보완 요청 → ${staffName(t.assignee)} 재작업`);
          if (t.note) postChat("boss", `「${t.title}」 보완 부탁해요: ${t.note}`);
          postChat(t.assignee, "피드백 확인! 보완해서 다시 올릴게요 💪");
          speak(t.assignee, "피드백 확인! 보완해서 다시 올릴게요 💪");
          renderBoard(); updateOfficeStatuses();
          dispatchWork(t);
        });
        form.append(ta, save);
        card.appendChild(form);
      }

      // 재렌더 전 열려있던 폼 복원 (입력 텍스트·포커스 유지)
      const saved = openForms[t.id];
      if (saved) {
        const form = card.querySelector(".task-form");
        const ta = form && form.querySelector("textarea");
        if (form && ta) {
          form.classList.remove("hidden");
          ta.value = saved.value;
          if (saved.focused) {
            requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
          }
        }
      }

      col.appendChild(card);
    });

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "kanban-empty";
      empty.textContent = q ? "검색 결과 없음" : "비어있음";
      col.appendChild(empty);
    }
    kanban.appendChild(col);
  });

  const open = tasks.filter(t => t.status === "todo" || t.status === "doing").length;
  const review = tasks.filter(t => t.status === "review").length;
  const done = tasks.filter(t => t.status === "done").length;
  $("#board-stats").textContent = `열린 업무 ${open} · 검토 ${review} · 완료 ${done}`;

  // 검토 대기 알림 배지 (사무실 탭)
  const badge = $("#office-badge");
  if (badge) {
    badge.textContent = review;
    badge.classList.toggle("hidden", review === 0);
  }
}

function renderOffice() {
  buildOffice();
  updateOfficeStatuses();
  renderBoard();
  renderActivity();
  renderTeamChat();
  renderAutopilotBtn();
  fitOffice();
}

/* ---------- 채팅 탭 ---------- */
let sending = false;

function renderPersonaBar() {
  const bar = $("#persona-bar");
  bar.innerHTML = "";
  const expanded = personaBarExpanded || !CORE_PERSONAS.includes(currentPersona);
  const visible = expanded ? PERSONAS : PERSONAS.filter(p => CORE_PERSONAS.includes(p.id));
  visible.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "persona-btn" + (p.id === currentPersona ? " active" : "");
    btn.innerHTML = `<span class="persona-emoji">${p.emoji}</span><span><span class="persona-name">${p.name}</span><span class="persona-role">${p.role}</span></span>`;
    btn.addEventListener("click", () => selectPersona(p.id));
    bar.appendChild(btn);
  });
  if (!expanded) {
    const more = document.createElement("button");
    more.className = "persona-btn persona-more";
    more.innerHTML = `<span class="persona-emoji">👥</span><span><span class="persona-name">팀원 더 보기</span><span class="persona-role">성장·카피·기획 (${PERSONAS.length - visible.length}명)</span></span>`;
    more.addEventListener("click", () => {
      personaBarExpanded = true;
      store.set("personaBarExpanded", true);
      renderPersonaBar();
    });
    bar.appendChild(more);
  }
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
    ? `📚 자료실의 자료 ${enabled}개를 전부 참고해요 — 질문과 관련된 부분을 골라 읽어요`
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
    // 저장 공간 보호: 페르소나당 최근 80개 메시지만 보관
    if (history.length > 400) chats[currentPersona] = history.slice(-400); // 저장은 넉넉히, AI 전송은 최근 20개만
    store.set("chats", chats);
  } catch (e) {
    liveEl.remove();
    // 오프라인 대체 답변: 질문과 관련된 자료 발췌 + 우회 방법 안내
    const snips = docSnippets(2, text);
    const fallback = [
      "지금은 AI에 연결할 수 없어서 정식 답변이 어려워요. 대신 도움이 될 만한 것들을 정리했어요:",
      snips.length ? "\n**📚 자료실에서 관련 내용 발췌**\n" + snips.map(s => `> "${s.text}" — 『${s.doc}』`).join("\n") : "",
      "\n**지금 할 수 있는 방법**",
      "- 🧑‍💼 AI 직원 탭에서 지시서를 복사해 무료 챗봇(Gemini 등)에 붙여넣기 (항상 작동)",
      "- 설정 탭에서 [무료 AI 연결 테스트] 눌러 재연결 시도",
      "- 인터넷 연결 확인 후 다시 질문"
    ].filter(Boolean).join("\n");
    history.push({ role: "assistant", content: fallback });
    store.set("chats", chats);
    renderChat();
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

/* ── 자료 자동 분류 + 제목 자동 생성 ──
   막 올린 자료도 내용을 훑어 분야를 배정하고, 제목이 없거나 대충이면 내용 기반 제목을 지어줌 (오프라인, 즉시) */
const DOC_CATS = [
  { key: "reels", label: "릴스·영상", emoji: "🎬", kw: ["릴스", "영상", "대본", "편집", "숏폼", "쇼츠", "촬영", "후킹", "컷"] },
  { key: "writing", label: "캡션·글쓰기", emoji: "✍️", kw: ["캡션", "글쓰기", "카피", "문구", "해시태그", "스토리텔링"] },
  { key: "strategy", label: "계정 전략", emoji: "🎯", kw: ["알고리즘", "팔로워", "프로필", "포지셔닝", "타겟", "페르소나", "노출", "도달", "계정 성장", "브랜딩"] },
  { key: "money", label: "수익화·협찬", emoji: "💰", kw: ["수익", "협찬", "체험단", "광고", "단가", "미디어킷", "공동구매", "판매", "상품", "고객", "매출", "부수입"] },
  { key: "creative", label: "이모티콘·굿즈", emoji: "🎨", kw: ["이모티콘", "굿즈", "캐릭터", "디자인", "일러스트", "시안"] },
  { key: "trend", label: "트렌드·벤치마킹", emoji: "📈", kw: ["트렌드", "벤치마킹", "급상승", "레퍼런스", "사례 분석", "인기 계정"] },
  { key: "edu", label: "교육·마인드", emoji: "📚", kw: ["마인드", "습관", "루틴", "회고", "목표", "동기", "강의", "공부", "워크북", "프롬프트"] },
  { key: "etc", label: "기타", emoji: "📄", kw: [] }
];

function classifyDoc(title, content) {
  const sample = ((title || "") + " " + String(content || "").slice(0, 8000)).toLowerCase();
  let best = "etc", bestScore = 0;
  for (const c of DOC_CATS) {
    let s = 0;
    for (const k of c.kw) s += Math.min(countOcc(sample, k), 8) * (k.length >= 3 ? 2 : 1);
    if (s > bestScore) { bestScore = s; best = c.key; }
  }
  return best;
}

function docCat(d) {
  return DOC_CATS.find(c => c.key === d.cat) || DOC_CATS[DOC_CATS.length - 1];
}

/* 파일명이 대충일 때(스크린샷·IMG 등) 내용으로 제목 생성 */
function isGenericName(name) {
  return !name || /^(img|image|스크린샷|screenshot|캡처|kakaotalk|제목\s*없|무제|다운로드|photo|사진|clipboard|스캔|scan|noname|새 문서|untitled)/i.test(name.trim());
}

function autoDocTitle(content) {
  const ctx = (String(content).match(/\[맥락\]\s*(.+)/) || [])[1]; // 이미지 분석의 맥락 한 줄이 최고의 제목
  if (ctx) return ctx.trim().slice(0, 30);
  const h = String(content).match(/^#+\s*(.+)$/m);
  if (h && h[1].trim().length >= 2) return h[1].trim().slice(0, 30);
  const first = String(content).replace(/\[이미지 자료[^\]]*\]/g, " ").replace(/\s+/g, " ").trim()
    .split(/(?<=[.!?다요])\s/).find(s => s.trim().length >= 8);
  const base = (first || String(content)).trim().slice(0, 24);
  return base ? base + (base.length >= 24 ? "…" : "") : "이름 없는 자료";
}

let libCat = ""; // 자료실 분야 필터 ("" = 전체)

function renderLibrary() {
  const list = $("#lib-list");
  list.innerHTML = "";
  if (!docs.length) {
    list.innerHTML = `<div class="lib-empty">아직 자료가 없어요.<br>강의 노트나 전자책 내용을 추가하면 멘토들이 훨씬 똑똑해져요! 📚</div>`;
  }
  // 분류가 없는 자료는 내용을 훑어 자동 배정 (기존 자료 포함, 한 번만)
  let classified = false;
  docs.forEach(d => { if (!d.cat) { d.cat = classifyDoc(d.title, d.content); classified = true; } });
  if (classified) saveDocs();

  // 분야 필터 칩 (전체 + 자료가 있는 분야만)
  const chipWrap = $("#lib-cat-chips");
  if (chipWrap) {
    chipWrap.innerHTML = "";
    const present = DOC_CATS.filter(c => docs.some(d => d.cat === c.key));
    if (present.length >= 2) {
      [{ key: "", label: "전체", emoji: "📚" }, ...present].forEach(c => {
        const chip = document.createElement("button");
        chip.className = "lib-cat-chip" + ((libCat || "") === c.key ? " on" : "");
        chip.textContent = `${c.emoji} ${c.label}`;
        chip.addEventListener("click", () => { libCat = c.key; renderLibrary(); });
        chipWrap.appendChild(chip);
      });
    } else libCat = "";
  }

  docs.filter(d => !libCat || d.cat === libCat).forEach(d => {
    const item = document.createElement("div");
    item.className = "lib-item" + (d.enabled ? "" : " off");

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    toggle.title = d.enabled ? "멘토가 이 자료를 참고 중" : "꺼짐 (참고 안 함)";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = d.enabled;
    cb.addEventListener("change", () => {
      d.enabled = cb.checked;
      saveDocs();
      renderLibrary();
      renderChat();
    });
    const slider = document.createElement("span");
    slider.className = "toggle-slider";
    toggle.append(cb, slider);

    const title = document.createElement("div");
    title.className = "lib-title";
    title.textContent = d.title;

    const cat = docCat(d);
    const catBadge = document.createElement("span");
    catBadge.className = "lib-cat";
    catBadge.textContent = `${cat.emoji} ${cat.label}`;
    catBadge.title = "내용을 분석해 자동 분류된 분야";

    const meta = document.createElement("div");
    meta.className = "lib-meta";
    meta.textContent = `${(d.content.length / 1000).toFixed(1)}천 자` + (d.url ? " · 🔗 연동" : "");

    let syncBtn = null;
    if (d.url) {
      syncBtn = document.createElement("button");
      syncBtn.textContent = "🔄"; syncBtn.title = "연동 페이지에서 최신 내용 다시 읽어오기";
      syncBtn.addEventListener("click", () => syncLinkedDoc(d));
    }

    const meetBtn = document.createElement("button");
    meetBtn.textContent = "📖"; meetBtn.title = "직원들과 이 자료로 스터디 회의 열기";
    meetBtn.addEventListener("click", () => studyMeeting(d.id));

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️"; editBtn.title = "수정";
    editBtn.addEventListener("click", () => editDoc(d));

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️"; delBtn.title = "삭제";
    delBtn.addEventListener("click", () => {
      if (!confirm(`"${d.title}" 자료를 삭제할까요?`)) return;
      docs = docs.filter(x => x.id !== d.id);
      saveDocs();
      renderLibrary();
      renderChat();
    });

    item.append(toggle, title, catBadge, meta, ...(syncBtn ? [syncBtn] : []), meetBtn, editBtn, delBtn);
    list.appendChild(item);
  });

  const total = docsTotalSize();
  const budget = KNOWLEDGE_CHAR_BUDGET;
  const enabledDocs2 = docs.filter(d => d.enabled);
  const enabledSize = enabledDocs2.reduce((s, d) => s + d.content.length, 0);
  let note = `전체 ${(total / 1000).toFixed(0)}천 자 저장 · 켜진 자료 ${enabledDocs2.length}개를 전부 참고해요`;
  if (enabledSize > budget) note += ` — 자료가 많으면 업무·질문과 관련된 구간을 골라 읽고, 매번 다른 구간을 순환해 전체를 빠짐없이 커버해요. 자료를 계속 추가해도 괜찮아요! 📚`;
  $("#lib-usage").textContent = note;
}

let editingDocId = null;

function openDocModal(doc) {
  editingDocId = doc ? doc.id : null;
  $("#dm-title").textContent = doc ? "📚 자료 수정" : "📚 자료 추가";
  $("#dm-name").value = doc ? doc.title : "";
  $("#dm-content").value = doc ? doc.content : "";
  updateDocModalSize();
  $("#doc-modal").classList.remove("hidden");
  (doc ? $("#dm-content") : $("#dm-name")).focus();
}

function updateDocModalSize() {
  const len = $("#dm-content").value.length;
  $("#dm-size").textContent = len ? `현재 ${(len / 1000).toFixed(1)}천 자` : "";
}

function saveDocModal() {
  const title = $("#dm-name").value.trim();
  const content = $("#dm-content").value.trim();
  if (!content) { $("#dm-content").focus(); toast("⚠️ 내용을 붙여넣어 주세요!"); return; }
  if (editingDocId) {
    const d = docs.find(x => x.id === editingDocId);
    if (d) { d.title = title || d.title; d.content = content; d.cat = classifyDoc(d.title, content); }
  } else {
    // 제목이 비면 내용을 분석해 자동 생성 + 분야 자동 분류
    const autoTitle = title || autoDocTitle(content);
    docs.push({ id: Date.now() + "", title: autoTitle, content, enabled: true, cat: classifyDoc(autoTitle, content) });
  }
  if (saveDocs()) toast(editingDocId ? "📚 자료가 수정됐어요!" : "📚 자료가 추가됐어요! 이제 멘토와 직원들이 이 내용을 참고해요.");
  $("#doc-modal").classList.add("hidden");
  editingDocId = null;
  renderLibrary();
  renderChat();
}

function addDocByPaste() { openDocModal(null); }
function editDoc(d) { openDocModal(d); }

/* ---------- 노션·웹 페이지 연동: 공개 링크만 넣으면 내용을 자동으로 읽어 자료실에 저장 ----------
   ① 노션 공개 페이지 전용 리더 → ② 범용 웹 리더(r.jina.ai) → ③ 프록시+HTML 정리 순으로 시도.
   전제: 노션에서 [공유] → [웹에 게시]가 켜져 있어야 함 (비공개 페이지는 브라우저만으로는 읽을 수 없음). */
function notionPageId(url) {
  const m = String(url).match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].replace(/-/g, "") : null;
}

/* 노션 리더의 블록 JSON → 읽기 좋은 텍스트. rootId를 주면 그 페이지 제목만 #으로, 하위 페이지는 목차 줄로 */
function notionBlocksToText(blocks, rootId) {
  const out = [];
  for (const key of Object.keys(blocks || {})) {
    const v = blocks[key] && blocks[key].value;
    if (!v || !v.properties || !v.properties.title) continue;
    const text = v.properties.title.map(seg => (Array.isArray(seg) ? seg[0] : "")).join("").trim();
    if (!text) continue;
    if (v.type === "page") {
      // 이 페이지 자신의 제목은 맨 앞에, 하위 페이지 링크는 목차 줄로 (본문은 따로 재귀 수집)
      if (!rootId || key.replace(/-/g, "") === rootId) out.unshift(`# ${text}`);
      else out.push(`▸ 하위 문서: ${text}`);
    }
    else if (/header/.test(v.type)) out.push(`\n## ${text}`);
    else if (v.type === "bulleted_list" || v.type === "numbered_list" || v.type === "to_do") out.push(`- ${text}`);
    else if (v.type === "quote" || v.type === "callout") out.push(`> ${text}`);
    else out.push(text);
  }
  return out.join("\n");
}

/* 노션 블록 맵에서 하위 페이지 id 목록 추출 */
function notionChildIds(blocks, rootId) {
  return Object.keys(blocks || {})
    .filter(k => {
      const v = blocks[k] && blocks[k].value;
      return v && v.type === "page" && k.replace(/-/g, "") !== rootId;
    })
    .map(k => k.replace(/-/g, ""));
}

async function fetchNotionPageBlocks(id) {
  const res = await fetch(`https://notion-api.splitbee.io/v1/page/${id}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function fetchViaJina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`);
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  return text.length > 50 && !/^error/i.test(text) ? text : null;
}

/* ---------- 이미지 자료 분석 (AI 비전) ----------
   강의 캡처 같은 PNG/JPG 속 글자와 맥락을 추출해 자료로 저장.
   철칙 5: ① 내 API 키(Claude 비전) → ② 무료 AI(Puter 비전) → ③ 없으면 안내 후 계속 (앱은 안 죽음) */
const VISION_PROMPT = "이 이미지는 강의·자료의 한 장면이야. ① 이미지 속 글자를 빠짐없이 그대로 옮겨 적어줘 (표는 마크다운 표로, 목록은 목록으로). ② 글자가 없는 도표·그래프·화면 구성은 무엇을 보여주는지 설명해줘. ③ 마지막 줄에 '[맥락] '으로 시작하는 핵심 한 줄 요약을 붙여줘. 한국어로만, 인사 없이 내용만.";

function visionAvailable() {
  return !!((settings && settings.apiKey || "").trim()) || !freeAiBroken;
}

/* 큰 이미지는 AI 전송 전에 축소 (비용·전송량 절약, 1568px이면 비전 인식에 충분) */
function shrinkImage(dataUrl, maxSide = 1568) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale >= 1) return resolve(dataUrl);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function anthropicVision(dataUrl, prompt) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("BAD_IMAGE");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": (settings.apiKey || "").trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: tierModel("staff"), // 이미지 추출은 팀원(하위) 모델로 토큰 절약
      max_tokens: 2048,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: prompt }
      ] }]
    })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) throw new Error("빈 응답");
  recordUsage(tierModel("staff"), (j.usage && j.usage.input_tokens) || 1600, (j.usage && j.usage.output_tokens) || estTokens(text), false);
  return text;
}

async function imageToText(dataUrl) {
  const small = await shrinkImage(dataUrl);
  if ((settings && settings.apiKey || "").trim()) return anthropicVision(small, VISION_PROMPT);
  if (freeAiBroken) throw new Error("NO_AI");
  const puter = await loadPuter().catch(() => { throw new Error("NO_AI"); });
  const resp = await puter.ai.chat(VISION_PROMPT, small); // Puter 비전: (프롬프트, 이미지 dataURL)
  const text = extractPuterText(resp).trim();
  if (!text) throw new Error("빈 응답");
  recordUsage("free", 1600, estTokens(text), true);
  return text;
}

/* 노션 블록 맵에서 이미지 URL 수집 (노션 이미지 프록시 경유 — 공개 페이지는 로그인 없이 접근됨) */
function notionImageUrls(blocks) {
  const urls = [];
  for (const key of Object.keys(blocks || {})) {
    const v = blocks[key] && blocks[key].value;
    if (!v || v.type !== "image") continue;
    const src = (v.format && v.format.display_source) || (v.properties && v.properties.source && v.properties.source[0] && v.properties.source[0][0]);
    if (src) urls.push(`https://www.notion.so/image/${encodeURIComponent(src)}?table=block&id=${key}&cache=v2`);
  }
  return urls;
}

async function fetchImageAsDataUrl(url) {
  const tries = [url, `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`];
  for (const u of tries) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size < 500 || blob.size > 4500000) continue; // 아이콘·초대형 파일 제외
      return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(blob); });
    } catch {}
  }
  return null;
}

// 쪽수 상한 없음 — 중복 방문 차단(seen)과 글자 상한(PDF_MAX_CHARS=100만 자)이 안전장치.
// LINKED_HARD_STOP은 비정상 상황(순환 링크 등)만 막는 넉넉한 백스톱.
const LINKED_HARD_STOP = 500;

/* 페이지 속 데이터베이스(표)의 행 페이지 id들 — 노션 워크북(1일차·2일차…)이 표 행으로 들어있는 경우 대응 */
async function notionTableRowIds(blocks) {
  const ids = [];
  for (const key of Object.keys(blocks || {})) {
    const v = blocks[key] && blocks[key].value;
    if (!v || !/^collection_view/.test(v.type)) continue;
    try {
      const res = await fetch(`https://notion-api.splitbee.io/v1/table/${key.replace(/-/g, "")}`);
      if (!res.ok) continue;
      const rows = await res.json();
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const rid = String(row.id || "").replace(/-/g, "");
        if (rid) ids.push(rid);
      }
    } catch {}
  }
  return ids;
}

/* 링크 하나로 페이지 + 하위 페이지 전체를 읽음. onProgress(문구)로 진행 상황 보고 */
async function fetchLinkedPage(url, onProgress) {
  const id = notionPageId(url);
  // ① 노션 전용 리더 — 하위 페이지·표 행을 쪽수 제한 없이 재귀 수집 (5쪽씩 병렬로 빠르게)
  if (id) {
    try {
      const seen = new Set([id]);
      let queue = [id];
      const out = [];
      const imgUrls = [];
      let pages = 0;
      let chars = 0;
      while (queue.length && pages < LINKED_HARD_STOP && chars < PDF_MAX_CHARS) {
        const batch = queue.splice(0, 5);
        const fetched = await Promise.all(batch.map(async pid => {
          try { return { pid, blocks: await fetchNotionPageBlocks(pid) }; } catch { return null; }
        }));
        for (const f of fetched.filter(Boolean)) {
          const text = notionBlocksToText(f.blocks, f.pid);
          if (text.trim()) { out.push(text.trim()); chars += text.length; }
          pages++;
          if (imgUrls.length < 20) imgUrls.push(...notionImageUrls(f.blocks).slice(0, 20 - imgUrls.length));
          const kids = notionChildIds(f.blocks, f.pid).concat(await notionTableRowIds(f.blocks));
          for (const cid of kids) {
            if (!seen.has(cid)) { seen.add(cid); queue.push(cid); }
          }
        }
        if (onProgress) onProgress(`📖 ${pages}쪽 읽음 · 남은 하위 페이지 ${queue.length}개... (${(chars / 1000).toFixed(0)}천 자)`);
      }
      let joined = out.join("\n\n──────────\n\n");
      // 페이지 속 이미지(강의 캡처 등)도 글자·맥락 추출해 함께 저장
      if (imgUrls.length && joined.trim().length > 20) {
        if (visionAvailable()) {
          let n = 0;
          for (const iu of imgUrls) {
            n++;
            if (onProgress) onProgress(`🖼️ 이미지 ${n}/${imgUrls.length} 분석 중... (글자·맥락 추출)`);
            try {
              const durl = await fetchImageAsDataUrl(iu);
              if (!durl) continue;
              joined += `\n\n[이미지 자료 ${n} — 추출 내용]\n${await imageToText(durl)}`;
            } catch (e) {
              if (String(e && e.message) === "NO_AI") break; // AI가 죽어도 텍스트 저장은 계속
            }
            if (joined.length > PDF_MAX_CHARS) break;
          }
        } else {
          joined += `\n\n(이 페이지에 이미지 ${imgUrls.length}개가 있어요 — 설정 탭에서 AI를 연결한 뒤 자료실의 🔄 새로고침을 누르면 이미지 속 글자와 맥락까지 분석해 저장돼요.)`;
        }
      }
      if (joined.trim().length > 20) return joined.slice(0, PDF_MAX_CHARS);
    } catch {}
  }
  // ② 범용 웹 리더 — 블로그·문서도 읽고, 노션이면 본문 속 하위 페이지 링크도 따라가 읽음
  try {
    const rootMd = await fetchViaJina(url);
    if (rootMd) {
      let all = rootMd;
      const childIds = [...new Set((rootMd.match(/notion\.(?:site|so)\/[^\s)"'\]]+/g) || [])
        .map(u => notionPageId(u)).filter(Boolean))].filter(x => x !== id);
      for (let i = 0; i < childIds.length; i++) {
        if (onProgress) onProgress(`📖 하위 페이지 ${i + 1}/${childIds.length} 읽는 중...`);
        try {
          const sub = await fetchViaJina(`https://www.notion.so/${childIds[i]}`);
          if (sub) all += `\n\n──────────\n\n${sub}`;
        } catch {}
        if (all.length > PDF_MAX_CHARS) break;
      }
      return all.slice(0, PDF_MAX_CHARS);
    }
  } catch {}
  // ③ 프록시로 HTML을 받아 태그 제거 (마지막 수단)
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const text = (await res.text())
        .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s{2,}/g, " ").trim();
      if (text.length > 200) return text.slice(0, PDF_MAX_CHARS);
    }
  } catch {}
  throw new Error("PAGE_UNREADABLE");
}

function linkedDocTitle(text, url) {
  const first = (text.split("\n").map(s => s.replace(/^#+\s*/, "").trim()).find(s => s.length >= 2) || "").slice(0, 40);
  if (first) return `🔗 ${first}`;
  try { return `🔗 ${new URL(url).hostname}`; } catch { return "🔗 연동 자료"; }
}

async function addLinkedDoc(url) {
  const status = $("#nm-status");
  const btn = $("#nm-fetch");
  url = (url || "").trim();
  if (!/^https?:\/\//.test(url)) { status.textContent = "⚠️ 주소를 확인해 주세요. https:// 로 시작하는 링크를 붙여넣으면 돼요."; return; }
  btn.disabled = true;
  status.textContent = "📖 페이지를 읽는 중이에요... (하위 페이지까지 읽어서 몇십 초 걸릴 수 있어요)";
  try {
    const text = await fetchLinkedPage(url, msg => { status.textContent = msg; });
    const existing = docs.find(d => d.url === url);
    if (existing) {
      existing.content = text;
      existing.syncedAt = Date.now();
      existing.cat = classifyDoc(existing.title, text);
    } else {
      const lt = linkedDocTitle(text, url);
      docs.push({ id: Date.now() + "", title: lt, content: text, enabled: true, url, syncedAt: Date.now(), cat: classifyDoc(lt, text) });
    }
    saveDocs();
    renderLibrary(); renderChat();
    $("#notion-modal").classList.add("hidden");
    const kilo = (text.length / 1000).toFixed(1);
    toast(existing ? `🔗 최신 내용으로 새로고침했어요! (${kilo}천 자)` : `🔗 하위 페이지까지 ${kilo}천 자를 읽어왔어요! 이제 멘토와 직원들이 이 내용을 참고해요.`);
    logActivity(`🔗 연동 자료 ${existing ? "새로고침" : "추가"} — ${(existing || docs[docs.length - 1]).title}`);
  } catch {
    status.textContent = /app\.notion\.com|notion\.so/.test(url)
      ? "⚠️ 이 주소는 노션 개인용 링크 같아요. 노션에서 [공유] → [웹에 게시]를 켠 뒤, 거기서 나오는 ○○○.notion.site 주소를 붙여넣어 주세요. 그래도 안 되면 내용을 복사해 [✍️ 붙여넣기로 추가]를 이용해 주세요."
      : "⚠️ 페이지를 읽지 못했어요. 노션이라면 [공유] → [웹에 게시]를 켜야 해요 (링크 공유만으로는 안 돼요). 게시를 켰는데도 안 되면 잠시 후 다시 시도하거나, 내용을 복사해서 [✍️ 붙여넣기로 추가]를 이용해 주세요.";
  } finally {
    btn.disabled = false;
  }
}

/* 연동 자료 새로고침 (자료실의 🔄 버튼) */
async function syncLinkedDoc(d) {
  toast(`🔄 『${d.title}』 최신 내용을 읽는 중...`, 30000);
  try {
    d.content = await fetchLinkedPage(d.url);
    d.syncedAt = Date.now();
    d.cat = classifyDoc(d.title, d.content);
    saveDocs();
    renderLibrary(); renderChat();
    toast("🔄 최신 내용으로 새로고침했어요!");
  } catch {
    toast("⚠️ 새로고침 실패 — 노션의 [웹에 게시]가 꺼졌거나 인터넷 문제일 수 있어요. 잠시 후 다시 시도해 주세요.", 6000);
  }
}

/* 앱 시작 시 오래된 연동 자료를 조용히 자동 새로고침 (6시간 지난 것만) — 복붙 없이 늘 최신 자료로 일하게 */
async function autoSyncLinkedDocs() {
  if (!navigator.onLine) return;
  const stale = docs.filter(d => d.url && Date.now() - (d.syncedAt || 0) > 6 * 3600000);
  let changed = 0;
  for (const d of stale.slice(0, 5)) {
    try {
      d.content = await fetchLinkedPage(d.url);
      d.syncedAt = Date.now();
      saveDocs();
      changed++;
      logActivity(`🔄 연동 자료 자동 새로고침 — ${d.title}`);
    } catch {} // 조용히 넘어감 — 다음 실행 때 재시도
  }
  if (changed) { renderLibrary(); renderChat(); }
}

/* PDF 텍스트 추출 (pdf.js — vendor에 내장, 첫 사용 시에만 로드) */
let pdfjsLoading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoading) return pdfjsLoading;
  pdfjsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/pdf.min.js";
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error("PDF 라이브러리를 불러오지 못했어요"));
    document.head.appendChild(s);
  });
  return pdfjsLoading;
}

const PDF_MAX_PAGES = 150;
const PDF_MAX_CHARS = 1000000; // 자료실이 IndexedDB로 옮겨져 여유가 커짐 (기존 30만 → 100만 자)

async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const maxPages = Math.min(pdf.numPages, PDF_MAX_PAGES);
  const out = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map(it => it.str).join(" "));
    if (out.join("").length > PDF_MAX_CHARS) break;
  }
  let text = out.join("\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, PDF_MAX_CHARS);
  if (pdf.numPages > maxPages) text += `\n\n(참고: 전체 ${pdf.numPages}쪽 중 앞 ${maxPages}쪽만 추출됨)`;
  return text;
}

async function addDocsByFiles(files) {
  let added = 0;
  const failed = [];
  toast("📄 파일을 읽는 중이에요...", 60000);

  for (const file of Array.from(files)) {
    try {
      let content;
      if (/\.pdf$/i.test(file.name)) {
        content = await extractPdfText(file);
        if (!content.trim()) {
          failed.push(`${file.name} — 글자를 찾지 못했어요 (사진으로 스캔된 PDF일 수 있어요)`);
          continue;
        }
      } else if (/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
        // 이미지 자료: AI 비전으로 글자·맥락 추출 (강의 캡처 대응)
        if (!visionAvailable()) { failed.push(`${file.name} — 이미지 분석에는 AI 연결이 필요해요 (설정 탭에서 API 키 또는 무료 AI 연결 후 다시 업로드)`); continue; }
        if (file.size > 4500000) { failed.push(`${file.name} — 이미지가 너무 커요 (4MB 이하로 줄여주세요)`); continue; }
        toast(`🖼️ ${file.name} 이미지 속 글자를 분석 중이에요...`, 60000);
        const durl = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => j(new Error("파일 읽기 실패")); fr.readAsDataURL(file); });
        try {
          content = `[이미지 자료: ${file.name}]\n${await imageToText(durl)}`;
        } catch (e) {
          failed.push(String(e && e.message) === "NO_AI"
            ? `${file.name} — 이미지 분석에는 AI 연결이 필요해요 (설정 탭)`
            : `${file.name} — 이미지 분석 실패 (${friendlyApiError(e)})`);
          continue;
        }
      } else {
        content = String(await file.text()).trim();
        if (!content) { failed.push(`${file.name} — 내용이 비어있어요`); continue; }
      }
      // 파일명이 대충이면(스크린샷·IMG 등) 내용을 분석해 제목 자동 생성
      const bare = file.name.replace(/\.(txt|md|markdown|pdf|png|jpe?g|webp|gif)$/i, "");
      const isImg = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      const niceTitle = isGenericName(bare) ? autoDocTitle(content) : bare + (isImg ? " (이미지)" : "");
      docs.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        title: niceTitle, content, enabled: true, cat: classifyDoc(niceTitle, content)
      });
      added++;
    } catch (e) {
      failed.push(`${file.name} — ${e.message || "읽기 실패"}`);
    }
  }

  if (added) {
    saveDocs();
    renderLibrary();
    renderChat();
  }
  if (added && !failed.length) toast(`📚 자료 ${added}개가 추가됐어요!`);
  else if (added && failed.length) toast(`📚 ${added}개 추가, ⚠️ 실패: ${failed[0]}`, 6000);
  else toast(`⚠️ 파일을 읽지 못했어요. ${failed[0] || "(.txt / .md / .pdf / 이미지 지원)"}`, 7000);
}

/* ==================================================
   생산성 탭 (Claude Desk에서 이식: 할 일·캘린더·메모·집중 타이머)
   ================================================== */
let todos = store.get("todos", []);
let events = store.get("events", []);
let notes = store.get("notes", []);
let focusLog = store.get("focusLog", {}); // { "2026-07-07": {count, minutes} }

const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ----- 할 일 ----- */
function addTodo() {
  const text = $("#todo-input").value.trim();
  if (!text) { $("#todo-input").focus(); return; }
  todos.unshift({ id: Date.now() + "", text, due: $("#todo-due").value || "", done: false });
  store.set("todos", todos);
  $("#todo-input").value = ""; $("#todo-due").value = "";
  renderTodos();
}

function ddayLabel(due) {
  if (!due) return "";
  const diff = Math.round((new Date(due + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  if (diff < 0) return `D+${-diff}`;
  if (diff === 0) return "D-DAY";
  return `D-${diff}`;
}

function renderTodos() {
  const list = $("#todo-list");
  if (!list) return;
  const sorted = [...todos].sort((a, b) =>
    (a.done !== b.done) ? (a.done ? 1 : -1) : ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
  list.innerHTML = "";
  if (!sorted.length) {
    list.innerHTML = `<div class="mission-empty">할 일을 추가해보세요. 마감일을 넣으면 D-day가 표시돼요.</div>`;
    return;
  }
  sorted.forEach(t => {
    const row = document.createElement("div");
    row.className = "todo-item" + (t.done ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = t.done;
    cb.addEventListener("change", () => {
      t.done = cb.checked;
      store.set("todos", todos);
      renderTodos();
      if (t.done) toast("🎉 완료! 잘하고 있어요.");
    });
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = t.text;
    row.append(cb, text);
    if (t.due) {
      const d = document.createElement("span");
      const label = ddayLabel(t.due);
      d.className = "todo-due " + (label === "D-DAY" || label.startsWith("D+") ? "due-hot" : "");
      d.textContent = label;
      d.title = t.due;
      row.appendChild(d);
    }
    const del = document.createElement("button");
    del.className = "btn-small btn-task-del";
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      todos = todos.filter(x => x.id !== t.id);
      store.set("todos", todos);
      renderTodos();
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

async function todoAiPriority() {
  const open = todos.filter(t => !t.done);
  if (!open.length) { toast("아직 할 일이 없어요!"); return; }
  const btn = $("#todo-ai-btn");
  btn.disabled = true; btn.textContent = "생각 중...";
  try {
    const result = await aiChat(
      `너는 SNS 마케팅 코치다. 사용자의 할 일 목록을 보고 어떤 순서로 하는 게 좋은지 추천하라. 형식: 추천 순서대로 번호 목록, 각 항목에 한 줄 이유. 마지막에 "오늘은 여기까지만!" 하고 현실적인 컷라인을 제안. 한국어로 간결하게.\n\n${staffContext()}`,
      [{ role: "user", content: "내 할 일 목록:\n" + open.map(t => `- ${t.text}${t.due ? ` (마감 ${t.due})` : ""}`).join("\n") }],
      () => {}
    );
    const box = $("#todo-ai-box");
    box.innerHTML = renderMarkdown(result);
    box.classList.remove("hidden");
  } catch (e) {
    // AI가 안 되면 마감일 기준 정렬 추천 (오프라인 대체)
    const sorted = [...open].sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
    const lines = sorted.map((t, i) => {
      const label = t.due ? ` — ${ddayLabel(t.due)} (${t.due})` : "";
      return `${i + 1}. **${t.text}**${label}`;
    });
    lines.push("", "💡 마감일 기준 순서예요. AI를 연결하면 내 상황에 맞춘 추천을 받을 수 있어요.");
    const box = $("#todo-ai-box");
    box.innerHTML = renderMarkdown(lines.join("\n"));
    box.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "🧠 우선순위 추천";
  }
}

/* ----- 캘린더 ----- */
let calCursor = { y: new Date().getFullYear(), m: new Date().getMonth() };
let selectedDate = todayStr();

function renderCalendar() {
  const cal = $("#calendar");
  if (!cal) return;
  const { y, m } = calCursor;
  $("#cal-title").textContent = `${y}년 ${m + 1}월`;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = todayStr();

  let html = ["일", "월", "화", "수", "목", "금", "토"].map(d => `<div class="cal-head">${d}</div>`).join("");
  for (let i = 0; i < first; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const has = events.some(e => e.date === dateStr);
    const cls = ["cal-cell", dateStr === today ? "today" : "", dateStr === selectedDate ? "selected" : ""].join(" ");
    html += `<div class="${cls}" data-date="${dateStr}">${d}${has ? '<span class="cal-dot"></span>' : ""}</div>`;
  }
  cal.innerHTML = html;
  cal.querySelectorAll(".cal-cell[data-date]").forEach(cell => {
    cell.addEventListener("click", () => {
      selectedDate = cell.dataset.date;
      renderCalendar();
      renderEventForm();
    });
  });
  renderEventForm();
}

function renderEventForm() {
  const form = $("#event-form");
  if (!form) return;
  form.classList.remove("hidden");
  const d = new Date(selectedDate + "T00:00:00");
  $("#event-form-date").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}) 일정`;
  const list = $("#event-list");
  const dayEvents = events.filter(e => e.date === selectedDate).sort((a, b) => (a.time || "99") < (b.time || "99") ? -1 : 1);
  list.innerHTML = dayEvents.length ? "" : `<div class="mission-empty">이 날짜에 일정이 없어요. 위에서 추가해보세요.</div>`;
  dayEvents.forEach(e => {
    const row = document.createElement("div");
    row.className = "todo-item";
    row.innerHTML = `<span class="event-time">${e.time || "종일"}</span><span class="todo-text">${escapeHtml(e.title)}</span>`;
    const del = document.createElement("button");
    del.className = "btn-small btn-task-del";
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      events = events.filter(x => x.id !== e.id);
      store.set("events", events);
      renderCalendar();
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

function addEvent() {
  const title = $("#event-title").value.trim();
  if (!title) { $("#event-title").focus(); return; }
  events.push({ id: Date.now() + "", title, date: selectedDate, time: $("#event-time").value || "" });
  store.set("events", events);
  $("#event-title").value = ""; $("#event-time").value = "";
  renderCalendar();
  toast("🗓️ 일정이 추가됐어요!");
}

/* ----- 메모 ----- */
function addNote() {
  const body = $("#note-input").value.trim();
  if (!body) { $("#note-input").focus(); return; }
  notes.unshift({ id: Date.now() + "", body, at: Date.now() });
  store.set("notes", notes);
  $("#note-input").value = "";
  renderNotes();
}

function renderNotes() {
  const list = $("#note-list");
  if (!list) return;
  list.innerHTML = notes.length ? "" : `<div class="mission-empty">아이디어가 떠오르면 바로 적어두세요!</div>`;
  notes.forEach(n => {
    const item = document.createElement("div");
    item.className = "note-item";
    const body = document.createElement("div");
    body.className = "note-body";
    body.textContent = n.body;
    const meta = document.createElement("div");
    meta.className = "note-meta";
    meta.textContent = new Date(n.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const edit = document.createElement("button");
    edit.className = "btn-small btn-task-del";
    edit.textContent = "✏️";
    edit.addEventListener("click", () => {
      $("#note-input").value = n.body;
      notes = notes.filter(x => x.id !== n.id);
      store.set("notes", notes);
      renderNotes();
      $("#note-input").focus();
    });
    const del = document.createElement("button");
    del.className = "btn-small btn-task-del";
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      if (!confirm("이 메모를 삭제할까요?")) return;
      notes = notes.filter(x => x.id !== n.id);
      store.set("notes", notes);
      renderNotes();
    });
    meta.append(edit, del);
    item.append(body, meta);
    list.appendChild(item);
  });
}

/* ----- 집중 타이머 ----- */
const timerState = { running: false, remain: 25 * 60, total: 25 * 60, tick: null };

function timerRender() {
  const el = $("#timer-display");
  if (!el) return;
  const m = Math.floor(timerState.remain / 60), s = timerState.remain % 60;
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("timer-running", timerState.running);
  $("#timer-start").textContent = timerState.running ? "일시정지" : (timerState.remain < timerState.total ? "계속" : "시작");
}

function focusComplete(minutes) {
  const t = focusLog[todayStr()] || { count: 0, minutes: 0 };
  t.count += 1; t.minutes += minutes;
  focusLog[todayStr()] = t;
  store.set("focusLog", focusLog);
  renderFocusStats();
  toast(`🎉 ${minutes}분 집중 완료! 대단해요!`, 5000);
  speak && officeState.built && speak("pm", `사장님이 ${minutes}분 집중을 해내셨습니다! 👏`);
}

function timerToggle() {
  if (timerState.running) {
    clearInterval(timerState.tick);
    timerState.running = false;
  } else {
    timerState.running = true;
    timerState.tick = setInterval(() => {
      timerState.remain--;
      if (timerState.remain <= 0) {
        clearInterval(timerState.tick);
        timerState.running = false;
        focusComplete(Math.round(timerState.total / 60));
        timerState.remain = timerState.total;
      }
      timerRender();
    }, 1000);
  }
  timerRender();
}

function timerReset() {
  clearInterval(timerState.tick);
  timerState.running = false;
  timerState.total = timerState.remain = Number($("#timer-mins").value) * 60;
  timerRender();
}

function renderFocusStats() {
  const el = $("#focus-stats");
  if (!el) return;
  const t = focusLog[todayStr()] || { count: 0, minutes: 0 };
  let wc = 0, wm = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const r = focusLog[todayStr(d)];
    if (r) { wc += r.count || 0; wm += r.minutes || 0; }
  }
  el.textContent = `오늘 ${t.count}회 · ${t.minutes}분  |  이번 주 ${wc}회 · ${wm}분`;
}

function renderTools() {
  renderTodos();
  renderCalendar();
  renderNotes();
  renderFocusStats();
  timerRender();
}

/* ==================================================
   트렌드 탭 — 웹에서 바로 보는 급상승·키워드 뉴스
   (정적 앱은 CORS 제약이 있어 공개 프록시 체인으로 우회, 실패 시 안내)
   ================================================== */
let trendKeywords = store.get("trendKeywords", null);
const trendCache = { hot: null, news: {} }; // {at, items}
const TREND_TTL = 10 * 60 * 1000;

function corsProxies(url) {
  const enc = encodeURIComponent(url);
  return [
    url, // GitHub Pages에선 CORS로 막히지만 로컬/확장 환경에선 통과 가능
    `https://api.allorigins.win/raw?url=${enc}`,
    `https://corsproxy.io/?url=${enc}`
  ];
}

async function fetchRss(url) {
  let lastErr = null;
  for (const target of corsProxies(url)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(target, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text.includes("<item")) throw new Error("RSS 형식 아님");
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("연결 실패");
}

function parseRssItems(xml, max = 10) {
  const out = [];
  const un = (s) => String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "").trim();
  const grab = (b, t) => { const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? un(m[1]) : ""; };
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < max) {
    const b = m[0];
    out.push({ title: grab(b, "title"), link: grab(b, "link"), source: grab(b, "source"), date: grab(b, "pubDate"), traffic: grab(b, "ht:approx_traffic") });
  }
  return out.filter(i => i.title);
}

/* 트렌드 항목 → 자료실 (오늘의 트렌드 수집 문서에 누적) */
function sendTrendToLibrary(line) {
  const title = `📈 트렌드 수집 ${todayStr()}`;
  let doc = docs.find(d => d.title === title);
  if (!doc) {
    doc = { id: Date.now() + "", title, content: "오늘 수집한 트렌드·뉴스:\n", enabled: true };
    docs.push(doc);
  }
  if (doc.content.includes(line)) { toast("이미 자료실에 보냈어요!"); return; }
  doc.content += `\n- ${line}`;
  saveDocs();
  renderLibrary();
  toast("📚 자료실로 보냈어요! 직원들이 스터디 회의로 소화할 거예요.");
}

function trendItemRow(it, kind) {
  const row = document.createElement("div");
  row.className = "trend-row";
  const text = document.createElement("span");
  text.className = "trend-row-text";
  if (kind === "hot") {
    text.textContent = it.title + (it.traffic ? ` (${it.traffic})` : "");
  } else {
    const a = document.createElement("a");
    a.href = it.link; a.target = "_blank"; a.rel = "noopener";
    a.textContent = it.title;
    text.appendChild(a);
    if (it.source) {
      const s = document.createElement("span");
      s.className = "trend-src";
      s.textContent = " · " + it.source;
      text.appendChild(s);
    }
  }
  const add = document.createElement("button");
  add.className = "btn-small";
  add.textContent = "➕";
  add.title = "자료실로 보내기 (직원들이 활용)";
  add.addEventListener("click", () => sendTrendToLibrary(
    kind === "hot" ? `[급상승] ${it.title}${it.traffic ? ` (${it.traffic})` : ""}` : `[뉴스] ${it.title} — ${it.source || ""} ${it.link}`));
  row.append(text, add);
  return row;
}

function trendFailNote(box, what) {
  box.innerHTML = "";
  const d = document.createElement("div");
  d.className = "stage-tip";
  d.textContent = `⚠️ ${what}을 지금 가져오지 못했어요 (우회 경로도 막힘). 잠시 후 새로고침하거나, 전체 관제판(아래 로컬 도구)을 사용해주세요.`;
  box.appendChild(d);
}

async function loadTrendHot(force = false) {
  const box = $("#trend-hot");
  if (!box) return;
  if (!force && trendCache.hot && Date.now() - trendCache.hot.at < TREND_TTL) return renderTrendHot();
  box.innerHTML = `<div class="mission-empty">불러오는 중...</div>`;
  try {
    const xml = await fetchRss("https://trends.google.com/trending/rss?geo=KR");
    trendCache.hot = { at: Date.now(), items: parseRssItems(xml, 12) };
    renderTrendHot();
  } catch { trendFailNote(box, "급상승 검색어"); }
}

function renderTrendHot() {
  const box = $("#trend-hot");
  box.innerHTML = "";
  (trendCache.hot?.items || []).forEach(it => box.appendChild(trendItemRow(it, "hot")));
  if (!box.children.length) trendFailNote(box, "급상승 검색어");
}

function getTrendKeywords() {
  if (!trendKeywords) trendKeywords = [topicWord()];
  return trendKeywords;
}

async function loadTrendNews(force = false) {
  const wrap = $("#trend-news");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const kw of getTrendKeywords()) {
    const sec = document.createElement("div");
    sec.className = "trend-kw-sec";
    sec.innerHTML = `<div class="trend-kw-title">🔍 ${escapeHtml(kw)}</div>`;
    const list = document.createElement("div");
    list.innerHTML = `<div class="mission-empty">불러오는 중...</div>`;
    sec.appendChild(list);
    wrap.appendChild(sec);
    const cached = trendCache.news[kw];
    if (!force && cached && Date.now() - cached.at < TREND_TTL) {
      list.innerHTML = "";
      cached.items.forEach(it => list.appendChild(trendItemRow(it, "news")));
      continue;
    }
    try {
      const xml = await fetchRss(`https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=ko&gl=KR&ceid=KR:ko`);
      trendCache.news[kw] = { at: Date.now(), items: parseRssItems(xml, 6) };
      list.innerHTML = "";
      trendCache.news[kw].items.forEach(it => list.appendChild(trendItemRow(it, "news")));
      if (!list.children.length) list.innerHTML = `<div class="mission-empty">관련 뉴스가 없어요.</div>`;
    } catch { trendFailNote(list, `"${kw}" 뉴스`); }
  }
}

function renderTrendChips() {
  const wrap = $("#trend-kw-chips");
  if (!wrap) return;
  wrap.innerHTML = "";
  getTrendKeywords().forEach(kw => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.innerHTML = `${escapeHtml(kw)} ✕`;
    chip.title = "삭제";
    chip.addEventListener("click", () => {
      trendKeywords = getTrendKeywords().filter(k => k !== kw);
      delete trendCache.news[kw]; // 캐시도 함께 제거 (브리핑에 유령 뉴스가 남지 않게)
      store.set("trendKeywords", trendKeywords);
      renderTrendChips();
      loadTrendNews();
    });
    wrap.appendChild(chip);
  });
}

/* ----- 🇰🇷 한글 브리핑: 영어 헤드라인·검색어를 쉬운 한국어 + 콘텐츠 아이디어로 ----- */
function trendBriefData() {
  const hot = (trendCache.hot?.items || []).map(i => i.title + (i.traffic ? ` (${i.traffic})` : ""));
  const news = [];
  const active = new Set(getTrendKeywords()); // 삭제된 키워드의 캐시는 브리핑에서 제외
  Object.entries(trendCache.news).forEach(([kw, c]) => {
    if (active.has(kw)) (c?.items || []).forEach(i => news.push(`[${kw}] ${i.title}`));
  });
  return { hot, news };
}

function trendBriefTemplate(hot, news) {
  const t = topicWord();
  return `🇰🇷 오늘의 트렌드 브리핑 — 기본판 (AI 연결 시 항목별 해설이 더 깊어져요)

## 지금 뜨는 검색어
${hot.slice(0, 6).map((h, i) => `${i + 1}. ${h}`).join("\n") || "- 아직 못 불러왔어요 (↻ 새로고침)"}

## 이렇게 써먹는 공식 (초보용)
- 내 주제(${t})와 닿는 검색어가 있으면: "검색어 × ${t}" 콘텐츠를 오늘 안에 올려요. 예: "○○ 열풍, ${t}에서는 이렇게"
- 안 닿아도 버리지 마세요: 제목 후킹에 말투·밈만 빌려요
- 영어 헤드라인은 번역기(파파고)에 붙여넣으면 10초 — 제목만 이해해도 충분해요

## 관심 키워드 뉴스
${news.slice(0, 6).map(n => `- ${n}`).join("\n") || "- 위에서 키워드를 추가하면 뉴스가 모여요"}

## 오늘 바로 만들 소재 TOP3 (기본 추천)
1. 급상승 1위를 ${t} 관점으로 한 줄 언급하며 시작하는 릴스 오프닝
2. 뜨는 키워드를 제목에 빌린 "${t} 하는 사람만 아는 ○○" 카드뉴스
3. 뉴스 하나 골라 "이게 우리에게 무슨 의미?" 짧은 의견 스토리`;
}

async function makeTrendBrief() {
  const btn = $("#trend-brief"), out = $("#trend-brief-out");
  const { hot, news } = trendBriefData();
  if (!hot.length && !news.length) { toast("먼저 트렌드를 불러온 뒤 눌러주세요 (↻ 새로고침)"); return; }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "🇰🇷 요약 중...";
  out.classList.remove("hidden");
  out.textContent = "직원들이 트렌드를 읽고 있어요...";
  $("#trend-brief-save")?.classList.add("hidden"); // 요약이 끝나기 전엔 저장 못 하게
  const t = topicWord();
  try {
    const text = await aiChat(
      `너는 SNS 초보 운영자를 돕는 마케팅 멘토야. 전문 용어는 즉시 쉬운 말로 풀고, 친근한 한국어 존댓말로 써.`,
      [{ role: "user", content: `지금 실시간 급상승 검색어와 뉴스 헤드라인이야 (영어가 섞여 있을 수 있어):

[급상승]
${hot.slice(0, 10).join("\n")}

[관심 키워드 뉴스]
${news.slice(0, 10).join("\n") || "(없음)"}

부탁: ① 흐름을 3~5개로 묶어 각각 쉬운 한국어 한 줄 설명 + 왜 뜨는지 추정 ② 각 흐름마다 "${t}" 계정에서 써먹을 콘텐츠 아이디어 1개 ③ 마지막에 "오늘 바로 만들 소재 TOP3". 영어는 모두 번역해서 설명해줘.` }],
      (full) => { out.textContent = full; }); // onDelta는 누적된 전체 텍스트를 받는다
    out.textContent = (text || "").trim() || trendBriefTemplate(hot, news);
  } catch (e) {
    out.textContent = trendBriefTemplate(hot, news);
    // 무료 AI 미연결(NO_AI)은 기본판이 정상 경로지만, 내 API 키 오류(401 등)는 알려줘야 고칠 수 있음
    if (e && e.message !== "NO_AI") toast("⚠️ AI 요약 실패 — 기본판으로 보여드려요. " + friendlyApiError(e), 6000);
  }
  btn.disabled = false;
  btn.textContent = orig;
  $("#trend-brief-save")?.classList.remove("hidden");
}

function saveTrendBrief() {
  const text = ($("#trend-brief-out")?.textContent || "").trim();
  if (!text || text.includes("읽고 있어요")) { toast("먼저 브리핑을 만들어주세요!"); return; }
  const title = `🇰🇷 트렌드 브리핑 ${todayStr()}`;
  const exist = docs.find(d => d.title === title);
  if (exist) exist.content = text;
  else docs.push({ id: Date.now() + "", title, content: text, enabled: true });
  if (!saveDocs()) return; // 실패 시 store.set이 용량 안내 토스트를 띄움 — 성공 안내 금지
  renderLibrary();
  toast("📚 자료실에 저장됐어요! 직원들이 다음 기획에 반영해요.");
}

function renderTrendTab() {
  renderTrendChips();
  loadTrendHot();
  loadTrendNews();
}

/* ---------- 스튜디오 탭 (iframe 지연 로드) ---------- */
function renderStudio() {
  const frame = $("#studio-frame");
  if (!frame) return;
  if (!frame.src) { frame.src = "studio.html"; return; }
  // 대기 중인 핸드오프가 있으면 탭에 들어오는 이 시점에만 재로딩해 소비
  // (승인 즉시 재로딩하면 스튜디오에 올려둔 세션 전용 작업물 — 업로드 이미지 등 — 이 예고 없이 날아감)
  if (store.get("studioInbox", []).length) frame.src = frame.src;
}

/* 이모티콘 기획 승인 → 스튜디오에 프로젝트 자동 생성 (탭 간 연결)
   스튜디오가 로드될 때 senter:studioInbox를 읽어 자기 저장소 형식으로 가져간다 */
/* 마케팅 루프 닫기: 콘텐츠성 업무 승인 → "발행 + 성과 기록" 할 일 자동 생성 (만들기→발행→측정→개선) */
function schedulePublishTodo(t) {
  if (!/릴스|캡션|대본|게시물|아이디어|콘텐츠|컨셉|소개글/.test(t.title)) return;
  const short = t.title.slice(0, 24);
  const text = `📤 「${short}」 발행 → 이틀 뒤 저장수·댓글 기록하기`;
  if (todos.some(d => d.text === text)) return; // 중복 방지
  const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  todos.unshift({ id: Date.now() + "-pub", text, due, done: false });
  store.set("todos", todos);
  if (typeof renderTools === "function") renderTools();
  toast("🗓️ 생산성 탭에 발행·성과 기록 할 일을 추가했어요 (D+2) — 기록이 쌓이면 벤치마킹이 더 똑똑해져요.");
}

function handoffToStudio(t) {
  // 크리에이티브 스튜디오부 업무 전부(이모티콘·디자인·굿즈) + 다른 직원에게 지명된 '이모티콘/캐릭터 기획'
  const isCreativeDept = teamOf(t.assignee).id === "creative";
  const isEmoTitle = /이모티콘|캐릭터/.test(t.title) && /기획/.test(t.title);
  if (!isCreativeDept && !isEmoTitle) return;
  // 업무 성격에 따라 스튜디오에서 다르게 소비: 이모티콘 → 제출 현황, 굿즈/디자인 → 아이디어 뱅크
  const kind = t.assignee === "jr-goods" || /굿즈|md|상품/i.test(t.title) ? "goods"
    : t.assignee === "jr-design" || /디자인|시안|썸네일/.test(t.title) ? "design"
    : "emoticon";
  // 결과물 앞부분을 요약으로 함께 넘겨 스튜디오 아이디어/프로젝트가 실제 내용을 담게
  const summary = String(t.result || "").replace(/^#[^\n]*\n(?:>[^\n]*\n)?/, "")
    .replace(/[#>*|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  const inbox = store.get("studioInbox", []);
  inbox.push({ type: kind, title: t.title.slice(0, 60), summary, dept: teamOf(t.assignee).name, at: Date.now() });
  if (!store.set("studioInbox", inbox)) return; // 저장 실패 시 store.set이 용량 안내 토스트를 띄움
  const where = kind === "emoticon" ? "☺ 이모티콘 제출 현황" : "🏠 본부 아이디어 뱅크";
  toast(`🎨 크리에이티브 스튜디오부 결과를 스튜디오로 보냈어요! 스튜디오 탭을 열면 ${where}에 등록돼요.`);
}

/* ---------- 설정 탭 ---------- */
function renderStorageMeter() {
  const el = $("#storage-meter");
  if (!el) return;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      bytes += (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
    }
  } catch { el.textContent = ""; return; }
  const mb = bytes / 1048576;
  const limit = 5; // localStorage는 대부분의 브라우저 기준 약 5MB
  const pct = Math.min(100, Math.round(mb / limit * 100));
  const docMb = docsInIdb ? (JSON.stringify(docs).length * 2 / 1048576) : 0;
  el.innerHTML = `기본 저장 공간: <b>${mb.toFixed(2)}MB</b> / 약 ${limit}MB (${pct}%)` +
    (docsInIdb ? ` · 자료실·업무·회의록·대화는 확장 저장소에 별도 보관 (자료실 ${docMb.toFixed(1)}MB)` : "") +
    (pct >= 80 ? ` — ⚠️ 거의 찼어요! 백업 후 오래된 대화·기록을 정리해주세요.` : "");
  el.style.color = pct >= 80 ? "#c0392b" : "";
  // 브라우저 전체 저장 한도(확장 저장소 포함)는 비동기로 덧붙임
  if (navigator.storage?.estimate) {
    navigator.storage.estimate().then(est => {
      if (!est || !est.quota || !$("#storage-meter")) return;
      const usedMb = (est.usage || 0) / 1048576;
      const quotaGb = est.quota / 1073741824;
      const extra = document.createElement("div");
      extra.className = "storage-meter-ext";
      extra.textContent = `전체 한도(자료실 포함): ${usedMb.toFixed(1)}MB 사용 / 약 ${quotaGb >= 1 ? quotaGb.toFixed(0) + "GB" : (est.quota / 1048576).toFixed(0) + "MB"} 사용 가능`;
      el.querySelector(".storage-meter-ext")?.remove();
      el.appendChild(extra);
    }).catch(() => {});
  }
}

function renderSettings() {
  const s = settings;
  renderStorageMeter();
  $("#set-key").value = s.apiKey || "";
  $("#set-model").value = s.model || "claude-sonnet-5";
  const smEl = $("#set-staffmodel");
  if (smEl) smEl.value = s.staffModel || "claude-haiku-4-5-20251001";
  const thEl = $("#set-theme");
  if (thEl) thEl.value = s.theme || "aurora";
  $("#set-workmode").value = s.workMode || "thorough";
  $("#set-freemodel").value = s.freeModel || "";
  $("#set-name").value = s.name || "";
  $("#set-topic").value = s.topic || "";
  $("#set-platforms").value = (s.platforms || []).join(", ");
  $("#set-goal").value = s.goal || "";
  $("#set-level").value = s.level || "";
}

function saveSettings() {
  settings.apiKey = $("#set-key").value.trim();
  settings.model = $("#set-model").value;
  settings.staffModel = $("#set-staffmodel")?.value || settings.staffModel;
  settings.theme = $("#set-theme")?.value || settings.theme || "aurora";
  settings.workMode = $("#set-workmode").value;
  applyTheme();
  settings.freeModel = $("#set-freemodel").value.trim();
  settings.name = $("#set-name").value.trim() || "크리에이터";
  settings.topic = $("#set-topic").value.trim() || "리빙";
  settings.platforms = $("#set-platforms").value.split(",").map(x => x.trim()).filter(Boolean);
  settings.goal = $("#set-goal").value.trim();
  settings.level = $("#set-level").value.trim();
  store.set("settings", settings);
  ROADMAP = buildRoadmap(); // 주제 변경 반영
  renderKeyStatus();
  renderHome();
  renderBoard();
  const note = $("#set-saved");
  note.classList.remove("hidden");
  setTimeout(() => note.classList.add("hidden"), 2000);
}

function applyTheme() {
  const th = (settings && settings.theme) || "aurora";
  if (th === "oatmeal") document.body.dataset.theme = "oatmeal";
  else document.body.removeAttribute("data-theme");
}

function renderKeyStatus() {
  const el = $("#key-status");
  if ((settings.apiKey || "").trim()) {
    el.textContent = "🟢 AI 연결됨 (내 키)";
    el.classList.add("ok");
  } else {
    el.textContent = "🔵 무료 AI 모드";
    el.classList.add("ok");
    el.title = "API 키 없이 무료 AI로 작동 중이에요. 첫 사용 시 무료 계정 로그인 창이 한 번 떠요.";
  }
  el.style.cursor = "pointer";
  el.onclick = () => { switchTab("settings"); };
}

function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, apiKey: "" }, // 보안을 위해 키는 제외
    docs, chats, roadmapDone, missions, tasks, activity, meetings, customStaff, teamChat,
    todos, events, notes, focusLog, usage, reports
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
      tasks = data.tasks || [];
      activity = data.activity || [];
      meetings = data.meetings || [];
      customStaff = data.customStaff || [];
      teamChat = data.teamChat || [];
      reports = data.reports || [];
      todos = data.todos || [];
      events = data.events || [];
      notes = data.notes || [];
      focusLog = data.focusLog || {};
      usage = data.usage || null;
      store.set("usage", usage);
      store.set("todos", todos);
      store.set("events", events);
      store.set("notes", notes);
      store.set("focusLog", focusLog);
      store.set("settings", settings);
      store.set("reports", reports);
      saveDocs();
      store.set("chats", chats);
      store.set("roadmapDone", roadmapDone);
      store.set("missions", missions);
      store.set("tasks", tasks);
      store.set("activity", activity);
      store.set("meetings", meetings);
      store.set("customStaff", customStaff);
      store.set("teamChat", teamChat);
      rebuildStaff();
      rebuildOffice();
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
  $$(".bn-item").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("#morenav")?.classList.add("hidden");
  $$(".tab-panel").forEach(p => p.classList.add("hidden"));
  $("#tab-" + name).classList.remove("hidden");
  window.scrollTo({ top: 0 });
  if (name === "office") renderOffice();
  if (name === "staff") renderStaff();
  if (name === "tools") renderTools();
  if (name === "reels") renderReels();
  if (name === "trend") renderTrendTab();
  if (name === "studio") renderStudio();
  if (name === "chat") renderChat();
  if (name === "library") renderLibrary();
  if (name === "settings") renderSettings();
  if (name === "home") renderHome();
}

/* ---------- 렌더 전체 ---------- */
function renderAll() {
  renderKeyStatus();
  renderOffice();
  renderStaff();
  renderHome();
  renderPersonaBar();
  renderChat();
  renderLibrary();
  renderSettings();
  renderTools();
  renderTokenBar();
  renderArchive();
  renderSponsorFeeds();
}

/* ---------- 이벤트 바인딩 ---------- */
function bindEvents() {
  // 탭
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // 온보딩
  $("#ob-done").addEventListener("click", finishOnboarding);

  // 토큰 상태바 (자세히 열기/닫기)
  $("#tb-toggle").addEventListener("click", () => toggleTokenDetail());

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

  // 사무실
  $("#scrum-btn").addEventListener("click", () => holdScrum(false));
  $("#brief-btn").addEventListener("click", () => holdScrum(true));
  $("#report-btn").addEventListener("click", () => generateReport(false));
  $("#board-search").addEventListener("input", e => { boardQuery = e.target.value; renderBoard(); });
  $("#minutes-btn").addEventListener("click", () => { renderMinutesList(); $("#minutes-modal").classList.remove("hidden"); });
  $("#minutes-close").addEventListener("click", () => $("#minutes-modal").classList.add("hidden"));
  $("#minutes-modal").addEventListener("click", e => { if (e.target === $("#minutes-modal")) $("#minutes-modal").classList.add("hidden"); });
  $("#autopilot-btn").addEventListener("click", () => {
    settings.autoPilot = !settings.autoPilot;
    store.set("settings", settings);
    renderAutopilotBtn();
    toast(settings.autoPilot
      ? "🤖 자율 근무 켜짐! 직원들이 알아서 다음 일을 찾아 초안을 올릴 거예요."
      : "💤 자율 근무 꺼짐. 이제 직접 지시한 일만 합니다.");
    if (settings.autoPilot) autoPilotTick(true);
  });

  // 무료 AI 연결 테스트
  $("#free-ai-test").addEventListener("click", async () => {
    const btn = $("#free-ai-test");
    const out = $("#free-ai-result");
    btn.disabled = true; btn.textContent = "연결 중...";
    out.textContent = "";
    const savedKey = settings.apiKey;
    try {
      freeAiBroken = false; // 재시도 허용
      settings.apiKey = ""; // 무료 경로 강제 테스트
      const r = await aiChat("한 문장으로만 답해.", [{ role: "user", content: "안녕! 연결 확인이야." }]);
      out.textContent = "✅ 무료 AI 작동! — " + r.slice(0, 40);
    } catch (e) {
      out.textContent = "";
      toast("⚠️ " + friendlyApiError(e), 6000);
    } finally {
      settings.apiKey = savedKey;
      btn.disabled = false; btn.textContent = "🔵 무료 AI 연결 테스트";
    }
  });
  $("#directive-go").addEventListener("click", handleDirective);
  $("#directive-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) handleDirective(); });

  // 직원 팝업 & 채용
  $("#sm-close").addEventListener("click", () => $("#staff-modal").classList.add("hidden"));
  $("#staff-modal").addEventListener("click", e => { if (e.target === $("#staff-modal")) $("#staff-modal").classList.add("hidden"); });
  $("#hire-go").addEventListener("click", hireStaff);

  // 생산성 탭
  $("#todo-add-btn").addEventListener("click", addTodo);
  $("#todo-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) addTodo(); });
  $("#todo-ai-btn").addEventListener("click", todoAiPriority);
  $("#cal-prev").addEventListener("click", () => { calCursor.m--; if (calCursor.m < 0) { calCursor.m = 11; calCursor.y--; } renderCalendar(); });
  $("#cal-next").addEventListener("click", () => { calCursor.m++; if (calCursor.m > 11) { calCursor.m = 0; calCursor.y++; } renderCalendar(); });
  $("#event-add-btn").addEventListener("click", addEvent);
  $("#event-title").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) addEvent(); });
  $("#note-add-btn").addEventListener("click", addNote);
  $("#timer-start").addEventListener("click", timerToggle);
  $("#timer-reset").addEventListener("click", timerReset);
  $("#timer-mins").addEventListener("change", timerReset);

  // 트렌드 탭
  $("#trend-refresh").addEventListener("click", () => { loadTrendHot(true); loadTrendNews(true); });
  // 캐시된 구버전 HTML과 조합돼도 앱 전체가 죽지 않도록 새 요소는 옵셔널 바인딩
  $("#trend-brief")?.addEventListener("click", makeTrendBrief);
  $("#trend-brief-save")?.addEventListener("click", saveTrendBrief);
  $("#report-close")?.addEventListener("click", () => $("#report-modal").classList.add("hidden"));
  $("#report-modal")?.addEventListener("click", (e) => { if (e.target.id === "report-modal") $("#report-modal").classList.add("hidden"); });
  $("#report-print")?.addEventListener("click", printReportDoc);
  $("#report-copy")?.addEventListener("click", async () => {
    if (!reportModalTask) return;
    try { await copyText(reportModalTask.result || ""); toast("복사됐어요!"); } catch { toast("⚠️ 복사 실패 — 다시 시도해주세요."); }
  });
  // 모바일 하단 네비게이션
  $$("#bottomnav [data-tab], #morenav [data-tab]").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#bn-more")?.addEventListener("click", () => $("#morenav").classList.toggle("hidden"));
  $("#home-to-office")?.addEventListener("click", () => switchTab("office"));
  const addTrendKw = () => {
    const v = $("#trend-kw-input").value.trim();
    if (!v) return;
    const list = getTrendKeywords();
    if (list.includes(v)) { toast("이미 있는 키워드예요!"); return; }
    if (list.length >= 8) { toast("키워드는 8개까지예요."); return; }
    list.push(v);
    trendKeywords = list;
    store.set("trendKeywords", trendKeywords);
    $("#trend-kw-input").value = "";
    renderTrendChips();
    loadTrendNews();
  };
  $("#trend-kw-add").addEventListener("click", addTrendKw);
  $("#trend-kw-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) addTrendKw(); });

  // 자료 입력 모달
  $("#dm-save").addEventListener("click", saveDocModal);
  $("#dm-cancel").addEventListener("click", () => { $("#doc-modal").classList.add("hidden"); editingDocId = null; });
  $("#dm-content").addEventListener("input", updateDocModalSize);

  // 지시 예시 칩
  const examples = [
    "계정 컨셉과 닉네임 정해줘",
    "이번 주 콘텐츠 캘린더 짜줘",
    "주방 정리 릴스 대본 써줘",
    "체험단 지원 문구 만들어줘",
    "프로필 소개글 3줄 써줘"
  ];
  const sugWrap = $("#directive-suggestions");
  examples.forEach(ex => {
    const b = document.createElement("button");
    b.className = "suggestion";
    b.textContent = ex;
    b.addEventListener("click", () => {
      $("#directive-input").value = ex;
      handleDirective();
    });
    sugWrap.appendChild(b);
  });

  // 아이디어 던지기: 회의 시작(업무 파이프라인) 또는 코치와 대화
  const ideaText = () => ($("#idea-drop")?.value || "").trim();
  $("#idea-meet")?.addEventListener("click", () => {
    const v = ideaText();
    if (!v) { $("#idea-drop").focus(); return; }
    $("#idea-drop").value = "";
    ideaToTask(v);
  });
  $("#idea-go")?.addEventListener("click", () => {
    const v = ideaText();
    if (!v) { $("#idea-drop").focus(); return; }
    switchTab("chat");
    selectPersona("coach");
    $("#idea-drop").value = "";
    sendChat(`이건 ${v}(이)야. 마케팅 콘텐츠로 어떻게 활용하면 좋을까?`);
  });
  $("#idea-drop")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#idea-meet").click(); }
  });

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

  // 분석실 (경쟁사 분석 + 체험단 레이더)
  $("#ca-run")?.addEventListener("click", () => runCompetitorAnalysis(($("#ca-links").value || "").split(/\n+/)));
  $("#sp-run")?.addEventListener("click", () => collectSponsorFeeds());
  $("#sp-save")?.addEventListener("click", saveSponsorDigest);
  $("#lib-add-notion").addEventListener("click", () => {
    $("#nm-url").value = "";
    $("#nm-status").textContent = "";
    $("#notion-modal").classList.remove("hidden");
    $("#nm-url").focus();
  });
  $("#nm-cancel").addEventListener("click", () => $("#notion-modal").classList.add("hidden"));
  $("#nm-fetch").addEventListener("click", () => addLinkedDoc($("#nm-url").value));
  $("#nm-url").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addLinkedDoc($("#nm-url").value); } });
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
    // 확장 저장소(IndexedDB — 자료실·업무·회의록·대화)도 함께 삭제
    let reloaded = false;
    const done = () => { if (!reloaded) { reloaded = true; location.reload(); } };
    try {
      idb._db?.close();
      const rq = indexedDB.deleteDatabase("senter-db");
      rq.onsuccess = rq.onerror = rq.onblocked = done;
      setTimeout(done, 1500); // 삭제가 지연돼도 새로고침은 진행
    } catch { done(); }
  });
}

/* ==========================================================================
   릴스·숏츠 대본 생성기
   - 사진/영상을 브라우저 안에서만 처리(업로드 없음 → 용량 제한·요금 없음)
   - 영상은 길이·해상도 추출 + 미리보기 프레임 캡처
   - 무료 AI(Puter) 또는 내 API 키로 캡컷·프리미어용 편집 대본 생성
   ========================================================================== */
let reelsMedia = [];        // {id, kind, name, url, size, duration, w, h, thumbs:[dataURL]}
let reelsResult = "";       // 마지막으로 생성된 대본(마크다운)
let reelsBusy = false;
let reelsInited = false;
let reelsScripts = store.get("reelsScripts", []); // 보관함 {id, ts, title, platform, length, tone, md}
let reelsCurrentId = null;  // 지금 화면에 열린 대본의 보관함 id
let reelsLastPromptText = ""; // 마지막 생성에 쓴 프롬프트 (수정 요청 맥락용)
const REELS_SCRIPT_CAP = 20;

function fmtDur(sec) {
  if (!sec || !isFinite(sec)) return "0초";
  const s = Math.round(sec);
  if (s < 60) return s + "초";
  return Math.floor(s / 60) + "분 " + (s % 60) + "초";
}
function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return Math.round(n / 1024) + "KB";
  return (n / 1024 / 1024).toFixed(1) + "MB";
}
function orient(w, h) {
  if (!w || !h) return "";
  if (h > w * 1.1) return "세로";
  if (w > h * 1.1) return "가로";
  return "정사각";
}

/* 영상/이미지에서 미리보기 프레임 + 메타데이터 추출 */
function captureFrame(source, sw, sh) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 360 / Math.max(sw || 360, sh || 360));
  canvas.width = Math.max(1, Math.round((sw || 360) * scale));
  canvas.height = Math.max(1, Math.round((sh || 360) * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

function loadImageMeta(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let thumb = "";
      try { thumb = captureFrame(img, img.naturalWidth, img.naturalHeight); } catch {}
      resolve({ duration: 0, w: img.naturalWidth, h: img.naturalHeight, thumbs: thumb ? [thumb] : [] });
    };
    img.onerror = () => resolve({ duration: 0, w: 0, h: 0, thumbs: [] });
    img.src = url;
  });
}

function seekAndCapture(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      video.removeEventListener("seeked", onSeeked);
      try { resolve(captureFrame(video, video.videoWidth, video.videoHeight)); }
      catch { resolve(""); }
    };
    const onSeeked = () => finish();
    video.addEventListener("seeked", onSeeked);
    setTimeout(finish, 2500); // 시크가 막히면 넘어가기
    try { video.currentTime = t; } catch { finish(); }
  });
}

/* 일부 영상(화면 녹화, 앱 녹화 webm 등)은 길이가 Infinity로 나옴 —
   끝쪽으로 시크하면 브라우저가 실제 길이를 계산해줌 */
function resolveVideoDuration(v) {
  return new Promise((resolve) => {
    if (isFinite(v.duration) && v.duration > 0) { resolve(v.duration); return; }
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      v.removeEventListener("durationchange", onChange);
      resolve(isFinite(v.duration) && v.duration > 0 ? v.duration : 0);
    };
    const onChange = () => { if (isFinite(v.duration) && v.duration > 0) finish(); };
    v.addEventListener("durationchange", onChange);
    setTimeout(finish, 3000);
    try { v.currentTime = 1e7; } catch { finish(); }
  });
}

function loadVideoMeta(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "auto"; v.muted = true; v.playsInline = true; v.src = url;
    let settled = false;
    const bail = () => { if (!settled) { settled = true; resolve({ duration: 0, w: 0, h: 0, thumbs: [] }); } };
    v.addEventListener("error", bail);
    setTimeout(bail, 15000);
    v.addEventListener("loadeddata", async () => {
      if (settled) return; settled = true;
      const dur = await resolveVideoDuration(v);
      const w = v.videoWidth, h = v.videoHeight;
      const points = dur > 0.5
        ? [dur * 0.1, dur * 0.5, dur * 0.85].map(t => Math.min(Math.max(t, 0.05), dur - 0.05))
        : [0];
      const thumbs = [];
      for (const t of points) {
        const f = await seekAndCapture(v, t);
        if (f) thumbs.push(f);
      }
      resolve({ duration: dur, w, h, thumbs });
    });
  });
}

async function addReelsFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
  if (!files.length) { toast("사진이나 영상 파일만 올릴 수 있어요."); return; }
  const note = $("#reels-gen-note");
  for (const file of files) {
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const url = URL.createObjectURL(file);
    const item = { id: "m" + Date.now() + Math.round(Math.random() * 1e4), kind, name: file.name, url, size: file.size, duration: 0, w: 0, h: 0, thumbs: [], loading: true };
    reelsMedia.push(item);
    renderReelsMedia();
    if (note) note.textContent = "📥 " + file.name + " 읽는 중...";
    const meta = kind === "video" ? await loadVideoMeta(url) : await loadImageMeta(url);
    Object.assign(item, meta, { loading: false });
    renderReelsMedia();
  }
  if (note) note.textContent = "";
}

function removeReelsMedia(id) {
  const i = reelsMedia.findIndex(m => m.id === id);
  if (i < 0) return;
  try { URL.revokeObjectURL(reelsMedia[i].url); } catch {}
  reelsMedia.splice(i, 1);
  renderReelsMedia();
}
function moveReelsMedia(id, dir) {
  const i = reelsMedia.findIndex(m => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= reelsMedia.length) return;
  const [x] = reelsMedia.splice(i, 1);
  reelsMedia.splice(j, 0, x);
  renderReelsMedia();
}

function renderReelsMedia() {
  const wrap = $("#reels-media");
  if (!wrap) return;
  if (!reelsMedia.length) { wrap.innerHTML = ""; return; }
  const totalVid = reelsMedia.filter(m => m.kind === "video").reduce((a, m) => a + (m.duration || 0), 0);
  const imgCount = reelsMedia.filter(m => m.kind === "image").length;
  const vidCount = reelsMedia.filter(m => m.kind === "video").length;
  const summary = `<div class="reels-media-summary"><span>📦 소스 ${reelsMedia.length}개 · 영상 ${vidCount}개(${fmtDur(totalVid)})${imgCount ? " · 사진 " + imgCount + "장" : ""} <span class="reels-media-order-hint">← 순서가 곧 컷 순서예요</span></span><button class="reels-clear-btn" id="reels-clear">🗑️ 전체 비우기</button></div>`;
  const cards = reelsMedia.map((m, idx) => {
    const thumb = m.thumbs[0];
    const badge = m.kind === "video"
      ? `🎬 ${fmtDur(m.duration)}`
      : "🖼️ 사진";
    const meta = m.loading ? "읽는 중..." : `${badge}${m.w ? " · " + m.w + "×" + m.h + " " + orient(m.w, m.h) : ""}${m.size ? " · " + fmtBytes(m.size) : ""}`;
    const thumbHtml = thumb
      ? `<img src="${thumb}" alt="" class="reels-thumb-img">`
      : `<div class="reels-thumb-ph">${m.loading ? "⏳" : (m.kind === "video" ? "🎬" : "🖼️")}</div>`;
    return `<div class="reels-thumb" data-id="${m.id}">
      <div class="reels-thumb-num">${idx + 1}</div>
      ${thumbHtml}
      <div class="reels-thumb-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
      <div class="reels-thumb-meta">${escapeHtml(meta)}</div>
      <div class="reels-thumb-actions">
        <button class="reels-thumb-btn" data-act="up" ${idx === 0 ? "disabled" : ""} title="앞으로">◀</button>
        <button class="reels-thumb-btn" data-act="down" ${idx === reelsMedia.length - 1 ? "disabled" : ""} title="뒤로">▶</button>
        <button class="reels-thumb-btn reels-thumb-del" data-act="del" title="빼기">✕</button>
      </div>
    </div>`;
  }).join("");
  wrap.innerHTML = summary + `<div class="reels-thumb-grid">${cards}</div>`;
}

/* AI 프롬프트 구성 */
function reelsChoice(sel, fallback) {
  const el = $(sel + " .chip.selected");
  return (el && el.dataset.value) || fallback;
}
function reelsChoiceLabel(sel) {
  const el = $(sel + " .chip.selected");
  return el ? el.textContent.trim() : "";
}

/* ---------- 대본 보관함 ---------- */
function extractReelsTitle(md, fallback) {
  const sec = sliceSection(md, /제목\s*후보/);
  const m = (sec || md).match(/^\s*(?:[-*•]|\d+[.)])\s*(.+)$/m);
  let t = m ? m[1].replace(/[*`#]/g, "").trim() : "";
  if (!t) t = (fallback || "").trim().slice(0, 30);
  return (t || "무제 대본").slice(0, 60);
}

function saveReelsScript(md) {
  const entry = {
    id: "s" + Date.now() + Math.round(Math.random() * 1e4),
    ts: Date.now(),
    title: extractReelsTitle(md, $("#reels-topic").value),
    platform: reelsChoiceLabel("#reels-platform"),
    length: reelsChoiceLabel("#reels-length"),
    tone: reelsChoiceLabel("#reels-tone"),
    md
  };
  reelsScripts.unshift(entry);
  if (reelsScripts.length > REELS_SCRIPT_CAP) reelsScripts.length = REELS_SCRIPT_CAP;
  store.set("reelsScripts", reelsScripts);
  reelsCurrentId = entry.id;
  renderReelsLibrary();
}

/* 수정 요청 결과는 새 항목을 만들지 않고 원본 항목을 갱신 */
function updateReelsScript(md) {
  const e = reelsScripts.find(s => s.id === reelsCurrentId);
  if (!e) { saveReelsScript(md); return; }
  e.md = md;
  e.ts = Date.now();
  e.title = extractReelsTitle(md, e.title);
  store.set("reelsScripts", reelsScripts);
  renderReelsLibrary();
}

function fmtShortDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderReelsLibrary() {
  const wrap = $("#reels-lib");
  if (!wrap) return;
  $("#reels-lib-count").textContent = reelsScripts.length ? `${reelsScripts.length}/${REELS_SCRIPT_CAP}개` : "";
  if (!reelsScripts.length) {
    wrap.innerHTML = `<div class="reels-lib-empty">아직 저장된 대본이 없어요. 위에서 대본을 만들면 자동으로 여기에 쌓여요!</div>`;
    return;
  }
  wrap.innerHTML = reelsScripts.map(s => {
    const meta = [fmtShortDate(s.ts), s.platform, s.length, s.tone].filter(Boolean).join(" · ");
    return `<div class="reels-lib-item${s.id === reelsCurrentId ? " current" : ""}" data-id="${s.id}">
      <div class="reels-lib-main">
        <div class="reels-lib-title">${escapeHtml(s.title)}${s.id === reelsCurrentId ? ' <span class="reels-lib-now">지금 열림</span>' : ""}</div>
        <div class="reels-lib-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="reels-lib-actions">
        <button class="btn-small" data-act="open">열기</button>
        <button class="btn-small" data-act="copy">복사</button>
        <button class="btn-small" data-act="srt">.srt</button>
        <button class="btn-small reels-lib-del" data-act="del">🗑️</button>
      </div>
    </div>`;
  }).join("");
}

function openReelsScript(id) {
  const s = reelsScripts.find(x => x.id === id);
  if (!s) return;
  reelsResult = s.md;
  reelsCurrentId = s.id;
  store.set("reelsLast", s.md);
  $("#reels-result").innerHTML = renderMarkdown(s.md);
  $("#reels-result-card").classList.remove("hidden");
  $("#reels-gen-note").textContent = "🗂️ 보관함에서 연 대본이에요. 아래 [살짝 고치기]로 수정할 수도 있어요.";
  renderReelsLibrary();
  $("#reels-result-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteReelsScript(id) {
  const i = reelsScripts.findIndex(x => x.id === id);
  if (i < 0) return;
  if (!confirm(`"${reelsScripts[i].title}" 대본을 삭제할까요?`)) return;
  reelsScripts.splice(i, 1);
  if (reelsCurrentId === id) reelsCurrentId = null;
  store.set("reelsScripts", reelsScripts);
  renderReelsLibrary();
  toast("🗑️ 삭제했어요.");
}

function buildReelsMediaSummary() {
  if (!reelsMedia.length) return "(올린 소스 없음 — 사용자가 설명만 준 경우, 필요한 촬영 컷을 직접 제안하세요.)";
  return reelsMedia.map((m, i) => {
    if (m.kind === "video") {
      return `${i + 1}. [영상] "${m.name}" — 길이 ${fmtDur(m.duration)}${m.w ? `, ${m.w}×${m.h}(${orient(m.w, m.h)})` : ""}`;
    }
    return `${i + 1}. [사진] "${m.name}"${m.w ? ` — ${m.w}×${m.h}(${orient(m.w, m.h)})` : ""}`;
  }).join("\n");
}

const REELS_SYSTEM = `당신은 조회수가 잘 나오는 릴스·쇼츠 전문 편집 PD이자 대본 작가입니다. 사용자가 올린 사진·영상 소스와 설명을 바탕으로, 편집 초보자도 캡컷(CapCut)과 어도비 프리미어 프로에서 그대로 따라 만들 수 있는 완성형 편집 대본을 만듭니다.

핵심 원칙:
- 사용자가 올린 소스(파일명과 길이)를 실제로 배치하세요. 영상 소스는 길이를 고려해 어느 구간을 쓸지 정하고, 사진은 몇 초 보여줄지 정하세요.
- 전체 길이는 목표 길이에 맞추고, 첫 2초 후크로 스크롤을 멈추게 하세요.
- 편집 기능을 말할 땐 캡컷과 프리미어 이름을 함께 적으세요 (예: 자동자막 = 캡컷 '자동 캡션' / 프리미어 '음성을 텍스트로').
- 사용자는 완전 초보이므로 전문 용어는 쉬운 말로 풀어주세요.
- 반드시 한국어로, 아래 형식(마크다운)을 정확히 지켜 출력하세요.

# 🎬 제목 후보
- 조회수 잘 나올 제목 3개 (이모지 포함)

## 🪝 후크 (0~2초)
- 첫 화면에 띄울 문구 1줄과 첫 나레이션 1줄. 왜 이게 멈추게 하는지 짧게.

## ✂️ 컷 편집표
| 컷 | 사용 소스 | 화면 시간 | 화면 자막 | 나레이션/소리 | 전환·효과 |
표로 정리. '사용 소스'에는 올린 파일명(또는 '추가 촬영: ~')을 쓰고, '화면 시간'은 0:00~0:03 처럼. 전체 합이 목표 길이가 되게.

## 🎙️ 나레이션 전체 대본
- 처음부터 끝까지 이어 읽는 대본. 문장은 짧고 말하듯이. (더빙·TTS·직접 녹음용)

## 💬 자막 타임라인
- 반드시 각 줄을 \`mm:ss-mm:ss | 자막 문구\` 형식으로만 나열하세요. (이 부분으로 자막 파일 .srt 을 자동 생성합니다. 다른 설명은 넣지 마세요.)
- 예: \`00:00-00:03 | 좁은 주방, 이거 하나면 끝\`

## 🎵 BGM·사운드
- 어울리는 음악 무드, 비트에 컷을 맞출 포인트, 캡컷에서 찾을 사운드 키워드.

## 🎞️ 편집 팁 (캡컷 / 프리미어)
- 이 영상에 꼭 쓰면 좋은 기능 3~5가지. 캡컷 기능명과 프리미어 기능명을 함께.

## 📤 내보내기 설정
- 비율(보통 9:16 세로), 해상도(1080×1920), 프레임(30fps), 캡컷/프리미어에서의 위치를 초보자용으로.

## 📝 업로드용
- 캡션 1개, 해시태그 15개, 커버(썸네일) 문구 1줄.`;

function buildReelsPrompt() {
  const platform = reelsChoice("#reels-platform", "릴스+쇼츠 공용");
  const length = reelsChoice("#reels-length", "30초");
  const tone = reelsChoice("#reels-tone", "감성적이고 잔잔한");
  const narration = reelsChoice("#reels-narration", "자막 위주 + 짧은 나레이션");
  const topic = ($("#reels-topic").value || "").trim() || "(설명 없음 — 올린 소스만 보고 판단)";
  const s = settings || {};
  return `아래 조건으로 릴스/숏츠 편집 대본을 만들어줘.

[내 계정] 주제: ${s.topic || "리빙"} · 목표: ${s.goal || "체험단·수익화"}
[형식] ${platform}
[목표 길이] ${length}
[톤·분위기] ${tone}
[나레이션] ${narration}

[영상 설명·강조점]
${topic}

[내가 올린 소스 목록 — 이 순서가 곧 편집 순서]
${buildReelsMediaSummary()}

위 소스들을 실제로 배치해서, 캡컷·프리미어에서 바로 따라 만들 수 있게 정해준 형식대로 대본을 완성해줘.`;
}

/* 대본 생성 (refineReq를 주면 기존 대본을 그 요청대로만 수정) */
async function generateReelsScript(refineReq) {
  if (reelsBusy) return;
  const refining = typeof refineReq === "string" && refineReq.trim();
  if (refining && !reelsResult) { toast("먼저 대본을 만들어야 고칠 수 있어요."); return; }
  const topic = ($("#reels-topic").value || "").trim();
  if (!refining && !reelsMedia.length && !topic) {
    toast("사진·영상을 올리거나, 최소한 어떤 영상인지 설명을 적어주세요.");
    $("#reels-topic").focus();
    return;
  }
  reelsBusy = true;
  stopReelsTts();
  const btn = $("#reels-gen");
  const refineBtn = $("#reels-refine-go");
  const note = $("#reels-gen-note");
  const card = $("#reels-result-card");
  const out = $("#reels-result");
  btn.disabled = true; btn.textContent = refining ? "🛠 고치는 중..." : "🎬 대본 만드는 중...";
  refineBtn.disabled = true;
  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  // 무료 AI는 스트리밍이 없어 조용히 오래 걸릴 수 있음 — 진행 멘트로 안심시키기
  const stages = refining
    ? ["🛠 요청하신 부분을 고치는 중...", "📝 나머지 형식을 그대로 유지하며 다듬는 중...", "✅ 마무리 점검 중... (거의 다 됐어요!)"]
    : [
      "📦 올린 소스를 살펴보는 중...",
      "🪝 스크롤을 멈출 후크를 짜는 중...",
      "✂️ 컷 편집표에 소스를 배치하는 중...",
      "🎙️ 나레이션과 자막을 쓰는 중...",
      "🎵 어울리는 BGM을 고르는 중...",
      "📝 캡션과 해시태그를 다듬는 중... (거의 다 됐어요!)"
    ];
  let stageIdx = 0;
  let streamed = false;
  const showStage = () => {
    out.innerHTML = `<div class="reels-loading">${stages[Math.min(stageIdx, stages.length - 1)]}</div>`;
    note.textContent = "보통 10~30초 걸려요. 화면을 벗어나지 말고 잠시만요...";
  };
  showStage();
  const stageTimer = setInterval(() => { stageIdx++; if (!streamed) showStage(); }, 5000);

  let messages;
  if (refining) {
    // 기존 대본을 맥락으로 주고, 요청한 부분만 고쳐서 전체를 다시 받기
    messages = [
      { role: "user", content: reelsLastPromptText || buildReelsPrompt() },
      { role: "assistant", content: reelsResult },
      { role: "user", content: `방금 만든 대본에서 다음 요청만 반영해서 수정해줘: ${refineReq.trim()}\n\n나머지는 유지하고, 처음 정한 형식(제목 후보~업로드용) 그대로 전체 대본을 다시 출력해줘.` }
    ];
  } else {
    // 내 API 키(Anthropic)가 있으면 미리보기 이미지를 함께 보내 AI가 직접 보게 함
    const promptText = buildReelsPrompt();
    reelsLastPromptText = promptText;
    const hasKey = (settings && settings.apiKey || "").trim();
    let userContent = promptText;
    if (hasKey) {
      const blocks = [];
      for (const m of reelsMedia) {
        if (m.thumbs[0] && blocks.length < 8) {
          blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.thumbs[0].split(",")[1] } });
        }
      }
      if (blocks.length) userContent = [{ type: "text", text: promptText }, ...blocks];
    }
    messages = [{ role: "user", content: userContent }];
  }

  try {
    const md = await aiChat(REELS_SYSTEM, messages, (partial) => {
      streamed = true;
      out.innerHTML = renderMarkdown(partial);
    });
    reelsResult = md;
    store.set("reelsLast", md);
    if (refining) updateReelsScript(md); else saveReelsScript(md);
    out.innerHTML = renderMarkdown(md);
    note.textContent = refining
      ? "✅ 고쳤어요! 마음에 안 들면 다른 요청으로 또 고칠 수 있어요."
      : "✅ 완성! 보관함에도 저장해뒀어요. 대본을 복사하거나 자막(.srt)으로 저장해 캡컷·프리미어에 넣어보세요.";
    if (refining) $("#reels-refine-input").value = "";
  } catch (e) {
    if (refining) {
      // 수정 실패 시 기존 대본 유지
      out.innerHTML = renderMarkdown(reelsResult);
      note.textContent = "⚠️ 수정 요청이 실패했어요. 기존 대본은 그대로예요 — 잠시 후 다시 시도해주세요.";
    } else {
      out.innerHTML = "";
      card.classList.add("hidden");
      note.innerHTML = `⚠️ AI 연결이 안 됐어요. 걱정 마세요 — 위의 <b>[📋 프롬프트만 복사]</b>를 눌러 <a href="https://gemini.google.com" target="_blank" rel="noopener">Gemini</a>나 <a href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT</a> 새 대화에 붙여넣으면 똑같은 대본을 무료로 받을 수 있어요!`;
    }
    toast("⚠️ " + friendlyApiError(e), 6000);
  } finally {
    clearInterval(stageTimer);
    reelsBusy = false;
    btn.disabled = false; btn.textContent = "🎬 대본 만들기";
    refineBtn.disabled = false;
  }
}

/* 문서에서 특정 소제목(## …) 섹션의 본문만 잘라내기 */
function sliceSection(md, titleRe) {
  const lines = md.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s/.test(lines[i]) && titleRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return "";
  const body = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,4}\s/.test(lines[i])) break; // 다음 소제목에서 멈춤
    body.push(lines[i]);
  }
  return body.join("\n");
}

/* 자막 타임라인 → SRT 변환
   ① '자막 타임라인' 섹션의 mm:ss-mm:ss | 자막 줄  ②없으면 컷 편집표에서 폴백  ③최후: 전체에서 추출 */
function reelsToSrt(md) {
  let cues = parseCueLines(sliceSection(md, /자막\s*타임라인/));
  if (!cues.length) cues = parseCueTable(sliceSection(md, /컷\s*편집표/) || md);
  if (!cues.length) cues = parseCueLines(md);
  if (!cues.length) return "";
  const stamp = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
    const p = (n, l = 2) => String(n).padStart(l, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.startSec)} --> ${stamp(c.endSec)}\n${c.text}`).join("\n\n") + "\n";
}

/* "mm:ss-mm:ss | 자막" 형식 줄 파싱 (자막은 다음 파이프 전까지만 잡아 표 행 오염 방지) */
function parseCueLines(md) {
  if (!md) return [];
  const re = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[|｜]\s*([^|｜\n]+)/g;
  const cues = [];
  let mt;
  while ((mt = re.exec(md)) !== null) {
    const startSec = mt[3] !== undefined ? (+mt[1]) * 3600 + (+mt[2]) * 60 + (+mt[3]) : (+mt[1]) * 60 + (+mt[2]);
    const endSec = mt[6] !== undefined ? (+mt[4]) * 3600 + (+mt[5]) * 60 + (+mt[6]) : (+mt[4]) * 60 + (+mt[5]);
    const text = mt[7].trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    if (endSec > startSec && text) cues.push({ startSec, endSec, text });
  }
  return cues;
}

/* 폴백: 컷 편집표(| 시간 | ... | 화면 자막 |)에서 자막 추출 */
function parseCueTable(md) {
  if (!md) return [];
  const lines = md.split("\n").filter(l => l.includes("|"));
  if (lines.length < 2) return [];
  const header = lines[0].replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  const timeCol = header.findIndex(c => /시간|타임|time/i.test(c));
  const capCol = header.findIndex(c => /자막|텍스트|caption|자막/i.test(c));
  if (timeCol < 0 || capCol < 0) return [];
  const toSec = (str) => {
    const m = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  };
  const cues = [];
  for (let i = 1; i < lines.length; i++) {
    if (/^[\s:|-]+$/.test(lines[i])) continue; // 구분선
    const cells = lines[i].replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const tcell = cells[timeCol] || "";
    const range = tcell.split(/[-~–]/);
    const startSec = toSec(range[0] || "");
    let endSec = range[1] !== undefined ? toSec(range[1]) : null;
    const text = (cells[capCol] || "").replace(/^["'`]+|["'`]+$/g, "").trim();
    if (startSec === null || !text || /^[-–—]*$/.test(text)) continue;
    if (endSec === null || endSec <= startSec) endSec = startSec + 2.5;
    cues.push({ startSec, endSec, text });
  }
  return cues;
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyToClipboard(text, okMsg) {
  const done = () => toast(okMsg);
  const fail = () => {
    // 클립보드 API 실패 시 폴백 (구형/비보안 컨텍스트)
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) done(); else toast("복사가 안 됐어요. 직접 드래그해 복사해주세요.");
    } catch { toast("복사가 안 됐어요. 직접 드래그해 복사해주세요."); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fail);
  } else { fail(); }
}

function copyReelsScript() {
  if (!reelsResult) return;
  copyToClipboard(reelsResult, "📋 대본을 복사했어요. 캡컷·프리미어 메모나 대본란에 붙여넣으세요.");
}

/* 특정 섹션만 골라 복사 (마크다운 기호 제거해 바로 쓸 수 있게) */
function copyReelsSection(titleRe, label) {
  if (!reelsResult) return;
  const sec = sliceSection(reelsResult, titleRe);
  const text = (sec || "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
  if (!text) { toast(`대본에서 ${label} 부분을 찾지 못했어요. [🔄 다시]로 새로 만들어보세요.`); return; }
  copyToClipboard(text, `📋 ${label}만 복사했어요!`);
}

/* ---------- 나레이션 듣기 (브라우저 내장 TTS — 무료) ---------- */
let reelsTtsOn = false;

function setReelsTtsUi(on) {
  reelsTtsOn = on;
  const b = $("#reels-tts");
  if (b) b.textContent = on ? "⏹ 읽기 멈추기" : "🔊 나레이션 듣기";
}

function stopReelsTts() {
  if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch {} }
  setReelsTtsUi(false);
}

function toggleReelsTts() {
  if (!("speechSynthesis" in window)) {
    toast("이 브라우저는 소리 읽기(TTS)를 지원하지 않아요. 크롬·엣지·사파리에서 열어보세요.");
    return;
  }
  if (reelsTtsOn) { stopReelsTts(); return; }
  if (!reelsResult) return;
  const sec = sliceSection(reelsResult, /나레이션/);
  const text = (sec || "")
    .replace(/^\s*[-*•>]\s*/gm, "")
    .replace(/[*_`#]/g, "")
    .trim();
  if (!text) { toast("대본에서 나레이션 부분을 찾지 못했어요."); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 1.05;
  const ko = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang));
  if (ko) u.voice = ko;
  u.onend = () => setReelsTtsUi(false);
  u.onerror = () => setReelsTtsUi(false);
  setReelsTtsUi(true);
  speechSynthesis.speak(u);
  toast("🔊 나레이션을 읽어드릴게요. 직접 녹음할 때 속도 참고용으로 들어보세요!");
}

/* 무료 챗봇(Gemini·ChatGPT·Claude)에 붙여넣어 쓸 프롬프트 통째로 복사 */
function copyReelsPrompt() {
  const topic = ($("#reels-topic").value || "").trim();
  if (!reelsMedia.length && !topic) {
    toast("먼저 사진·영상을 올리거나 영상 설명을 적어주세요.");
    $("#reels-topic").focus();
    return;
  }
  const hasMedia = reelsMedia.length > 0;
  const mediaNote = hasMedia
    ? "\n\n※ 아래 소스 목록에 해당하는 사진·영상을 이 채팅에 함께 첨부하면 더 정확한 대본이 나와요."
    : "";
  const full = REELS_SYSTEM + "\n\n----- 아래는 내 요청 -----\n\n" + buildReelsPrompt() + mediaNote;
  copyToClipboard(full, "📋 프롬프트를 복사했어요! Gemini·ChatGPT·Claude 새 대화에 붙여넣으세요" + (hasMedia ? " (사진·영상도 함께 첨부!)." : "."));
}

function fillReelsExample() {
  const t = $("#reels-topic");
  if (t.value.trim() && !confirm("지금 적은 내용을 예시로 바꿀까요?")) return;
  t.value = "좁은 주방 수납 꿀템 소개 영상. 3천 원짜리 걸이 하나로 조리도구가 깔끔하게 정리되고 공간이 두 배로 넓어진 걸 보여주고 싶어요. Before(지저분)→After(깔끔) 비교가 핵심이고, 마지막엔 '프로필 링크에서 구매' 유도로 마무리.";
  t.focus();
  toast("✨ 예시를 넣었어요. 내 상황에 맞게 고쳐 쓰면 돼요.");
}

function clearReelsMedia() {
  if (!reelsMedia.length) return;
  if (!confirm("올린 사진·영상을 모두 뺄까요?")) return;
  reelsMedia.forEach(m => { try { URL.revokeObjectURL(m.url); } catch {} });
  reelsMedia = [];
  renderReelsMedia();
}

function setupReelsChips() {
  ["#reels-platform", "#reels-length", "#reels-tone", "#reels-narration"].forEach(sel => {
    $$(sel + " .chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        $$(sel + " .chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
      });
    });
  });
}

function renderReels() {
  if (reelsInited) { renderReelsMedia(); return; }
  reelsInited = true;
  setupReelsChips();

  // 처음 3단계 안내 (닫으면 다시 안 보임)
  if (!store.get("reelsHowtoDismissed", false)) {
    $("#reels-howto").classList.remove("hidden");
  }
  $("#reels-howto-close").addEventListener("click", () => {
    $("#reels-howto").classList.add("hidden");
    store.set("reelsHowtoDismissed", true);
  });

  const drop = $("#reels-drop");
  const input = $("#reels-file-input");
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", (e) => {
    if (e.target.files.length) addReelsFiles(e.target.files);
    e.target.value = "";
  });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragover"); }));
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) addReelsFiles(e.dataTransfer.files);
  });

  // 썸네일 카드 액션 + 전체 비우기 (이벤트 위임)
  $("#reels-media").addEventListener("click", (e) => {
    if (e.target.closest("#reels-clear")) { clearReelsMedia(); return; }
    const btn = e.target.closest(".reels-thumb-btn");
    if (!btn) return;
    const id = btn.closest(".reels-thumb").dataset.id;
    const act = btn.dataset.act;
    if (act === "del") removeReelsMedia(id);
    else if (act === "up") moveReelsMedia(id, -1);
    else if (act === "down") moveReelsMedia(id, 1);
  });

  $("#reels-example").addEventListener("click", fillReelsExample);
  $("#reels-prompt").addEventListener("click", copyReelsPrompt);
  $("#reels-gen").addEventListener("click", () => generateReelsScript());
  $("#reels-regen").addEventListener("click", () => generateReelsScript());
  $("#reels-copy").addEventListener("click", copyReelsScript);
  $("#reels-copy-nar").addEventListener("click", () => copyReelsSection(/나레이션/, "나레이션"));
  $("#reels-copy-cap").addEventListener("click", () => copyReelsSection(/업로드용|캡션/, "캡션·해시태그"));
  $("#reels-tts").addEventListener("click", toggleReelsTts);
  $("#reels-txt").addEventListener("click", () => {
    if (!reelsResult) return;
    downloadTextFile("릴스대본.txt", reelsResult);
    toast("📥 대본을 .txt 파일로 저장했어요.");
  });
  $("#reels-srt").addEventListener("click", () => {
    if (!reelsResult) return;
    const srt = reelsToSrt(reelsResult);
    if (!srt) { toast("자막 타임라인을 못 찾았어요. '다시' 버튼으로 한 번 더 생성해보세요."); return; }
    downloadTextFile("자막.srt", srt, "application/x-subrip");
    toast("💬 자막(.srt)을 저장했어요! 캡컷은 '자막 → 자막 가져오기', 프리미어는 '캡션 가져오기'로 넣으세요.");
  });

  // 살짝 고치기 (원클릭 칩 + 직접 요청)
  $$("#reels-refine-chips .chip").forEach(chip => {
    chip.addEventListener("click", (e) => { e.preventDefault(); generateReelsScript(chip.dataset.req); });
  });
  const refineGo = () => {
    const v = $("#reels-refine-input").value.trim();
    if (!v) { $("#reels-refine-input").focus(); toast("어떻게 고칠지 적어주세요. (예: 15초로 줄여줘)"); return; }
    generateReelsScript(v);
  };
  $("#reels-refine-go").addEventListener("click", refineGo);
  $("#reels-refine-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) refineGo(); });

  // 보관함 (이벤트 위임)
  $("#reels-lib").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".reels-lib-item").dataset.id;
    const s = reelsScripts.find(x => x.id === id);
    if (!s) return;
    if (btn.dataset.act === "open") openReelsScript(id);
    else if (btn.dataset.act === "copy") copyToClipboard(s.md, `📋 "${s.title}" 대본을 복사했어요.`);
    else if (btn.dataset.act === "srt") {
      const srt = reelsToSrt(s.md);
      if (!srt) { toast("이 대본에서 자막 타임라인을 못 찾았어요."); return; }
      downloadTextFile("자막.srt", srt, "application/x-subrip");
      toast("💬 자막(.srt)을 저장했어요!");
    }
    else if (btn.dataset.act === "del") deleteReelsScript(id);
  });

  // 지난번에 만든 대본 복원 (사진·영상은 용량상 저장하지 않아요)
  const last = store.get("reelsLast", "");
  if (last) {
    reelsResult = last;
    // 예전 버전에서 넘어온 경우: 보관함에 없으면 옮겨 담기
    if (!reelsScripts.some(s => s.md === last)) {
      reelsScripts.unshift({ id: "s-mig-" + Date.now(), ts: Date.now(), title: extractReelsTitle(last, "지난 대본"), platform: "", length: "", tone: "", md: last });
      if (reelsScripts.length > REELS_SCRIPT_CAP) reelsScripts.length = REELS_SCRIPT_CAP;
      store.set("reelsScripts", reelsScripts);
    }
    reelsCurrentId = (reelsScripts.find(s => s.md === last) || {}).id || null;
    $("#reels-result").innerHTML = renderMarkdown(last);
    $("#reels-result-card").classList.remove("hidden");
    $("#reels-gen-note").textContent = "↑ 지난번에 만든 대본이에요. 새로 만들면 바뀝니다.";
  }

  renderReelsLibrary();
  renderReelsMedia();
}

/* ---------- 시작 ---------- */
function init() {
  applyTheme();
  setupChipRows();
  bindEvents();
  if (!settings) {
    $("#onboarding").classList.remove("hidden");
  } else {
    $("#app").classList.remove("hidden");
    renderAll();
  }
  // 오프라인·홈화면 설치 지원 (https에서만 — file://로 열면 브라우저가 지원 안 함)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  // 자료실·큰 기록을 IndexedDB로 (localStorage 5MB 한계 우회) + 영구 보관 요청(청소 대상 제외)
  initDocsStore().then(() => { setTimeout(() => autoSyncLinkedDocs(), 4000); }); // 시작 후 여유를 두고 연동 자료 자동 새로고침
  initBigStore().then(() => {
    if (settings) { renderAll(); resumePendingFinals(); } // IDB의 진짜 기록으로 다시 그린 뒤 끊긴 업무 재개
  });
  try { navigator.storage?.persist?.().catch(() => {}); } catch {}
}

init();

// 자동 테스트용 훅 (앱 동작에는 영향 없음)
window.__senter = {
  chatterTick, holdScrum, rebuildStaff, taskBrief, verifyBrief, focusComplete,
  recordUsage, renderTokenBar, estTokens, ensureUsage, autoPilotTick, templateDraft,
  // 큰 기록이 IndexedDB로 이동해 localStorage 직접 읽기/쓰기가 불가 — 테스트는 이 훅 사용
  getDocs: () => docs,
  getTasks: () => tasks,
  getMeetings: () => meetings,
  setTasks: (arr) => { tasks = arr; store.set("tasks", tasks); renderBoard(); updateOfficeStatuses(); },
  setDocs: (arr) => { docs = arr; saveDocs(); renderLibrary(); renderChat(); },
  staffKnowledge, docSnippets, pickDocRefs, buildSystemPrompt,
  fetchLinkedPage, notionBlocksToText, addLinkedDoc, autoSyncLinkedDocs,
  imageToText, visionAvailable, fetchImageAsDataUrl,
  classifyDoc, autoDocTitle, isGenericName,
  getReports: () => reports, archiveReport, reworkFromReport, renderArchive,
  runCompetitorAnalysis, collectSponsorFeeds, parseSponsorResults, classifySponsor,
  getSponsorFeeds: () => sponsorFeeds
};
