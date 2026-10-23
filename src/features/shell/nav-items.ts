import { CalendarDays, Settings, Sun, Target, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const primaryNav: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/people", label: "People", icon: Users },
  { href: "/rooms", label: "Rooms", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
];

export const settingsNav: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
