'use client';

// 座位安排的拖移（docs/spec/seating.md 2.1.9、3.3～3.8；docs/architecture.md 第 10.4 節）。
// dnd-kit 負責感應器（滑鼠、觸控長按、鍵盤）、拖曳影像（DragOverlay）與啟動門檻；放在哪裡由這裡自己判斷：
// 用 document.elementFromPoint 找游標底下最近的 [data-drop]。座位圖用 CSS transform 縮放、桌次詳情浮在座位圖上，
// 直接問瀏覽器「游標底下是哪個元素」就不必換算縮放比例，也自然處理被詳情蓋住的桌次。
// 鍵盤拖移沒有游標，改用拖曳影像的中心點。
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type PersonOrigin = 'panel' | 'card' | 'detail' | 'staffCard' | 'staffDetail';
export type DragSource = { kind: 'person'; participantId: number; origin: PersonOrigin } | { kind: 'table'; tableId: number };
export type DropArea = 'map' | 'detail';
export type DropTarget =
  | { kind: 'table'; tableId: number; index?: number; area: DropArea }
  | { kind: 'staff'; area: DropArea }
  | { kind: 'panel' };

export type DragState = {
  source: DragSource | null;
  /** 目前游標底下的放置目標；不能放（例如已滿）時 blocked 為 true */
  target: DropTarget | null;
  blocked: boolean;
  /** 拖曳影像的大小（來源未縮放時的大小）與縮放比例 */
  ghost: { width: number; height: number; scale: number };
};

/** 放置目標的屬性值：table:{n}、row:{n}:{index}、detail:{n}、staff、panel */
export const dropAttr = {
  table: (n: number) => `table:${n}`,
  row: (n: number, index: number) => `row:${n}:${index}`,
  detail: (n: number) => `detail:${n}`,
  staff: 'staff',
  panel: 'panel',
} as const;

