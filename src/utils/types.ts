export type ExpandType<T> = {
  [K in keyof T]: T[K];
} & {};
