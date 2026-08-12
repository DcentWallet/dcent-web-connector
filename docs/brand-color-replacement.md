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
- `index-v2.html` — 같은 이름의 앵커 블록(신설 시점은 형제 objective 소관)

## 앵커 9토큰

```css
--brand-100:#E2E1FD; --brand-200:#927DFF; --brand-400:#C7C3FB;
--brand:#7231ff;     --brand-600:#6422E6; --brand-900:#22003C;
--brand-ink:#4F46E5; --brand-ink-lite:#ABA2FE; --on-brand:#0B0E14;
```

## 교체 절차

1. **4표면(2리포) 값을 동시에 준비한다.** 한 표면만 바꾸고 PR을 올리지 않는다 — parity 게이트가
   드리프트를 exit 1로 잡지만, 그 전에 리뷰어가 먼저 보게 하는 편이 싸다.
2. `docs/index.html`의 `BRAND-ANCHOR:BEGIN`~`END` 사이 9값을 새 팔레트로 치환한다.
   **BEGIN/END 마커 자체는 지우거나 이동하지 않는다** — `check-index-html-brand-tokens.mjs`(G1)가
   이 라인 범위를 앵커 예외 판정의 유일한 기준으로 쓴다.
3. `--accent`/`--accent-soft` 별칭·파생 선언은 건드리지 않는다 — 앵커 값만 바뀌면 자동으로 따라간다.
4. `tests/fixtures/brand-tokens/resolved.snapshot.json`(G3 스냅샷)을 새 해석값으로 갱신한다.
   이 파일은 소비처가 없는 5개 토큰(`brand-100`/`400`/`900`/`brand-ink`/`brand-ink-lite`)의
   유일한 관측 수단이므로 갱신을 빠뜨리면 그 5개는 게이트를 통과하고도 실제로는 틀릴 수 있다.
5. `node scripts/check-index-html-brand-tokens.mjs --test`로 로컬 자기검증 → `yarn check:docs`.
6. 부모 워크스페이스 루트에서
   `bash .claude/scripts/check-brand-anchor-parity.sh --surfaces main-repos/dcent-web-connector/docs/index.html,main-repos/dcent-web-connector/index-v2.html --strict`
   로 이 리포 2표면의 자체 일치를, 인자 없이 실행해 4표면 전체 parity를 확인한다.
7. G2(대비) 미달이 새로 생기면 `KNOWN_CONTRAST_VIOLATIONS`에 해소 objective ID와 함께 등록하거나
   (경고 모드 유지), 값 자체를 AA 기준을 만족하도록 조정한다 — 등록 없이 미달 상태로 방치하지 않는다.

## 참고

- G1(하드코딩) 예외 목록·G2(대비) 짝 집합·G3(스냅샷) 계약의 상세는
  `scripts/check-index-html-brand-tokens.mjs` 상단 주석을 정본으로 삼는다(이 문서보다 코드가 최신이다).
- 색 자체의 팔레트 정의·근거는 부모 워크스페이스 `docs/brand-color-rebrand-plan.md`가 정본이다.
