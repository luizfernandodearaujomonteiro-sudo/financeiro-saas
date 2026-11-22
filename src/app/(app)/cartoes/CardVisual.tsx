import { Wifi } from "lucide-react";
import { VisibilityBadge } from "@/components/ui/primitives";

const BRAND_GRADIENT: Record<string, string> = {
  visa: "from-[#1e3a8a] via-[#2563eb] to-[#22d3ee]",
  mastercard: "from-[#7c2d12] via-[#ea580c] to-[#facc15]",
  elo: "from-[#111827] via-[#374151] to-[#eab308]",
  amex: "from-[#0f766e] via-[#14b8a6] to-[#a5f3fc]",
  hipercard: "from-[#7f1d1d] via-[#dc2626] to-[#fb7185]",
  outra: "from-[#312e81] via-[#6366f1] to-[#a78bfa]",
};

const BRAND_LABEL: Record<string, string> = { visa: "VISA", mastercard: "Mastercard", elo: "elo", amex: "AMEX", hipercard: "Hipercard", outra: "Cartão" };

export function CardVisual({ nickname, brand, last4, ownerName, visibility }: { nickname: string; brand: string; last4: string; ownerName: string; visibility: string }) {
  return (
    <div className={`relative aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.8)] ${BRAND_GRADIENT[brand] ?? BRAND_GRADIENT.outra}`}>
      <div aria-hidden className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-black/20 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg leading-tight font-bold drop-shadow">{nickname}</p>
            <div className="mt-1 [&>span]:bg-white/20 [&>span]:text-white [&>span]:ring-white/30">
              <VisibilityBadge v={visibility} />
            </div>
          </div>
          <Wifi aria-hidden className="h-6 w-6 rotate-90 opacity-80" />
        </div>
        <div aria-hidden className="h-8 w-11 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500 opacity-90 shadow-inner" />
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="font-mono text-base tracking-[0.2em] drop-shadow" aria-label={`final ${last4}`}>•••• {last4}</p>
            <p className="mt-0.5 text-xs uppercase opacity-80">{ownerName}</p>
          </div>
          <p className="text-lg font-black italic opacity-90">{BRAND_LABEL[brand] ?? "Cartão"}</p>
        </div>
      </div>
    </div>
  );
}
