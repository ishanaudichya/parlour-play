"use client";

/* Card renderers: banknotes, title deeds, action vouchers and rent notes.
   Pure CSS/SVG — no assets. Sized via `w`; everything scales off it. */

import {
  ACTION_META,
  COLOR_META,
  isAllColorWild,
  type MonoActionKind,
  type MonoCard,
  type MonoColor,
  type TableCard,
} from "@/lib/games/monodeal";
import { archivo, CARD_FACE, COPPER, GREEN, GREEN_DEEP, GUILLOCHE_DENSE, INK, INK_SOFT, moneyAccent } from "./theme";

const RAINBOW = ["#8a5a3b", "#9fd5e8", "#c33e8d", "#e0862c", "#c13a34", "#e2c23e", "#1d7a53", "#2a4a86"];
const rainbowBar = `linear-gradient(90deg, ${RAINBOW.map((c, i) => `${c} ${(i / RAINBOW.length) * 100}% ${((i + 1) / RAINBOW.length) * 100}%`).join(", ")})`;

/* ---------------- small pieces ---------------- */

/* spoke coordinates precomputed and rounded to 2 decimals — trig results can
   differ by 1 ULP between server and client and cause hydration mismatches */
const r2 = (x: number) => Number(x.toFixed(2));
const ROSETTE_SPOKES: readonly { x1: number; y1: number; x2: number; y2: number }[] = Array.from(
  { length: 12 },
  (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return {
      x1: r2(20 + Math.cos(a) * 11.5),
      y1: r2(20 + Math.sin(a) * 11.5),
      x2: r2(20 + Math.cos(a) * 15),
      y2: r2(20 + Math.sin(a) * 15),
    };
  }
);

function Rosette({ size, color, className = "" }: { size: number; color: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18.5" fill="none" stroke={color} strokeWidth="1" />
      <circle cx="20" cy="20" r="15" fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="2 1.6" />
      <circle cx="20" cy="20" r="11.5" fill="none" stroke={color} strokeWidth="0.7" />
      {ROSETTE_SPOKES.map((p, i) => (
        <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color} strokeWidth="0.6" />
      ))}
    </svg>
  );
}

export function ValueBadge({ value, s }: { value: number; s: number }) {
  return (
    <span
      className={`${archivo.className} inline-flex items-center justify-center rounded-full`}
      style={{
        width: 17 * s,
        height: 17 * s,
        fontSize: 7.5 * s,
        color: CARD_FACE,
        background: GREEN,
        boxShadow: `0 0 0 ${s}px ${CARD_FACE}, 0 0 0 ${1.6 * s}px ${GREEN}`,
      }}
    >
      {value}
    </span>
  );
}

const P = ({ d }: { d: string }) => <path d={d} />;

export function ActionIcon({ kind, size, color }: { kind: MonoActionKind; size: number; color: string }) {
  let body: React.ReactNode;
  switch (kind) {
    case "pass_go":
      body = <P d="M12 4 a8 8 0 1 0 8 8 M20 12 v-5 M20 12 h-5" />;
      break;
    case "deal_breaker":
      body = (
        <>
          <P d="M8 10 a4 4 0 0 1 0 -6 l2 0 a4 4 0 0 1 3 4" />
          <P d="M16 14 a4 4 0 0 1 0 6 l-2 0 a4 4 0 0 1 -3 -4" />
          <P d="M10 13 l-2 -2 M14 11 l2 2 M11.2 9.5 l1.6 5" />
        </>
      );
      break;
    case "just_say_no":
      body = (
        <>
          <P d="M8 3 h8 l5 5 v8 l-5 5 h-8 l-5 -5 v-8 Z" />
          <P d="M7 7 L17 17" />
        </>
      );
      break;
    case "forced_deal":
      body = <P d="M4 8 h13 M13 4 l4 4 -4 4 M20 16 h-13 M11 12 l-4 4 4 4" />;
      break;
    case "sly_deal":
      body = (
        <>
          <P d="M6 6 h9 v12 h-9 Z" />
          <P d="M15 10 h6 M18 7 l3 3 -3 3" />
        </>
      );
      break;
    case "debt_collector":
      body = (
        <>
          <P d="M12 3 a7 7 0 1 0 0.01 0 M12 6.5 v11 M15 9 a3 2.2 0 0 0 -6 0.4 c0 2.6 6 1.6 6 4.4 a3 2.2 0 0 1 -6 0.2" />
        </>
      );
      break;
    case "birthday":
      body = (
        <>
          <P d="M5 12 h14 v8 H5 Z M5 15.5 c2 2 4 -1.5 6 0 s4 1.5 6 0 M12 8.5 v3.5 M12 5 v1.5" />
        </>
      );
      break;
    case "house":
      body = <P d="M4 12 L12 4 L20 12 M6.5 10.5 V20 h11 v-9.5 M10.5 20 v-5 h3 v5" />;
      break;
    case "hotel":
      body = (
        <>
          <P d="M5 21 V6 h14 v15 M3 21 h18 M9 9.5 h2 M13 9.5 h2 M9 13 h2 M13 13 h2 M10.5 21 v-4 h3 v4" />
        </>
      );
      break;
    case "double_rent":
      body = (
        <>
          <P d="M5 6 l6 12 M11 6 l-6 12" />
          <P d="M14 8 a3 3 0 0 1 5.6 1.4 c0 2.4 -5.6 4.2 -5.6 8.6 h6" />
        </>
      );
      break;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {body}
    </svg>
  );
}

