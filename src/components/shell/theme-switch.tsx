'use client';

// Header 的介面配色鈕（docs/spec/README.md COM-R17、COM-R18、第 14 節「介面配色」文案；決策 D-020）。
// 設計系統 03-components.md「Palette Switch」：Icon Button（Lucide palette、名稱「介面配色」）開 Dropdown Menu，對齊按鈕右緣；
// 最上面是 Text-xs/Regular 淡色標題，下面每種配色一列 menuitemradio：16 px 圓形色塊（--theme-swatch-*、1px solid var(--border)）、
// 名稱、目前的配色右邊打勾。選了立即套用、選單關閉、焦點回到按鈕，info Sonner；選了目前的配色只關閉選單。
// 目前的配色看 <html data-theme>（根版面的 inline script 在第一次繪製前設好），桌面與手機 Header 的兩個按鈕一起更新。
import { Check, Palette } from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { useSyncExternalStore } from 'react';
import { currentTheme, setTheme, subscribeTheme, type Theme } from '@/client/theme';
import { cn } from '@/components/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { notify } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';

const LABEL = '介面配色';

const OPTIONS: { value: Theme; name: string; swatch: string; switched: string }[] = [
  { value: 'light', name: '淺色', swatch: 'bg-(image:--theme-swatch-vivid)', switched: '已切換為淺色。' },
  { value: 'dark', name: '深色', swatch: 'bg-(image:--theme-swatch-dark)', switched: '已切換為深色。' },
];

/** 伺服器不知道這個瀏覽器的選擇，先當淺色；掛上後依 <html data-theme> 更新 */
const serverTheme = (): Theme => 'light';

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);

  const choose = (value: string) => {
    const next = OPTIONS.find((o) => o.value === value);
    // 選了目前的配色：只關閉選單（Radix 選了項目就會關閉、焦點回到按鈕），不顯示 Sonner
    if (!next || next.value === currentTheme()) return;
    setTheme(next.value);
    notify(next.switched, { type: 'info' });
  };

  return (
    // 非 modal：同 Header 其他選單，開著時其他區塊仍在無障礙樹上；點外面、Esc 照樣關閉
    <DropdownMenu modal={false}>
      <Tooltip content={LABEL} side="bottom">
        <DropdownMenuTrigger asChild>
          <IconButton label={LABEL} size="sm">
            <Palette />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{LABEL}</DropdownMenuLabel>
        <MenuPrimitive.RadioGroup value={theme} onValueChange={choose}>
          {OPTIONS.map((o) => (
            <MenuPrimitive.RadioItem
              key={o.value}
              value={o.value}
              className={cn(
                'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left type-sm-regular outline-none select-none',
                'text-popover-foreground data-highlighted:bg-hover focus-visible:shadow-none',
              )}
            >
              <span aria-hidden className={cn('size-4 shrink-0 rounded-full border border-border bg-cover', o.swatch)} />
              <span className="min-w-0 flex-1">{o.name}</span>
              <MenuPrimitive.ItemIndicator className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                <Check aria-hidden />
              </MenuPrimitive.ItemIndicator>
            </MenuPrimitive.RadioItem>
          ))}
        </MenuPrimitive.RadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
