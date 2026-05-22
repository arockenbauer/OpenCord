import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const positionedRef = useRef(false);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
    setPositioned(false);
    setResolvedPosition(position);
    setStyle({});
    positionedRef.current = false;
  }, [position]);

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
      const padding = 8;

      let newStyle: React.CSSProperties = {};
      let finalPosition = position;

      if (position === 'top') {
        const top = triggerRect.top - tooltipRect.height - gap;
        finalPosition = top < padding ? 'bottom' : 'top';
        newStyle = {
          top: `${finalPosition === 'top' ? top : triggerRect.bottom + gap}px`,
          left: `${clamp(
            triggerRect.left + triggerRect.width / 2,
            padding + tooltipRect.width / 2,
            window.innerWidth - padding - tooltipRect.width / 2,
          )}px`,
          transform: 'translateX(-50%)',
        };
      } else if (position === 'bottom') {
        const top = triggerRect.bottom + gap;
        finalPosition = top + tooltipRect.height > window.innerHeight - padding ? 'top' : 'bottom';
        newStyle = {
          top: `${finalPosition === 'bottom' ? top : triggerRect.top - tooltipRect.height - gap}px`,
          left: `${clamp(
            triggerRect.left + triggerRect.width / 2,
            padding + tooltipRect.width / 2,
            window.innerWidth - padding - tooltipRect.width / 2,
          )}px`,
          transform: 'translateX(-50%)',
        };
      } else if (position === 'left') {
        const left = triggerRect.left - tooltipRect.width - gap;
        finalPosition = left < padding ? 'right' : 'left';
        newStyle = {
          top: `${clamp(
            triggerRect.top + triggerRect.height / 2,
            padding + tooltipRect.height / 2,
            window.innerHeight - padding - tooltipRect.height / 2,
          )}px`,
          left: `${finalPosition === 'left' ? left : triggerRect.right + gap}px`,
          transform: 'translateY(-50%)',
        };
      } else if (position === 'right') {
        const left = triggerRect.right + gap;
        finalPosition = left + tooltipRect.width > window.innerWidth - padding ? 'left' : 'right';
        newStyle = {
          top: `${clamp(
            triggerRect.top + triggerRect.height / 2,
            padding + tooltipRect.height / 2,
            window.innerHeight - padding - tooltipRect.height / 2,
          )}px`,
          left: `${finalPosition === 'right' ? left : triggerRect.left - tooltipRect.width - gap}px`,
          transform: 'translateY(-50%)',
        };
      }

      positionedRef.current = true;
      setStyle(newStyle);
      setResolvedPosition(finalPosition);
      setPositioned(true);
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
      {visible && content && createPortal(
        <div
          ref={tooltipRef}
          className={`${styles.tooltip} ${styles[resolvedPosition]}`}
          style={{ ...style, visibility: positioned ? 'visible' : 'hidden' }}
          role="tooltip"
        >
          <div className={styles.content}>{content}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
