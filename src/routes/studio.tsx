import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { orgInfoAtom } from "@/lib/config";

type StudioTemplate = {
  id: number;
  name: string;
  variant: string;
  page: number;
  source?: { kind: string };
};

type StudioWindow = Window & { printStudio?: () => Promise<void> };

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "ক্যাশ মেমো ও ভাউচার স্টুডিও — ভূগোল ও পরিবেশ বিভাগ" },
      {
        name: "description",
        content:
          "PDF ও ছবির নকশা অনুযায়ী সম্পাদনাযোগ্য ক্যাশ মেমো, ইনভয়েস ও রসিদের প্রিন্ট স্টুডিও।",
      },
    ],
  }),
  component: StudioPage,
});

function StudioPage() {
  const [orgInfo] = useAtom(orgInfoAtom);
  const [showShopList, setShowShopList] = useState(false);
  const [searchShop, setSearchShop] = useState("");
  const [shops, setShops] = useState<StudioTemplate[]>([]);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const printInFlightRef = useRef(false);

  const checkStudioReadiness = useCallback(() => {
    try {
      const studioDocument = iframeRef.current?.contentDocument;
      // A cached iframe can finish before hydration attaches React's onLoad.
      // Ignore its initial blank document while the real Studio is loading.
      if (
        !studioDocument ||
        studioDocument.URL === "about:blank" ||
        studioDocument.readyState !== "complete"
      ) {
        return;
      }
      setIsLoading(false);
      setIframeError(
        studioDocument.querySelector("#voucherDesign")
          ? null
          : "ভাউচার স্টুডিও লোড হয়নি। পেজটি রিলোড করুন।",
      );
    } catch {
      setIsLoading(false);
      setIframeError("ভাউচার স্টুডিও খোলা যাচ্ছে না। পেজটি রিলোড করুন।");
    }
  }, []);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    frame.addEventListener("load", checkStudioReadiness);
    checkStudioReadiness();
    return () => frame.removeEventListener("load", checkStudioReadiness);
  }, [checkStudioReadiness]);

  useEffect(() => {
    const controller = new AbortController();
    const loadManifest = async () => {
      try {
        const responses = await Promise.all(
          ["/voucher-assets/manifest.json", "/voucher-additional-designs.json"].map((url) =>
            fetch(url, { signal: controller.signal }),
          ),
        );
        if (responses.some((response) => !response.ok)) throw new Error("Manifest unavailable");
        const [manifest, additional] = await Promise.all(
          responses.map((response) => response.json()),
        );
        if (!Array.isArray(manifest.templates) || !Array.isArray(additional.templates))
          throw new Error("Invalid manifest");
        const templates = [...manifest.templates, ...additional.templates];
        if (
          templates.length === 0 ||
          !templates.every(
            (template: StudioTemplate) =>
              Number.isInteger(template?.id) &&
              typeof template.name === "string" &&
              typeof template.variant === "string" &&
              Number.isInteger(template.page),
          )
        ) {
          throw new Error("Invalid manifest");
        }
        if (!controller.signal.aborted) setShops(templates);
      } catch {
        if (!controller.signal.aborted) {
          setManifestError("ভাউচারের ডিজাইনের তালিকা লোড হয়নি। পেজটি রিলোড করুন।");
        }
      } finally {
        if (!controller.signal.aborted) setManifestLoading(false);
      }
    };
    void loadManifest();
    return () => controller.abort();
  }, []);

  const handlePrint = useCallback(async () => {
    if (isLoading || iframeError || printInFlightRef.current) return;
    printInFlightRef.current = true;
    setPrintError(null);
    setIsPrinting(true);
    try {
      const studioWindow = iframeRef.current?.contentWindow as StudioWindow | null;
      if (!studioWindow?.printStudio) throw new Error("Studio unavailable");
      studioWindow.focus();
      await studioWindow.printStudio();
    } catch {
      setPrintError(
        "প্রিন্ট প্রস্তুত করা যায়নি। স্টুডিওর ভেতরের বার্তা দেখুন এবং আবার চেষ্টা করুন।",
      );
    } finally {
      printInFlightRef.current = false;
      setIsPrinting(false);
    }
  }, [isLoading, iframeError]);

  useEffect(() => {
    const printShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "p") {
        return;
      }
      // Print the complete A4 document rather than the parent's clipped iframe.
      event.preventDefault();
      if (!event.repeat) void handlePrint();
    };
    window.addEventListener("keydown", printShortcut);
    return () => window.removeEventListener("keydown", printShortcut);
  }, [handlePrint]);

  const filteredShops = shops.filter(
    (s) =>
      s.name.toLowerCase().includes(searchShop.toLowerCase()) ||
      s.variant.toLowerCase().includes(searchShop.toLowerCase()) ||
      `পৃষ্ঠা ${s.page}`.includes(searchShop),
  );

  return (
    <div className="flex flex-col h-screen bg-muted/20 overflow-hidden">
      {/* Top Studio Control Bar */}
      <header className="bg-background border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0 shadow-xs z-30">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold transition-colors"
            title="মূল ড্যাশবোর্ডে ফিরে যান"
          >
            <span>←</span>
            <span>ড্যাশবোর্ড</span>
          </Link>

          <div className="h-4 w-px bg-border/80 mx-0.5 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧾</span>
              <h1 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                ক্যাশ মেমো ও ভেন্ডর ভাউচার স্টুডিও
              </h1>
              <span className="hidden md:inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-semibold border border-emerald-300/40">
                {shops.length > 0 ? `${shops.length}টি ডিজাইন` : "ভাউচারের ডিজাইন"} • A4 বিল্ডার
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              {orgInfo.dept} • {orgInfo.college}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Shop List Modal Toggle */}
          <button
            onClick={() => setShowShopList(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-secondary/80 text-foreground text-xs font-medium hover:bg-secondary transition-colors"
            title="সব ভাউচার ডিজাইন দেখুন"
          >
            <span>🏪</span>
            <span className="hidden sm:inline">
              ডিজাইনের তালিকা{shops.length > 0 ? ` (${shops.length}টি)` : ""}
            </span>
          </button>

          {/* Direct Print Button */}
          <button
            onClick={handlePrint}
            disabled={isLoading || !!iframeError || isPrinting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="বর্তমান A4 শিট প্রিন্ট করুন"
          >
            <span>🖨️</span>
            <span>{isPrinting ? "প্রস্তুত হচ্ছে..." : "প্রিন্ট / PDF"}</span>
          </button>

          {/* Open In New Tab */}
          <a
            href="/voucher-studio.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors"
            title="আলাদা পূর্ণাঙ্গ উইন্ডোতে খুলুন"
          >
            <span>⛶</span>
            <span className="hidden md:inline">নতুন ট্যাবে</span>
          </a>
        </div>
      </header>

      {(iframeError || printError) && (
        <p
          role="alert"
          className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
        >
          {iframeError || printError}
        </p>
      )}

      {/* Main Studio iFrame Container */}
      <main className="flex-1 relative w-full h-[calc(100vh-60px)] bg-white overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs z-20">
            <div className="w-9 h-9 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-foreground">ক্যাশ মেমো স্টুডিও লোড হচ্ছে...</p>
            <p className="text-xs text-muted-foreground mt-1">
              মূল PDF-এর ডিজাইন ও A4 প্রিভিউ প্রস্তুত করা হচ্ছে
            </p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src="/voucher-studio.html"
          title="Voucher Print Studio"
          className="w-full h-full border-none"
          onLoad={checkStudioReadiness}
          onError={() => {
            setIsLoading(false);
            setIframeError("ভাউচার স্টুডিও লোড হয়নি। পেজটি রিলোড করুন।");
          }}
        />
      </main>

      {/* Source PDF design list */}
      {showShopList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏪</span>
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    ভাউচার ডিজাইন{shops.length > 0 ? ` (${shops.length}টি)` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    স্টুডিওর বাম পাশের ড্রপডাউন থেকে যেকোনো দোকান নির্বাচন করে প্রিন্ট করতে পারেন
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShopList(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-border">
              <input
                type="text"
                placeholder="দোকানের নাম, ডিজাইনের ধরন বা পৃষ্ঠা দিয়ে খুঁজুন..."
                value={searchShop}
                onChange={(e) => setSearchShop(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {manifestLoading && (
                <p role="status" className="py-4 text-center text-sm text-muted-foreground">
                  ডিজাইনের তালিকা লোড হচ্ছে...
                </p>
              )}
              {manifestError && (
                <p role="alert" className="py-4 text-center text-sm text-destructive">
                  {manifestError}
                </p>
              )}
              {!manifestLoading && !manifestError && filteredShops.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  এই নামে কোনো ডিজাইন পাওয়া যায়নি।
                </p>
              )}
              {filteredShops.map((shop, idx) => (
                <div
                  key={shop.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/80 hover:border-primary/50 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{shop.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {shop.source?.kind === "image"
                          ? "ছবি থেকে তৈরি"
                          : `PDF পৃষ্ঠা ${shop.page}`}
                        {shop.variant && (
                          <>
                            {" "}
                            • <span className="text-primary font-medium">{shop.variant}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      try {
                        const select = iframeRef.current?.contentWindow?.document.querySelector(
                          "#voucherDesign",
                        ) as HTMLSelectElement | null | undefined;
                        if (select) {
                          select.value = String(shop.id);
                          select.dispatchEvent(new Event("input", { bubbles: true }));
                          setShowShopList(false);
                          setPrintError(null);
                        } else {
                          setIframeError(
                            "ডিজাইন নির্বাচন করা যায়নি। স্টুডিও লোড হওয়া পর্যন্ত অপেক্ষা করুন।",
                          );
                        }
                      } catch {
                        setIframeError("ডিজাইন নির্বাচন করা যায়নি। পেজটি রিলোড করুন।");
                      }
                    }}
                    disabled={isLoading || !!iframeError}
                    className="px-2.5 py-1 rounded bg-secondary hover:bg-primary hover:text-primary-foreground text-xs font-semibold transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    নির্বাচন করুন
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-border bg-muted/30 flex justify-end">
              <button
                onClick={() => setShowShopList(false)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
