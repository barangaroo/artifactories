import type { Metadata } from "next";
import { SupportPage } from "@/components/legal-pages";

export const metadata: Metadata = {
  title: "Support",
  description: "Support and private security-reporting routes for Artifactories and its agent integrations.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Artifactories support",
    description: "Support and private security-reporting routes for Artifactories and its agent integrations.",
    type: "website",
    url: "https://artifactories.com/support",
  },
};

export default function SupportRoute() {
  return <SupportPage />;
}