function parseDrop(el: Element | null): DropTarget | null {
  const node = el?.closest<HTMLElement>('[data-drop]');
  if (!node) return null;
  const [kind, a, b] = (node.dataset.drop ?? '').split(':');
  const area: DropArea = node.dataset.dropArea === 'detail' ? 'detail' : 'map';
  if (kind === 'table') return { kind: 'table', tableId: Number(a), area: 'map' };
  if (kind === 'row') return { kind: 'table', tableId: Number(a), index: Number(b), area };
  if (kind === 'detail') return { kind: 'table', tableId: Number(a), area: 'detail' };
  if (kind === 'staff') return { kind: 'staff', area };
  if (kind === 'panel') return { kind: 'panel' };
  return null;
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => JSON.stringify(a) === JSON.stringify(b);

const IDLE: DragState = { source: null, target: null, blocked: false, ghost: { width: 0, height: 0, scale: 1 } };

class DragStore {
  private state: DragState = IDLE;
  private readonly listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  set(next: Partial<DragState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((fn) => fn());
  }
}

const StoreContext = createContext<DragStore | null>(null);

/** 讀拖移狀態的一部分；選到的值（淺層比較）改變時才重新繪製 */
export function useDragState<T>(select: (s: DragState) => T): T {
  const store = useContext(StoreContext);
  const cache = useRef<{ state: DragState; value: T } | null>(null);
  const snapshot = (state: DragState): T => {
    const c = cache.current;
    if (c && c.state === state) return c.value;
    const value = select(state);
    if (c && shallowEqual(c.value, value)) {
      cache.current = { state, value: c.value };
      return c.value;
    }
    cache.current = { state, value };
    return value;
  };
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => snapshot(store?.get() ?? IDLE),
    () => snapshot(IDLE),
  );
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
const noopSubscribe = () => () => {};

export const useIsDragging = () => useDragState((s) => s.source !== null);

export type ResolveDrop = (source: DragSource, target: DropTarget) => { target: DropTarget; blocked: boolean } | null;

export interface SeatingDndProps {
  /** 判斷這個目標能不能放：沒有作用時回 null（不顯示放置樣式）；違反規則時 blocked（游標 not-allowed） */
  resolve: ResolveDrop;
  onDrop: (source: DragSource, target: DropTarget) => void;
  /** 拖曳影像的內容 */
  renderOverlay: (source: DragSource) => ReactNode;
  children: ReactNode;
}

export function SeatingDnd({ resolve, onDrop, renderOverlay, children }: SeatingDndProps) {
  const [store] = useState(() => new DragStore());
  const point = useRef<{ x: number; y: number } | null>(null);
  const keyboard = useRef(false);
  const resolveRef = useRef(resolve);
  const dropRef = useRef(onDrop);
  useLayoutEffect(() => {
    resolveRef.current = resolve;
    dropRef.current = onDrop;
  });

  const sensors = useSensors(
    // 滑鼠：移動 4 px 才開始拖，點一下仍是點擊
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // 觸控：長按才開始拖，避免和捲動衝突（docs/architecture.md 第 10.4 節）
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const update = useCallback(() => {
    const { source } = store.get();
    if (!source || !point.current) return;
    const raw = parseDrop(document.elementFromPoint(point.current.x, point.current.y));
    const r = raw ? resolveRef.current(source, raw) : null;
    const target = r?.target ?? null;
    const blocked = r?.blocked ?? false;
    const cur = store.get();
    if (!sameTarget(cur.target, target) || cur.blocked !== blocked) store.set({ target, blocked });
  }, [store]);

  const onPointer = useCallback(
    (e: MouseEvent | PointerEvent | TouchEvent) => {
      const t = 'touches' in e ? (e.touches[0] ?? e.changedTouches[0]) : e;
      if (!t) return;
      point.current = { x: t.clientX, y: t.clientY };
      update();
    },
    [update],
  );

  const stopTracking = useCallback(() => {
    for (const name of ['pointermove', 'mousemove', 'touchmove'] as const) document.removeEventListener(name, onPointer, true);
  }, [onPointer]);

  const handleStart = useCallback(
    (event: DragStartEvent) => {
      const source = event.active.data.current?.source as DragSource | undefined;
      if (!source) return;
      const activator = event.activatorEvent;
      keyboard.current = typeof KeyboardEvent !== 'undefined' && activator instanceof KeyboardEvent;
      const rect = event.active.rect.current.initial;
      const scale = Number(event.active.data.current?.scale ?? 1) || 1;
      const ghost = { width: (rect?.width ?? 0) / scale, height: (rect?.height ?? 0) / scale, scale };
      if (!keyboard.current) {
        const t =
          activator && 'touches' in activator
            ? (activator as TouchEvent).touches[0]
            : (activator as MouseEvent | null);
        point.current = t ? { x: t.clientX, y: t.clientY } : null;
        for (const name of ['pointermove', 'mousemove', 'touchmove'] as const)
          document.addEventListener(name, onPointer, { capture: true, passive: true });
      }
      store.set({ source, target: null, blocked: false, ghost });
    },
    [onPointer, store],
  );

  const handleMove = useCallback(
    (event: DragMoveEvent) => {
      if (!keyboard.current) return;
      const r = event.active.rect.current.translated;
      if (!r) return;
      point.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      update();
    },
    [update],
  );

  const finish = useCallback(
    (drop: boolean) => {
      stopTracking();
      update();
      const { source, target } = store.get();
      store.set(IDLE);
      point.current = null;
      if (drop && source && target) dropRef.current(source, target);
    },
    [stopTracking, store, update],
  );

  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: { draggable: '按空白鍵或 Enter 開始拖移，用方向鍵移動，再按一次放下；按 Esc 取消。' },
      announcements: {
        onDragStart: () => '開始拖移。',
        onDragMove: () => undefined,
        onDragOver: () => undefined,
        onDragEnd: () => '已放下。',
        onDragCancel: () => '已取消拖移。',
      },
    }),
    [],
  );

  const source = useSyncExternalStore(store.subscribe, () => store.get().source, () => null);
  const ghost = useSyncExternalStore(store.subscribe, () => store.get().ghost, () => IDLE.ghost);

  return (
    <StoreContext.Provider value={store}>
      <DndContext
        sensors={sensors}
        autoScroll={false}
        accessibility={accessibility}
        onDragStart={handleStart}
        onDragMove={handleMove}
        onDragEnd={() => finish(true)}
        onDragCancel={() => finish(false)}
      >
        {children}
        {/* 拖曳影像：不接收指標事件，elementFromPoint 才看得到底下的桌次 */}
        <DragOverlay dropAnimation={null} className="pointer-events-none">
          {source ? (
            <div
              style={{
                width: ghost.width,
                height: ghost.height,
                transform: `scale(${ghost.scale})`,
                transformOrigin: '0 0',
              }}
            >
              {renderOverlay(source)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </StoreContext.Provider>
  );
}

/** 可拖的來源；scale 是來源所在的縮放比例（座位圖內的名單列與把手），拖曳影像照同樣的大小畫 */
export function useSeatingDraggable(
  id: string,
  source: DragSource,
  opts: { disabled?: boolean; scale?: number; role?: string } = {},
) {
  return useDraggable({
    id,
    disabled: opts.disabled,
    data: { source, scale: opts.scale ?? 1 },
    // 人員列與名單列保留 listitem 的角色；把手是 button
    attributes: { role: opts.role ?? 'button' },
  });
}
