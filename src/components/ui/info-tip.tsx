"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  text: string;
  label?: string;
  className?: string;
}

/**
 * Datasheet `[?]` micro-tooltip rendered via portal so parent `overflow-x-auto`
 * tables never clip the explanation. Strictly adheres to DESIGN.md (rounded-[2px],
 * 1px #232320 hairline border, #111110 matte carbon surface, zero drop shadows).
 */
export function InfoTip({ text, label = "Explain metric", className }: InfoTipProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = 276;
    const half = tooltipWidth / 2;
    const center = rect.left + rect.width / 2;
    const clampedLeft = Math.max(
      12 + half,
      Math.min(window.innerWidth - 12 - half, center)
    );
    const above = rect.bottom + 96 > window.innerHeight && rect.top > 96;
    setCoords({
      top: above ? rect.top - 6 : rect.bottom + 6,
      left: clampedLeft,
      above,
    });
  }, []);

  const handleOpen = () => {
    updatePosition();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onFocus={handleOpen}
        onBlur={handleClose}
        onClick={(e) => {
          e.stopPropagation();
          if (open) handleClose();
          else handleOpen();
        }}
        className={cn(
          "ml-1.5 inline-flex items-center font-mono text-[10px] font-normal tracking-normal text-[#63635E] transition-colors hover:text-[#FF5500] focus:text-[#FF5500] focus:outline-none",
          className
        )}
      >
        [?]
      </button>
      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.above ? "translate(-50%, -100%)" : "translateX(-50%)",
              width: 276,
            }}
            className="pointer-events-none z-50 rounded-[2px] border border-[#232320] bg-[#111110] px-2.5 py-2 font-sans text-[11px] font-normal normal-case leading-snug tracking-normal text-[#EDEDEC]"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
