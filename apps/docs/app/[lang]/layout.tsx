import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';
import { translations } from '@/lib/layout.shared';
import { brandMetadata, siteDescription, socialTitle } from '@/lib/metadata';

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  const locale = lang === 'en-US' ? 'en-US' : 'zh-CN';

  return brandMetadata({
    lang: locale,
    path: `/${locale}`,
    description: siteDescription[locale],
    ogTitle: socialTitle[locale],
  });
}

export default async function Layout({ params, children }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={i18nProvider(translations, lang)}>{children}</RootProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
