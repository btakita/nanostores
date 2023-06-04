import { onMount } from '../lifecycle/index.js'
import { atom, nanostoresGetSym } from '../atom/index.js'

export let computed = (stores, cb) => {
  let isPredefined, runCb
  let lNew = () => Math.max(...stores.map(s => s.l)) + 1
  if (cb) {
    isPredefined = 1
    stores = Array.isArray(stores) ? stores : [stores]
    runCb = args => cb(...args)
  } else {
    isPredefined = 0
    cb = stores
    stores = []
    let get = store => {
      if (!~stores.indexOf(store)) {
        stores.push(store)
        derived.l = lNew()
        unbinds.push(store.listen(run, derived))
      }
      return store(null)
    }
    runCb = ()=> {
      globalThis[nanostoresGetSym].push(get)
      try {
        return cb(get)
      } finally {
        globalThis[nanostoresGetSym].pop()
      }
    }
  }

  let diamondArgs
  let derived = atom(undefined, isPredefined ? lNew() : 0)
  let unbinds = []

  let run = () => {
    let args = stores.map(store => store.get())
    if (
      !diamondArgs ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      derived.set(runCb(args))
      if (!isPredefined) {
        args = stores.map(store => store.get())
      }
      diamondArgs = args
    }
  }

  onMount(derived, () => {
    if (isPredefined) {
      unbinds.push(...stores.map(store => store.listen(run, derived.l)))
    }
    run()
    return () => {
      for (let unbind of unbinds) unbind()
    }
  })

  return derived
}
