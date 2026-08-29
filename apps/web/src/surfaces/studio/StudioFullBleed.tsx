import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';

/**
 * The ground-state rule's named way back (Workstream C): shown whenever any surface —
 * the chat rail, Details, Edit, the shelf — covers the stage, and closes all of them at
 * once. Full bleed is the floor, not a mode the creator can get stranded out of.
 */
export type StudioFullBleedProps = {
  visible: boolean;
  onClick: () => void;
};

export function StudioFullBleed({ visible, onClick }: StudioFullBleedProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <button type="button" className="studio-fullbleed" onClick={onClick}>
      <PixelIcon name="collapse" size={13} />
      <span>{t('studioPanel.stage.backToGame', { defaultValue: 'Back to the game' })}</span>
    </button>
  );
}
