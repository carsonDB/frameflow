---
id: "SourceTrackGroup"
title: "Class: SourceTrackGroup"
sidebar_label: "SourceTrackGroup"
sidebar_position: 0
custom_edit_url: null
---

## Hierarchy

- `TrackGroup`

  ↳ **`SourceTrackGroup`**

## Constructors

### constructor

• **new SourceTrackGroup**(`source`, `streams`, `format`, `fileSize`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `source` | `SourceType` |
| `streams` | `StreamMetadata`[] |
| `format` | `FormatMetadata` |
| `fileSize` | `number` |

#### Overrides

TrackGroup.constructor

#### Defined in

[src/ts/main.ts:145](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L145)

## Properties

### node

• **node**: `SourceNode`

#### Defined in

[src/ts/main.ts:144](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L144)

___

### streams

• **streams**: `StreamRef`[]

#### Inherited from

TrackGroup.streams

#### Defined in

[src/ts/main.ts:51](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L51)

## Accessors

### duration

• `get` **duration**(): `number`

#### Returns

`number`

#### Defined in

[src/ts/main.ts:161](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L161)

___

### metadata

• `get` **metadata**(): `undefined` \| { `bitRate`: `number` ; `duration`: `number` ; `formatName`: `string` ; `tracks`: `StreamMetadata`[]  }

#### Returns

`undefined` \| { `bitRate`: `number` ; `duration`: `number` ; `formatName`: `string` ; `tracks`: `StreamMetadata`[]  }

#### Defined in

[src/ts/main.ts:152](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L152)

## Methods

### export

▸ **export**(`args?`): `Promise`<`Target`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args?` | `ExportArgs` |

#### Returns

`Promise`<`Target`\>

#### Inherited from

TrackGroup.export

#### Defined in

[src/ts/main.ts:86](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L86)

___

### exportTo

▸ **exportTo**(`dest`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `dest` | `string` |

#### Returns

`Promise`<`void`\>

#### Inherited from

TrackGroup.exportTo

#### Defined in

[src/ts/main.ts:96](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L96)

▸ **exportTo**(`dest`): `Promise`<`DataBuffer`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `dest` | `ArrayBufferConstructor` |

#### Returns

`Promise`<`DataBuffer`\>

#### Inherited from

TrackGroup.exportTo

#### Defined in

[src/ts/main.ts:97](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L97)

▸ **exportTo**(`dest`): `Promise`<`Blob`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `dest` | (`blobParts?`: `BlobPart`[], `options?`: `BlobPropertyBag`) => `Blob` |
| `dest.prototype` | `Blob` |

#### Returns

`Promise`<`Blob`\>

#### Inherited from

TrackGroup.exportTo

#### Defined in

[src/ts/main.ts:98](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L98)

▸ **exportTo**(`dest`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `dest` | `HTMLVideoElement` |

#### Returns

`Promise`<`void`\>

#### Inherited from

TrackGroup.exportTo

#### Defined in

[src/ts/main.ts:99](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L99)

___

### filter

▸ **filter**(`mediaType`): `TrackGroup`

TrackGroup -> TrackGroup

**`Argument`**

mediaType filter condition

#### Parameters

| Name | Type |
| :------ | :------ |
| `mediaType` | ``"video"`` \| ``"audio"`` |

#### Returns

`TrackGroup`

#### Inherited from

TrackGroup.filter

#### Defined in

[src/ts/main.ts:61](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L61)

___

### loop

▸ **loop**(`args`): `FilterTrackGroup`

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `number` |

#### Returns

`FilterTrackGroup`

#### Inherited from

TrackGroup.loop

#### Defined in

[src/ts/main.ts:79](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L79)

___

### setDataFormat

▸ **setDataFormat**(`args`): `FilterTrackGroup`

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `Object` |
| `args.channelLayout?` | `string` |
| `args.pixelFormat?` | `string` |
| `args.sampleFormat?` | `string` |
| `args.sampleRate?` | `number` |

#### Returns

`FilterTrackGroup`

#### Inherited from

TrackGroup.setDataFormat

#### Defined in

[src/ts/main.ts:83](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L83)

___

### setVolume

▸ **setVolume**(`args`): `FilterTrackGroup`

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `number` |

#### Returns

`FilterTrackGroup`

#### Inherited from

TrackGroup.setVolume

#### Defined in

[src/ts/main.ts:80](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L80)

___

### tracks

▸ **tracks**(): `Track`[]

TrackGroup -> Track[]

**`Argument`**

mediaType filter condition

#### Returns

`Track`[]

#### Inherited from

TrackGroup.tracks

#### Defined in

[src/ts/main.ts:70](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L70)

___

### trim

▸ **trim**(`args`): `FilterTrackGroup`

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | `Object` |
| `args.duration` | `number` |
| `args.start` | `number` |

#### Returns

`FilterTrackGroup`

#### Inherited from

TrackGroup.trim

#### Defined in

[src/ts/main.ts:76](https://github.com/carsonDB/frameflow/blob/8182d87/src/ts/main.ts#L76)
