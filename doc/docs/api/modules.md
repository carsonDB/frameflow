---
id: "modules"
title: "frameflow"
sidebar_label: "Exports"
sidebar_position: 0.5
custom_edit_url: null
---

## Classes

- [SourceTrackGroup](classes/SourceTrackGroup.md)

## Variables

### default

• **default**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `concat` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `FilterTrackGroup` |
| `group` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `TrackGroup` |
| `loadWASM` | (`url`: `RequestInfo`, `options?`: `RequestInit`) => `Promise`<`ArrayBuffer`\> |
| `merge` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `FilterTrackGroup` |
| `source` | (`src`: `SourceType`, `options?`: {}) => `Promise`<[`SourceTrackGroup`](classes/SourceTrackGroup.md)\> |

#### Defined in

[src/ts/main.ts:332](https://github.com/carsonDB/frameflow/blob/aec10d5/src/ts/main.ts#L332)
