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

[main.ts:374](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L374)

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

[main.ts:361](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L361)

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

[main.ts:385](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L385)

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

[main.ts:366](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L366)

___

### setFlags

▸ **setFlags**(`flags`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `flags` | `Flags` |

#### Returns

`void`

#### Defined in

[main.ts:346](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L346)

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

[main.ts:354](https://github.com/carsonDB/frameflow/blob/e7b04cf/src/ts/main.ts#L354)
