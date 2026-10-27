import type { ComponentType } from "react";

type IconProps = { size?: number; className?: string };
const icon =
  (paths: React.ReactNode): ComponentType<IconProps> =>
  // eslint-disable-next-line react/display-name
  ({ size = 22, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {paths}
    </svg>
  );

/* The prototype's tab icons (L405–411), drawn the same way. */
const TodayIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </>,
);
const PeopleIcon = icon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9" />
  </>,
);
const DiscoverIcon = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" />
  </>,
);
const EventsIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
const GoalsIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.3" />
  </>,
);

export type NavItem = { href: string; label: string; icon: ComponentType<IconProps>; also?: string[] };

/** The prototype's five tabs (L412): Today, People, Discover, Events, Goals. */
export const primaryNav: NavItem[] = [
  { href: "/today", label: "Today", icon: TodayIcon },
  { href: "/people", label: "People", icon: PeopleIcon, also: ["/sort", "/duplicates", "/ask", "/suggestions"] },
  { href: "/discover", label: "Discover", icon: DiscoverIcon },
  { href: "/rooms", label: "Events", icon: EventsIcon },
  { href: "/goals", label: "Goals", icon: GoalsIcon, also: ["/settings"] },
];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export const isActive = (pathname: string, item: NavItem) => {
  if (item.also?.some((h) => under(pathname, h))) return true;
  return under(pathname, item.href);
};
