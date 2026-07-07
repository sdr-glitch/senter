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
    tasks: ["이 사진 캡션 5개 뽑아줘: (사진 설명)", "리빙 계정용 해시태그 세트 만들어줘", "프로필 소개글 3버전 써줘"],
    prompt: () => `지금부터 너는 나의 'SNS 카피라이터' 직원이야. 한국 인스타·블로그 감성의 자연스러운 문장을 쓰는 전문가고, 번역투는 절대 쓰지 않아.

${staffContext()}

[담당 업무]
- 게시물 캡션, 릴스 제목, 프로필 소개글, 해시태그 세트 작성
- 내가 사진/상황을 설명하면 바로 복사해서 쓸 수 있는 완성 문구로

[업무 규칙]
1. 항상 여러 버전을 라벨 붙여 제시: [감성] [정보형] [유머] [저장유도] 등
2. 캡션 구조: 첫 줄은 스크롤을 멈추게 하는 후킹 → 본문 → 마지막에 댓글/저장을 부르는 한마디
3. 해시태그는 대형(게시물 수십만 개)+중형+소형(니치)을 섞은 세트로 주고, 왜 섞는지 한 줄 설명
4. 이모지는 과하지 않게, 실제 한국 리빙 계정 톤으로
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
  }
];

/* ---------- 커스텀 직원 (채용) ---------- */
let customStaff = store.get("customStaff", []);

const LOOK_PALETTE = [
  { shirt: "#d35400", hair: "#241d18" }, { shirt: "#27ae60", hair: "#4a3625" },
  { shirt: "#f1c40f", hair: "#2a2118" }, { shirt: "#34495e", hair: "#3b2d23" },
  { shirt: "#1abc9c", hair: "#553a24" }, { shirt: "#9b59b6", hair: "#241d18" }
];
const MAX_STAFF = 11; // 사무공간 책상 한계 (매니저 포함 12자리)

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

  // 책상 자동 배치: 사무공간에 4열 그리드
  DESK_POS = { boss: [12, 15] };
  WORK_POS = { boss: [12, 26] };
  const deskIds = ["pm", ...STAFF.map(s => s.id)];
  deskIds.forEach((id, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    DESK_POS[id] = [9 + 12.8 * col, 50 + 18 * row];
    WORK_POS[id] = [9 + 12.8 * col, 58 + 18 * row];
  });

  SEATS = seatRing(OFFICE_AGENTS.length);

  // 배정 규칙: 커스텀 직원 키워드가 우선
  ROUTES = [
    ...customStaff
      .filter(c => c.keywords && c.keywords.length)
      .map(c => [new RegExp(c.keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")), c.id]),
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
    digest: { shirt: "#7f8c8d", hair: "#241d18" }
  };
  if (AGENT_LOOK_BASE[id]) return AGENT_LOOK_BASE[id];
  const c = customStaff.find(x => x.id === id);
  return (c && c.look) || LOOK_PALETTE[0];
}

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
  return aiChat(buildSystemPrompt(persona), messages, onDelta);
}

async function callClaudeSystem(system, messages, onDelta) {
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
async function aiChat(system, messages, onDelta = () => {}) {
  if ((settings && settings.apiKey || "").trim()) {
    return callClaudeSystem(system, messages, onDelta);
  }
  if (freeAiBroken) {
    const err = new Error("NO_AI");
    throw err;
  }
  const puter = await loadPuter().catch(() => { const err = new Error("NO_AI"); throw err; });
  const msgs = [{ role: "system", content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))];
  try {
    const resp = await puter.ai.chat(msgs);
    const text = extractPuterText(resp).trim();
    if (!text) throw new Error("빈 응답");
    onDelta(text);
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

function renderStaff() {
  const list = $("#staff-list");
  list.innerHTML = "";
  STAFF.forEach(st => {
    const card = document.createElement("section");
    card.className = "card staff-card";

    const head = document.createElement("div");
    head.className = "staff-head";
    head.innerHTML = `<span class="staff-emoji">${st.emoji}</span><div><div class="staff-name">${escapeHtml(st.name)}${st.custom ? ' <span class="staff-badge">직접 채용</span>' : ""}</div><div class="staff-role">${escapeHtml(st.role)}</div></div>`;
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
    details.addEventListener("toggle", () => { if (details.open) pre.textContent = st.prompt(); });

    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "📋 업무 지시서 복사";
    btn.addEventListener("click", async () => {
      try {
        await copyText(st.prompt());
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

// 예전 데이터 마이그레이션: 검증 단계(stage)가 없는 진행 중 업무에 부여
tasks.forEach(t => {
  if (t.status === "doing" && !t.stage) t.stage = t.result ? "verify" : "draft";
});

/* 사무실 구조 (좌표는 % 단위) */
const ROOMS = [
  { id: "ceo", name: "대표실", x: 1.5, y: 2, w: 26, h: 34 },
  { id: "meet", name: "회의실", x: 55, y: 2, w: 43.5, h: 44 },
  { id: "work", name: "사무공간", x: 1.5, y: 40, w: 50, h: 58 },
  { id: "pantry", name: "탕비실", x: 55, y: 50, w: 20.5, h: 48 },
  { id: "lounge", name: "휴게공간", x: 78, y: 50, w: 20.5, h: 48 }
];

/* 휴식 공간 자리 */
const LOUNGE_SPOTS = [[84, 70], [92, 70], [88, 86], [83, 91]];
const PANTRY_SPOTS = [[61, 72], [70, 72], [65, 87], [70, 91]];
const BREAK_BUBBLES = ["☕ 커피 한 잔...", "잠깐 쉬는 중이에요", "🍪 간식 타임!", "금방 복귀합니다!"];
const HALL_SPOTS = [[35, 22], [42, 30], [30, 30], [48, 20]];

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
  const zoom = Math.min(office.clientWidth / 920, 1);
  floor.style.setProperty("--zoom", zoom.toFixed(3));
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
  addFurniture(floor, "f-prop", 23, 8, `<span class="stand">📚</span>`);
  addFurniture(floor, "f-prop", 4, 30, `<span class="stand">🪴</span>`);

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
  addFurniture(floor, "f-prop", 4, 44, `<span class="stand">🖨️</span>`);
  addFurniture(floor, "f-prop", 48, 94, `<span class="stand">🌿</span>`);

  // 가구 — 탕비실
  addFurniture(floor, "f-counter", 65, 58, `<span class="stand">☕🫖🍪</span>`);
  addFurniture(floor, "f-prop", 58, 93, `<span class="stand">🧃</span>`);

  // 가구 — 휴게공간
  addFurniture(floor, "f-sofa", 88, 61);
  addFurniture(floor, "f-rug", 88, 80);
  addFurniture(floor, "f-prop", 95, 55, `<span class="stand">🪴</span>`);

  // 복도 소품
  addFurniture(floor, "f-prop", 52.5, 20, `<span class="stand">🌿</span>`);

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
    // 정식 스크럼: 전원 회의실 집합
    OFFICE_AGENTS.forEach((a, i) => moveAgent(a.id, SEATS[i % SEATS.length][0], SEATS[i % SEATS.length][1]));
    await sleep(2100);
    await say("pm", `스크럼 시작할게요! 📣 현재 열린 업무 ${open}건, 검토 대기 ${review}건입니다. 돌아가면서 공유해주세요.`);
    for (const ex of briefingExtras) await say("pm", ex);
    for (const a of speakers) {
      for (const line of agentReportLines(a.id)) {
        await say(a.id, line);
      }
    }
    const done = tasks.filter(t => t.status === "done").length;
    await say("pm", review
      ? `공유 감사합니다. ${boss}님, 검토 대기 ${review}건 확인 부탁드려요! 오늘도 화이팅 🔥`
      : `공유 감사합니다. 누적 완료 ${done}건! ${boss}님, 새 지시 있으면 언제든 내려주세요. 오늘도 화이팅 🔥`);
  }

  meetings.unshift({ date: Date.now(), minutes, quick });
  meetings = meetings.slice(0, 10);
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
  teamChat = teamChat.slice(-60);
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

  head.innerHTML = `<span class="sm-emoji">${st.emoji}</span><div><div class="sm-name">${escapeHtml(st.name)}</div><div class="sm-role">${escapeHtml(st.role)} · 완료 ${doneCount}건</div></div>`;

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
    if ((settings.apiKey || "").trim() && t.status === "doing") autoWork(t);
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
  L.push(`## 보유 자료`);
  L.push(`- 자료실 ${docs.length}개 (활성 ${docs.filter(x => x.enabled).length}개)`);
  return L.join("\n");
}

