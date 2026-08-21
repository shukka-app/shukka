import type { Metadata } from 'next';
import './global.css';

export const metadata: Metadata = {
  title: {
    default: 'Shukka',
    template: '%s — Shukka',
  },
  description: '自行托管桌面应用的自动更新。安装包存放于自有对象存储。',
  openGraph: {
    images: [{ url: '/og.png', width: 2560, height: 1280 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return children;
}
