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
  operatingSystem: "macOS 14.0 or later",
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

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}
