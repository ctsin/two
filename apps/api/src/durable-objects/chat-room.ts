import type { Env } from "../index";

export class ChatRoom implements DurableObject {
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response("ChatRoom stub — Phase 4 implementation pending", {
      status: 501,
    });
  }
}
