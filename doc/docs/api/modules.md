---
id: "modules"
title: "frameflow"
sidebar_label: "Exports"
sidebar_position: 0.5
custom_edit_url: null
---

## Functions

### concat

▸ **concat**(`trackArr`): `FilterTrackGroup`

Concat multiple tracks along timeline.

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`FilterTrackGroup`

#### Defined in

[main.ts:347](https://github.com/carsonDB/frameflow/blob/62fbf5d/src/ts/main.ts#L347)

___

### group

▸ **group**(`trackArr`): `TrackGroup`

Convert array of Track or TrackGroup into one TrackGroup.
This is convenient when we need to apply operations on multiple tracks.
Track[] -> TrackGroup

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`TrackGroup`

#### Defined in

[main.ts:334](https://github.com/carsonDB/frameflow/blob/62fbf5d/src/ts/main.ts#L334)

___

### loadWASM

▸ **loadWASM**(): `Promise`<`ArrayBuffer`\>

Preload of wasm binary file.

This function can be called multiple times, but only fetch once.
So don't worry about repetitive calls.

#### Returns

`Promise`<`ArrayBuffer`\>

ArrayBuffer wasm binary

#### Defined in

[main.ts:358](https://github.com/carsonDB/frameflow/blob/62fbf5d/src/ts/main.ts#L358)

___

### merge

▸ **merge**(`trackArr`): `FilterTrackGroup`

Multiple audio tracks merge into one audio track.

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`FilterTrackGroup`

#### Defined in

[main.ts:339](https://github.com/carsonDB/frameflow/blob/62fbf5d/src/ts/main.ts#L339)

___

### source

▸ **source**(`src`, `options?`): `Promise`<`SourceTrackGroup`\>

Create source (`SourceTrackGroup`) in one function.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `src` | `SourceType` | ReadableStream<Uint8Array \| Buffer> \| string \| URL \| Request \| Blob \| Buffer \| Uint8Array |
| `options?` | `Object` | unused temporarily |

#### Returns

`Promise`<`SourceTrackGroup`\>

SourceTrackGroup can be used further.

#### Defined in

[main.ts:327](https://github.com/carsonDB/frameflow/blob/62fbf5d/src/ts/main.ts#L327)
