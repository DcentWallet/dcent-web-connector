#!/usr/bin/env bash
#
# m19-01 뮤테이션 매트릭스 — "고쳤다" 가 아니라 "되돌리면 잡힌다" 를 증거로 남긴다.
#
# 원소 5종 각각에 대해:
#   ① 앵커 문자열을 sed 로 치환한다
#   ② 치환이 no-op 이 아니었는지 `git diff --quiet` 로 확인한다 (앵커가 실제로 존재했는가)
#   ③ `yarn unit-v2 <file>` 이 **실패해야** 그 원소는 "검출됨"
#   ④ `git checkout -- <file>` 로 복원한다
#
# 하나라도 "되돌렸는데 통과" 면 비영 exit — 그 가드는 관측되지 않고 있다는 뜻이다.
#
# ⚠️ 부모 워크스페이스의 Bash 툴은 zsh 로 돌므로 반드시 `bash scripts/mutation-check-m19-01.sh`
#    로 실행한다.
set -u

cd "$(dirname "$0")/.." || exit 1

TEST_FILE='tests/unit/v2/transport/PopupTransport.test.ts'
SRC='src/transport/PopupTransport.ts'

# GNU sed(-i suffix 없음) / BSD sed(-i '' 필요) 양쪽에서 도는 in-place 치환.
sedi () {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# 치환 전 워킹트리가 깨끗해야 복원이 안전하다.
if ! git diff --quiet -- "${SRC}"; then
  echo "ABORT: ${SRC} 에 커밋되지 않은 변경이 있다 — 뮤테이션 복원이 그 변경을 날린다."
  exit 2
fi

# 원소: 라벨|파일|sed 표현식
#   라벨은 매트릭스 출력용, sed 표현식은 앵커 → 뮤테이션.
MUTANTS=(
  "dedupe-drops-deviceReason|${SRC}|s|(device === 'disconnected' \&\& nextReason !== this.currentDeviceReason)|false|"
  "nextReason-uses-nullish|${SRC}|s|'deviceReason' in next ? next.deviceReason : this.currentDeviceReason|next.deviceReason ?? this.currentDeviceReason|"
  "ensurePopup-omits-reason-key|${SRC}|s|popup: 'connected', device: 'unknown', deviceInfo: undefined, deviceReason: undefined|popup: 'connected', device: 'unknown', deviceInfo: undefined|"
  "close-omits-reason-key|${SRC}|s|popup: 'disconnected', device: 'unknown', deviceInfo: undefined, deviceReason: undefined|popup: 'disconnected', device: 'unknown', deviceInfo: undefined|"
  "recv-whitelist-accepts-unknown|${SRC}|s|device !== 'awaiting-connect-approval'|false|"
)

FAILED=0
echo "=== m19-01 mutation matrix (원소 5종) ==="
printf '%-34s %-10s %-10s %s\n' 'MUTANT' 'APPLIED' 'DETECTED' 'VERDICT'

for entry in "${MUTANTS[@]}"; do
  label="${entry%%|*}"
  rest="${entry#*|}"
  file="${rest%%|*}"
  expr="${rest#*|}"

  sedi "${expr}" "${file}"

  # ② no-op 검증 — 앵커가 사라졌으면 이 검사는 아무것도 증명하지 못한다.
  if git diff --quiet -- "${file}"; then
    printf '%-34s %-10s %-10s %s\n' "${label}" 'NO-OP' '-' 'FAIL(anchor-missing)'
    FAILED=1
    continue
  fi

  # ③ 테스트가 실패해야 "검출됨".
  if yarn unit-v2 "${TEST_FILE}" >/dev/null 2>&1; then
    detected='no'
    verdict='FAIL(not-detected)'
    FAILED=1
  else
    detected='yes'
    verdict='OK'
  fi
  printf '%-34s %-10s %-10s %s\n' "${label}" 'yes' "${detected}" "${verdict}"

  # ④ 복원.
  git checkout -- "${file}"
done

# 복원이 실제로 됐는지 최종 확인 — 여기서 dirty 면 리포에 뮤테이션이 남은 것이다.
if ! git diff --quiet -- "${SRC}"; then
  echo "ABORT: 복원 실패 — ${SRC} 가 여전히 dirty 하다."
  exit 2
fi

if [ "${FAILED}" -ne 0 ]; then
  echo "=== RESULT: FAIL — 원소 중 하나 이상이 '되돌렸는데 통과' 했다 ==="
  exit 1
fi

echo "=== RESULT: PASS — 원소 5종 전건 '되돌리면 잡힌다' ==="
