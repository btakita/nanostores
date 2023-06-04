import { onMount } from '../lifecycle/index.js'
import { atom, nanostoresGetSym } from '../atom/index.js'

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

export let memo = cb => {
  let stores = []

  let diamondArgs
  let derived = atom(undefined)
  let unbinds = []
  let cx = store => {
    if (!~stores.indexOf(store)) {
      stores.push(store)
      derived.l = Math.max(...stores.map(s => s.l)) + 1
      unbinds.push(store.listen(run, derived))
    }
    return store.get(null)
  }

  let runCb = ()=>{
    globalThis[nanostoresGetSym].push(cx)
    try {
      return cb(cx)
    } finally {
      globalThis[nanostoresGetSym].pop()
    }
  }

  let argsNew = () => stores.map(store => store.get())

  let run = () => {
    let args = argsNew()
    if (
      diamondArgs === undefined ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      derived.set(runCb())
      args = argsNew()
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
