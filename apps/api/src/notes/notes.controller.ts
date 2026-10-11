import {
  createNoteSchema,
  listNotesQuerySchema,
  updateNoteSchema,
  type CreateNoteInput,
  type ListNotesQuery,
  type ListNotesResponse,
  type Note,
  type UpdateNoteInput,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { NotesService } from './notes.service.js';

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listNotesQuerySchema)) query: ListNotesQuery,
  ): Promise<ListNotesResponse> {
    return { data: await this.notes.list(query) };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Note> {
    return this.notes.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createNoteSchema)) input: CreateNoteInput,
  ): Promise<Note> {
    return this.notes.create(input);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) input: UpdateNoteInput,
  ): Promise<Note> {
    return this.notes.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notes.remove(id);
  }
}
