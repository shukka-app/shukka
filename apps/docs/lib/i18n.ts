import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'zh-CN',
  languages: ['zh-CN', 'en-US'],
  parser: 'dir',
});

export type Locale = (typeof i18n.languages)[number];
