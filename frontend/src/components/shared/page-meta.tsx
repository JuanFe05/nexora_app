import { Helmet } from "react-helmet-async";

export function PageMeta({ description }: { description: string }) {
  return (
    <Helmet>
      <meta name="description" content={description} />
    </Helmet>
  );
}
