import type { Metadata } from 'next';
import './global.css';

export const metadata: Metadata = {
  title: {
    default: 'Shukka',
    template: '%s — Shukka',
  },
  description: '自行托管桌面应用的自动更新。安装包存放于自有对象存储。',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return children;
}
