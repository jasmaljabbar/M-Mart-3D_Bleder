# M-MART · Three.js model viewer

A responsive HTML viewer with the supermarket cutaway included. All runtime files are local; no CDN, account, build step, or network connection is needed after downloading the package.

## Run

Open a terminal in this folder and run:

```sh
python3 serve.py
```

Open **http://localhost:8765**. Keep the terminal running while viewing. Use `python3 serve.py 9000` to select another port. Opening `index.html` directly through `file://` will not work because browser modules and model loading require HTTP. Any static web server can serve this folder.

## Explore

- **Mouse:** left-drag to rotate, wheel to zoom, right-drag to pan.
- **Touch:** one finger to rotate, pinch to zoom, two fingers to pan.
- **Keyboard:** focus the canvas, use arrow keys to pan, `+` / `-` to zoom, `F` to fit.
- **Fit view:** restore the initial angle and frame the complete model.
- **Open model / drag and drop:** select one `.glb` or `.gltf`. For a glTF with external resources, select its `.bin` and texture files at the same time. Resource filenames must be unique. GLB is easiest for sharing.

To use a different default model, change `defaultURL` in `viewer.js`, replace `models/supermarket.glb`, or use a URL such as `http://localhost:8765/?model=./models/example.glb`. Remote model servers must allow browser CORS requests.

## Implementation

- Three.js **0.180.0**, with `GLTFLoader`, `OrbitControls`, and Meshopt decoder vendored under `vendor/three/`.
- Ambient, hemisphere, and directional lighting; a generated reflection environment; ACES tone mapping.
- Bounding-box normalization handles off-origin models and varied scales. Camera fit uses both horizontal and vertical field of view and updates on resize.
- Pixel ratio capped at 1.5, rendering on demand, shared geometry instances, and resource cleanup on replacement.
- Loading progress and recoverable error messages; unsuccessful imports preserve the current model.
- Current scene is displayed statically. Animation playback and Draco/KTX2 decoders are not configured.

The included model is an approximate architectural concept, not a surveyed plan. Dense product geometry is simplified for browser use, and Blender procedural materials use portable PBR base values. The original `.blend` remains unchanged. See `models/export-info.json` for provenance.

`scripts/export_model.py` exports the source Blender project when this folder sits beside `../blender/`. `scripts/instance_model.py` batches repeated geometry with `EXT_mesh_gpu_instancing`, preserving multi-material meshes. These scripts are optional and are not needed to run the viewer.

Three.js is MIT-licensed; its license is included in `vendor/three/LICENSE`.

API references: [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [Box3](https://threejs.org/docs/pages/Box3.html).
