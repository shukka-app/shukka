/**
 * Redoc theme options built from the Shukka panel tokens (shukka
 * src/styles.css). Redoc's theme is a static JS object parsed by
 * styled-components/polished, which throws on `var()` / `color-mix(...)` —
 * so every color here is concrete hex, one object per theme. `color-mix`
 * tokens are resolved to approximate hex over the page background.
 */

const FONT_SANS =
  "'Instrument Sans Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO =
  "'Geist Mono Variable', ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace";

interface RedocTokens {
  foreground: string;
  card: string;
  sidebar: string;
  sidebarForeground: string;
  flare: string;
  paper: string;
  destructive: string;
  success: string;
  border: string;
  mutedForeground: string;
}

function buildRedocOptions(tokens: RedocTokens) {
  return {
    scrollYOffset: 0,
    hideLoading: false,
    hideHostname: false,
    hideSingleRequestSampleTab: false,
    theme: {
      spacing: {
        unit: 8,
        sectionHorizontal: 24,
        sectionVertical: 24,
      },
      typography: {
        fontFamily: FONT_SANS,
        fontSize: '14px',
        lineHeight: '1.5',
        headings: {
          fontFamily: FONT_SANS,
          fontWeight: '400',
          lineHeight: '1.2',
        },
        code: {
          fontFamily: FONT_MONO,
          fontSize: '13px',
          lineHeight: '1.5',
          color: tokens.foreground,
          fontWeight: '400',
          backgroundColor: tokens.card,
          wrap: false,
        },
        links: {
          color: tokens.flare,
          visited: tokens.flare,
          hover: tokens.flare,
          textDecoration: 'underline',
          hoverTextDecoration: 'underline',
        },
      },
      sidebar: {
        backgroundColor: tokens.sidebar,
        textColor: tokens.sidebarForeground,
        activeTextColor: tokens.flare,
      },
      rightPanel: {
        backgroundColor: tokens.card,
        textColor: tokens.foreground,
      },
      codeBlock: {
        backgroundColor: tokens.card,
      },
      fab: {
        backgroundColor: tokens.flare,
        color: tokens.paper,
      },
      colors: {
        primary: { main: tokens.flare, contrastText: tokens.paper },
        success: { main: tokens.success, contrastText: tokens.paper },
        error: { main: tokens.destructive, contrastText: tokens.paper },
        warning: { main: tokens.flare, contrastText: tokens.paper },
        border: { light: tokens.border, dark: tokens.border },
        text: {
          primary: tokens.foreground,
          secondary: tokens.mutedForeground,
        },
      },
    },
  };
}

/** Light theme — hex lifted from shukka `:root`. */
export const redocLightOptions = buildRedocOptions({
  foreground: '#26251e',
  card: '#f2f1ed',
  sidebar: '#f2f1ed',
  sidebarForeground: '#26251e',
  flare: '#f54e00',
  paper: '#f7f7f4',
  destructive: '#cf2d56',
  success: '#1f8a65',
  // color-mix(in oklab, #26251e 60%, transparent) over #f7f7f4 ≈ #8a8a7e
  mutedForeground: '#8a8a7e',
  // color-mix(in oklab, #26251e 10%, transparent) over #f7f7f4 ≈ #e8e8e3
  border: '#e8e8e3',
});

/** Dark theme — hex lifted from shukka `.dark`. */
export const redocDarkOptions = buildRedocOptions({
  foreground: '#edecec',
  card: '#1b1913',
  sidebar: '#1b1913',
  sidebarForeground: '#edecec',
  flare: '#f97316',
  paper: '#14120b',
  destructive: '#d24d6e',
  success: '#34a37e',
  // color-mix(in oklab, #edecec 60%, transparent) over #14120b ≈ #6a6a64
  mutedForeground: '#6a6a64',
  // color-mix(in oklab, #edecec 12%, transparent) over #14120b ≈ #2a2820
  border: '#2a2820',
});