/* ---------------- frame ---------------- */

function Frame({
  w,
  border,
  children,
  bg = CARD_FACE,
  className = "",
}: {
  w: number;
  border: string;
  children: React.ReactNode;
  bg?: string;
  className?: string;
}) {
  const h = Math.round(w * 1.42);
  return (
    <div
      className={`relative shrink-0 select-none overflow-hidden ${className}`}
      style={{
        width: w,
        height: h,
        background: bg,
        borderRadius: Math.max(4, w * 0.07),
        border: `${Math.max(1, w * 0.02)}px solid ${border}`,
        boxShadow: "0 1px 3px rgba(33,28,18,0.25)",
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- faces ---------------- */

function MoneyFace({ card, w }: { card: Extract<MonoCard, { kind: "money" }>; w: number }) {
  const s = w / 84;
  const accent = moneyAccent(card.value);
  return (
    <Frame w={w} border={accent}>
      <div
        className="absolute rounded-[3px]"
        style={{ inset: 3 * s, border: `1px dashed ${accent}88` }}
      />
      <span className={`${archivo.className} absolute`} style={{ top: 5 * s, left: 7 * s, fontSize: 10 * s, color: accent }}>
        {card.value}
      </span>
      <span
        className={`${archivo.className} absolute`}
        style={{ bottom: 5 * s, right: 7 * s, fontSize: 10 * s, color: accent, transform: "rotate(180deg)" }}
      >
        {card.value}
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 2 * s }}>
        <div className="relative flex items-center justify-center">
          <Rosette size={52 * s} color={`${accent}99`} />
          <span className={`${archivo.className} absolute`} style={{ fontSize: 19 * s, color: accent }}>
            {card.value}
          </span>
        </div>
        <span
          className="font-bold uppercase"
          style={{ fontSize: 5.4 * s, letterSpacing: "0.22em", color: `${accent}cc` }}
        >
          Million
        </span>
      </div>
      <span
        className="absolute inset-x-0 text-center font-semibold uppercase"
        style={{ bottom: 4.5 * s, fontSize: 4.2 * s, letterSpacing: "0.18em", color: `${accent}99` }}
      >
        Legal Tender
      </span>
    </Frame>
  );
}

function DeedFace({ card, w }: { card: Extract<MonoCard, { kind: "property" }>; w: number }) {
  const s = w / 84;
  const meta = COLOR_META[card.color];
  return (
    <Frame w={w} border={INK}>
      <div
        className="flex flex-col items-center justify-center"
        style={{ height: 34 * s, background: meta.hex, color: meta.ink, padding: `0 ${4 * s}px` }}
      >
        <span className="font-semibold uppercase" style={{ fontSize: 4.4 * s, letterSpacing: "0.24em", opacity: 0.85 }}>
          Title Deed
        </span>
        <span
          className="text-center font-extrabold uppercase leading-[1.15]"
          style={{ fontSize: 7 * s, letterSpacing: "0.04em" }}
        >
          {card.name}
        </span>
      </div>
      <div className="flex flex-col" style={{ padding: `${5 * s}px ${7 * s}px 0` }}>
        {meta.rent.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between"
            style={{ padding: `${2.2 * s}px 0`, borderBottom: i < meta.rent.length - 1 ? `1px solid rgba(33,28,18,0.12)` : "none" }}
          >
            <span className="flex items-center" style={{ gap: 1.6 * s }}>
              {Array.from({ length: i + 1 }, (_, j) => (
                <span key={j} className="rounded-[1px]" style={{ width: 4 * s, height: 4 * s, background: meta.hex }} />
              ))}
            </span>
            <span className="font-bold tabular-nums" style={{ fontSize: 6.6 * s, color: INK }}>
              ${r}M
            </span>
          </div>
        ))}
      </div>
      <div className="absolute" style={{ bottom: 4 * s, right: 5 * s }}>
        <ValueBadge value={card.value} s={s} />
      </div>
      <span
        className="absolute font-semibold uppercase"
        style={{ bottom: 6 * s, left: 7 * s, fontSize: 4.2 * s, letterSpacing: "0.14em", color: INK_SOFT }}
      >
        {meta.setSize} to set
      </span>
    </Frame>
  );
}

