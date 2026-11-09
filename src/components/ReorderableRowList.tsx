import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import "./ReorderableRowList.css";

type RowPosition = { top: number; height: number };
type DragSession = {
  id: string;
  source: number;
  target: number;
  pointerId: number | null;
  handle: HTMLButtonElement;
  startY: number;
  clientY: number;
  scrollY: number;
  positions: RowPosition[];
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  frame: number | null;
};
type DragView = { id: string; source: number; target: number; offset: number; step: number };

const bengaliNumber = (value: number) =>
  String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]!);

export function ReorderableRowList<T extends { id: string }>({
  rows,
  render,
  onUpdate,
  onRemove,
  onMove,
}: {
  rows: T[];
  render: (row: T, update: (patch: Partial<T>) => void) => ReactNode;
  onUpdate: (id: string, patch: Partial<T>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, targetIndex: number) => void;
}) {
  const instructionsId = useId();
  const elements = useRef(new Map<string, HTMLDivElement>());
  const session = useRef<DragSession | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function cleanUp(current: DragSession) {
    if (current.timer !== null) clearTimeout(current.timer);
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    if (current.pointerId !== null && current.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId);
    }
  }

  useEffect(() => {
    return () => {
      const current = session.current;
      session.current = null;
      if (current) cleanUp(current);
    };
  }, []);

  // Removing/adding rows during a drag invalidates the measured positions.
  const rowIds = rows.map((row) => row.id).join("\u0000");
  useEffect(() => {
    const current = session.current;
    if (current) {
      session.current = null;
      cleanUp(current);
      setDrag(null);
    }
  }, [rowIds]);

  function finish(commit: boolean) {
    const current = session.current;
    if (!current) return;
    session.current = null;
    cleanUp(current);
    setDrag(null);
    if (current.active && commit && current.source !== current.target) {
      onMove(current.id, current.target);
      setAnnouncement(
        `${bengaliNumber(current.source + 1)} নম্বর সারি ${bengaliNumber(current.target + 1)} নম্বরে সরানো হয়েছে।`,
      );
    } else if (current.active) {
      setAnnouncement(commit ? "সারির ক্রম অপরিবর্তিত আছে।" : "সারি সরানো বাতিল হয়েছে।");
    }
  }

  function showPosition(current: DragSession, offset: number, target: number) {
    const own = current.positions[current.source]!;
    const next = current.positions[current.source + 1];
    const previous = current.positions[current.source - 1];
    const gap = next
      ? next.top - own.top - own.height
      : previous
        ? own.top - previous.top - previous.height
        : 8;
    current.target = target;
    setDrag((old) =>
      old?.id === current.id && old.offset === offset && old.target === target
        ? old
        : { id: current.id, source: current.source, target, offset, step: own.height + gap },
    );
  }

  function updatePointerPosition(current: DragSession) {
    const own = current.positions[current.source]!;
    const first = current.positions[0]!;
    const last = current.positions[current.positions.length - 1]!;
    const ownCenter = own.top + own.height / 2;
    const offset = Math.max(
      first.top + first.height / 2 - ownCenter - 1,
      Math.min(
        last.top + last.height / 2 - ownCenter + 1,
        current.clientY - current.startY + window.scrollY - current.scrollY,
      ),
    );
    const center = own.top + own.height / 2 + offset;
    const target = current.positions.reduce(
      (index, position, source) =>
        index + (source !== current.source && center > position.top + position.height / 2 ? 1 : 0),
      0,
    );
    showPosition(current, offset, target);
  }

  function autoScroll(current: DragSession) {
    if (session.current !== current || !current.active || current.pointerId === null) return;
    const edge = 60;
    const distance =
      current.clientY < edge
        ? -Math.min(14, (edge - current.clientY) / 4)
        : current.clientY > window.innerHeight - edge
          ? Math.min(14, (current.clientY - window.innerHeight + edge) / 4)
          : 0;
    if (distance) window.scrollBy(0, distance);
    updatePointerPosition(current);
    current.frame = requestAnimationFrame(() => autoScroll(current));
  }

  function activate(current: DragSession) {
    if (session.current !== current) return;
    current.positions = rows.map((row) => {
      const rect = elements.current.get(row.id)!.getBoundingClientRect();
      return { top: rect.top + window.scrollY, height: rect.height };
    });
    current.scrollY = window.scrollY;
    current.active = true;
    showPosition(current, 0, current.source);
    setAnnouncement(`${bengaliNumber(current.source + 1)} নম্বর সারি ধরা হয়েছে। ওপর-নিচে সরান।`);
    if (current.pointerId !== null) autoScroll(current);
  }

  function beginPointer(event: PointerEvent<HTMLButtonElement>, id: string, source: number) {
    if (!event.isPrimary || event.button !== 0 || rows.length < 2 || session.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    const current: DragSession = {
      id,
      source,
      target: source,
      pointerId: event.pointerId,
      handle,
      startY: event.clientY,
      clientY: event.clientY,
      scrollY: window.scrollY,
      positions: [],
      active: false,
      timer: null,
      frame: null,
    };
    session.current = current;
    if (event.pointerType !== "mouse") {
      current.timer = setTimeout(() => activate(current), 200);
    }
  }

  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.clientY = event.clientY;
    if (!current.active) {
      const distance = Math.abs(event.clientY - current.startY);
      if (event.pointerType === "mouse" && distance >= 4) activate(current);
      else if (distance > 12) finish(false);
    }
    if (current.active) updatePointerPosition(current);
  }

  return (
    <div className="reorderable-rows">
      <p id={instructionsId} className="mb-2 text-xs text-muted-foreground">
        সিরিয়াল নম্বর চেপে ধরে পুরো সারি ওপর-নিচে টানুন।
        <span className="sr-only">
          {" "}
          কিবোর্ডে Space দিয়ে ধরুন, তীরচিহ্নে সরান, আবার Space দিয়ে রাখুন। Escape দিয়ে বাতিল করুন।
        </span>
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const isActive = drag?.id === row.id;
          const offset = isActive
            ? drag.offset
            : drag && index > drag.source && index <= drag.target
              ? -drag.step
              : drag && index < drag.source && index >= drag.target
                ? drag.step
                : 0;
          return (
            <div
              key={row.id}
              ref={(element) => {
                if (element) elements.current.set(row.id, element);
                else elements.current.delete(row.id);
              }}
              className={`reorderable-row flex flex-wrap items-center gap-2${isActive ? " is-dragging" : ""}`}
              style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
            >
              <button
                type="button"
                className="input w-28 reorderable-row-handle"
                aria-label={`${bengaliNumber(index + 1)} নম্বর সারি সরান`}
                aria-describedby={instructionsId}
                aria-pressed={isActive}
                disabled={rows.length < 2}
                title="চেপে ধরে সারি ওপর-নিচে টানুন"
                onPointerDown={(event) => beginPointer(event, row.id, index)}
                onPointerMove={movePointer}
                onPointerUp={(event) => {
                  if (session.current?.pointerId === event.pointerId) {
                    if (session.current.active) {
                      session.current.clientY = event.clientY;
                      updatePointerPosition(session.current);
                    }
                    finish(true);
                  }
                }}
                onPointerCancel={() => finish(false)}
                onLostPointerCapture={() => {
                  if (session.current?.pointerId !== null) finish(false);
                }}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  const current = session.current;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    finish(false);
                  } else if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    if (event.repeat || (current && current.pointerId !== null)) return;
                    if (current) finish(true);
                    else {
                      const keyboard: DragSession = {
                        id: row.id,
                        source: index,
                        target: index,
                        pointerId: null,
                        handle: event.currentTarget,
                        startY: 0,
                        clientY: 0,
                        scrollY: window.scrollY,
                        positions: [],
                        active: false,
                        timer: null,
                        frame: null,
                      };
                      session.current = keyboard;
                      activate(keyboard);
                    }
                  } else if (
                    current?.id === row.id &&
                    current.pointerId === null &&
                    (event.key === "ArrowUp" || event.key === "ArrowDown")
                  ) {
                    event.preventDefault();
                    const target = Math.max(
                      0,
                      Math.min(
                        rows.length - 1,
                        current.target + (event.key === "ArrowUp" ? -1 : 1),
                      ),
                    );
                    const destination = current.positions[target]!;
                    const own = current.positions[current.source]!;
                    showPosition(
                      current,
                      destination.top -
                        own.top +
                        (target > current.source ? destination.height - own.height : 0),
                      target,
                    );
                    event.currentTarget.scrollIntoView({ block: "nearest" });
                    setAnnouncement(
                      `${bengaliNumber(target + 1)} নম্বর অবস্থান। Space চাপলে সারিটি এখানে থাকবে।`,
                    );
                  } else if (event.key === "Tab" && current) finish(false);
                }}
                onBlur={() => {
                  if (session.current?.pointerId === null) finish(false);
                }}
              >
                <span>{bengaliNumber(index + 1)}</span>
                <svg
                  aria-hidden="true"
                  width="12"
                  height="18"
                  viewBox="0 0 12 18"
                  fill="currentColor"
                >
                  <circle cx="3" cy="3" r="1.3" />
                  <circle cx="9" cy="3" r="1.3" />
                  <circle cx="3" cy="9" r="1.3" />
                  <circle cx="9" cy="9" r="1.3" />
                  <circle cx="3" cy="15" r="1.3" />
                  <circle cx="9" cy="15" r="1.3" />
                </svg>
              </button>
              {render(row, (patch) => onUpdate(row.id, patch))}
              <button type="button" className="btn-danger" onClick={() => onRemove(row.id)}>
                মুছুন
              </button>
            </div>
          );
        })}
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">কোনো সারি নেই।</p> : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
