import { onMount } from '../lifecycle/index.js'
import { atom } from '../atom/index.js'

export let computed = (stores, cb) => {
  if (!Array.isArray(stores)) stores = [stores]

  let diamondArgs
  let run = () => {
    let args = stores.map(store => store.get())
    if (
      diamondArgs === undefined ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      diamondArgs = args
      derived.set(cb(...args))
    }
  }
  let derived = atom(undefined, Math.max(...stores.map(s => s.l)) + 1)

  onMount(derived, () => {
    let unbinds = stores.map(store => store.listen(run, derived.l))
    run()
    return () => {
      for (let unbind of unbinds) unbind()
    }
  })

  return derived
}

export let computedSignal = cb => {
  let stores = []

  let diamondArgs
  let derived = atom(undefined, 0)
  let unbinds = []
  let get = store => {
    if (!~stores.indexOf(store)) {
      stores.push(store)
      derived.l = Math.max(...stores.map(s => s.l)) + 1
      unbinds.push(store.listen(run, derived))
    }
    return store()
  }

  let run = () => {
    let diamondArgsIsUndefined = diamondArgs === undefined
    if (diamondArgsIsUndefined) {
      derived.set(cb(get))
    }
    let args = stores.map(store => store.get())
    if (
      diamondArgsIsUndefined ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      if (!diamondArgsIsUndefined) {
        derived.set(cb(get))
        args = stores.map(store => store.get())
      }
      diamondArgs = args
    }
  }

  onMount(derived, () => {
    run()
    return () => {
      for (let unbind of unbinds) unbind()
    }
  })

  return derived
}
