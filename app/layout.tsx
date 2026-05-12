import type { Metadata } from 'next'
import './globals.css'
import { AppSidebar } from '@/components/AppSidebar'
import { AppTopbar } from '@/components/AppTopbar'
import { HelpNavigator } from '@/components/HelpNavigator'

export const metadata: Metadata = {
  title: 'AI RFP Agent — Enterprise Knowledge',
  description: 'AI-powered RFP response generation grounded in your internal knowledge base.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,400..500&family=Geist:wght@300..600&family=Geist+Mono:wght@400..500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app">
          <AppSidebar />
          <div className="main">
            <AppTopbar />
            <div className="content">
              {children}
            </div>
          </div>
        </div>
        <HelpNavigator />
      </body>
    </html>
  )
}
