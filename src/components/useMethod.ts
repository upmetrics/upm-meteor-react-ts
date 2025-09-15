/**
 * @author Piotr Falba
 * @author Wei Zhuo
 * @author Jakub Kania
 * @author Nyby
 */

import { useEffect, useRef, useState, DependencyList } from 'react';
import Random from '../lib/Random';
import Meteor from '../Meteor';
import { isObject } from 'lodash';

type MethodArgValue = unknown;
type MethodArgs = Record<string, MethodArgValue> | MethodArgValue[] | undefined;

function depsFromValuesOf(params: MethodArgs): MethodArgValue[] {
  if (isObject(params as any)) {
    return Object.values(params as Record<string, MethodArgValue>);
  }
  if (Array.isArray(params)) {
    return params;
  }
  return typeof params === 'undefined' ? [] : [params];
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function info(msg: string): void {
  console.info(`useMethod: ${msg}`);
}

type UseMethodState<T> = {
  result: T | null;
  loading: boolean;
  err: Error | null;
};

interface MeteorType {
  call<T = unknown>(name: string, args: MethodArgs, callback: (err: Error | null, result: T) => void): void;
  isVerbose?: () => boolean;
  userId?: () => string | null;
}

export default function useMethod<T = unknown>(
  name: string,
  args: MethodArgs = {},
  dependencies?: DependencyList
): UseMethodState<T> {
  const MeteorClient = Meteor as unknown as MeteorType;
  const argValues: MethodArgValue[] = depsFromValuesOf(args);

  const defaultDeps: DependencyList = [
    ...(MeteorClient.userId ? [MeteorClient.userId()] : []),
    ...argValues,
  ];

  const deps: DependencyList = dependencies ?? defaultDeps;

  const [state, setState] = useState<UseMethodState<T>>({
    result: null,
    loading: true,
    err: null,
  });

  const ref = useRef<{ id: string } | null>(null);

  const allArgsSet: boolean = !(argValues.length > 0 && argValues.some((x) => typeof x === 'undefined'));

  if (ref.current === null) {
    ref.current = { id: Random.id() };
  }

  const p: string = safeStringify(args);
  const d: string = safeStringify(deps);

  if (MeteorClient.isVerbose && MeteorClient.isVerbose()) {
    info(`Init ${name}(${p})${d}, refId=${ref.current.id}`);
  }

  useEffect(() => {
    let mounted = true;

    if (!allArgsSet) {
      if (MeteorClient.isVerbose && MeteorClient.isVerbose()) {
        info(`Args not all set ${name}(${p})${d}`);
      }
      setState({ result: null, loading: false, err: null });
    } else {
      if (MeteorClient.isVerbose && MeteorClient.isVerbose()) {
        info(`Calling ${name}(${p})${d}, err=null, loading=true, refId=${ref.current?.id}`);
      }
      setState({ err: null, result: null, loading: true });

      MeteorClient.call<T>(name, args, (err: Error | null, result: T) => {
        if (err) {
          // preserve original behavior of logging errors
          // eslint-disable-next-line no-console
          console.log(err);
        }
        if (mounted) {
          if (MeteorClient.isVerbose && MeteorClient.isVerbose()) {
            info(`Returned ${name}(${p})${d}, err=${String(err)}, loading=false, refId=${ref.current?.id}`);
          }
          setState({ err, result: result ?? null, loading: false });
        }
      });
    }

    return () => {
      mounted = false;
    };
    // deps is already a DependencyList
  }, deps);

  return state;
}
