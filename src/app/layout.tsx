// app/layout.tsx
// Why: the persistent app shell — a fixed icon+label sidebar (which also carries the brand
// wordmark and the user profile) and a content column that fills the remaining width and caps
// on very wide monitors so cards stay readable. Fonts are loaded via a plain stylesheet link
// with a strong local fallback stack, so an OFFLINE build never breaks (next/font/google would
// fail without network) — the UI simply falls back to the system sans until the webfont arrives.
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata = {
  title: "Dormant Capital",
  description: "Find, score and route dormant patents to the buyers who want them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="min-w-0 flex-1 px-6 py-7 lg:px-9">
              <div className="mx-auto w-full max-w-[1500px] animate-fade-up">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
