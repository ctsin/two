import { z } from "zod";

export const LoginSchema = z.object({
  phone: z.string().min(7).max(20),
});

export const RegisterPublicKeySchema = z.object({
  publicKey: z.string().min(1),
});

export const SendMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  type: z.enum(["text", "image", "video", "file"]),
  encryptedContent: z.string().min(1),
  mediaKey: z.string().nullable().optional(),
  iv: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterPublicKeyInput = z.infer<typeof RegisterPublicKeySchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