async function generateReport() {
  const btn = $("#report-btn");
  btn.disabled = true; btn.textContent = "작성 중...";
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
  store.set("docs", docs);
  renderLibrary();
  logActivity(`📑 운영 보고서 작성 완료 → 자료실 저장`);
  postChat("pm", `${data.today} 운영 보고서 작성 완료! 자료실에 저장했습니다 📑`);
  btn.disabled = false; btn.textContent = "📑 보고서 생성";
  toast("📑 보고서 완성! 자료실에 저장됐어요. 지금 바로 보여드릴게요.");
  openDocModal(doc);
}

/* ----- 자료 스터디 회의 (자료실 문서를 직원들이 회의로 소화) ----- */
async function studyMeeting(docId) {
  const doc = docs.find(d => d.id === docId);
  if (!doc) return;
  if (officeState.meeting || chatterBusy) { toast("지금 다른 회의가 진행 중이에요. 잠시 후 다시 시도해주세요."); return; }
  switchTab("office");
  officeState.meeting = true;
  $("#scrum-btn").disabled = true;
  $("#brief-btn").disabled = true;

  const logWrap = $("#meeting-log-wrap");
  const log = $("#meeting-log");
  logWrap.classList.remove("hidden");
  log.innerHTML = "";
  $("#meeting-log-date").textContent = `📖 자료 스터디 · ${new Date().toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

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

  await say("pm", `『${doc.title}』 자료 스터디 회의 시작합니다 📖 소화 코치님, 핵심 브리핑 부탁해요.`);

  // 핵심 요약: AI 가능하면 진짜 요약, 아니면 자료 발췌
  let summary = "";
  try {
    summary = await aiChat(
      `너는 강의 자료를 소화시키는 코치다. 아래 자료의 핵심을 3줄로 요약하고, 이 팀(SNS 계정 운영)이 바로 실행할 액션 3가지를 제안하라. 형식: "핵심: ..." 3줄, "실행: ..." 3줄. 한국어 간결하게.\n\n${staffContext()}`,
      [{ role: "user", content: doc.content.slice(0, 20000) }], () => {});
  } catch {
    const firstBits = doc.content.replace(/\s+/g, " ").slice(0, 150);
    summary = `핵심 발췌: "${firstBits}..." — 전체 내용은 자료실에서 확인할 수 있어요. (AI 연결 시 진짜 요약과 실행 계획이 나와요)`;
  }
  for (const line of summary.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6)) {
    await say("digest", line, 2400);
  }

  await say("planner", "좋네요! 이번 주 콘텐츠 기획에 바로 반영하겠습니다 ✍️");
  await say("copywriter", "저도 캡션 쓸 때 이 자료 톤을 참고할게요!");
  await say("pm", `정리 감사합니다. 이 자료는 앞으로 업무에 자동으로 반영됩니다. 회의 끝! 📖`);

  meetings.unshift({ date: Date.now(), minutes, study: doc.title });
  meetings = meetings.slice(0, 10);
  store.set("meetings", meetings);
  logActivity(`📖 『${doc.title}』 스터디 회의 완료 — 회의록 저장`);

  // 스터디한 자료는 자동으로 활성화 → 직원들이 업무에 활용
  if (!doc.enabled) { doc.enabled = true; store.set("docs", docs); renderLibrary(); }

  officeState.meeting = false;
  $("#scrum-btn").disabled = false;
  $("#brief-btn").disabled = false;
  OFFICE_AGENTS.forEach(a => moveAgent(a.id, ...WORK_POS[a.id]));
}

/* ----- 활동 로그 ----- */
function logActivity(text) {
  activity.unshift({ at: Date.now(), text });
  activity = activity.slice(0, 30);
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

async function handleDirective() {
  const input = $("#directive-input");
  let text = input.value.trim();
  if (!text) { input.focus(); return; }
  input.value = "";
  const btn = $("#directive-go");
  btn.disabled = true;

  // "@직원이름 지시내용" 으로 담당 직접 지정
  const mention = text.match(/^@(\S+)\s+(.+)/);
  if (mention) {
    const target = STAFF.find(s => s.name.replace(/\s/g, "").includes(mention[1].replace(/\s/g, "")));
    if (target) {
      const t = createTask(mention[2].trim(), target.id);
      renderBoard(); updateOfficeStatuses();
      toast(`🎯 ${target.name}에게 직접 배정!`);
      btn.disabled = false;
      if ((settings.apiKey || "").trim() && t.status === "doing") autoWork(t);
      return;
    }
    text = mention[2].trim(); // 못 찾으면 일반 배정으로
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

  // API 키가 있으면 직원이 자동으로 작업 수행
  if ((settings.apiKey || "").trim()) {
    for (const t of created) if (t.status === "doing") autoWork(t);
  }
}

/* ----- 3단계 품질 검증 파이프라인 -----
   ① 담당자 초안(draft) → ② 전문가 2명 교차검증 후 수정·재검토(verify) → ③ 매니저 최종 검토(final) → 보고(review) */

const STAGE_LABEL = {
  draft: "1/3 초안 작성",
  verify: "2/3 교차검증·보완",
  final: "3/3 매니저 최종 검토"
};

function reviewersFor(assignee) {
  const others = STAFF.filter(s => s.id !== assignee);
  return [others[0], others[1] || others[0]];
}

/* 자료실의 강의 자료를 직원 업무에 반영 (발췌) */
function staffKnowledge(limit = 6000) {
  const enabled = docs.filter(d => d.enabled);
  if (!enabled.length) return "";
  let budget = limit;
  const parts = [];
  for (const d of enabled) {
    if (budget <= 0) break;
    const slice = d.content.slice(0, Math.min(budget, 2500));
    parts.push(`▸ ${d.title}\n${slice}`);
    budget -= slice.length;
  }
  return `\n\n[참고 자료 — 사장님이 학습시킨 강의/노트 발췌. 업무에 적극 활용할 것]\n${parts.join("\n\n")}`;
}

function taskBrief(task) {
  const st = STAFF.find(s => s.id === task.assignee);
  if (!st) return `업무: ${task.title}\n위 업무의 결과물(초안)을 만들어줘.`;
  return `${st.prompt()}${staffKnowledge()}

──────────────
[오늘의 업무 지시]
${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}

인사나 질문 없이, 위 업무의 결과물 초안을 바로 쓸 수 있는 완성된 형태로 만들어서 보여줘.`;
}

function verifyBrief(task) {
  const [r1, r2] = reviewersFor(task.assignee);
  return `너는 SNS 마케팅 팀의 검증 패널이다. ${r1.name}(${r1.role})와 ${r2.name}(${r2.role}) 두 전문가의 관점을 모두 갖고 있다.

${staffContext()}${staffKnowledge(3000)}

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
    logActivity(`🧑‍💼 매니저: 「${t.title}」 3차 검토 통과 → 사장님 보고`);
    postChat("pm", `「${t.title}」 3차 검토 통과! 사장님께 보고 올립니다 📋`);
    speak("pm", "3차 검토 통과! 보고 올립니다 📋");
    renderBoard(); updateOfficeStatuses();
  }, 4000);
}

