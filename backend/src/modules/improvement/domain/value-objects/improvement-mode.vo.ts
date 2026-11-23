/** Review mode stops before publishing and waits for a person. */
export const IMPROVEMENT_MODES = ['automatic', 'review'] as const;

export type ImprovementMode = (typeof IMPROVEMENT_MODES)[number];
