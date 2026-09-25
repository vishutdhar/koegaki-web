import { SITE } from "@/lib/site";
import { FAQS } from "./faq";

// JSON-LD for rich results. Two graphs: the product (SoftwareApplication with its one-time
// price) and the FAQ. The FAQ schema is generated from the SAME array the visible FAQ
// renders, so the machine-readable claims can never drift from what the page says.
// No aggregateRating: we have no ratings yet and never fabricate them.

/**
 * The product graph. The home page describes both platforms; a platform
 * landing page passes its own description, URL and operating systems. The
 * offer is the same everywhere: one price, one checkout.
 */
function softwareApplicationGraph({
  description,
  url,
  operatingSystem,
}: {
  description: string;
  url: string;
  operatingSystem: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    description,
    url,
    image: `${SITE.url}/og.png`,
    operatingSystem,
    applicationCategory: "UtilitiesApplication",
    offers: {
      "@type": "Offer",
      price: String(SITE.priceUSD),
      priceCurrency: "USD",
      url: `${SITE.url}/buy`,
    },
  };
}

const softwareApplication = softwareApplicationGraph({
  description: SITE.description,
  url: SITE.url,
  operatingSystem: "macOS 14.0 or later, Windows 10, Windows 11",
});

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

// The payloads are static, developer-authored constants (no user input reaches them), and
// escaping `<` prevents any future string from ever closing the script tag early.
export function asJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Structured data for a secondary page: where it sits in the site (breadcrumb)
 * and its own FAQ, generated from the same items the page renders. A platform
 * landing page also passes `product`, its description and operating systems,
 * and gets the product graph with the one-time offer; a comparison page does
 * not, since it is about the choice between two products rather than a place
 * to get this one.
 */
export function PageStructuredData({
  path,
  title,
  faqs,
  product,
}: {
  path: string;
  title: string;
  faqs: readonly { q: string; a: string }[];
  product?: { description: string; operatingSystem: string };
}) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url },
      { "@type": "ListItem", position: 2, name: title, item: `${SITE.url}${path}` },
    ],
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: asJsonLd(softwareApplicationGraph({ ...product, url: `${SITE.url}${path}` })),
          }}
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: asJsonLd(breadcrumb) }} />
      {faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: asJsonLd(faq) }} />
      )}
    </>
  );
}

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: asJsonLd(softwareApplication) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: asJsonLd(faqPage) }} />
    </>
  );
}
