import { atom, autosubscribeStack } from '../atom/index.js'
import { onMount } from '../lifecycle/index.js'

export let computed = (stores, cb) => {
  if (cb) {
    stores = Array.isArray(stores) ? stores : [stores]
  } else {
    cb = stores
    stores = []
  }
  let diamondArgs
  let predefinedLength = stores.length
  let unbinds = []
  let run = () => {
    let args = stores.map($store => $store.get())
    if (
      diamondArgs === undefined ||
      args.some((arg, i) => arg !== diamondArgs[i])
    ) {
      diamondArgs = args
      let use = $atom => {
        if (!~stores.indexOf($atom)) {
          stores.push($atom)
          unbinds.push($atom.listen(run, $computed))
          args.push($atom.value)
          $computed.l = Math.max($computed.l, $atom.l + 1)
        }
        return $atom.get()
      }
      try {
        autosubscribeStack.push(use)
        $computed.set(cb(...args.slice(0, predefinedLength)))
      } finally {
        autosubscribeStack.pop()
      }
    }
  }
  let $computed = atom(undefined, Math.max(...stores.map(s => s.l)) + 1)

  onMount($computed, () => {
    for (let store of stores) {
      unbinds.push(store.listen(run, $computed))
      $computed.l = Math.max($computed.l, store.l + 1)
    }
    run()
    return ()=>{
      for (let unbind of unbinds) unbind()
      unbinds.length = 0
    }
  })

  return $computed
}
