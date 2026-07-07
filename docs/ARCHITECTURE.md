# 센터(Senter) 아키텍처 & 설계 결정 기록

> 이 문서는 세션(대화)이 끝나도 남는 설계 기록입니다. 다음 작업자(사람이든 AI든)는 이 문서와 `CLAUDE.md`, `docs/PROMPT-TEMPLATE.md`를 먼저 읽으세요.

## 1. 한 줄 요약

코딩을 모르는 리빙 SNS 초보 운영자가 **GitHub Pages 링크 하나**로 쓰는 AI 마케팅 멘토/가상 오피스. 서버 없음, 빌드 없음, 결제 없이도 작동.

## 2. 시스템 구성

```
index.html ─ 탭 8개 SPA (사무실 / AI직원 / 멘토채팅 / 홈 / 생산성 / 스튜디오 / 자료실 / 설정)
app.js     ─ 모든 로직. 섹션: 저장소 → 멘토 페르소나 → AI직원(지시서) → 커스텀직원 → 로드맵
             → AI호출(aiChat 체인) → 사무실(렌더/회의/보고서/스터디) → 업무보드(파이프라인)
             → 채팅 → 자료실(PDF) → 생산성 → 설정/백업
style.css  ─ 오트밀/세이지 토큰 + 사무실 픽셀 스타일
studio.html─ 크리에이터 스튜디오(허브/패턴/이모티콘/템플릿분할). 독립 스코프, iframe 내장
```

## 3. localStorage 데이터 모델

| 키 | 내용 | 상한 |
|---|---|---|
| `senter:settings` | 프로필·apiKey·model·workMode | - |
| `senter:docs` | 자료실 [{id,title,content,enabled}] | PDF 추출 30만 자/건 |
| `senter:chats` | 멘토별 대화 {personaId:[...]} | 페르소나당 80개 |
| `senter:tasks` | 업무 [{id,title,assignee,status,stage,draft,critique,result,note}] | - |
| `senter:customStaff` | 채용 직원 [{id,name,role,duty,emoji,keywords,look}] | 총 직원 11명 (기본 8: 이모티콘 기획자 포함) |
| `senter:teamChat` / `senter:activity` / `senter:meetings` | 대화/활동/회의록 | 60 / 30 / 10 |
| `senter:todos` `events` `notes` `focusLog` | 생산성 | - |
| `senter:roadmapDone` `missions` `stageOpen` `currentPersona` `personaBarExpanded` | UI 상태 | - |
| `senter:autoState` | 자율 근무 상태 (done/studied/preparedEvents/lastReportAt) | - |
| `studio_hq_v1` `emoticon_studio_v1` `pattern_studio_v1` `studio_shell_last` | 스튜디오(iframe) 자체 키 | - |

백업: 설정 탭 내보내기/불러오기 (senter:* 전체, API 키 제외. 스튜디오 키는 스튜디오 자체 내보내기 사용).

## 4. 주요 설계 결정과 이유 (시행착오 포함)

