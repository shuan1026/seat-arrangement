// Alert（03-components.md Alert：Anatomy、Container、Layout、Typography）。行內提示，不是對話框。
// --card、--border、radius-lg、只有 edge-highlight；padding X 16px Y 12px；16px 圖示欄 + 內容欄、間距 12px。
// 標題 Text-sm/Medium、副標 Text-sm/Regular、內文與清單 Text-sm/Light，都用 --foreground；清單縮排在內容欄內。
// 本身沒有 hover，只有裡面的動作按鈕有。
import type { ComponentProps, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from './cn';

export interface AlertSection {
  subtitle?: ReactNode;
  /** 條列內容；或用 body 放一段文字 */
  items?: ReactNode[];
  body?: ReactNode;
}

export interface AlertProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode;
  /** 16px 圖示，預設 info；警告用 <TriangleAlert /> */
  icon?: ReactNode;
  /** 一段內文（docs 的「內文」） */
  children?: ReactNode;
  /** 標題下的條列 */
  items?: ReactNode[];
  /** 分組：副標 + 條列，可重複 */
  sections?: AlertSection[];
  /** 動作按鈕（Button link／outline sm） */
  actions?: ReactNode;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 type-sm-light text-foreground marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="[overflow-wrap:anywhere]">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Alert({ title, icon, children, items, sections, actions, className, role = 'note', ...props }: AlertProps) {
  return (
    <div
      role={role}
      className={cn(
        'grid min-w-0 max-w-full grid-cols-[16px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card px-4 py-3 text-foreground edge-top',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="mt-0.5 inline-flex size-4 text-foreground [&_svg]:size-4">
        {icon ?? <Info />}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="type-sm-medium [overflow-wrap:anywhere]">{title}</div>
        {children ? <div className="type-sm-light [overflow-wrap:anywhere]">{children}</div> : null}
        {items?.length ? <List items={items} /> : null}
        {sections?.map((s, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            {s.subtitle ? <div className="type-sm-regular">{s.subtitle}</div> : null}
            {s.body ? <div className="type-sm-light [overflow-wrap:anywhere]">{s.body}</div> : null}
            {s.items?.length ? <List items={s.items} /> : null}
          </div>
        ))}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
