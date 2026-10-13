# PlotTwist prototype

PlotTwist lets someone upload a long video, scrub to an exact frame, use that frame as the visual reference for a prompted AI scene, fund at least one generation, keep and compare every attempt, and export the chosen version as a short proof-cut.

## Run it

```powershell
npm start
```

Then open `http://localhost:4173` in Chrome or Edge. No packages or API keys are required.

## What is real in this prototype

- Local video upload, playback, timeline scrubbing, filmstrip generation, frame stepping, and exact insertion time.
- In-project video replacement when the wrong source file is selected.
- Reference-frame capture at the video's native aspect ratio.
- Dynamic price estimate based on clip length and quality.
- A prepaid wallet journey with a one-attempt minimum top-up (explicitly a demo; it never charges money). Every generation checks and deducts its price before starting; failed jobs are refunded to the wallet.
- Unlimited pay-per-attempt simulated generations. Each result is retained in an attempt library so the customer can revisit and finalize any version later.
- A real silent proof-cut containing two seconds before the insertion, the generated scene, and two seconds after it.
- A downloadable JSON edit plan for a future server-side renderer.

## Deliberately simulated

The project validates the customer experience without incurring AI or infrastructure costs. The card payment, video-generation provider, persistent uploads, accounts, and full-length cloud export are not connected.

## Sensible production architecture

1. Upload the source directly to object storage with multipart/resumable upload. Never proxy a movie through the app server.
2. Extract the selected frame server-side and send that image plus the prompt, duration, and aspect ratio through a provider adapter.
3. Maintain a prepaid customer wallet. Require a top-up of at least one full generation, credit it only after a verified payment webhook, and protect the transaction with an idempotency key.
4. Before every provider call, atomically verify and reserve one attempt's price. Block jobs with insufficient balance and automatically release the reservation if generation fails.
5. Use a job queue for generation and rendering, with progress delivered by polling or server-sent events.
6. Render the final movie with FFmpeg: source-before + normalized generated clip + source-after. Map the original audio, generate intentional audio for the inserted scene, normalize resolution/fps/color/audio, and produce a streamable MP4.
7. Put the final file in object storage behind an expiring download link, then delete source and renders according to a visible retention policy.

The short, silent proof-cut is a limitation of this dependency-free prototype—not the intended customer experience. The production exporter should use cloud **smart rendering**: normalize the short AI scene, re-encode only the few seconds around the exact cut, and stream-copy the untouched parts of the movie. That avoids replaying or re-encoding a two-hour film and should package the result in minutes rather than hours. The source upload will usually be the longest step, so it should be direct, resumable, and show useful progress.
