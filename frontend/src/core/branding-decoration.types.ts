/** Shared W2-C theme decoration contract: purely visual, never tied to festival names. */
export type DecorationStyle = 'NONE' | 'CORNERS' | 'PATTERN' | 'CONFETTI' | 'BORDER';
export type DecorationIntensity = 'SUBTLE' | 'BALANCED' | 'FESTIVE';
export type DecorationCardTreatment = 'SOLID' | 'DECORATIVE' | 'IMAGE_OVERLAY';
export type DecorationHeaderTreatment = 'SOLID' | 'DECORATIVE' | 'IMAGE';
export type DecorationPattern = 'NONE' | 'DOTS' | 'SPARKLES' | 'DIAMONDS';
export type DecorationBorderStyle = 'NONE' | 'SOLID' | 'ELEGANT';

export type BrandingDecorationConfig = {
  style: DecorationStyle;
  intensity: DecorationIntensity;
  cardTreatment: DecorationCardTreatment;
  headerTreatment: DecorationHeaderTreatment;
  pattern: DecorationPattern;
  borderStyle: DecorationBorderStyle;
  /** Shared image for all decorative cards, separate from the page background. */
  cardBackgroundImageUrl?: string | null;
};

export const DEFAULT_DECORATION: BrandingDecorationConfig = {
  style: 'NONE',
  intensity: 'SUBTLE',
  cardTreatment: 'SOLID',
  headerTreatment: 'SOLID',
  pattern: 'NONE',
  borderStyle: 'NONE',
};

export function resolveDecoration(value?: Partial<BrandingDecorationConfig> | null): BrandingDecorationConfig {
  return { ...DEFAULT_DECORATION, ...value };
}

// Module augmentation avoids rewriting unrelated domain entities.
declare module "./domain/entities" {
  interface OrganizationBranding {
    decoration?: BrandingDecorationConfig | null;
  }
}
