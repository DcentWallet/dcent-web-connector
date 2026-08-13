# Brand Color Replacement Procedure (connector)

이 문서는 `docs/index.html`(개발자 가이드)과 `index-v2.html`(playground)의 `BRAND-ANCHOR` 블록을
교체하는 절차를 설명한다. 부모 워크스페이스 계획서
(`docs/brand-color-rebrand-plan.md` §8, `m15-03` 소관, 로컬 전용)의 발췌 사본이다.

> 🔴 **이 리포만 고치면 다른 리포와 갈린다.** 브랜드 앵커는 이 리포의 2개 표면
> (`docs/index.html`, `index-v2.html`) 외에 `dcent-web-bridge` 리포의 2개 표면
> (`packages/bridge-ui/src/tokens.css`, `scripts/guide-build.mjs`)에도 존재한다 —
> **2개 리포 4표면**이 같은 9값을 공유해야 한다. 이 문서는 그중 이 리포 몫만 다룬다.
> 4표면 전체 교차 대조는 부모 워크스페이스 `.claude/scripts/check-brand-anchor-parity.sh`가
> 유일한 게이트다 — 이 리포 CI만으로는 다른 리포와의 드리프트를 잡을 수 없다.

## 앵커 위치

- `docs/index.html` — `:root{` 내부, `BRAND-ANCHOR:BEGIN`/`BRAND-ANCHOR:END` 주석 사이 9줄
- `index-v2.html` — 같은 이름의 앵커 블록 (m15-02-03 에서 신설 완료)

## 앵커 9토큰 — 🔴 **값을 여기 적지 않는다**

키는 9개로 고정이다:
`--brand-100` · `--brand-200` · `--brand-400` · `--brand` · `--brand-600` · `--brand-900` ·
`--brand-ink` · `--brand-ink-lite` · `--on-brand`

**현재 값은 아래 명령으로 읽는다.** 이 문서에 값을 베껴 적지 않는다:

```bash
sed -n '/BRAND-ANCHOR:BEGIN/,/BRAND-ANCHOR:END/p' docs/index.html \
  | grep -oE '\-\-[a-z0-9-]+:\s*#[0-9a-fA-F]{6}'
```

> 🔴 **왜 값을 안 적나** (2026-08-13 크로스 리뷰 W3 — 두 리뷰어가 독립적으로 지목).
> 이 자리에 **은퇴한 보라 세대 9값이 그대로 남아 있었다.** m15-02-01 이 앵커가 아직 보라일 때
> 이 문서를 만들었고, m15-02-02 가 앵커를 라임으로 바꾸면서 문서를 따라가지 않았다 —
> 각 child 만 보면 둘 다 정상이라 **child 단위 리뷰로는 원리적으로 안 보이는** 드리프트였다.
>
> 그리고 이건 단순 오기가 아니라 **아래 4-b 를 정면으로 무산시킨다.** 4-b 는 "교체 전 9값을
> `REPO_G1_PAST_GENERATIONS` 에 통째로 추가하라" 고 지시하는데, 그 목록을 가져올 가장 자연스러운
> 출처가 바로 이 §다. 보라가 적혀 있으면 다음 리브랜더는 **이미 등록된 보라를 중복 등록하고
> 라임 세대는 영영 등록하지 않는다** — 잔여 라임 리터럴이 G1 의 `exactSet` 과 hue 밴드 양쪽에서
> 영구히 빠진다. 4-b 가 존재하는 이유 자체가 사라진다.
>
> 형제 스크립트가 같은 라운드에 배운 교훈과 동일하다 —
> *"숫자를 두 곳에 적으면 한쪽이 반드시 stale 이 된다 ⇒ 여기엔 산문만 적는다"*
> (`check-index-html-brand-tokens.mjs` · `check-playground-surface.mjs` floor 주석).
> 그 클래스를 스크립트에서만 닫고 **이 문서에는 열어뒀던 것**이 이번 결함이다.

## 교체 절차

1. **4표면(2리포) 값을 동시에 준비한다.** 한 표면만 바꾸고 PR을 올리지 않는다 — parity 게이트가
   드리프트를 exit 1로 잡지만, 그 전에 리뷰어가 먼저 보게 하는 편이 싸다.
