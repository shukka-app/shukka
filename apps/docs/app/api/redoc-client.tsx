'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { redocDarkOptions, redocLightOptions } from '@/lib/redoc-options';

const RedocStandalone = dynamic(async () => (await import('redoc')).RedocStandalone, {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-fd-muted-foreground">加载 API 文档…</div>,
});

export function RedocClient() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="p-8 text-sm text-fd-muted-foreground">加载 API 文档…</div>;
  }

  const options = resolvedTheme === 'dark' ? redocDarkOptions : redocLightOptions;

  return (
    <>
      <Link
        href="/docs"
        className="fixed right-4 top-4 z-[100] rounded-md border border-fd-border bg-fd-card px-3 py-1.5 text-sm text-fd-card-foreground no-underline"
      >
        ← 返回文档
      </Link>
      {/* key forces a remount so redoc re-initializes with the new theme */}
      <RedocStandalone key={resolvedTheme} specUrl="/openapi.json" options={options} />
    </>
  );
}
