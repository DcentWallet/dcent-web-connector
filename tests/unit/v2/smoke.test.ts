/**
 * v2 TypeScript 트랜스파일 인프라 동작 확인용 smoke test
 * Phase 1 완료 기준: babel-jest + @babel/preset-typescript 인프라가 정상 작동하는지 검증
 */

describe('v2 TypeScript 트랜스파일 smoke test', () => {
  it('기본 산술 연산이 TypeScript 환경에서 동작한다', () => {
    expect(1 + 1).toBe(2)
  })

  it('TypeScript 타입 어노테이션이 문제없이 트랜스파일된다', () => {
    const value: number = 42
    const text: string = 'hello'
    expect(value).toBe(42)
    expect(text).toBe('hello')
  })

  it('TypeScript interface와 객체 생성이 동작한다', () => {
    interface Point {
      x: number
      y: number
    }
    const point: Point = { x: 1, y: 2 }
    expect(point.x + point.y).toBe(3)
  })
})
