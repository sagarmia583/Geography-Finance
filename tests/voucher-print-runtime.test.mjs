import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate as flushTasks } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

function standalone() {
  const source = readFileSync(new URL("../public/voucher-studio.js", import.meta.url), "utf8");
  const start = source.indexOf("let printRequest = null;");
  const end = source.indexOf('$("voucherDesign").addEventListener', start);
  assert.ok(start >= 0 && end > start, "Use the actual Studio print entry and shortcut handler");
  const events = {};
  const gate = deferred();
  const state = { ready: 0, prints: 0, blur: 0, errors: [], currentPlan: { valid: true } };
  class Editable {
    blur() {
      state.blur++;
    }
  }
  const document = {
    activeElement: new Editable(),
    addEventListener: (name, handler) => (events[name] = handler),
  };
  const context = vm.createContext({
    window: { print: () => state.prints++ },
    document,
    HTMLElement: Editable,
    get currentPlan() {
      return state.currentPlan;
    },
    readyImages: async () => {
      state.ready++;
      await gate.promise;
    },
    message: (error) => state.errors.push(error),
  });
  vm.runInContext(source.slice(start, end), context);
  return { state, gate, events, print: () => context.window.printStudio() };
}

test("Studio printing saves the edited field, waits for fonts/images, and coalesces duplicate requests", async () => {
  const service = standalone();
  const first = service.print();
  const second = service.print();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(service.state.blur, 1);
  assert.equal(service.state.ready, 1);
  assert.equal(service.state.prints, 0);
  service.gate.resolve();
  await first;
  assert.equal(service.state.prints, 1);
  await service.print();
  assert.equal(service.state.prints, 2, "Closing the dialog allows a later print");
});

test("invalid Studio layouts never print and do not leave the print guard stuck", async () => {
  const service = standalone();
  service.state.currentPlan.valid = false;
  await assert.rejects(service.print());
  assert.equal(service.state.ready, 0);
  assert.equal(service.state.prints, 0);
  service.state.currentPlan.valid = true;
  service.gate.resolve();
  await service.print();
  assert.equal(service.state.prints, 1);
});

function key(overrides = {}) {
  return {
    key: "p",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    repeat: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...overrides,
  };
}

test("standalone Ctrl/Cmd+P uses prepared printing and ignores auto-repeat or unrelated keys", async () => {
  for (const modifiers of [{}, { ctrlKey: false, metaKey: true }]) {
    const service = standalone();
    const event = key(modifiers);
    service.events.keydown(event);
    assert.equal(event.prevented, true);
    await Promise.resolve();
    assert.equal(service.state.ready, 1);
    service.gate.resolve();
    await service.print();
    assert.equal(service.state.prints, 1);
  }
  for (const modifiers of [{ repeat: true }, { ctrlKey: false }, { altKey: true }, { key: "s" }]) {
    const service = standalone();
    service.events.keydown(key(modifiers));
    await Promise.resolve();
    assert.equal(service.state.ready, 0);
  }
});

function parent(options = {}) {
  const source = readFileSync(new URL("../src/routes/studio.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handlePrint = useCallback");
  const end = source.indexOf("const filteredShops", start);
  assert.ok(start >= 0 && end > start, "Use the actual parent iframe print handler and effect");
  const compiled = ts.transpileModule(
    source.slice(start, end) + "\nglobalThis.invokePrint = handlePrint;",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const gate = deferred();
  const state = { prints: 0, rawPrints: 0, focus: 0, errors: [], pending: [], cleanup: null };
  const events = {};
  const child = {
    focus: () => state.focus++,
    print: () => state.rawPrints++,
    printStudio: options.missing
      ? undefined
      : async () => {
          state.prints++;
          await gate.promise;
        },
  };
  const context = vm.createContext({
    isLoading: options.loading || false,
    iframeError: options.error || null,
    printInFlightRef: { current: false },
    iframeRef: { current: { contentWindow: child } },
    setPrintError: (error) => state.errors.push(error),
    setIsPrinting: (pending) => state.pending.push(pending),
    useCallback: (callback) => callback,
    useEffect: (effect) => (state.cleanup = effect()),
    window: {
      addEventListener: (name, handler) => (events[name] = handler),
      removeEventListener: (name, handler) => {
        assert.equal(events[name], handler);
        delete events[name];
      },
    },
  });
  vm.runInContext(compiled, context);
  return { state, gate, events, print: () => context.invokePrint() };
}

test("parent Ctrl/Cmd+P prints the prepared iframe once, never its clipped parent or raw child", async () => {
  for (const modifiers of [{}, { ctrlKey: false, metaKey: true }]) {
    const service = parent();
    const event = key(modifiers);
    service.events.keydown(event);
    service.events.keydown(key());
    service.events.keydown(key({ repeat: true }));
    assert.equal(event.prevented, true);
    assert.equal(service.state.prints, 1);
    assert.equal(service.state.rawPrints, 0);
    service.gate.resolve();
    await flushTasks();
    await service.print();
    assert.equal(service.state.prints, 2, "Print can be retried after the prepared dialog ends");
    service.state.cleanup();
    assert.equal(eventsExist(service.events), false);
  }
});

function eventsExist(events) {
  return Object.hasOwn(events, "keydown");
}

test("parent print blocks loading, failed, or incomplete Studio documents without raw fallback", async () => {
  for (const options of [{ loading: true }, { error: "failed" }, { missing: true }]) {
    const service = parent(options);
    await service.print();
    assert.equal(service.state.prints, 0);
    assert.equal(service.state.rawPrints, 0);
    if (options.missing) {
      assert.ok(service.state.errors.at(-1));
      assert.deepEqual(service.state.pending, [true, false]);
      await service.print();
      assert.deepEqual(service.state.pending, [true, false, true, false]);
    }
  }
});
