import React, {
  forwardRef,
  memo,
  ReactElement,
  Ref,
  ComponentType,
  PropsWithChildren,
} from "react";
import useTracker from "./useTracker";

/**
 * Options for withTracker HOC
 */
export interface WithTrackerOptions<P extends object, D extends object> {
  getMeteorData: (props: P) => D;
  pure?: boolean;
}

/**
 * Higher-order component to wrap React components with Meteor Tracker reactivity.
 *
 * @param options - Either a function returning reactive data or an object with `getMeteorData` and `pure`.
 * @returns A function that wraps a component with reactive data.
 */
export default function withTracker<
  P extends object,
  D extends object = Record<string, unknown>
>(
  options: ((props: P) => D) | WithTrackerOptions<P, D>
) {
  return (Component: ComponentType<P & D>) => {
    const expandedOptions: WithTrackerOptions<P, D> =
      typeof options === "function"
        ? { getMeteorData: options }
        : options;

    const { getMeteorData, pure = true } = expandedOptions;

    const WithTracker = forwardRef<unknown, PropsWithChildren<P>>(
      (props, ref: Ref<unknown>): ReactElement => {
        const data = useTracker<D>(() => getMeteorData(props as unknown as P) || ({} as D));
        return React.createElement(Component, { ref, ...(props as unknown as any), ...data } as any);
      }
    );

    return pure ? memo(WithTracker) : WithTracker;
  };
}
