import { EntityId } from '../../entities/entities-types';

export type SupplyChainResourceType = 'food' | 'wood';

export type TribeDemand = {
  requesterId: EntityId;
  resourceType: SupplyChainResourceType;
  claimedBy?: EntityId;
  updatedAt: number;
};
