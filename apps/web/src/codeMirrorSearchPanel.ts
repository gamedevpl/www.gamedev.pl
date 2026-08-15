import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
  SearchQuery,
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView, Panel } from '@codemirror/view';

// CE-14: a VS Code shaped find panel, not the stock bar.

// Counting every match in a huge file would block typing.
export const MATCH_LIMIT = 999;

const ICONS = {
  chevron: '<path d="M5 3.5 9.5 8 5 12.5" />',
  up: '<path d="M8 12.5V4M4 7.5 8 3.5l4 4" />',
  down: '<path d="M8 3.5V12M4 8.5l4 4 4-4" />',
  close: '<path d="M4 4l8 8M12 4l-8 8" />',
  replace: '<path d="M3 4.5h6M3 8h4M3 11.5h6" /><path d="M11 6v5M9 9l2 2 2-2" />',
  replaceAll: '<path d="M3 4h9M3 7.5h9M3 11h5" /><path d="M11 9v4M9.5 11.5 11 13l1.5-1.5" />',
};

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function iconButton(name: keyof typeof ICONS, label: string, extraClass = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cm-vs-icon-button ${extraClass}`.trim();
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name);
  return button;
}

// Glyph-labelled, like VS Code; the title carries the real name.
function toggleButton(glyph: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-vs-toggle';
  button.title = label;
  button.textContent = glyph;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function field(placeholder: string, label: string): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'cm-vs-field';
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');
  return input;
}

export type MatchCount = { total: number; current: number; capped: boolean };

// `current` is 1-based; 0 means no match under the cursor.
export function countMatches(state: EditorState, query: SearchQuery): MatchCount {
  if (!query.valid) return { total: 0, current: 0, capped: false };
  const selection = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current = 0;
  for (;;) {
    const next = cursor.next();
    if (next.done) break;
    total++;
    if (next.value.from === selection.from && next.value.to === selection.to) current = total;
    if (total >= MATCH_LIMIT) return { total, current, capped: true };
  }
  return { total, current, capped: false };
}

export function describeCount({ total, current, capped }: MatchCount): string {
  if (total === 0) return 'No results';
  const shown = capped ? `${total}+` : `${total}`;
  return current > 0 ? `${current} of ${shown}` : `${shown} results`;
}

export function vsCodeSearchPanel(view: EditorView): Panel {
  const initial = getSearchQuery(view.state);

  const dom = document.createElement('div');
  dom.className = 'cm-search cm-vs-search';
  dom.setAttribute('role', 'search');
  // Else the editor keymap steals what users type here.
  dom.addEventListener('keydown', (event) => event.stopPropagation());

  const expand = iconButton('chevron', 'Toggle Replace', 'cm-vs-expand');
  const body = document.createElement('div');
  body.className = 'cm-vs-body';

  const findRow = document.createElement('div');
  findRow.className = 'cm-vs-row';
  const replaceRow = document.createElement('div');
  replaceRow.className = 'cm-vs-row';

  const findWrap = document.createElement('div');
  findWrap.className = 'cm-vs-field-wrap';
  const findInput = field('Find', 'Find');
  findInput.value = initial.search;
  const caseToggle = toggleButton('Aa', 'Match Case');
  const wordToggle = toggleButton('ab', 'Match Whole Word');
  const regexpToggle = toggleButton('.*', 'Use Regular Expression');
  const toggles = document.createElement('div');
  toggles.className = 'cm-vs-toggles';
  toggles.append(caseToggle, wordToggle, regexpToggle);
  findWrap.append(findInput, toggles);

  const count = document.createElement('div');
  count.className = 'cm-vs-count';
  count.setAttribute('aria-live', 'polite');

  const prevButton = iconButton('up', 'Previous Match');
  const nextButton = iconButton('down', 'Next Match');
  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'cm-vs-icon-button cm-vs-text-button';
  allButton.textContent = 'All';
  allButton.title = 'Select All Matches';
  const closeButton = iconButton('close', 'Close');

  findRow.append(findWrap, count, prevButton, nextButton, allButton, closeButton);

  const replaceWrap = document.createElement('div');
  replaceWrap.className = 'cm-vs-field-wrap';
  const replaceInput = field('Replace', 'Replace');
  replaceInput.value = initial.replace;
  replaceWrap.append(replaceInput);
  const replaceButton = iconButton('replace', 'Replace');
  const replaceAllButton = iconButton('replaceAll', 'Replace All');
  replaceRow.append(replaceWrap, replaceButton, replaceAllButton);

  body.append(findRow, replaceRow);
  dom.append(expand, body);

  let expanded = false;
  const setExpanded = (next: boolean) => {
    expanded = next;
    dom.classList.toggle('cm-vs-expanded', expanded);
    expand.setAttribute('aria-expanded', String(expanded));
    replaceRow.hidden = !expanded;
  };
  setExpanded(false);

  const currentQuery = () =>
    new SearchQuery({
      search: findInput.value,
      caseSensitive: caseToggle.getAttribute('aria-pressed') === 'true',
      wholeWord: wordToggle.getAttribute('aria-pressed') === 'true',
      regexp: regexpToggle.getAttribute('aria-pressed') === 'true',
      replace: replaceInput.value,
    });

  const commit = () => {
    const query = currentQuery();
    if (!query.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(query) });
    renderCount();
  };

  function renderCount() {
    const query = getSearchQuery(view.state);
    const invalid = findInput.value.length > 0 && !query.valid;
    dom.classList.toggle('cm-vs-invalid', invalid);
    if (!findInput.value) {
      count.textContent = '';
      return;
    }
    count.textContent = invalid ? 'Invalid regexp' : describeCount(countMatches(view.state, query));
  }

  const runAndRefresh = (command: (target: EditorView) => boolean) => () => {
    command(view);
    view.focus();
    renderCount();
  };

  findInput.addEventListener('input', commit);
  replaceInput.addEventListener('input', commit);

  for (const toggle of [caseToggle, wordToggle, regexpToggle]) {
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-pressed', String(toggle.getAttribute('aria-pressed') !== 'true'));
      commit();
    });
  }

  expand.addEventListener('click', () => {
    setExpanded(!expanded);
    (expanded ? replaceInput : findInput).focus();
  });

  prevButton.addEventListener('click', runAndRefresh(findPrevious));
  nextButton.addEventListener('click', runAndRefresh(findNext));
  allButton.addEventListener('click', runAndRefresh(selectMatches));
  replaceButton.addEventListener('click', runAndRefresh(replaceNext));
  replaceAllButton.addEventListener('click', runAndRefresh(replaceAll));
  closeButton.addEventListener('click', () => closeSearchPanel(view));

  // Focus stays here, so repeated Enter walks the matches.
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
      renderCount();
    }
  });

  replaceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (event.ctrlKey || event.metaKey ? replaceAll : replaceNext)(view);
      renderCount();
    }
  });

  return {
    dom,
    top: true,
    mount() {
      findInput.focus();
      findInput.select();
      renderCount();
    },
    update(update) {
      // A query set elsewhere — searching the selection, say — must show up here.
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (!effect.is(setSearchQuery)) continue;
          findInput.value = effect.value.search;
          replaceInput.value = effect.value.replace;
          caseToggle.setAttribute('aria-pressed', String(effect.value.caseSensitive));
          wordToggle.setAttribute('aria-pressed', String(effect.value.wholeWord));
          regexpToggle.setAttribute('aria-pressed', String(effect.value.regexp));
        }
      }
      if (update.docChanged || update.selectionSet || update.transactions.length) renderCount();
    },
  };
}
