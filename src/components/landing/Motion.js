"use client";

import { motion, MotionConfig } from "motion/react";

const ease = [0.16, 1, 0.3, 1];

export function MotionRoot({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Rise({ children, delay = 0, className, inView = false }) {
  const show = { opacity: 1, y: 0 };
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 22 }} transition={{ duration: 1, delay, ease }}
      {...(inView ? { whileInView: show, viewport: { once: true, margin: "-10% 0px" } } : { animate: show })}>
      {children}
    </motion.div>
  );
}
