import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Jost } from 'next/font/google';
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

// Typefaces: Airone for headings (`font-heading`), Futura for all other text
// (`font-body` / `font-sans`, defined as --font-body in globals.css).
// Futura is commercial and isn't bundled; where the OS lacks it, Jost (an
// open-source Futura-style face) is the fallback, loaded here as --font-jost.
const jost = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
});

// Airone by Indieground (https://indieground.net/product/airone-font/).
// DEMO build: free for PERSONAL USE ONLY; a commercial license is required otherwise.
// The demo has only A–Z, a–z, 0–9 and `! . ?`, so headings fall back to the body
// font per character for any other punctuation. adjustFontFallback is off so that
// fallback is the body font rather than a metrics-adjusted Arial.
const airone = localFont({
  src: './fonts/AironeFont-Demo.ttf',
  weight: '400',
  variable: '--font-airone',
  display: 'swap',
  adjustFontFallback: false,
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
        className={`${geistSans.variable} ${geistMono.variable} ${jost.variable} ${airone.variable} antialiased min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans`}
      >
        <AuthProvider>
          <Navbar />
          <MainContentWrapper>
            {children}
          </MainContentWrapper>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
