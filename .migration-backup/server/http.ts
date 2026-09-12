import type { IncomingMessage, ServerResponse } from 'node:http';
export type Request = IncomingMessage & { query: Record<string,string|string[]|undefined>; body?: unknown };
export type Response = ServerResponse & { status: (code:number)=>Response; json:(body:unknown)=>void };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
