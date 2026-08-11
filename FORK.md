# Fork-specific changes

This fork carries local behavior changes on top of an upstream Immich release. Keep this file current when rebasing the custom commit stack onto a new release.

The current custom branch is based on upstream `v3.1.0`. The sections below describe every lasting source difference in `v3.1.0..release-3.1.0-custom`; intermediate compatibility and test-fix commits are included under the feature they support.

## JPEG XL orientation

The fork detects orientation stored in JPEG XL EXIF/XMP metadata when the codestream itself does not provide usable orientation. It applies that orientation safely during metadata extraction and thumbnail/media processing.

Relevant implementation and coverage:

- `server/src/utils/jxl.ts`
- `server/src/utils/jxl.spec.ts`
- `server/src/utils/mime-types.ts`
- `server/src/services/media.service.ts`
- `server/src/services/media.service.spec.ts`

`rotation-fork.log` records the original orientation investigation. Recheck this patch against upstream JPEG XL handling during every release rebase.

## Album behavior

### Hidden timeline albums

Users can select albums that should not contribute assets to the main Photos timeline. The selected album IDs are stored in the user preference `albums.hiddenTimelineAlbumIds`.

An asset is excluded when it belongs to any selected hidden album, even if it also belongs to a visible album. The server applies the exclusion to timeline buckets and asset retrieval, while the web timeline carries the preference through its search and insertion paths.

Relevant implementation and coverage includes:

- `server/src/dtos/user-preferences.dto.ts`
- `server/src/repositories/asset.repository.ts`
- `server/src/services/timeline.service.ts`
- `server/src/utils/preferences.ts`
- `web/src/lib/managers/timeline-manager/`

This behavior depends on actual album membership. A filesystem path matching an album workflow does not hide an asset until that workflow has added it to the hidden album.

### Filename ordering

Albums support filename ascending (`A-Z`) and descending (`Z-A`) order. Album ordering uses stable secondary keys so duplicate timestamps or filenames do not produce nondeterministic pagination or display order. The fork also corrects the timeline `createdAt` ordering path introduced while adding these order modes.

Relevant implementation and coverage includes:

- `server/src/dtos/album.dto.ts`
- `server/src/schema/tables/album.table.ts`
- `server/src/repositories/asset.repository.ts`
- `server/src/services/album.service.ts`
- `web/src/lib/modals/AlbumOptionsModal.svelte`
- `web/src/lib/utils/album-order.ts`

The schema and generated OpenAPI artifacts carry the additional album order values. Verify migrations and generated SDK output when rebasing.

### Stacked assets

Album views collapse stacks instead of rendering every member as an independent timeline item. The album page requests stacked results through its timeline query options in:

- `web/src/routes/(user)/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte`

## Automatic video deinterlacing

The fork adds **Automatic deinterlacing** under **Administration -> Settings -> Video Transcoding**. It is disabled by default and is independent of Immich's experimental real-time HLS transcoding.

Metadata extraction stores FFprobe `field_order` in `asset_video.fieldOrder`. Supported values are `progressive`, `tt`, `bb`, `tb`, `bt`, and `unknown`. Automatic processing is conservative:

- `tt` and `tb` use TFF parity.
- `bb` and `bt` use BFF parity.
- `progressive` is left unchanged.
- `unknown` is not automatically deinterlaced.

Detected interlaced video triggers conversion under the `required`, `optimal`, and `bitrate` policies. The encoded derivative prepends this software filter before scaling or colorspace processing:

```text
bwdif=mode=send_field:parity=tff|bff:deint=all
```

`send_field` preserves temporal resolution by producing one progressive frame per field, for example converting 29.97i to approximately 59.94p. Interlaced assets use software decoding, filtering, and encoding for predictable behavior across hardware backends; progressive assets continue to use the configured hardware path. HLS and thumbnail generation are intentionally unchanged.

Relevant implementation and coverage includes:

- `server/src/schema/migrations/1786388330933-AddVideoFieldOrder.ts`
- `server/src/schema/tables/asset-av.table.ts`
- `server/src/repositories/media.repository.ts`
- `server/src/services/metadata.service.ts`
- `server/src/services/media.service.ts`
- `server/src/utils/media.ts`
- `web/src/routes/admin/system-settings/FFmpegSettings.svelte`

