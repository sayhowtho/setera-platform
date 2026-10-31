import './tokens.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/marketing/Footer';
import { EmilyWidgetProvider } from '@/components/marketing/EmilyWidget';
import JsonLd from '@/components/marketing/JsonLd';
import { organizationLd } from '@/lib/seo';

// Shared shell for every public marketing page: nav, footer and the Emily
// widget. The widget lives here (not in pages) so it's on every page and
// stays mounted across client-side navigation.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <EmilyWidgetProvider>
      <JsonLd data={organizationLd()} />
      <Navbar />
      {children}
      <Footer />
    </EmilyWidgetProvider>
  );
}
