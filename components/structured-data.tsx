import { SITE } from "@/lib/site";
import { FAQS } from "./faq";

// JSON-LD for rich results. Two graphs: the product (SoftwareApplication with its one-time
// price) and the FAQ. The FAQ schema is generated from the SAME array the visible FAQ
// renders, so the machine-readable claims can never drift from what the page says.
// No aggregateRating: we have no ratings yet and never fabricate them.

const softwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE.name,
  description: SITE.description,
  url: SITE.url,
  image: `${SITE.url}/og.png`,
  operatingSystem: "macOS 14.0 or later, Windows 10, Windows 11",
  applicationCategory: "UtilitiesApplication",
  offers: {
    "@type": "Offer",
    price: String(SITE.priceUSD),
    priceCurrency: "USD",
    url: `${SITE.url}/buy`,
  },
};

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
 * and its own FAQ, generated from the same items the page renders. The product
 * graph is not repeated here; the home page is the product's canonical entity.
 */
export function PageStructuredData({
  path,
  title,
  faqs,
}: {
  path: string;
  title: string;
  faqs: readonly { q: string; a: string }[];
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
