/**
 * @author Piotr Falba
 * @author Wei Zhuo
 * @author Jakub Kania
 * @author Nyby
 */

import { isObject } from 'lodash';
import { useEffect, useRef } from 'react';
import Random from '../lib/Random';
import Pub from '../lib/Pub';
import useTracker from './useTracker';
import Meteor from '../Meteor';
import EJSON from 'ejson';

/**
 * Types and interfaces
 */
type Params = Record<string, unknown> | unknown[] | undefined;

type ErrorObject = {
  error?: number | string;
  reason?: string;
} | null;

interface SubHandle {
  ready(): boolean;
  error(): ErrorObject;
}

interface PublicationRef {
  subs: Record<string, SubHandle>;
  id: string;
}

interface UsePublicationOptions<T> {
  name: string;
  params?: Params;
  userId?: string | null;
  fetch?: () => T;
}

/**
 * Helpers
 */
function depsFromValuesOf(params: Params): unknown[] {
  if (isObject(params)) {
    return Object.values(params as Record<string, unknown>);
  }
  if (Array.isArray(params)) {
    return params as unknown[];
  }
  return typeof params === 'undefined' ? [] : [params];
}

function info(msg: string): void {
  console.info(`usePub: ${msg}`);
}

function subId(name: string, deps: unknown[], refId: string): string {
  return EJSON.stringify({ name, deps, refId });
}

/**
 * The hook
 */
export default function usePublication<T = unknown>(
  { name, params = {}, userId, fetch = () => null as unknown as T }: UsePublicationOptions<T>,
  dependencies?: unknown[]
): [T | undefined, boolean, ErrorObject] {
  const allArgsSet: boolean = !Object.values(params as Record<string, unknown>).some((x) => x === undefined);
  const deps: unknown[] = dependencies || [userId ?? null, ...depsFromValuesOf(params)];
  const ref = useRef<PublicationRef | null>(null);

  if (ref.current === null && allArgsSet) {
    ref.current = { subs: {}, id: (Random.id() as string) };
    if ((Meteor.isVerbose && Meteor.isVerbose()) || (typeof Meteor.isVerbose === 'function' && Meteor.isVerbose())) {
      const p = JSON.stringify(params);
      const d = JSON.stringify(deps);
      info(`New ref ${name}(${p})${d}, refId=${ref.current.id}`);
    }
  }

  // stop publications on unmount (cleanup)
  useEffect(
    () => () => {
      const id = subId(name, deps, ref.current?.id ?? '');
      if (ref.current && ref.current.subs[id]) {
        if ((Meteor.isVerbose && Meteor.isVerbose()) || (typeof Meteor.isVerbose === 'function' && Meteor.isVerbose())) {
          info(`Unmounting ${ref.current.id}, unsub ${id}`);
        }
        // Pub.stop may be implemented differently; keep call as in original logic
        (Pub as unknown as { stop: (sub: SubHandle, refId: string) => void }).stop(ref.current.subs[id], ref.current.id);
        delete ref.current.subs[id];
      }
    },
    // deps must be an array
    deps
  );

  const formatError = ({ error, reason }: { error?: number | string; reason?: string }): ErrorObject =>
    error ? { error, reason } : null;

  // Provide a typed wrapper for useTracker (original import may be untyped)
  const useTrackerTyped = useTracker as unknown as <R>(fn: () => R, depsArray: unknown[]) => R;

  return useTrackerTyped(() => {
    if (!allArgsSet) {
      return [undefined, false, null] as [T | undefined, boolean, ErrorObject];
    }

    const refId = ref.current?.id ?? '';
    const id = subId(name, deps, refId);

    const existingSub = ref.current?.subs[id];
    const sub: SubHandle =
      existingSub ??
      ((Pub as unknown as { subscribe: (name: string, params: Params, refId: string) => SubHandle }).subscribe(
        name,
        params,
        refId
      ) as SubHandle);

    if (ref.current && !ref.current.subs[id]) {
      ref.current.subs[id] = sub;
    }

    const subError = sub.error();
    const result: T | undefined = !subError ? (fetch() as T) : undefined;

    if ((Meteor.isVerbose && Meteor.isVerbose()) || (typeof Meteor.isVerbose === 'function' && Meteor.isVerbose())) {
      const p = JSON.stringify(params);
      const d = JSON.stringify(deps);
      const r = sub.ready();
      const e = JSON.stringify(formatError(subError ?? {}));
      info(`Ready=${r} ${name}(${p})${d}, error=${e}, refId=${ref.current?.id ?? ''}`);
    }

    const loading = !sub.ready();
    return [result, loading, sub.error()] as [T | undefined, boolean, ErrorObject];
  }, deps);
}
