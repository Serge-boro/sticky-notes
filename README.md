## Run locally

You need Node.js 22.12 or later. It comes with npm.

1. Open a terminal in the project folder.
2. Install the dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

3. Open the address shown in the terminal.

## Run with Docker

Start Docker Desktop. Open a terminal in the project folder and run:

```sh
docker compose up --build
```

Open http://localhost:8080. To stop the app, press Ctrl+C.

## Approach

I built the board with React and TypeScript. The form sets the starting position and size of a new note. Drag a note by its header to move it, drag its bottom-right corner to resize it, or drop it in Trash to delete it.

The app saves each note's text, color, position, and size in the browser. It restores the notes when the page opens again. The mock API simulates saving to a server and keeps a temporary copy in memory.

## Assumptions

- The board is designed for desktop screens of 1024 × 768 or larger.
- X and Y are measured in pixels from the top-left corner of the board.
- The minimum note size is 140 × 110 pixels to leave room for text and controls.
