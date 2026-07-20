const WINDOW_PATTERN =
  "linear-gradient(90deg, transparent 48%, rgba(217,183,122,.08) 49%, rgba(217,183,122,.08) 51%, transparent 52%), linear-gradient(0deg, transparent 48%, rgba(217,183,122,.06) 49%, rgba(217,183,122,.06) 51%, transparent 52%)";

export function MafiaPoster() {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#090b0d] text-[#eee6d7]"
      style={{
        background:
          "radial-gradient(circle at 72% 24%, rgba(224,196,137,.13), transparent 19%), linear-gradient(145deg, #15191b 0%, #090b0d 62%, #070708 100%)",
      }}
    >
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: WINDOW_PATTERN, backgroundSize: "64px 64px" }} />
      <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full border border-[#d8bd88]/10 shadow-[0_0_60px_rgba(220,191,133,.08)]" />
      <div className="absolute bottom-0 left-1/2 h-[58%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#b3935c]/35 to-[#b3935c]/5" />

      <div className="relative mb-3 grid h-[76px] w-[76px] place-items-center rounded-full border border-[#bca06c]/45 bg-black/45 shadow-[0_10px_40px_rgba(0,0,0,.7)]">
        <svg
          viewBox="0 0 64 64"
          className="h-12 w-12 text-[#d1b77f]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden
        >
          <path d="M20 48c1-10 5-17 12-20 7 3 11 10 12 20" />
          <path d="M24 29c0-8 3-14 8-14s8 6 8 14" />
          <path d="M19 23h26M23 18h18" />
          <path d="M27 34h10M22 44h20" opacity=".55" />
          <path d="M16 51h32" />
        </svg>
      </div>

      <div className="relative text-center">
        <div className="text-[19px] font-semibold tracking-[0.48em] text-[#e7d5ae]">MAFIA</div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.3em] text-[#8f918f]">
          Trust no one after dark
        </div>
      </div>

      <div className="pointer-events-none absolute inset-[7px] rounded-md border border-[#b79a66]/20" aria-hidden />
    </div>
  );
}
