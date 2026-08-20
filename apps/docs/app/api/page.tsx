import type { Metadata } from 'next';
import { RedocClient } from './redoc-client';

export const metadata: Metadata = {
  title: 'API 参考',
  description:
    'Shukka 的 OpenAPI 参考：API key（或面板 session）可调用的 App API、上传协议，以及公开无鉴权的更新 feed 与 release notes 接口。',
};

export default function ApiReferencePage() {
  return <RedocClient />;
}
