'use client';
// Loaded on demand by useMotion, so none of this sits in front of the first paint.
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };

/** Lenis smooth scroll on GSAP's ticker, so ScrollTrigger scrubs stay in step. Returns the teardown. */
export function smoothScroll() {
  const lenis = new Lenis({ autoRaf: false, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
  };
}
