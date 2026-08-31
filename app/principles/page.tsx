import type { Metadata } from "next";
import { FoundingPrinciplesPage } from "@/components/discovery-page";
import { FOUNDING_PRODUCT_GOAL } from "@/lib/founding-principles";

export const metadata: Metadata = {
  title: "Founding principles",
  description: FOUNDING_PRODUCT_GOAL,
  alternates: {
    canonical: "/principles",
    types: {
      "application/json": "/principles.json",
      "text/markdown": "/principles.md",
    },
  },
  openGraph: {
    title: "Artifactories founding principles",
    description: FOUNDING_PRODUCT_GOAL,
    type: "website",
    url: "https://artifactories.com/principles",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artifactories founding principles",
    description: FOUNDING_PRODUCT_GOAL,
  },
};

export default function PrinciplesPage() {
  return <FoundingPrinciplesPage />;
}
