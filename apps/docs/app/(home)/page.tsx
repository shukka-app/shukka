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

export const metadata: Metadata = {
  title: {
    absolute: 'Shukka',
  },
  description:
    '自行托管桌面应用的自动更新。安装包存放于自有对象存储，由你决定何时向用户开放新版本。',
};

const heading = {
  h2: 'font-medium tracking-tight text-3xl lg:text-4xl',
  h3: 'font-medium tracking-tight text-xl lg:text-2xl',
};

const button = {
  base: 'inline-flex justify-center px-5 py-3 rounded-full font-medium tracking-tight transition-colors',
  primary: 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90',
  secondary: 'border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent',
};

export default async function HomePage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <TryItOut />
      <Features />
      <HowItWorks />
      <StartHere />
      <Cta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto w-full max-w-[1400px] px-6 py-20 sm:px-8 md:px-12 md:py-28">
        <p className="landing-in text-sm italic text-fd-muted-foreground">
          the update feed you host yourself.
        </p>
        <h1 className="landing-in mt-4 max-w-3xl text-4xl font-medium tracking-tight leading-[1.15] sm:text-5xl lg:text-[4.25rem] [animation-delay:80ms]">
          自行托管桌面应用的
          <br />
          <span className="text-fd-muted-foreground">自动更新。</span>
        </h1>
        <div className="landing-in mt-8 flex flex-col gap-3 sm:flex-row [animation-delay:140ms]">
          <Link href="/docs" className={cn(button.base, button.primary)}>
            开始阅读
          </Link>
          <Link href="/api" className={cn(button.base, button.secondary)}>
            查看 API
          </Link>
        </div>
        <p className="landing-in mt-10 max-w-2xl text-fd-muted-foreground leading-relaxed [animation-delay:200ms]">
          Shukka 给 Electron 与 Tauri 桌面应用提供公开更新源。安装包写入自有对象存储，由网页决定何时向用户开放新版本，而无须把安装包交给第三方更新服务保管。
        </p>
      </div>
    </section>
  );
}

async function TryItOut() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 pb-16 sm:px-8 md:px-12 md:pb-24">
      <h2 className={cn(heading.h2, 'mb-8')}>试一下。</h2>
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
        <SetupAnimation className="min-h-56 rounded-2xl border bg-fd-card text-fd-card-foreground" />
      </div>
    </section>
  );
}

function Features() {
  const items = [
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
      body: '一把 Docker，数据在 /data。单管理员，没有注册，没有多租户。',
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
      <p className="text-sm italic text-fd-muted-foreground">自己的更新，自己的桶。</p>
      <h2 className={cn(heading.h2, 'mt-3 max-w-2xl')}>为自托管而做。</h2>
      <p className="mt-4 max-w-2xl text-fd-muted-foreground leading-relaxed">
        面板管应用、渠道与版本；公开 feed 给已安装的客户端。安装包始终在你的桶里。
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
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

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: '部署实例',
      body: '用公开镜像跑起来，挂一个持久卷到 /data。打开页面，设置管理员密码。',
      href: '/docs/deployment',
      link: '自托管部署',
    },
    {
      n: '02',
      title: '接入客户端',
      body: '创建应用并配好对象存储。把 feed URL 写进 electron-builder 或 Tauri updater。',
      href: '/docs/integration/electron',
      link: '客户端集成',
    },
    {
      n: '03',
      title: '发布版本',
      body: 'CI 把构建产物传上去，默认留下草稿。面板确认后，已安装的用户才会收到。',
      href: '/docs/ci',
      link: 'CI 发布',
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
      <h2 className={cn(heading.h2)}>三步用起来。</h2>
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {steps.map((step) => (
          <div key={step.n} className="rounded-2xl border bg-fd-card p-6">
            <p className="font-mono text-xs text-fd-muted-foreground">{step.n}</p>
            <h3 className={cn(heading.h3, 'mt-3')}>{step.title}</h3>
            <p className="mt-3 text-sm text-fd-muted-foreground leading-relaxed">{step.body}</p>
            <Link
              href={step.href}
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

function StartHere() {
  const cards = [
    {
      href: '/docs/deployment',
      title: '自托管部署',
      body: 'Docker 或源码，反向代理、对象存储与备份。',
    },
    {
      href: '/docs/guide',
      title: '使用指南',
      body: '应用、渠道、发布、API 密钥与发布日志。',
    },
    {
      href: '/docs/integration/electron',
      title: 'Electron',
      body: '把 electron-updater 指到 Shukka 的 generic feed。',
    },
    {
      href: '/docs/integration/tauri',
      title: 'Tauri',
      body: '把 plugin-updater 的 endpoints 指到同一套 feed。',
    },
    {
      href: '/docs/ci',
      title: 'CI 发布',
      body: 'GitHub Action 或零依赖脚本，把构建目录发上去。',
    },
    {
      href: '/api',
      title: 'API 参考',
      body: '上传协议、App API，以及公开的更新 feed。',
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-8 md:px-12 md:py-24">
      <h2 className={cn(heading.h2)}>从这里开始。</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
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

function Cta() {
  return (
    <section className="border-t">
      <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-6 py-16 sm:px-8 md:grid-cols-[1fr_auto] md:items-end md:px-12 md:py-24">
        <div>
          <h2 className={cn(heading.h2)}>开始阅读文档</h2>
          <p className="mt-3 text-fd-muted-foreground italic">
            light and self-hosted, just like your own bucket.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li>
              <span className="font-medium">一把 Docker。</span>
              <span className="text-fd-muted-foreground"> 公开镜像，数据在 /data。</span>
            </li>
            <li>
              <span className="font-medium">安装包直传对象存储。</span>
              <span className="text-fd-muted-foreground"> Shukka 不中转字节。</span>
            </li>
            <li>
              <span className="font-medium">开源，MIT。</span>
              <span className="text-fd-muted-foreground"> 源码在 GitHub。</span>
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
          <Link href="/docs" className={cn(button.base, button.primary)}>
            阅读文档
          </Link>
          <a
            href="https://github.com/shukka-app/shukka"
            className={cn(button.base, button.secondary)}
          >
            打开 GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
