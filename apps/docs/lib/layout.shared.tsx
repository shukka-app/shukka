import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { zhCN } from '@fumadocs/language/zh-cn';
import { i18n } from './i18n';
import { appName, gitConfig } from './shared';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .preset('zh-CN', zhCN())
  .add({
    'zh-CN': {
      displayName: '简体中文',
    },
    'en-US': {
      displayName: 'English',
    },
  });

export function baseOptions(locale: string): BaseLayoutProps {
  const isZh = locale === 'zh-CN';

  return {
    nav: {
      title: appName,
      url: `/${locale}`,
    },
    links: [
      {
        text: isZh ? '文档' : 'Docs',
        url: `/${locale}/docs`,
        active: 'nested-url',
      },
      {
        text: isZh ? 'API 参考' : 'API Reference',
        url: `/${locale}/api`,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
