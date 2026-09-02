import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { colorForPicker, colorFromPicker, findHexColors } from './codeMirrorColors.js';

class ColorSwatchWidget extends WidgetType {
  constructor(
    readonly color: string,
    readonly from: number,
    readonly to: number,
    readonly label: string,
    readonly onChange: (from: number, to: number, color: string) => void,
  ) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color && other.from === this.from && other.to === this.to && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorForPicker(this.color);
    input.className = 'cm-color-picker';
    input.title = `${this.label} ${this.color}`;
    input.setAttribute('aria-label', `${this.label} ${this.color}`);
    input.addEventListener('change', () => this.onChange(this.from, this.to, colorFromPicker(this.color, input.value)));
    return input;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function colorPickerExtension(label: string): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(readonly view: EditorView) {
        this.decorations = this.buildDecorations();
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) this.decorations = this.buildDecorations();
      }

      private buildDecorations(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const match of findHexColors(this.view.state.doc.toString())) {
          builder.add(
            match.to,
            match.to,
            Decoration.widget({
              widget: new ColorSwatchWidget(match.color, match.from, match.to, label, this.replaceColor),
              side: 1,
            }),
          );
        }
        return builder.finish();
      }

      private replaceColor = (from: number, to: number, color: string): void => {
        const current = this.view.state.doc.sliceString(from, to);
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(current)) return;
        this.view.dispatch({ changes: { from, to, insert: color }, userEvent: 'input' });
        this.view.focus();
      };
    },
  );
  return [plugin, EditorView.decorations.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none)];
}
