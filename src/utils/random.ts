export function createRandom(seed = 9471): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function range(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}
