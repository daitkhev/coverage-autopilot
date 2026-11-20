import type { Verdict } from '#verification/domain/entities/verdict.entity';

export type Start = (verdict: Verdict) => void;
