# 냥냥 유전 하우스 (프로토타입)

실제 고양이 털색 유전 원리를 모사한 교배 + 3D 툰 고양이 돌봄 게임. 기획은 [GAME_OVERVIEW.md](GAME_OVERVIEW.md).

## 실행
빌드 도구 없이 동작합니다(Node 불필요). Three.js는 CDN(jsdelivr)에서 불러오므로 **인터넷 연결이 필요**합니다.

```bash
python serve.py 8765
```

- 게임: http://localhost:8765/index.html (진행은 브라우저 localStorage에 저장, 우상단 `새 게임`으로 초기화)
- 유전 엔진 검증: http://localhost:8765/tests.html
- 렌더 갤러리: http://localhost:8765/viewer.html
- 조작: WASD/방향키 또는 클릭으로 이동. 내 우리의 고양이를 클릭하면 돌보기 창, 동물샵·교배집·이웃 NPC에 다가가면 해당 창이 열립니다.
- 우상단 `+1시간` `+1일` 은 개발용 시간 건너뛰기(성격 형성·쿨다운 확인용)

## 구조
| 파일 | 역할 |
|---|---|
| `js/params.js` | 조정 가능한 확률·경제 파라미터 (대부분 [제안] 기본값) |
| `js/genes.js`, `js/engine.js` | 12좌위, 표현형, 희귀도, 교배, 근친·쿨다운, SPECIAL/판타지/의상 |
| `js/appearance.js`, `js/catalog.js` | 표현형→렌더 파라미터, 도감 전수 열거·중복 제거 |
| `js/textures.js`, `js/cat3d.js`, `js/stage.js` | 절차 생성 텍스처, 코드로 만든 3D 툰 고양이(장모 솜털 셸), 교배 연출 |
| `js/world.js` | 3D 월드: 내 우리·이웃 우리·동물샵·교배집, 플레이어 이동, 고양이 배회 |
| `js/personality.js` | 탄생 후 1시간 돌봄 → 성격 추첨 |
| `js/game.js`, `js/ui.js` | 상태·샵·NPC 이웃·재화, UI |

## 실제 유전학과 게임 단순화
| 항목 | 게임 | 현실 |
|---|---|---|
| 태비 T | M/m 2대립, M 우성 | 고등어/클래식/스팟/틱 등 더 복잡 |
| 흰반점 S | ss/Ss/SS 3단계 | 면적·침투도가 연속적 |
| TYR | C, cb, cs 3대립 | 일부 대립유전자만 구현 |
| 오렌지·토티 | X연관 O, 암컷 O/o만 토티 | 수컷 토티(XXY)는 약 1/3,000 — 이번엔 제외 |
| 농도 | P1~P3 허구 modifier, 5단계 | 실제 다유전자 좌위 미특정 |
| SPECIAL·판타지 | 비유전 별도 RNG | 스핑크스 등은 실제로는 유전 형질 — 게임 규칙으로 변경 |
