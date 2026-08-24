import { GoogleAuth } from 'google-auth-library';
import { resolveProjectId } from '../agent-surface/genai.js';

export const GEMINI_EMBEDDING_MODEL = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-005';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

// Options for Vertex AI embedding client.
export interface VertexEmbeddingOptions {
  projectId?: string;
  region?: string;
  model?: string;
  log?: (message: string) => void;
}

// Compute L2 Euclidean norm of a vector.
export function l2Norm(vector: number[]): number {
  const sumSq = vector.reduce((acc, val) => acc + val * val, 0);
  return Math.sqrt(sumSq) || 1;
}

// Normalize a vector to unit length.
export function normalizeVector(vector: number[]): number[] {
  const norm = l2Norm(vector);
  return vector.map((val) => val / norm);
}

// Calculate cosine similarity between two vectors.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

// Generates embeddings using Vertex AI.
export class VertexEmbeddingService {
  private auth: GoogleAuth;
  private projectId: string;
  private region: string;
  private model: string;
  private log?: (message: string) => void;
  private cache = new Map<string, number[]>();
  private static readonly MAX_CACHE_SIZE = 500;

  constructor(options: VertexEmbeddingOptions = {}) {
    this.projectId = resolveProjectId(options.projectId);
    this.region = options.region ?? process.env.VERTEX_REGION ?? 'global';
    this.model = options.model ?? GEMINI_EMBEDDING_MODEL;
    this.log = options.log;
    this.auth = new GoogleAuth({ scopes: [SCOPE] });
  }

  // Generate embedding vector for a text query or document.
  async embedText(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const cached = this.cache.get(trimmed);
    if (cached) return cached;

    try {
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();
      const token = accessToken.token;
      if (!token) throw new Error('No access token available for Vertex AI');

      const host = this.region === 'global' ? 'aiplatform.googleapis.com' : `${this.region}-aiplatform.googleapis.com`;
      const url = `https://${host}/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${this.model}:predict`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ content: trimmed }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Vertex embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        predictions?: Array<{
          embeddings?: {
            values?: number[];
          };
          values?: number[];
        }>;
      };

      const values = data.predictions?.[0]?.embeddings?.values || data.predictions?.[0]?.values;
      if (!values || !Array.isArray(values) || values.length === 0) {
        throw new Error('Malformed embedding response from Vertex AI');
      }

      const normalized = normalizeVector(values);
      if (this.cache.size >= VertexEmbeddingService.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(trimmed, normalized);
      return normalized;
    } catch (err) {
      this.log?.(`Vertex embedding generation failed for "${trimmed.slice(0, 40)}": ${String(err)}`);
      return [];
    }
  }
}
