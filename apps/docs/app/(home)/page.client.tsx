'use client';

import { type HTMLAttributes, type ReactElement, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const installCmd =
  'docker run -d --name shukka -p 3000:3000 -v shukka-data:/data ghcr.io/shukka-app/shukka';

export function SetupAnimation(props: HTMLAttributes<HTMLDivElement>) {
  const tickTime = 80;
  const timeCommandEnter = installCmd.length;
  const timeCommandRun = timeCommandEnter + 4;
  const timeWindowOpen = timeCommandRun + 8;
  const timeEnd = timeWindowOpen + 2;

  const [tick, setTick] = useState(timeEnd);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) {
      setTick(timeEnd);
      return;
    }

    const timer = window.setInterval(() => {
      setTick((prev) => (prev >= timeEnd ? prev : prev + 1));
    }, tickTime);

    return () => window.clearInterval(timer);
  }, [timeEnd]);

  const lines: ReactElement[] = [
    <span key="cmd">
      {installCmd.slice(0, tick)}
      {tick < timeCommandEnter && (
        <span className="inline-block w-1.5 h-3.5 align-[-1px] bg-fd-primary animate-[landing-caret_1s_step-end_infinite]" />
      )}
    </span>,
  ];

  if (tick >= timeCommandEnter) {
    lines.push(<span key="blank" />);
  }

  if (tick > timeCommandRun) {
    lines.push(
      <span key="setup" className="flex flex-col gap-1">
        {tick > timeCommandRun + 1 && (
          <>
            <span>
              <span className="text-fd-muted-foreground">◇</span> 打开面板
            </span>
            <span className="text-fd-muted-foreground">│ http://localhost:3000</span>
          </>
        )}
        {tick > timeCommandRun + 3 && (
          <>
            <span className="text-fd-muted-foreground">│</span>
            <span>
              <span className="text-fd-muted-foreground">◆</span> 设置管理员密码
            </span>
          </>
        )}
        {tick > timeCommandRun + 5 && (
          <span className="text-fd-muted-foreground">│ ● 至少 8 位</span>
        )}
      </span>,
    );
  }

  return (
    <div
      {...props}
      className={cn('relative', props.className)}
      onMouseEnter={() => {
        if (tick >= timeEnd) setTick(0);
      }}
    >
      {tick > timeWindowOpen && <ReadyWindow />}
      <pre className="overflow-auto text-[13px] leading-relaxed p-4">
        <div
          className="mb-4 w-fit px-2 py-px rounded-full border text-xs text-fd-muted-foreground"
          aria-hidden
        >
          Terminal
        </div>
        <div className="flex flex-col gap-2">{lines}</div>
      </pre>
    </div>
  );
}

function ReadyWindow() {
  return (
    <div className="absolute right-3 top-3 z-10 animate-[landing-in_0.45s_ease_both] rounded-xl border bg-fd-background px-3 py-2 text-xs shadow-none">
      <div className="flex items-center gap-2 text-fd-muted-foreground">
        <span className="size-1.5 rounded-full bg-[var(--success)]" />
        localhost:3000
      </div>
      <p className="mt-1 font-medium">面板已就绪</p>
    </div>
  );
}
