import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { saveNotesToApi } from "./notesApi";

const NOTE_COLORS = ["Yellow", "Green", "Pink", "Blue"] as const;
type NoteColor = (typeof NOTE_COLORS)[number];

type Note = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: NoteColor;
};

type SavedNote = Omit<Note, "color"> & { color?: unknown };
type DragMode = "move" | "resize";

type NoteDrag = {
  note: Note;
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
};

type ApiSaveResult = {
  notes: Note[];
  ok: boolean;
};

// These minimum sizes leave room for text and drag controls.
const MIN_WIDTH = 140;
const MIN_HEIGHT = 110;
const STORAGE_KEY = "sticky-notes.v1";

function isNoteColor(value: unknown): value is NoteColor {
  return NOTE_COLORS.some((color) => color === value);
}

function isSavedNote(value: unknown): value is SavedNote {
  if (typeof value !== "object" || value === null) return false;

  const note = value as Partial<SavedNote>;

  return (
    typeof note.id === "string" &&
    typeof note.text === "string" &&
    typeof note.x === "number" &&
    Number.isFinite(note.x) &&
    note.x >= 0 &&
    typeof note.y === "number" &&
    Number.isFinite(note.y) &&
    note.y >= 0 &&
    typeof note.width === "number" &&
    Number.isFinite(note.width) &&
    note.width >= MIN_WIDTH &&
    typeof note.height === "number" &&
    Number.isFinite(note.height) &&
    note.height >= MIN_HEIGHT
  );
}

function loadNotes(): Note[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const data: unknown = JSON.parse(saved ?? "[]");

    if (!Array.isArray(data)) return [];

    // Notes saved before the color picker use yellow.
    return data.filter(isSavedNote).map((note) => ({
      ...note,
      color: isNoteColor(note.color) ? note.color : "Yellow",
    }));
  } catch {
    return [];
  }
}

