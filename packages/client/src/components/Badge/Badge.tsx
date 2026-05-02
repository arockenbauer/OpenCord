import styles from './Badge.module.css';
import { Tooltip } from '../Tooltip/Tooltip';

const StaffSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#5865F2"/>
    <path d="M6 10h8M10 6v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const PartnerSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 1l2.2 4.6 5 .7-3.6 3.5.85 5.05L10 12.4l-4.45 2.45.85-5.05L2.8 6.3l5-.7L10 1z" fill="#3BA55C"/>
    <path d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const HypesquadSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 1.5l7 4v9l-7 4-7-4v-9l7-4z" fill="#FEE75C"/>
    <path d="M10 5.5l3.5 2v5L10 15l-3.5-2.5v-5L10 5.5z" fill="#2C2F33" opacity="0.4"/>
  </svg>
);

const BugHunterSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#1EBE5E"/>
    <path d="M7 7.5c0-1.657 1.343-3 3-3s3 1.343 3 3v5c0 1.657-1.343 3-3 3s-3-1.343-3-3v-5z" fill="white" opacity="0.9"/>
    <circle cx="10" cy="10" r="1.5" fill="#1EBE5E"/>
    <path d="M6 8h1.5M12.5 8H14M6 12h1.5M12.5 12H14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const EarlySupporterSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#7B68EE"/>
    <path d="M10 4l1.5 4.5H16l-3.5 2.5 1.3 4.5L10 13l-3.8 2.5 1.3-4.5L4 8.5h4.5L10 4z" fill="white"/>
  </svg>
);

const BoosterSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="url(#boostGrad)"/>
    <defs>
      <linearGradient id="boostGrad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF73FA"/>
        <stop offset="1" stopColor="#7367F0"/>
      </linearGradient>
    </defs>
    <path d="M10 3l1.2 3.8L15 5.5l-2.5 3 2.5 1.5-2.5 1.5L15 14.5l-3.8-1.2L10 17l-1.2-3.7L5 14.5l2.5-3.5L5 9.5l2.5-1.5L5 5.5l3.8 1.3L10 3z" fill="white"/>
  </svg>
);

const NitroSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="url(#nitroGrad)"/>
    <defs>
      <linearGradient id="nitroGrad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5865F2"/>
        <stop offset="1" stopColor="#4752C4"/>
      </linearGradient>
    </defs>
    <path d="M6.5 10c0 0 2 3.5 3.5 3.5s3.5-3.5 3.5-3.5-2-3.5-3.5-3.5S6.5 10 6.5 10z" fill="white"/>
    <circle cx="10" cy="10" r="2" fill="#5865F2"/>
  </svg>
);

const DeveloperSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="#5865F2"/>
    <path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CEОSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="url(#ceoGrad)"/>
    <defs>
      <linearGradient id="ceoGrad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFD700"/>
        <stop offset="1" stopColor="#FF8C00"/>
      </linearGradient>
    </defs>
    <path d="M10 3l1.5 4 4 .5-3 3 .7 4.5L10 13l-3.2 2 .7-4.5-3-3 4-.5L10 3z" fill="white"/>
  </svg>
);

const PlusSVG = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="10" fill="url(#plusGrad)"/>
    <defs>
      <linearGradient id="plusGrad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F0B132"/>
        <stop offset="1" stopColor="#FF8C00"/>
      </linearGradient>
    </defs>
    <path d="M10 3l1.5 4 4 .5-3 3 .7 4.5L10 13l-3.2 2 .7-4.5-3-3 4-.5L10 3z" fill="white"/>
  </svg>
);

function resolveIcon(badge: { name: string; icon?: string; label?: string; color?: string }): React.ReactNode {
  const name = badge.name.toLowerCase();

  if (badge.icon?.startsWith('http')) {
    return <img src={badge.icon} alt="" className={styles.badgeImg} />;
  }

  if (badge.icon && [...badge.icon].length <= 2) {
    return <span className={styles.badgeEmoji}>{badge.icon}</span>;
  }

  if (name.includes('ceo')) return <CEОSVG />;
  if (name.includes('staff')) return <StaffSVG />;
  if (name.includes('partner')) return <PartnerSVG />;
  if (name.includes('developer') || name.includes('dev')) return <DeveloperSVG />;
  if (name.includes('bug') || name.includes('hunter')) return <BugHunterSVG />;
  if (name.includes('hypesquad') || name.includes('hype')) return <HypesquadSVG />;
  if (name.includes('early') || name.includes('supporter')) return <EarlySupporterSVG />;
  if (name.includes('booster')) return <BoosterSVG />;
  if (name.includes('nitro') || name.includes('plus') || name.includes('subscriber')) return <NitroSVG />;

  const initial = (badge.label || badge.name).slice(0, 1).toUpperCase();
  return <span className={styles.badgeInitial}>{initial}</span>;
}

function getBadgeBackground(badge: {
  display_type?: string;
  gradient_start?: string;
  gradient_end?: string;
  background_color?: string;
  color?: string;
}): string {
  if (badge.display_type === 'premium') {
    return `linear-gradient(135deg, ${badge.gradient_start || '#FF73FA'}, ${badge.gradient_end || '#7367F0'})`;
  }
  return badge.background_color || badge.color || '#5865F2';
}

interface BadgeProps {
  badge: {
    id: string;
    name: string;
    label?: string;
    description?: string;
    icon?: string;
    color?: string;
    display_type?: string;
    background_color?: string;
    text_color?: string;
    border_color?: string;
    gradient_start?: string;
    gradient_end?: string;
    glow?: boolean;
    glow_color?: string;
    icon_position?: string;
  };
  variant?: 'inline' | 'card';
  className?: string;
}

export function Badge({ badge, className = '' }: BadgeProps) {
  const tooltipText = badge.description || badge.label || badge.name;
  const bg = getBadgeBackground(badge);
  const showGlow = badge.display_type === 'premium' && badge.glow;

  return (
    <Tooltip content={tooltipText} position="top" delay={200}>
      <span
        className={`${styles.badge} ${className}`}
        style={{ background: bg }}
        aria-label={tooltipText}
      >
        {showGlow && (
          <span
            className={styles.badgeGlow}
            style={{ background: badge.glow_color || badge.gradient_start || '#FF73FA' }}
          />
        )}
        {resolveIcon(badge)}
      </span>
    </Tooltip>
  );
}
