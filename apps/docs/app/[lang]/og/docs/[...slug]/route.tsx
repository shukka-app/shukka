import { redirect } from 'next/navigation';

export const revalidate = false;

/** Per-page OG used to be generated here; every surface now shares the brand card. */
export function GET() {
  redirect('/og.png');
}
