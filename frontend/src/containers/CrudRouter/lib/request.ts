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
      const headers = { ...(init?.headers as Record<string, string> | undefined) };
      // A multipart body: the browser sets Content-Type with its boundary;
      // the instance's JSON default would break it.
      const multipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
      // `Accept: application/octet-stream` asks for the raw body (a file
      // download - `BaseApi.file`), not parsed JSON.
      const binary = headers.Accept === "application/octet-stream";
      const response = await client.request<R>({
        url: path,
        method: init?.method ?? "GET",
        data: init?.body,
        headers: multipart ? { ...headers, "Content-Type": false as unknown as string } : headers,
        ...(binary ? { responseType: "blob" as const } : {}),
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
