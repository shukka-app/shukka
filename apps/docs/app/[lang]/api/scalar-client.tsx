'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { buildScalarConfiguration } from '@/lib/scalar-options';

import '@scalar/api-reference-react/style.css';

function LoadingLabel({ locale }: { locale: string }) {
  return (
    <div className="p-8 text-sm text-fd-muted-foreground">
      {locale === 'zh-CN' ? '加载 API 文档…' : 'Loading API docs…'}
    </div>
  );
}

const ApiReferenceReact = dynamic(
  async () => (await import('@scalar/api-reference-react')).ApiReferenceReact,
  { ssr: false },
);

export function ScalarClient({ locale }: { locale: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <LoadingLabel locale={locale} />;
  }

  const mode = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <a
        href={`/${locale}/docs`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(`/${locale}/docs`);
        }}
        className="fixed right-4 top-4 z-[100] rounded-md border border-fd-border bg-fd-card px-3 py-1.5 text-sm text-fd-card-foreground no-underline"
      >
        {locale === 'zh-CN' ? '← 返回文档' : '← Back to docs'}
      </a>
      {/* key forces a remount so Scalar re-initializes with the new theme */}
      <ApiReferenceReact
        key={resolvedTheme}
        configuration={buildScalarConfiguration({ mode, locale })}
      />
    </>
  );
}
