# Asset credits

| File | Source | License |
|---|---|---|
| `giraffe.glb`, `giraffe-rig.json` | [Photogrammetric 3D scan of a giraffe skeleton](https://data.public.lu/en/datasets/photogrammetric-3d-scan-of-a-giraffe-skeleton/), Musée national d'histoire naturelle Luxembourg (MNHNL 132557) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `moa.glb`, `moa-rig.json` | [Little bush moa skeleton](https://sketchfab.com/3d-models/little-bush-moa-skeleton-b658205efa2a4d16abc9bb40bc96cdc8), Auckland War Memorial Museum (specimens 5511 and 5512) and Daniel Thomas, Massey University | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Giraffe, changes from the original: the 154 scanned bones were assembled into a standing mount, seven missing toe bones and sesamoids were filled with mirrored copies of their partners, the meshes were simplified and compressed (meshopt, WebP textures), and joint pivots were computed for posing.

Moa, changes from the original: the scale gizmo was removed, bones split across chunks were joined and one piece holding three bones was separated, the 96 reconstructed windpipe rings were joined to the nearest neck vertebrae, the texture was baked into vertex colour, the meshes were simplified and compressed (meshopt), and joint pivots were computed for posing.
