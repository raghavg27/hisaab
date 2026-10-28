'use client';
import { motion, useAnimation, type Transition, type Variants } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/prefs';

/*
 * Animated icons from lucide-animated.com (MIT, built on lucide and motion). They keep lucide-react's
 * names and props, so a call site swaps only its import. Variants propagate from the root svg, so each
 * part declares just its own `normal`/`animate` states.
 */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

/** Plays when the link or button it sits in is hovered, focused or tapped; a tap plays it through and back. */
function AnimatedIcon({
  size = 24,
  strokeWidth = 2,
  className,
  variants,
  transition,
  children,
}: IconProps & { variants?: Variants; transition?: Transition; children: ReactNode }) {
  const controls = useAnimation();
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const host = ref.current?.closest('a, button');
    if (!host) return;
    const play = () => (prefersReducedMotion() ? Promise.resolve() : controls.start('animate'));
    const rest = () => void controls.start('normal');
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && void play();
    const leave = (e: PointerEvent) => e.pointerType === 'mouse' && rest();
    const press = (e: PointerEvent) => e.pointerType !== 'mouse' && void play().then(rest);
    const focus = () => host.matches(':focus-visible') && void play();
    host.addEventListener('pointerenter', enter as EventListener);
    host.addEventListener('pointerleave', leave as EventListener);
    host.addEventListener('pointerdown', press as EventListener);
    host.addEventListener('focusin', focus);
    host.addEventListener('focusout', rest);
    return () => {
      host.removeEventListener('pointerenter', enter as EventListener);
      host.removeEventListener('pointerleave', leave as EventListener);
      host.removeEventListener('pointerdown', press as EventListener);
      host.removeEventListener('focusin', focus);
      host.removeEventListener('focusout', rest);
    };
  }, [controls]);

  return (
    <motion.svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      animate={controls}
      variants={variants}
      transition={transition}
    >
      {children}
    </motion.svg>
  );
}

const NUDGE: Transition = { times: [0, 0.4, 1], duration: 0.5 };
const PERSON = (
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
  </>
);
const SHACKLE = 'M7 11V7a5 5 0 0 1 10 0v4';

export function ArrowLeft(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.path
        d="m12 19-7-7 7-7"
        variants={{ normal: { x: 0 }, animate: { x: [0, 3, 0], transition: { duration: 0.4 } } }}
      />
      <motion.path
        d="M19 12H5"
        variants={{
          normal: { d: 'M19 12H5' },
          animate: { d: ['M19 12H5', 'M19 12H10', 'M19 12H5'], transition: { duration: 0.4 } },
        }}
      />
    </AnimatedIcon>
  );
}

export function Check(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.path
        d="M4 12 9 17L20 6"
        variants={{
          normal: {
            opacity: 1,
            pathLength: 1,
            scale: 1,
            transition: { duration: 0.3, opacity: { duration: 0.1 } },
          },
          animate: {
            opacity: [0, 1],
            pathLength: [0, 1],
            scale: [0.5, 1],
            transition: { duration: 0.4, opacity: { duration: 0.1 } },
          },
        }}
      />
    </AnimatedIcon>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.path
        d="m6 9 6 6 6-6"
        transition={NUDGE}
        variants={{ normal: { y: 0 }, animate: { y: [0, 2, 0] } }}
      />
    </AnimatedIcon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.path
        d="m9 18 6-6-6-6"
        transition={NUDGE}
        variants={{ normal: { x: 0 }, animate: { x: [0, 2, 0] } }}
      />
    </AnimatedIcon>
  );
}

export function Copy(props: IconProps) {
  const spring: Transition = { type: 'spring', stiffness: 160, damping: 17, mass: 1 };
  return (
    <AnimatedIcon {...props}>
      <motion.rect
        width="14"
        height="14"
        x="8"
        y="8"
        rx="2"
        ry="2"
        transition={spring}
        variants={{ normal: { x: 0, y: 0 }, animate: { x: -3, y: -3 } }}
      />
      <motion.path
        d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        transition={spring}
        variants={{ normal: { x: 0, y: 0 }, animate: { x: 3, y: 3 } }}
      />
    </AnimatedIcon>
  );
}

export function Download(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <motion.g
        variants={{
          normal: { y: 0 },
          animate: { y: 2, transition: { type: 'spring', stiffness: 200, damping: 10, mass: 1 } },
        }}
      >
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </motion.g>
    </AnimatedIcon>
  );
}

export function History(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.g
        transition={{ type: 'spring', stiffness: 250, damping: 25 }}
        variants={{ normal: { rotate: '0deg' }, animate: { rotate: '-50deg' } }}
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </motion.g>
      <motion.line
        x1="12"
        x2="12"
        y1="12"
        y2="7"
        style={{ originX: '0%', originY: '100%' }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        variants={{ normal: { rotate: 0 }, animate: { rotate: -360 } }}
      />
      <motion.line
        x1="12"
        x2="16"
        y1="12"
        y2="14"
        style={{ originX: '0%', originY: '0%' }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        variants={{ normal: { rotate: 0 }, animate: { rotate: -45 } }}
      />
    </AnimatedIcon>
  );
}

export function Home(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <motion.path
        d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"
        transition={{ duration: 0.6, opacity: { duration: 0.2 } }}
        variants={{ normal: { pathLength: 1, opacity: 1 }, animate: { pathLength: [0, 1], opacity: [0, 1] } }}
      />
    </AnimatedIcon>
  );
}

