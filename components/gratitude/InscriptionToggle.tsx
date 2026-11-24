"use client";

import { useState } from "react";

/** Opens the full inscription; the names themselves are server-rendered. */
export default function InscriptionToggle({ count }: { count: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="gr-btn gr-more"
      aria-controls="gr-inscription"
      aria-expanded={open}
      onClick={() => {
        document
          .getElementById("gr-inscription")
          ?.classList.toggle("is-clipped", open);
        setOpen(!open);
      }}
    >
      {open ? "Show fewer" : `Show all ${count} names`}
    </button>
  );
}
