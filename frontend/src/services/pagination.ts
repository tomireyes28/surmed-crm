export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; hasMore: boolean };
}
