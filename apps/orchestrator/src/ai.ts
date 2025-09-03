import { anthropic } from '@ai-sdk/anthropic';

// Central AI model configuration for the HeadCoach agent.
// Override via AI_MODEL, e.g., 'claude-3-5-sonnet-20241022'.
// Use lazy loading to prevent blocking during server startup
let _model: any = null;

export function getModel() {
  if (!_model) {
    try {
      _model = anthropic(process.env.AI_MODEL || 'claude-3-5-sonnet-20241022');
    } catch (error) {
      console.warn('Failed to initialize AI model:', error);
      throw new Error('AI model not available - check ANTHROPIC_API_KEY');
    }
  }
  return _model;
}

// Legacy export for backwards compatibility - will initialize on first access
export const model = new Proxy(
  {},
  {
    get(target, prop) {
      return getModel()[prop];
    },
  }
);
