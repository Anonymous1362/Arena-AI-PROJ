/**
 * Curated catalog of small, phone-friendly GGUF models (llama.cpp compatible).
 * All links point to Hugging Face `resolve/main` endpoints so downloads work
 * with a plain HTTP GET. Quant sizes are approximate.
 */

export interface CatalogModel {
  id: string;
  name: string;
  family: 'qwen' | 'llama' | 'gemma' | 'phi';
  params: string;
  quant: string;
  sizeBytes: number;
  url: string;
  license: string;
  blurb: string;
  recommended?: boolean;
}

const HF = 'https://huggingface.co';
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const LOCAL_CATALOG: CatalogModel[] = [
  {
    id: 'qwen2.5-0.5b-q4',
    name: 'Qwen2.5 0.5B Instruct',
    family: 'qwen',
    params: '0.5B',
    quant: 'Q4_K_M',
    sizeBytes: 420 * MB,
    url: `${HF}/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`,
    license: 'Apache-2.0',
    blurb: 'Tiny & fast. Surprisingly capable for its size — great first offline model.',
    recommended: true,
  },
  {
    id: 'qwen2.5-1.5b-q4',
    name: 'Qwen2.5 1.5B Instruct',
    family: 'qwen',
    params: '1.5B',
    quant: 'Q4_K_M',
    sizeBytes: 1.0 * GB,
    url: `${HF}/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`,
    license: 'Apache-2.0',
    blurb: 'Best quality-per-megabyte for everyday chat on phones.',
    recommended: true,
  },
  {
    id: 'llama3.2-1b-q4',
    name: 'Llama 3.2 1B Instruct',
    family: 'llama',
    params: '1B',
    quant: 'Q4_K_M',
    sizeBytes: 810 * MB,
    url: `${HF}/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf`,
    license: 'Llama 3.2 Community',
    blurb: 'Meta’s compact assistant — strong general knowledge.',
  },
  {
    id: 'llama3.2-3b-q4',
    name: 'Llama 3.2 3B Instruct',
    family: 'llama',
    params: '3B',
    quant: 'Q4_K_M',
    sizeBytes: 2.0 * GB,
    url: `${HF}/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
    license: 'Llama 3.2 Community',
    blurb: 'Noticeably smarter. Needs ~2.5 GB free RAM while running.',
  },
  {
    id: 'gemma2-2b-q4',
    name: 'Gemma 2 2B IT',
    family: 'gemma',
    params: '2B',
    quant: 'Q4_K_M',
    sizeBytes: 1.7 * GB,
    url: `${HF}/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf`,
    license: 'Gemma Terms of Use',
    blurb: 'Google’s compact model with excellent writing quality.',
  },
  {
    id: 'phi3.5-mini-q4',
    name: 'Phi-3.5 Mini',
    family: 'phi',
    params: '3.8B',
    quant: 'Q4_K_M',
    sizeBytes: 2.4 * GB,
    url: `${HF}/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf`,
    license: 'MIT',
    blurb: 'Microsoft’s small model — punches above its weight on reasoning.',
  },
];

export function catalogById(id: string): CatalogModel | undefined {
  return LOCAL_CATALOG.find((m) => m.id === id);
}

/** Fallback chat templates if llama.cpp's built-in formatter is unavailable. */
export function fallbackChatTemplate(family: CatalogModel['family']): (turns: { role: string; content: string }[]) => string {
  switch (family) {
    case 'llama':
      return (turns) => {
        let out = '<|begin_of_text|>';
        for (const t of turns) {
          out += `<|start_header_id|>${t.role}<|end_header_id|>\n\n${t.content}<|eot_id|>`;
        }
        out += '<|start_header_id|>assistant<|end_header_id|>\n\n';
        return out;
      };
    case 'gemma':
      return (turns) => {
        let out = '<bos>';
        for (const t of turns) {
          out += t.role === 'user' ? `<start_of_turn>user\n${t.content}<end_of_turn>\n` : `<start_of_turn>model\n${t.content}<end_of_turn>\n`;
        }
        out += '<start_of_turn>model\n';
        return out;
      };
    case 'phi':
      return (turns) => {
        let out = '';
        for (const t of turns) {
          out += `<|${t.role}|>\n${t.content}<|end|>\n`;
        }
        out += '<|assistant|>\n';
        return out;
      };
    case 'qwen':
    default:
      return (turns) => {
        let out = '';
        for (const t of turns) {
          out += `<|im_start|>${t.role}\n${t.content}<|im_end|>\n`;
        }
        out += '<|im_start|>assistant\n';
        return out;
      };
  }
}
