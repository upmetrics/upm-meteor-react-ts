// src/lib/Random.ts

export interface RandomUtils {
  /**
   * Generate an "unmistakable" id string.
   * @param count Number of characters to generate (default 17)
   */
  id(count?: number): string;
}

export const UNMISTAKABLE_CHARS: string =
  '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';

export const Random: RandomUtils = {
  id(count = 17): string {
    let res: string = '';
    for (let i: number = 0; i < count; i++) {
      const idx: number = Math.floor(Math.random() * UNMISTAKABLE_CHARS.length);
      // use charAt to ensure a string (no undefined)
      res += UNMISTAKABLE_CHARS.charAt(idx);
    }
    return res;
  },
};

export default Random;
