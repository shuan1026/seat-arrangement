// 合併 className：略過 false／null／undefined，展開陣列與 { class: 條件 } 物件。
// 不處理 Tailwind 類別衝突（沒有 tailwind-merge），覆寫元件內建尺寸時請改用元件的 props。
export type ClassValue = string | number | null | undefined | false | ClassValue[] | { [className: string]: unknown };

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value && value !== 0) return;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else {
      for (const [name, on] of Object.entries(value)) if (on) out.push(name);
    }
  };
  inputs.forEach(walk);
  return out.join(' ');
}
