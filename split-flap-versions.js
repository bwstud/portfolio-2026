/* Written by the Split-Flap Lab. The home page runs the version named by "active". */
window.SPLIT_FLAP_VERSIONS = {
  "active": "mwmfg1eh",
  "versions": [
    {
      "id": "original",
      "name": "Original",
      "savedAt": null,
      "config": {}
    },
    {
      "id": "framed",
      "name": "Framed",
      "savedAt": "2026-11-05T23:45:08Z",
      "config": {
        "padX": 2,
        "padY": 1,
        "fillRows": true,
        "boardWidth": 840,
        "grain": 0.08,
        "frame": true
      },
      "lab": {
        "seed": 1,
        "stageColor": "#0e0e0f"
      }
    },
    {
      "id": "mw5bcdt2",
      "name": "2x2",
      "savedAt": "2026-11-06T18:33:49.286Z",
      "config": {
        "boardWidth": 840,
        "padX": 2,
        "padY": 1,
        "fillRows": true,
        "frame": true,
        "grain": 0.08
      },
      "lab": {
        "seed": 1,
        "stageColor": "#0e0e0f"
      }
    },
    {
      "id": "mw5bi2i3",
      "name": "2x1_tune1",
      "savedAt": "2026-11-06T18:38:14.571Z",
      "config": {
        "minFlips": 25,
        "maxFlips": 50,
        "bounceDeg": 45,
        "spinEase": [
          0.29,
          0,
          0.4,
          0.99
        ],
        "boardWidth": 840,
        "padX": 2,
        "fillRows": true,
        "frame": true,
        "frameGap": 4,
        "tileRatio": 1.6,
        "slotSize": 0.012,
        "grain": 0.08,
        "grainSize": 0.7,
        "topShade": 0.75,
        "bottomShine": 0.12
      },
      "lab": {
        "seed": 1,
        "stageColor": "#0e0e0f"
      }
    },
    {
      "id": "mw8pp8m6",
      "name": "Deep Blue",
      "savedAt": "2026-11-09T21:56:32.080Z",
      "config": {
        "flipMs": 50,
        "startMs": 0,
        "staggerMs": 0,
        "minFlips": 25,
        "maxFlips": 50,
        "bounceMs": 120,
        "bounceDeg": 20,
        "spinEase": [
          0.83,
          -0.04,
          0.6,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 840,
        "padX": 2,
        "fillRows": true,
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 6,
        "frameSheen": 0.02,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f"
      },
      "lab": {
        "seed": 1
      }
    },
    {
      "id": "departures",
      "name": "Departures",
      "mode": "dark",
      "savedAt": "2026-11-11T19:50:00.000Z",
      "config": {
        "flipMs": 50,
        "startMs": 0,
        "staggerMs": 500,
        "minFlips": 8,
        "maxFlips": 14,
        "bounceMs": 120,
        "bounceDeg": 20,
        "spinEase": [
          0.83,
          -0.04,
          0.6,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 1180,
        "padX": 0,
        "fillRows": true,
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 6,
        "frameSheen": 0.02,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f",
        "lines": [
          "GROOM LAKE|SHIPPED",
          "BLACKBIRD|SHIPPED",
          "MAZLAN BUILDER|SHIPPED",
          "ADEPT|WRITING",
          "WORKSPACES|WRITING"
        ],
        "nameCols": 16,
        "statusCols": 12
      },
      "lab": {
        "seed": 1
      }
    },
    {
      "id": "mwcjissj",
      "name": "Departures Tune 1",
      "mode": "dark",
      "savedAt": "2026-11-11T20:05:17.038Z",
      "config": {
        "lines": [
          "GROOM LAKE|SHIPPED 1014",
          "BLACKBIRD|SCHED   0120",
          "MAZ BUILDER|SHIPPED 1002",
          "ADEPT|SHIPPED 0715",
          "WORKSPACES|SCHED   0331"
        ],
        "chars": " ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        "flipMs": 100,
        "startMs": 0,
        "staggerMs": 500,
        "minFlips": 25,
        "maxFlips": 45,
        "bounceMs": 120,
        "bounceDeg": 40,
        "spinEase": [
          0.83,
          -0.04,
          0.6,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 1400,
        "gap": 4,
        "fillRows": true,
        "nameCols": 16,
        "statusCols": 12,
        "selectText": "VIEWING",
        "selectSpeed": 1.5,
        "selectMinFlips": 40,
        "selectMaxFlips": 60,
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 10,
        "tileRatio": 1.61,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f"
      },
      "lab": {
        "seed": 1
      }
    },
    {
      "id": "mwczjakn",
      "name": "Departures Tune 2",
      "mode": "dark",
      "savedAt": "2026-11-12T03:25:56.220Z",
      "config": {
        "lines": [
          "GROOM LAKE|1014",
          "BLACKBIRD|0120",
          "MAZ BUILDER|1002"
        ],
        "chars": " ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        "flipMs": 100,
        "startMs": 20,
        "staggerMs": 150,
        "minFlips": 35,
        "maxFlips": 45,
        "bounceMs": 40,
        "spinEase": [
          0.16,
          1,
          0.3,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 1800,
        "gap": 4,
        "fillRows": true,
        "nameCols": 11,
        "statusCols": 7,
        "recordFadeMs": 2000,
        "recordDrop": 32,
        "recordLeadMs": 1600,
        "recordBlur": 9,
        "recordEase": [
          0.05,
          0.94,
          0,
          1
        ],
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 10,
        "tileRatio": 1.61,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f"
      },
      "lab": {
        "seed": 1
      }
    },
    {
      "id": "mwky12a9",
      "name": "Holo Tune 1",
      "mode": "dark",
      "savedAt": "2026-11-17T17:05:24.945Z",
      "config": {
        "lines": [
          "GROOM LAKE|1014",
          "BLACKBIRD|0120",
          "MAZ BUILDER|1002"
        ],
        "chars": " ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        "flipMs": 100,
        "startMs": 20,
        "staggerMs": 150,
        "minFlips": 35,
        "maxFlips": 45,
        "bounceMs": 40,
        "spinEase": [
          0.16,
          1,
          0.3,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 1800,
        "gap": 4,
        "fillRows": true,
        "nameCols": 11,
        "statusCols": 7,
        "recordFadeMs": 2000,
        "recordDrop": 32,
        "recordLeadMs": 1600,
        "recordBlur": 9,
        "recordEase": [
          0.05,
          0.94,
          0,
          1
        ],
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 10,
        "tileRatio": 1.61,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f",
        "holo": 1,
        "holoColor": "#f2f7fd",
        "holoBloom": 0,
        "holoFringe": 1.1,
        "holoScan": 0.43,
        "holoScanGap": 2,
        "holoFlicker": 0.85,
        "holoShadow": 0.46,
        "holoShadowColor": "#7d7d7d",
        "holoShadowX": 0,
        "holoShadowY": 0.075,
        "holoShadowBlur": 0.015,
        "holoSpill": 0.99
      },
      "lab": {
        "seed": 1
      }
    },
    {
      "id": "mwmfg1eh",
      "name": "Departures Tune 3",
      "mode": "dark",
      "savedAt": "2026-11-18T18:00:43.289Z",
      "config": {
        "lines": [
          "GROOM LAKE|1014",
          "BLACKBIRD|0120",
          "MAZ BUILDER|1002"
        ],
        "chars": " ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        "flipMs": 100,
        "startMs": 20,
        "staggerMs": 150,
        "minFlips": 15,
        "bounceMs": 40,
        "spinEase": [
          0.16,
          1,
          0.3,
          1
        ],
        "shutterMs": 80,
        "boardWidth": 1800,
        "gap": 4,
        "fillRows": true,
        "nameCols": 11,
        "statusCols": 7,
        "recordFadeMs": 2000,
        "recordDrop": 32,
        "recordLeadMs": 1600,
        "recordBlur": 9,
        "recordEase": [
          0.05,
          0.94,
          0,
          1
        ],
        "frame": true,
        "frameColor": "#0a0f19",
        "wellColor": "#080d17",
        "framePad": 17,
        "frameGap": 10,
        "tileRatio": 1.61,
        "grain": 0.08,
        "grainSize": 0.6,
        "glyphSize": 0.72,
        "tileTop": "#10202d",
        "tileBottom": "#0a161f"
      },
      "lab": {
        "seed": 1
      }
    }
  ]
};
