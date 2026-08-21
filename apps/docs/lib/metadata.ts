import type { Metadata } from 'next';
import { appName, siteOrigin } from './shared';

export function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL ?? siteOrigin;
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  url.protocol = 'https:';
  url.hash = '';
  url.search = '';
  url.pathname = '/';
  return url;
}

export const siteUrl = resolveSiteUrl();

type SiteLocale = 'zh-CN' | 'en-US';

function siteLocale(lang: string): SiteLocale {
  return lang === 'zh-CN' ? 'zh-CN' : 'en-US';
}

function brandImage(lang: string) {
  return {
    url: '/og.png',
    width: 2560,
    height: 1280,
    alt:
      siteLocale(lang) === 'zh-CN'
        ? 'Shukka 品牌图：自行托管桌面应用的自动更新'
        : 'Shukka brand card: self-host automatic updates for desktop apps',
  };
}

export const socialTitle = {
  'zh-CN': `${appName} — 自行托管的桌面应用更新源`,
  'en-US': `${appName} — the update feed you host yourself`,
} as const;

export function pageUrl(path: string): URL {
  const pathname = path.startsWith('/') ? path : `/${path}`;
  return new URL(pathname, siteUrl);
}

export const siteDescription = {
  'zh-CN':
    '自行托管桌面应用的自动更新。安装包存放于自有对象存储，由你决定何时向用户开放新版本，无须交给第三方。',
  'en-US':
    'Self-host automatic updates for desktop apps. Installers stay in your own object storage, and you decide when users get a new version.',
} as const;

export function brandMetadata(options: {
  lang: string;
  path: string;
  title?: Metadata['title'];
  description?: string;
  ogTitle?: string;
}): Metadata {
  const lang = siteLocale(options.lang);
  const url = pageUrl(options.path);
  const image = brandImage(lang);
  const ogTitle = options.ogTitle ?? socialTitle[lang];
  const description = options.description || siteDescription[lang];

  return {
    ...(options.title === undefined ? {} : { title: options.title }),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: appName,
      locale: lang === 'zh-CN' ? 'zh_CN' : 'en_US',
      url,
      title: ogTitle,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [image],
    },
  };
}
