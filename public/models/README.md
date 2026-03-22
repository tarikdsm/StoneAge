Place trained browser-friendly simulator policies here.

Expected future file:

- `player-policy.json`

Current runtime contract:

- `type`: `stoneage-player-policy-model`
- `version`: `1`
- optional `label`
- optional planning overrides such as `searchHorizonSteps`,
  `rolloutDeltaMs`, `topCandidateScoreBand`, and `weights`

The simulator HUD can toggle between `Heuristico` and `IA`.

- `Heuristico` keeps using the built-in planning policy.
- `IA` tries to load `public/models/player-policy.json`.

If that file is missing or invalid, the simulator keeps using the heuristic
policy and reports the reason in the HUD status line.
