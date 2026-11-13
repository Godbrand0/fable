import type Phaser from 'phaser';
import SunfallDunesScene from './SunfallDunesScene';
import EmberFieldsScene from './EmberFieldsScene';
import AshwaterMarshScene from './AshwaterMarshScene';
import ObsidianPeakScene from './ObsidianPeakScene';
import FrostveilGlacierScene from './FrostveilGlacierScene';
import StormspireRuinsScene from './StormspireRuinsScene';
import { ZONES } from '../../lib/zones';

// Every single-player zone scene, keyed by the scene key used in lib/zones.ts.
const SCENES_BY_KEY: Record<string, Phaser.Types.Scenes.SceneType> = {
  SunfallDunesScene,
  EmberFieldsScene,
  AshwaterMarshScene,
  ObsidianPeakScene,
  FrostveilGlacierScene,
  StormspireRuinsScene,
};

// In lib/zones.ts order. Fails loudly in dev if a zone was added to the registry
// without its scene being registered here (it would otherwise be unplayable).
export const ZONE_SCENES: Phaser.Types.Scenes.SceneType[] = ZONES.map(z => {
  const scene = SCENES_BY_KEY[z.sceneKey];
  if (!scene) throw new Error(`No Phaser scene registered for zone ${z.sceneKey} in game/scenes/zoneScenes.ts`);
  return scene;
});