export function Link2(props: IconProps) {
  const shake: Transition = { duration: 0.6, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' };
  return (
    <AnimatedIcon {...props}>
      <motion.g variants={{ normal: { x: 0 }, animate: { x: [0, -0.7, 0.3, 0], transition: shake } }}>
        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
        <line x1="8" x2="12" y1="12" y2="12" />
      </motion.g>
      <motion.g variants={{ normal: { x: 0 }, animate: { x: [0, 0.7, -0.3, 0], transition: shake } }}>
        <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
        <line x1="16" x2="12" y1="12" y2="12" />
      </motion.g>
    </AnimatedIcon>
  );
}

export function Lock(props: IconProps) {
  return (
    <AnimatedIcon
      {...props}
      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      variants={{
        normal: { rotate: 0, scale: 1 },
        animate: { rotate: [-3, 1, -2, 0], scale: [0.95, 1.05, 0.98, 1] },
      }}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <motion.path
        d={SHACKLE}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        variants={{ normal: { pathLength: 1 }, animate: { pathLength: 0.7 } }}
      />
    </AnimatedIcon>
  );
}

export function Unlock(props: IconProps) {
  return (
    <AnimatedIcon
      {...props}
      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      variants={{
        normal: { rotate: 0, scale: 1 },
        animate: { rotate: [2, 4, -2, 0], scale: [1.05, 0.95, 1.02, 1] },
      }}
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <motion.path
        d={SHACKLE}
        initial="normal"
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        variants={{ normal: { pathLength: 0.8 }, animate: { pathLength: 1 } }}
      />
    </AnimatedIcon>
  );
}

export function LogOut(props: IconProps) {
  const slide: Variants = { normal: { x: 0 }, animate: { x: [0, -3, 0], transition: { duration: 0.4 } } };
  return (
    <AnimatedIcon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <motion.polyline points="16 17 21 12 16 7" variants={slide} />
      <motion.line x1="21" x2="9" y1="12" y2="12" variants={slide} />
    </AnimatedIcon>
  );
}

export function Play(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.polygon
        points="6 3 20 12 6 21 6 3"
        variants={{
          normal: { x: 0, rotate: 0 },
          animate: {
            x: [0, -1, 2, 0],
            rotate: [0, -10, 0, 0],
            transition: { duration: 0.5, times: [0, 0.2, 0.5, 1] },
          },
        }}
      />
    </AnimatedIcon>
  );
}

export function Plus(props: IconProps) {
  return (
    <AnimatedIcon
      {...props}
      transition={{ type: 'spring', stiffness: 100, damping: 15 }}
      variants={{ normal: { rotate: 0 }, animate: { rotate: 180 } }}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </AnimatedIcon>
  );
}

export function User(props: IconProps) {
  const draw = { pathLength: [0, 1], pathOffset: [1, 0] };
  return (
    <AnimatedIcon {...props}>
      <motion.circle
        cx="12"
        cy="8"
        r="5"
        variants={{
          normal: { pathLength: 1, pathOffset: 0, scale: 1 },
          animate: { ...draw, scale: [0.5, 1] },
        }}
      />
      <motion.path
        d="M20 21a8 8 0 0 0-16 0"
        transition={{ delay: 0.2, duration: 0.4 }}
        variants={{
          normal: { pathLength: 1, pathOffset: 0, opacity: 1 },
          animate: { ...draw, opacity: [0, 1] },
        }}
      />
    </AnimatedIcon>
  );
}

export function UserCheck(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      {PERSON}
      <motion.path
        d="M16 11L18 13L22 9"
        style={{ transformOrigin: 'center' }}
        variants={{
          normal: { pathLength: 1, opacity: 1, transition: { duration: 0.3 } },
          animate: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.4, ease: 'easeInOut' } },
        }}
      />
    </AnimatedIcon>
  );
}

export function UserPlus(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      {PERSON}
      <motion.g
        style={{ transformOrigin: '19px 11px' }}
        variants={{
          normal: { scale: 1, rotate: 0, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
          animate: {
            scale: [0, 1.15, 1],
            rotate: [-90, 0, 0],
            opacity: [0, 1, 1],
            transition: { delay: 0.25, duration: 0.45, ease: 'easeOut', times: [0, 0.7, 1] },
          },
        }}
      >
        <line x1="19" x2="19" y1="8" y2="14" />
        <line x1="22" x2="16" y1="11" y2="11" />
      </motion.g>
    </AnimatedIcon>
  );
}

export function Users(props: IconProps) {
  const spring = { type: 'spring', stiffness: 200, damping: 13 } as const;
  const slide: Variants = {
    normal: { x: 0, transition: spring },
    animate: { x: [-6, 0], transition: { ...spring, delay: 0.1 } },
  };
  return (
    <AnimatedIcon {...props}>
      {PERSON}
      <motion.path d="M22 21v-2a4 4 0 0 0-3-3.87" variants={slide} />
      <motion.path d="M16 3.13a4 4 0 0 1 0 7.75" variants={slide} />
    </AnimatedIcon>
  );
}

export function Zap(props: IconProps) {
  return (
    <AnimatedIcon {...props}>
      <motion.path
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
        transition={{ duration: 0.6, opacity: { duration: 0.1 } }}
        variants={{ normal: { opacity: 1, pathLength: 1 }, animate: { opacity: [0, 1], pathLength: [0, 1] } }}
      />
    </AnimatedIcon>
  );
}
