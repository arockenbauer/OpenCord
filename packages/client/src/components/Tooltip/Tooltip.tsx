import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const positionedRef = useRef(false);

  const showTooltip = useCallback(() => {
    if (disabled || !content) return;
    timeoutRef.current = setTimeout(() => {
      positionedRef.current = false;
      setVisible(true);
    }, delay);
  }, [disabled, content, delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
    setStyle({});
    positionedRef.current = false;
  }, []);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // After tooltip renders, read actual dimensions and reposition
  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    if (positionedRef.current) return;

    // Small delay to ensure layout is complete
    const raf = requestAnimationFrame(() => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const gap = 10;

      let newStyle: React.CSSProperties = {};

      if (position === 'top') {
        // Place tooltip's TOP edge above trigger with gap
        newStyle = {
          top: `${triggerRect.top - tooltipRect.height - gap}px`,
          left: `${triggerRect.left + triggerRect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      } else if (position === 'bottom') {
        // Place tooltip's BOTTOM edge below trigger with gap
        newStyle = {
          top: `${triggerRect.bottom + gap}px`,
          left: `${triggerRect.left + triggerRect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      } else if (position === 'left') {
        // Place tooltip's RIGHT edge to the left of trigger with gap
        newStyle = {
          top: `${triggerRect.top + triggerRect.height / 2}px`,
          left: `${triggerRect.left - tooltipRect.width - gap}px`,
          transform: 'translateY(-50%)',
        };
      } else if (position === 'right') {
        // Place tooltip's LEFT edge to the right of trigger with gap
        newStyle = {
          top: `${triggerRect.top + triggerRect.height / 2}px`,
          left: `${triggerRect.right + gap}px`,
          transform: 'translateY(-50%)',
        };
      }

      positionedRef.current = true;
      setStyle(newStyle);
    });

    return () => cancelAnimationFrame(raf);
  }, [visible, position]);

  return (
    <div
      ref={triggerRef}
      className={styles.trigger}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {visible && content && (
        <div
          ref={tooltipRef}
          className={styles.tooltip}
          style={style}
          role="tooltip"
        >
          <div className={styles.content}>{content}</div>
        </div>
      )}
    </div>
  );
}