// 새로고침 등으로 최종 검토가 멈춘 업무 재개
function resumePendingFinals() {
  tasks.filter(t => t.status === "doing" && t.stage === "final").forEach(finalReview);
}

/* ----- 자동 작업 (API 키 연결 시): 전 단계 자동 실행 ----- */
async function autoWork(task) {
  if (task.autoWorking) return;
  task.autoWorking = true;
  const st = STAFF.find(s => s.id === task.assignee);
  if (!st) { task.autoWorking = false; return; }
  const cleanPrompt = (s) => s.prompt().replace(/\[시작 인사\][\s\S]*$/, "");
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
      task.result = await aiChat(cleanPrompt(st) + staffKnowledge(),
        [{ role: "user", content: `인사나 질문 없이, 이 업무의 결과물을 바로 쓸 수 있는 완성된 형태로 만들어줘:\n${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}` }], () => {});
      task.status = "review";
      task.stage = "";
      task.autoWorking = false;
      store.set("tasks", tasks);
      logActivity(`${staffEmoji(task.assignee)} ${staffName(task.assignee)}: 「${task.title}」 결과물 제출 → 검토 대기 (빠른 모드)`);
      postChat(task.assignee, `「${task.title}」 결과물 올렸습니다. 검토 부탁드려요 👀`);
      speak(task.assignee, "결과물 올렸습니다! 검토 부탁드려요 👀");
      renderBoard(); updateOfficeStatuses();
      return;
    }

    // ① 초안 (이미 초안이 있으면 이 단계는 건너뜀)
    if (!task.draft || task.stage === "draft") {
      task.stage = "draft"; renderBoard();
      speak(task.assignee, "초안 작업 시작합니다... 🔨", 2500);
      task.draft = await aiChat(cleanPrompt(st) + staffKnowledge(),
        [{ role: "user", content: `인사나 질문 없이, 이 업무의 결과물 초안을 바로 쓸 수 있는 완성된 형태로 만들어줘:\n${task.title}${task.note ? `\n(보완 요청: ${task.note})` : ""}` }], () => {});
    }
    task.stage = "verify";
    store.set("tasks", tasks);
    logActivity(`${staffEmoji(task.assignee)} ${staffName(task.assignee)}: 「${task.title}」 초안 완성 → 1차 교차검증`);
    renderBoard();

    // ② 1차 교차검증
    const [r1, r2] = reviewersFor(task.assignee);
    const critique = await aiChat(
      `너는 ${r1.name}(${r1.role})와 ${r2.name}(${r2.role}) 두 전문가로 구성된 검증 패널이다. 결과물의 오류, 빠진 것, 보완점을 찾아라. 최대 5개, 각 한 줄, 심각한 문제 우선. 문제가 없으면 "이상 없음"이라고만 답하라.\n\n${staffContext()}`,
      [{ role: "user", content: `업무: ${task.title}\n\n━━━ 초안 ━━━\n${task.draft}` }], () => {});
    task.critique = critique;
    huddleTheater(task, critique.split("\n")[0]); // 연출은 기다리지 않음

    // 수정 + 재검토
    const revised = await aiChat(cleanPrompt(st),
      [{ role: "user", content: `아래 초안에 대한 검증 의견이 도착했어. 의견을 모두 반영해 수정하고, 스스로 재검토까지 마친 최종본만 출력해줘 (설명 없이 결과물만).\n\n[검증 의견]\n${critique}\n\n━━━ 초안 ━━━\n${task.draft}` }], () => {});
    task.stage = "final";
    store.set("tasks", tasks);
    logActivity(`✔ 「${task.title}」 교차검증·보완·재검토 완료 → 매니저 최종 검토`);
    postChat(task.assignee, `「${task.title}」 보완 완료, 재검토까지 마쳤습니다 ✅`);
    renderBoard();

    // ③ 매니저 3차 최종 검토
    speak("pm", "3차 최종 검토 들어갑니다 🧐", 2500);
    postChat("pm", `「${task.title}」 3차 최종 검토 중입니다 🧐`);
    const final = await aiChat(
      `너는 SNS 마케팅 팀의 매니저(PM)다. 아래 결과물을 3차 최종 점검하라: 지시 사항을 충족하는지, 바로 사용 가능한지 확인하고 사소한 다듬기만 해라. 첫 줄에 "✅ 3차 검토 통과 — (한 줄 총평)"을 쓰고, 그 아래에 최종 결과물 전체를 출력하라.\n\n${staffContext()}`,
      [{ role: "user", content: `업무 지시: ${task.title}\n\n━━━ 결과물 ━━━\n${revised}` }], () => {});
    task.result = final;
    task.status = "review";
    task.stage = "";
    task.autoWorking = false;
    store.set("tasks", tasks);
    logActivity(`🧑‍💼 매니저: 「${task.title}」 3차 검토 통과 → 사장님 보고`);
    postChat("pm", `「${task.title}」 3차 검토 통과! 사장님께 보고 올립니다 📋`);
    speak("pm", "3차 검토 통과! 보고 올립니다 📋");
    renderBoard();
    updateOfficeStatuses();
  } catch (e) {
    fail(e, STAGE_LABEL[task.stage] || "작업");
  }
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
    if ((settings.apiKey || "").trim()) autoWork(next);
  }
}

