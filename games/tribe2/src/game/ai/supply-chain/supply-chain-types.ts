import { EntityId } from '../../entities/entities-types';

export type SupplyChainResourceType = 'food'; // Currently only food is supported

export type TribeDemand = {
  requesterId: EntityId;
  resourceType: SupplyChainResourceType;
  claimedBy?: EntityId;
  updatedAt: number;
};
