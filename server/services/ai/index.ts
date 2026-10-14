import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, estimateWithClaude, type EstimateInput } from './claude';
import { demoSuggestion } from './demo';
import { resolveSuggestion, type RawSuggestion, type Suggestion } from './suggestion';

export interface QuoteAiResult {
  suggestion: Suggestion;
  /** 'claude' = real AI; 'demo' = built-in estimator. */
  mode: 'claude' | 'demo';
  /** A friendly note for the owner, e.g. why we fell back to demo mode. */
  notice?: string;
}

export interface QuoteAi {
  readonly enabled: boolean;
  suggest(input: EstimateInput): Promise<QuoteAiResult>;
}

export interface QuoteAiOptions {
  apiKey?: string;
  model?: string;
  /** Most real AI quotes per day (a spending backstop). Default 100. */
  dailyLimit?: number;
  /** Swap in a fake estimator for tests. */
  estimate?: (input: EstimateInput) => Promise<RawSuggestion>;
}

/**
 * Real Claude when there's an API key, the built-in demo estimator when there isn't.
 * If Claude fails or times out we fall back to the demo estimator with a notice, so the
 * owner always gets a starting point and never loses what they typed.
 */
export function createQuoteAi(options: QuoteAiOptions = {}): QuoteAi {
  const model = options.model || DEFAULT_MODEL;
  const dailyLimit = options.dailyLimit ?? 100;
  const client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : null;
  const estimate = options.estimate ?? (client ? (input: EstimateInput) => estimateWithClaude(client, model, input) : undefined);
  let usage = { day: '', count: 0 };

  const demo = (input: EstimateInput, notice?: string): QuoteAiResult => ({
    suggestion: resolveSuggestion(demoSuggestion(input.brief, input.priceList, input.photoPaths.length), input.priceList),
    mode: 'demo',
    notice,
  });

  return {
    enabled: Boolean(estimate),
    async suggest(input) {
      if (!estimate) return demo(input);

      const today = new Date().toISOString().slice(0, 10);
      if (usage.day !== today) usage = { day: today, count: 0 };
      if (usage.count >= dailyLimit) {
        return demo(input, `Today’s limit of ${dailyLimit} AI quotes has been reached, so this one used the built-in estimator.`);
      }
      usage.count++;

      try {
        const raw = await estimate(input);
        const suggestion = resolveSuggestion(raw, input.priceList);
        if (suggestion.lines.length === 0) {
          return demo(input, 'The AI couldn’t find any work in that description, so this used the built-in estimator. Add more detail and try again.');
        }
        return { suggestion, mode: 'claude' };
      } catch (err) {
        console.error('AI quote failed, using demo estimator:', err instanceof Error ? err.message : err);
        return demo(input, 'The AI didn’t respond in time, so this used the built-in estimator. Check the lines carefully.');
      }
    },
  };
}

export type { EstimateInput } from './claude';
export type { Suggestion } from './suggestion';
