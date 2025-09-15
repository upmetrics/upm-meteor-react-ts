import Data from './Data';

type MethodId = string | number;
type Callback = (...args: unknown[]) => void;

interface DDPIface {
  method(name: string, params: unknown[]): MethodId;
}

interface CallEntry {
  id: MethodId;
  callback?: Callback;
}

interface DataType {
  ddp: DDPIface;
  calls: CallEntry[];
}

const typedData = Data as unknown as DataType;

function globalMeteorIsVerbose(): boolean {
  try {
    // Use globalThis to avoid importing Meteor and causing circular init.
    // If Meteor is attached to globalThis later, this will read it safely.
    // Accessing an uninitialized ES module import would throw; avoid that.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = (globalThis as any);
    if (g && g.Meteor && typeof g.Meteor.isVerbose === 'function') {
      return g.Meteor.isVerbose();
    }
  } catch (e) {
    // swallow any errors and treat as not verbose
  }
  return false;
}

function debugMethod(name: string, params: unknown[]): string {
  const args = JSON.stringify(params).replace(/^\[|\]$/g, '');
  return `"${name}"(${args})`;
}

function info(msg: string): void {
  console.info(`Call: ${msg}`);
}

export default function call(eventName: string, ...params: unknown[]): void {
  const args: unknown[] = params.slice();
  let callback: Callback | undefined;

  if (args.length && typeof args[args.length - 1] === 'function') {
    // We checked typeof === 'function', so cast to Callback
    callback = args.pop() as Callback;
  }

  const id: MethodId = typedData.ddp.method(eventName, args);

  if (globalMeteorIsVerbose()) {
    info(`Call: Method ${debugMethod(eventName, args)}, id=${id}`);
  }

  typedData.calls.push({ id, callback });
}
