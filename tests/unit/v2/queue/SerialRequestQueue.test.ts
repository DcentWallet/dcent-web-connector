/**
 * T-U-06 ~ T-U-09: SerialRequestQueue 단위 테스트
 *
 * async-hygiene 룰: chain.then(task, task) 패턴 — reject 후 chain 끊김 방지
 */
import { SerialRequestQueue } from '../../../../src/queue/RequestQueue'

describe('SerialRequestQueue', () => {
  let queue: SerialRequestQueue

  beforeEach(() => {
    queue = new SerialRequestQueue()
  })

  describe('T-U-06: 단일 동시성 — 직렬 실행 보장', () => {
    it('3개 동시 enqueue 시 직렬로 실행된다', async () => {
      const executionOrder: number[] = []
      let concurrentCount = 0
      let maxConcurrent = 0

      const makeTask = (id: number) => () =>
        new Promise<number>((resolve) => {
          concurrentCount += 1
          maxConcurrent = Math.max(maxConcurrent, concurrentCount)
          executionOrder.push(id)
          setTimeout(() => {
            concurrentCount -= 1
            resolve(id)
          }, 10)
        })

      // 3개 동시 enqueue
      await Promise.all([
        queue.enqueue(makeTask(1)),
        queue.enqueue(makeTask(2)),
        queue.enqueue(makeTask(3)),
      ])

      // 동시 실행 최대값이 1 (직렬 실행 보장)
      expect(maxConcurrent).toBe(1)
      // 입력 순서대로 실행됨
      expect(executionOrder).toEqual([1, 2, 3])
    })
  })

  describe('T-U-07: size() — pending 카운트 정확성', () => {
    it('enqueue 직후 size()가 1이고 resolve 후 0이 된다', async () => {
      // task가 실행되면 resolve를 외부에서 호출할 수 있도록 Promise로 조율
      let externalResolve!: () => void
      const taskStarted = new Promise<void>((resolve) => {
        // task 내부에서 시작을 알리고 외부 resolve를 저장
        const task = () =>
          new Promise<void>((res) => {
            externalResolve = res
            resolve() // taskStarted 완료
          })
        queue.enqueue(task)
      })

      // task 시작 대기 → 이 시점에 externalResolve가 할당됨
      await taskStarted
      expect(queue.size()).toBe(1)

      // task를 완료
      externalResolve()
      // microtask flush — pending 감소 대기
      await new Promise<void>((r) => setTimeout(r, 0))
      expect(queue.size()).toBe(0)
    })

    it('3개 enqueue 시 size()가 3을 반환한다', async () => {
      // 첫 번째 task가 시작되면 나머지 2개는 pending 상태
      let firstResolve!: () => void
      const firstStarted = new Promise<void>((resolve) => {
        const task = () =>
          new Promise<void>((res) => {
            firstResolve = res
            resolve()
          })
        queue.enqueue(task)
      })

      // 두 번째, 세 번째는 즉시 resolve되는 task
      const p2 = queue.enqueue(() => Promise.resolve(2))
      const p3 = queue.enqueue(() => Promise.resolve(3))

      await firstStarted
      // 첫 task 실행 중 → pending === 3
      expect(queue.size()).toBe(3)

      // 첫 task 해제
      firstResolve()
      await Promise.all([p2, p3])
      expect(queue.size()).toBe(0)
    })
  })

  describe('T-U-08: task reject 후 chain 끊김 없음', () => {
    it('첫 task가 reject되어도 두 번째 task가 정상 실행된다', async () => {
      const failingTask = () => Promise.reject(new Error('task failed'))
      const successTask = () => Promise.resolve(42)

      // 첫 task 실패
      await expect(queue.enqueue(failingTask)).rejects.toThrow('task failed')

      // 두 번째 task는 정상 실행되어야 함 (chain 끊김 없음)
      const result = await queue.enqueue(successTask)
      expect(result).toBe(42)
    })

    it('연속 실패 후에도 마지막 task가 정상 실행된다', async () => {
      const fail = () => Promise.reject(new Error('fail'))
      const success = () => Promise.resolve('ok')

      const p1 = queue.enqueue(fail)
      const p2 = queue.enqueue(fail)
      const p3 = queue.enqueue(success)

      await expect(p1).rejects.toThrow()
      await expect(p2).rejects.toThrow()
      await expect(p3).resolves.toBe('ok')
    })
  })

  describe('T-U-09: clear() — 큐 초기화', () => {
    it('clear() 호출 후 size() === 0이다', () => {
      // 임의로 pending 카운트 증가
      const neverResolve = () => new Promise<void>(() => {})
      queue.enqueue(neverResolve)
      queue.enqueue(neverResolve)

      queue.clear()
      expect(queue.size()).toBe(0)
    })

    it('clear() 후 새 enqueue가 정상 동작한다', async () => {
      queue.clear()
      const result = await queue.enqueue(() => Promise.resolve(99))
      expect(result).toBe(99)
    })
  })
})
