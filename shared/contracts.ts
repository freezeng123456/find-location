import { z } from "zod";

export const candidateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  canonicalName: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(240),
  latitude: z.number().min(3).max(54),
  longitude: z.number().min(73).max(136),
  type: z.string().trim().min(1).max(40),
  quote: z.string().trim().min(1).max(800),
  mentionConfidence: z.number().int().min(0).max(100),
  matchConfidence: z.number().int().min(0).max(100),
  note: z.string().trim().max(300).default(""),
  thumbnailUrl: z.string().url().or(z.literal("")).default(""),
});

export const candidateSubmissionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sourceUrl: z.string().url().optional(),
  candidates: z.array(candidateInputSchema).min(1).max(100),
  diagnostics: z
    .object({
      summary: z.string().max(1000).optional(),
      model: z.string().max(120).optional(),
      warnings: z.array(z.string().max(300)).max(30).optional(),
    })
    .optional(),
});

export type CandidateInput = z.infer<typeof candidateInputSchema>;
export type CandidateSubmission = z.infer<
  typeof candidateSubmissionSchema
>;
export type AgentMode = "skill" | "openai" | "nvidia";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  placeCount: number;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
  thumbnailUrl: string;
  liked: boolean;
  createdAt: string;
  sourceCount: number;
  categories: Category[];
}

export interface Candidate {
  id: string;
  queryId: string;
  name: string;
  canonicalName: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
  quote: string;
  confidence: number;
  mentionConfidence: number;
  matchConfidence: number;
  note: string;
  thumbnailUrl: string;
  addedPlaceId: string | null;
}

export interface QueryRecord {
  id: string;
  inputType: "url" | "text";
  input: string;
  title: string;
  sourceUrl: string;
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
  completedAt: string | null;
  candidates: Candidate[];
}

export interface Rule {
  id: string;
  scope: "system" | "user" | "task" | "correction";
  content: string;
  status: "active" | "proposed" | "rejected";
  createdAt: string;
}

export interface AppState {
  user: User;
  places: Place[];
  categories: Category[];
  queries: QueryRecord[];
  rules: Rule[];
}

export interface DuplicatePlace {
  id: string;
  name: string;
  address: string;
  distanceMeters: number;
}
