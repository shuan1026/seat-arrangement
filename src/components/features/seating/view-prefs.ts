'use client';

// 座位安排的檢視偏好（docs/spec/seating.md SEAT-R61、SEAT-R70；SEAT-Q09 的目前假設：跟著這台裝置的瀏覽器，不更新 Header 的儲存狀態）：
// 展開狀態、手動縮放的比例（桌面與手機分開記）、人員面板的收合狀態。
import { useCallback, useState, useSyncExternalStore } from 'react';

const KEY = 'seat-arrangement:seating-view';

export type ViewPrefs = {
  expanded: boolean;
  /** 手動縮放的比例（百分比）；null 是適合視窗 */
  zoomDesktop: number | null;
  zoomMobile: number | null;
  /** 人員面板；null 是沒有手動開關過 */
  panel: boolean | null;
};

const DEFAULTS: ViewPrefs = { expanded: false, zoomDesktop: null, zoomMobile: null, panel: null };

function read(): ViewPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<ViewPrefs>;
    const pct = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      expanded: v.expanded === true,
      zoomDesktop: pct(v.zoomDesktop),
      zoomMobile: pct(v.zoomMobile),
      panel: typeof v.panel === 'boolean' ? v.panel : null,
    };
  } catch {
    return DEFAULTS;
  }
}

/** 掛載後才讀瀏覽器的偏好（伺服器端沒有 localStorage） */
export function useViewPrefs(): [ViewPrefs, (patch: Partial<ViewPrefs>) => void] {
  const [prefs, setPrefs] = useState<ViewPrefs>(read);
  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* 私密模式等情況：只在這次有效 */
      }
      return next;
    });
  }, []);
  return [prefs, update];
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 767 px 以下是手機版面（docs/spec/README.md 第 5 節） */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
/** 人員面板沒有手動開關過時，1024 px 以上預設顯示（SEAT-R61） */
export const useWideDesktop = () => useMediaQuery('(min-width: 1024px)');
