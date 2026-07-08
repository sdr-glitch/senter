# 센터(Senter) — 프로젝트 규약

리빙 SNS 초보 운영자(재아 님)를 위한 AI 마케팅 멘토 웹앱. 사용자는 **코딩을 전혀 모름** — 모든 결정은 "비개발자가 GitHub Pages 링크 하나로 쓸 수 있는가"를 기준으로.

## 철칙 (어기면 안 됨)

1. **무의존성 정적 앱**: 빌드 도구·프레임워크·npm 금지. 순수 HTML/CSS/JS. 외부 라이브러리가 꼭 필요하면 `vendor/`에 파일로 내장 (현재: pdf.js, jszip).
2. **렌더링을 막는 외부 리소스 금지**: 외부 CSS/폰트는 반드시 비차단 로드(`media="print" onload`). *교훈: 구글 폰트가 head를 막아 흰 화면 사고 발생.*
3. **한국어 UI, 초보자 눈높이**: 전문 용어는 즉시 쉬운 말로 풀기. 에러 메시지는 "무엇을 하면 되는지"까지 안내.
4. **localStorage + IndexedDB가 DB**: 작은 상태는 localStorage(접두사 `senter:`), **큰 기록은 IndexedDB**(`senter-db`/kv) — docs는 `saveDocs()`, `BIG_KEYS`(tasks·meetings·chats·teamChat·activity)는 `store.set()`이 자동 라우팅(마이그레이션 후 `bigInIdb`). 시작 시 `initDocsStore()`+`initBigStore()`가 메모리 로드+레거시 이전, **`resumePendingFinals()`·`renderAll()`은 initBigStore 완료 후 실행**. cap: 채팅 400/페르소나(AI 전송은 최근 20), 팀채팅 500, 활동 300, 회의록 100(표시 30), 완료 업무 200. 전체 초기화는 IndexedDB(`senter-db`)도 삭제해야 함.
5. **AI 3단계 안전망**: `aiChat()` = ① 사용자 API 키(Anthropic 직접 호출) → ② 무료 AI(Puter.js) → ③ 실패 시 오프라인 템플릿 + "지시서 복사" 수동 흐름. **AI가 없어도 앱이 죽지 않아야 함.**
6. **3D CSS 변환 금지**: 아이소메트릭 rotateX/Z는 환경에 따라 납작하게 뭉개짐(실제 사고). 사무실은 평면 탑다운 도트게임 스타일 유지.
7. **`window.prompt()` 금지**: 긴 텍스트 입력은 전용 모달(`#doc-modal` 패턴) 사용.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 전체 마크업 (탭 10개: 사무실·AI직원·멘토챗·홈·생산성·릴스·트렌드·스튜디오·자료실·설정) |
| `app.js` | 전체 로직 (~5200줄, 섹션 주석으로 구분) |
| `style.css` | 디자인 (오트밀/세이지 팔레트, `:root` 변수) |
| `studio.html` | 크리에이터 스튜디오 (독립 앱, iframe으로 내장, 자체 localStorage 키). 로드 시 `senter:studioInbox`를 소비해 승인된 이모티콘 기획을 프로젝트로 자동 등록 |
| `sw.js` | 서비스 워커 (오프라인 캐시, https에서만 등록 — file://은 자동 스킵) |
| `vendor/` | pdf.min.js + worker, jszip.min.js |
| `claude-desk/` | 별도 로컬 Node 도구 (웹 배포와 무관, 건드리지 말 것) |
| `trend-viewer/` | 별도 로컬 트렌드 관제판 (Python 3 stdlib, 포트 8779, 웹 배포와 무관) |
| `homepage/` | 센터 브랜드 홈페이지 (앱과 별개, 아이보리·베이지 리빙 무드 + 몽환, 단일 HTML — 리넨 질감·빛 패널은 CSS/SVG 자작) |
| `portfolio/` | 재아 개인 포트폴리오 (홈페이지와 동일 톤, 내용은 파일 상단 `DATA` 객체만 수정) |
| `docs/` | ARCHITECTURE.md(상세 설계), PROMPT-TEMPLATE.md(재사용 프롬프트) |

## 디자인 토큰 (테마 2종)

**기본 = 오로라 그린** (목업 구조 + 파스텔 그린 요청 반영, 민트·세이지 파스텔 글래스): `:root`에 `--bg:#f1f8f3 --bg-grad(민트 그라데이션) --surface:rgba(255,255,255,.8)+blur --accent:#57b98c --grad-btn/--grad-bar(그린 그라데이션)`. **오트밀 클래식**은 `body[data-theme="oatmeal"]`로 전환(설정 탭, `settings.theme`): `--bg:#f7f6f3 --accent:#2e7d5b` 등 기존 세트. **새 색은 반드시 토큰으로만 추가** — 하드코딩하면 테마 전환이 깨짐. (studio.html은 자체 토큰: oat #EFEEE7, sage #5E7C64). 사무실 픽셀 파트만 예외적으로 진한 외곽선(#14161f)과 하드 섀도 사용. 모바일(≤720px)은 상단 탭 대신 하단 네비(#bottomnav 4탭+더보기 시트) — **하단 고정 요소는 bottom:64px 이상으로** (토큰 바 겹침 사고).

## 테스트 방법

Playwright(playwright-core + `/opt/pw-browsers/chromium`)로 headless 스모크 테스트. 패턴: `file:///.../index.html` 열기 → 온보딩 통과(`#ob-done`, `#kg-later`) → 기능 실행 → localStorage/DOM 검증. **테스트 훅**: `window.__senter = { chatterTick, holdScrum, rebuildStaff, taskBrief, verifyBrief, focusComplete, recordUsage, renderTokenBar, estTokens, ensureUsage, autoPilotTick, templateDraft, getDocs, getTasks, getMeetings, setTasks }` (자율 근무 테스트는 `autoPilotTick(true)`로 강제 틱; **tasks·meetings·docs 등 큰 기록은 IndexedDB에 있으므로 localStorage 직접 읽기/시드 금지 — 훅 사용**). 주의: 탭 전환 후 요소를 조작할 것(스크롤 이슈), 움직이는 캐릭터 대신 책상(`.f-desk[title=이름]`) 클릭, 재정렬되는 목록은 텍스트 필터로 지정.

## 핵심 데이터 흐름

지시 입력 → `createTask()`(키워드 라우팅, @이름 지명) → `dispatchWork()` = API 키 있으면 `autoWork()`(AI 파이프라인), 없으면 `templateWork()`(오프라인 초안 엔진) → 3단계(팀원 초안 draft → 팀장 검토·팀 회의 verify → 과장 최종 final) → 검토 대기 review → 승인 done. **조직 계층**: 사장(사용자)→과장(pm)→`TEAMS` 5부서(콘텐츠 제작부·성장 분석부·수익화·제휴부·크리에이티브 스튜디오부·내부 교육부, 팀장+팀원, 채용 직원은 콘텐츠 제작부). 기본 17명(팀장 5·팀원 12)+과장+사장. 사무실은 부서별 사무공간(`TEAMS[].room`, 좌표 %) — 3명↓ 1줄·4명↑ 2줄·넓은방 최대5열 자동. 업무 카드에 담당 부서 배지(`.task-dept`) 표시, 현황판 상단 부서 필터 칩(`boardDept`). 크리에이티브 스튜디오부 업무 승인 시 `handoffToStudio()`가 이모티콘→제출현황·굿즈/디자인→아이디어뱅크로 결과 요약과 함께 스튜디오에 전달. 오프라인 초안은 `acctLine()`(계정 맞춤)+`qualityNote()`(품질 기준)로 품질 강화. AI 파이프라인은 `tierModel()`로 팀원 초안=하위 모델(settings.staffModel, 기본 하이쿠), 팀장·과장=상위 모델(settings.model) — 총 3회 호출. 검토 대기/완료 카드의 [📄 보고서 보기]가 문서 뷰어(#report-modal), 인쇄는 숨김 iframe `print()`(브라우저 "PDF로 저장"). 보완 요청은 카드 안 폼(철칙 7)이며 **draft/result를 비워야** 재작업이 처음부터 실행됨(`templateWork`는 draft가 있으면 검증부터 이어감 — 새로고침 복구용). 새로고침 복구는 `resumePendingFinals()`가 저장된 `autoWorking`/`finalizing` 플래그를 지운 뒤 재개. 직원 채용은 `customStaff` + `rebuildStaff()`가 책상·좌석·라우팅 전부 자동 재생성. 사무실 연출(말풍선·회의)은 항상 **실제 데이터 기반** — 지어낸 대사 금지.

**자율 근무(오토파일럿)**: `autoPilotTick()`(60초 주기, `settings.autoPilot` 기본 ON)이 ① 새 자료 → 자동 스터디 회의(silent) ② 열린 업무 <2 & 검토 <4일 때 INITIATIVES 풀에서 다음 업무 자동 착수 ③ 3일 내 일정 준비 ④ 완료 8건마다 회고 ⑤ 주간 벤치 ⑥ **같은 자료 반복 심화 스터디 회의**(자료당 최대 3회, `auto.deepCount`, 회차마다 새 각도·다른 발췌) ⑦ **최적화 개선 라운드**(초안 소진돼도 루프 지속 — IMPROVE 4종을 라운드 순환해 `릴스/캡션/아이디어/벤치 개선안 vN` 생성, `auto.improve`) ⑧ 3일마다 보고서. 상태는 `senter:autoState`. **완료 보고서는 `buildDeliverable()`이 회의안건→회의록→결과물→기획안 4단 구조로 조립**. `templateDraft()`가 AI 없이 실제 초안 생성.

## 남은 할 일

`docs/ARCHITECTURE.md`의 "남은 할 일" 섹션 참고.
