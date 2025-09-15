declare module '@meteorrn/minimongo' {
  // Minimal typed surface for the parts used by this project.
  export type Selector = any;
  export type Modifier = any;

  export interface LocalCollectionDocument {
    _id?: string;
    [key: string]: any;
  }

  export class LocalCollection<T = LocalCollectionDocument> {
    constructor(name?: string);
    insert(doc: T): string;
    update(selector: Selector, modifier: Modifier): number;
    remove(selector: Selector): number;
    find(selector?: Selector, options?: any): { fetch(): T[] };
    findOne(selector?: Selector, options?: any): T | undefined;
    rawDatabase(): any;
  }

  const minimongo: {
    LocalCollection: typeof LocalCollection;
  };

  export default minimongo;
}
