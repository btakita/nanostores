import { onMount } from '../lifecycle/index.js'
import { atom, nanostoresGetSym } from '../atom/index.js'

export let computed = (storesOrCb, cb) => {
  let isPredefined, stores, runCb
  let lGet = () => Math.max(...stores.map(s => s.l)) + 1
  if (cb) {
    isPredefined = 1
    stores = (!Array.isArray(storesOrCb)) ? stores = [storesOrCb] : storesOrCb
    runCb = args=>cb(...args)
  } else {
    let get = store => {
      if (!~stores.indexOf(store)) {
        stores.push(store)
        derived.l = lGet()
        unbinds.push(store.listen(run, derived))
      }
      return store(null)
    }
    isPredefined = 0
    cb = storesOrCb
    stores = []
    runCb = ()=>{
      globalThis[nanostoresGetSym].push(get)
      let val = cb(get)
      globalThis[nanostoresGetSym].pop()
      return val
    }
  }

  let diamondArgs
  let derived = atom(undefined, isPredefined ? lGet() : 0)
  let unbinds = []

  let run = () => {
    let diamondArgsIsUnset = !diamondArgs
    if (!isPredefined && diamondArgsIsUnset) {
      derived.set(runCb())
    }
    let args = stores.map(store => store.get())
    if (
      diamondArgsIsUnset ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      if (isPredefined || !diamondArgsIsUnset) {
        derived.set(runCb(args))
        if (!isPredefined) {
          args = stores.map(store => store.get())
        }
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
