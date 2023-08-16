/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import * as Res from './res';
import { Router } from './router';
export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;

  rooms: DurableObjectNamespace;
}

declare global {
  interface DurableObjectState {
    getWebSockets(tag?: string): WebSocket[];

    acceptWebSocket(ws: WebSocket, tag?: string): void;
  }

  interface WebSocket {
    deserializeAttachment(): any
    serializeAttachment(value: any): void
  }
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
    const path = url.pathname;

    if(!path[0]) return Res.json({ message: 'Not Found' }, { origin: request.headers.get('Origin'), status: 404 });
  
    return handleRequest(path[0], request, env);
  },
};

async function handleRequest(path: string, request: Request, env: Env): Promise<Response> {
  const router = new Router(request);

  router.post('/room', async (req, url) => {
    console.log(env.rooms.newUniqueId());
    return Res.json({ id: env.rooms.newUniqueId().toString() }, { origin: request.headers.get('Origin'), status: 200 });
  })

  router.get('/room/:id', async(req, url, params) => {
    if(params.id.match(/[^a-z0-9]{64}$/)) {
      return Res.json({ message: 'Not Found' }, { origin: request.headers.get('Origin'), status: 404 });
    }

    const id = env.rooms.idFromString(params.id);
    const roomInstance = env.rooms.get(id);

    if(!roomInstance) return Res.json({ message: 'Not Found' }, { origin: request.headers.get('Origin'), status: 404 });

    return roomInstance.fetch(req);
  })

  router.fallback(async (_, url) => {
    return Res.json({ message: 'Not Found' }, { origin: request.headers.get('Origin'), status: 404 });
  })

  return router.process();
}

export class CollaborationRoom {
  state: DurableObjectState;
  storage: DurableObjectState['storage'];
  env: Env;
  sessions: Map<WebSocket, any>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.sessions = new Map();

    this.state.getWebSockets().forEach((websocket) => {
      let meta = websocket.deserializeAttachment();

      this.sessions.set(websocket, { ...meta });
    })
  }

  async fetch(request: Request) {
    if(request.headers.get('Upgrade') !== 'websocket') {
      return Res.json({ message: 'expected websocket' }, { origin: request.headers.get('Origin'), status: 400 });
    }

    const ip = request.headers.get('CF-Connecting-IP')!;
    const pair = new WebSocketPair();

    await this.handleSession(pair[1], ip);

    return Res.norm(null, { origin: request.headers.get('Origin'), status: 101, webSocket: pair[0] })
  }

  async handleSession(websocket: WebSocket, ip: string) {
    this.state.acceptWebSocket(websocket);

    const session = {};
    websocket.serializeAttachment(session);

    this.sessions.set(websocket, session);
  }

  async webSocketMessage(websocket: WebSocket, msg: any) {
    this.broadcast(msg, websocket);
  }

  async webSocketClose(websocket: WebSocket) {
    this.closeWebsocket(websocket);
  }

  async webSocketError(websocket: WebSocket) {
    this.closeWebsocket(websocket);
  }

  async closeWebsocket(websocket: WebSocket) {
    let session = this.sessions.get(websocket);

    if(session) {
      session.quit = true;
      this.sessions.delete(websocket);
    }
  }

  async broadcast(msg: any, currentWebsocket: WebSocket) {
    this.sessions.forEach((session, websocket) => {
      if(websocket !== currentWebsocket) {
        try {
          websocket.send(msg);
        } catch(err) {
          session.quit = true;
          this.closeWebsocket(websocket);
        }
      } 
    })
  }
}