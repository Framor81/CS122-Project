// Lightweight tslib compatibility shim for browser bundling.

export function __assign(target, ...sources) {
  return Object.assign(target, ...sources)
}

export function __rest(source, exclude) {
  const target = {}
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key) && !exclude.includes(key)) {
      target[key] = source[key]
    }
  }
  return target
}

export function __awaiter(thisArg, args, PromiseImpl, generatorFactory) {
  const P = PromiseImpl || Promise
  const generator = generatorFactory.apply(thisArg, args || [])
  return new P((resolve, reject) => {
    const step = (method, value) => {
      let result
      try {
        result = generator[method](value)
      } catch (error) {
        reject(error)
        return
      }
      if (result.done) {
        resolve(result.value)
        return
      }
      P.resolve(result.value).then(
        (v) => step('next', v),
        (e) => step('throw', e),
      )
    }
    step('next')
  })
}

// Minimal __generator adapter; enough for TS async transpile helpers.
export function __generator(thisArg, body) {
  return body.call(thisArg, {
    label: 0,
    sent() {
      return void 0
    },
    trys: [],
    ops: [],
  })
}


