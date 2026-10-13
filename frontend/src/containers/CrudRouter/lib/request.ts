import axios from "axios";
import type { BaseApiRequest } from "./baseApi";
import { RequestError } from "./requestError";

/**
 * A `BaseApiRequest` (see `baseApi.ts`) backed by axios. The name stays
 * transport-neutral on purpose, so a caller never has to know which HTTP
 * client built the one it got. Same calling convention every
 * `createXBaseApi` factory uses (`init.method`, `init.body` as an
 * already-`JSON.stringify`'d string).
 */
export function createRequest(accessToken: string, baseURL = ""): BaseApiRequest {
  const client = axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });

  return async function request<R>(path: string, init?: RequestInit): Promise<R> {
    try {
      const response = await client.request<R>({
        url: path,
        method: init?.method ?? "GET",
        data: init?.body,
        headers: init?.headers as Record<string, string> | undefined,
      });
      return response.data;
    } catch (thrown) {
      if (axios.isAxiosError(thrown)) {
        const body = thrown.response?.data as { message?: string; field_errors?: Record<string, string[]> | null } | undefined;
        throw new RequestError(body?.message ?? thrown.message, body?.field_errors ?? null);
      }
      throw thrown;
    }
  };
}
