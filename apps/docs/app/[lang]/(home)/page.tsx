import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BoxIcon,
  CloudUploadIcon,
  ContainerIcon,
  FilePenLineIcon,
  RssIcon,
  ServerIcon,
} from 'lucide-react';
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { cn } from '@/lib/cn';
import { SetupAnimation } from './page.client';

const dockerCmd = `docker run -d --name shukka \\
  -p 3000:3000 \\
  -v shukka-data:/data \\
  ghcr.io/shukka-app/shukka`;

const heading = {
  h2: 'font-medium tracking-tight text-3xl lg:text-4xl',
  h3: 'font-medium tracking-tight text-xl lg:text-2xl',
};

const button = {
  base: 'inline-flex justify-center px-5 py-3 rounded-full font-medium tracking-tight transition-colors',
  primary: 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90',
  secondary: 'border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent',
};

const pages = {
  'zh-CN': {
    metadata: {
      title: { absolute: 'Shukka' } as const,
      description:
        '自行托管桌面应用的自动更新。安装包存放于自有对象存储，由你决定何时向用户开放新版本。',
    },
    eyebrow: 'the update feed you host yourself.',
    heroTitle: (
      <>
        自行托管桌面应用的
        <br />
        <span className="text-fd-muted-foreground">自动更新。</span>
      </>
    ),
    readDocs: '开始阅读',
    viewApi: '查看 API',
    heroBody:
      'Shukka 给 Electron 与 Tauri 桌面应用提供公开更新源。安装包写入自有对象存储，由网页决定何时向用户开放新版本，而无须把安装包交给第三方更新服务保管。',
    tryIt: '试一下。',
    featuresEyebrow: '自己的更新，自己的桶。',
    featuresTitle: '为自托管而做。',
    featuresLead: '面板管应用、渠道与版本；公开 feed 给已安装的客户端。安装包始终在你的桶里。',
    features: [
      {
        icon: BoxIcon,
        title: '自有对象存储',
        body: '每个应用各自配置 S3。AWS、Cloudflare R2 与 MinIO 可以并存。',
      },
      {
        icon: CloudUploadIcon,
        title: '安装包不经中转',
        body: 'CI 用预签名 URL 直传对象存储。Shukka 不接触安装包内容。',
      },
      {
        icon: RssIcon,
        title: '公开更新源',
        body: 'electron-updater 与 Tauri updater 按原有方式检查更新，客户端无须凭证。',
      },
      {
        icon: FilePenLineIcon,
        title: '上传默认草稿',
        body: '版本上传后不会立刻对用户开放。确认后才切换当前版本。',
      },
      {
        icon: ContainerIcon,
        title: 'GitHub Action',
        body: '一步把构建目录发布上去：安装包、blockmap，以及每一份 latest*.yml。',
      },
      {
        icon: ServerIcon,
        title: '单机自托管',
        body: 'Docker 容器，数据在 /data。单管理员，没有注册，没有多租户。',
      },
    ],
    howTitle: '三步用起来。',
    steps: [
      {
        n: '01',
        title: '部署实例',
        body: '用公开镜像跑起来，挂一个持久卷到 /data。打开页面，设置管理员密码。',
        path: '/docs/deployment',
        link: '自托管部署',
      },
      {
        n: '02',
        title: '接入客户端',
        body: '创建应用并配好对象存储。把 feed URL 写进 electron-builder 或 Tauri updater。',
        path: '/docs/integration/electron',
        link: '客户端集成',
      },
      {
        n: '03',
        title: '发布版本',
        body: 'CI 把构建产物传上去，默认留下草稿。面板确认后，已安装的用户才会收到。',
        path: '/docs/ci',
        link: 'CI 发布',
      },
    ],
    startTitle: '从这里开始。',
    cards: [
      {
        path: '/docs/deployment',
        title: '自托管部署',
        body: 'Docker 或源码，反向代理、对象存储与备份。',
      },
      {
        path: '/docs/guide',
        title: '使用指南',
        body: '应用、渠道、发布、API 密钥与发布日志。',
      },
      {
        path: '/docs/integration/electron',
        title: 'Electron',
        body: '把 electron-updater 指到 Shukka 的 generic feed。',
      },
      {
        path: '/docs/integration/tauri',
        title: 'Tauri',
        body: '把 plugin-updater 的 endpoints 指到同一套 feed。',
      },
      {
        path: '/docs/ci',
        title: 'CI 发布',
        body: 'GitHub Action 或零依赖脚本，把构建目录发上去。',
      },
      {
        path: '/api',
        title: 'API 参考',
        body: '上传协议、App API，以及公开的更新 feed。',
      },
    ],
    ctaTitle: '开始阅读文档',
    ctaItalic: 'light and self-hosted, just like your own bucket.',
    ctaItems: [
      { strong: 'Docker 部署。', rest: ' 公开镜像，数据在 /data。' },
      { strong: '安装包直传对象存储。', rest: ' Shukka 不中转字节。' },
      { strong: '开源，MIT。', rest: ' 源码在 GitHub。' },
    ],
    readDocsLong: '阅读文档',
    openGithub: '打开 GitHub',
  },
  'en-US': {
    metadata: {
      title: { absolute: 'Shukka' } as const,
      description:
        'Self-host automatic updates for desktop apps. Installers stay in your own object storage, and you decide when a new version is offered to users.',
    },
    eyebrow: 'the update feed you host yourself.',
    heroTitle: (
      <>
        Self-host automatic updates
        <br />
        <span className="text-fd-muted-foreground">for desktop apps.</span>
      </>
    ),
    readDocs: 'Read the docs',
    viewApi: 'View API',
    heroBody:
      'Shukka is a public update feed for Electron and Tauri desktop apps. Installers are written to your own object storage. The web UI decides when a new version is available, without handing installers to a third-party update service.',
    tryIt: 'Try it.',
    featuresEyebrow: 'Your updates. Your bucket.',
    featuresTitle: 'Built for self-hosting.',
    featuresLead:
      'The panel manages apps, channels, and versions. The public feed serves installed clients. Installers stay in your bucket.',
    features: [
      {
        icon: BoxIcon,
        title: 'Your own object storage',
        body: 'Each app has its own S3 config. AWS, Cloudflare R2, and MinIO can coexist.',
      },
      {
        icon: CloudUploadIcon,
        title: 'Installers never transit Shukka',
        body: 'CI uploads to object storage with presigned URLs. Shukka never touches installer contents.',
      },
      {
        icon: RssIcon,
        title: 'Public update feed',
        body: 'electron-updater and the Tauri updater check for updates as they already do. Clients need no credentials.',
      },
      {
        icon: FilePenLineIcon,
        title: 'Uploads stay drafts',
        body: 'A version is not offered to users on upload. You confirm before switching the current version.',
      },
      {
        icon: ContainerIcon,
        title: 'GitHub Action',
        body: 'Publish a build directory in one step: installers, blockmaps, and every latest*.yml.',
      },
      {
        icon: ServerIcon,
        title: 'Single-host self-hosting',
        body: 'A Docker container. Data in /data. One admin. No signup. No multi-tenant.',
      },
    ],
    howTitle: 'Three steps.',
    steps: [
      {
        n: '01',
        title: 'Deploy an instance',
        body: 'Run the public image, mount a persistent volume at /data, open the page, and set an admin password.',
        path: '/docs/deployment',
        link: 'Self-hosting',
      },
      {
        n: '02',
        title: 'Connect a client',
        body: 'Create an app and configure object storage. Put the feed URL in electron-builder or the Tauri updater.',
        path: '/docs/integration/electron',
        link: 'Client integration',
      },
      {
        n: '03',
        title: 'Publish a version',
        body: 'CI uploads build artifacts as a draft. Installed users only see it after you confirm in the panel.',
        path: '/docs/ci',
        link: 'CI publishing',
      },
    ],
    startTitle: 'Start here.',
    cards: [
      {
        path: '/docs/deployment',
        title: 'Self-hosting',
        body: 'Docker or source, reverse proxy, object storage, and backups.',
      },
      {
        path: '/docs/guide',
        title: 'User guide',
        body: 'Apps, channels, publishing, API keys, and release notes.',
      },
      {
        path: '/docs/integration/electron',
        title: 'Electron',
        body: 'Point electron-updater at Shukka’s generic feed.',
      },
      {
        path: '/docs/integration/tauri',
        title: 'Tauri',
        body: 'Point plugin-updater endpoints at the same feed.',
      },
      {
        path: '/docs/ci',
        title: 'CI publishing',
        body: 'GitHub Action or a zero-dependency script to upload a build directory.',
      },
      {
        path: '/api',
        title: 'API reference',
        body: 'Upload protocol, App APIs, and the public update feed.',
      },
    ],
    ctaTitle: 'Read the docs',
    ctaItalic: 'light and self-hosted, just like your own bucket.',
    ctaItems: [
      { strong: 'Docker deploy.', rest: ' Public image. Data in /data.' },
      { strong: 'Installers go straight to object storage.', rest: ' Shukka does not proxy bytes.' },
      { strong: 'Open source, MIT.', rest: ' Source is on GitHub.' },
    ],
    readDocsLong: 'Read the docs',
    openGithub: 'Open GitHub',
  },
} as const;

