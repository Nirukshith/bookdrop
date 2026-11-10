import type { Metadata } from 'next';
import localFont from 'next/font/local';
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans`}
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
