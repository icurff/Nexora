import { Injectable, Logger } from '@nestjs/common';

type AiItem = {
  retailrocket_itemid: number;
  score: number;
};

type AiResponse = {
  source: string;
  model: string;
  visitorid: number;
  items: AiItem[];
};

@Injectable()
export class AiRecommendationClient {
  private readonly logger = new Logger(AiRecommendationClient.name);

  private readonly baseUrl =
    process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000';

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as {
        model_loaded?: boolean;
      };

      return data.model_loaded === true;
    } catch {
      return false;
    }
  }

  async recommend(
    retailrocketVisitorId: number,
    limit = 10,
  ): Promise<AiResponse | null> {
    try {
      const url = new URL('/recommend', this.baseUrl);

      url.searchParams.set('visitorid', String(retailrocketVisitorId));
      url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 20)));

      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as AiResponse;

      if (!Array.isArray(data.items)) return null;

      return data;
    } catch (error) {
      this.logger.warn(
        `AI service unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  async recommendSession(
    payload: AiSessionRequest,
  ): Promise<AiSessionResponse | null> {
    try {
      const response = await fetch(
        new URL('/recommend/session', this.baseUrl),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(2000),
        },
      );

      if (!response.ok) {
        this.logger.warn(`AI session request returned HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as AiSessionResponse;

      if (
        data.source !== 'lightgcn_session' ||
        !Array.isArray(data.items) ||
        !Array.isArray(data.unknown_recent_itemids) ||
        (Boolean(payload.context_itemids?.length) &&
          data.context_supported !== true)
      ) {
        return null;
      }

      return data;
    } catch (error) {
      this.logger.warn(
        `AI session unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }
}

export type AiSessionRequest = {
  retailrocket_visitorid?: number;
  recent_itemids: number[];
  context_itemids?: number[];
  candidate_itemids: number[];
  exclude_itemids?: number[];
  limit: number;
};

export type AiSessionResponse = {
  source: 'lightgcn_session';
  context_supported?: boolean;
  strategy: string;
  unknown_recent_itemids: number[];
  items: Array<{
    retailrocket_itemid: number;
    score: number;
    reason_code: string;
    evidence: Record<string, unknown>;
  }>;
};
