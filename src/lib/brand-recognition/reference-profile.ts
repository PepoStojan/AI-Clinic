// Compact ground-truth profile used to judge whether a provider's answer
// describes the right company (Build Spec section 14). Built entirely from
// submitted audit data -- no live website fetch in this MVP pass (keeps
// this practical and avoids building a web crawler; see the COMP-001
// completion report for the tradeoff).

export interface ReferenceProfile {
  brandName: string;
  registeredDomain: string;
  websiteUrl: string;
  productName: string | null;
}

export function buildReferenceProfile(input: {
  companyName: string;
  registeredDomain: string;
  websiteUrl: string;
  productName?: string | null;
}): ReferenceProfile {
  return {
    brandName: input.companyName,
    registeredDomain: input.registeredDomain,
    websiteUrl: input.websiteUrl,
    productName: input.productName ?? null,
  };
}

export function buildBrandRecognitionPrompt(brandName: string): string {
  return (
    `Answer the following three questions about "${brandName}" as accurately and ` +
    `concisely as you can, based on what you know:\n` +
    `1. What is ${brandName}?\n` +
    `2. What does ${brandName} offer?\n` +
    `3. What kind of company is ${brandName}?`
  );
}