After first deployment, run Metadata Extraction before Video Conversion so existing videos have a stored field order before conversion decisions are made.

## Path-based workflow albums

Immich workflows are used to create and populate albums from external-library paths. This avoids maintaining a separate script and keeps album membership synchronized through Immich's native asset metadata workflow.

The deployed workflow set contains one workflow per discovered family name, such as `nisswandt-all`, plus `documents-all`:

- Each surname workflow triggers on **Asset Metadata Extraction**, filters on the asset's external-library path, and adds matching assets to its album.
- Surname workflows exclude `photos/scans/documents/**`.
- `documents-all` matches the entire `photos/scans/documents/**` subtree, so assets below that path are added only to the documents album.

### Core plugin patch

Immich v3.1 exposed a **Use path** option for the core file-filter workflow step, but the plugin implementation always matched `originalFileName`. The fork changes `assetFileFilter` to honor that option:

```ts
config.usePath ? data.asset.originalPath : data.asset.originalFileName;
```

The source change is in `packages/plugin-core/src/index.ts`. The corresponding `usePath` setting is declared in `packages/plugin-core/manifest.json`.

A path-based album workflow should contain these steps:

1. Trigger on **Asset Metadata Extraction**.
2. Add **Filter by filename**, enable **Use path**, and configure the required path pattern.
3. Add **Add to Album(s)** and provide the target album name. The native action uses an existing album with that name or creates it when absent.

### Cached plugin artifact

The core workflow plugin artifact is cached in PostgreSQL. Rebuilding and redeploying the server image alone does not necessarily refresh the plugin used by existing workflows.

A plugin version bump is not appropriate for this update because the database enforces a unique plugin name. The working refresh mechanism is:

1. Keep the existing core plugin name and version.
2. Change the plugin manifest content so its manifest hash changes.
3. Rebuild and deploy the local Immich image.
4. Confirm Immich updates the cached plugin artifact in place.

The manifest description includes `path-aware file filter` to provide the required stable hash difference from upstream.

### Backfill and verification

Path-based workflows run when asset metadata extraction fires. After deploying or refreshing this patch:

1. Clear or allow any metadata jobs queued with the old plugin to finish.
2. Restart with an empty Metadata Extraction queue.
3. Force **Metadata Extraction -> All** from the administration jobs page.
4. Wait for the queue to finish and verify representative assets in their expected albums.

The initial deployment was verified with an asset under:

```text
photos/scans/documents/nisswandt/.../01-first.jpg
```

It was added to `documents-all`, and not to the surname album. The forced metadata extraction run is the backfill mechanism for existing assets and for rebuilding these path-derived album memberships.

### Rebase checklist

When moving the fork to a newer Immich release:

1. Check whether upstream `assetFileFilter` now honors `config.usePath`.
2. Drop the source patch if upstream has fixed the behavior.
3. Preserve or deliberately replace the manifest hash change until the deployed database has loaded the corrected plugin artifact.
4. Build the plugin artifact and server image.
5. Test one normal surname path and one path below `photos/scans/documents/`.
6. Run the full Metadata Extraction backfill only after the representative tests pass.

## Local Docker build reliability

The server Dockerfile carries two local-build changes:

- pnpm uses a five-minute fetch timeout, five retries, and network concurrency of eight to tolerate the registry performance observed on Junco.
- Plugin builds copy `mise.lock`, install with `mise install --locked`, and use a distinct locked-tool cache key. This prevents plugin compilation from silently selecting a different tool version, including `extism-js`.

These changes affect local image construction only; they do not alter runtime Immich behavior. Re-evaluate them when upstream changes the server Dockerfile, pnpm bootstrap, mise version, or plugin build stages.

## Generated artifacts and tests

Feature changes are reflected in the checked-in generated OpenAPI, TypeScript SDK, and Dart configuration artifacts where required. The branch also contains compatibility adjustments to server and web fixtures/tests so the custom enums, preferences, timeline behavior, and deinterlacing fields are exercised against Immich v3.1.

Before deploying a rebased branch:

1. Build the local `immich-server` image, including the core plugin stage.
2. Run server type checking and the focused feature tests.
3. Run the full server test suite.
4. Treat repository-wide lint or web-check failures separately when they originate in a custom patch; document and resolve functional failures before deployment.
