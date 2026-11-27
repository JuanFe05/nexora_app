import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { BriefcaseIcon } from "@/icons";
import { ReportPage, type ReportDefinition } from "../../shared/report-page";
import { managementSecretariatApi } from "../api/management-secretariat-api";
import { managementSecretariatColumns, managementSecretariatExportColumns, managementSecretariatVisibleColumns, type ManagementSecretariatRow } from "../columns";

const report: ReportDefinition<ManagementSecretariatRow> = {
  idPrefix: "management-secretariat-invoices",
  icon: <BriefcaseIcon />,
  title: "Facturas Detalladas",
  description: "Consulta las facturas detalladas del sistema para Secretaría Gerencia.",
  filename: "secretaria-gerencia-facturas-detalladas",
  emptyTitle: "No hay facturas detalladas para este período.",
  api: managementSecretariatApi,
  columns: managementSecretariatColumns,
  exportColumns: managementSecretariatExportColumns,
  defaultVisibleColumns: managementSecretariatVisibleColumns,
  searchable: true,
};

export default function ManagementSecretariatPage() {
  const [tab, setTab] = useState("facturas");
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader icon={<BriefcaseIcon />} title="Secretaría Gerencia" description="Consulta las Facturas Detalladas del sistema y administra la fuente Ser Laboral de forma independiente." />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-w-0">
        <TabsList aria-label="Pestañas de Secretaría Gerencia">
          <TabsTrigger value="facturas">Facturas Detalladas</TabsTrigger>
          <TabsTrigger value="ser-laboral">Ser Laboral</TabsTrigger>
        </TabsList>
        <TabsPanel value="facturas"><ReportPage report={report} /></TabsPanel>
        <TabsPanel value="ser-laboral">
          <Card>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Ser Laboral</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">La carga está pendiente de validar el formato real del archivo CSV de Ser Laboral. No se procesará con el mapeo de Consumo General para evitar asignar columnas incorrectamente.</p>
          </Card>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
