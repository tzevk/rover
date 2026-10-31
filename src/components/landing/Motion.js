"use client";

import { motion, MotionConfig } from "motion/react";
import Link from "next/link";

const ease = [0.16, 1, 0.3, 1];

export function MotionRoot({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// The headline rises into place.
export function Headline({ text }) {
  return (
    <h1 className="headline-mask">
      <motion.span initial={{ y: "108%" }} animate={{ y: 0 }} transition={{ duration: 1.3, delay: 0.25, ease }}>{text}</motion.span>
    </h1>
  );
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

const MotionLink = motion.create(Link);
export function Action({ href, children, line = false }) {
  return (
    <MotionLink href={href} className={`act${line ? " act-line" : ""}`} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.3, ease }}>
      {children}
    </MotionLink>
  );
}
