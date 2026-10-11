import { z } from 'zod';

const title = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(200, 'Title must be 200 characters or fewer');

const body = z.string().max(10_000, 'Body must be 10,000 characters or fewer');

export const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Note = z.infer<typeof noteSchema>;

export const createNoteSchema = z.object({
  title,
  body: body.default(''),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
  })
  .refine((input) => input.title !== undefined || input.body !== undefined, {
    message: 'Provide at least one field to update',
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const listNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

export const listNotesResponseSchema = z.object({
  data: z.array(noteSchema),
});
export type ListNotesResponse = z.infer<typeof listNotesResponseSchema>;