function WildFace({ card, w }: { card: Extract<MonoCard, { kind: "wild" }>; w: number }) {
  const s = w / 84;
  const all = isAllColorWild(card);
  const a = all ? null : COLOR_META[card.colors[0]];
  const b = all ? null : COLOR_META[card.colors[1]];
  return (
    <Frame w={w} border={INK}>
      <div style={{ height: 22 * s, background: all ? rainbowBar : a!.hex }} className="flex items-center justify-center">
        {!all && (
          <span className="font-extrabold uppercase" style={{ fontSize: 6 * s, letterSpacing: "0.1em", color: a!.ink }}>
            {a!.label}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center justify-center" style={{ height: `calc(100% - ${44 * s}px)` }}>
        <span className={`${archivo.className}`} style={{ fontSize: 13 * s, color: INK, letterSpacing: "0.06em" }}>
          WILD
        </span>
        <span className="text-center font-semibold uppercase" style={{ fontSize: 4.6 * s, letterSpacing: "0.14em", color: INK_SOFT }}>
          {all ? "any color · $0" : "either color"}
        </span>
        <div style={{ marginTop: 2 * s }}>
          <ValueBadge value={card.value} s={s} />
        </div>
      </div>
      <div
        style={{ height: 22 * s, background: all ? rainbowBar : b!.hex }}
        className="absolute inset-x-0 bottom-0 flex items-center justify-center"
      >
        {!all && (
          <span
            className="font-extrabold uppercase"
            style={{ fontSize: 6 * s, letterSpacing: "0.1em", color: b!.ink, transform: "rotate(180deg)" }}
          >
            {b!.label}
          </span>
        )}
      </div>
    </Frame>
  );
}

function ActionFace({ card, w }: { card: Extract<MonoCard, { kind: "action" }>; w: number }) {
  const s = w / 84;
  const meta = ACTION_META[card.action];
  const tint = card.action === "just_say_no" ? "#a8342a" : COPPER;
  return (
    <Frame w={w} border={tint}>
      <div className="absolute rounded-[3px]" style={{ inset: 3 * s, border: `1px dashed ${tint}77` }} />
      <span
        className="absolute inset-x-0 text-center font-semibold uppercase"
        style={{ top: 5.5 * s, fontSize: 4.4 * s, letterSpacing: "0.26em", color: tint }}
      >
        Action Voucher
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 3 * s, padding: `0 ${6 * s}px` }}>
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: 34 * s, height: 34 * s, border: `1.5px solid ${tint}` }}
        >
          <ActionIcon kind={card.action} size={20 * s} color={tint} />
        </span>
        <span
          className="text-center font-extrabold uppercase leading-[1.1]"
          style={{ fontSize: 7.6 * s, letterSpacing: "0.05em", color: INK }}
        >
          {meta.label}
        </span>
        <span className="text-center leading-[1.25]" style={{ fontSize: 4.9 * s, color: INK_SOFT }}>
          {meta.blurb}
        </span>
      </div>
      <div className="absolute" style={{ bottom: 4.5 * s, right: 5.5 * s }}>
        <ValueBadge value={card.value} s={s} />
      </div>
    </Frame>
  );
}

function RentFace({ card, w }: { card: Extract<MonoCard, { kind: "rent" }>; w: number }) {
  const s = w / 84;
  const bg = card.wild
    ? `linear-gradient(135deg, ${RAINBOW[2]} 0%, ${RAINBOW[4]} 34%, ${RAINBOW[6]} 67%, ${RAINBOW[7]} 100%)`
    : `linear-gradient(135deg, ${COLOR_META[card.colors[0]].hex} 0% 50%, ${COLOR_META[card.colors[1]].hex} 50% 100%)`;
  return (
    <Frame w={w} border={INK} bg={CARD_FACE}>
      <div className="absolute inset-0" style={{ background: bg }} />
      <div
        className="absolute flex flex-col items-center justify-center rounded-full"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 52 * s,
          height: 52 * s,
          background: CARD_FACE,
          boxShadow: `0 0 0 ${1.4 * s}px ${INK}22`,
        }}
      >
        <span className={archivo.className} style={{ fontSize: 12.5 * s, color: INK }}>
          RENT
        </span>
        <ValueBadge value={card.value} s={s * 0.85} />
      </div>
      <span
        className="absolute inset-x-0 text-center font-bold uppercase"
        style={{
          bottom: 4.5 * s,
          fontSize: 4.6 * s,
          letterSpacing: "0.14em",
          color: "#fdf8ec",
          textShadow: "0 1px 2px rgba(0,0,0,0.45)",
        }}
      >
        {card.wild ? "any color · one player" : "all players pay"}
      </span>
    </Frame>
  );
}

