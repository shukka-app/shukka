import type { Metadata } from 'next';
import { brandMetadata } from '@/lib/metadata';
import { appName } from '@/lib/shared';
import { RedocClient } from './redoc-client';

const copy = {
  'zh-CN': {
    title: 'API 参考',
    description:
      'Shukka 的 OpenAPI 参考：API key（或面板 session）可调用的 App API、上传协议，以及公开无鉴权的更新 feed 与 release notes 接口。',
  },
  'en-US': {
    title: 'API Reference',
    description:
      'Shukka OpenAPI reference: App APIs callable with an API key (or panel session), the upload protocol, and the public unauthenticated update feed and release notes endpoints.',
  },
} as const;

export async function generateMetadata(props: PageProps<'/[lang]/api'>): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  const { title, description } = copy[locale];
  const suffix = locale === 'zh-CN' ? '文档' : 'docs';

  return brandMetadata({
    lang: locale,
    path: `/${locale}/api`,
    title,
    description,
    ogTitle: `${title} · ${appName} ${suffix}`,
  });
}

export default async function ApiReferencePage(props: PageProps<'/[lang]/api'>) {
  const { lang } = await props.params;
  return <RedocClient locale={lang} />;
}
