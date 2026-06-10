"use client";

import { useEffect, useState } from "react";

export interface NavSection {
  id: string;
  label: string;
}

/**
 * Sticky right-hand "hot bar" for the grant detail page. Lists the page's sections,
 * highlights the one in view, and on click opens the target (if it's a collapsible
 * <details>) and smooth-scrolls to it. Hidden on narrow viewports.
 */
export function GrantSectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!wide) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections, wide]);

  function go(e: React.MouseEvent, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  if (!wide || sections.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      style={{
        position: "sticky",
        top: 24,
        flexShrink: 0,
        width: 210,
        alignSelf: "flex-start",
        borderLeft: "1px solid var(--border)",
        paddingLeft: 16,
      }}
    >
      <div
        className="eyebrow"
        style={{ marginBottom: 10, fontSize: 10.5, color: "var(--muted)" }}
      >
        On this page
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id} style={{ marginBottom: 2 }}>
              <a
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                style={{
                  display: "block",
                  padding: "5px 10px",
                  fontSize: 12.5,
                  borderRadius: 6,
                  textDecoration: "none",
                  lineHeight: 1.3,
                  color: isActive ? "var(--accent)" : "var(--ink-2)",
                  background: isActive ? "var(--accent-tint)" : "transparent",
                  fontWeight: isActive ? 600 : 400,
                  borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                }}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
