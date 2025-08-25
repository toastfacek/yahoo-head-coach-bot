import { anthropic } from '@ai-sdk/anthropic';

// Central AI model configuration for the HeadCoach agent.
// Override via AI_MODEL, e.g., 'claude-3-5-sonnet-20241022'.
export const model = anthropic(process.env.AI_MODEL || 'claude-3-5-sonnet-20241022');

