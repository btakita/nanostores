import type { InstalledClock } from '@sinonjs/fake-timers'
import type { ReadableAtom, StoreValue } from '../index.js'

import { equal, ok } from 'uvu/assert'
import FakeTimers from '@sinonjs/fake-timers'
import { test } from 'uvu'

import { STORE_UNMOUNT_DELAY, computedSignal, onMount, atom } from '../index.js'

let clock: InstalledClock

test.before(() => {
  clock = FakeTimers.install()
})

test.after(() => {
  clock.uninstall()
})

test('converts stores values', () => {
  let letter = atom<{ letter: string }>({ letter: 'a' })
  let number = atom<{ number: number }>({ number: 0 })

  let renders = 0
  let combine = computedSignal(get => {
    renders += 1
    return `${get(letter).letter} ${number().number}`
  })
  equal(renders, 0)

  let value: StoreValue<typeof combine> = ''
  let unbind = combine.subscribe(combineValue => {
    value = combineValue
  })
  equal(value, 'a 0')
  equal(renders, 1)

  letter.set({ letter: 'b' })
  equal(value, 'b 0')
  equal(renders, 2)

  number.set({ number: 1 })
  equal(value, 'b 1')
  equal(renders, 3)

  unbind()
  clock.runAll()
  equal(value, 'b 1')
  equal(renders, 3)
})

test('works with single store', () => {
  let number = atom<number>(1)
  let decimal = computedSignal(() => {
    return number() * 10
  })

  let value
  let unbind = decimal.subscribe(decimalValue => {
    value = decimalValue
  })
  equal(value, 10)

  number.set(2)
  equal(value, 20)

  unbind()
})

test('prevents diamond dependency problem 1', () => {
  let store = atom<number>(0)
  let values: string[] = []

  let a = computedSignal(() => `a${store()}`)
  let b = computedSignal(get => get(a).replace('a', 'b'))
  let c = computedSignal(() => a().replace('a', 'c'))
  let d = computedSignal(get => a(get).replace('a', 'd'))

  let combined = computedSignal(() => `${b()}${c()}${d()}`)

  let unsubscribe = combined.subscribe(v => {
    values.push(v)
  })

  equal(values, ['b0c0d0'])

  store.set(1)
  store.set(2)

  equal(values, ['b0c0d0', 'b1c1d1', 'b2c2d2'])

  unsubscribe()
})

test('prevents diamond dependency problem 2', () => {
  let store = atom<number>(0)
  let values: string[] = []

  let a = computedSignal(get => `a${store(get)}`)
  let b = computedSignal(() => a().replace('a', 'b'))
  let c = computedSignal(get => get(b).replace('b', 'c'))
  let d = computedSignal(() => c().replace('c', 'd'))
  let e = computedSignal(get => d(get).replace('d', 'e'))

  let combined = computedSignal(() => [a(), e()].join(''))

  let unsubscribe = combined.subscribe(v => {
    values.push(v)
  })

  equal(values, ['a0e0'])

  store.set(1)
  equal(values, ['a0e0', 'a1e1'])

  unsubscribe()
})

test('prevents diamond dependency problem 3', () => {
  let store = atom<number>(0)
  let values: string[] = []

  let a = computedSignal(() => `a${store()}`)
  let b = computedSignal(get => a(get).replace('a', 'b'))
  let c = computedSignal<string, ReadableAtom<string>>(get => b(get).replace('b', 'c'))
  let d = computedSignal<string, ReadableAtom<string>>(get => get(c).replace('c', 'd'))

  let combined = computedSignal(
    () =>
      `${a()}${b()}${c()}${d()}`
  )

  let unsubscribe = combined.subscribe(v => {
    values.push(v)
  })

  equal(values, ['a0b0c0d0'])

  store.set(1)
  equal(values, ['a0b0c0d0', 'a1b1c1d1'])

  unsubscribe()
})

test('prevents diamond dependency problem 4 (complex)', () => {
  let store1 = atom<number>(0)
  let store2 = atom<number>(0)
  let values: string[] = []

  let fn =
    (name: string, ...v: (string | number)[]):string =>
      `${name}${v.join('')}`

  let a = computedSignal(() => fn('a', store1()))
  let b = computedSignal(get => fn('b', get(store2)))

  let c = computedSignal(() => fn('c', a(), b()))
  let d = computedSignal(get => fn('d', a(get)))

  let e = computedSignal(() => fn('e', c(), d()))

  let f = computedSignal(get => fn('f', get(e)))
  let g = computedSignal(() => fn('g', f()))

  let combined1 = computedSignal(get => e(get))
  let combined2 = computedSignal(() => [e(), g()].join(''))

  let unsubscribe1 = combined1.subscribe(v => {
    values.push(v)
  })

  let unsubscribe2 = combined2.subscribe(v => {
    values.push(v)
  })

  equal(values, ['eca0b0da0', 'eca0b0da0gfeca0b0da0'])

  store1.set(1)
  store2.set(2)

  equal(values, [
    'eca0b0da0',
    'eca0b0da0gfeca0b0da0',
    'eca1b0da1',
    'eca1b0da1gfeca1b0da1',
    'eca1b2da1',
    'eca1b2da1gfeca1b2da1'
  ])

  unsubscribe1()
  unsubscribe2()
})

