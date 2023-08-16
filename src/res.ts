const allowedOrigins = [
  /https:\/\/.+\-toeverything\.vercel\.app$/,
  /https:\/\/(.+\.)?affine\.pro$/,
  /https:\/\/(.+\.)?affine\.fail$/,
  /https?:\/\/localhost(:\d+)?$/
]

type ResponseOptions = {
  origin?: string | null
} & ResponseInit;

function isAllowedOrigin(origin: string) {
  return allowedOrigins.some(pattern => pattern.test(origin));
}

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const isAllowed = origin ? isAllowedOrigin(origin) : false;

  return isAllowed ? {
    'Access-Control-Allow-Origin': origin!,
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : {};
}

export function json(body: any, options: ResponseOptions) {
  return new Response(JSON.stringify(body), {
    ...options,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...getCorsHeaders(options.origin),
      ...(options.headers ?? {}),
    }
  })
}

export function norm(body: any, options: ResponseOptions) {
  return new Response(body, {
    ...options,
    headers: {
      ...getCorsHeaders(options.origin),
      ...(options.headers ?? {}),
    }
  });
}