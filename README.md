# Bloom Room

A local roommate demo featuring a shared 3D home, a sandbox house editor, household tasks, Pip the cat, music, and two visual moods. Built with vanilla HTML, CSS, JavaScript, Three.js, and Anime.js.

All required images, fonts, music, libraries, and the default house layout are included. **No API keys, authentication service, database, or build step are required.**

## Getting Started

1. Download the repository as a ZIP and extract it completely.
2. Open a terminal in the folder containing `index.html`.
3. With Node.js 20 or later installed, run:

   ```sh
   npm start
   ```

   Alternatively, run `node tools/serve.cjs`. **You do not need to run `npm install`.**

4. Open **http://127.0.0.1:8767/** in your browser.
5. Press **Ctrl+C** in the terminal to stop the server.

The same commands work on Windows, macOS, and Linux.

If port 8767 is already in use, run:

```sh
node tools/serve.cjs 8768
```

Then open http://127.0.0.1:8768/.

### Python Alternative

If Python 3 is installed:

```sh
python3 -m http.server 8767 --bind 127.0.0.1
```

On Windows:

```sh
py -m http.server 8767 --bind 127.0.0.1
```

### Quick Preview Without Installing Tools

After extracting the ZIP, double-click `index.html`.

The local scripts and default house support `file://`, but browser restrictions on storage, IndexedDB, and audio vary. **Use the local server above when demonstrating imports, custom models, media, or persistent saves.**

## Demo Walkthrough

1. Watch the opening animation or select **Skip to login**.
2. Enter any demo ID. This is a local prototype without real authentication.
3. Select **My Community → Create a Room**, enter a house name, and open the default room.
4. Click objects to use their interactions. Select the gear in the bottom-right corner to enter Edit mode:
   - **Object → ＋**: Add an object.
   - **R**: Rotate the placement preview or selected object.
   - **M**: Move the selected object.
   - **SAVE**: Save and leave Edit mode.
5. Select **Help** in the top-right corner for controls. The Window object controls weather and daylight; the Mood selector switches between the two visual themes.
6. To restart the demo, leave the room and select **My Profile → Reset demo**. This clears demo data for the current browser origin while preserving the application files and default layout. Export any house you want to keep first.

You can also select **Join a Room** and use `RB42` or `SUNNY3`. The code `FULL4` demonstrates a room that is already full.

## Browser Requirements and Saved Data

- Use a desktop browser with WebGL 2, JavaScript, and hardware acceleration enabled. Touch controls are also available. Large custom models and multiple shadow-casting lights increase GPU usage.
- Images, music, fonts, and libraries load locally without a CDN. The browser may require a click or keypress before playing music.
- Data is stored in the user's own `localStorage` and `IndexedDB`. Downloading this project does not include the author's browser saves.
- Different browsers, hostnames, and ports have separate storage. For example, `localhost` and `127.0.0.1` do not share saves. Use the same URL consistently during a demo.
- Uploaded images, models, and music stay in the browser. Use the house's **Export / Import** controls to transfer them between devices.
- HanziPen TC is used when installed on the device; the bundled Caveat font provides a fallback. The opening titles use Barriecito, and narrow button labels use Amatic SC.
- Accounts, matching, invitations, door notifications, and public-room settings are **local prototype flows**. There is no cross-device synchronization or external notification service.

## Uploading to GitHub

Upload **the contents of this folder** to the repository root so that `index.html` and this README appear at the top level.

Do not upload only the ZIP file, and do not omit `assets/`, `house/`, or `vendor/`.

This distribution excludes original design references, intermediate logo files, recordings, operating-system files, and local tool settings. A `.gitignore` is included to help prevent accidental additions. GitHub's browser upload does not apply `.gitignore` automatically, so use this clean distribution folder.

Source JavaScript, CSS, default JSON layouts, tests, and license files are included. Test screenshots, caches, and `node_modules` do not need to be uploaded.

Application pages and assets use relative paths, allowing the demo to run from a subdirectory on a static host.

## Project Structure

| Path | Purpose |
| --- | --- |
| `index.html`, `script.js`, `style.css` | Application entry point and navigation |
| `design.js`, `design.css`, `fonts.css` | Animation, themes, and typography |
| `house/` | 3D house, interactions, default layouts, and music |
| `assets/`, `vendor/` | Runtime resources and third-party licenses |
| `tools/serve.cjs` | Local server with no external dependencies |
| `tests/` | Development tests; not required to run the demo |
| `README.txt`, `ARCHITECTURE.txt` | Detailed controls and architecture notes in Traditional Chinese |
