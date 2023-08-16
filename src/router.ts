import * as Res from './res';

export class Router {
  private req: Request;
  private url: URL;
  private routers: {
    handler: (next: () => Promise<Response>) => Promise<Response>
  }[] = [];
  private fallbackHandler?: (req: Request, url: URL) => Promise<Response>;;

  constructor(req: Request) {
    this.req = req;
    this.url = new URL(req.url);
  }

  post(pattern: string, handler: (req: Request, url: URL, params: Record<string, string>) => Promise<Response>) {
    const parser = buildParse(pattern);
    
    this.routers.push({
      handler: (next: () => Promise<Response>) => {
        const { url, req } = this;
        if(req.method !== 'POST') return next();
        const params = parser(url.pathname);

        if(!params) return next();

        return handler(this.req, url, params);
      }
    })

    return this;
  }

  get(pattern: string, handler: (req: Request, url: URL, params: Record<string, string>) => Promise<Response>) {
    const parser = buildParse(pattern);
    
    this.routers.push({
      handler: (next: () => Promise<Response>) => {
        const { url, req } = this;
        if(req.method !== 'GET') return next();
        const params = parser(url.pathname);

        if(!params) return next();

        return handler(this.req, url, params);
      }
    })

    return this;
  }

  fallback(handler: (req: Request, url: URL) => Promise<Response>) {
    this.fallbackHandler = handler;
  }

  process() {
    let i = -1;

    const next = () => {
      ++i;
      const handler = this.routers[i] ?? {
        handler: this.fallbackHandler ?? (() => Res.json({ message: 'Not Found' }, { status: 404 }))
      };

      return handler.handler(next);
    };

    return next();
  }
}

function buildParse(pattern: string) {
  const patternArray = pattern.slice(1).split('/');

  return (path: string) => {
    path = path[path.length - 1] === '/'
      ? path.slice(0, path.length - 1)
      : path;

    const pathArray = path.slice(1).split('/').filter((x) => x);
    const params: Record<string, string> = {};

    if(patternArray.length !== pathArray.length) return false;

    for(let i = 0; i < patternArray.length; ++i) {
      const subpattern = patternArray[i];
      const subpath = pathArray[i];

      if(subpattern === subpath) continue;
      else if(subpattern.startsWith(':')) params[subpattern.slice(1)] = subpath;
      else return false;
    }

    return params;
  }
}
