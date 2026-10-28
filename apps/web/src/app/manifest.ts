import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} · game night tracker`,
    short_name: APP_NAME,
    description: 'Keep score at teen patti night. Works offline.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0705',
    theme_color: '#0A0705',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
