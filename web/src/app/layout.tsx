import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Jost } from 'next/font/google';
import { PageTransitionProvider } from '@/components/page-transition';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { MainContentWrapper } from '@/components/main-wrapper';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

// Typefaces: Integral CF Bold for headings (`font-heading`), Futura for all other text
// (`font-body` / `font-sans`, defined as --font-body in globals.css).
// Futura is commercial and isn't bundled; where the OS lacks it, Jost (an
// open-source Futura-style face) is the fallback, loaded here as --font-jost.
const jost = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

// Integral CF by Lettersoup (https://www.fontspring.com/fonts/lettersoup/integral-cf).
// FONTSPRING DEMO build: for personal/evaluation use only; a commercial license is
// required otherwise. adjustFontFallback is off so characters outside the demo's
// real glyphs fall back to the body font rather than a metrics-adjusted Arial.
const integral = localFont({
  src: './fonts/IntegralCF-Bold-Demo.otf',
  weight: '700',
  variable: '--font-integral',
  display: 'swap',
  adjustFontFallback: false,
  // The demo only has real glyphs for space , . 0-3 5-9 : ; ? A-Z a-z; every other
  // character (& - ' ! / 4 …) is a "DEMO" watermark. Limiting the face to the real
  // glyphs makes the browser fall back to the body font for the rest.
  declarations: [
    {
      prop: 'unicode-range',
      value: 'U+0020, U+002C, U+002E, U+0030-0033, U+0035-003B, U+003F, U+0041-005A, U+0061-007A',
    },
  ],
});

export const metadata: Metadata = {
  title: 'Bookdrop - Modern Library Circulation Portal',
  description: 'Enterprise library circulation system with real-time holds, waitlists, loans, returns, and fine tracking.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jost.variable} ${integral.variable} antialiased min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans`}
      >
        <PageTransitionProvider>
          <AuthProvider>
            <Navbar />
            <MainContentWrapper>
              {children}
            </MainContentWrapper>
            <Footer />
          </AuthProvider>
        </PageTransitionProvider>
      </body>
    </html>
  );
}
