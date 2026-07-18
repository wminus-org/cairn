---
id: CRN-012
title: Photo capture and upload
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 25m
slot: "13:15"
depends_on: [CRN-003, CRN-009]
blocks: [CRN-013]
---

# CRN-012 — Photo capture and upload

**One line.** — Take a photo with `expo-camera`, downscale it before it leaves the phone, upload it to the private `cairn-images` bucket, and write a `stones` row that carries the image's aspect ratio.

## Why this exists

Demo cairn 2 is a photo of a real radiator with three pins on it. Nothing in the B2B half of the pitch happens until a photo reliably lands in storage. This ticket is deliberately small and dumb so that CRN-013, which is the actual product, gets the hour it needs.

The aspect ratio is not decoration. CRN-013 divides by the rendered frame to normalize pin coordinates and CRN-014 multiplies back to place them. Both need to know the shape of the image before it loads.

## Scope

- Camera screen using `expo-camera`'s `CameraView` + `useCameraPermissions()`. Rear camera, one shutter button, no flash UI, no switch-camera, no filters.
- Downscale before upload: longest edge 1280px, JPEG quality ~0.7. Unconditional — no "only if it's big" branch.
- Upload the compressed bytes to the private `cairn-images` bucket at `{cairn_id}/{stone_id}.jpg` — the bucket name and key convention CRN-003 defines. Do not invent a second layout.
- Insert a `stones` row with `kind = 'photo'`, `image_url` = the **storage path**, and the image's aspect ratio.
- `stones.image_aspect_ratio numeric` already exists — it ships in CRN-002's 10:30 paste. Do not `ALTER TABLE`; just write to it.
- Handle permission denial with an in-app explanation and a link to Settings.
- On success, hand the new stone id straight to CRN-013's pin editor. Do not bounce back to the map.

## Acceptance criteria

- [ ] Fresh install: opening the capture screen prompts for camera access exactly once. Denying it shows an in-app message with a Settings link — not a white screen, not a crash.
- [ ] The object lands in `cairn-images` at `{cairn_id}/{stone_id}.jpg` and is under 400 KB. Check the byte size in the Supabase Storage dashboard, not by eye.
- [ ] Stopwatch from shutter tap to "uploaded" state is under 4s on venue wifi. Measure it once, before lunch, on the venue network.
- [ ] The new `stones` row has `kind = 'photo'` and `image_url` set to a bucket-relative path — it does **not** start with `https://`.
- [ ] `image_aspect_ratio` is non-null and matches the photo: a portrait shot yields a value < 1, a landscape shot > 1.
- [ ] The bucket is private: constructing the `/object/public/` URL for that object and pasting it into a browser returns an error, not the image.

## Not in this ticket

- Pin placement, the pin editor, and anything that reads `image_aspect_ratio` — that's CRN-013.
- Rendering the photo with pins on it — CRN-014.
- Minting signed read URLs. The proximity gate owns that; this ticket only writes the path.
- Gallery import, multi-photo stones, retake/crop UI, video.

## Notes & traps

- **A full-resolution iPhone photo is 3–5 MB.** Uploading that over conference wifi is a stalled demo with a spinner on the projector. Downscale first, every time.
- **`expo-image-manipulator` changed API.** Recent SDKs use the object-based `ImageManipulator.manipulate(uri)` → `.resize(...)` → `.renderAsync()` → `.saveAsync(...)`; older ones export `manipulateAsync(uri, actions, options)`. Open `node_modules/expo-image-manipulator` and check which one you have before writing the call. Do not guess the signature.
- **Do not upload a Blob.** `fetch(fileUri).then(r => r.blob())` in React Native silently produces a **0-byte object** in Supabase Storage — the upload "succeeds" and the file is empty. Get base64 (either `takePictureAsync({ base64: true })` or read the manipulated file) and decode it to an `ArrayBuffer` (`base64-arraybuffer`'s `decode`) before calling `.upload()`. Pass `contentType: 'image/jpeg'` explicitly or it lands as `application/octet-stream`.
- **Store the path, not a URL.** The bucket is private, so there is no public URL to store. Writing a `/object/public/` URL into `image_url` means the client can fetch the image without proving proximity — that is a client-side gate and it breaks working rule 1.
- **Use the post-manipulation dimensions.** iPhone photos carry EXIF orientation, so the `width`/`height` from `takePictureAsync` are sensor dimensions and can be transposed relative to what actually renders. The manipulator bakes rotation in; take the `width`/`height` it returns. This is the number CRN-013 divides by — get it wrong and every pin is mirrored across the diagonal.
- **The camera permission string is a config-plugin value** (`cameraPermission` on the `expo-camera` plugin in `app.json`). Changing it requires `expo prebuild` + a native rebuild; it will not hot reload. Set it at the same time as the mic string, not at 15:20.
- **Unmount `CameraView` when the screen loses focus.** Two mounted camera views on iOS gives you a black preview and no error message.
