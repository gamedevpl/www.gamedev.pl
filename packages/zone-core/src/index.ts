/**
 * The zone runtime, shared by the API that admits players and the world service that
 * simulates for them (docs/persistent-world-plan.md P3).
 *
 * It is a package rather than a folder in either app because both need it and neither
 * owns it: the API mints tickets and parses declarations, the world service runs the
 * cage and the tick loop, and they deploy as separate Cloud Run services from separate
 * images (docs/p3-zone-host-infra.md). One copy of the ticket format and one copy of the
 * declared-input rules is the point — those are the two places where a disagreement
 * between the front door and the host would be a security bug rather than a bug.
 *
 * Nothing in here opens a socket, reads an environment variable, or touches Firestore.
 * Storage and transport arrive as interfaces, so the whole runtime is testable by
 * handing it fakes and a clock.
 */

export {
  canonicalize,
  checksumState,
  createSimRng,
  findUnstorable,
  wrapSimBundle,
  MAX_INIT_MS,
  MAX_PLAYERS_PER_ZONE,
  MAX_STATE_BYTES,
  MAX_TICK_MS,
  MAX_WAKE_MS,
  RESERVED_EVENT_KINDS,
  SIM_EXPORTS,
  SIM_GLOBAL_NAME,
  SIM_REALM_REMOVED,
  TICK_HZ_VALUES,
  ZONE_SNAPSHOT_VERSION,
  type TickHz,
  type ZoneEvent,
  type ZoneSnapshot,
} from './contract.js';

export {
  assertProductionCage,
  createIsolatedVmCage,
  createNodeVmCage,
  isSimTimeoutError,
  SimCageUnavailableError,
  SimLoadError,
  type LoadSimOptions,
  type SimCage,
  type SimInstance,
} from './cage.js';

export {
  parseZoneSchema,
  validateZoneInput,
  MAX_ZONE_ENUM_VALUES,
  MAX_ZONE_ENUM_VALUE_LENGTH,
  MAX_ZONE_INPUT_KINDS,
  type ZoneInputSpec,
  type ZoneSchema,
} from './schema.js';

export {
  guestPlayerTag,
  InvalidZoneTicketError,
  isGuestTag,
  mintZoneTicket,
  verifyZoneTicket,
  zonePlayerTag,
  ZONE_TICKET_TTL_MS,
  type ZoneTicketClaims,
} from './ticket.js';

export {
  Zone,
  ZoneFullError,
  ZoneUnavailableError,
  PARK_GRACE_MS,
  SNAPSHOT_EVERY_MS,
  type SimSource,
  type ZoneOptions,
  type ZoneOutboundFrame,
  type ZoneSnapshotStore,
  type ZoneStatus,
  type ZoneWarnEvent,
} from './zone.js';