export function MdCardFace({ card, w = 84, className = "" }: { card: MonoCard; w?: number; className?: string }) {
  const face =
    card.kind === "money" ? (
      <MoneyFace card={card} w={w} />
    ) : card.kind === "property" ? (
      <DeedFace card={card} w={w} />
    ) : card.kind === "wild" ? (
      <WildFace card={card} w={w} />
    ) : card.kind === "action" ? (
      <ActionFace card={card} w={w} />
    ) : (
      <RentFace card={card} w={w} />
    );
  return <div className={`shrink-0 ${className}`}>{face}</div>;
}

export function MdCardBack({ w = 84, className = "" }: { w?: number; className?: string }) {
  const s = w / 84;
  return (
    <div className={`shrink-0 ${className}`}>
      <Frame w={w} border={GREEN_DEEP} bg={GREEN_DEEP}>
        <div className="absolute inset-0" style={{ background: GUILLOCHE_DENSE }} />
        <div
          className="absolute flex items-center justify-center rounded-full"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 40 * s,
            height: 40 * s,
            border: `1.4px solid #f4efe466`,
          }}
        >
          <span className={archivo.className} style={{ fontSize: 12 * s, color: "#f4efe4" }}>
            MD
          </span>
        </div>
      </Frame>
    </div>
  );
}

/* ---------------- table minis ---------------- */

/** compact deed used inside table set groups; below w≈32 it renders as a token */
export function MdTableMini({ t, w = 40, onClick }: { t: TableCard; w?: number; onClick?: () => void }) {
  const s = w / 40;
  const meta = COLOR_META[t.color];
  const wild = t.card.kind === "wild";
  const tiny = w < 32;
  const name = t.card.kind === "property" ? t.card.name.split(" ")[0] : "WILD";
  const El = onClick ? "button" : "div";
  return (
    <El
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden text-left ${onClick ? "active:scale-95 transition-transform" : ""}`}
      style={{
        width: w,
        height: Math.round(w * 1.36),
        background: CARD_FACE,
        border: `1px solid ${INK}55`,
        borderRadius: 4 * s,
        boxShadow: "0 1px 2px rgba(33,28,18,0.2)",
      }}
    >
      <div style={{ height: (tiny ? 15 : 12) * s, background: wild && isAllColorWild(t.card) ? rainbowBar : meta.hex }} />
      {!tiny && (
        <span
          className="absolute inset-x-0 truncate text-center font-bold uppercase"
          style={{ top: 16 * s, fontSize: 6.2 * s, color: INK, padding: `0 ${2 * s}px` }}
        >
          {name}
        </span>
      )}
      {wild && (
        <span
          className="absolute inset-x-0 text-center font-semibold uppercase"
          style={{ bottom: (tiny ? 11 : 8) * s, fontSize: (tiny ? 7 : 5) * s, color: COPPER, letterSpacing: "0.08em" }}
        >
          {tiny ? "W" : "wild"}
        </span>
      )}
      <span
        className="absolute font-bold tabular-nums"
        style={{ bottom: 1.5 * s, right: 3 * s, fontSize: (tiny ? 8 : 6) * s, color: INK_SOFT }}
      >
        {tiny ? t.card.value : `$${t.card.value}M`}
      </span>
    </El>
  );
}

/** color progress chip for opponent ledgers */
export function SetChip({ color, count, complete }: { color: MonoColor; count: number; complete: boolean }) {
  const meta = COLOR_META[color];
  return (
    <span
      className="relative inline-flex items-center gap-[3px] rounded-[4px] px-[5px] py-[2px]"
      style={{
        background: complete ? meta.hex : `${meta.hex}2e`,
        border: `1px solid ${complete ? meta.hex : `${meta.hex}88`}`,
      }}
    >
      <span
        className="text-[9px] font-bold tabular-nums"
        style={{ color: complete ? meta.ink : INK }}
      >
        {count}/{meta.setSize}
      </span>
      {complete && <SealMark size={10} />}
    </span>
  );
}

/** tiny wax-seal check for completed sets */
export function SealMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill={GREEN_DEEP} stroke="#f4efe4" strokeWidth="1.1" />
      <circle cx="8" cy="8" r="5" fill="none" stroke="#f4efe488" strokeWidth="0.8" strokeDasharray="1.6 1.2" />
      <path d="M5 8.2 L7.2 10.4 L11.2 5.8" fill="none" stroke="#f4efe4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
