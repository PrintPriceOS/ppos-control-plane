/**
 * src/api/services/decisionProvider/llmDecisionProvider.js
 *
 * Phase 194F — LLM Decision Provider (Existing AI Provider Fallback)
 */

const aiAdapter = require('../aiProviderAdapter');

class LLMDecisionProvider {
  constructor() {
    this.name = 'LLM';
  }

  isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
  }

  async evaluateDecision({ task, choices = [], context = {} }) {
    if (!this.isAvailable()) {
      const err = new Error('LLM provider unconfigured');
      err.code = 'LLM_DISABLED';
      throw err;
    }

    const requestedAt = new Date().toISOString();
    const prompt = `Task: ${task}\nChoices: ${JSON.stringify(choices)}\nContext snippet: ${context.snippet || ''}\nChoose the single best option. Reply with valid JSON: {"decision": "...", "confidence": 0.9}`;

    try {
      const responseText = await aiAdapter.complete({
        prompt,
        maxTokens: 100,
        temperature: 0.1
      });

      const parsed = JSON.parse(responseText.trim().replace(/^```json\s*/, '').replace(/```$/, ''));
      const completedAt = new Date().toISOString();

      return {
        provider: 'LLM',
        task,
        decision: parsed.decision || choices[0],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        rawProviderMetadata: { model: 'llm-fallback' },
        requiresReview: (parsed.confidence || 0.8) < 0.85,
        auditMetadata: {
          provider: 'LLM',
          providerModel: 'llm-fallback',
          task,
          decision: parsed.decision || choices[0],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
          requestedAt,
          completedAt,
          fallbackUsed: false
        }
      };
    } catch (err) {
      err.code = 'LLM_UNAVAILABLE';
      throw err;
    }
  }
}

module.exports = LLMDecisionProvider;
