import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparisonPage } from "@/components/subpage/comparison-page";
import { COMPARISONS, comparison } from "@/lib/compare";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = comparison(slug);
  if (!c) return {};
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: `/vs/${c.slug}` },
    openGraph: { title: c.title, description: c.description, url: `/vs/${c.slug}` },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = comparison(slug);
  if (!c) notFound();
  return <ComparisonPage c={c} />;
}
