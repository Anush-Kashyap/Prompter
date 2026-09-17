export interface AnalysisIssue {
  type: string;
  severity: "critical" | "useful" | "optional";
  message: string;
}

export interface ImageRef {
  type: "data-url" | "file-ref";
  data?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

export interface SessionTurn {
  prompt: string;
  images: ImageRef[];
  analysis: AnalysisResult;
  timestamp: number;
  mode: "light" | "balanced" | "deep";
}

export interface AnalysisContext {
  chatId?: string;
  recentTurns: SessionTurn[];
  images: ImageRef[];
}

export interface AnalysisResult {
  score: number;
  intent: string;
  output_format: string;
  confidence: number;
  issues: AnalysisIssue[];
  assumptions: string[];
  improved_prompt: string;
  explanation: string;
  model: string;
  cached?: boolean;
  context_used?: boolean;
  referenced_turns?: number[];
  visual_context?: string;
}