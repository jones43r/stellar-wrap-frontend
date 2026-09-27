import { parseHorizonError } from './horizonErrorHandler';
import { useRateLimitStore } from '../store/rateLimitStore';
import { logger } from '../../app/utils/logger';
import { RequestQueue, type RetryDecision } from './requestQueue';

const log = logger.child('horizonRequestQueue');

async function classifyHorizonError(error: unknown): Promise<RetryDecision> {
    const structuredError = await parseHorizonError(error);
    const rateLimit = structuredError.type === 'RATE_LIMIT' ? structuredError.rateLimit : undefined;
    return {
        retryable: structuredError.isRetryable,
        error: structuredError,
        retryAfterMs: structuredError.rateLimit?.retryAfterSeconds
            ? structuredError.rateLimit.retryAfterSeconds * 1000
            : undefined,
        rateLimitResetMs: rateLimit ? rateLimit.reset * 1000 : undefined,
    };
}

/** Horizon configuration of the shared {@link RequestQueue}. */
export class HorizonRequestQueue extends RequestQueue {
    constructor(maxConcurrency: number = 2) {
        super({
            name: 'Horizon',
            maxConcurrency,
            maxAttempts: 5,
            initialBackoffMs: 1000,
            classifyError: classifyHorizonError,
            onRetry: (attempt, delay, error) => {
                useRateLimitStore.getState().setRetryAttempt(attempt);
                useRateLimitStore.getState().setMessage(`Retrying in ${Math.ceil(delay / 1000)}s...`);
                log.warn(
                    `Retrying Horizon request (attempt ${attempt}) in ${delay}ms: ${(error as Error).message}`,
                );
            },
            onGiveUp: () => useRateLimitStore.getState().setMessage(null),
            onRateLimit: (resetMs) => {
                useRateLimitStore.getState().setRateLimited(resetMs !== null, resetMs);
                if (resetMs !== null) {
                    const waitTime = Math.max(0, resetMs - Date.now());
                    log.error(`Horizon rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s until reset.`);
                }
            },
        });
    }
}

// Singleton instance
export const horizonQueue = new HorizonRequestQueue(2);
