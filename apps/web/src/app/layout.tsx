// apps/web/src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: 'Security Headers Analyzer',
    template: '%s | SHA',
  },
  description: 'Security headers analysis — realtime pipeline, D3 visualizations, SSL Labs, VirusTotal, RDAP',
  keywords: ['security', 'headers', 'CSP', 'HSTS', 'TLS', 'analyzer', 'cybersecurity'],
  authors: [{ name: 'SHA Team' }],
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'hsl(222.2 84% 4.9%)',
                color: 'hsl(210 40% 98%)',
                border: '1px solid hsl(217.2 32.6% 17.5%)',
                borderRadius: '12px',
              },
              success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
