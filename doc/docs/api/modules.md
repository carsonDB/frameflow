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

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`FilterTrackGroup`

#### Defined in

[main.ts:340](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L340)

___

### group

▸ **group**(`trackArr`): `TrackGroup`

Track[] -> TrackGroup

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`TrackGroup`

#### Defined in

[main.ts:332](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L332)

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

[main.ts:351](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L351)

___

### merge

▸ **merge**(`trackArr`): `FilterTrackGroup`

multiple audio streams merge

#### Parameters

| Name | Type |
| :------ | :------ |
| `trackArr` | (`TrackGroup` \| `Track`)[] |

#### Returns

`FilterTrackGroup`

#### Defined in

[main.ts:337](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L337)

___

### source

▸ **source**(`src`, `options?`): `Promise`<`SourceTrackGroup`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `src` | `SourceType` |
| `options?` | `Object` |

#### Returns

`Promise`<`SourceTrackGroup`\>

#### Defined in

[main.ts:327](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L327)
