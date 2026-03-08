const VIDEO_URL = "https://github.com/FixdIt0/slither-neuron-dashboard/releases/download/v1.0/gameplay.mp4";

export async function GET(request: Request) {
  const range = request.headers.get("range");
  const headers: Record<string, string> = {};
  if (range) headers["Range"] = range;

  const res = await fetch(VIDEO_URL, { headers, redirect: "follow" });

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "video/mp4");
  responseHeaders.set("Accept-Ranges", "bytes");
  if (res.headers.get("content-length")) responseHeaders.set("Content-Length", res.headers.get("content-length")!);
  if (res.headers.get("content-range")) responseHeaders.set("Content-Range", res.headers.get("content-range")!);
  responseHeaders.set("Cache-Control", "public, max-age=86400");

  return new Response(res.body, {
    status: res.status === 206 ? 206 : 200,
    headers: responseHeaders,
  });
}
