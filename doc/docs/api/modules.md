---
id: "modules"
title: "frameflow"
sidebar_label: "Exports"
sidebar_position: 0.5
custom_edit_url: null
---

## Variables

### default

• **default**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `concat` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `FilterTrackGroup` |
| `group` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `TrackGroup` |
| `loadWASM` | () => `Promise`<`ArrayBuffer`\> |
| `merge` | (`trackArr`: (`TrackGroup` \| `Track`)[]) => `FilterTrackGroup` |
| `setFlags` | (`flags`: `Flags`) => `void` |
| `source` | (`src`: `SourceType`, `options?`: {}) => `Promise`<`SourceTrackGroup`\> |

#### Defined in

[main.ts:346](https://github.com/carsonDB/frameflow/blob/b731bd0/src/ts/main.ts#L346)
