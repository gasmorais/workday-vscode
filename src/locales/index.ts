import { en } from "./en.js";
import { ptBR, type Strings } from "./pt-br.js";

export type { Strings };

const CATALOG: Record<string, Strings> = { "pt-br": ptBR, pt: ptBR, en };

export const DEFAULT_LOCALE = "en";

export function stringsFor(language: string | undefined): Strings {
  const tag = (language ?? DEFAULT_LOCALE).toLowerCase();
  return CATALOG[tag] ?? CATALOG[tag.split("-")[0]] ?? en;
}

export let t: Strings = ptBR;

export function useLocale(language: string | undefined): void {
  t = stringsFor(language);
}
