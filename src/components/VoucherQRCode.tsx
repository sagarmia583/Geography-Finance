import { useEffect, useState, useMemo } from "react";
import QRCode from "qrcode";

export type VoucherQRProps = {
  voucherId: string;
  examName?: string | undefined;
  slug?: string | undefined;
  date?: string | undefined;
  vatCode?: string | undefined;
  tax5Code?: string | undefined;
  tax10Code?: string | undefined;
  size?: number | undefined; // ডিফল্ট ৩৮ পিক্সেল
  showLabel?: boolean | undefined;
  className?: string | undefined;
};

/** ভাউচার আইডি থেকে শেষের ডিজিটগুলো আলাদা করার ফাংশন (যেমন: PRACTICAL-2026-62295001 -> 62295001) */
export function getVoucherLastDigits(id: string): string {
  if (!id) return "";
  const parts = id.trim().split("-");
  return parts[parts.length - 1] || id;
}

/**
 * সরকারি চালান কোডসমূহ একত্রিত করে স্মার্ট ফরম্যাটে রূপান্তর:
 * একই অর্থবছরের চালান হলে ১ম চালানে অর্থবছরসহ পুরো কোড থাকবে,
 * পরবর্তী চালানগুলোতে শুধুমাত্র সিরিয়াল নম্বর থাকবে।
 *
 * উদাহরণ:
 * ["2627-0011225544", "2627-0011554422", "2627-1122554455"]
 * -> "2627-0011225544, 0011554422, 1122554455"
 */
export function formatChallanCodesSummary(codes: (string | undefined | null)[]): string {
  const valid = codes
    .map((c) => (c || "").trim())
    .filter((c) => c.length > 0);
  if (valid.length === 0) return "";

  const formatted: string[] = [];
  let firstYearPrefix = "";

  for (let i = 0; i < valid.length; i++) {
    const code = valid[i]!;
    const dashIdx = code.indexOf("-");
    if (dashIdx !== -1) {
      const prefix = code.slice(0, dashIdx + 1); // e.g. "2627-"
      const serial = code.slice(dashIdx + 1);    // e.g. "0011225544"
      if (i === 0) {
        firstYearPrefix = prefix;
        formatted.push(code);
      } else if (prefix === firstYearPrefix) {
        // একই অর্থবছর হলে শুধু সিরিয়াল নম্বর
        formatted.push(serial);
      } else {
        formatted.push(code);
      }
    } else {
      formatted.push(code);
    }
  }

  return formatted.join(", ");
}

/**
 * ভেরিফিকেশন ইউআরএল তৈরি —
 * কিউআর কোডকে একদম সিম্পল, স্পষ্ট ও ক্লিন রাখার জন্য শুধুমাত্র প্রয়োজনীয় ভাউচার আইডি ও স্লাগ রাখা হয়।
 * অতিরিক্ত বাংলা টেক্সট বা লম্বা কোড বাদ দেওয়া হয়েছে যাতে কিউআর কোড হিজিবিজি না হয়ে পরিচ্ছন্ন দেখায়।
 */
export function makeVerifyUrl({
  voucherId,
  slug,
}: {
  voucherId: string;
  examName?: string | undefined;
  slug?: string | undefined;
  date?: string | undefined;
  vatCode?: string | undefined;
  tax5Code?: string | undefined;
  tax10Code?: string | undefined;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!voucherId) return `${origin}/verify`;
  const params = new URLSearchParams();
  params.set("id", voucherId);
  if (slug?.trim()) params.set("slug", slug.trim());
  return `${origin}/verify?${params.toString()}`;
}

export function VoucherQRCode({
  voucherId,
  examName,
  slug,
  date,
  vatCode,
  tax5Code,
  tax10Code,
  size = 48,
  showLabel = false,
  className = "",
}: VoucherQRProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const verifyUrl = useMemo(
    () => makeVerifyUrl({ voucherId, slug }),
    [voucherId, slug],
  );

  const lastDigits = useMemo(() => getVoucherLastDigits(voucherId), [voucherId]);

  useEffect(() => {
    if (!voucherId) {
      setDataUrl(null);
      return;
    }

    let isMounted = true;
    QRCode.toDataURL(verifyUrl, {
      width: (size || 48) * 2,
      margin: 1,
      errorCorrectionLevel: "L", // Level L (Low) minimizes clutter, making the dots larger and crystal clear
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        console.error("QR Code error:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [verifyUrl, size, voucherId]);

  if (!voucherId) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
      title={`ভাউচার ও চালান সত্যতা যাচাই:\n${verifyUrl}`}
    >
      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded border border-foreground/30 bg-white p-0.5 shadow-2xs hover:border-primary transition-colors cursor-pointer shrink-0"
        style={{ width: (size || 48) + 4, height: (size || 48) + 4 }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR Code ${voucherId}`}
            width={size || 48}
            height={size || 48}
            className="block"
          />
        ) : (
          <div
            style={{ width: size || 48, height: size || 48 }}
            className="flex items-center justify-center bg-muted text-[8px] text-muted-foreground"
          >
            QR
          </div>
        )}
      </a>

      {/* QR কোডের ডানপাশে ভাউচার আইডির শেষ ডিজিটগুলো উল্লম্বভাবে (Vertical) */}
      {lastDigits ? (
        <span
          className="text-[8.5px] font-mono font-bold text-foreground/80 tracking-wider select-all"
          style={{
            writingMode: "vertical-rl",
            maxHeight: (size || 48) + 4,
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          {lastDigits}
        </span>
      ) : null}
    </div>
  );
}
