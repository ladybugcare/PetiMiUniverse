import { useCallback } from 'react';

interface HoverHandlers {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
}

export const useHoverEffect = (color?: string, enabled: boolean = true): HoverHandlers => {
  const shadowColor = color ? `${color}25` : 'rgba(0, 0, 0, 0.1)';

  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 10px 25px ${shadowColor}`;
    },
    [enabled, shadowColor]
  );

  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
    },
    [enabled]
  );

  return { onMouseEnter, onMouseLeave };
};

