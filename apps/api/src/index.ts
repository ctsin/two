import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";

export { ChatRoom } from "./durable-objects/chat-room";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  SESSIONS: KVNamespace;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "https://two.ctsin.dev"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/", (c) => c.json({ ok: true, service: "two-api" }));

// Public auth routes (login is unauthenticated; logout validates internally)
app.route("/auth", authRoutes);

// All routes below require a valid JWT
app.use("/api/*", authMiddleware);

export default app;
