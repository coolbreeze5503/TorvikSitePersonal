"use client";

import { useState } from "react";

export default function Avatar({
  src,
  fallbackText,
  size = 32,
  rounded = "full",
}: {
  src: string | null;
  fallbackText: string;
  size?: number;
  rounded?: "full" | "none";
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={`inline-flex items-center justify-center bg-accent-dim font-bold text-white shrink-0 ${
          rounded === "full" ? "rounded-full" : ""
        }`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {fallbackText.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN images (ESPN), not worth Next's Image optimization pipeline for a personal project
    <img
      src={src}
      alt={fallbackText}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-contain shrink-0 ${rounded === "full" ? "rounded-full" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