| 결정 | 이유 / 교훈 |
|---|---|
| 정적 SPA + localStorage | 사용자가 비개발자. 서버·DB·배포 파이프라인은 유지 불가능. 트레이드오프: 기기 간 동기화 없음(백업 파일로 대체) |
| 자율 근무 `autoPilotTick()` | 사용자가 자료만 올리면 스터디 회의→초안→보고까지 자동. AI 없으면 `templateDraft()` 오프라인 초안 엔진이 실제 결과물 생성 |
| 리서치 자동화 | 벤치마킹 보고서(`benchDraft`)·카카오 이모티콘 시장 분석(`emoticonKakaoDraft`)·멀티 플랫폼 기획(`emoticonMultiDraft`)을 자율 이니셔티브로 생성. 실시간 크롤링은 불가하므로 검증된 패턴 지식 + "10분 직접 확인 체크리스트" + AI 연결 시 심화 분석의 3층 구조. 7일마다 주간 벤치마킹 갱신 |
| AI 3단계 체인 `aiChat()` | 사용자가 API 결제 실패(카드 문제). ① Anthropic(브라우저 직접, `anthropic-dangerous-direct-browser-access`) → ② Puter.js 무료(키 불필요, 첫 사용 시 무료계정 팝업 1회) → ③ 오프라인 템플릿(미션=로드맵 기반, 우선순위=마감순, 보고서·회의=데이터 조립) + "지시서 복사→무료 챗봇" 수동 흐름 |
| 자동 실행은 **버튼**으로 (키 없을 때) | Puter 첫 인증 팝업은 사용자 제스처 필요 + 예상 못 한 백그라운드 호출 방지 |
| 업무 파이프라인 3단계 검증 | draft→verify(전문가 2명 교차검증→수정→재검토)→final(매니저)→review. `workMode:"quick"`으로 1단계 모드 전환 가능. 검증 대사·회의는 실제 보드 데이터에서 생성 |
| 사무실 = 평면 탑다운 픽셀 | **아이소메트릭 3D CSS(rotateX+역회전)는 환경에 따라 납작하게 렌더되는 사고 발생** → 전면 폐기. 도트게임 스타일이 안정적이고 사용자도 선호 |
| 채용 시스템 완전 데이터 주도 | `rebuildStaff()`가 STAFF·책상 그리드·회의 좌석 타원(seatRing)·키워드 라우팅을 전부 재생성. 하드코딩 좌표 금지 |
| studio.html은 iframe 격리 | 2,800줄 독립 앱을 인라인 병합하면 CSS/JS 충돌. iframe이면 충돌 0. **교훈: 구글 폰트 CSS가 렌더링 차단 → `media="print" onload` 비차단 로드 필수** |
| PDF는 pdf.js 내장(v3 legacy) | v4는 ESM 전용이라 file://에서 실패. v3 legacy는 file://·https 모두 동작 확인 |
| `window.prompt()` 제거 | 한 줄 입력창에 전자책 붙여넣기 불가능(실사용 차단 버그). 전용 모달로 교체 |
| 회의는 순차 say() + 중복 소집 가드 | 회의 중 다른 회의 소집 시 조용한 무시 → 토스트 안내 + 버튼 비활성화로 개선 |

## 5. 엣지 케이스 방어 현황 (프리런치 점검 완료)

- **localStorage 초과**: senter `store.set` 토스트 / 스튜디오 허브·이모티콘 save()가 경고 배너+토스트, 성공 시 배너 해제(영구 포기 안 함) / 설정 탭에 사용량 미터(5MB 기준 80% 경고) / 채팅 80개 cap
- **ZIP 내보내기**: JSZip 미로드 → 낱장 순차 저장 폴백 / `generateAsync` 실패도 try-catch로 동일 폴백 / `toBlob` null 가드
- **아이패드/사파리**: `-webkit-backdrop-filter` 접두사, `rotate:` 단독 속성 → `transform: rotate()`로 통일, 클립보드 실패 시 execCommand 폴백, 사파리 시크릿 모드(setItem throw)는 스튜디오 memoryOnly 프로브가 감지
- **네트워크 없음**: 폰트 비차단, Puter 15초 타임아웃+`freeAiBroken` 캐시로 반복 대기 방지, 모든 AI 기능에 오프라인 대체 경로

## 6. 테스트 플레이북

```bash
node --check app.js                    # 문법
# Playwright 스모크 (scratchpad의 smoke*.mjs 패턴)
# 필수 통과 항목: 온보딩 → 지시→배정→파이프라인(초안/검증/최종/승인) → 채용/해고 자동반영
#   → 스크럼(일정 언급) → 스터디 회의(자료 자동 활성화) → 보고서(자료실 저장)
#   → 생산성 4종 → PDF 업로드(http+file) → 스튜디오 iframe(.snbtn 4개) → 새로고침 지속성
```
함정: 탭 전환 직후 조작(스크롤 리셋 있음), 움직이는 캐릭터 대신 책상 클릭, 정렬되는 목록은 `filter({hasText})`, 회의 종료는 마지막 대사 +4초 대기.

## 7. 남은 할 일 (우선순위순)

1. **모바일 사무실 터치 최적화** — 픽셀 캐릭터가 작아 탭하기 어려움(책상 클릭으로 우회 중)
2. **업무 보드 필터/검색** — 완료 업무가 수십 건 쌓이면 필요
3. **Puter 모델 고정 옵션** — 현재 서비스 기본 모델 사용. 품질 이슈 시 모델 지정 검토
4. **iOS 홈화면 PWA** — manifest.json + 아이콘이면 앱처럼 설치 가능
5. **로드맵 커스터마이즈** — 현재 리빙 계정 고정. 주제 바꾸면 로드맵도 바뀌게

### 완료됨 (기록)
- ~~회의록 열람 UI~~ → 사무실 탭 [📜 회의록] 보관함 (최근 10개, 펼쳐보기)
- ~~스튜디오 ↔ 센터 데이터 연결~~ → `readStudioSns()`가 `studio_hq_v1`의 sns[].history를 읽어 보고서 "SNS 채널 현황" 표 + 스크럼 브리핑 채널 멘트로 반영
