export const POSTER_ASPECT_MODES = ['portrait', 'landscape', 'banner'] as const;

export type PosterAspectMode = (typeof POSTER_ASPECT_MODES)[number];

export const DEFAULT_POSTER_ASPECT_MODE: PosterAspectMode = 'landscape';

export const POSTER_ASPECT_RATIOS: Record<PosterAspectMode, number> = {
  portrait: 4 / 5,
  landscape: 16 / 9,
  banner: 19 / 6,
};

export function parsePosterAspectMode(value: unknown): PosterAspectMode {
  if (typeof value === 'string' && POSTER_ASPECT_MODES.includes(value as PosterAspectMode)) {
    return value as PosterAspectMode;
  }
  throw new Error('Poster aspect mode tidak valid.');
}

export function normalizePosterAspectMode(value: unknown): PosterAspectMode {
  return typeof value === 'string' && POSTER_ASPECT_MODES.includes(value as PosterAspectMode)
    ? value as PosterAspectMode
    : DEFAULT_POSTER_ASPECT_MODE;
}

export function getPosterAspectRatio(value: unknown): number {
  return POSTER_ASPECT_RATIOS[normalizePosterAspectMode(value)];
}
