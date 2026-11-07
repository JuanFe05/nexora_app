/** Balanced, top-to-bottom columns. Extra columns wrap as a block on smaller screens. */
export function permissionGridLayout(count: number) {
  const columns = Math.ceil(count / 6);
  if (!columns) return { columns: 0, rows: 0, columnSizes: [] as number[] };
  const rows = Math.ceil(count / columns);
  const minimum = Math.floor(count / columns);
  const remainder = count % columns;
  const columnSizes = Array.from({ length: columns }, (_, index) => minimum + (index < remainder ? 1 : 0));
  return { columns, rows, columnSizes };
}
