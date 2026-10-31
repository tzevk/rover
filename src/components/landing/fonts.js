import { Bodoni_Moda, Martian_Mono, Schibsted_Grotesk, Tiro_Devanagari_Marathi } from "next/font/google";

const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--f-display" });
const text = Schibsted_Grotesk({ subsets: ["latin"], variable: "--f-text" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--f-mono" });
const marathi = Tiro_Devanagari_Marathi({ subsets: ["devanagari"], weight: "400", variable: "--f-marathi", preload: false });

export const fontClasses = `${display.variable} ${text.variable} ${mono.variable} ${marathi.variable}`;
