import { useState } from 'react';
import { recordEditorStep } from '../../visitTelemetry.js';

// The creator's own choice; no controller message overrules it.
export function useEditorSurfaceChoice() {
  const [standardPreferred, setStandardPreferred] = useState(false);
  const chooseSurface = (standard: boolean) => {
    setStandardPreferred(standard);
    recordEditorStep(standard ? 'standard_surface_chosen' : 'controller_surface_restored');
  };
  return { standardPreferred, chooseSurface };
}