function renderBoard() {
  const kanban = $("#kanban");
  if (!kanban) return;
  kanban.innerHTML = "";

  BOARD_COLS.forEach(([status, label]) => {
    const col = document.createElement("div");
    col.className = "kanban-col";
    const items = tasks.filter(t => t.status === status);
    col.innerHTML = `<div class="kanban-col-head">${label} <span>${items.length}</span></div>`;

    items.forEach(t => {
      const card = document.createElement("div");
      card.className = "task-card";

      const head = document.createElement("div");
      head.className = "task-assignee";
      head.textContent = `${staffEmoji(t.assignee)} ${staffName(t.assignee)}`;

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
          if ((settings.apiKey || "").trim()) autoWork(t);
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
        });
        addBtn("↩ 보완 요청", "btn-small", () => {
          const note = prompt("어떤 점을 보완할까요? (직원에게 전달됩니다)");
          if (note === null) return;
          t.note = note.trim(); t.status = "doing"; t.stage = "draft";
          store.set("tasks", tasks);
          logActivity(`↩ 「${t.title}」 보완 요청 → ${staffName(t.assignee)} 재작업`);
          if (t.note) postChat("boss", `「${t.title}」 보완 부탁해요: ${t.note}`);
          postChat(t.assignee, "피드백 확인! 보완해서 다시 올릴게요 💪");
          speak(t.assignee, "피드백 확인! 보완해서 다시 올릴게요 💪");
          renderBoard(); updateOfficeStatuses();
          if ((settings.apiKey || "").trim()) autoWork(t);
        });
      }

      if (status === "done" && t.result) {
        addBtn("📚 자료실 저장", "btn-small", () => {
          if (docs.some(d => d.title === `[결과물] ${t.title}`)) { toast("이미 자료실에 있어요!"); return; }
          docs.push({ id: Date.now() + "", title: `[결과물] ${t.title}`, content: t.result, enabled: false });
          store.set("docs", docs);
          renderLibrary();
          toast("📚 자료실에 저장됐어요! 필요할 때 스위치를 켜면 멘토·직원이 참고해요.");
        });
      }

      addBtn("🗑", "btn-small btn-task-del", () => {
        if (!confirm(`「${t.title}」 업무를 삭제할까요?`)) return;
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

      col.appendChild(card);
    });

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "kanban-empty";
      empty.textContent = "비어있음";
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
      store.set("docs", docs);
      renderLibrary();
      renderChat();
    });

    item.append(toggle, title, meta, meetBtn, editBtn, delBtn);
    list.appendChild(item);
  });

  const total = docsTotalSize();
  const budget = KNOWLEDGE_CHAR_BUDGET;
  const enabledSize = docs.filter(d => d.enabled).reduce((s, d) => s + d.content.length, 0);
  let note = `전체 ${(total / 1000).toFixed(0)}천 자 저장됨`;
  if (enabledSize > budget) note += ` · ⚠️ 켜진 자료가 많아 한 번에 ${(budget / 1000).toFixed(0)}천 자까지만 참고돼요. 지금 필요한 자료만 켜두는 걸 추천!`;
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
    if (d) { d.title = title || d.title; d.content = content; }
  } else {
    docs.push({ id: Date.now() + "", title: title || "이름 없는 자료", content, enabled: true });
  }
  if (store.set("docs", docs)) toast(editingDocId ? "📚 자료가 수정됐어요!" : "📚 자료가 추가됐어요! 이제 멘토와 직원들이 이 내용을 참고해요.");
  $("#doc-modal").classList.add("hidden");
  editingDocId = null;
  renderLibrary();
  renderChat();
}

