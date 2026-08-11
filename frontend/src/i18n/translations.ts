import { en } from "./en";

export const translations = { en } as const;

export type Locale = keyof typeof translations;
export type Translation = typeof en;
