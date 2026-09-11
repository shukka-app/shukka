import type { Metadata } from 'next';
import { brandMetadata, siteDescription, siteUrl, socialTitle } from '@/lib/metadata';
import { appName } from '@/lib/shared';
import './global.css';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: appName,
    template: `%s — ${appName}`,
  },
  ...brandMetadata({
    lang: 'zh-CN',
    path: '/',
    description: siteDescription['zh-CN'],
    ogTitle: socialTitle['zh-CN'],
  }),
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return children;
}
