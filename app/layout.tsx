import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Quizkväll',
  description:
    'Ett quiz för varje tillfälle. Bilda lag, lås svaret och följ ställningen.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className="dark">
      <body>{children}</body>
    </html>
  );
}
