import SHA256 from 'crypto-js/sha256';

let i: number = 0;

export function uniqueId(): string {
  return (i++).toString();
}

export interface HashPasswordResult {
  digest: string;
  algorithm: 'sha-256';
}

export function hashPassword(password: string): HashPasswordResult {
  return {
    digest: SHA256(password).toString(), // lgtm [js/insufficient-password-hash]
    algorithm: 'sha-256',
  };
}

// From Meteor core (ported with TypeScript types)
const class2type: Record<string, string> = {};

const toString = Object.prototype.toString;

type HasOwnFn = (obj: unknown, prop: string) => boolean;
const hasOwn: HasOwnFn = (obj: unknown, prop: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj as object, prop);

type Support = {
  ownLast?: boolean;
};

const support: Support = {};

// Populate the class2type map
'Boolean Number String Function Array Date RegExp Object Error'
  .split(' ')
  .forEach((name: string): void => {
    class2type['[object ' + name + ']'] = name.toLowerCase();
  });

export function type(obj: unknown): string {
  if (obj === null) {
    return String(obj);
  }
  const t = typeof obj;
  if (t === 'object' || t === 'function') {
    const s = toString.call(obj);
    return class2type[s] || 'object';
  }
  return t;
}

export function isWindow(obj: unknown): boolean {
  // Keep the original semantics: obj !== null && obj === obj.window
  // Use any to access .window safely
  return obj !== null && (obj as any) === (obj as any).window;
}

export function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  let key: string | undefined;

  // Must be an Object.
  // Because of IE, we also have to check the presence of the constructor property.
  // Make sure that DOM nodes and window objects don't pass through, as well
  if (!obj || type(obj) !== 'object' || (obj as any).nodeType || isWindow(obj)) {
    return false;
  }

  try {
    // Not own constructor property must be Object
    if (
      (obj as any).constructor &&
      !hasOwn(obj, 'constructor') &&
      !hasOwn((obj as any).constructor.prototype, 'isPrototypeOf')
    ) {
      return false;
    }
  } catch (e) {
    // IE8,9 Will throw exceptions on certain host objects #9897
    return false;
  }

  const o = obj as Record<string, unknown>;

  // Support: IE<9
  // Handle iteration over inherited properties before own properties.
  if (support.ownLast) {
    for (key in o) {
      return hasOwn(o, key);
    }
  }

  // Own properties are enumerated firstly, so to speed up,
  // if last one is own, then all properties are own.
  for (key in o) {
    // intentionally empty - just advance iterator
  }

  return key === undefined || hasOwn(o, key as string);
}
