import type { AnyApiReferenceConfiguration } from '@scalar/api-reference-react';

/**
 * Scalar configuration. Colors live in `app/global.css` as `--scalar-*`
 * variables (mapped from Shukka panel tokens). `theme: 'none'` skips
 * Scalar's presets so those variables win.
 */
export function openApiSpecUrl(locale: string): string {
  return locale === 'zh-CN' ? '/openapi.zh-CN.json' : '/openapi.json';
}

export function buildScalarConfiguration(options: {
  mode: 'light' | 'dark';
  locale: string;
}): AnyApiReferenceConfiguration {
  return {
    url: openApiSpecUrl(options.locale),
    theme: 'none',
    layout: 'modern',
    hideDarkModeToggle: true,
    forceDarkModeState: options.mode,
    withDefaultFonts: false,
    telemetry: false,
    persistAuth: true,
    documentDownloadType: 'json',
    showDeveloperTools: 'never',
    mcp: { disabled: true },
    agent: { disabled: true },
    localization: {
      locale: options.locale === 'zh-CN' ? 'zh-CN' : 'en',
    },
  };
}
