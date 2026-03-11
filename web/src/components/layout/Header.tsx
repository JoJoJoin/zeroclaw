import { useLocation } from 'react-router-dom';
import { t } from '@/lib/i18n';
import { useLocaleContext } from '@/App';

const routeTitles: Record<string, string> = {
  '/': 'nav.dashboard',
  '/agent': 'nav.agent',
  '/tools': 'nav.tools',
  '/cron': 'nav.cron',
  '/integrations': 'nav.integrations',
  '/memory': 'nav.memory',
  '/config': 'nav.config',
  '/cost': 'nav.cost',
  '/logs': 'nav.logs',
  '/doctor': 'nav.doctor',
};

export default function Header() {
  const location = useLocation();
  const { locale, setAppLocale } = useLocaleContext();

  const titleKey = routeTitles[location.pathname] ?? 'nav.dashboard';
  const pageTitle = t(titleKey);

  const cycleLanguage = () => {
    const order = ['en', 'zh', 'tr'] as const;
    const idx = order.indexOf(locale as typeof order[number]);
    setAppLocale(order[(idx + 1) % order.length]);
  };

  const localeLabel: Record<string, string> = { en: 'EN', zh: '中文', tr: 'TR' };

  return (
    <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      {/* Page title */}
      <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>

      {/* Right-side controls */}
      <div className="flex items-center gap-4">
        {/* Language switcher */}
        <button
          type="button"
          onClick={cycleLanguage}
          className="px-3 py-1 rounded-md text-sm font-medium border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          {localeLabel[locale] ?? 'EN'}
        </button>
      </div>
    </header>
  );
}