2. `docs/index.html`의 `BRAND-ANCHOR:BEGIN`~`END` 사이 9값을 새 팔레트로 치환한다.
   **BEGIN/END 마커 자체는 지우거나 이동하지 않는다** — `check-index-html-brand-tokens.mjs`(G1)가
   두 마커 사이의 문자 범위(라인이 아니라 문자 인덱스 기준)를 앵커 예외 판정의 유일한 기준으로
   쓰고, 그 범위 안 hex 리터럴 수가 9(앵커 키 수)와 다르면 구조 오류로 막는다.
3. `--accent`/`--accent-soft` 별칭·파생 선언은 건드리지 않는다 — 앵커 값만 바뀌면 자동으로 따라간다.
4. `tests/fixtures/brand-tokens/resolved.snapshot.json`(G3 스냅샷)을 새 해석값으로 갱신한다.
   이 파일은 소비처가 없는 5개 토큰(`brand-100`/`400`/`900`/`brand-ink`/`brand-ink-lite`)의
   유일한 관측 수단이므로 갱신을 빠뜨리면 그 5개는 게이트를 통과하고도 실제로는 틀릴 수 있다.
4-b. `scripts/check-index-html-brand-tokens.mjs`의 `REPO_G1_PAST_GENERATIONS` 상수에 **교체 전
   9값**(방금 앵커에서 빠져나가는 세대)을 통째로 추가한다. 현재 앵커 값은 교체 순간 G1의
   `exactSet`과 hue 밴드 양쪽에서 자동으로 빠져나가므로, 여기 등록하지 않으면 리포 어딘가에
   남은 이전 세대 리터럴은 어떤 게이트에도 영원히 걸리지 않는다.
5. `node scripts/check-index-html-brand-tokens.mjs --test`로 로컬 자기검증 → `yarn check:docs`.
6. 부모 워크스페이스 루트에서 parity 게이트로 이 리포 몫을 확인한다.
   - `index-v2.html`에 아직 `BRAND-ANCHOR` 블록이 없으면(`m15-02-03` 랜딩 전) **`docs/index.html`
     단일 표면만** 검사한다 — 없는 표면에 `--strict`를 걸면 `✗ MISSING`으로 무조건 실패한다:
     `bash .claude/scripts/check-brand-anchor-parity.sh --surfaces main-repos/dcent-web-connector/docs/index.html --strict`
   - `index-v2.html`에 앵커가 이미 있으면(`m15-02-03` 랜딩 후 — 이 절차서를 실제 색 교체에 쓰는
     시점은 대부분 여기 해당) 이 리포 2표면을 함께 검사한다:
     `bash .claude/scripts/check-brand-anchor-parity.sh --surfaces main-repos/dcent-web-connector/docs/index.html,main-repos/dcent-web-connector/index-v2.html --strict`
   - 인자 없이 실행하면(기본 4표면) `dcent-web-bridge` 쪽 2표면까지 포함한 전체 parity를 확인한다.
7. G2(대비) 미달이 새로 생기면 `KNOWN_CONTRAST_VIOLATIONS`에 해소 objective ID와 함께 등록하거나
   (경고 모드 유지), 값 자체를 AA 기준을 만족하도록 조정한다 — 등록 없이 미달 상태로 방치하지 않는다.
   기존에 등록돼 있던 항목이 이번 교체로 AA를 통과하게 됐다면 그 등록을 **반드시 제거**한다 —
   더 이상 미달이 아닌 짝이 목록에 남아 있으면 G2가 "stale waiver"로 잡는다.

## 참고

- G1(하드코딩) 예외 목록·G2(대비) 짝 집합·G3(스냅샷) 계약의 상세는
  `scripts/check-index-html-brand-tokens.mjs` 상단 주석을 정본으로 삼는다(이 문서보다 코드가 최신이다).
- 색 자체의 팔레트 정의·근거는 부모 워크스페이스 `docs/brand-color-rebrand-plan.md`가 정본이다.
