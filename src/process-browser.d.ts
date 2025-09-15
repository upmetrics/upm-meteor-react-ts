declare module 'process/browser' {
  const process: {
    nextTick: (cb: (...args: any[]) => void, ...args: any[]) => void;
    env: { [key: string]: string | undefined };
    cwd?: () => string;
    [key: string]: any;
  };
  export default process;
}
