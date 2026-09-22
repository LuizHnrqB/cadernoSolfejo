const fixedSymbols = ['1', '-', '•', '-', '2', '-', '•', '-', '3', '-', '•', '-', '4', '-', '•', '-'];
const defaultPalette = { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' };
const defaultTexts = [
  { upper: '', lower: 'Tu' }, { upper: 'Tchã\n(opc)', lower: '' }, { upper: '', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tu' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' }
];
const defaultNoteCells = () => Array.from({ length: 32 }, () => ({ state: 'empty' }));
const savedPhrases = JSON.parse(localStorage.getItem('solfejo-phrases') || 'null');
const phrases = savedPhrases?.length ? savedPhrases.map(normalizePhrase) : [createDefaultPhrase()];

const phrasesElement = document.querySelector('#phrases');
const titleInput = document.querySelector('#titleInput');
const sheetTitle = document.querySelector('#sheetTitle');
const phraseCount = document.querySelector('#phraseCount');
const colors = { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' };

function save() {
  localStorage.setItem('solfejo-phrases', JSON.stringify(phrases));
  localStorage.setItem('solfejo-title', sheetTitle.value);
}

function createDefaultPhrase() {
  return {
    title: '',
    palette: { ...defaultPalette },
    noteMode: false,
    beatCount: 4,
    noteCells: defaultNoteCells(),
    cells: createNumericCells(4)
  };
}

function createNumericCells(beatCount) {
  return Array.from({ length: beatCount * 4 }, (_, index) => ({
    symbol: numericSymbol(index),
    noteState: 'empty',
    upper: defaultTexts[index % defaultTexts.length].upper,
    lower: defaultTexts[index % defaultTexts.length].lower
  }));
}

function normalizePhrase(phrase) {
  const savedCells = Array.isArray(phrase) ? phrase : phrase.cells;
  return {
    title: Array.isArray(phrase) ? '' : phrase.title || '',
    palette: { ...defaultPalette, ...(Array.isArray(phrase) ? {} : phrase.palette) },
    noteMode: Array.isArray(phrase) ? false : Boolean(phrase.noteMode),
    beatCount: Math.min(8, Math.max(1, Number(phrase.beatCount) || 4)),
    noteCells: Array.from({ length: 32 }, (_, index) => ({ state: ['empty', 'filled', 'roll'].includes(phrase.noteCells?.[index]?.state) ? phrase.noteCells[index].state : 'empty' })),
    cells: createSavedNumericCells(savedCells, Math.min(8, Math.max(1, Number(phrase.beatCount) || 4)))
  };
}

function createSavedNumericCells(savedCells, beatCount) {
  return Array.from({ length: beatCount * 4 }, (_, index) => ({
    symbol: numericSymbol(index),
    noteState: ['empty', 'filled', 'roll'].includes(savedCells?.[index]?.noteState) ? savedCells[index].noteState : 'empty',
    upper: savedCells?.[index]?.upper ?? defaultTexts[index % defaultTexts.length].upper,
    lower: savedCells?.[index]?.lower ?? defaultTexts[index % defaultTexts.length].lower
  }));
}

function numericSymbol(index) {
  const position = index % 4;
  return position === 0 ? String(Math.floor(index / 4) + 1) : position === 2 ? '•' : '-';
}

function resizeNumericCells(phrase) {
  phrase.cells = createSavedNumericCells(phrase.cells, phrase.beatCount);
}

function createCell(cell, phraseIndex, cellIndex, noteMode) {
  const element = document.createElement('div');
  element.className = 'notation-cell';
  const isNote = noteMode && cell.symbol !== '-';
  const upperField = `<div class="text-field-wrap upper-field"><textarea wrap="off" class="cell-input upper" data-field="upper" aria-label="Texto acima da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="">${escapeAttribute(cell.upper)}</textarea></div>`;
  const lowerField = `<div class="text-field-wrap lower-field"><textarea wrap="off" class="cell-input lower" data-field="lower" aria-label="Texto abaixo da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="">${escapeAttribute(cell.lower)}</textarea></div>`;
  const symbolField = `<div class="symbol-wrap"><span class="symbol ${isNote ? 'note-symbol' : 'dash-symbol'}" aria-label="Marcação fixa ${cell.symbol}">${cell.symbol}</span></div>`;
  element.innerHTML = noteMode ? symbolField : `${upperField}${symbolField}${lowerField}`;
  const symbol = element.querySelector('.symbol');
  if (isNote) {
    symbol.addEventListener('click', () => {
      const states = ['empty', 'filled', 'roll'];
      cell.noteState = states[(states.indexOf(cell.noteState) + 1) % states.length];
      updateNoteSymbol(symbol, cell);
      save();
    });
    updateNoteSymbol(symbol, cell);
  }
  element.querySelectorAll('[data-field]').forEach((input) => {
    updateTextFieldSize(input);
    autoResize(input);
    input.addEventListener('input', () => {
      phrases[phraseIndex].cells[cellIndex][input.dataset.field] = input.value;
      updateTextFieldSize(input);
      autoResize(input);
      save();
    });
    input.addEventListener('change', () => {
      phrases[phraseIndex].cells[cellIndex][input.dataset.field] = input.value;
      save();
    });
  });
  return element;
}

function updateTextFieldSize(input) {
  input.classList.toggle('has-content', input.value.trim().length > 0);
}

function createNoteNotation(phrase, phraseIndex) {
  const notation = document.createElement('div');
  notation.className = 'note-notation';
  notation.setAttribute('aria-label', `Linha de notas da frase ${phraseIndex + 1}`);
  for (let groupIndex = 0; groupIndex < phrase.beatCount; groupIndex += 1) {
    const group = document.createElement('div');
    group.className = 'note-group';
    for (let noteIndex = 0; noteIndex < 4; noteIndex += 1) {
      const index = groupIndex * 4 + noteIndex;
      const note = document.createElement('button');
      note.type = 'button';
      note.setAttribute('aria-label', `Nota ${index + 1}`);
      note.addEventListener('click', () => {
        const states = ['empty', 'filled', 'roll'];
        const current = phrase.noteCells[index].state;
        phrase.noteCells[index].state = states[(states.indexOf(current) + 1) % states.length];
        updateMusicalNote(note, phrase.noteCells[index]);
        save();
      });
      updateMusicalNote(note, phrase.noteCells[index]);
      group.append(note);
    }
    notation.append(group);
  }
  return notation;
}

function updateMusicalNote(note, cell) {
  note.className = `musical-note note-state-${cell.state}`;
  note.innerHTML = '<span class="note-head"></span><span class="note-stem"></span><span class="note-rulo"></span>';
}

function updateNoteSymbol(symbol, cell) {
  symbol.className = `symbol note-symbol note-${cell.noteState}`;
  symbol.textContent = '';
  symbol.setAttribute('aria-label', `Nota ${cell.noteState}. Clique para alterar`);
}

function autoResize(input) {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}

function renderPhrase(phrase, phraseIndex) {
  const phraseElement = document.createElement('section');
  phraseElement.className = 'phrase';
  const phraseTitleWrap = document.createElement('div');
  phraseTitleWrap.className = 'phrase-title-wrap';
  const phraseTitle = document.createElement('input');
  phraseTitle.className = 'phrase-title';
  phraseTitle.type = 'text';
  phraseTitle.placeholder = `Título da frase ${phraseIndex + 1}`;
  phraseTitle.value = phrase.title;
  phraseTitle.setAttribute('aria-label', `Título da frase ${phraseIndex + 1}`);
  phraseTitle.addEventListener('input', () => {
    phrases[phraseIndex].title = phraseTitle.value;
    save();
  });
  const paletteButton = document.createElement('button');
  paletteButton.className = 'phrase-palette-button';
  paletteButton.type = 'button';
  paletteButton.innerHTML = '<span aria-hidden="true">🖌</span> Paleta da frase';
  paletteButton.addEventListener('click', () => paletteDialog.showModal());
  const modeSelect = document.createElement('select');
  modeSelect.className = 'mode-select';
  modeSelect.setAttribute('aria-label', `Modo da frase ${phraseIndex + 1}`);
  modeSelect.innerHTML = '<option value="numeric">Solfejo numérico</option><option value="notes">Notas</option>';
  modeSelect.value = phrase.noteMode ? 'notes' : 'numeric';
  modeSelect.addEventListener('change', () => {
    phrase.noteMode = modeSelect.value === 'notes';
    render();
    save();
  });
  const beatSelect = document.createElement('select');
  beatSelect.className = 'beat-select';
  beatSelect.setAttribute('aria-label', `Quantidade de tempos da frase ${phraseIndex + 1}`);
  beatSelect.innerHTML = Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1} ${index === 0 ? 'tempo' : 'tempos'}</option>`).join('');
  beatSelect.value = phrase.beatCount;
  beatSelect.addEventListener('change', () => {
    phrase.beatCount = Number(beatSelect.value);
    resizeNumericCells(phrase);
    render();
    save();
  });
  const paletteDialog = document.createElement('dialog');
  paletteDialog.className = 'phrase-palette-dialog';
  paletteDialog.innerHTML = `<form method="dialog"><div class="dialog-heading"><strong>Paleta da frase ${phraseIndex + 1}</strong><button class="dialog-close" value="cancel" aria-label="Fechar">×</button></div><label class="color-row">Título<input data-palette="title" type="color" value="${phrase.palette.title}"></label><label class="color-row">Marcação<input data-palette="symbol" type="color" value="${phrase.palette.symbol}"></label><label class="color-row">Texto acima<input data-palette="upper" type="color" value="${phrase.palette.upper}"></label><label class="color-row">Texto abaixo<input data-palette="lower" type="color" value="${phrase.palette.lower}"></label></form>`;
  paletteDialog.querySelectorAll('[data-palette]').forEach((picker) => {
    picker.addEventListener('input', () => {
      phrase.palette[picker.dataset.palette] = picker.value;
      applyPhrasePalette(phraseElement, phrase.palette);
      save();
    });
  });
  const phraseUnderline = document.createElement('div');
  phraseUnderline.className = 'phrase-title-underline';
  const notation = phrase.noteMode ? createNoteNotation(phrase, phraseIndex) : document.createElement('div');
  if (!phrase.noteMode) {
    notation.className = 'notation';
    notation.setAttribute('aria-label', `Linha da frase ${phraseIndex + 1}`);
    notation.replaceChildren(...phrase.cells.map((cell, cellIndex) => createCell(cell, phraseIndex, cellIndex, false)));
    notation.querySelectorAll('[data-field]').forEach(autoResize);
    notation.style.setProperty('--phrase-columns', phrase.cells.length);
    notation.style.setProperty('--symbol-size', `${Math.max(24, Math.min(68, 1080 / phrase.cells.length))}px`);
  } else {
    notation.style.setProperty('--phrase-columns', phrase.beatCount);
  }
  let upperHint = null;
  if (!phrase.noteMode) {
    upperHint = document.createElement('div');
    upperHint.className = 'upper-hint';
    upperHint.textContent = 'Linha superior (opcional)';
  }
  if (phrase.noteMode) phraseElement.classList.add('note-mode');
  phraseTitleWrap.append(phraseTitle, phraseUnderline);
  const phraseHeader = document.createElement('div');
  phraseHeader.className = 'phrase-header';
  const phraseActions = document.createElement('div');
  phraseActions.className = 'phrase-header-actions';
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-phrase-button';
  deleteButton.type = 'button';
  deleteButton.setAttribute('aria-label', `Remover frase ${phraseIndex + 1}`);
  deleteButton.title = 'Remover frase';
  deleteButton.innerHTML = '<span aria-hidden="true">🗑</span>';
  deleteButton.disabled = phrases.length === 1;
  deleteButton.addEventListener('click', () => {
    if (phrases.length === 1) return;
    phrases.splice(phraseIndex, 1);
    render();
    save();
  });
  phraseActions.append(beatSelect, paletteButton, deleteButton);
  phraseHeader.append(modeSelect, phraseTitleWrap, phraseActions);
  phraseElement.append(phraseHeader, paletteDialog);
  if (upperHint) phraseElement.append(upperHint);
  phraseElement.append(notation);
  applyPhrasePalette(phraseElement, phrase.palette);
  return phraseElement;
}

function applyPhrasePalette(phraseElement, palette) {
  phraseElement.querySelector('.phrase-title').style.color = palette.title;
  phraseElement.querySelectorAll('.symbol').forEach((element) => element.style.color = palette.symbol);
  phraseElement.querySelectorAll('.cell-input.upper').forEach((element) => element.style.color = palette.upper);
  phraseElement.querySelectorAll('.cell-input.lower').forEach((element) => element.style.color = palette.lower);
}

function render() {
  phrasesElement.replaceChildren(...phrases.map(renderPhrase));
  phrasesElement.querySelectorAll('[data-field]').forEach(autoResize);
  phraseCount.textContent = phrases.length;
  phraseCount.nextSibling.textContent = phrases.length === 1 ? ' frase' : ' frases';
  document.querySelectorAll('.symbol').forEach((symbol) => {
    symbol.style.color = colors.symbol;
  });
  document.querySelectorAll('.cell-input.upper').forEach((input) => input.style.color = colors.upper);
  document.querySelectorAll('.cell-input.lower').forEach((input) => input.style.color = colors.lower);
  document.querySelectorAll('.phrase').forEach((phraseElement, index) => applyPhrasePalette(phraseElement, phrases[index].palette));
}

function escapeAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

titleInput.value = localStorage.getItem('solfejo-title') || 'Xote';
sheetTitle.value = titleInput.value;
titleInput.addEventListener('input', () => { sheetTitle.value = titleInput.value; save(); });
sheetTitle.addEventListener('input', () => { titleInput.value = sheetTitle.value; save(); });
document.querySelector('#printButton').addEventListener('click', () => window.print());
document.querySelector('#addPhraseButton').addEventListener('click', () => {
  phrases.push({ ...createDefaultPhrase(), cells: createDefaultPhrase().cells.map((cell) => ({ ...cell, upper: '', lower: '' })) });
  render();
  save();
});
document.querySelector('#resetColors').addEventListener('click', () => {
  Object.assign(colors, { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' });
  ['titleColor', 'symbolColor', 'upperColor', 'lowerColor'].forEach((id) => document.querySelector(`#${id}`).value = colors[id.replace('Color', '')]);
  applyColors();
});
['title', 'symbol', 'upper', 'lower'].forEach((name) => document.querySelector(`#${name}Color`).addEventListener('input', (event) => { colors[name] = event.target.value; applyColors(); }));
function applyColors() {
  sheetTitle.style.color = colors.title;
  phrases.forEach((phrase) => { phrase.palette = { ...colors }; });
  render();
  save();
}
render();
