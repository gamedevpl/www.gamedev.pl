import type { BuildMediaStore } from './slices/build-media.js';
import { OAuthFacade } from './oauth-facade.js';
import type { PlayJournalsStore } from './slices/play-journals.js';
export abstract class PlayJournalFacade extends OAuthFacade {
  protected abstract buildMediaStore: BuildMediaStore;
  protected abstract playJournalsStore: PlayJournalsStore;
  putPlayJournal(...args: Parameters<PlayJournalsStore['putPlayJournal']>) {
    return this.playJournalsStore.putPlayJournal(...args);
  }
  getPlayJournal(...args: Parameters<PlayJournalsStore['getPlayJournal']>) {
    return this.playJournalsStore.getPlayJournal(...args);
  }
  deletePlayJournalsByOwner(...args: Parameters<PlayJournalsStore['deletePlayJournalsByOwner']>) {
    return this.playJournalsStore.deletePlayJournalsByOwner(...args);
  }
  appendBuildShot(
    ...args: Parameters<BuildMediaStore['appendBuildShot']>
  ): ReturnType<BuildMediaStore['appendBuildShot']> {
    return this.buildMediaStore.appendBuildShot(...args);
  }
  listBuildShots(
    ...args: Parameters<BuildMediaStore['listBuildShots']>
  ): ReturnType<BuildMediaStore['listBuildShots']> {
    return this.buildMediaStore.listBuildShots(...args);
  }
  getBuildShot(...args: Parameters<BuildMediaStore['getBuildShot']>): ReturnType<BuildMediaStore['getBuildShot']> {
    return this.buildMediaStore.getBuildShot(...args);
  }
  countBuildShots(
    ...args: Parameters<BuildMediaStore['countBuildShots']>
  ): ReturnType<BuildMediaStore['countBuildShots']> {
    return this.buildMediaStore.countBuildShots(...args);
  }
  countDeliveryShots(
    ...args: Parameters<BuildMediaStore['countDeliveryShots']>
  ): ReturnType<BuildMediaStore['countDeliveryShots']> {
    return this.buildMediaStore.countDeliveryShots(...args);
  }
  appendDeliveryShot(
    ...args: Parameters<BuildMediaStore['appendDeliveryShot']>
  ): ReturnType<BuildMediaStore['appendDeliveryShot']> {
    return this.buildMediaStore.appendDeliveryShot(...args);
  }
  deleteBuildShots(
    ...args: Parameters<BuildMediaStore['deleteBuildShots']>
  ): ReturnType<BuildMediaStore['deleteBuildShots']> {
    return this.buildMediaStore.deleteBuildShots(...args);
  }
  markReferenceSeen(
    ...args: Parameters<BuildMediaStore['markReferenceSeen']>
  ): ReturnType<BuildMediaStore['markReferenceSeen']> {
    return this.buildMediaStore.markReferenceSeen(...args);
  }
  stepManagedSession(
    ...args: Parameters<BuildMediaStore['stepManagedSession']>
  ): ReturnType<BuildMediaStore['stepManagedSession']> {
    return this.buildMediaStore.stepManagedSession(...args);
  }
  appendBuildPreview(
    ...args: Parameters<BuildMediaStore['appendBuildPreview']>
  ): ReturnType<BuildMediaStore['appendBuildPreview']> {
    return this.buildMediaStore.appendBuildPreview(...args);
  }
  listBuildPreviews(
    ...args: Parameters<BuildMediaStore['listBuildPreviews']>
  ): ReturnType<BuildMediaStore['listBuildPreviews']> {
    return this.buildMediaStore.listBuildPreviews(...args);
  }
  getBuildPreview(
    ...args: Parameters<BuildMediaStore['getBuildPreview']>
  ): ReturnType<BuildMediaStore['getBuildPreview']> {
    return this.buildMediaStore.getBuildPreview(...args);
  }
  countBuildPreviews(
    ...args: Parameters<BuildMediaStore['countBuildPreviews']>
  ): ReturnType<BuildMediaStore['countBuildPreviews']> {
    return this.buildMediaStore.countBuildPreviews(...args);
  }
  pruneBuildPreviews(
    ...args: Parameters<BuildMediaStore['pruneBuildPreviews']>
  ): ReturnType<BuildMediaStore['pruneBuildPreviews']> {
    return this.buildMediaStore.pruneBuildPreviews(...args);
  }
}
