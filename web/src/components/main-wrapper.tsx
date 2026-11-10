'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function MainContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  if (isHome) {
    return <main className="flex-1 w-full flex flex-col">{children}</main>;
  }

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </main>
  );
}

