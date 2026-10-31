import type { ReactNode } from 'react';

// Authenticated admin dashboard — never statically prerender this route.
// This must live in a layout (Server Component) rather than page.tsx,
// since page.tsx is a 'use client' file and Next.js only reads route
// segment config (dynamic, revalidate, etc.) from Server Components.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
