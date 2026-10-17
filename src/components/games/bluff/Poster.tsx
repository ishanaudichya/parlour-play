/* Game-picker poster for Bluff — a tailgate: rani-pink and marigold stripes,
   three cards fanned face down with the evil eye on them, and BLUFF! painted
   across in brush letters with a hard shadow. */

import { CardBack } from "./Card";
import { paint } from "./font";
import { CREAM, INK, JHALAR, lettering, MARIGOLD, NIGHT, PINK } from "./palette";

export function BluffPoster() {
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg"
      style={{ background: `repeating-linear-gradient(-45deg, ${NIGHT} 0 14px, #12285a 14px 28px)`, border: `2px solid ${INK}` }}
    >
      <div className="absolute inset-x-0 top-0 h-[9px]" style={{ background: JHALAR }} />
      <div className="relative mt-2 h-[92px] w-[150px]">
        {[-16, 0, 16].map((r, i) => (
          <div key={r} className="absolute left-1/2 top-0" style={{ transform: `translateX(-50%) translateX(${(i - 1) * 30}px) rotate(${r}deg)`, transformOrigin: "50% 120%", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.5))" }}>
            <CardBack w={58} />
          </div>
        ))}
      </div>
      <div className={`${paint.className} relative -mt-1 -rotate-3 rounded-lg px-4 py-0.5 text-[40px] leading-none`} style={{ color: CREAM, background: PINK, border: `2.5px solid ${INK}`, textShadow: lettering(2), boxShadow: `3px 3px 0 ${INK}` }}>
        Bluff!
      </div>
      <div className={`${paint.className} relative mt-1.5 text-[13px]`} style={{ color: MARIGOLD }}>
        three kings · honest · probably
      </div>
    </div>
  );
}