export async function generateMetadata(props: PageProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await props.params;
  return {
    ...(pages[lang as keyof typeof pages] ?? pages['en-US']).metadata,
    openGraph: {
      images: [{ url: '/og.png', width: 2560, height: 1280 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og.png'],
    },
  };
}

export default async function HomePage(props: PageProps<'/[lang]'>) {
  const { lang } = await props.params;
  const t = pages[lang as keyof typeof pages] ?? pages['en-US'];
  const href = (path: string) => `/${lang}${path}`;

  return (
    <div className="flex flex-col">
      <Hero locale={lang} />
      <TryItOut locale={lang} />
      <Features locale={lang} />
      <HowItWorks locale={lang} />
      <StartHere locale={lang} />
      <Cta locale={lang} />
    </div>
  );

  function Hero({ locale }: { locale: string }) {
    return (
      <section className="relative overflow-hidden">
        <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1400px] px-6 py-20 sm:px-8 md:px-12 md:py-28">
          <p className="landing-in text-sm italic text-fd-muted-foreground">{t.eyebrow}</p>
          <h1 className="landing-in mt-4 max-w-3xl text-4xl font-medium tracking-tight leading-[1.15] sm:text-5xl lg:text-[4.25rem] [animation-delay:80ms]">
            {t.heroTitle}
          </h1>
          <div className="landing-in mt-8 flex flex-col gap-3 sm:flex-row [animation-delay:140ms]">
            <Link href={href('/docs')} className={cn(button.base, button.primary)}>
              {t.readDocs}
            </Link>
            <Link href={href('/api')} className={cn(button.base, button.secondary)}>
              {t.viewApi}
            </Link>
          </div>
          <p className="landing-in mt-10 max-w-2xl text-fd-muted-foreground leading-relaxed [animation-delay:200ms]">
            {t.heroBody}
          </p>
        </div>
      </section>
    );
  }

  async function TryItOut({ locale }: { locale: string }) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-6 pb-16 sm:px-8 md:px-12 md:pb-24">
        <h2 className={cn(heading.h2, 'mb-8')}>{t.tryIt}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border bg-fd-card p-2">
            <ServerCodeBlock
              lang="bash"
              code={dockerCmd}
              codeblock={{
                title: 'Terminal',
                className: 'bg-transparent border-0 shadow-none',
              }}
            />
          </div>
          <SetupAnimation
            locale={locale}
            className="min-h-56 rounded-2xl border bg-fd-card text-fd-card-foreground"
          />
        </div>
      </section>
    );
  }

  function Features({ locale: _locale }: { locale: string }) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
        <p className="text-sm italic text-fd-muted-foreground">{t.featuresEyebrow}</p>
        <h2 className={cn(heading.h2, 'mt-3 max-w-2xl')}>{t.featuresTitle}</h2>
        <p className="mt-4 max-w-2xl text-fd-muted-foreground leading-relaxed">{t.featuresLead}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {t.features.map((item) => (
            <div key={item.title} className="rounded-2xl border bg-fd-card p-6 text-sm">
              <item.icon className="mb-4 size-5 text-fd-muted-foreground" aria-hidden />
              <h3 className="font-medium tracking-tight">{item.title}</h3>
              <p className="mt-2 text-fd-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function HowItWorks({ locale: _locale }: { locale: string }) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
        <h2 className={cn(heading.h2)}>{t.howTitle}</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {t.steps.map((step) => (
            <div key={step.n} className="rounded-2xl border bg-fd-card p-6">
              <p className="font-mono text-xs text-fd-muted-foreground">{step.n}</p>
              <h3 className={cn(heading.h3, 'mt-3')}>{step.title}</h3>
              <p className="mt-3 text-sm text-fd-muted-foreground leading-relaxed">{step.body}</p>
              <Link
                href={href(step.path)}
                className="mt-5 inline-flex text-sm font-medium tracking-tight underline-offset-4 hover:underline"
              >
                {step.link}
              </Link>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function StartHere({ locale: _locale }: { locale: string }) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
        <h2 className={cn(heading.h2)}>{t.startTitle}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {t.cards.map((card) => (
            <Link
              key={card.path}
              href={href(card.path)}
              className="group rounded-2xl border bg-fd-card p-6 transition-colors hover:bg-fd-accent"
            >
              <h3 className="font-medium tracking-tight">{card.title}</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground leading-relaxed">{card.body}</p>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  function Cta({ locale: _locale }: { locale: string }) {
    return (
      <section className="border-t">
        <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-6 py-16 sm:px-8 md:grid-cols-[1fr_auto] md:items-end md:px-12 md:py-24">
          <div>
            <h2 className={cn(heading.h2)}>{t.ctaTitle}</h2>
            <p className="mt-3 text-fd-muted-foreground italic">{t.ctaItalic}</p>
            <ul className="mt-8 space-y-3 text-sm">
              {t.ctaItems.map((item) => (
                <li key={item.strong}>
                  <span className="font-medium">{item.strong}</span>
                  <span className="text-fd-muted-foreground">{item.rest}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Link href={href('/docs')} className={cn(button.base, button.primary)}>
              {t.readDocsLong}
            </Link>
            <a
              href="https://github.com/shukka-app/shukka"
              className={cn(button.base, button.secondary)}
            >
              {t.openGithub}
            </a>
          </div>
        </div>
      </section>
    );
  }
}
