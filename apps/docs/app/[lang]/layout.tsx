import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';
import { translations } from '@/lib/layout.shared';

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;

  if (lang === 'en-US') {
    return {
      description:
        'Self-host automatic updates for desktop apps. Installers stay in your own object storage.',
    };
  }

  return {
    description: '自行托管桌面应用的自动更新。安装包存放于自有对象存储。',
  };
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
