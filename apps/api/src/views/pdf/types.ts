import type { loadNote } from '../../services/note.js';

export type Loaded = NonNullable<Awaited<ReturnType<typeof loadNote>>>;