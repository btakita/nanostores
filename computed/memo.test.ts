import type { InstalledClock } from '@sinonjs/fake-timers'
import type { ReadableAtom, StoreValue } from '../index.js'

import { equal, ok } from 'uvu/assert'
import FakeTimers from '@sinonjs/fake-timers'
import { test } from 'uvu'

import { STORE_UNMOUNT_DELAY, memo, onMount, atom } from '../index.js'

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
  let combine = memo(cx => {
    renders += 1
    return `${cx(letter).letter} ${number.get(cx).number}`
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
  let decimal = memo(() => {
    return number.get() * 10
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

  let a = memo(() => `a${store.get()}`)
  let b = memo(cx => cx(a).replace('a', 'b'))
  let c = memo(() => a.get().replace('a', 'c'))
  let d = memo(cx => a.get(cx).replace('a', 'd'))

  let combined = memo(() => `${b.get()}${c.get()}${d.get()}`)

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

  let a = memo(cx => `a${store.get(cx)}`)
  let b = memo(() => a.get().replace('a', 'b'))
  let c = memo(cx => cx(b).replace('b', 'c'))
  let d = memo(() => c.get().replace('c', 'd'))
  let e = memo(cx => d.get(cx).replace('d', 'e'))

  let combined = memo(() => [a.get(), e.get()].join(''))

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

  let a = memo(() => `a${store.get()}`)
  let b = memo(cx => a.get(cx).replace('a', 'b'))
  let c = memo<string, ReadableAtom<string>>(cx => b.get(cx).replace('b', 'c'))
  let d = memo<string, ReadableAtom<string>>(cx => cx(c).replace('c', 'd'))

  let combined = memo(
    () =>
      `${a.get()}${b.get()}${c.get()}${d.get()}`
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

  let a = memo(() => fn('a', store1.get()))
  let b = memo(cx => fn('b', cx(store2)))

  let c = memo(() => fn('c', a.get(), b.get()))
  let d = memo(cx => fn('d', a.get(cx)))

  let e = memo(() => fn('e', c.get(), d.get()))

  let f = memo(cx => fn('f', cx(e)))
  let g = memo(() => fn('g', f.get()))

  let combined1 = memo(cx => e.get(cx))
  let combined2 = memo(() => [e.get(), g.get()].join(''))

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
  let fullName = memo(cx => {
    let val = `${firstName.get()} ${cx(lastName)}`
    events += 'full '
    return val
  })
  let isFirstShort = memo(cx => {
    let val = firstName.get(cx).length < 10
    events += 'short '
    return val
  })
  let displayName = memo(
    () => {
      let val = isFirstShort.get() ? fullName.get() : firstName.get()
      events += 'display '
      return val
    }
  )

  equal(events, '')

  displayName.listen(() => {})
  equal(displayName.get(), 'John Doe')
  equal(events, 'short full display ')

  firstName.set('Benedict')
  equal(displayName.get(), 'Benedict Doe')
  equal(events, 'short full display short full display ')

  firstName.set('Montgomery')
  equal(displayName.get(), 'Montgomery')
  equal(events, 'short full display short full display short full display ')
})

test('prevents diamond dependency problem 6', () => {
  let store1 = atom<number>(0)
  let store2 = atom<number>(0)
  let values: string[] = []

  let a = memo(cx => `a${cx(store1)}`)
  let b = memo(() => `b${store2.get()}`)
  let c = memo(() => b.get().replace('b', 'c'))

  let combined = memo(() => `${a.get()}${c.get()}`)

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
  let a = memo(() => {
    return `${base.get()}a`
  })
  let b = memo(cx => {
    return `${a.get(cx)}b`
  })

  equal(b.get(), '0ab')
  let values: string[] = []
  let unsubscribe = b.subscribe($b => values.push($b))
  equal(values, ['0ab'])

  clock.tick(STORE_UNMOUNT_DELAY * 2)
  equal(a.get(), '0a')
  base.set(1)
  equal(values, ['0ab', '1ab'])

  unsubscribe()
})

test('notifies when stores change within the same notifyId', () => {
  let val$ = atom(1)

  let computed1$ = memo(cb => {
    return val$.get(cb)
  })

  let computed2$ = memo(() => {
    return computed1$.get()
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
  let deferrer = memo(cx => store.get(cx) * 2)

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
  equal(deferrerValue, store.get() * 2)
  ok(store.lc > 0)
  equal(events, 'init ')

  store.set(3)
  equal(deferrer.get(), store.get() * 2)
  equal(deferrerValue, store.get() * 2)

  unbind()
  clock.runAll()
  equal(deferrer.lc, 0)
  equal(events, 'init destroy ')
})

test('computes initial value when argument is undefined', () => {
  let one = atom<string | undefined>(undefined)
  let two = memo(() => !!one.get())
  equal(one.get(), undefined)
  equal(two.get(), false)
})

test.run()
