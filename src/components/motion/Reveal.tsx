import { cn } from "@/lib/utils";
import { useInView } from "@/lib/motion/useInView";

/**
 * Reveals its children (rise + fade) the first time they scroll into view.
 *
 * CSS transitions rather than a motion library: the landing page ships in the
 * eager entry chunk, and this keeps the whole effect at roughly a line of CSS
 * instead of ~34kB of JavaScript before first paint. `prefers-reduced-motion`
 * is handled globally in index.css.
 */
export function Reveal({
  children,
  className,
  /** Stagger, in ms — pass an index * step for a sequence. */
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "span";
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-3.5 opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
