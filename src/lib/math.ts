export function calcAvg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}
