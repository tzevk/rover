import { Bodoni_Moda, Kalam, Martian_Mono, Rozha_One, Schibsted_Grotesk, Tiro_Devanagari_Marathi } from "next/font/google";

const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--f-display" });
const text = Schibsted_Grotesk({ subsets: ["latin"], variable: "--f-text" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--f-mono" });
const marathi = Tiro_Devanagari_Marathi({ subsets: ["devanagari"], weight: "400", variable: "--f-marathi", preload: false });

// Sign painter's lettering and shop handwriting, both with Devanagari so Marathi names work.
const sign = Rozha_One({ subsets: ["latin", "devanagari"], weight: "400", variable: "--f-sign", preload: false });
const hand = Kalam({ subsets: ["latin", "devanagari"], weight: "400", variable: "--f-hand", preload: false });

export const fontClasses = `${display.variable} ${text.variable} ${mono.variable} ${marathi.variable} ${sign.variable} ${hand.variable}`;
