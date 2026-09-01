/**
 * Platform-agnostic type surface for the local engine.
 * Metro resolves './LocalEngine' to LocalEngine.native.ts / LocalEngine.web.ts;
 * this declaration gives TypeScript the shared contract.
 */
import type { EngineRequest, EngineResult } from '@/src/ai/types';
import type { LocalModelRecord } from '@/src/store/settings';

export declare function isLocalSupported(): boolean;
export declare function loadedModelId(): string | null;
export declare function unloadLocal(): Promise<void>;
export declare function ensureLocalModel(record: LocalModelRecord, contextSize: number): Promise<void>;
export declare function cancelLocal(): void;
export declare function runLocal(record: LocalModelRecord, req: EngineRequest): Promise<EngineResult>;
