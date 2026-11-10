// 頁面標題列：H1 與說明在左，頁面動作在右（原型 prototype.css 的 .page-head、.page-actions）。
// 767 px 以下動作區寬 100%，每個按鈕滿版、依 DOM 順序上下堆疊，所以主要按鈕要放第一個；位置在標題下方、工具列上方。
export function PageHead({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-[1_1_280px]">
        <h1 className="type-2xl-bold text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:*:flex-[1_1_100%]">{actions}</div> : null}
    </header>
  );
}
