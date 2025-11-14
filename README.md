# ToneGen

ToneGen is a browser-based multi-tone generator built with the Web Audio API. You can stack up to 24 tones, preview them instantly, and export the rendered result as a 16-bit PCM WAV file without leaving the page.

## Features

- Configure frequency, waveform, and duration for each tone in the sequence
- Real-time playback with smoothing envelopes to avoid audible clicks
- Optional effects: convolution reverb with adjustable mix and tempo-agnostic delay with mix/time/feedback controls
- Offline rendering to a WAV file that matches the live preview
- Input validation and helpful status messaging to guide the user

## Getting Started

1. Clone the repository:
   ```pwsh
   git clone https://github.com/maeneak/ToneGen.git
   cd ToneGen
   ```
2. Open `index.html` directly in a modern browser **or** serve the folder with a static HTTP server (recommended for consistent audio context behaviour).
   ```pwsh
   # Using PowerShell 7's simple static server
   pwsh -c "Start-Process pwsh -ArgumentList '-NoExit','-Command','cd $(Get-Location); python -m http.server 5173'"
   # visit http://localhost:5173
   ```

> **Note**
> Safari and other browsers that gate audio playback behind user gestures may require clicking anywhere on the page before tones will sound.

## Usage Tips

- Use the **Add Tone** button to append new rows; the app keeps at least one tone available.
- The cumulative tone duration is limited to 60 seconds. Trim individual durations if you hit the limit.
- Toggle effects in the **Effects** panel; disabled controls display `Off` and do not colour the sound.
- After hitting **Download WAV**, your browser saves a `tone-sequence.wav` file with the applied effects.

## Development Notes

- The project is framework-free; HTML and vanilla JavaScript live at the repository root.
- Core logic resides in `main.js`, which wires up UI events, schedules oscillators, and performs offline rendering.
- Styles are defined in `styles.css`, favoring responsive layout and dark-mode friendly colours.
- When extending the audio graph, reuse `applyEffectsChain` so live playback and export stay in sync.

## Roadmap Ideas

- Provide beat-synced delay times (note divisions) and per-tone effect toggles
- Persist tone presets using local storage
- Add unit conversion helpers (e.g., seconds to milliseconds) in the UI
- Support stereo rendering with panning per tone

## License

This project currently does not include a license. Add a `LICENSE` file if you plan to share or distribute the code publicly.
