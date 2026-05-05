import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'ohz — Bundle Optimizer',
  description: 'Bundle intelligence for TikTok Live shops',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
