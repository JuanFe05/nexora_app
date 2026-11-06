import { PageMeta } from "@/components/shared/page-meta";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";

// BlankPage de TailAdmin: marcador de posición, sin funcionalidades de negocio.
export default function HomePage({ title = "Inicio" }: { title?: string }) {
  return (
    <>
      <PageMeta title={`${title} | ${env.appName}`} description={title} />
      <h1 className="mb-6 text-title-lg font-semibold text-gray-800 dark:text-white/90">{title}</h1>
      <Card className="flex min-h-screen items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-7 shadow-none xl:px-10 xl:py-12 dark:border-gray-800 dark:bg-white/3">
        <div className="mx-auto w-full max-w-157.5 text-center">
          <h2 className="mb-4 font-semibold text-gray-800 sm:text-2xl dark:text-white/90">{env.appName}</h2>
          <p className="text-sm text-gray-500 sm:text-base dark:text-gray-400">Página en blanco</p>
        </div>
      </Card>
    </>
  );
}
