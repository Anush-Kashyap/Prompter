export interface AnalysisIssue {
  type: string;
  severity: "critical" | "useful" | "optional";
  message: string;
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
}