import { clean } from '../clean-stores/index.js'

let listenerQueue = []

export let atom = (initialValue, level) => {
  let listeners = []
  let store = () => store.get()
  Object.assign(store, {
    lc: 0,
    l: level || 0,
    value: initialValue,
    set(data) {
      if (store.value !== data) {
        store.value = data
        store.notify()
      }
    },
    get() {
      if (!store.lc) {
        store.listen(() => {})()
      }
      return store.value
    },
    notify(changedKey) {
      let runListenerQueue = !listenerQueue.length
      for (let i = 0; i < listeners.length; i += 2) {
        listenerQueue.push(
          listeners[i],
          store.value,
          changedKey,
          listeners[i + 1]
        )
      }

      if (runListenerQueue) {
        for (let i = 0; i < listenerQueue.length; i += 4) {
          let skip = false
          for (let j = i + 7; j < listenerQueue.length; j += 4) {
            if (listenerQueue[j] < listenerQueue[i + 3]) {
              skip = true
              break
            }
          }

          if (skip) {
            listenerQueue.push(
              listenerQueue[i],
              listenerQueue[i + 1],
              listenerQueue[i + 2],
              listenerQueue[i + 3]
            )
          } else {
            listenerQueue[i](listenerQueue[i + 1], listenerQueue[i + 2])
          }
        }
        listenerQueue.length = 0
      }
    },
    listen(listener, listenerLevel) {
      store.lc = listeners.push(listener, listenerLevel || store.l) / 2

      return () => {
        let index = listeners.indexOf(listener)
        if (~index) {
          listeners.splice(index, 2)
          store.lc--
          if (!store.lc) store.off()
        }
      }
    },
    subscribe(cb, listenerLevel) {
      let unbind = store.listen(cb, listenerLevel)
      cb(store.value)
      return unbind
    },
    off() {} /* It will be called on last listener unsubscribing.
     We will redefine it in onMount and onStop. */
  })

  if (process.env.NODE_ENV !== 'production') {
    store[clean] = () => {
      listeners = []
      store.lc = 0
      store.off()
    }
  }

  return store
}
