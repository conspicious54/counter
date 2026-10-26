// Deterministic spelling corrections, never nutrition or ingredient substitutions.
export function foodSpelling(text: string) {
  return text.replace(/\bspagetti\b/gi, "spaghetti").replace(/\bzuchini\b/gi, "zucchini");
}
