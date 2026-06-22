import { useEffect } from "react";
import { AppBrand } from "./components/AppBrand";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { AnalysisPage } from "./pages/AnalysisPage";
import { ConfigPage } from "./pages/ConfigPage";
import { HomePage } from "./pages/HomePage";
import { QuickAccessPage } from "./pages/QuickAccessPage";
import { ReadingPage } from "./pages/ReadingPage";
import { TechRadarPage } from "./pages/TechRadarPage";
import { TopicsPage } from "./pages/TopicsPage";
import { applyThemeToDocument, useAppStore, type PageKey } from "./stores/useAppStore";

const PAGE_VIEWS: Record<PageKey, JSX.Element> = {
  home: <HomePage />,
  topics: <TopicsPage />,
  analysis: <AnalysisPage />,
  reading: <ReadingPage />,
  techRadar: <TechRadarPage />,
  quick: <QuickAccessPage />,
  config: <ConfigPage />
};

// 两个能力 part（山海经命名）+ 配置：
//  烛龙·情报 = 自动/被动，定时拉取关注标签 + 重大事件（topics）
//  白泽·分析 = 用户触发，分析公司/股票/政策/URL（analysis）
const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: "topics", label: "烛龙 · 情报" },
  { key: "analysis", label: "白泽 · 分析" },
  { key: "config", label: "配置" }
];

export function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const theme = useAppStore((s) => s.theme);
  const current = NAV_ITEMS.find((item) => item.key === page);
  useDocumentTitle(current && page !== "home" ? current.label : undefined);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <main className="app">
      <header className="topbar">
        <AppBrand onNavigateHome={() => setPage("home")} />
        <div className="topbar-nav">
          <div className="segmented" role="tablist" aria-label="导航">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={page === item.key}
                className={`segmented-button${page === item.key ? " is-active" : ""}`}
                onClick={() => setPage(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-tools">
          <ThemeSwitcher />
        </div>
      </header>
      <div className="app-body">{PAGE_VIEWS[page]}</div>
    </main>
  );
}
