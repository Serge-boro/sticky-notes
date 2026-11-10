let savedNotes = "[]";

export async function saveNotesToApi(
  body: string,
  signal: AbortSignal,
): Promise<string> {
  // Simulate a short server delay.
  await new Promise<void>((resolve) => setTimeout(resolve, 350));

  // Stop a cancelled save before it overwrites the notes.
  signal.throwIfAborted();

  savedNotes = body;
  return savedNotes;
}
