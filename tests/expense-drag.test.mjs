import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { moveExpenseRow } from "../src/lib/expense-order.ts";

const source = readFileSync(
  new URL("../src/components/ReorderableRowList.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

// Exercise the component's actual event handlers with controlled geometry and
// time. This is a small hook/JSX harness, not a simulated implementation of drag.
function mount({ heights = [38, 38, 38] } = {}) {
  const hooks = [];
  const dom = new Map();
  const timers = new Map();
  const frames = new Map();
  const moves = [];
  let rows = [
    { id: "salary", voucherNo: "১", desc: "বেতন", amount: 7000, vatRate: 0, taxRate: 0 },
    { id: "paper", voucherNo: "২", desc: "কাগজ", amount: 1100, vatRate: 0.1, taxRate: 0.05 },
    {
      id: "stationery",
      voucherNo: "৩",
      desc: "স্টেশনারী",
      amount: 1500,
      vatRate: 0.1,
      taxRate: 0.05,
    },
  ];
  let tree;
  let cursor = 0;
  let nextId = 1;
  let now = 0;
  let dirty = false;
  let pendingEffects = [];
  const browser = {
    scrollY: 0,
    innerHeight: 800,
    scrollBy(_x, y) {
      this.scrollY = Math.max(0, this.scrollY + y);
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const react = {
    useId() {
      const slot = cursor++;
      hooks[slot] ??= { value: `instructions-${slot}` };
      return hooks[slot].value;
    },
    useRef(initial) {
      const slot = cursor++;
      hooks[slot] ??= { current: initial };
      return hooks[slot];
    },
    useState(initial) {
      const slot = cursor++;
      hooks[slot] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks[slot].value,
        (next) => {
          const value = typeof next === "function" ? next(hooks[slot].value) : next;
          if (!Object.is(hooks[slot].value, value)) dirty = true;
          hooks[slot].value = value;
        },
      ];
    },
    useEffect(effect, dependencies) {
      const slot = cursor++;
      const previous = hooks[slot];
      if (
        !previous ||
        dependencies.some((dependency, i) => !Object.is(dependency, previous.dependencies[i]))
      ) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[slot] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const sandbox = {
    exports: {},
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected component dependency: ${name}`);
    },
    window: browser,
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  const Component = sandbox.exports.ReorderableRowList;
  const rowTop = (index) =>
    100 + heights.slice(0, index).reduce((total, height) => total + height + 8, 0);
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (!node || typeof node !== "object") return [];
    return [node, ...flatten(node.props?.children)];
  }
  function rowNodes() {
    return flatten(tree).filter((node) => node.props?.className?.startsWith("reorderable-row "));
  }
  function element(id) {
    if (!dom.has(id)) {
      const captures = new Set();
      dom.set(id, {
        captures,
        focused: false,
        released: [],
        getBoundingClientRect() {
          const position = rows.findIndex((row) => row.id === id);
          return { top: rowTop(position) - browser.scrollY, height: heights[position] };
        },
        focus() {
          this.focused = true;
        },
        scrollIntoView() {},
        setPointerCapture(pointerId) {
          captures.add(pointerId);
        },
        hasPointerCapture(pointerId) {
          return captures.has(pointerId);
        },
        releasePointerCapture(pointerId) {
          captures.delete(pointerId);
          this.released.push(pointerId);
        },
      });
    }
    return dom.get(id);
  }
  function render() {
    do {
      dirty = false;
      cursor = 0;
      pendingEffects = [];
      tree = Component({
        rows,
        render: (row) => jsx("input", { value: row.desc, "data-amount": row.amount }),
        onUpdate() {},
        onRemove() {},
        onMove(id, target) {
          moves.push([id, target]);
          rows = moveExpenseRow(rows, id, target);
        },
      });
      rowNodes().forEach((node) => node.props.ref(element(node.key)));
      pendingEffects.forEach((effect) => effect());
    } while (dirty);
  }
  function handle(index) {
    return flatten(rowNodes()[index]).find((node) => node.type === "button");
  }
  render();
  return {
    moves,
    timers,
    frames,
    dom,
    get rows() {
      return rows;
    },
    get views() {
      return rowNodes();
    },
    fire(index, name, values = {}) {
      const node = rowNodes()[index];
      const event = {
        isPrimary: true,
        button: 0,
        pointerType: "mouse",
        pointerId: 7,
        clientY: rowTop(index) + heights[index] / 2 - browser.scrollY,
        currentTarget: element(node.key),
        preventDefault() {},
        ...values,
      };
      handle(index).props[name](event);
      render();
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
      render();
    },
    setRows(nextRows) {
      rows = nextRows;
      render();
    },
    unmount() {
      hooks.forEach((hook) => hook?.cleanup?.());
    },
  };
}

test("mouse dragging previews the whole row, commits only on release and reaches the last row", () => {
  const list = mount();
  const original = structuredClone(list.rows);
  list.fire(0, "onPointerDown");
  list.fire(0, "onPointerMove", { clientY: 230 });
  assert.deepEqual(list.moves, []);
  assert.deepEqual(list.rows, original);
  assert.match(list.views[0].props.className, /is-dragging/);
  assert.ok(list.views[0].props.style.transform);
  assert.equal(list.dom.get("salary").captures.has(7), true);
  list.fire(0, "onPointerUp", { clientY: 230 });
  assert.deepEqual(list.moves, [["salary", 2]]);
  assert.deepEqual(
    list.rows.map((row) => row.id),
    ["paper", "stationery", "salary"],
  );
  assert.deepEqual(list.rows[2], { ...original[0], voucherNo: "৩" });
  assert.equal(list.dom.get("salary").captures.size, 0);
  assert.equal(list.frames.size, 0);
});

test("touch requires a 200 ms hold and can move the last complete row to the first position", () => {
  const list = mount();
  list.fire(2, "onPointerDown", { pointerType: "touch" });
  list.advance(199);
  assert.doesNotMatch(list.views[2].props.className, /is-dragging/);
  list.advance(1);
  assert.match(list.views[2].props.className, /is-dragging/);
  list.fire(2, "onPointerMove", { pointerType: "touch", clientY: 100 });
  assert.deepEqual(list.moves, []);
  list.fire(2, "onPointerUp", { pointerType: "touch", clientY: 100 });
  assert.deepEqual(list.moves, [["stationery", 0]]);
  assert.deepEqual(
    list.rows.map((row) => row.id),
    ["stationery", "salary", "paper"],
  );
  assert.equal(list.rows[0].amount, 1500);
  assert.equal(list.rows[0].vatRate, 0.1);
  assert.equal(list.rows[0].taxRate, 0.05);
});

test("unequal row heights still allow dropping at the first and last positions", () => {
  const downward = mount({ heights: [70, 38, 90] });
  downward.fire(0, "onPointerDown");
  downward.fire(0, "onPointerMove", { clientY: 450 });
  downward.fire(0, "onPointerUp", { clientY: 450 });
  assert.deepEqual(downward.moves, [["salary", 2]]);
  const upward = mount({ heights: [38, 90, 70] });
  upward.fire(2, "onPointerDown");
  upward.fire(2, "onPointerMove", { clientY: 80 });
  upward.fire(2, "onPointerUp", { clientY: 80 });
  assert.deepEqual(upward.moves, [["stationery", 0]]);
});

test("a quick tap or moving before the touch hold cancels without committing later", () => {
  for (const action of ["tap", "move"]) {
    const list = mount();
    list.fire(0, "onPointerDown", { pointerType: "touch" });
    list.advance(100);
    if (action === "tap") list.fire(0, "onPointerUp", { pointerType: "touch" });
    else list.fire(0, "onPointerMove", { pointerType: "touch", clientY: 150 });
    list.advance(500);
    assert.deepEqual(list.moves, []);
    assert.equal(list.timers.size, 0);
    assert.equal(list.frames.size, 0);
    assert.equal(list.dom.get("salary").captures.size, 0);
    assert.doesNotMatch(list.views[0].props.className, /is-dragging/);
  }
});

test("pointer cancellation, capture loss and Escape clear the preview and release capture", () => {
  for (const cancel of ["onPointerCancel", "onLostPointerCapture", "Escape"]) {
    const list = mount();
    list.fire(0, "onPointerDown");
    list.fire(0, "onPointerMove", { clientY: 230 });
    if (cancel === "Escape") list.fire(0, "onKeyDown", { key: "Escape" });
    else list.fire(0, cancel);
    list.fire(0, "onPointerUp", { clientY: 230 });
    assert.deepEqual(list.moves, []);
    assert.equal(list.dom.get("salary").captures.size, 0);
    assert.equal(list.frames.size, 0);
    assert.doesNotMatch(list.views[0].props.className, /is-dragging/);
  }
});

test("keyboard grab, arrows and drop move a row and clamp at the list boundary", () => {
  const list = mount();
  list.fire(0, "onKeyDown", { key: " " });
  assert.match(list.views[0].props.className, /is-dragging/);
  list.fire(0, "onKeyDown", { key: "ArrowDown" });
  list.fire(0, "onKeyDown", { key: "ArrowDown" });
  list.fire(0, "onKeyDown", { key: "ArrowDown" });
  assert.deepEqual(list.moves, []);
  list.fire(0, "onKeyDown", { key: "Enter" });
  assert.deepEqual(list.moves, [["salary", 2]]);
  assert.deepEqual(
    list.rows.map((row) => row.voucherNo),
    ["১", "২", "৩"],
  );
});

test("keyboard Escape, Tab and blur cancel without changing row order", () => {
  for (const cancellation of ["Escape", "Tab", "blur"]) {
    const list = mount();
    list.fire(1, "onKeyDown", { key: " " });
    list.fire(1, "onKeyDown", { key: "ArrowUp" });
    if (cancellation === "blur") list.fire(1, "onBlur");
    else list.fire(1, "onKeyDown", { key: cancellation });
    assert.deepEqual(list.moves, []);
    assert.deepEqual(
      list.rows.map((row) => row.id),
      ["salary", "paper", "stationery"],
    );
    assert.doesNotMatch(list.views[1].props.className, /is-dragging/);
  }
});

test("holding Space does not repeatedly grab and drop the row", () => {
  const list = mount();
  list.fire(0, "onKeyDown", { key: " ", repeat: false });
  list.fire(0, "onKeyDown", { key: "ArrowDown" });
  list.fire(0, "onKeyDown", { key: " ", repeat: true });
  assert.deepEqual(list.moves, []);
  assert.match(list.views[0].props.className, /is-dragging/);
  list.fire(0, "onKeyDown", { key: " ", repeat: false });
  assert.deepEqual(list.moves, [["salary", 1]]);
});

test("row changes and unmount cancel an active pointer session and pending touch timer", () => {
  const active = mount();
  active.fire(0, "onPointerDown");
  active.fire(0, "onPointerMove", { clientY: 230 });
  active.setRows(active.rows.slice(0, 2));
  assert.deepEqual(active.moves, []);
  assert.equal(active.dom.get("salary").captures.size, 0);
  assert.equal(active.frames.size, 0);
  const pending = mount();
  pending.fire(0, "onPointerDown", { pointerType: "touch" });
  pending.unmount();
  assert.equal(pending.dom.get("salary").captures.size, 0);
  assert.equal(pending.timers.size, 0);
});

test("secondary pointers and non-primary mouse buttons cannot start a drag", () => {
  for (const values of [{ isPrimary: false }, { button: 2 }]) {
    const list = mount();
    list.fire(0, "onPointerDown", values);
    list.fire(0, "onPointerMove", { clientY: 230 });
    list.fire(0, "onPointerUp", { clientY: 230 });
    assert.deepEqual(list.moves, []);
    assert.equal(list.dom.get("salary").captures.size, 0);
  }
});