function addDocByPaste() { openDocModal(null); }
function editDoc(d) { openDocModal(d); }

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
const PDF_MAX_CHARS = 300000;

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
      } else {
        content = String(await file.text()).trim();
        if (!content) { failed.push(`${file.name} — 내용이 비어있어요`); continue; }
      }
      docs.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        title: file.name.replace(/\.(txt|md|markdown|pdf)$/i, ""),
        content, enabled: true
      });
      added++;
    } catch (e) {
      failed.push(`${file.name} — ${e.message || "읽기 실패"}`);
    }
  }

  if (added) {
    store.set("docs", docs);
    renderLibrary();
    renderChat();
  }
  if (added && !failed.length) toast(`📚 자료 ${added}개가 추가됐어요!`);
  else if (added && failed.length) toast(`📚 ${added}개 추가, ⚠️ 실패: ${failed[0]}`, 6000);
  else toast(`⚠️ 파일을 읽지 못했어요. ${failed[0] || "(.txt / .md / .pdf 지원)"}`, 6000);
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

/* ---------- 스튜디오 탭 (iframe 지연 로드) ---------- */
function renderStudio() {
  const frame = $("#studio-frame");
  if (frame && !frame.src) frame.src = "studio.html";
}

/* ---------- 설정 탭 ---------- */
function renderSettings() {
  const s = settings;
  $("#set-key").value = s.apiKey || "";
  $("#set-model").value = s.model || "claude-sonnet-5";
  $("#set-workmode").value = s.workMode || "thorough";
  $("#set-name").value = s.name || "";
  $("#set-topic").value = s.topic || "";
  $("#set-platforms").value = (s.platforms || []).join(", ");
  $("#set-goal").value = s.goal || "";
  $("#set-level").value = s.level || "";
}

