export type CatalogOption = { id: number; nombre: string };
export type ReportFilters = {
  startDate: string;
  endDate: string;
  sites: number[];
  companies: number[];
  productLines: number[];
};
export type ReportCell = string | number | null;
