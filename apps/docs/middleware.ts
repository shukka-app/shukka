import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { i18n } from '@/lib/i18n';
import { docsContentRoute, docsRoute } from '@/lib/shared';

const i18nMiddleware = createI18nMiddleware(i18n);

const { rewrite: rewriteDocs } = rewritePath(
  `/{lang}${docsRoute}{/*path}`,
  `/{lang}${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `/{lang}${docsRoute}{/*path}.md`,
  `/{lang}${docsContentRoute}{/*path}/content.md`,
);

function isSupportedLocale(pathname: string): boolean {
  const lang = pathname.split('/')[1];
  return Boolean(lang && i18n.languages.includes(lang as (typeof i18n.languages)[number]));
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isSupportedLocale(request.nextUrl.pathname)) {
    const suffix = rewriteSuffix(request.nextUrl.pathname);
    if (suffix) {
      return NextResponse.rewrite(new URL(suffix, request.nextUrl));
    }

    if (isMarkdownPreferred(request)) {
      const docs = rewriteDocs(request.nextUrl.pathname);
      if (docs) {
        return NextResponse.rewrite(new URL(docs, request.nextUrl), {
          headers: { Vary: 'Accept' },
        });
      }
    }
  }

  return i18nMiddleware(request, event);
}

export const config = {
  matcher: ['/((?!api/search|openapi[^/]*\\.json|_next/static|_next/image|favicon.ico).*)'],
};
