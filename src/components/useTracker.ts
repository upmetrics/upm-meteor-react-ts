// /d:/Dipak/test/testMeteorApp/upm-meteor-react-js/src/components/useTracker.ts
import { useEffect, useState, DependencyList } from 'react';
import TrackerImport from '../Tracker';
import DataImport from '../Data';

/**
 * Minimal type shapes for the external Tracker and Data modules used by this hook.
 * We cast the imported modules to these shapes so we can use them with full TypeScript typing.
 */
type TrackerComputation = {
  stop(): void;
};

type TrackerDependency = {
  depend(): void;
  changed(): void;
};

interface TrackerModule {
  Dependency: new () => TrackerDependency;
  autorun: (runFn: (computation: TrackerComputation) => void) => TrackerComputation;
  nonreactive: (fn: () => void) => void;
}

interface DataModule {
  onChange(cb: () => void): void;
  offChange(cb: () => void): void;
}

/* Cast the raw imports to the typed interfaces above */
const Tracker = TrackerImport as unknown as TrackerModule;
const Data = DataImport as unknown as DataModule;

/**
 * React hook that tracks reactive data using Tracker.Dependency and Tracker.autorun.
 *
 * @param trackerFn - function that returns the current tracked value (generic)
 * @param deps - effect dependencies (React DependencyList)
 * @returns the latest value returned by trackerFn
 */
export default function useTracker<T>(trackerFn: () => T, deps: DependencyList = []): T {
  const [response, setResponse] = useState<T>(() => trackerFn());

  useEffect(() => {
    // One dependency, one Data listener and one computation per effect run: registered here and
    // removed by this effect's cleanup. The listener used to be registered during render, which
    // added a new one on every render while the cleanup removed only one, so listeners piled up
    // for as long as the page stayed open and every data change ran all of them.
    const meteorDataDep: TrackerDependency = new Tracker.Dependency();
    const dataChangedCallback = (): void => {
      meteorDataDep.changed();
    };
    let computation: TrackerComputation | null = null;
    const stopComputation = (): void => {
      if (computation) {
        computation.stop();
      }
      computation = null;
    };

    Data.onChange(dataChangedCallback);
    Tracker.nonreactive(() =>
      Tracker.autorun((currentComputation: TrackerComputation) => {
        meteorDataDep.depend();
        computation = currentComputation;
        setResponse(trackerFn());
      })
    );

    return (): void => {
      stopComputation();
      Data.offChange(dataChangedCallback);
    };
    // deps is typed as React's DependencyList (readonly any[]), preserving original behavior
  }, deps);

  return response;
}