export default function App() {
  const [notes, setNotes] = useState(loadNotes);
  const [error, setError] = useState("");
  const [overTrash, setOverTrash] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [apiSaveResult, setApiSaveResult] = useState<ApiSaveResult | null>(
    null,
  );

  const boardRef = useRef<HTMLElement>(null);
  const trashRef = useRef<HTMLElement>(null);
  const dragRef = useRef<NoteDrag | null>(null);

  useEffect(() => {
    // Save the final position or size after the drag ends.
    if (isDragging) return;

    const body = JSON.stringify(notes);

    try {
      localStorage.setItem(STORAGE_KEY, body);
    } catch (error) {
      console.warn("Could not save notes to local storage.", error);
    }

    const controller = new AbortController();

    saveNotesToApi(body, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) {
          setApiSaveResult({ notes, ok: true });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("Could not save notes to the mock API.", error);
          setApiSaveResult({ notes, ok: false });
        }
      });

    return () => controller.abort();
  }, [notes, isDragging]);

  function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const board = boardRef.current;
    if (!board) return;

    const form = new FormData(event.currentTarget);
    const x = Number(form.get("x"));
    const y = Number(form.get("y"));
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));

    if (x + width > board.clientWidth || y + height > board.clientHeight) {
      setError("The note must fit inside the board.");
      return;
    }

    const note: Note = {
      id: crypto.randomUUID(),
      x,
      y,
      width,
      height,
      text: "",
      color: "Yellow",
    };

    setNotes((currentNotes) => [...currentNotes, note]);
    setError("");
  }

  function updateNoteText(id: string, text: string) {
    setNotes((currentNotes) =>
      currentNotes.map((note) => (note.id === id ? { ...note, text } : note)),
    );
  }

  function updateNoteColor(id: string, color: string) {
    if (!isNoteColor(color)) return;

    setNotes((currentNotes) =>
      currentNotes.map((note) => (note.id === id ? { ...note, color } : note)),
    );
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    note: Note,
    mode: DragMode,
  ) {
    if (event.button !== 0 || dragRef.current) return;

    dragRef.current = {
      note,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    // Keep receiving events when the pointer leaves the drag area.
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function isOverTrash(event: PointerEvent<HTMLElement>) {
    const trash = trashRef.current;
    if (!trash) return false;

    // Pointer capture keeps events on the note, so check the trash bounds.
    const { left, right, top, bottom } = trash.getBoundingClientRect();

    return (
      event.clientX >= left &&
      event.clientX <= right &&
      event.clientY >= top &&
      event.clientY <= bottom
    );
  }

  function updateDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const board = boardRef.current;

    if (!drag || !board || drag.pointerId !== event.pointerId) return;

    const { note, mode, startX, startY } = drag;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    setOverTrash(mode === "move" && isOverTrash(event));

    const changes =
      mode === "move"
        ? {
            x: Math.max(
              0,
              Math.min(note.x + dx, board.clientWidth - note.width),
            ),
            y: Math.max(
              0,
              Math.min(note.y + dy, board.clientHeight - note.height),
            ),
          }
        : {
            width: Math.max(
              MIN_WIDTH,
              Math.min(note.width + dx, board.clientWidth - note.x),
            ),
            height: Math.max(
              MIN_HEIGHT,
              Math.min(note.height + dy, board.clientHeight - note.y),
            ),
          };

    setNotes((currentNotes) =>
      currentNotes.map((item) =>
        item.id === note.id ? { ...item, ...changes } : item,
      ),
    );
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    setOverTrash(false);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.mode === "move" && isOverTrash(event)) {
      setNotes((currentNotes) =>
        currentNotes.filter((note) => note.id !== drag.note.id),
      );
    }

    endDrag(event);
  }

  let apiStatus = "Mock API: saving…";

  if (isDragging) {
    apiStatus = "Mock API: waiting for drop";
  } else if (apiSaveResult?.notes === notes) {
    apiStatus = apiSaveResult.ok ? "Mock API: saved" : "Mock API: save failed";
  }

  return (
    <main className="app">
      <h1>Sticky Notes</h1>

      <form
        className="note-form"
        onSubmit={handleAddNote}
        onInput={() => setError("")}
      >
        <label>
          X
          <input name="x" type="number" min={0} defaultValue={32} required />
        </label>

        <label>
          Y
          <input name="y" type="number" min={0} defaultValue={32} required />
        </label>

        <label>
          Width
          <input
            name="width"
            type="number"
            min={MIN_WIDTH}
            defaultValue={220}
            required
          />
        </label>

        <label>
          Height
          <input
            name="height"
            type="number"
            min={MIN_HEIGHT}
            defaultValue={160}
            required
          />
        </label>

        <button type="submit">Add note</button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>

      <div className="workspace">
        <section
          ref={boardRef}
          className="board"
          aria-label="Sticky notes board"
        >
          {notes.length === 0 && <p>Your board is empty.</p>}

          {notes.map((note) => (
            <article
              key={note.id}
              className="note"
              data-color={note.color}
              style={{
                left: note.x,
                top: note.y,
                width: note.width,
                height: note.height,
              }}
              onPointerDown={(event) => startDrag(event, note, "move")}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
            >
              <div className="note-header">
                <span className="note-title">Note</span>

                <select
                  className="note-color"
                  aria-label="Note color"
                  value={note.color}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateNoteColor(note.id, event.currentTarget.value)
                  }
                >
                  {NOTE_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                className="note-text"
                aria-label="Note text"
                placeholder="Write a note…"
                value={note.text}
                onPointerDown={(event) => {
                  // Let the user select text without dragging the note.
                  event.stopPropagation();
                }}
                onChange={(event) =>
                  updateNoteText(note.id, event.currentTarget.value)
                }
              />

              <span
                className="resize-handle"
                title="Drag to resize"
                onPointerDown={(event) => {
                  // Keep the note's move handler from running when resizing.
                  event.stopPropagation();
                  startDrag(event, note, "resize");
                }}
              />
            </article>
          ))}
        </section>

        <div>
          <aside
            ref={trashRef}
            className={overTrash ? "trash trash--active" : "trash"}
            aria-label="Trash"
          >
            <h2>Trash</h2>
            <p>{overTrash ? "Release to delete" : "Drop a note here"}</p>
          </aside>

          <p role="status">{apiStatus}</p>
        </div>
      </div>
    </main>
  );
}