function saveSettings() {
  settings.apiKey = $("#set-key").value.trim();
  settings.model = $("#set-model").value;
  settings.workMode = $("#set-workmode").value;
  settings.name = $("#set-name").value.trim() || "크리에이터";
  settings.topic = $("#set-topic").value.trim() || "리빙";
  settings.platforms = $("#set-platforms").value.split(",").map(x => x.trim()).filter(Boolean);
  settings.goal = $("#set-goal").value.trim();
  settings.level = $("#set-level").value.trim();
  store.set("settings", settings);
  renderKeyStatus();
  renderHome();
  renderBoard();
  const note = $("#set-saved");
  note.classList.remove("hidden");
  setTimeout(() => note.classList.add("hidden"), 2000);
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
    todos, events, notes, focusLog
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
      todos = data.todos || [];
      events = data.events || [];
      notes = data.notes || [];
      focusLog = data.focusLog || {};
      store.set("todos", todos);
      store.set("events", events);
      store.set("notes", notes);
      store.set("focusLog", focusLog);
      store.set("settings", settings);
      store.set("docs", docs);
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
  $$(".tab-panel").forEach(p => p.classList.add("hidden"));
  $("#tab-" + name).classList.remove("hidden");
  window.scrollTo({ top: 0 });
  if (name === "office") renderOffice();
  if (name === "staff") renderStaff();
  if (name === "tools") renderTools();
  if (name === "reels") renderReels();
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

  // 사무실
  $("#scrum-btn").addEventListener("click", () => holdScrum(false));
  $("#brief-btn").addEventListener("click", () => holdScrum(true));
  $("#report-btn").addEventListener("click", generateReport);

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

function loadVideoMeta(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "auto"; v.muted = true; v.playsInline = true; v.src = url;
    let settled = false;
    const bail = () => { if (!settled) { settled = true; resolve({ duration: 0, w: 0, h: 0, thumbs: [] }); } };
    v.addEventListener("error", bail);
    setTimeout(bail, 12000);
    v.addEventListener("loadeddata", async () => {
      if (settled) return; settled = true;
      const dur = isFinite(v.duration) ? v.duration : 0;
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
  const summary = `<div class="reels-media-summary">📦 소스 ${reelsMedia.length}개 · 영상 ${vidCount}개(${fmtDur(totalVid)})${imgCount ? " · 사진 " + imgCount + "장" : ""} <span class="reels-media-order-hint">← 순서가 곧 컷 순서예요. 화살표로 바꿀 수 있어요</span></div>`;
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

async function generateReelsScript() {
  if (reelsBusy) return;
  const topic = ($("#reels-topic").value || "").trim();
  if (!reelsMedia.length && !topic) {
    toast("사진·영상을 올리거나, 최소한 어떤 영상인지 설명을 적어주세요.");
    $("#reels-topic").focus();
    return;
  }
  reelsBusy = true;
  const btn = $("#reels-gen");
  const note = $("#reels-gen-note");
  const card = $("#reels-result-card");
  const out = $("#reels-result");
  btn.disabled = true; btn.textContent = "🎬 대본 만드는 중...";
  note.textContent = "AI가 소스를 보고 편집 대본을 짜고 있어요. 잠시만요...";
  card.classList.remove("hidden");
  out.innerHTML = `<div class="reels-loading">✍️ 대본 작성 중...</div>`;
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  // 내 API 키(Anthropic)가 있으면 미리보기 이미지를 함께 보내 AI가 직접 보게 함
  const promptText = buildReelsPrompt();
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

  try {
    const md = await aiChat(REELS_SYSTEM, [{ role: "user", content: userContent }], (partial) => {
      out.innerHTML = renderMarkdown(partial);
    });
    reelsResult = md;
    out.innerHTML = renderMarkdown(md);
    note.textContent = "✅ 완성! 대본을 복사하거나 자막(.srt)으로 저장해 캡컷·프리미어에 넣어보세요.";
  } catch (e) {
    out.innerHTML = "";
    card.classList.add("hidden");
    note.textContent = "";
    toast("⚠️ " + friendlyApiError(e), 6000);
  } finally {
    reelsBusy = false;
    btn.disabled = false; btn.textContent = "🎬 대본 만들기";
  }
}

/* 자막 타임라인 → SRT 변환 */
function reelsToSrt(md) {
  const re = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[|｜]\s*(.+)/g;
  const cues = [];
  let mt;
  while ((mt = re.exec(md)) !== null) {
    const toSec = (a, b, c) => c !== undefined ? (+a) * 60 + (+b) : (+a) * 60 + (+b); // mm:ss 기준
    const startSec = mt[3] !== undefined ? (+mt[1]) * 3600 + (+mt[2]) * 60 + (+mt[3]) : (+mt[1]) * 60 + (+mt[2]);
    const endSec = mt[6] !== undefined ? (+mt[4]) * 3600 + (+mt[5]) * 60 + (+mt[6]) : (+mt[4]) * 60 + (+mt[5]);
    const text = mt[7].trim().replace(/^["'`]|["'`]$/g, "");
    if (endSec > startSec && text) cues.push({ startSec, endSec, text });
  }
  if (!cues.length) return "";
  const stamp = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
    const p = (n, l = 2) => String(n).padStart(l, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.startSec)} --> ${stamp(c.endSec)}\n${c.text}`).join("\n\n") + "\n";
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyReelsScript() {
  if (!reelsResult) return;
  navigator.clipboard.writeText(reelsResult).then(
    () => toast("📋 대본을 복사했어요. 캡컷·프리미어 메모나 대본란에 붙여넣으세요."),
    () => toast("복사에 실패했어요. 대본을 직접 드래그해 복사해주세요.")
  );
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

  // 썸네일 카드 액션 (이벤트 위임)
  $("#reels-media").addEventListener("click", (e) => {
    const btn = e.target.closest(".reels-thumb-btn");
    if (!btn) return;
    const id = btn.closest(".reels-thumb").dataset.id;
    const act = btn.dataset.act;
    if (act === "del") removeReelsMedia(id);
    else if (act === "up") moveReelsMedia(id, -1);
    else if (act === "down") moveReelsMedia(id, 1);
  });

  $("#reels-gen").addEventListener("click", generateReelsScript);
  $("#reels-regen").addEventListener("click", generateReelsScript);
  $("#reels-copy").addEventListener("click", copyReelsScript);
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

  renderReelsMedia();
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
    resumePendingFinals();
  }
}

init();

// 자동 테스트용 훅 (앱 동작에는 영향 없음)
window.__senter = { chatterTick, holdScrum, rebuildStaff, taskBrief, verifyBrief, focusComplete };
