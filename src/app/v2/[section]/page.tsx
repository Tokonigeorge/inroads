import Link from "next/link";
import { notFound } from "next/navigation";
import { Scene } from "@/features/v2/scene";

/** The tabs Inroads 2 hasn't moved into yet: what's coming, and a way to the same thing in the current app. */
const SECTIONS = {
  inbox: { title: "Inbox", soon: "Your Inbox is coming next: everything Inroads has ready for you, to approve in a tap.", classic: { href: "/today", label: "Open Today" } },
  people: { title: "People", soon: "People moves here soon, with each person's page told as a story.", classic: { href: "/people", label: "Open People" } },
  events: { title: "Events", soon: "Events move here after People.", classic: { href: "/rooms", label: "Open Events" } },
  goals: { title: "Goals", soon: "Goals become campaigns here later on.", classic: { href: "/goals", label: "Open Goals" } },
} as const;

type Section = keyof typeof SECTIONS;
const isSection = (s: string): s is Section => s in SECTIONS;

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export async function generateMetadata({ params }: PageProps<"/v2/[section]">) {
  const { section } = await params;
  return { title: isSection(section) ? SECTIONS[section].title : "Not found" };
}

export default async function ComingSoon({ params }: PageProps<"/v2/[section]">) {
  const { section } = await params;
  if (!isSection(section)) notFound();
  const s = SECTIONS[section];
  return (
    <main className="v2-page">
      <header className="v2-head">
        <div className="ir-wash ir-wash--fade" />
        <div className="v2-top">
          <span className="v2-brand"><span className="ir-mark" style={{ ["--size" as string]: "22px" }} />Inroads 2</span>
          <Link href="/today">Back to the current app</Link>
        </div>
        <h1 className="v2-title">{s.title}</h1>
      </header>
      <section className="v2-soon" aria-label="Coming soon">
        <Scene id={section} />
        <h2>Coming soon</h2>
        <p>{s.soon}</p>
        <Link href={s.classic.href} className="ir-btn ir-btn--primary">{s.classic.label} in the current app</Link>
      </section>
    </main>
  );
}