test('prevents diamond dependency problem 5', () => {
  let events = ''
  let firstName = atom('John')
  let lastName = atom('Doe')
  let fullName = computedSignal(get => {
    let val = `${firstName()} ${get(lastName)}`
    events += 'full '
    return val
  })
  let isFirstShort = computedSignal(get => {
    let val = firstName(get).length < 10
    events += 'short '
    return val
  })
  let displayName = computedSignal(
    () => {
      let val = isFirstShort() ? fullName() : firstName()
      events += 'display '
      return val
    }
  )

  equal(events, '')

  displayName.listen(() => {})
  equal(displayName.get(), 'John Doe')
  equal(displayName(), 'John Doe')
  equal(events, 'short full display ')

  firstName.set('Benedict')
  equal(displayName.get(), 'Benedict Doe')
  equal(displayName(), 'Benedict Doe')
  equal(events, 'short full display short full display ')

  firstName.set('Montgomery')
  equal(displayName.get(), 'Montgomery')
  equal(displayName(), 'Montgomery')
  equal(events, 'short full display short full display short full display ')
})

test('prevents diamond dependency problem 6', () => {
  let store1 = atom<number>(0)
  let store2 = atom<number>(0)
  let values: string[] = []

  let a = computedSignal(get => `a${get(store1)}`)
  let b = computedSignal(() => `b${store2()}`)
  let c = computedSignal(() => b().replace('b', 'c'))

  let combined = computedSignal(() => `${a()}${c()}`)

  let unsubscribe = combined.subscribe(v => {
    values.push(v)
  })

  equal(values, ['a0c0'])

  store1.set(1)
  equal(values, ['a0c0', 'a1c0'])

  unsubscribe()
})

test('prevents dependency listeners from being out of order', () => {
  let base = atom(0)
  let a = computedSignal(() => {
    return `${base()}a`
  })
  let b = computedSignal(get => {
    return `${a(get)}b`
  })

  equal(b.get(), '0ab')
  equal(b(), '0ab')
  let values: string[] = []
  let unsubscribe = b.subscribe($b => values.push($b))
  equal(values, ['0ab'])

  clock.tick(STORE_UNMOUNT_DELAY * 2)
  equal(a.get(), '0a')
  equal(a(), '0a')
  base.set(1)
  equal(values, ['0ab', '1ab'])

  unsubscribe()
})

test('notifies when stores change within the same notifyId', () => {
  let val$ = atom(1)

  let computed1$ = computedSignal(get => {
    return get(val$)
  })

  let computed2$ = computedSignal(() => {
    return computed1$()
  })

  let events: any[] = []
  val$.subscribe(val => events.push({ val }))
  computed2$.subscribe(computed2 => {
    events.push({ computed2 })
    if (computed2 % 2 === 1) {
      val$.set(val$.get() + 1)
    }
  })

  equal(events, [{ val: 1 }, { computed2: 1 }, { val: 2 }, { computed2: 2 }])

  val$.set(3)
  equal(events, [
    { val: 1 },
    { computed2: 1 },
    { val: 2 },
    { computed2: 2 },
    { val: 3 },
    { computed2: 3 },
    { val: 4 },
    { computed2: 4 }
  ])
})

test('is compatible with onMount', () => {
  let store = atom(1)
  let deferrer = computedSignal(get => store(get) * 2)

  let events = ''
  onMount(deferrer, () => {
    events += 'init '
    return () => {
      events += 'destroy '
    }
  })
  equal(events, '')

  let deferrerValue: number | undefined
  let unbind = deferrer.subscribe(value => {
    deferrerValue = value
  })
  clock.runAll()
  ok(deferrer.lc > 0)
  equal(deferrer.get(), store.get() * 2)
  equal(deferrer(), store() * 2)
  equal(deferrerValue, store() * 2)
  ok(store.lc > 0)
  equal(events, 'init ')

  store.set(3)
  equal(deferrer.get(), store.get() * 2)
  equal(deferrer(), store() * 2)
  equal(deferrerValue, store.get() * 2)
  equal(deferrerValue, store() * 2)

  unbind()
  clock.runAll()
  equal(deferrer.lc, 0)
  equal(events, 'init destroy ')
})

test('computes initial value when argument is undefined', () => {
  let one = atom<string | undefined>(undefined)
  let two = computedSignal(() => !!one())
  equal(one.get(), undefined)
  equal(one(), undefined)
  equal(two.get(), false)
  equal(two(), false)
})

test.run()
