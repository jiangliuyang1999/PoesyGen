export type ApplicationView = 'create' | 'history' | 'patterns' | 'dictionary';

interface MobileAppChromeProps {
  readonly activeView: ApplicationView;
  readonly generationAvailable: boolean;
  readonly hasLoadedPatterns: boolean;
  readonly onSelectView: (view: ApplicationView) => void;
}

const navigationItems: ReadonlyArray<{
  readonly view: ApplicationView;
  readonly label: string;
}> = [
  { view: 'create', label: '创作' },
  { view: 'history', label: '历史' },
  { view: 'patterns', label: '词谱' },
  { view: 'dictionary', label: '字典' },
];

export function MobileAppChrome({
  activeView,
  generationAvailable,
  hasLoadedPatterns,
  onSelectView,
}: MobileAppChromeProps) {
  const serviceLabel = generationAvailable
    ? '服务就绪'
    : hasLoadedPatterns
      ? '服务未就绪'
      : '连接中';

  return (
    <>
      <header className="mobile-app-header">
        <button
          className="mobile-app-brand"
          type="button"
          onClick={() => onSelectView('create')}
          aria-label="返回创作页"
        >
          <span>词</span>
          <strong>PoesyGen</strong>
        </button>
        <span className="mobile-service-status" title={serviceLabel}>
          <i data-ready={generationAvailable} />
          {serviceLabel}
        </span>
      </header>

      <nav className="mobile-tabbar" aria-label="手机端导航">
        {navigationItems.map((item) => {
          const active = item.view === activeView;
          return (
            <button
              key={item.view}
              type="button"
              data-active={active}
              {...(active ? { 'aria-current': 'page' as const } : {})}
              onClick={() => onSelectView(item.view)}
            >
              <MobileTabIcon view={item.view} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

function MobileTabIcon({ view }: { readonly view: ApplicationView }) {
  if (view === 'create') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20l4.2-1 10.4-10.4a2.2 2.2 0 0 0-3.2-3.2L5 15.8 4 20Z" />
        <path d="m13.8 7 3.2 3.2" />
      </svg>
    );
  }

  if (view === 'history') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 8.5A8 8 0 1 1 4 14" />
        <path d="M4.8 4v4.5H9" />
        <path d="M12 8v4.5l3 1.8" />
      </svg>
    );
  }

  if (view === 'patterns') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5c2.8-.8 5.5-.2 8 1.6v12c-2.5-1.8-5.2-2.4-8-1.6v-12Z" />
        <path d="M20 5.5c-2.8-.8-5.5-.2-8 1.6v12c2.5-1.8 5.2-2.4 8-1.6v-12Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h8.5A2.5 2.5 0 0 1 16 7v12H7.5A2.5 2.5 0 0 1 5 16.5v-12Z" />
      <path d="M8 8h5M8 11h5M8 14h3" />
      <path d="m16 15 3.5 3.5M18.5 13.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />
    </svg>
  );
}
