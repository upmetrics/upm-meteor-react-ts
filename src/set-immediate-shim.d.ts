declare module 'set-immediate-shim' {
  type SetImmediate = (...args: any[]) => number | void;
  const setImmediate: SetImmediate;
  export default setImmediate;
}
