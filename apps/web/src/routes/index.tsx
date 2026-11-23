import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { Cities } from "@/components/landing/cities";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Partners } from "@/components/landing/partners";
import { Programs } from "@/components/landing/programs";
import { Reasons } from "@/components/landing/reasons";

const TITLE =
  "Hoops Genesis · Basketball & football academies, courts and leagues";
const DESCRIPTION =
  "Basketball & football academies, courts and leagues in India, Rwanda and Uganda.";

/** `menu=open`: opens the phone/tablet menu on load (Paper K8-0), for deep links and screenshots. */
const searchSchema = z.object({
  menu: z.literal("open").optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#111111" },
    ],
  }),
  component: LandingPage,
});

/*
 * Public landing page, Paper page p-2-0: 8I-0 (1440), QD-0 (1024), L3-0 (768),
 * FR-0 (390), K8-0 (390, menu open). Own layout, no app shell.
 */
function LandingPage() {
  const { menu } = Route.useSearch();

  return (
    <>
      <main>
        <Hero defaultMenuOpen={menu === "open"} />
        <Partners />
        <Reasons />
        <Cities />
        <Programs />
      </main>
      <Footer />
    </>
  );
}
