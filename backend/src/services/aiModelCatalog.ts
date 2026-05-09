import type { AIProvider } from '../types/template';

export type AIModelOption = {
  id: string;
  label: string;
  provider: AIProvider;
  modelName: string;
  description: string;
};

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';
export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5.4-nano';
export const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

const MODEL_OPTIONS: AIModelOption[] = [
  {
    id: `openai:${DEFAULT_OPENAI_MODEL}`,
    label: `OpenAI · ${DEFAULT_OPENAI_MODEL}`,
    provider: 'openai',
    modelName: DEFAULT_OPENAI_MODEL,
    description: 'Uses the current direct OpenAI default configured for this app.',
  },
  {
    id: 'openai:gpt-5',
    label: 'OpenAI · GPT-5',
    provider: 'openai',
    modelName: 'gpt-5',
    description: 'OpenAI direct model for stronger reasoning than mini/nano variants.',
  },
  {
    id: 'openai:gpt-5-mini',
    label: 'OpenAI · GPT-5 mini',
    provider: 'openai',
    modelName: 'gpt-5-mini',
    description: 'OpenAI direct fast mid-tier option for well-defined prompt tasks.',
  },
  {
    id: 'openai:gpt-5-nano',
    label: 'OpenAI · GPT-5 nano',
    provider: 'openai',
    modelName: 'gpt-5-nano',
    description: 'OpenAI direct low-cost option for extraction and classification.',
  },
  {
    id: `claude:${DEFAULT_CLAUDE_MODEL}`,
    label: `Claude · ${DEFAULT_CLAUDE_MODEL}`,
    provider: 'claude',
    modelName: DEFAULT_CLAUDE_MODEL,
    description: 'Anthropic direct default configured for this app.',
  },
  {
    id: `openrouter:${DEFAULT_OPENROUTER_MODEL}`,
    label: `OpenRouter · ${DEFAULT_OPENROUTER_MODEL}`,
    provider: 'openrouter',
    modelName: DEFAULT_OPENROUTER_MODEL,
    description: 'Uses the current OpenRouter default configured for this app.',
  },
  {
    id: 'openrouter:openai/gpt-5.4',
    label: 'OpenRouter · GPT-5.4',
    provider: 'openrouter',
    modelName: 'openai/gpt-5.4',
    description: 'High-end general-purpose OpenRouter model.',
  },
  {
    id: 'openrouter:openai/gpt-5.4-nano',
    label: 'OpenRouter · GPT-5.4 nano',
    provider: 'openrouter',
    modelName: 'openai/gpt-5.4-nano',
    description: 'Low-latency OpenRouter option for lightweight prompt stages.',
  },
  {
    id: 'openrouter:google/gemini-2.5-flash',
    label: 'OpenRouter · Gemini 2.5 Flash',
    provider: 'openrouter',
    modelName: 'google/gemini-2.5-flash',
    description: 'Google Gemini through OpenRouter, useful for broad reasoning and drafting.',
  },
  {
    id: 'openrouter:deepseek/deepseek-chat',
    label: 'OpenRouter · DeepSeek V3',
    provider: 'openrouter',
    modelName: 'deepseek/deepseek-chat',
    description: 'DeepSeek through OpenRouter, useful for extraction and structured analysis.',
  },
  {
    id: 'openrouter:deepseek/deepseek-r1',
    label: 'OpenRouter · DeepSeek R1',
    provider: 'openrouter',
    modelName: 'deepseek/deepseek-r1',
    description: 'Reasoning-focused DeepSeek option through OpenRouter.',
  },
];

export function listAIModelOptions(): AIModelOption[] {
  return MODEL_OPTIONS.map((option) => ({ ...option }));
}

export function getAIModelOptionById(id: string): AIModelOption | null {
  const normalizedId = id.trim();
  return MODEL_OPTIONS.find((option) => option.id === normalizedId) ?? null;
}

export function normalizePromptModelSelection(
  provider: unknown,
  modelName: unknown
): { provider: AIProvider; modelName: string } | null {
  const normalizedProvider = typeof provider === 'string' ? provider.trim() : '';
  const normalizedModelName = typeof modelName === 'string' ? modelName.trim() : '';

  if (!normalizedProvider && !normalizedModelName) {
    return null;
  }

  if (
    normalizedProvider !== 'openai' &&
    normalizedProvider !== 'claude' &&
    normalizedProvider !== 'openrouter'
  ) {
    throw new Error('Prompt model provider must be one of: openai, claude, openrouter.');
  }

  if (!normalizedModelName) {
    throw new Error('Prompt model name is required when a prompt-level model override is set.');
  }

  const knownOption = MODEL_OPTIONS.find(
    (option) => option.provider === normalizedProvider && option.modelName === normalizedModelName
  );

  return {
    provider: knownOption?.provider ?? normalizedProvider,
    modelName: knownOption?.modelName ?? normalizedModelName,
  };
}
