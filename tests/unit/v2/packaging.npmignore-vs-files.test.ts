/**
 * 패키징 회귀 가드 — `.npmignore` 항목이 `package.json#files`에 의해 무효화되지 않는지 검사.
 *
 * 배경 (PR #177 리뷰 P2): npm은 `files` 허용목록을 `.npmignore`보다 **우선** 적용한다.
 * `files`에 `"docs/"` / `"index-v2.html"` / `"playground.js"`가 있는 동안 `.npmignore`의
 * 같은 항목 3줄이 전부 무효였고, `docs/index.html`(1.2MB)이 모든 소비자에게 배포됐다.
 * PR 본문에는 ".npmignore 처리(tarball 미포함)"로 적혀 있어 서술과 실제가 반대였다.
 *
 * 이 테스트가 지키는 invariant:
 *   "`.npmignore`에 적힌 경로는 `files` 허용목록에 걸리지 않는다"
 * — 현재 값을 그대로 베끼는 tautology가 아니라 **규칙 자체**를 고정하므로, 앞으로 어떤 경로가
 * 추가되든 같은 실수(빼려고 적었는데 `files`가 도로 넣음)를 잡는다.
 *
 * T-U-PKG-01: `.npmignore` 항목 중 `files` 허용목록에 포함되는 것이 0건
 * T-U-PKG-02: 대용량 개발 전용 산출물이 `files`에 열거되지 않음 (floor 가드)
 */

import * as fs from 'fs'
import * as path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../..')

function readFilesField (): string[] {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { files?: string[] }
  expect(Array.isArray(pkg.files)).toBe(true)
  return pkg.files as string[]
}

function readNpmignoreEntries (): string[] {
  return fs
    .readFileSync(path.join(REPO_ROOT, '.npmignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
}

/**
 * `files` 항목이 주어진 경로를 tarball에 포함시키는지 판정.
 *
 * npm 의미론의 보수적 근사 — 정확히 같은 경로이거나, `files` 항목이 디렉터리(끝에 `/`
 * 또는 확장자 없음)이고 대상이 그 하위이면 포함으로 본다. 오탐(포함인데 아니라고 판정)은
 * 가드를 뚫으므로, 애매하면 **포함 쪽으로** 판정한다.
 */
function isCoveredByFiles (target: string, filesField: string[]): boolean {
  const norm = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '')
  const t = norm(target)
  return filesField.some((entry) => {
    const e = norm(entry)
    if (e === t) return true
    // 디렉터리 항목 — 하위 전체가 포함된다
    if (t.startsWith(e + '/')) return true
    return false
  })
}

describe('packaging — .npmignore vs package.json#files 우선순위', () => {
  test('T-U-PKG-01: `.npmignore` 항목이 `files`에 의해 무효화되지 않는다', () => {
    const filesField = readFilesField()
    const ignored = readNpmignoreEntries()

    // 모수 floor — .npmignore가 통째로 비면 "0건 위반"이 되어 초록이 된다.
    expect(ignored.length).toBeGreaterThanOrEqual(5)

    const neutralized = ignored.filter((entry) => isCoveredByFiles(entry, filesField))

    expect(neutralized).toEqual([])
  })

  test('T-U-PKG-02: 개발 전용 대용량 산출물이 `files`에 열거되지 않는다', () => {
    const filesField = readFilesField()

    // 각 경로가 실제로 리포에 존재하고 큰지 함께 확인한다 —
    // 파일이 사라져 "검사할 게 없어서 초록"이 되는 경로를 막는다.
    const devOnly = ['docs/index.html', 'index-v2.html', 'playground.js']
    for (const rel of devOnly) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true)
      expect(isCoveredByFiles(rel, filesField)).toBe(false)
    }

    // 반대 방향 — 소비자용 계약 문서는 반드시 포함되어야 한다 (과잉 제거 가드)
    expect(isCoveredByFiles('docs/v2-payload-contract.md', filesField)).toBe(true)
    expect(isCoveredByFiles('README.md', filesField)).toBe(true)
  })
})
