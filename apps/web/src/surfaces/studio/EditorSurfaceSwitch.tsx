import { useTranslation } from 'react-i18next';

export function EditorSurfaceSwitch({ standard, onChoose }: { standard: boolean; onChoose: (next: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="editor-surface-switch" onClick={() => onChoose(!standard)}>
      {t(standard ? 'studioPanel.editor.useGameEditor' : 'studioPanel.editor.useStandardEditor')}
    </button>
  );
}
