import type { Request, Response } from "express";

const DEFAULT_TILE_ORIGIN = "https://tile.openstreetmap.org";
const MAX_ZOOM = 19;

export async function proxyMapTile(
  request: Request,
  response: Response,
) {
  const coordinates = parseCoordinates(request.params);
  if (!coordinates) {
    return response.status(400).json({ error: "无效的地图瓦片坐标。" });
  }

  const { z, x, y } = coordinates;
  const tileOrigin =
    process.env.OSM_TILE_ORIGIN?.replace(/\/+$/, "") ??
    DEFAULT_TILE_ORIGIN;
  const headers = new Headers({
    Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
    "User-Agent":
      process.env.OSM_TILE_USER_AGENT ??
      "PlaceTrace/1.0 (+https://github.com/freezeng123456/find-location)",
  });
  copyRequestHeader(request, headers, "if-none-match");
  copyRequestHeader(request, headers, "if-modified-since");

  try {
    const upstream = await fetch(
      `${tileOrigin}/${z}/${x}/${y}.png`,
      {
        headers,
        signal: AbortSignal.timeout(12_000),
      },
    );

    copyResponseHeader(upstream, response, "cache-control");
    copyResponseHeader(upstream, response, "etag");
    copyResponseHeader(upstream, response, "expires");
    copyResponseHeader(upstream, response, "last-modified");

    if (upstream.status === 304) {
      return response.status(304).end();
    }
    if (!upstream.ok) {
      return response.status(upstream.status).end();
    }

    response.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "image/png",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Unable to load OpenStreetMap tile", {
      z,
      x,
      y,
      error: error instanceof Error ? error.message : String(error),
    });
    return response.status(502).end();
  }
}

function parseCoordinates(params: Request["params"]) {
  const tileMatch = /^(\d+)\.png$/.exec(String(params.tile ?? ""));
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(tileMatch?.[1]);
  if (
    !tileMatch ||
    !Number.isInteger(z) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    z < 0 ||
    z > MAX_ZOOM
  ) {
    return null;
  }
  const dimension = 2 ** z;
  if (x < 0 || y < 0 || x >= dimension || y >= dimension) {
    return null;
  }
  return { z, x, y };
}

function copyRequestHeader(
  request: Request,
  headers: Headers,
  name: "if-none-match" | "if-modified-since",
) {
  const value = request.headers[name];
  if (typeof value === "string") headers.set(name, value);
}

function copyResponseHeader(
  upstream: globalThis.Response,
  response: Response,
  name: string,
) {
  const value = upstream.headers.get(name);
  if (value) response.setHeader(name, value);
}
