import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect } from "react";

import { isAdded } from "../../domain/additions";
import { type Opacities, withOpacities } from "../../domain/opacity";
import type { SceneElement } from "../../domain/types";

/**
 * One change to what Excalidraw draws, for this viewing only: a layer adds
 * elements on top (with the files they need), changes how elements are drawn,
 * or both. Layers apply in order, each to what the ones before it made, so a
 * new kind of change is one new layer in the list.
 */
export interface SceneLayer {
  files?: readonly BinaryFileData[];
  apply: (elements: SceneElement[]) => SceneElement[];
}

/**
 * Elements drawn on top of the board, such as the additions. Their ids start
 * with `added:` (`domain/additions`), which is how the scene tells them from
 * the board's own and swaps them out again.
 */
export const addedLayer = (added: { elements: readonly SceneElement[]; files: Record<string, BinaryFileData> }): SceneLayer => ({
  files: Object.values(added.files),
  apply: (elements) => [...elements, ...added.elements],
});

/** Opacity changes: Excalidraw redraws with them, but copy and the page grid still see the originals. */
export const opacityLayer = (opacities: Opacities): SceneLayer => ({
  apply: (elements) => withOpacities(elements, opacities),
});

/**
 * Pushes the layers into Excalidraw's scene, on top of the board's own
 * elements, whenever the list changes. Nothing of this reaches the file or
 * Excalidraw's undo history. Pass a memoised list, or it is pushed every render.
 */
export function useSceneLayers(api: ExcalidrawImperativeAPI | null, ready: boolean, layers: readonly SceneLayer[]) {
  useEffect(() => {
    if (!api || !ready) return;
    api.addFiles(layers.flatMap((layer) => layer.files ?? []));
    const own = api.getSceneElementsIncludingDeleted().filter((e) => !isAdded(e.id)) as unknown as SceneElement[];
    api.updateScene({
      elements: layers.reduce((elements, layer) => layer.apply(elements), own) as never,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, ready, layers]);
}
